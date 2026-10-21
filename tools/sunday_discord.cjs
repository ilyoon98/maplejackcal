// 금요일 아침 썬데이 메이플 공지를 찾아 디스코드 웹후크로 공유한다.
// 필요 환경변수: NEXON_API_KEY, DISCORD_WEBHOOK_URL
// 선택: SUNDAY_POLL_MINUTES(공지가 아직 없을 때 기다리는 최대 시간, 기본 120), SUNDAY_DRY_RUN=1
'use strict';

const Sunday = require('../sunday_event.js');

const API_URL = 'https://open.api.nexon.com/maplestory/v1/notice-event';
const DETAIL_API_URL = 'https://open.api.nexon.com/maplestory/v1/notice-event/detail';
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 5 * 60 * 1000;

// 가장 최근 금요일 00:00 KST. 공지는 금요일 오전에 올라오므로 10:30 기준 대신 자정을 기준으로 잡는다.
function latestFridayStart(now) {
  const kst = new Date(now + KST_OFFSET_MS);
  const daysSinceFriday = (kst.getUTCDay() - 5 + 7) % 7;
  return Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - daysSinceFriday) - KST_OFFSET_MS;
}

function buildPayload(event) {
  const dateLabel = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short'
  }).format(new Date(event.date_event_start));
  const images = event.image_urls.slice(0, 4);
  const embeds = (images.length ? images : [null]).map((image) => {
    const embed = { url: event.url };
    if (image) embed.image = { url: image };
    return embed;
  });
  Object.assign(embeds[0], {
    title: `🍁 ${event.title} — ${dateLabel}`,
    description: `이번 주 ${event.title} 공지가 올라왔어요!\n[공식 공지 바로가기](${event.url})`,
    color: 0xf5a623
  });
  return { username: '썬데이 메이플 알리미', embeds, allowed_mentions: { parse: [] } };
}

async function nexon(url, apiKey) {
  const response = await fetch(url, { headers: { 'x-nxopen-api-key': apiKey } });
  if (!response.ok) throw new Error(`Nexon API ${response.status}: ${url}`);
  return response.json();
}

async function findEvent(apiKey, now) {
  const data = await nexon(API_URL, apiKey);
  const event = Sunday.safeEvent(Sunday.selectEvent(data.event_notice, latestFridayStart(now), now));
  if (!event) return null;
  if (event.notice_id) {
    try {
      const detail = await nexon(`${DETAIL_API_URL}?notice_id=${encodeURIComponent(event.notice_id)}`, apiKey);
      event.image_urls = Sunday.extractImageUrls(detail.contents);
    } catch (err) {
      console.warn('상세 이미지를 불러오지 못해 링크만 보냅니다.', err.message);
    }
  }
  return event;
}

async function main() {
  const apiKey = (process.env.NEXON_API_KEY || '').trim();
  const webhook = (process.env.DISCORD_WEBHOOK_URL || '').trim();
  const dryRun = process.env.SUNDAY_DRY_RUN === '1';
  if (!apiKey) throw new Error('NEXON_API_KEY가 필요합니다.');
  if (!webhook && !dryRun) throw new Error('DISCORD_WEBHOOK_URL이 필요합니다.');

  const deadline = Date.now() + Number(process.env.SUNDAY_POLL_MINUTES || 120) * 60 * 1000;
  let event = null;
  for (;;) {
    try { event = await findEvent(apiKey, Date.now()); }
    catch (err) { console.warn(err.message); }
    if (event || Date.now() + POLL_INTERVAL_MS > deadline) break;
    console.log('아직 이번 주 썬데이 메이플 공지가 없습니다. 5분 뒤 다시 확인합니다.');
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  if (!event) {
    console.log('이번 주 썬데이 메이플 공지를 찾지 못했습니다.');
    return;
  }

  const payload = buildPayload(event);
  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Discord webhook ${response.status}: ${await response.text()}`);
  console.log(`공유 완료: ${event.title} ${event.url}`);
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { latestFridayStart, buildPayload };
