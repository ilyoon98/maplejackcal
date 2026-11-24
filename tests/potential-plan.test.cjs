const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate, withinAttempts } = require('../potential_plan.js');
const SoulCore = require('../soul_core.js');

test('a successful grade-up can satisfy the option goal on the same paid roll', () => {
  const result = calculate([{ chance: 1, cap: 1, cost: 20 }], [{ chance: .5, arrivalChance: .5, cost: 50 }]);
  assert.equal(result.expected, 70);
  assert.equal(result.budget50, 20);
  assert.equal(result.budget90, 170);
  assert.equal(result.optionAttempts, 1);
});

test('the cost percentiles combine amplifier and grade stages with different prices', () => {
  const steps = [{ chance: .5, cap: 2, cost: 10 }, { chance: .5, cap: 2, cost: 21 }];
  const result = calculate(steps);
  assert.equal(result.expected, 46.5);
  assert.equal(result.budget50, 41);
  assert.equal(result.budget90, 62);
  assert.equal(result.withinCost(41), .5);
  assert.equal(withinAttempts(steps, [], 3), .75);
});

test('option hunting can end before or during a further grade-up with unrelated price grids', () => {
  const result = calculate([{ chance: 1, cap: 1, cost: 800_001 }], [
    { chance: .5, arrivalChance: .1, cost: 93_000_000, upgrade: { chance: 0, cap: 2 } },
    { chance: 1, arrivalChance: .5, cost: 70_000_000 }
  ]);
  assert.equal(result.budget50, 93_800_001);
  assert.equal(result.budget90, 256_800_001);
  assert.ok(Math.abs(result.expected - (800_001 + .9 * 1.5 * 93_000_000 + .9 * .5 * .5 * 70_000_000)) < 1e-6);
});

test('zero meso can still require items, and an impossible final option cannot give a budget', () => {
  const free = calculate([{ chance: .2, cap: 3, cost: 0 }], [{ chance: .25, cost: 0 }]);
  assert.equal(free.expected, 0);
  assert.equal(free.optionAttempts, 4);
  assert.equal(free.budget50, 0);
  assert.equal(free.budget90, 0);
  const blocked = calculate([], [{ chance: 0, cost: 1 }]);
  assert.equal(blocked.expected, Infinity);
  assert.equal(blocked.budget90, Infinity);
  const half = calculate([], [{ chance: 0, arrivalChance: .5, cost: 1 }]);
  assert.equal(half.budget50, 0);
  assert.equal(half.budget90, Infinity);
});

test('soul amplification and grading match standalone expectations and miracle rates', () => {
  const standardSteps = [...SoulCore.amplification, ...SoulCore.gradeSteps(false)];
  const combined = calculate(standardSteps);
  assert.equal(combined.expected, SoulCore.progressStats(standardSteps, 0, 0).cost);
  assert.ok(combined.budget90 > combined.budget50);
  for (const [budget, target] of [[combined.budget50, .5], [combined.budget90, .9]]) {
    assert.ok(SoulCore.progressStats(standardSteps, 0, 0, budget).withinMeso >= target);
    assert.ok(SoulCore.progressStats(standardSteps, 0, 0, budget - 1).withinMeso < target);
  }
  const miracle = calculate([...SoulCore.amplification, ...SoulCore.gradeSteps(true)]);
  assert.ok(miracle.expected < combined.expected);
  assert.ok(miracle.budget90 < combined.budget90);
});

test('custom ether prices enter the exact mean and allow conservative budgets on a bounded grid', () => {
  const steps = [{ chance: .5, cap: 2, cost: 550_000_003 }, { chance: .5, cap: 2, cost: 1_040_000_001 }];
  const priced = SoulCore.budgetPricing(steps, []);
  assert.equal(priced.increment, 5_000_000);
  const result = calculate(priced.steps, priced.phases);
  assert.equal(result.expected, (steps[0].cost + steps[1].cost) * 1.5);
  assert.equal(result.budget50, 2_155_000_000);
  assert.equal(result.budget90, 3_200_000_000);
  assert.equal(SoulCore.progressStats(steps, 0, 3, steps[0].cost * 2 + steps[1].cost).withinMeso, .5);
});
