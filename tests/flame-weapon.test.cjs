const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const W = require('../flame_weapon_data.js');
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../flame_core.js'), 'utf8'), context);
const F = context.window.FlameCore;

test('weapon reference includes distinct selectable weapons with descending 1–5 rank values', () => {
  assert.equal(W.items.length, 36);
  assert.equal(new Set(W.items.map(w => w.id)).size, 36);
  for (const w of W.items) {
    assert.equal(w.values.length, 5);
    assert.ok(w.values.every((v, i) => Number.isInteger(v) && v > 0 && (!i || v < w.values[i - 1])));
  }
  assert.deepEqual(W.items.find(w => w.id === 'twohand_sword').values, [210, 163, 124, 90, 62]);
  assert.deepEqual(W.items.find(w => w.id === 'staff').values, [250, 195, 148, 108, 74]);
  assert.deepEqual(W.items.find(w => w.id === 'claw').values, [106, 83, 63, 46, 31]);
  assert.equal(W.items.find(w => w.id === 'lazuli').special, true);
});

test('boss damage is twice the tier; damage, all-stat and single stats retain their scales', () => {
  assert.deepEqual([7, 6, 5, 4, 3].map(t => F.BY_ID.BOSS_DMG.value(200, t)), [14, 12, 10, 8, 6]);
  assert.deepEqual([7, 6, 5, 4, 3].map(t => F.BY_ID.DMG.value(200, t)), [7, 6, 5, 4, 3]);
  assert.deepEqual([7, 6, 5, 4, 3].map(t => F.BY_ID.STR.value(200, t)), [77, 66, 55, 44, 33]);
});

test('series resolves weapon type at the correct level and preserves unknown source values', () => {
  const expected = {
    fafnir: [150, [71,55,42,31,21], [84,66,50,36,25]],
    absolab: [160, [106,82,63,46,31], [126,98,75,54,37]],
    arcane: [200, [182,142,108,78,54], [218,170,129,94,64]],
    genesis: [200, [210,163,124,90,62], [250,195,148,108,74]],
    destiny: [250, [268,209,158,115,79], [320,249,189,139,94]]
  };
  for (const s of W.series) {
    assert.equal(s.level, expected[s.id][0]);
    assert.deepEqual(W.resolve('twohand_sword', s.id).values, expected[s.id][1]);
    assert.deepEqual(W.resolve('staff', s.id).values, expected[s.id][2]);
    for (const weapon of W.items) {
      const resolved = W.resolve(weapon.id, s.id);
      assert.equal(resolved.level, s.level);
      assert.equal(resolved.values.length, 5);
      assert.equal(resolved.source, s.source);
      assert.ok(resolved.values.every(v => v === null || Number.isInteger(v) && v > 0));
    }
  }
  assert.deepEqual(W.resolve('lazuli', 'destiny').values, [193,140,null,null,null]);
  assert.equal(W.seriesForLevel(200, 'genesis'), 'genesis');
  assert.equal(W.seriesForLevel(200, 'arcane'), 'arcane');
  assert.equal(W.seriesForLevel(160, 'genesis'), 'absolab');
  assert.equal(W.seriesForLevel(180, 'genesis'), '');
  assert.equal(W.resolve('staff', ''), null);
});

test('INT grade and magic conditions are symmetric with STR grade and attack conditions', () => {
  const opts = { level: 200, weapon: false, boss: true, flame: 'black' };
  const pStr = F.probability({ ...opts, mainStat: 'STR', conds: [{ kind: 'grade', min: 100 }, { kind: 'opt', id: 'ATT', minTier: 6 }] });
  const pInt = F.probability({ ...opts, mainStat: 'INT', conds: [{ kind: 'grade', min: 100 }, { kind: 'opt', id: 'MATT', minTier: 6 }] });
  assert.ok(Math.abs(pStr - pInt) < 1e-10);
  assert.equal(F.gradeWeight(F.BY_ID.STR_INT, false, 'INT'), 1);
  assert.equal(F.gradeWeight(F.BY_ID.STR_DEX, false, 'INT'), 0);
  assert.equal(F.gradeWeight(F.BY_ID.MATT, false, 'INT'), 4);
  assert.equal(F.gradeWeight(F.BY_ID.ATT, false, 'INT'), 0);
  assert.equal(F.gradeWeight(F.BY_ID.MATT, true, 'INT'), 0);
});

test('required attack and all-stat must both occur, and grade is not counted twice', () => {
  const opts = { level:200, weapon:false, boss:true, flame:'black', mainStat:'STR' };
  const required = [{ kind:'opt', id:'ATT', minTier:6 }, { kind:'opt', id:'ALL_PCT', minTier:6 }];
  const exact = (4 * 3 / (19 * 18)) * .26 ** 2;
  const p = min => F.probability({ ...opts, conds:[...required, {kind:'grade', min}] });
  assert.ok(Math.abs(p(80) - exact) < 1e-12); // ATT >=24 points + all-stat >=60 points already suffices.
  assert.ok(p(100) > 0 && p(100) < exact); // Needs additional stats: not a second copy of ATT/all-stat.
});
