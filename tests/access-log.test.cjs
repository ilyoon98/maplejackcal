const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../access_log_core.js');

const snap = (level, exp, access = true) => ({ level, exp, access });

// 날짜별 경험치 변화로 스냅샷을 만든다. played: 플레이한 날짜 목록
function character(played, { created = '2023-12-21', idleFlag = false } = {}) {
  const calls = [];
  const get = async date => {
    calls.push(date);
    if (date < created) return null;
    const exp = played.filter(d => d <= date).length;
    const recent = played.some(d => d <= date && A.diffDays(d, date) < 7);
    return snap(280, exp, idleFlag ? recent : true);
  };
  return { get, calls };
}

test('날짜 범위와 KST 날짜를 계산한다', () => {
  assert.deepEqual(A.dateRange('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  assert.deepEqual(A.dateRange('2026-10-02', '2026-10-01'), []);
  assert.equal(A.kstDate(Date.parse('2026-10-19T15:30:00Z')), '2026-10-20');
  assert.equal(A.lastQueryableDate(Date.parse('2026-10-20T00:10:00+09:00')), '2026-10-19');
  assert.equal(A.toKstDate('2026-10-16T10:00+09:00'), '2026-10-16');
});

test('전날보다 경험치가 바뀐 날을 정확히 찾는다', async () => {
  const played = ['2026-10-02', '2026-10-03', '2026-10-09', '2026-10-20'];
  const c = character(played);
  const states = await A.scanCharacter('2026-10-01', '2026-10-31', c.get, () => false);
  const on = Object.keys(states).filter(d => states[d] === 'on').sort();
  assert.deepEqual(on, played);
  assert.equal(Object.keys(states).length, 31);
  assert.ok(new Set(c.calls).size < 31, '쉬는 구간은 건너뛴다');
});

test('안 쓰는 캐릭터는 양 끝 2번만 조회한다', async () => {
  const c = character(['2025-01-01']);
  const states = await A.scanCharacter('2026-01-01', '2026-12-31', c.get, () => false);
  assert.equal(c.calls.length, 2);
  assert.ok(Object.values(states).every(s => s === 'off'));
});

test('이미 다른 캐릭터로 접속한 날은 더 조회하지 않는다', async () => {
  const c = character(A.dateRange('2026-10-01', '2026-10-31'));
  await A.scanCharacter('2026-10-01', '2026-10-31', c.get, () => true);
  assert.equal(c.calls.length, 2);
});

test('캐릭터가 생긴 날은 접속, 그 전은 미접속', async () => {
  const c = character(['2026-10-05'], { created: '2026-10-05' });
  const states = await A.scanCharacter('2026-10-01', '2026-10-10', c.get, () => false);
  assert.equal(states['2026-10-05'], 'on');
  assert.equal(states['2026-10-03'], 'off');
  assert.equal(states['2026-10-08'], 'off');
});

test('최근 7일 미접속 표시가 있으면 7일 구간을 바로 미접속으로 본다', async () => {
  const c = character(['2026-10-01'], { idleFlag: true });
  const states = await A.scanCharacter('2026-10-01', '2026-10-31', c.get, () => false);
  assert.equal(states['2026-10-01'], 'on');
  assert.ok(A.dateRange('2026-10-02', '2026-10-31').every(d => states[d] === 'off'));
});

test('캐릭터별 결과를 계정 하루 상태로 합친다', () => {
  const days = A.mergeDays(A.dateRange('2026-10-01', '2026-10-04'), [
    { name: '본캐', states: { '2026-10-01': 'on', '2026-10-02': 'off', '2026-10-03': 'unknown' } },
    { name: '부캐', states: { '2026-10-01': 'on', '2026-10-02': 'off', '2026-10-03': 'off' } }
  ], '2026-10-03');
  assert.deepEqual(days.map(d => d.state), ['on', 'off', 'unknown', 'future']);
  assert.deepEqual(days[0].characters, ['본캐', '부캐']);
  // 기록이 없는 캐릭터가 있으면 미접속으로 단정하지 않는다
  const partial = A.mergeDays(['2026-10-01'], [{ name: '본캐', states: { '2026-10-01': 'off' } }, { name: '부캐', states: {} }], '2026-10-03');
  assert.equal(partial[0].state, 'unknown');
});

test('접속 일수와 최장 연속 접속을 요약한다', () => {
  const days = ['on', 'on', 'off', 'on', 'on', 'on', 'unknown', 'future'].map((state, i) => ({ date: A.addDays('2026-10-01', i), state }));
  const s = A.summarize(days);
  assert.equal(s.total, 8);
  assert.equal(s.checked, 6);
  assert.equal(s.on, 5);
  assert.equal(s.longestStreak, 3);
});

test('API 응답을 스냅샷으로 바꾼다', () => {
  assert.deepEqual(A.snapshotFrom({ character_level: 285, character_exp: 123, access_flag: 'true' }), snap(285, 123, true));
  assert.equal(A.snapshotFrom({ character_level: null }), null);
});

test('같은 날 이벤트가 여러 개 열린 큰 업데이트만 고른다', () => {
  const ev = (title, from, to) => ({ title, from, to });
  const big = ['버닝 월드', '코인샵', '출석', '보스 이벤트', '(수정) 성장 이벤트', '이벤트 스킬'].map((t, i) => ev(t, '2026-06-18', i < 4 ? '2026-08-19' : '2026-09-16'));
  const updates = A.majorUpdates([
    ...big,
    ev('(수정2) 버닝 월드', '2026-06-18', '2026-08-19'),
    ev('썬데이 메이플', '2026-06-21', '2026-06-21'),
    ev('작은 이벤트', '2026-07-02', '2026-07-16'),
    ev('하나', '2026-09-17', '2026-11-18'), ev('둘', '2026-09-17', '2026-11-18')
  ], '2026-07-01', '2026-10-20');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].title, '26년 6월 업데이트');
  assert.equal(updates[0].to, '2026-08-19');
  assert.equal(updates[0].start, '2026-07-01');
  assert.equal(updates[0].titles.length, 6);
  assert.equal(updates[0].lane, 0);
});

