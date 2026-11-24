const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parse, hasPreset, client, describeError, SLOT_KEYS} = require('../accessory_equipment.js');

const item = (slot, name, lines = [], extra = []) => ({
  item_equipment_slot: slot, item_name: name, item_icon: `https://open.api.nexon.com/static/${name}.png`,
  potential_option_1: lines[0] ?? null, potential_option_2: lines[1] ?? null, potential_option_3: lines[2] ?? null,
  additional_potential_option_1: extra[0] ?? null, additional_potential_option_2: extra[1] ?? null, additional_potential_option_3: extra[2] ?? null
});

const body = {
  preset_no: 1,
  item_equipment: [
    item('반지1', '마이스터링', ['메소 획득량 : +20%', '메소 획득량 : +20%', 'STR : +12%']),
    item('얼굴장식', '레드 아처 마이스터 심볼', ['아이템 드롭률 : +20%', 'DEX : +9%']),
    item('펜던트2', '카오스 혼테일의 목걸이', ['아이템 드롭률 : +20%', '메소 획득량 : +20%']),
    item('귀고리', '하프 이어링', ['아이템 드롭률 : +20%', '아이템 드롭률 : +20%', '아이템 드롭률 : +20%']),
    item('눈장식', '블랙빈 마크', ['아이템 드롭률 : +10%']),
    item('모자', '모자', ['아이템 드롭률 : +20%'])
  ],
  item_equipment_preset_1: [item('반지2', '어웨이크 링', ['아이템 드롭률 : +20%'])],
  item_equipment_preset_2: [],
  item_equipment_preset_3: null
};

test('장신구 9부위 순서로 드랍과 메획 줄을 센다', () => {
  const r = parse(body, 0);
  assert.equal(r.length, 9);
  assert.deepEqual(SLOT_KEYS, ['반지1', '반지2', '반지3', '반지4', '얼굴장식', '눈장식', '펜던트', '펜던트2', '귀고리']);
  assert.deepEqual([r[0].drop, r[0].meso, r[0].name], [0, 2, '마이스터링']);
  assert.deepEqual([r[4].drop, r[4].meso], [1, 0]);
  assert.deepEqual([r[7].drop, r[7].meso], [1, 1]);
  assert.equal(r[1].empty, true);
});

test('두 줄 초과와 20% 단위가 아닌 옵션은 주의로 표시한다', () => {
  const r = parse(body, 0);
  assert.deepEqual([r[8].drop, r[8].meso, r[8].dropPct, r[8].partial], [2, 0, 60, true]);
  assert.deepEqual([r[5].drop, r[5].dropPct, r[5].partial], [0, 10, true]);
  assert.equal(r[0].partial, false);
});

test('프리셋을 고르고 빈 프리셋을 구분한다', () => {
  assert.deepEqual(parse(body, 1)[1].drop, 1);
  assert.equal(parse(body, 1)[0].empty, true);
  assert.equal(hasPreset(body, 0), true);
  assert.equal(hasPreset(body, 2), false);
  assert.equal(hasPreset(body, 3), false);
  assert.equal(parse(null, 0).every(slot => slot.empty), true);
});

test('계정 ocid가 없으면 이름으로 ocid를 찾은 뒤 장비를 조회한다', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init.headers['x-nxopen-api-key']]);
    if (url.includes('/id?')) return {ok: true, json: async () => ({ocid: 'abc'})};
    return {ok: true, json: async () => body};
  };
  const api = client(fetchImpl, () => 'key');
  assert.equal(await api.load('앙헤', '', undefined), body);
  assert.match(calls[0][0], /\/id\?character_name=%EC%95%99%ED%97%A4$/);
  assert.match(calls[1][0], /\/character\/item-equipment\?ocid=abc$/);
  assert.equal(calls[1][1], 'key');
  await api.load('앙헤', 'known', undefined);
  assert.equal(calls.length, 3);
  assert.match(calls[2][0], /ocid=known$/);
});

test('키 없음과 API 오류를 해결 안내로 바꾼다', async () => {
  await assert.rejects(client(async () => assert.fail(), () => '').load('a', ''), /API_KEY_REQUIRED/);
  const failing = client(async () => ({ok: false, status: 400, json: async () => ({error: {name: 'OPENAPI00004', message: 'bad'}})}), () => 'k');
  const error = await failing.load('a', '').catch(e => e);
  assert.equal(error.code, 'OPENAPI00004');
  assert.match(describeError(error), /캐릭터를 찾지 못했습니다/);
  assert.match(describeError(new Error('API_KEY_REQUIRED')), /API 키를 등록/);
});
