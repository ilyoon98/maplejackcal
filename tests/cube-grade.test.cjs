const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'cube_core.js'), 'utf8'), context);
const grades = vm.runInContext('CUBE_GRADE', context);

test('에디셔널 큐브와 메소 재설정은 공식 보장 횟수를 각각 적용한다', () => {
  assert.deepEqual(Array.from(grades.addWhite.cap), [31, 76, 214]);
  assert.deepEqual(Array.from(grades.addReset.cap), [62, 152, 214]);
  for (const key of ['addWhite', 'addReset']) for (const multiplier of [1, 2]) {
    for (let i = 0; i < 3; i++) {
      const p = grades[key].p[i] * multiplier, cap = grades[key].cap[i];
      // Enumerate the success-at-k distribution, including forced success at the cap.
      let expected = 0, mass = 0;
      for (let k = 1; k <= cap; k++) {
        const probability = (1 - p) ** (k - 1) * (k === cap ? 1 : p);
        expected += k * probability;
        mass += probability;
      }
      assert.ok(Math.abs(mass - 1) < 1e-12);
      assert.ok(Math.abs(context.cubeExpected(p, cap) - expected) < 1e-10);
      assert.equal(context.successCdf(cap, p, cap), 1);
      assert.ok(context.successCdf(cap - 1, p, cap) < 1);
    }
  }
});
