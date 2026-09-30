// Run with: node --test tests/boss-income.test.cjs
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../boss_income_calc.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function fakeElement(){
  return {
    addEventListener(){}, classList:{toggle(){}}, focus(){}, click(){},
    textContent:'', innerHTML:'', className:'', value:'', disabled:false,
  };
}
const context = {
  MapleBossDB: require('../boss_db.js'),
  document: {getElementById: () => fakeElement()},
  localStorage: {getItem: () => null, setItem(){}, removeItem(){}},
  NexonKey: {has:() => false, get:() => '', STORAGE_KEY:'nxopen_api_key'},
  window: {addEventListener(){}},
};
vm.createContext(context);
vm.runInContext(script.replace(/  renderAll\(\);\s*\}\)\(\);\s*$/, `
  globalThis.engine = {normalizeCharacter, charTotals, applyPreset, parseSchedulerBosses, trueFlag, describeApiError, BOSS_DATA, validParty, escapeHtml, characterBossIcon, weeklyCompletionHtml,
    partyControlsHtml, characterWeeklyIncomeHtml, allWeeklyComplete,
    changeDifficulty(ch, name, diff) {
      var original = renderAll;
      renderAll = function(){};
      try { toggleDiff(ch, name, diff); } finally { renderAll = original; }
    },
    generatedName(names) {
      var original = characters;
      characters = names.map(function(name){ return {name:name}; });
      try { return nextCharacterName(); } finally { characters = original; }
    }
  };
})();`), context);
const {normalizeCharacter, charTotals, applyPreset, parseSchedulerBosses, trueFlag, describeApiError, BOSS_DATA, validParty, escapeHtml} = context.engine;

test('ALL CLEAR에서는 완료 수익만 표시하고 완료 취소 시 완료/예상 표시로 돌아간다', () => {
  const ch = {name:'테스트', bosses:{}};
  applyPreset(ch);
  Object.values(ch.bosses).forEach(entry => { entry.complete = true; });
  const full = context.engine.characterWeeklyIncomeHtml(charTotals(ch));
  assert.match(full, /주간 완료 수익/);
  assert.match(full, /weekly-values is-complete/);
  ch.bosses['스우'].complete = false;
  const partial = context.engine.characterWeeklyIncomeHtml(charTotals(ch));
  assert.match(partial, /주간 완료 \/ 예상/);
  assert.doesNotMatch(partial, /is-complete/);
});

test('전체 합계 완료 판정은 등록된 주간 보스 수를 기준으로 하며 빈 목록은 제외한다', () => {
  assert.equal(context.engine.allWeeklyComplete(0, 0), false);
  assert.equal(context.engine.allWeeklyComplete(11, 12), false);
  assert.equal(context.engine.allWeeklyComplete(12, 12), true);
  assert.equal(context.engine.allWeeklyComplete(20, 20), true);
  assert.equal(context.engine.allWeeklyComplete(19, 20), false);
});

test('캐릭터 카드의 보스 아이콘은 완료 상태와 난이도를 함께 표시한다', () => {
  const boss = BOSS_DATA.find(b => b.name === '검은 마법사');
  const completed = context.engine.characterBossIcon(boss, {diffIdx:0, complete:true});
  assert.match(completed, /is-complete/);
  assert.match(completed, /class="chip-complete"[^>]*>완료/);
  assert.match(completed, /aria-label="검은 마법사 · .* · 완료"/);
  assert.match(completed, /difficulty-mark/);
  const pending = context.engine.characterBossIcon(boss, {diffIdx:0, complete:false});
  assert.doesNotMatch(pending, /chip-complete|is-complete/);
  assert.match(pending, /aria-label="검은 마법사 · .* · 미완료"/);
});

test('난이도를 바꿔도 완료 상태와 파티 인원이 유지된다', () => {
  const ch = normalizeCharacter({name:'테스트', bosses:{'스우':{diffIdx:1, party:3, complete:true}}});
  context.engine.changeDifficulty(ch, '스우', 2);
  assert.equal(ch.bosses['스우'].diffIdx, 2);
  assert.equal(ch.bosses['스우'].complete, true);
  assert.equal(ch.bosses['스우'].party, 3);
  ch.bosses['스우'].complete = false;
  context.engine.changeDifficulty(ch, '스우', 1);
  assert.equal(ch.bosses['스우'].complete, false);
});

