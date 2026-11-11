import discord from '../../tools/sunday_discord.cjs';

const { latestFridayStart, buildPayload, findEvent } = discord;
const HOUR = 60 * 60 * 1000;

export function isNotificationTime(time) {
  if (!Number.isFinite(time)) return false;
  const kst = new Date(time + 9 * HOUR);
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return kst.getUTCDay() === 5 && minutes >= 600 && minutes <= 720;
}

async function timedFetch(url, init) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  } catch {
    // Do not include webhook tokens or API keys in Cloudflare logs.
    throw new Error('외부 요청 실패: 네트워크 오류 또는 15초 제한 시간 초과');
  }
}

export async function notify(storage, env, scheduledTime, now = Date.now(), request = timedFetch) {
  if (!isNotificationTime(scheduledTime) || latestFridayStart(now) !== latestFridayStart(scheduledTime)) {
    return { status: 'outside-window' };
  }
  const week = new Date(latestFridayStart(scheduledTime)).toISOString();
  const previous = await storage.get('delivery');
  if (previous?.week === week && previous.status === 'sent') {
    return { status: 'already-sent', week };
  }
  let state = { week, status: 'checking', attemptedAt: new Date(now).toISOString() };
  try {
    const apiKey = (env.NEXON_API_KEY || '').trim();
    const webhook = (env.DISCORD_WEBHOOK_URL || '').trim();
    if (!apiKey || !webhook) throw new Error('NEXON_API_KEY와 DISCORD_WEBHOOK_URL 비밀 설정이 필요합니다.');
    let url;
    try { url = new URL(webhook); } catch { throw new Error('디스코드 웹후크 주소가 올바르지 않습니다.'); }
    if (url.protocol !== 'https:' || !['discord.com', 'canary.discord.com', 'ptb.discord.com', 'discordapp.com'].includes(url.hostname) ||
        !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(url.pathname)) {
      throw new Error('디스코드 웹후크 주소가 올바르지 않습니다.');
    }
    await storage.put('delivery', state);
    const event = await findEvent(apiKey, now, false, request);
    if (!event) {
      state.status = 'waiting-for-notice';
      await storage.put('delivery', state);
      const lastAttempt = new Date(scheduledTime).getUTCHours() === 3;
      if (lastAttempt) throw new Error('정오까지 이번 주 썬데이 메이플 공지를 찾지 못했습니다.');
      console.log('공지가 아직 없어 다음 예약에서 다시 확인합니다.');
      return state;
    }
    url.searchParams.set('wait', 'true');
    const response = await request(url.href, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(event))
    });
    if (!response.ok) throw new Error(`Discord webhook HTTP ${response.status}`);
    const message = await response.json();
    state = { ...state, status: 'sent', noticeId: event.notice_id, url: event.url,
      messageId: message.id, sentAt: new Date(now).toISOString() };
    await storage.put('delivery', state);
    console.log(`공유 완료: ${event.title} ${event.url}`);
    return state;
  } catch (error) {
    await storage.put('delivery', { ...state, status: 'failed', error: error.message });
    throw error;
  }
}

// A single Durable Object serializes simultaneous cron deliveries and persists sent state.
export class SundayNotifier {
  constructor(ctx, env) {
    this.storage = ctx.storage;
    this.env = env;
    this.queue = Promise.resolve();
  }

  async fetch(request) {
    const { scheduledTime } = await request.json();
    const result = this.queue.then(() => notify(this.storage, this.env, scheduledTime));
    this.queue = result.then(() => undefined, () => undefined);
    return Response.json(await result);
  }
}

export default {
  async scheduled(controller, env) {
    const stub = env.NOTIFIER.get(env.NOTIFIER.idFromName('weekly-sunday-maple'));
    const response = await stub.fetch('https://notifier.internal/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledTime: controller.scheduledTime })
    });
    if (!response.ok) throw new Error('썬데이 메이플 알림 실행 실패');
    console.log(await response.text());
  },
  fetch() { return new Response('Not found', { status: 404 }); }
};
