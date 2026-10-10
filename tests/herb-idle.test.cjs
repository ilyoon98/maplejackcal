const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../herb_idle_core.js');
const {C, ITEMS, KEYS, SELL, BUY} = Core;

const fresh = (seed = 7) => Core.create(seed);
const events = () => { const list = []; const emit = e => list.push(e); emit.list = list; return emit; };
// 8시간 상한이 있어서 긴 시간은 나눠 흘린다
const run = (s, sec, emit) => { for (let left = sec; left > 0; left -= C.OFFLINE_CAP) Core.advance(s, Math.min(left, C.OFFLINE_CAP), emit); };

test('1회 채집 씨앗: 2/3는 0개, 나머지는 1~5개 균등 → 500회 평균 500·표준편차 36.5', () => {
  const s = fresh(1);
  const n = 300000, freq = [0, 0, 0, 0, 0, 0];
  let sum = 0, sq = 0;
  for (let i = 0; i < n; i++) { const v = Core.rollSeeds(s); freq[v]++; sum += v; sq += v * v; }
  const mean = sum / n, variance = sq / n - mean * mean;
  assert.ok(Math.abs(mean - 1) < 0.01, 'mean ' + mean);
  assert.ok(Math.abs(freq[0] / n - 2 / 3) < 0.005);
  for (let k = 1; k <= 5; k++) assert.ok(Math.abs(freq[k] / n - 1 / 15) < 0.003, 'k=' + k);
  // 게시글 실측: 500회당 평균 497.6, 표준편차 36.8
  assert.ok(Math.abs(Math.sqrt(variance * 500) - 36.8) < 1.5);
});

test('채집만 1시간 돌리면 씨앗은 채집 횟수와 비슷하고 시세는 1,200번 바뀐다', () => {
  const s = fresh(3), emit = events();
  Core.advance(s, 3600, emit);
  assert.equal(s.t, 3600);
  assert.ok(s.stats.gathers > 1000 && s.stats.gathers < 1500, 'gathers ' + s.stats.gathers);
  assert.equal(s.inv.seed, s.stats.seeds);
  assert.ok(Math.abs(s.stats.seeds / s.stats.gathers - 1) < 0.1);
  assert.equal(s.market.tick, 40 + 1200);
  assert.equal(emit.list.filter(e => e.type === 'gather').length, s.stats.gathers);
  assert.equal(s.meso, C.START_MESO);
});

test('잘게 나눠 흘려도 한 번에 흘려도 결과가 같다 (자리 비움 정산 = 켜 둔 화면)', () => {
  const a = fresh(11), b = fresh(11);
  Core.advance(a, 600);
  // 1/64초는 2진수로 딱 떨어져서 600초 끝(시세 변동 시각)이 양쪽에서 똑같이 처리된다
  for (let i = 0; i < 600 * 64; i++) Core.advance(b, 1 / 64);
  assert.equal(a.stats.gathers, b.stats.gathers);
  assert.equal(a.inv.seed, b.inv.seed);
  assert.deepEqual(KEYS.map(k => a.market.items[k].price), KEYS.map(k => b.market.items[k].price));
  assert.ok(Math.abs(a.t - b.t) < 1e-6);
});

test('오일 만들기: 씨앗 6 + 오일병 1,000메소 → 90% 오일, 10% 꽝(보라색 가루), 재료가 떨어지면 약초 캐기로', () => {
  const s = fresh(5), emit = events();
  s.inv.seed = 6000;
  s.meso = 1e9;
  assert.equal(Core.setMode(s, 'oil', emit), '');
  assert.equal(s.mode, 'oil');
  Core.advance(s, 3600, emit);
  assert.equal(s.stats.oilTry, 1000);
  assert.equal(s.inv.oil, s.stats.oilOk);
  assert.ok(Math.abs(s.inv.oil / 1000 - 0.9) < 0.04, 'oil ' + s.inv.oil);
  // 꽝은 가방에 남지 않는다
  assert.deepEqual(Object.keys(s.inv), KEYS);
  assert.equal(s.inv.powder, undefined);
  const fails = emit.list.filter(e => e.type === 'oil' && !e.ok).length;
  assert.equal(fails, 1000 - s.inv.oil);
  assert.equal(s.meso, 1e9 - 1000 * C.OIL_BOTTLE);
  assert.equal(s.stats.spent, 1000 * C.OIL_BOTTLE);
  assert.equal(s.mode, 'gather');
  const stop = emit.list.find(e => e.type === 'stop');
  assert.equal(stop.reason, 'seed');
  assert.deepEqual([stop.batch.tries, stop.batch.made, stop.batch.fail], [1000, s.inv.oil, fails]);
  // 오일을 다 만든 뒤에는 다시 약초를 캔다
  assert.ok(s.stats.gathers > 0);
  assert.equal(s.inv.seed, s.stats.seeds);
});

