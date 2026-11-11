const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const friday = Date.parse('2026-11-06T10:00:00+09:00');
const env = { NEXON_API_KEY: 'test-key', DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/test-token' };
const event = {
  title: '썬데이 메이플', notice_id: 1234, url: 'https://maplestory.nexon.com/News/Event/1234',
  date_event_start: '2026-11-08T00:00:00+09:00', date_event_end: '2026-11-08T23:59:00+09:00'
};

test('Cloudflare 예약은 숫자 요일 대신 FRI를 사용하고 첫 실행은 10시 KST다', () => {
  const config = fs.readFileSync(path.join(__dirname, '../cloudflare/sunday-discord/wrangler.jsonc'), 'utf8');
  const crons = JSON.parse(config.match(/"crons"\s*:\s*(\[[^\]]+\])/)[1]);
  for (const cron of crons) assert.equal(cron.split(/\s+/)[4], 'FRI');
  assert.equal(crons[0].split(/\s+/)[0], '*/5');
  assert.equal(crons[0].split(/\s+/)[1], '1-2');
  assert.equal(new Date(friday + 9 * 3600000).getUTCHours(), 10);
});

function memoryStorage() {
  const data = new Map();
  return { get: async key => structuredClone(data.get(key)), put: async (key, value) => data.set(key, structuredClone(value)) };
}

function mockRequest({ events = [event], discordStatus = 200, failList = false, failDetail = false } = {}) {
  const calls = [];
  const request = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('discord.com/')) return Response.json({ id: 'message-123' }, { status: discordStatus });
    if (url.includes('/detail?')) return Response.json({ contents: '<img src="https://lwi.nexon.com/maplestory/sunday.png">' }, { status: failDetail ? 503 : 200 });
    return Response.json({ event_notice: events }, { status: failList ? 503 : 200 });
  };
  return { request, calls };
}

test('금요일 한국 시간 10시부터 정오까지만 발송을 시작한다', async () => {
  const { isNotificationTime } = await import('../cloudflare/sunday-discord/worker.mjs');
  for (const [time, expected] of [
    ['2026-11-06T09:59:00+09:00', false], ['2026-11-06T10:00:00+09:00', true],
    ['2026-11-06T12:00:00+09:00', true], ['2026-11-06T12:01:00+09:00', false],
    ['2026-11-07T10:00:00+09:00', false]
  ]) assert.equal(isNotificationTime(Date.parse(time)), expected, time);
});

test('공지 이미지와 링크를 발송하고 재실행·재시작 시 중복 전송하지 않는다', async () => {
  const { notify } = await import('../cloudflare/sunday-discord/worker.mjs');
  const storage = memoryStorage();
  const { request, calls } = mockRequest();
  const sent = await notify(storage, env, friday, friday, request);
  assert.equal(sent.status, 'sent');
  assert.equal(sent.messageId, 'message-123');
  const post = calls.find(call => call.init?.method === 'POST');
  assert.match(post.url, /wait=true/);
  assert.match(JSON.parse(post.init.body).embeds[0].image.url, /sunday.png$/);
  assert.equal((await notify(storage, env, friday + 300000, friday + 300000, request)).status, 'already-sent');
  assert.equal(calls.length, 3);
});

test('실제 스페셜 썬데이 공지도 제목을 유지하여 발송한다', async () => {
  const { notify } = await import('../cloudflare/sunday-discord/worker.mjs');
  const specialFriday = Date.parse('2026-10-30T10:00:00+09:00');
  const special = { ...event, title: '스페셜 썬데이 메이플', notice_id: 1406,
    url: 'https://maplestory.nexon.com/News/Event/1406',
    date_event_start: '2026-11-01T00:00+09:00', date_event_end: '2026-11-01T23:59+09:00' };
  const { request, calls } = mockRequest({ events: [special] });
  assert.equal((await notify(memoryStorage(), env, specialFriday, specialFriday, request)).status, 'sent');
  const payload = JSON.parse(calls.find(call => call.init?.method === 'POST').init.body);
  assert.match(payload.embeds[0].title, /스페셜 썬데이 메이플/);
});

test('알림 제목 판정은 일반·스페셜만 허용하며 무관한 이벤트는 제외한다', () => {
  const { isSundayTitle, selectWeeklyEvent, latestSundayEvent } = require('../tools/sunday_discord.cjs');
  assert.equal(isSundayTitle('스페셜 썬데이 메이플'), true);
  assert.equal(isSundayTitle('선데이 메이플'), true);
  assert.equal(isSundayTitle('썬데이 메이플 기념 상점'), false);
  assert.equal(selectWeeklyEvent([{ ...event, date_event_end: 'invalid' }], friday), null);
  assert.equal(latestSundayEvent([{ ...event, title: '스페셜 썬데이 메이플' }]).notice_id, event.notice_id);
});

