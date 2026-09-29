const { test } = require('node:test');
const assert = require('node:assert/strict');
const { solve, evaluate } = require('../calc.js');

function near(actual, expected, tolerance = 1e-4) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
}

test('100% 작에는 초기화와 순백이 필요하지 않다', () => {
  const result = solve({ totalJak: 7, prob: 1, cost: 100, resetCost: 12000, protectCost: 20000, useReset: true });
  near(result.totalAttempts, 7);
  near(result.totalResets, 0);
  near(result.totalProtects, 0);
});

test('초기화가 없으면 모든 실패를 순백으로 복구한다', () => {
  const result = solve({ totalJak: 7, prob: 0.3, cost: 100, resetCost: 12000, protectCost: 20000, useReset: false });
  near(result.totalAttempts, 7 / 0.3);
  near(result.totalResets, 0);
  near(result.totalProtects, 7 * 0.7 / 0.3);
});

test('한 칸 작에서 저렴한 이노센트는 실패마다 한 번 필요하다', () => {
  const result = solve({ totalJak: 1, prob: 0.3, cost: 100, resetCost: 10, protectCost: 20000, useReset: true });
  near(result.totalAttempts, 1 / 0.3);
  near(result.totalResets, 0.7 / 0.3);
  near(result.totalProtects, 0);
});

test('도구별 사용 횟수로 총비용을 재구성하고 반값 및 조달 비용을 반영한다', () => {
  const params = { totalJak: 7, prob: 0.3, cost: 1000, resetCost: 12000, protectCost: 20000, useReset: true };
  const result = solve(params);
  assert.ok(result.totalResets > 0);
  assert.ok(result.totalProtects > 0);
  near(result.totalTraces, result.totalAttempts * params.cost + result.totalResets * params.resetCost + result.totalProtects * params.protectCost, 0.1);
  const half = solve({ ...params, cost: 500, resetCost: 6000, protectCost: 10000 });
  near(half.totalResets, result.totalResets);
  near(half.totalProtects, result.totalProtects);
  const unfunded = evaluate({ ...params, resetCost: 0, protectCost: 0 }, result.ACT);
  near(unfunded.totalTraces, result.totalAttempts * params.cost, 0.1);
});
