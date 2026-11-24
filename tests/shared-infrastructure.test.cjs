const test = require('node:test');
const assert = require('node:assert/strict');
const NexonApi = require('../nexon_api.js');
const JsonStorage = require('../json_storage.js');

test('넥슨 요청은 현재 키를 헤더에 넣고 조회 조건을 인코딩한다', async () => {
  const calls = [];
  let key = 'old-key';
  const api = new NexonApi(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ ocid: 'character-id' });
  }, () => key);

  await api.get('/id', { character_name: '캐릭터 & 이름' });
  key = 'new-key';
  assert.deepEqual(await api.get('/character/basic', { ocid: 'character-id' }), { ocid: 'character-id' });
  assert.equal(new URL(calls[0].url).searchParams.get('character_name'), '캐릭터 & 이름');
  assert.ok(calls.every(({ url }) => !url.includes('old-key') && !url.includes('new-key')));
  assert.deepEqual(calls.map(({ options }) => options.headers['x-nxopen-api-key']), ['old-key', 'new-key']);
});

test('넥슨 요청은 JSON이 없는 429 응답에서도 재시도에 필요한 정보를 전달한다', async () => {
  const api = new NexonApi(async () => new Response('Too many requests', {
    status: 429,
    headers: { 'Retry-After': '2.5' }
  }), () => 'key');

  await assert.rejects(api.get('/history/starforce', { date: '2026-11-01' }), error => {
    assert.ok(error instanceof NexonApi.Error);
    assert.equal(error.status, 429);
    assert.equal(error.rateLimited, true);
    assert.equal(error.retryAfterMs, 2500);
    return true;
  });
});

test('공용 JSON 저장소는 이전 데이터를 읽고 손상되거나 차단된 저장 공간에서 기본값을 사용한다', () => {
  const values = new Map([['settings', '{"amount":0,"enabled":false}'], ['broken', '{'], ['empty', 'null']]);
  const local = {
    getItem: key => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  let blocked = false;
  const store = new JsonStorage(() => {
    if (blocked) throw new Error('Storage blocked');
    return local;
  });

  assert.deepEqual(store.read('settings'), { amount: 0, enabled: false });
  assert.deepEqual(store.read('broken', []), []);
  assert.equal(store.read('empty', []), null);
  assert.equal(store.write('settings', { amount: 14 }), true);
  assert.equal(values.get('settings'), '{"amount":14}');
  blocked = true;
  assert.deepEqual(store.read('settings', {}), {});
  assert.equal(store.write('settings', { amount: 30 }), false);
  assert.equal(store.remove('settings'), false);
  blocked = false;
  assert.deepEqual(store.read('settings'), { amount: 14 });
  assert.equal(store.remove('settings'), true);
  assert.equal(store.read('settings'), null);
});