test('닉네임 없이 추가할 이름은 기존 이름과 겹치지 않는다', () => {
  assert.equal(context.engine.generatedName([]), '캐릭터 1');
  assert.equal(context.engine.generatedName(['캐릭터 1','캐릭터 3']), '캐릭터 2');
});

test('3인 보스는 직접 입력·저장 복원·수익 계산·인원 목록에 최대 3인을 적용한다', () => {
  for (const name of ['림보','벨로나','발드릭스','유피테르','찬란한 흉성','최초의 대적자']) {
    assert.equal(validParty(6, name), 3);
    assert.equal(validParty(2, name), 2);
    const character = normalizeCharacter({name:'테스트', bosses:{[name]:{diffIdx:0, party:6}}});
    assert.equal(character.bosses[name].party, 3);
    const boss = BOSS_DATA.find(b => b.name === name);
    assert.equal(charTotals({bosses:{[name]:{diffIdx:0, party:6}}}).weeklyMeso, Math.floor(boss.diffs[0].price / 3));
    const controls = context.engine.partyControlsHtml(name, 6);
    assert.match(controls, /value="3" selected/);
    assert.doesNotMatch(controls, /option value="[456]"/);
  }
  assert.equal(validParty(6, '카링'), 6);
  assert.match(context.engine.partyControlsHtml('카링', 6), /value="6" selected/);
});

test('익스트림 스우는 2인 제한이며 난이도 변경 시 인원만 보정하고 완료는 유지한다', () => {
  const boss = BOSS_DATA.find(b => b.name === '스우');
  const extreme = boss.diffs.findIndex(d => d.label === '익스트림');
  const hard = boss.diffs.findIndex(d => d.label === '하드');
  const ch = normalizeCharacter({name:'테스트', bosses:{'스우':{diffIdx:hard, party:6, complete:true}}});
  context.engine.changeDifficulty(ch, '스우', extreme);
  assert.equal(ch.bosses['스우'].party, 2);
  assert.equal(ch.bosses['스우'].complete, true);
  assert.equal(charTotals(ch).earnedMeso, 545000000 / 2);
  const restored = normalizeCharacter({bosses:{'스우':{diffIdx:extreme, party:6}}});
  assert.equal(restored.bosses['스우'].party, 2);
  const controls = context.engine.partyControlsHtml('스우', 6, extreme);
  assert.match(controls, /value="2" selected/);
  assert.doesNotMatch(controls, /option value="[3456]"/);
  const blackMage = BOSS_DATA.find(b => b.name === '검은 마법사');
  assert.equal(validParty(6, blackMage.name, blackMage.diffs.findIndex(d => d.label === '익스트림')), 6);
});

test('통합 DB의 47개 결정석 가격은 계산기 가격과 일치하며 원본 메타데이터를 제공한다', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../boss_db.json'), 'utf8'));
  assert.deepEqual(require('../boss_db.js'), data);
  let matched = 0;
  for (const boss of BOSS_DATA) {
    for (const diff of boss.diffs) {
      if (!diff.details) continue;
      assert.equal(diff.details.CrystalPrice, diff.price);
      assert.equal(diff.maxParty, diff.details.RestrictionPersonnel);
      assert.ok(diff.details.TotalHP);
      matched++;
    }
  }
  assert.equal(matched, 47);
});

test('첨부 DB 별칭을 스케줄러 보스 이름으로 연결한다', () => {
  const parsed = parseSchedulerBosses({boss_contents:[{
    content_name:'진힐라', difficulty:'hard', cycle:'bossWeekly', registration_flag:true,
  }]});
  assert.ok(parsed.bosses['진 힐라']);
});

test('주간 보스 12마리를 완료해야 ALL CLEAR가 표시되며 검마는 제외한다', () => {
  const ch = {name:'테스트', bosses:{'검은 마법사':{diffIdx:1, party:1, complete:true}}};
  applyPreset(ch);
  Object.values(ch.bosses).forEach(entry => { entry.complete = true; });
  const full = charTotals(ch);
  assert.equal(full.weeklyCompletedCount, 12);
  assert.match(context.engine.weeklyCompletionHtml(full), /ALL CLEAR/);
  ch.bosses['스우'].complete = false;
  const partial = charTotals(ch);
  assert.equal(partial.completedCount, 12);
  assert.equal(partial.weeklyCompletedCount, 11);
  assert.doesNotMatch(context.engine.weeklyCompletionHtml(partial), /ALL CLEAR/);
});

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

