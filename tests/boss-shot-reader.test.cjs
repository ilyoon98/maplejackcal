const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

require('../boss_shot_reader.js');
const reader = globalThis.BossShotReader;

const {decodePng} = require('./helpers/png-rgba.cjs');

// 픽스처 카드 47장(위→아래, 왼→오른). 배율 ''은 '[파티] 0%'처럼 숫자로 읽지 않는 줄.
const EXPECTED = [
  ['유피테르', '하드', ''], ['카링', '익스트림', ''], ['최초의 대적자', '익스트림', '0.42%'], ['감시자 칼로스', '익스트림', '1.34%'],
  ['발드릭스', '하드', '0.16%'], ['벨로나', '하드', '0.27%'], ['림보', '하드', '0.29%'], ['찬란한 흉성', '하드', '0.34%'],
  ['유피테르', '노멀', '0.25%'], ['최초의 대적자', '하드', '10.19%'], ['발드릭스', '노멀', '0.37%'], ['카링', '하드', '10.15%'],
  ['선택받은 세렌', '익스트림', '13.05%'], ['검은 마법사', '익스트림', '16.22%'], ['림보', '노멀', '0.57%'], ['감시자 칼로스', '카오스', '17.28%'],
  ['벨로나', '노멀', '5.43%'], ['카링', '노멀', '32.38%'], ['찬란한 흉성', '노멀', '24.96%'], ['스우', '익스트림', '41.22%'],
  ['최초의 대적자', '노멀', '75.94%'], ['감시자 칼로스', '노멀', '92.51%'], ['벨로나', '이지', '76.60%'], ['카링', '이지', '143.1%'],
  ['선택받은 세렌', '하드', '168.0%'], ['최초의 대적자', '이지', '223.2%'], ['감시자 칼로스', '이지', '275.1%'], ['검은 마법사', '하드', '344.2%'],
  ['선택받은 세렌', '노멀', '392.9%'], ['진 힐라', '하드', '674.1%'], ['듄켈', '하드', '770.7%'], ['더스크', '카오스', '812.1%'],
  ['가디언 엔젤 슬라임', '카오스', '671.2%'], ['윌', '하드', '964.8%'], ['루시드', '하드', '455.0%'], ['진 힐라', '노멀', '1348%'],
  ['데미안', '하드', '1855%'], ['스우', '하드', '2477%'], ['듄켈', '노멀', '4856%'], ['더스크', '노멀', '4061%'],
  ['루시드', '노멀', '5056%'], ['윌', '노멀', '4824%'], ['윌', '이지', '7236%'], ['루시드', '이지', '8718%'],
  ['가디언 엔젤 슬라임', '노멀', '12081%'], ['스우', '노멀', '52849%'], ['데미안', '노멀', '55636%'],
];

const shot = decodePng(path.join(__dirname, 'fixtures/boss_shot_1.png'));

test('카드 격자를 모두 찾는다', () => {
  const {cards} = reader.findCards(shot);
  assert.equal(cards.length, 47);
  assert.ok(cards.every(c => c.w === 72 && c.h === 136));
});

test('카드마다 보스·난이도·배율을 읽는다', () => {
  const got = reader.analyze(shot, reader.siteRefs()).map(r => [r.name, r.diff, r.text]);
  assert.deepEqual(got, EXPECTED);
});

test('읽은 배율은 숫자로 바뀌고, 못 읽은 줄은 null', () => {
  const res = reader.analyze(shot, reader.siteRefs());
  assert.equal(res[0].value, null);
  assert.equal(res[23].value, 143.1);
  assert.equal(res[46].value, 55636);
  assert.ok(res.every(r => r.sure));
});

test('겹쳐 붙은 77과 점이 붙은 .1도 나눠 읽는다', () => {
  const res = reader.analyze(shot, reader.siteRefs());
  assert.equal(res[37].text, '2477%');
  assert.equal(res[9].text, '10.19%');
  assert.equal(res[15].text, '17.28%');
});

// 사용자가 제보한 150% 캡처. 브라우저가 다시 그린 글꼴이라 100%의 단순 확대와 다르다.
const shot150 = decodePng(path.join(__dirname, 'fixtures/boss_shot_150.png'));
const PERCENT_150 = [
  '5.68%', '33.91%', '26.13%', '43.10%', '79.52%', '96.84%', '80.16%', '149.9%',
  '175.9%', '233.7%', '288.0%', '362.3%', '411.6%', '702.7%', '803.5%', '846.6%',
  '699.7%', '1006%', '474.3%', '1405%', '1933%', '2582%', '5062%', '4233%',
  '5271%', '5029%', '7543%', '9089%', '12594%', '55095%', '58000%',
];