test('꽝이면 3초 기절하고, 기절 중에 다른 일을 눌러도 깨어난 뒤에 간다', () => {
  const s = fresh(12);
  s.inv.seed = 600;
  s.meso = 1e8;
  Core.setMode(s, 'oil');
  let failAt = -1;
  const emit = e => { if (e.type === 'oil' && !e.ok && failAt < 0) failAt = s.t; };
  let guard = 0;
  while (failAt < 0 && guard++ < 100000) Core.advance(s, 0.01, emit);
  assert.ok(failAt > 0);
  assert.equal(s.actor.phase, 'stun');
  assert.equal(s.actor.end, failAt + C.STUN_TIME);
  const seeds = s.inv.seed;
  assert.equal(Core.setMode(s, 'gather'), '');
  assert.equal(s.mode, 'gather');
  assert.equal(s.actor.phase, 'stun');
  Core.advance(s, failAt + C.STUN_TIME - 0.05 - s.t);
  assert.equal(s.actor.phase, 'stun');
  assert.equal(s.stats.gathers, 0);
  assert.equal(s.inv.seed, seeds);
  Core.advance(s, 0.1);
  assert.notEqual(s.actor.phase, 'stun');
  // 저장했다 불러와도 기절은 이어진다
  const t = fresh(12);
  t.inv.seed = 600;
  t.meso = 1e8;
  Core.setMode(t, 'oil');
  guard = 0;
  while (t.actor.phase !== 'stun' && guard++ < 100000) Core.advance(t, 0.01);
  const copy = Core.normalize(JSON.parse(JSON.stringify(t)));
  assert.equal(copy.actor.phase, 'stun');
  assert.equal(copy.actor.end, t.actor.end);
});

test('연금술: 부족한 제작 재료를 자동 구매하고 오일이 떨어질 때까지 재물비를 만든다', () => {
  const s = fresh(9), emit = events();
  s.inv.oil = 52; s.inv.crystal = 30; s.inv.stone = 7;
  s.meso = 1e6;
  const stoneAsk = Core.quote(s, 'stone', 'ask');
  assert.equal(Core.setMode(s, 'alchemy', emit), '');
  Core.advance(s, 120, emit);
  assert.equal(s.stats.crafts, 10);
  assert.deepEqual([s.inv.elixir, s.inv.oil, s.inv.crystal, s.inv.stone], [60, 2, 10, 0]);
  assert.equal(s.meso, 1e6 - 3 * stoneAsk - 10 * C.POTION_BOTTLE);
  assert.equal(emit.list.find(e => e.type === 'autoBuy').items[0].qty, 3);
  assert.equal(emit.list.find(e => e.type === 'stop').reason, 'oil');
  assert.equal(s.mode, 'gather');
});

test('재료나 메소가 모자라면 시작하지 않고 이유를 돌려준다', () => {
  const s = fresh();
  s.inv.seed = 5;
  assert.equal(Core.setMode(s, 'oil'), 'seed');
  assert.equal(Core.setMode(s, 'alchemy'), 'oil');
  s.inv.seed = 6;
  s.meso = 999;
  assert.equal(Core.setMode(s, 'oil'), 'meso');
  s.inv.oil = 5;
  assert.equal(Core.setMode(s, 'alchemy'), 'meso');
  s.inv.crystal = 2;
  assert.equal(Core.setMode(s, 'alchemy'), 'meso');
  s.inv.stone = 1;
  s.meso = C.POTION_BOTTLE - 1;
  assert.equal(Core.setMode(s, 'alchemy'), 'meso');
  assert.equal(Core.setMode(s, 'nope'), 'mode');
  assert.equal(s.mode, 'gather');
});

