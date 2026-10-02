const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../authentic_symbol_calc.html'), 'utf8');

test('어센틱 심볼 검색은 기본 정보도 조회해 큰 캐릭터 프로필을 표시한다', () => {
  assert.match(html, /id="characterShowcase"[\s\S]*?id="characterShowcaseImage"/);
  assert.match(html, /\.character-showcase img[\s\S]*?transform:scale\(2\.35\)/);
  assert.match(html, /apiGet\('\/character\/symbol-equipment',[\s\S]*?apiGet\('\/character\/basic'/);
  assert.match(html, /saveCharacterProfile\(profile\)/);
});

test('저장 프로필은 넥슨 공식 캐릭터 이미지 주소만 허용하고 다시 복원한다', () => {
  assert.match(html, /open\\\.api\\\.nexon\\\.com\\\/static\\\/maplestory\\\/character\\\/look/);
  assert.match(html, /var LS_CHARACTER_PROFILE = 'authentic_character_profile'/);
  assert.match(html, /restoreCharacterProfile\(\);[\s\S]*?renderRecent\(\);/);
});

test('좁은 화면에서는 큰 캐릭터 프로필이 검색 영역 아래로 내려간다', () => {
  assert.match(html, /@media \(max-width:760px\)[\s\S]*?\.char-search-hero\.has-profile\{ grid-template-columns:minmax\(0,1fr\); \}/);
});
