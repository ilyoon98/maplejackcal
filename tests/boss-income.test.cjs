// Run with: node --test tests/boss-income.test.cjs
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../boss_income_calc.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const context = {
  document: {getElementById: () => ({addEventListener(){}})},
  localStorage: {getItem: () => null},
};
vm.createContext(context);
vm.runInContext(script.replace(/  renderAll\(\);\s*\}\)\(\);\s*$/, `
  globalThis.engine = {normalizeCharacter, charTotals, applyPreset, BOSS_DATA, validParty, escapeHtml};
})();`), context);
const {normalizeCharacter, charTotals, applyPreset, BOSS_DATA, validParty, escapeHtml} = context.engine;

test('검밑솔 12개 수익은 비교 사이트의 주간/월간 합계와 일치한다', () => {
  const ch = {name:'테스트', bosses:{}};
  applyPreset(ch);
  const t = charTotals(ch);
  assert.equal(t.weeklyCount, 12);
  assert.equal(t.weeklyMeso, 574940000);
  assert.equal(t.monthlyMeso, 2299760000);
});

test('프리셋은 월간 보스의 난이도와 인원을 유지하고 월간 보상은 한 번만 더한다', () => {
  const ch = {name:'테스트', bosses:{'검은 마법사':{diffIdx:1, party:6}}};
  applyPreset(ch);
  const t = charTotals(ch);
  assert.equal(t.totalCount, 13);
  assert.equal(t.weeklyCount, 12);
  assert.equal(t.monthlyMeso, 2299760000 + 77500000);
  assert.equal(ch.bosses['검은 마법사'].party, 6);
});

test('잘못된 저장 데이터와 인원은 유효한 값으로 복원한다', () => {
  const ch = normalizeCharacter({name:'테스트', bosses:{
    '스우':{diffIdx:99, party:1},
    '데미안':{diffIdx:0, party:-5},
    '윌':{diffIdx:0, party:Infinity},
    '없는 보스':{diffIdx:0, party:1},
    'toString':{diffIdx:0, party:1},
  }});
  assert.equal(Object.keys(ch.bosses).length, 2);
  assert.equal(ch.bosses['데미안'].party, 1);
  assert.equal(ch.bosses['윌'].party, 1);
  assert.equal(validParty(1000), 99);
  assert.equal(validParty(2.7), 3);
  assert.equal(Object.keys(normalizeCharacter({bosses:[{bossIdx:0, diffIdx:500}]}).bosses).length, 0);
});

test('복원 시 주간 상한 12개를 지키되 월간 보스는 별도로 유지한다', () => {
  const bosses = Object.fromEntries(BOSS_DATA.map(b => [b.name, {diffIdx:0, party:1}]));
  const ch = normalizeCharacter({name:'테스트', bosses});
  assert.equal(charTotals(ch).weeklyCount, 12);
  assert.equal(charTotals(ch).totalCount, 13);
});

test('파티 수익은 보스마다 1메소 미만을 버려 행별 수익과 합계가 일치한다', () => {
  const ch = {bosses:{'매그너스':{diffIdx:0, party:3}, '벨룸':{diffIdx:0, party:3}}};
  assert.equal(charTotals(ch).weeklyMeso, Math.floor(4280000/3) + Math.floor(4640000/3));
});

test('사용자 이름의 HTML이 실행 가능한 태그로 삽입되지 않는다', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
