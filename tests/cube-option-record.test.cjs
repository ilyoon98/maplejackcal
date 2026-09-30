const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../cube_core.js'), 'utf8'), context);
const record = context.cubeOptionRecord;

test('메소로 횟수를 역산하고 성공까지의 누적 확률로 순위를 계산한다', () => {
  const result = record(450000000, 45000000, .1);
  assert.equal(result.attempts, 10);
  assert.equal(result.remainder, 0);
  assert.ok(Math.abs(result.percent - 65.13215599) < 1e-8);
  assert.equal(record(800000, 800000, .01).percent, 1);
});

test('나머지 메소는 시도로 세지 않고 1회 미만에는 순위를 표시하지 않는다', () => {
  assert.equal(record(450000001, 45000000, .1).remainder, 1);
  assert.equal(record(89999999, 45000000, .1).attempts, 1);
  for (const actual of [0, 44999999]) assert.equal(record(actual, 45000000, .1).percent, null);
});

test('확정 성공과 극소 확률도 안정적으로 계산한다', () => {
  assert.equal(record(100, 100, 1).percent, 100);
  assert.ok(record(100, 100, 1e-20).percent > 0);
  assert.equal(record(Number.MAX_SAFE_INTEGER, 1, .5).percent, 100);
});

test('불가능한 옵션, 무료 재설정, 잘못된 입력은 역산하지 않는다', () => {
  for (const p of [0, -1, 1.1, NaN, Infinity]) assert.equal(record(100, 1, p), null);
  for (const price of [0, -1, NaN, Infinity]) assert.equal(record(100, price, .1), null);
  for (const actual of [-1, .5, NaN, Infinity, 1e20]) assert.equal(record(actual, 1, .1), null);
});