test('지난 3년 큰 업데이트는 손에 꼽을 만큼만 나온다', () => {
  const updates = A.majorUpdates(require('../event_history.js'), '2023-12-21', '2026-10-20');
  assert.ok(updates.length >= 8 && updates.length <= 20, String(updates.length));
  assert.ok(Math.max(...updates.map(u => u.lane)) <= 2);
});

test('Open API 이벤트 공지를 날짜로 바꾼다', () => {
  assert.deepEqual(A.eventsFromApi([{ title: '버닝', date_event_start: '2026-10-16T10:00+09:00', date_event_end: '2026-11-12T23:59+09:00' }]),
    [{ title: '버닝', from: '2026-10-16', to: '2026-11-12' }]);
});

test('조회가 중간에 막히면 남은 구간은 확인 못 함으로 두고 받은 결과는 남긴다', async () => {
  const played = ['2026-10-02', '2026-10-20'];
  let left = 3;
  const c = character(played);
  const get = date => (left-- > 0 ? c.get(date) : Promise.resolve(undefined));
  const states = await A.scanCharacter('2026-10-01', '2026-10-31', get, () => false);
  const values = Object.values(states);
  assert.equal(values.length, 31);
  assert.ok(values.includes('unknown'));
  assert.ok(!values.includes('on') || states['2026-10-02'] === 'on' || states['2026-10-20'] === 'on');
});

test('현재 연속 접속은 남은 기간을 빼고 끝에서부터 센다', () => {
  const days = ['on', 'off', 'on', 'on', 'future'].map((state, i) => ({ date: A.addDays('2026-10-01', i), state }));
  assert.equal(A.summarize(days).currentStreak, 2);
});

test('지난 이벤트 데이터는 날짜 형식이 맞다', () => {
  const history = require('../event_history.js');
  assert.ok(history.length > 100);
  assert.ok(history.every(e => e.title && A.isDate(e.from) && A.isDate(e.to) && e.from <= e.to));
});
