'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const soul = require('../soul_core.js');
const { calculate, withinAttempts } = require('../potential_plan.js');

test('amplification guarantees the attempt after the gauge fills', () => {
  for (const [index, fillsAt] of [25, 33, 43, 50].entries()) {
    const step = soul.amplification[index];
    const justBeforeFull = fillsAt - 1;
    assert(soul.nextChance(step, justBeforeFull) < 1);
    assert.equal(soul.nextChance(step, fillsAt), 1);
    assert.equal(soul.progressStats([step], justBeforeFull, 2).within, 1);
    assert.equal(soul.progressStats([step], fillsAt, 1).cost, step.cost);
  }
  const first = soul.amplification[0];
  assert(Math.abs(soul.progressStats([first], 0, 2).within - .107) < 1e-12);
  assert.equal(soul.progressStats(soul.amplification, 0, 3).within, 0);
});

test('progress compares total attempts and meso separately when steps have different prices', () => {
  const steps = [{ chance: .5, cap: 2, cost: 5 }, { chance: .5, cap: 2, cost: 10 }];
  const result = soul.progressStats(steps, 0, 3, 20);
  assert.equal(result.within, .75);
  assert.equal(result.withinMeso, .5);
  assert.equal(soul.progressStats(steps, 0, 3, 19).withinMeso, .25);
  assert.equal(soul.progressStats(steps, 0, 4, 30).withinMeso, 1);
  assert.equal(soul.progressStats(steps, 1, 2, 15).withinMeso, .5);
});

test('grade-up resets its counter and charges the grade before each reset', () => {
  const config = { startStage: 1, targetStage: 1, startRank: 1, targetRank: 3,
    ampFailures: 0, rankFailures: 99 };
  const state = soul.startSimulation(config);
  soul.simulateAttempt(state, config, () => .99);
  assert.equal(state.rank, 2);
  assert.equal(state.rankFailures, 0);
  assert.equal(state.meso, 20_000_000);
  const sample = [.99, .01, .02, .03];
  soul.simulateAttempt(state, config, () => sample.shift());
  assert.equal(state.rank, 2);
  assert.equal(state.rankFailures, 1);
  assert.equal(state.meso, 60_000_000);
  assert.deepEqual(state.gradeAttempts, [1, 1, 0]);
  assert.equal(state.optionAttempts, 0);
});

test('miracle time uses the published chances and retains the remaining guarantee', () => {
  const steps = soul.gradeSteps(true);
  assert.deepEqual(steps.map(step => step.chance), [.03, .011751, .006645]);
  assert.deepEqual(soul.gradeSteps(false).map(step => step.chance), [.015, .005875, .003322]);
  assert.equal(soul.progressStats([steps[1]], 255, 1).cost, 40_000_000);
  assert.equal(soul.progressStats([steps[1]], 255, 1).within, 1);
  assert.equal(soul.nextChance(steps[2], 1), .006645);
});

test('all 16 source tables normalize and keep option probabilities across amplification', () => {
  for (let rank = 1; rank <= 4; rank++) {
    const firstStage = soul.optionTables(rank, 1);
    for (let stage = 1; stage <= 4; stage++) {
      soul.optionTables(rank, stage).forEach((line, index) => {
        assert(Math.abs(line.reduce((sum, option) => sum + option.p, 0) - 1) < 1e-12);
        assert.deepEqual(line.map(option => option.p), firstStage[index].map(option => option.p));
      });
    }
  }
  const first = soul.optionTables(4, 1)[0].find(option => option.key === '공격력 %');
  const fourth = soul.optionTables(4, 4)[0].find(option => option.key === '공격력 %');
  assert.deepEqual([first.value, fourth.value], [2, 8]);
  assert.equal(soul.optionTables(1, 4)[1].filter(option => option.name === '이동속도 +4').length, 1);
});

test('option averages exclude the immediately previous three-line outcome', () => {
  const target = { key: '공격력 %', value: 3, p: .25 };
  const miss = { key: '기타', value: 1, p: .75 };
  const side = [{ ...miss, p: 1 }];
  const result = soul.optionStats([[target, miss], side, side], { key: target.key, lines: 1, total: 3 }, 2);
  assert.equal(result.chance, .25);
  assert.equal(result.expected, 1.75);
  assert.equal(result.withinUpper, 1);
  assert(Math.abs(result.within - .4375) < 1e-12);
});

test('option alternatives count overlapping successes once and require every option in a group', () => {
  const attack = { key: '공격력 %', value: 4, p: .5 };
  const boss = { key: '보스 몬스터 데미지 %', value: 6, p: .5 };
  const lines = [[attack, boss], [attack, boss], [attack, boss]];
  const attackTwice = { key: attack.key, lines: 2, total: 8 };
  const bossOnce = { key: boss.key, lines: 1, total: 6 };
  const combined = soul.optionStats(lines, [[attackTwice, bossOnce]], 1);
  assert.equal(combined.chance, .375);
  assert.equal(combined.attempts50, 2);
  assert.equal(combined.attempts90, 5);
  const union = soul.optionStats(lines, [[attackTwice, bossOnce], [attackTwice]], 1);
  assert.equal(union.chance, .5);
  assert.equal(union.attempts50, 1);
  assert.equal(union.attempts90, 4);
  assert.equal(soul.optionStats(lines, [[attackTwice, { ...bossOnce, lines: 2 }]], 1).chance, 0);
});

