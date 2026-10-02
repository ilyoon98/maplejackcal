const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../boss_buff_planner.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../boss_buff_planner.js'), 'utf8');

test('보스 버프 동선 계산기는 어센틱 계산기 크기의 캐릭터 쇼케이스를 표시한다', () => {
  assert.match(html, /id="buffCharacterShowcase"[\s\S]*?id="buffCharacterShowcaseImage"/);
  assert.match(html, /\.buff-character-showcase img[\s\S]*?transform:scale\(2\.35\)/);
  assert.match(js, /apiGet\('\/scheduler\/character-state',[\s\S]*?apiGet\('\/character\/basic'/);
});

test('캐릭터 외형은 신뢰한 넥슨 정적 이미지 주소만 저장하고 프로필 전환에 따라 바뀐다', () => {
  assert.match(js, /open\\\.api\\\.nexon\\\.com\\\/static\\\/maplestory\\\/character\\\/look/);
  assert.match(js, /if \(characterProfile\) p\.character = normalizeCharacterProfile/);
  assert.match(js, /renderCharacterProfile\(p\.character\)/);
});
