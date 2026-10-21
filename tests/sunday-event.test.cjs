const test = require('node:test');
const assert = require('node:assert/strict');
const Sunday = require('../sunday_event.js');

test('금요일 10시 30분 KST에 새 주차로 전환한다', () => {
  const before = Date.parse('2026-10-02T10:29:59+09:00');
  const after = Date.parse('2026-10-02T10:30:00+09:00');
  assert.equal(Sunday.latestRefreshAt(before), Date.parse('2026-09-25T10:30:00+09:00'));
  assert.equal(Sunday.latestRefreshAt(after), after);
  assert.equal(Sunday.nextRefreshAt(after), Date.parse('2026-10-09T10:30:00+09:00'));
});

test('금요일 10시 30분부터 일요일 23시 59분 59초까지만 표시한다', () => {
  const friday = Date.parse('2026-10-02T10:30:00+09:00');
  assert.equal(Sunday.displayEndsAt(friday), Date.parse('2026-10-04T23:59:59.999+09:00'));
  assert.equal(Sunday.isWithinDisplayWindow(Date.parse('2026-10-02T10:29:59.999+09:00')), false);
  assert.equal(Sunday.isWithinDisplayWindow(friday), true);
  assert.equal(Sunday.isWithinDisplayWindow(Date.parse('2026-10-04T23:59:59.999+09:00')), true);
  assert.equal(Sunday.isWithinDisplayWindow(Date.parse('2026-10-05T00:00:00+09:00')), false);
});

test('오늘 하루 안 보기 날짜는 한국 날짜를 사용한다', () => {
  assert.equal(Sunday.kstDateKey(Date.parse('2026-10-02T00:30:00Z')), '2026-10-02');
  assert.equal(Sunday.kstDateKey(Date.parse('2026-10-02T16:00:00Z')), '2026-10-03');
});

test('이번 금요일 이후 열리는 썬데이 메이플만 고른다', () => {
  const refresh = Date.parse('2026-10-02T10:30:00+09:00');
  const now = Date.parse('2026-10-02T10:31:00+09:00');
  const selected = Sunday.selectEvent([
    { title: '퍼스널 버닝', date_event_start: '2026-10-01T10:00+09:00', date_event_end: '2026-10-14T23:59+09:00' },
    { title: '썬데이 메이플', notice_id: 1396, date_event_start: '2026-10-04T00:00+09:00', date_event_end: '2026-10-04T23:59+09:00' }
  ], refresh, now);
  assert.equal(selected.notice_id, 1396);
});

test('지난 이벤트와 넥슨 외부 링크는 노출하지 않는다', () => {
  const refresh = Date.parse('2026-10-02T10:30:00+09:00');
  const now = Date.parse('2026-10-05T00:00:00+09:00');
  assert.equal(Sunday.selectEvent([
    { title: '썬데이 메이플', date_event_start: '2026-10-04T00:00+09:00', date_event_end: '2026-10-04T23:59+09:00' }
  ], refresh, now), null);
  assert.equal(Sunday.safeEvent({
    title: '썬데이 메이플', url: 'https://example.com/News/Event/1396',
    date_event_start: '2026-10-04T00:00+09:00', date_event_end: '2026-10-04T23:59+09:00'
  }), null);
});

test('상세 본문에서는 넥슨 HTTPS 이미지만 추출한다', () => {
  const images = Sunday.extractImageUrls(`
    <img src="https://lwi.nexon.com/maplestory/sunday.png">
    <img src='https://ssl.nexon.com/banner.png'>
    <img src="https://example.com/tracker.png">
    <img src="javascript:alert(1)">
    <img src="https://lwi.nexon.com/maplestory/sunday.png">
  `);
  assert.deepEqual(images, [
    'https://lwi.nexon.com/maplestory/sunday.png',
    'https://ssl.nexon.com/banner.png'
  ]);
});

test('디스코드 알림은 금요일 10시 공지도 이번 주로 찾는다', () => {
  const { latestFridayStart, buildPayload } = require('../tools/sunday_discord.cjs');
  const now = Date.parse('2026-10-23T10:05:00+09:00');
  assert.equal(latestFridayStart(now), Date.parse('2026-10-23T00:00:00+09:00'));
  assert.equal(latestFridayStart(Date.parse('2026-10-22T23:59:00+09:00')), Date.parse('2026-10-16T00:00:00+09:00'));
  const event = Sunday.safeEvent(Sunday.selectEvent([{
    title: '썬데이 메이플', url: 'https://maplestory.nexon.com/News/Event/1234', notice_id: 1234,
    date_event_start: '2026-10-25T00:00+09:00', date_event_end: '2026-10-25T23:59+09:00'
  }], latestFridayStart(now), now));
  event.image_urls = ['https://lwi.nexon.com/a.png', 'https://lwi.nexon.com/b.png'];
  const payload = buildPayload(event);
  assert.equal(payload.embeds.length, 2);
  assert.match(payload.embeds[0].title, /썬데이 메이플/);
  assert.equal(payload.embeds[1].image.url, 'https://lwi.nexon.com/b.png');
});