test('스케줄러 응답은 등록된 주간·월간 보스와 완료 상태만 가져온다', () => {
  const result = parseSchedulerBosses({boss_contents:[
    {content_name:'스우', difficulty:'hard', cycle:'bossWeekly', registration_flag:'true', complete_flag:'TRUE'},
    {content_name:'검은 마법사', difficulty:'hard', cycle:'bossMonthly', registration_flag:true, complete_flag:false},
    {content_name:'반반', difficulty:'normal', cycle:'bossDaily', registration_flag:'true', complete_flag:'true'},
    {content_name:'데미안', difficulty:'hard', cycle:'bossWeekly', registration_flag:'false', complete_flag:'false'},
    {content_name:'수익표에 없는 보스', difficulty:'easy', cycle:'bossWeekly', registration_flag:'true', complete_flag:'false'},
  ]});
  assert.deepEqual(Object.keys(result.bosses).sort(), ['검은 마법사', '스우']);
  assert.equal(result.bosses['스우'].complete, true);
  assert.equal(result.bosses['검은 마법사'].complete, false);
  assert.equal(result.skipped.length, 1);
  assert.equal(trueFlag('TRUE'), true);
});

test('완료 수익은 완료된 보스의 파티 분배액만 합산한다', () => {
  const ch = normalizeCharacter({name:'테스트', bosses:{
    '스우':{diffIdx:1, party:2, complete:true, source:'scheduler'},
    '데미안':{diffIdx:0, party:1, complete:false, source:'scheduler'},
  }});
  const totals = charTotals(ch);
  assert.equal(totals.earnedMeso, Math.floor(48900000 / 2));
  assert.equal(totals.completedCount, 1);
  assert.equal(ch.bosses['스우'].source, 'scheduler');
});

test('월간 검은 마법사는 완료 표시와 월간 수익을 유지하되 주간 완료 수익에서 제외한다', () => {
  const parsed = parseSchedulerBosses({boss_contents:[{
    content_name:'검은 마법사', difficulty:'hard', cycle:'bossMonthly',
    registration_flag:true, clear_flag:'TRUE',
  }]});
  const character = normalizeCharacter({name:'월간 테스트', bosses:parsed.bosses});
  const totals = charTotals(character);
  assert.equal(character.bosses['검은 마법사'].complete, true);
  assert.equal(totals.completedCount, 1);
  assert.equal(totals.earnedMeso, 0);
  assert.ok(totals.monthlyMeso > 0);
});

test('주간·월간 보스를 모두 완료해도 주간 완료 수익은 주간 예상 수익을 넘지 않는다', () => {
  const character = normalizeCharacter({name:'혼합 테스트', bosses:{
    '스우':{diffIdx:1, party:2, complete:true},
    '데미안':{diffIdx:0, party:1, complete:false},
    '검은 마법사':{diffIdx:1, party:6, complete:true},
  }});
  const before = charTotals(character);
  assert.equal(before.earnedMeso, Math.floor(48900000 / 2));
  assert.ok(before.earnedMeso < before.weeklyMeso);
  character.bosses['데미안'].complete = true;
  const after = charTotals(character);
  assert.equal(after.earnedMeso, after.weeklyMeso);
  assert.equal(after.completedCount, 3);
  assert.equal(after.monthlyMeso, after.weeklyMeso * 4 + 77500000);
  character.bosses['검은 마법사'].complete = false;
  assert.equal(charTotals(character).earnedMeso, after.earnedMeso);
});

test('완료 필드 호환: clear_flag의 false를 유지하고 없으면 complete_flag를 읽는다', () => {
  for (const [flags, expected] of [
    [{clear_flag:true}, true],
    [{clear_flag:false, complete_flag:true}, false],
    [{clear_flag:'false', complete_flag:'true'}, false],
    [{complete_flag:'true'}, true],
    [{clear_flag:null, complete_flag:true}, true],
    [{}, false],
  ]) {
    const parsed = parseSchedulerBosses({boss_contents:[{
      content_name:'검은 마법사', difficulty:'hard', cycle:'bossMonthly',
      registration_flag:true, ...flags,
    }]});
    assert.equal(parsed.bosses['검은 마법사'].complete, expected);
  }
});

test('스케줄러 권한 오류는 본인 계정과 접속 조건을 안내한다', () => {
  const message = describeApiError({code:'OPENAPI00003', message:'not found'}, 'scheduler');
  assert.match(message, /본인 계정/);
  assert.match(message, /2026년 6월 25일 이후 접속/);
});
