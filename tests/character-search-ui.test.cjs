const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('어센틱·보스 버프 검색 영역은 같은 제목·입력 행·배지 스타일을 쓴다', () => {
  for (const file of ['authentic_symbol_calc.html', 'boss_buff_planner.html']) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /<section class="[^"]*nx-character-search-panel/);
    assert.match(html, /<h2>캐릭터 검색<\/h2>/);
    assert.match(html, /<div class="nx-character-search-row">/);
    assert.match(html, /class="fetch-btn" id="fetchBtn" hidden>캐릭터 검색<\/button>/);
    assert.doesNotMatch(html, /#buffCharacterPicker \.nx-character-fields/);
  }
  const planner = fs.readFileSync('boss_buff_planner.js', 'utf8');
  const authentic = fs.readFileSync('authentic_symbol_calc.html', 'utf8');
  for (const source of [planner, authentic]) {
    assert.match(source, /nx-character-recents/);
    assert.match(source, /nx-character-chip-name/);
    assert.match(source, /nx-character-chip-x/);
  }
  assert.doesNotMatch(planner, /placeFetchBtn|fields\.appendChild\(fetchBtn\)/);
});