test('가공 도중 다른 일로 바꾸면 넣은 재료와 메소를 돌려준다', () => {
  const s = fresh();
  s.inv.seed = 60;
  s.meso = 1e7;
  Core.setMode(s, 'oil');
  // 제련대까지 걸어가서 작업을 시작할 때까지 흘린다
  let guard = 0;
  while (s.actor.phase !== 'work' && guard++ < 1000) Core.advance(s, 0.05);
  assert.equal(s.actor.phase, 'work');
  assert.equal(s.inv.seed, 54);
  assert.equal(s.meso, 1e7 - C.OIL_BOTTLE);
  const emit = events();
  Core.setMode(s, 'gather', emit);
  assert.equal(s.inv.seed, 60);
  assert.equal(s.meso, 1e7);
  assert.equal(emit.list.find(e => e.type === 'stop').reason, 'switch');
  assert.equal(s.mode, 'gather');

  s.inv.oil = 5; s.inv.crystal = 2; s.inv.stone = 1;
  Core.setMode(s, 'alchemy');
  guard = 0;
  while (s.actor.phase !== 'work' && guard++ < 1000) Core.advance(s, 0.05);
  assert.deepEqual([s.inv.oil, s.inv.crystal, s.inv.stone], [0, 0, 0]);
  Core.setMode(s, 'gather');
  assert.deepEqual([s.inv.oil, s.inv.crystal, s.inv.stone], [5, 2, 1]);
  assert.equal(s.meso, 1e7);
});

test('판매: 씨앗·오일·재물비만 가능하고 매수 호가에서 수수료 5%를 뗀다', () => {
  const s = fresh();
  s.inv.seed = 10;
  s.market.items.seed.price = 742000;
  const r = Core.sell(s, 'seed', 3);
  assert.deepEqual(r, {key: 'seed', qty: 3, price: 727000, gross: 2181000, fee: 109050, net: 2071950});
  assert.equal(s.meso, C.START_MESO + 2071950);
  assert.equal(Core.sell(s, 'seed', 99).qty, 7);
  assert.equal(s.inv.seed, 0);
  assert.equal(Core.sell(s, 'seed', 1), null);
  assert.equal(Core.sell(s, 'powder', 1), null);
  assert.equal(Core.sell(s, 'oil', NaN), null);
  s.inv.crystal = 5;
  assert.equal(Core.sell(s, 'crystal', 1), null);
  assert.equal(s.stats.sold.seed, 10);
  assert.equal(s.stats.income, s.meso - C.START_MESO);
});

test('구매: 씨앗·오일·최상결·현자의 돌만 가능하고 메소가 모자라면 가능한 만큼 산다', () => {
  const s = fresh();
  s.meso = 1000000;
  s.market.items.crystal.price = 298000;
  assert.deepEqual(Core.buy(s, 'crystal', 2), {key: 'crystal', qty: 2, want: 2, price: 304000, cost: 608000});
  assert.equal(s.meso, 392000);
  assert.equal(s.inv.crystal, 2);
  const r = Core.buy(s, 'crystal', 10);
  assert.deepEqual([r.qty, r.want], [1, 10]);
  assert.equal(s.meso, 88000);
  assert.equal(Core.buy(s, 'crystal', 1), null);
  s.meso = 1000000;
  assert.equal(Core.buy(s, 'seed', 1).qty, 1);
  assert.equal(Core.buy(s, 'elixir', 1), null);
  assert.equal(Core.buy(s, 'stone', 0), null);
  assert.equal(s.stats.bought, 912000 + Core.quote(s, 'seed', 'ask'));
  assert.equal(s.stats.income, 0);
});

test('필요한 만큼: 지금 오일을 다 재물비로 만들 때 더 사야 하는 재료 수', () => {
  const s = fresh();
  s.inv.oil = 23;           // 4번 만들 수 있음
  s.inv.crystal = 3; s.inv.stone = 5;
  assert.equal(Core.needFor(s, 'crystal'), 5);
  assert.equal(Core.needFor(s, 'stone'), 0);
  s.inv.oil = 4;
  assert.equal(Core.needFor(s, 'crystal'), 0);
});

test('시세는 품목별 상·하한을 넘지 않고, 거래 단위로 딱 떨어진다', () => {
  const s = fresh(21), emit = events();
  const ticks = 50000;
  const lo = {}, hi = {};
  KEYS.forEach(k => { lo[k] = Infinity; hi[k] = 0; });
  run(s, ticks * C.TICK, e => {
    emit(e);
    if (e.type === 'tick') KEYS.forEach(k => { const p = s.market.items[k].price; lo[k] = Math.min(lo[k], p); hi[k] = Math.max(hi[k], p); });
  });
  assert.equal(emit.list.filter(e => e.type === 'tick').length, ticks);
  KEYS.forEach(k => {
    const d = ITEMS[k], it = s.market.items[k];
    assert.equal(it.hist.length, C.HISTORY);
    assert.ok(it.hist.every(p => p % d.step === 0), k);
    assert.ok(lo[k] >= d.base * Math.exp(d.lo) - d.step && hi[k] <= d.base * Math.exp(d.hi) + d.step, k + ' ' + lo[k] + '~' + hi[k]);
  });
  const news = emit.list.filter(e => e.type === 'news').length;
  assert.ok(news > ticks * C.NEWS_CHANCE * 0.8 && news < ticks * C.NEWS_CHANCE * 1.2, 'news ' + news);
  assert.ok(s.market.news.length <= 6);
});