test('simulation unlocks rare, consumes ether in order and stops on a matching roll', () => {
  const config = { startStage: 0, targetStage: 4, startRank: 0, targetRank: 1,
    ampFailures: 25, rankFailures: 0, lastEligibleRank: 1,
    goal: { key: 'STR', lines: 1, total: 8 } };
  const state = soul.startSimulation(config);
  for (let i = 0; i < 4; i++) soul.simulateAttempt(state, config, () => 0);
  assert.equal(soul.simulationPhase(state, config), 'done');
  assert.equal(state.rank, 1);
  assert.equal(state.stage, 4);
  assert.equal(state.meso, 6_000_000_000);
  assert.deepEqual(state.ether, [1, 1, 1, 1]);
  soul.simulateAttempt(state, config, () => 0);
  assert.equal(state.attempts, 4);
});

test('simulation spending percentile uses remaining attempts and charges each grade before upgrading', () => {
  const config = { startStage: 1, targetStage: 2, startRank: 1, targetRank: 2,
    ampFailures: 32, rankFailures: 99 };
  const { steps, phases } = soul.simulationCostPlan(config);
  const plan = calculate(steps, phases, { budgets: false });
  assert.equal(plan.withinCost(1_019_999_999), 0);
  assert.ok(Math.abs(plan.withinCost(1_020_000_000) - .222) < 1e-12);
  assert.equal(plan.withinCost(2_020_000_000), 1);
});

test('the simulator and its spending percentile both use Miracle Time grade rates', () => {
  const normal = { startStage: 1, targetStage: 1, startRank: 1, targetRank: 2,
    ampFailures: 0, rankFailures: 0 };
  const event = { ...normal, miracle: true };
  for (const [config, nextRank, chance] of [[normal, 1, .015], [event, 2, .03]]) {
    const state = soul.startSimulation(config);
    soul.simulateAttempt(state, config, () => .02);
    assert.equal(state.rank, nextRank);
    assert.equal(state.meso, 20_000_000);
    const { steps, phases } = soul.simulationCostPlan(config);
    assert.equal(calculate(steps, phases, { budgets: false }).withinCost(state.meso), chance);
    assert.equal(steps[0].cap, 100);
  }
});

test('simulation spending counts a free option roll on arrival and omits runs that miss the goal', () => {
  const goal = { key: '공격력 %', lines: 1, total: 2 };
  const config = { startStage: 1, targetStage: 1, startRank: 3, targetRank: 4,
    ampFailures: 0, rankFailures: 450, goal, lastEligibleRank: 4 };
  const arrived = soul.simulationCostPlan(config);
  const plan = calculate(arrived.steps, arrived.phases, { budgets: false });
  const upper = calculate(arrived.steps, arrived.upperPhases, { budgets: false });
  const chance = soul.optionStats(soul.optionTables(4, 1), goal, 1).chance;
  assert.equal(plan.withinCost(65_000_000), chance);
  assert.equal(upper.withinCost(65_000_000), chance);
  assert.equal(withinAttempts([], arrived.phases, 0), chance);
  assert.ok(upper.withinCost(153_000_000) >= plan.withinCost(153_000_000));

  const stuck = soul.simulationCostPlan({ ...config, startRank: 1, targetRank: 1,
    rankFailures: 99, lastEligibleRank: 1 });
  assert.equal(calculate(stuck.steps, stuck.phases, { budgets: false }).withinCost(10_000_000_000), 0);

  const optionConfig = { ...config, targetRank: 3 };
  const state = soul.startSimulation(optionConfig);
  soul.simulateAttempt(state, optionConfig, () => 0);
  assert.equal(state.rank, 4);
  assert.equal(state.optionAttempts, 1);
  assert.deepEqual(state.gradeAttempts, [0, 0, 0]);
});

test('simulation finishes on every option in a group or on another complete group', () => {
  const attack = { key: '공격력 %', lines: 1, total: 8 };
  const magic = { key: '마력 %', lines: 1, total: 8 };
  const str = { key: 'STR %', lines: 1, total: 8 };
  const goal = [[attack, magic], [str]];
  const config = { startStage: 4, targetStage: 4, startRank: 4, targetRank: 4,
    ampFailures: 0, rankFailures: 0, goal, lastEligibleRank: 4 };
  const state = soul.startSimulation(config);
  state.options = [{ key: attack.key, value: 8 }];
  assert.equal(soul.simulationPhase(state, config), 'option');
  state.options.push({ key: magic.key, value: 8 });
  assert.equal(soul.simulationPhase(state, config), 'done');
  state.options = [{ key: str.key, value: 8 }];
  assert.equal(soul.simulationPhase(state, config), 'done');

  const { steps, phases } = soul.simulationCostPlan(config);
  const stats = soul.optionStats(soul.optionTables(4, 4), goal, 1);
  assert.ok(Math.abs(calculate(steps, phases, { budgets: false }).withinCost(88_000_000) - stats.chance) < 1e-12);
});
