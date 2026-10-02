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
    setAttribute(){}, removeAttribute(){},
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
vm.runInContext(script.replace(/  renderAll\(\);\s*autoRefreshCharacterCompletions\(\);\s*hydrateMissingCharacterProfiles\(\);\s*\}\)\(\);\s*$/, `
  globalThis.engine = {normalizeCharacter, charTotals, applyPreset, parseSchedulerBosses, trueFlag, describeApiError, BOSS_DATA, validParty, escapeHtml, characterBossIcon, weeklyCompletionHtml,
    partyControlsHtml, characterWeeklyIncomeHtml, allWeeklyComplete, apiLinkBadgeHtml, characterProfileHtml, reorderCharacters, normalizeCharacterImage,
    changeDifficulty(ch, name, diff) {
      var original = renderAll;
      renderAll = function(){};
      try { toggleDiff(ch, name, diff); } finally { renderAll = original; }
    }
  };
})();`), context);
const {normalizeCharacter, charTotals, applyPreset, parseSchedulerBosses, trueFlag, describeApiError, BOSS_DATA, validParty, escapeHtml} = context.engine;

test('캐릭터 카드는 외형 썸네일에 월드 아이콘을 겹쳐 표시한다', () => {
  context.window.NexonCharacters = {worldIconPath: world => 'icons/server/' + world + '.webp'};
  const image = 'https://open.api.nexon.com/static/maplestory/character/look/ABC123';
  const character = normalizeCharacter({name:'테스터', characterLevel:290, worldName:'베라', characterClass:'렌', characterImage:image});
  const profile = context.engine.characterProfileHtml(character);
  assert.match(profile, /class="chip-avatar-image"[^>]*src="https:\/\/open\.api\.nexon\.com\/static\/maplestory\/character\/look\/ABC123"/);
  assert.match(profile, /class="chip-world-icon"[^>]*src="icons\/server\/베라\.webp"/);
  assert.match(profile, /chip-avatar[\s\S]*chip-world-icon[\s\S]*chip-name[\s\S]*>테스터<\/button>/);
  assert.match(profile, /Lv\.290 · 렌/);
  assert.doesNotMatch(profile, /Lv\.290 · 베라/);
  assert.match(html, /\.chip-avatar-image\{[^}]*transform:scale\(3\.2\);[^}]*transform-origin:50% 45%/);
  assert.equal(context.engine.normalizeCharacterImage('javascript:alert(1)'), '');
  assert.match(context.engine.characterProfileHtml(normalizeCharacter({name:'직접추가'})), /chip-avatar-fallback/);
});

test('이름 편집은 기존 머리글을 같은 높이의 입력 줄로 교체한다', () => {
  assert.match(script, /<form class="chip-rename" hidden>' \+ characterWorldMarkHtml\(ch\) \+ '<input/);
  assert.match(script, /chip\.classList\.toggle\('is-renaming', true\);\s*renameForm\.hidden = false;/);
  assert.match(script, /renameForm\.hidden = true;\s*chip\.classList\.toggle\('is-renaming', false\);/);
  assert.match(html, /\.char-chip\.is-renaming \.chip-identity,\.char-chip\.is-renaming \.chip-card-actions\{ display:none; \}/);
});

