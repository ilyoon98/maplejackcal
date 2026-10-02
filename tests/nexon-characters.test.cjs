const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('nexon_characters.js', 'utf8');
const css = fs.readFileSync('nexon_characters.css', 'utf8');
const context = { globalThis: {}, Number, String, Object, Array };
context.globalThis = context;
vm.runInNewContext(code, context);
const C = context.NexonCharacters;

const payload = {
  account_list: [
    { account_id: 'a', character_list: [
      { ocid:'1', character_name:'루나부캐', world_name:'루나', character_class:'아델', character_level:270 },
      { ocid:'2', character_name:'스카메인', world_name:'스카니아', character_class:'비숍', character_level:285 },
      { ocid:'3', character_name:'저렙', world_name:'스카니아', character_class:'초보자', character_level:259 }
    ]},
    { account_id: 'b', character_list: [
      { ocid:'4', character_name:'스카부캐', world_name:'스카니아', character_class:'은월', character_level:261 }
    ]}
  ]
};

test('여러 메이플 계정의 캐릭터를 합쳐 레벨순으로 정규화한다', () => {
  const list = C.normalize(payload);
  assert.deepEqual(Array.from(list, x => x.name), ['스카메인','루나부캐','스카부캐','저렙']);
  assert.equal(list[3].accountId, 'a');
});

test('260 이상 캐릭터가 있는 서버만 최고 레벨 순으로 노출한다', () => {
  const list = C.normalize(payload);
  assert.deepEqual(Array.from(C.worlds(list, 260)), ['스카니아','루나']);
  assert.deepEqual(Array.from(C.choose(list, '스카니아', 260), x => x.name), ['스카메인','스카부캐']);
});

test('잘못된 항목은 제외하고 레벨 문자열은 숫자로 처리한다', () => {
  const list = C.normalize({account_list:[{account_id:'x',character_list:[
    {ocid:'ok',character_name:'정상',world_name:'크로아',character_level:'260'},
    {ocid:'bad',character_name:'월드없음',character_level:300}
  ]}]});
  assert.equal(list.length, 1);
  assert.equal(list[0].level, 260);
});

test('서버 이름을 정리된 WebP 아이콘 경로로 변환한다', () => {
  assert.equal(C.worldIconPath('스카니아'), 'icons/server/스카니아.webp');
  assert.equal(C.worldIconPath('챌린저스'), 'icons/server/챌린저스.webp');
  assert.equal(C.worldIconPath('알 수 없는 서버'), '');
  for (const world of Object.keys(C.WORLD_ICON_FILES)) {
    assert.ok(fs.existsSync(C.worldIconPath(world)), world + ' 서버 아이콘이 없습니다.');
  }
});

test('캐릭터 선택 목록에는 이름과 레벨만 표시한다', () => {
  assert.equal(C.characterOptionText({
    name: '형아의소환수',
    level: 285,
    characterClass: '비숍'
  }), '형아의소환수 · Lv.285');
});

test('직접 검색은 선택기 위쪽의 접근 가능한 토글 스위치로 제공한다', () => {
  assert.match(code, /create\('div', 'nx-character-mode-bar'\)/);
  assert.match(code, /setAttribute\('role', 'switch'\)/);
  assert.match(code, /setAttribute\('aria-checked', manual \? 'true' : 'false'\)/);
  assert.match(code, /host\.append\(modeBar, fields, note\)/);
  assert.match(css, /\.nx-character-mode-bar\{[^}]*justify-content:flex-end/);
  assert.match(css, /\.nx-character-mode\[aria-checked="true"\] \.nx-mode-thumb/);
});