test('변동폭은 씨앗 > 오일 > 재물비, 오래 흘려도 평균은 평소 값 근처', () => {
  const s = fresh(33);
  const sum = {}, sq = {};
  KEYS.forEach(k => { sum[k] = 0; sq[k] = 0; });
  const n = 40000;
  for (let i = 0; i < n; i++) {
    Core.advance(s, C.TICK);
    KEYS.forEach(k => { const x = Math.log(s.market.items[k].price / ITEMS[k].base); sum[k] += x; sq[k] += x * x; });
  }
  const sd = {};
  KEYS.forEach(k => {
    const mean = sum[k] / n;
    sd[k] = Math.sqrt(sq[k] / n - mean * mean);
    assert.ok(Math.abs(mean) < 0.06, k + ' mean ' + mean);
  });
  assert.ok(sd.seed > sd.oil * 1.2 && sd.oil > sd.elixir * 1.3, JSON.stringify(sd));
  assert.ok(sd.elixir > 0.02 && sd.seed < 0.2, JSON.stringify(sd));
});

test('8시간 넘게 비워도 8시간까지만 진행한다', () => {
  const s = fresh();
  Core.advance(s, 30 * 3600);
  assert.equal(s.t, C.OFFLINE_CAP);
});

test('같은 난수 상태면 결과가 같다', () => {
  const a = fresh(99), b = fresh(99);
  a.inv.seed = b.inv.seed = 120;
  Core.advance(a, 30); Core.advance(b, 30);
  Core.setMode(a, 'oil'); Core.setMode(b, 'oil');
  Core.advance(a, 900); Core.advance(b, 900);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test('저장본 불러오기: 그대로 이어지고, 망가진 값은 고치거나 버린다', () => {
  for (const at of [3.1, 77.7]) {
    const s = fresh(4);
    s.inv.seed = 100;
    Core.advance(s, at);
    const mid = Core.normalize(JSON.parse(JSON.stringify(s)));   // 채집 중이거나 이동 중
    assert.deepEqual(mid, JSON.parse(JSON.stringify(s)));
    Core.setMode(s, 'oil');
    Core.advance(s, 1.3);
    const copy = Core.normalize(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(copy, JSON.parse(JSON.stringify(s)));
    Core.advance(s, 200); Core.advance(copy, 200);
    assert.deepEqual(copy, s);
  }

  assert.equal(Core.normalize(null), null);
  assert.equal(Core.normalize({v: 2}), null);
  const bad = JSON.parse(JSON.stringify(fresh()));
  bad.meso = 'x'; bad.inv.seed = -5; bad.inv.oil = 2.7; bad.mode = 'dance'; bad.herbs = [1, 2];
  bad.actor = {phase: 'work', job: {kind: 'hack'}, start: 0, end: 5};
  bad.market.items.seed.price = -1; bad.market.items.oil.hist = ['a', NaN, 5540000];
  const fixed = Core.normalize(bad);
  assert.equal(fixed.meso, C.START_MESO);
  assert.deepEqual([fixed.inv.seed, fixed.inv.oil], [0, 2]);
  assert.equal(fixed.mode, 'gather');
  assert.equal(fixed.herbs.length, Core.HERBS.length);
  assert.equal(fixed.actor.phase, 'idle');
  assert.ok(fixed.market.items.seed.price > 0);
  assert.deepEqual(fixed.market.items.oil.hist, [5540000]);
  Core.advance(fixed, 60);
  assert.ok(fixed.stats.gathers > 0);
});

test('예전 저장본: 보라색 가루는 버리고, 없던 재료·시세는 새로 채운다', () => {
  const old = JSON.parse(JSON.stringify(fresh()));
  old.inv = {seed: 4, oil: 3, elixir: 1, powder: 7};
  delete old.market.items.crystal;
  delete old.market.items.stone;
  delete old.stats.bought;
  const s = Core.normalize(old);
  assert.deepEqual(s.inv, {seed: 4, oil: 3, elixir: 1, crystal: 0, stone: 0});
  assert.ok(s.market.items.crystal.price > 0 && s.market.items.stone.hist.length > 0);
  assert.equal(s.stats.bought, 0);
});

test('캐릭터 이미지 발 위치: 맨 아래 줄 아래, 무기가 옆으로 뻗어도 발 가운데', () => {
  const w = 300, h = 300, a = new Uint8Array(w * h);
  const fill = (x1, y1, x2, y2, v = 255) => { for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) a[y * w + x] = v; };
  fill(136, 150, 164, 178);        // 머리
  fill(140, 178, 160, 205);        // 몸
  fill(141, 205, 148, 215);        // 왼발
  fill(152, 205, 159, 215);        // 오른발
  fill(160, 160, 260, 166);        // 오른쪽으로 길게 뻗은 무기
  fill(100, 230, 110, 232, 10);    // 거의 투명한 얼룩은 무시
  const r = Core.spriteAnchor(a, w, h);
  assert.deepEqual([r.ok, r.y, r.top, r.height], [true, 215, 150, 65]);
  assert.ok(Math.abs(r.x - 150) < 1, 'x ' + r.x);
  assert.deepEqual(Core.spriteAnchor(new Uint8Array(w * h), w, h), {ok: false});
});

test('씨앗 1개 가치 비교는 지금 재료 시세를 빼고 계산한다', () => {
  const s = fresh();
  KEYS.forEach(k => { s.market.items[k].price = ITEMS[k].base; });
  const v = Core.seedValues(s);
  const bid = k => Core.quote(s, k, 'bid'), ask = k => Core.quote(s, k, 'ask');
  assert.equal(Math.round(v.direct), Math.round(bid('seed') * .95));
  assert.equal(Math.round(v.viaOil), Math.round((0.9 * bid('oil') * 0.95 - 1000) / 6));
  assert.equal(Core.alchCost(s), 800 + 2 * ask('crystal') + ask('stone'));
  assert.equal(Math.round(v.oilViaElixir), Math.round((6 * bid('elixir') * 0.95 - Core.alchCost(s)) / 5));
  assert.ok(v.viaOil > v.direct && v.viaElixir > v.direct);
  s.market.items.stone.price = 3000000;   // 현자의 돌이 비싸지면 재물비 쪽이 손해
  assert.ok(Core.seedValues(s).viaElixir < v.viaElixir);
  assert.equal(Core.afterFee(10 * 740000), 7030000);
  assert.equal(Core.afterFee(19), 18);   // 수수료 0.95는 올려서 1
  assert.deepEqual(SELL, ['seed', 'oil', 'elixir']);
  assert.deepEqual(BUY, ['seed', 'oil', 'crystal', 'stone']);
});

test('거래 UI는 허용된 판매·구매만 숫자 입력으로 받는다', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'herb_idle.js'), 'utf8');
  assert.match(ui, /type=\"number\" min=\"1\" step=\"1\"/);
  assert.match(ui, /canSell = SELL\.indexOf\(k\) >= 0/);
  assert.match(ui, /canBuy = BUY\.indexOf\(k\) >= 0/);
  assert.match(ui, /data-trade-input/);
  assert.doesNotMatch(ui, /btn\('sell', 100/);
  assert.doesNotMatch(ui, /btn\('buy', 100/);
});

test('층 이동 위치: 실제 사다리까지 걷고 수직 이동한 뒤 목표로 걷는다', () => {
  const base = {phase: 'move', start: 0, end: 2, fx: 100, fy: 336, tx: 100, ty: 246};
  const ladder = Core.posAt({...base, how: 'ladder'}, 1);
  assert.deepEqual(ladder, {x: 100, y: 291, vis: 1, k: .5});
  const s = fresh();
  s.herbs.forEach((h, i) => { h.readyAt = i === 5 ? 0 : 999; });
  Core.advance(s, 0);
  assert.equal(s.actor.how, 'walk');
  assert.deepEqual([s.actor.tx, s.actor.ty], [240, Core.WORLD.ground]);
  assert.deepEqual(s.actor.route.map(p => [p.x, p.y, p.how]), [
    [240, 246, 'ladder'], [302, 246, 'walk']
  ]);
});

test('캐릭터 모션 URL은 기본 서기 파라미터를 중복 추가하지 않고 교체한다', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'herb_idle.js'), 'utf8');
  const body = ui.match(/function frameUrl\([\s\S]*?\n  }/)[0];
  assert.match(body, /searchParams\.set\('action', action\)/);
  assert.match(body, /searchParams\.set\('emotion', emotion\)/);
  assert.match(body, /searchParams\.set\('wmotion', motion\)/);
  assert.match(body, /searchParams\.set\('wmotion', motion\)/);
  assert.doesNotMatch(body, /['"]action=['"]\s*\+/);
});

test('넥슨 character_image 공식 코드를 걷기·사다리·점프·두손 공격에 사용한다', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'herb_idle.js'), 'utf8');
  assert.match(ui, /actions: \['A02\.0', 'A02\.1', 'A02\.2', 'A02\.3'\]/);
  assert.match(ui, /actions: \['A08\.0', 'A08\.1'\]/);
  assert.match(ui, /motion: 'W02', actions: \['A23\.0', 'A23\.1', 'A23\.2', 'A23\.3'\]/);
  assert.match(ui, /actions: \['A06\.0'\]/);
  assert.match(ui, /넥슨 API에서 걷기·사다리·점프·공격 모션을 받는 중/);
  assert.match(ui, /return loadLook\(info\)\.then\(ready =>/);
  assert.match(ui, /source: 'nexon-api'/);
});