test('캐릭터 카드는 전용 손잡이로 순서를 옮기고 저장한다', () => {
  const characters = [{name:'첫째'}, {name:'둘째'}, {name:'셋째'}];
  const selected = characters[1];
  context.engine.reorderCharacters(characters, 0, 2);
  assert.deepEqual(Array.from(characters, character => character.name), ['둘째', '셋째', '첫째']);
  assert.equal(characters.indexOf(selected), 0);
  context.engine.reorderCharacters(characters, -1, 1);
  assert.deepEqual(Array.from(characters, character => character.name), ['둘째', '셋째', '첫째']);
  assert.match(script, /class="chip-reorder"[^>]*title="드래그하거나 방향키로 순서 변경"/);
  assert.match(html, /\.char-chip\{\s*position:relative;/);
  assert.match(html, /\.chip-reorder\{[\s\S]*?position:absolute;[^}]*left:-15px;[^}]*border-radius:8px 0 0 8px;/);
  assert.match(script, /addEventListener\('pointerdown',[\s\S]*addEventListener\('pointermove',[\s\S]*addEventListener\('pointerup'/);
  assert.match(script, /cloneNode\(true\)[\s\S]*classList\.add\('char-chip-drag-ghost'\)[\s\S]*document\.body\.appendChild\(reorderGhost\)/);
  assert.match(script, /moveReorderGhost\(event\)[\s\S]*document\.elementFromPoint/);
  assert.match(html, /\.char-chip-drag-ghost\{[\s\S]*position:fixed;[\s\S]*box-shadow:/);
  assert.match(script, /ArrowUp[\s\S]*ArrowLeft[\s\S]*ArrowDown[\s\S]*ArrowRight/);
  assert.match(script, /moveCharacter\(idx, idx \+ offset, true\)/);
  assert.match(script, /reorderCharacters\(characters, fromIndex, toIndex\);[\s\S]*saveState\(\);[\s\S]*renderAll\(\);/);
});

test('ALL CLEAR에서는 완료 수익만 표시하고 완료 취소 시 완료/예상 표시로 돌아간다', () => {
  const ch = {name:'테스트', bosses:{}};
  applyPreset(ch);
  Object.values(ch.bosses).forEach(entry => { entry.complete = true; });
  const full = context.engine.characterWeeklyIncomeHtml(charTotals(ch));
  assert.match(full, /chip-weekly is-complete/);
  assert.match(full, /주간 보스<\/span><strong>12\/12/);
  assert.match(full, /완료 <strong>/);
  assert.doesNotMatch(full, /예상 <strong>/);
  ch.bosses['스우'].complete = false;
  const partial = context.engine.characterWeeklyIncomeHtml(charTotals(ch));
  assert.match(partial, /주간 보스<\/span><strong>11\/12/);
  assert.match(partial, /완료 <strong>[\s\S]*예상 <strong>/);
  assert.match(partial, /aria-valuenow="11"/);
  assert.doesNotMatch(partial, /chip-weekly is-complete/);
  assert.match(html, /\.chip-weekly-money\{[^}]*flex-wrap:wrap;[^}]*overflow:visible;/);
  assert.doesNotMatch(html, /\.chip-weekly-money\{[^}]*overflow-x:auto;/);
  assert.doesNotMatch(script, /characterWeeklyIncomeHtml\(t\) \+\s*weeklyCompletionHtml\(t\)/);
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

test('캐릭터 카드는 API 연동 여부를 구분해 표시한다', () => {
  assert.match(context.engine.apiLinkBadgeHtml({ocid:'linked'}), /is-linked[^>]*title="API 연동 · 아직 갱신 전"[^>]*>API 연동/);
  assert.match(context.engine.apiLinkBadgeHtml({ocid:'linked', lastSyncedAt:'2026-10-02T01:23:45.000Z'}), /title="API 연동 · 최근 갱신 [^"]+"/);
  assert.match(context.engine.apiLinkBadgeHtml({ocid:''}), /title="API 없이 저장된 캐릭터"[^>]*>API 미연동/);
  assert.doesNotMatch(html, /class="sync-meta"/);
});

test('전체 API 갱신은 아이콘 버튼을 사용하고 성공 문구를 남기지 않는다', () => {
  assert.match(html, /<div class="character-heading">[\s\S]*?id="schedulerRefreshAllBtn"[\s\S]*?<\/div>/);
  assert.match(html, /id="schedulerRefreshAllBtn"[^>]*aria-label="API 갱신"[^>]*title="API 갱신"/);
  assert.match(html, /id="schedulerRefreshAllBtn"[\s\S]*?<svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(script, /개 캐릭터의 완료 상태를 갱신했습니다/);
  assert.doesNotMatch(html, />전체 완료 상태 새로고침</);
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

test('계산기 진입 시 저장된 스케줄러 캐릭터의 완료 상태를 자동 갱신한다', () => {
  assert.match(script, /renderAll\(\);\s*autoRefreshCharacterCompletions\(\);\s*hydrateMissingCharacterProfiles\(\);\s*\}\)\(\);\s*$/);
  assert.match(script, /function autoRefreshCharacterCompletions\(\)[\s\S]*?if \(!NexonKey\.has\(\)\) return;[\s\S]*?refreshAllCharacterCompletions\(\);/);
});

test('직접 추가 버튼 없이 API 실패 시 연동 없는 캐릭터로 추가한다', () => {
  assert.doesNotMatch(html, /manualCharacterBtn|>직접 추가</);
  assert.match(script, /\.catch\(function\(\)\{\s*var added = addLocalCharacter\(name\);/);
  assert.match(html, /API 조회가 안 되면 연동 없이 추가합니다/);
});

test('카드 이름 확인은 API 성공 때만 기존 카드를 교체한다', () => {
  assert.match(script, /function renameCharacterFromApi\(index, requestedName\)[\s\S]*?fetchSchedulerCharacter\(name, knownOcid\)\.then[\s\S]*?applySchedulerCharacter\(result\.data, result\.ocid, name, index\)/);
  assert.match(script, /renameCharacterFromApi\(idx, nextName\)\.then[\s\S]*?\.catch\(function\(error\)[\s\S]*?이름을 변경하지 않았습니다/);
});
