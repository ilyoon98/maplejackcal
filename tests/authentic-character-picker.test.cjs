const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('authentic_symbol_calc.html', 'utf8');

test('계정 캐릭터 선택은 검색 버튼 없이 즉시 조회한다', () => {
  assert.match(html, /id="fetchBtn" hidden>캐릭터 검색<\/button>/);
  assert.match(html, /NexonCharacters\.mount\(\{[\s\S]*?onSelect:\s*function\(\)\{ doFetch\(\); \}/);
});

test('직접 검색 모드에서만 캐릭터 검색 버튼을 표시한다', () => {
  assert.match(html, /onModeChange:\s*function\(manual\)\{ fetchBtn\.hidden = !manual; \}/);
  assert.match(html, /else \{\s*charNameInput\.hidden = false;\s*fetchBtn\.hidden = false;/);
});

test('최근 검색은 기존 순서를 고정하고 신규 캐릭터만 오른쪽에 추가한다', () => {
  assert.match(html, /var exists = list\.some\([\s\S]*?toLowerCase\(\) === name\.toLowerCase\(\)/);
  assert.match(html, /if \(!exists\) \{\s*list\.push\(name\);\s*list = list\.slice\(-RECENT_MAX\);/);
  assert.doesNotMatch(html, /list\.unshift\(name\)/);
});