test('넥슨 이미지는 crossOrigin 없이 받고 고정 발 원점(150, 200)을 쓴다', () => {
  // 넥슨 이미지 서버는 캐시 안 된 프레임을 Origin 헤더와 함께 받으면 empty_img로 보낸다.
  const ui = fs.readFileSync(path.join(__dirname, '..', 'herb_idle.js'), 'utf8');
  const pose = ui.match(/function loadPose\([\s\S]*?\n  }/)[0];
  const look = ui.match(/function loadLook\([\s\S]*?\n  }/)[0];
  assert.match(pose, /loadImage\(frameUrl\([^)]*\)\)\)/);
  assert.doesNotMatch(pose + look, /spriteShape|usableFrame|, true\)/);
  assert.match(look, /anchor: NEXON_ANCHOR/);
  assert.match(ui, /NEXON_ANCHOR = \{ ok: true, x: 150, y: 200/);
  assert.match(ui, /if \(cors\) im\.crossOrigin = 'anonymous'/);
  assert.match(ui, /naturalWidth === 256 && im\.naturalHeight === 256/);
});

test('저장한 캐릭터는 basic 정보를 갱신하고 empty_img를 프레임으로 쓰지 않는다', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'herb_idle.js'), 'utf8');
  assert.match(ui, /apiGet\('\/character\/basic', \{ ocid: me\.ocid \}\)/);
  assert.match(ui, /me\.image = image/);
  assert.match(ui, /imageAt: Date\.now\(\)/);
  assert.match(ui, /Date\.now\(\) - me\.imageAt < 30 \* 60 \* 1000/);
  assert.match(ui, /static\\\/empty_img/);
  assert.match(ui, /im\.currentSrc \|\| im\.src/);
});