test('150% 실제 캡처의 31개 보스·난이도·배율을 정확히 읽는다', () => {
  const res = reader.analyze(shot150, reader.siteRefs());
  assert.equal(res.length, 31);
  assert.ok(res.every(r => r.card.w === 108 && r.card.h === 204));
  assert.deepEqual(res.map(r => [r.name, r.diff, r.text]),
    EXPECTED.slice(16).map(([name, diff], i) => [name, diff, PERCENT_150[i]]));
  assert.deepEqual(res.map(r => r.value), PERCENT_150.map(parseFloat));
});

test('100% 캡처를 2배 확대해도 기존 글꼴의 배율을 유지한다', () => {
  const enlarged = {width:shot.width * 2, height:shot.height * 2};
  enlarged.data = new Uint8ClampedArray(enlarged.width * enlarged.height * 4);
  for (let y = 0; y < enlarged.height; y++) {
    for (let x = 0; x < enlarged.width; x++) {
      const src = ((y >> 1) * shot.width + (x >> 1)) * 4;
      enlarged.data.set(shot.data.subarray(src, src + 4), (y * enlarged.width + x) * 4);
    }
  }
  const res = reader.analyze(enlarged, reader.siteRefs());
  assert.deepEqual(res.map(r => [r.name, r.diff, r.text]), EXPECTED);
  assert.deepEqual(res.map(r => r.value), EXPECTED.map(([, , pct]) => pct ? parseFloat(pct) : null));
});

test('숫자 획이 손상된 캡처는 추측한 배율을 적용하지 않는다', () => {
  const damaged = {...shot150, data:new Uint8ClampedArray(shot150.data)};
  const c = reader.findCards(damaged).cards[3];
  // 숫자 줄 가운데에 격자 잡음을 섞어도 카드와 보스 초상화는 그대로 유지한다.
  for (let y = c.y + c.h - 26; y < c.y + c.h - 13; y++) {
    for (let x = c.x + 27; x < c.x + 66; x++) {
      if ((x + y) % 3) continue;
      const p = (y * damaged.width + x) * 4;
      damaged.data[p] = damaged.data[p + 1] = damaged.data[p + 2] = 255;
    }
  }
  const res = reader.analyze(damaged, reader.siteRefs());
  assert.equal(res[3].name, '스우');
  assert.equal(res[3].diff, '익스트림');
  assert.equal(res[3].value, null);
  assert.equal(res[4].value, 79.52);
});

const smallShot = decodePng(path.join(__dirname, 'fixtures/boss_shot_small.png'));
test('작은 캡처는 반투명 툴팁 아래의 소수점도 읽고 난이도가 가려진 3장만 제외한다', () => {
  const res = reader.analyze(smallShot, reader.siteRefs());
  assert.equal(res.length, 31); // 툴팁 때문에 이어진 카드도 복원하며 마지막 빈 칸은 만들지 않는다.
  assert.deepEqual(res.map(r => r.name), EXPECTED.slice(16).map(([name]) => name));
  assert.deepEqual(res.map(r => r.value), [
    26.67, 51.98, 57.39, null, null, null, 176.4, 209.7,
    244.5, 323.6, 408.8, 502.7, 573.9, 974.9, 1115, 1175,
    970.7, 1395, 670.9, 1950, 2682, 3582, 7023, 5873,
    7313, 6977, 10465, 12609, 17473, 76436, 80467,
  ]);
  assert.equal(res.filter(r => r.covered).length, 3);
  assert.equal(res[6].text, '176.4%');
  assert.equal(res[7].text, '209.7%');
  assert.ok(res.filter(r => !r.covered).every(r => r.value != null));
  assert.ok(res.filter(r => r.covered).every(r => r.value == null && r.text === ''));
});

test('작은 글꼴도 숫자에 잡음이 겹치면 기존 값을 추측하지 않는다', () => {
  const damaged = {...smallShot, data:new Uint8ClampedArray(smallShot.data)};
  const c = reader.findCards(damaged).cards[0];
  for (let y = c.y + 119; y < c.y + 127; y++) {
    for (let x = c.x + 17; x < c.x + 44; x++) {
      if ((x + y) % 2) continue;
      const p = (y * damaged.width + x) * 4;
      damaged.data[p] = damaged.data[p + 1] = damaged.data[p + 2] = 255;
    }
  }
  const res = reader.analyze(damaged, reader.siteRefs());
  assert.equal(res[0].name, '벨로나');
  assert.equal(res[0].value, null);
  assert.equal(res[1].value, 51.98);
});
