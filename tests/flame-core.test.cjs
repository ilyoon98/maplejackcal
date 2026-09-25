// Run with: node --test tests/flame-core.test.cjs
//
// 추가옵션 확률 엔진(flame_core.js)은 "옵션 개수 → 종류 조합 → 줄마다 단계"를 전부 펼쳐서
// 정확한 확률을 낸다. 그 값이 맞는지는 같은 규칙을 그대로 굴리는 몬테카를로와 맞춰 본다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../flame_core.js'), 'utf8'), context);
const F = context.window.FlameCore;

// 엔진과 같은 규칙을 한 판씩 직접 굴린다
function simulate(opts, rounds, rand) {
  const list = F.candidates(opts.level, opts.weapon);
  const tierP = F.FLAMES[opts.flame].tiers.map(x => x / 100);
  const shift = opts.boss ? 2 : 0;
  const countP = opts.boss ? [0, 0, 0, 1] : F.COUNT_DIST.map(x => x / 100);
  const draw = dist => { let r = rand(), acc = 0; for (let i = 0; i < dist.length; i++) { acc += dist[i]; if (r < acc) return i; } return dist.length - 1; };

  let hit = 0;
  for (let it = 0; it < rounds; it++) {
    const k = draw(countP) + 1;
    const idx = list.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    let grade = 0; const tiers = {};
    for (const i of idx.slice(0, k)) {
      const tier = draw(tierP) + 1 + shift;
      tiers[list[i].id] = tier;
      grade += F.gradeWeight(list[i], opts.weapon) * list[i].value(opts.level, tier);
    }
    if (opts.conds.every(c => c.kind === 'opt' ? (tiers[c.id] || 0) >= c.minTier : grade >= c.min)) hit++;
  }
  return hit / rounds;
}