test('아직 공지가 없으면 기다렸다가 다음 실행에서 발송한다', async () => {
  const { notify } = await import('../cloudflare/sunday-discord/worker.mjs');
  const storage = memoryStorage();
  assert.equal((await notify(storage, env, friday, friday, mockRequest({ events: [] }).request)).status, 'waiting-for-notice');
  assert.equal((await notify(storage, env, friday + 300000, friday + 300000, mockRequest().request)).status, 'sent');
});

test('넥슨 조회 오류는 실패로 기록하고 다음 실행에서 복구한다', async () => {
  const { notify } = await import('../cloudflare/sunday-discord/worker.mjs');
  const storage = memoryStorage();
  await assert.rejects(notify(storage, env, friday, friday, mockRequest({ failList: true }).request), /Nexon API 503/);
  assert.equal((await storage.get('delivery')).status, 'failed');
  assert.equal((await notify(storage, env, friday + 300000, friday + 300000, mockRequest().request)).status, 'sent');
});

test('디스코드 오류는 성공으로 저장하지 않고 재시도한다', async () => {
  const { notify } = await import('../cloudflare/sunday-discord/worker.mjs');
  const storage = memoryStorage();
  await assert.rejects(notify(storage, env, friday, friday, mockRequest({ discordStatus: 429 }).request), /HTTP 429/);
  assert.equal((await notify(storage, env, friday + 300000, friday + 300000, mockRequest().request)).status, 'sent');
});

test('상세 이미지 조회 실패 시 공식 링크로 발송한다', async () => {
  const { notify } = await import('../cloudflare/sunday-discord/worker.mjs');
  const { request, calls } = mockRequest({ failDetail: true });
  assert.equal((await notify(memoryStorage(), env, friday, friday, request)).status, 'sent');
  const payload = JSON.parse(calls.find(call => call.init?.method === 'POST').init.body);
  assert.equal(payload.embeds[0].url, event.url);
  assert.equal(payload.embeds[0].image, undefined);
});

test('정오까지 공지가 없으면 정상 종료 대신 실패를 보고한다', async () => {
  const { notify } = await import('../cloudflare/sunday-discord/worker.mjs');
  const noon = friday + 2 * 3600000;
  await assert.rejects(notify(memoryStorage(), env, noon, noon, mockRequest({ events: [] }).request), /정오까지/);
});

test('지난 공지는 발송하지 않고 다음 주 공지는 새로 발송한다', async () => {
  const { notify } = await import('../cloudflare/sunday-discord/worker.mjs');
  const storage = memoryStorage();
  await notify(storage, env, friday, friday, mockRequest().request);
  const nextFriday = friday + 7 * 86400000;
  const old = mockRequest();
  assert.equal((await notify(storage, env, nextFriday, nextFriday, old.request)).status, 'waiting-for-notice');
  assert.equal(old.calls.length, 1);
  const next = { ...event, notice_id: 1235, date_event_start: '2026-11-15T00:00+09:00', date_event_end: '2026-11-15T23:59+09:00' };
  assert.equal((await notify(storage, env, nextFriday, nextFriday, mockRequest({ events: [next] }).request)).status, 'sent');
});

test('잘못된 웹후크와 누락된 비밀 설정은 외부 호출 전에 실패한다', async () => {
  const { notify } = await import('../cloudflare/sunday-discord/worker.mjs');
  const { request, calls } = mockRequest();
  await assert.rejects(notify(memoryStorage(), {}, friday, friday, request), /비밀 설정/);
  await assert.rejects(notify(memoryStorage(), { ...env, DISCORD_WEBHOOK_URL: 'https://example.com/token' }, friday, friday, request), /웹후크 주소/);
  assert.equal(calls.length, 0);
});

test('지난 주차에서 뒤늦게 전달된 예약과 시간 밖 요청은 무시한다', async () => {
  const { notify, default: worker } = await import('../cloudflare/sunday-discord/worker.mjs');
  const { request, calls } = mockRequest();
  assert.equal((await notify(memoryStorage(), env, friday - 60000, friday, request)).status, 'outside-window');
  assert.equal((await notify(memoryStorage(), env, friday, friday + 7 * 86400000, request)).status, 'outside-window');
  assert.equal(calls.length, 0);
  assert.equal(worker.fetch().status, 404);
});

test('동일 Durable Object로 동시 요청이 들어와도 한 번만 발송한다', async () => {
  const { SundayNotifier } = await import('../cloudflare/sunday-discord/worker.mjs');
  const storage = memoryStorage();
  const realFetch = global.fetch;
  const realNow = Date.now;
  const { request, calls } = mockRequest();
  global.fetch = request;
  Date.now = () => friday;
  try {
    const notifier = new SundayNotifier({ storage }, env);
    const makeRequest = () => new Request('https://notifier.internal/run', { method: 'POST', body: JSON.stringify({ scheduledTime: friday }) });
    const results = await Promise.all([notifier.fetch(makeRequest()), notifier.fetch(makeRequest())]);
    assert.deepEqual(await Promise.all(results.map(async result => (await result.json()).status)), ['sent', 'already-sent']);
    assert.equal(calls.filter(call => call.init?.method === 'POST').length, 1);
  } finally { global.fetch = realFetch; Date.now = realNow; }
});