test('MapleStory.io 조립은 넥슨 공식 모션이 누락된 경우에만 보조한다', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'herb_idle.js'), 'utf8');
  assert.match(ui, /const IO_BASE = 'https:\/\/maplestory\.io\/api\/KMS\/latest'/);
  assert.match(ui, /apiGet\('\/character\/item-equipment'/);
  assert.match(ui, /apiGet\('\/character\/cashitem-equipment'/);
  assert.match(ui, /apiGet\('\/character\/beauty-equipment'/);
  assert.match(ui, /action: 'walk1'/);
  assert.match(ui, /action: 'ladder'/);
  assert.match(ui, /action: 'swingOF'/);
  assert.match(ui, /if \(!missingApi\.length\) return \{ ready, config: null, warning: '' \}/);
  assert.match(ui, /buildIoAppearance\(ocid\)\.then\(config => loadIoLook\(config\)/);
});

test('캐릭터 선택기는 주간 보스 계획표와 같은 260레벨 기본 필터를 쓴다', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'herb_idle.js'), 'utf8');
  assert.match(ui, /NexonCharacters\.mount\(\{ host: '#mePicker', input: meInput \}\)/);
  assert.doesNotMatch(ui, /host: '#mePicker'[\s\S]{0,80}minLevel/);
  assert.doesNotMatch(ui, /host: '#mePicker'[\s\S]{0,80}variant/);
});
