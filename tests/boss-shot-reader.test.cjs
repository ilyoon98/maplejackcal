const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

require('../boss_shot_reader.js');
const reader = globalThis.BossShotReader;

// 8비트 RGBA, 비인터레이스 PNG만 푸는 최소 디코더(픽스처 전용).
function decodePng(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, width = 0, height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      assert.equal(body[8], 8); assert.equal(body[9], 6); assert.equal(body[12], 0);
    } else if (type === 'IDAT') idat.push(body);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = width * bpp, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? data[dst + x - bpp] : 0, b = y ? data[dst - stride + x] : 0;
      const c = x >= bpp && y ? data[dst - stride + x - bpp] : 0, v = raw[src + x];
      let p;
      if (filter === 0) p = 0;
      else if (filter === 1) p = a;
      else if (filter === 2) p = b;
      else if (filter === 3) p = (a + b) >> 1;
      else { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      data[dst + x] = (v + p) & 255;
    }
  }
  return {width, height, data};
}

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