// 재현 가능한 난수 (mulberry32)
function seeded(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const CASES = [
  ['200제 방어구 · 검은 불꽃 · 올스탯 5단계 이상',
    { level: 200, weapon: false, boss: false, flame: 'black', conds: [{ kind: 'opt', id: 'ALL_PCT', minTier: 5 }] }],
  ['200제 보스 방어구 · 검은 불꽃 · 주스탯 환산 110급 이상',
    { level: 200, weapon: false, boss: true, flame: 'black', conds: [{ kind: 'grade', min: 110 }] }],
  ['200제 보스 무기 · 심연 불꽃 · 공격력 2추 + 보공 3추',
    { level: 200, weapon: true, boss: true, flame: 'abyss', conds: [{ kind: 'opt', id: 'ATT', minTier: 6 }, { kind: 'opt', id: 'BOSS_DMG', minTier: 5 }] }],
  ['160제 방어구 · 타오르는 불꽃 · 환산 60급 + 공격력 4단계',
    { level: 160, weapon: false, boss: false, flame: 'burning', conds: [{ kind: 'grade', min: 60 }, { kind: 'opt', id: 'ATT', minTier: 4 }] }]
];

for (const [name, opts] of CASES) {
  test(`${name} 확률이 시뮬레이션과 맞는다`, () => {
    const exact = F.probability(opts);
    const N = 400000;
    const sim = simulate(opts, N, seeded(20260925));
    // 이항분포 표준편차의 5배. 확률이 아주 작은 경우까지 감안해 절대 오차 하한을 둔다.
    const tol = Math.max(5 * Math.sqrt(Math.max(exact, 1e-6) * (1 - exact) / N), 2e-5);
    assert.ok(Math.abs(exact - sim) <= tol,
      `정확값 ${exact} vs 시뮬 ${sim} (허용 ${tol})`);
  });
}

test('50제 방어구에는 공격력·올스탯% 추가옵션이 없다', () => {
  const ids = F.candidates(50, false).map(o => o.id);
  assert.ok(!ids.includes('ATT') && !ids.includes('MATT') && !ids.includes('ALL_PCT'));
  // 있을 수 없는 옵션을 조건으로 걸면 확률은 0
  assert.equal(F.probability({ level: 50, weapon: false, boss: false, flame: 'black', conds: [{ kind: 'opt', id: 'ATT', minTier: 3 }] }), 0);
});

test('80제 무기에는 보스 데미지 추가옵션이 없고 90제부터 붙는다', () => {
  assert.ok(!F.candidates(80, true).some(o => o.id === 'BOSS_DMG'));
  assert.ok(F.candidates(90, true).some(o => o.id === 'BOSS_DMG'));
});

test('보스 장비는 +2단계로 취급한다', () => {
  // vm 안에서 만들어진 배열이라 프로토타입이 달라 deepEqual 대신 값만 본다
  assert.equal(F.tiers(false).join(), '1,2,3,4,5');
  assert.equal(F.tiers(true).join(), '3,4,5,6,7');
  // 검은 불꽃 1단계는 0%라 일반 장비는 2~5단계, 보스 장비는 4~7단계만 나온다
  const opts = { level: 200, weapon: false, boss: true, flame: 'black', conds: [{ kind: 'opt', id: 'ALL_PCT', minTier: 4 }] };
  const tight = Object.assign({}, opts, { conds: [{ kind: 'opt', id: 'ALL_PCT', minTier: 3 }] });
  assert.equal(F.probability(opts), F.probability(tight));
});

test('추가옵션 재설정(메소)은 검은 불꽃과 확률이 같고 1회 300만 메소다', () => {
  assert.equal(F.FLAMES.mesoReset.tiers.join(), F.FLAMES.black.tiers.join());
  assert.equal(F.FLAMES.mesoReset.meso, 3000000);
  assert.equal(F.FLAMES.black.meso, 0); // 불꽃은 아이템이라 메소가 안 든다
  const conds = [{ kind: 'grade', min: 110 }];
  const base = { level: 200, weapon: false, boss: true, conds };
  assert.equal(F.probability(Object.assign({ flame: 'mesoReset' }, base)),
               F.probability(Object.assign({ flame: 'black' }, base)));
});

test('급수 환산은 주스탯 1 · 올스탯 1% = 10 · 공격력 1 = 4', () => {
  const w = id => F.gradeWeight(F.BY_ID[id], false);
  assert.equal(w('STR'), 1);
  assert.equal(w('STR_DEX'), 1);   // 복합 스탯은 주스탯 쪽만 센다
  assert.equal(w('DEX_LUK'), 0);   // 주스탯이 안 들어간 복합은 0
  assert.equal(w('ALL_PCT'), 10);
  assert.equal(w('ATT'), 4);
  assert.equal(w('HP'), 0);
  // 무기는 공격력 수치를 모르니 급수에서 뺀다
  assert.equal(F.gradeWeight(F.BY_ID.ATT, true), 0);
  // 200제 보스 장비 1추: STR 77 → 77급, 올스탯 7% → 70급, 공격력 7 → 28급
  assert.equal(F.gradeWeight(F.BY_ID.STR, false) * F.BY_ID.STR.value(200, 7), 77);
  assert.equal(F.gradeWeight(F.BY_ID.ALL_PCT, false) * F.BY_ID.ALL_PCT.value(200, 7), 70);
  assert.equal(F.gradeWeight(F.BY_ID.ATT, false) * F.BY_ID.ATT.value(200, 7), 28);
});

test('조건이 없으면 어떤 불꽃이든 확률 100%', () => {
  assert.equal(F.probability({ level: 200, weapon: true, boss: true, flame: 'black', conds: [] }), 1);
});

test('200제 방어구 단계별 수치가 알려진 표와 맞는다', () => {
  const at = id => t => F.BY_ID[id].value(200, t);
  assert.equal(at('STR')(7), 77);        // (floor(200/20)+1) × 7
  assert.equal(at('STR_DEX')(7), 42);    // (floor(200/40)+1) × 7
  assert.equal(at('HP')(7), 4200);       // floor(200/10) × 30 × 7
  assert.equal(at('ALL_PCT')(7), 7);
  assert.equal(at('REQ_LV')(7), -35);
  assert.equal(at('DEF')(7), 77);
  // 250제는 단일 스탯 계수 12, HP 계수 700으로 묶인다
  assert.equal(F.BY_ID.STR.value(250, 7), 84);
  assert.equal(F.BY_ID.HP.value(250, 7), 4900);
  // 130제 이하 방어력은 단계 그대로
  assert.equal(F.BY_ID.DEF.value(130, 7), 7);
});
