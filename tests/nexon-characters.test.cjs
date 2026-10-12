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

function mountPicker(response = Promise.resolve(payload)) {
  function node(tag) {
    const n = {tag, children:[], className:'', dataset:{}, attrs:{}, handlers:{}, hidden:false};
    let value = '', label = '';
    Object.defineProperty(n, 'value', {
      get(){ return tag === 'select' ? (n.children.find(c => c.value === value) || n.children[0] || {}).value || '' : value; },
      set(v){ value = String(v); },
    });
    Object.defineProperty(n, 'textContent', {get(){return label;}, set(v){ label = String(v); n.children = []; }});
    n.append = (...items) => n.children.push(...items);
    n.appendChild = child => n.children.push(child);
    n.setAttribute = (key, v) => { n.attrs[key] = String(v); };
    n.removeAttribute = key => {
      delete n.attrs[key];
      if (key.startsWith('data-')) delete n.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
    };
    n.addEventListener = (name, fn) => {n.handlers[name] = fn;};
    n.dispatchEvent = event => {if(n.handlers[event.type]) n.handlers[event.type](event);};
    n.classList = {
      add(name){n.className += ' ' + name;},
      toggle(name, on){const names = new Set(n.className.split(/\s+/).filter(Boolean)); if(on) names.add(name); else names.delete(name); n.className = [...names].join(' ');},
    };
    return n;
  }
  const env = {
    document:{createElement:node}, Event:class {constructor(type){this.type = type;}},
    addEventListener(){}, NexonKey:{has:() => true, get:() => 'fake-key'},
    fetch:() => response.then(body => ({ok:true, json:() => Promise.resolve(body)})),
  };
  vm.runInNewContext(code, env);
  const host = node('div'), input = node('input'), selections = [];
  const picker = env.NexonCharacters.mount({host, input, onSelect:c => selections.push(c.name)});
  function find(className, root = host) {
    if(root.className.split(/\s+/).includes(className)) return root;
    for(const child of root.children){const match = find(className, child); if(match) return match;}
  }
  return {picker, input, find, selections};
}

test('저장 캐릭터를 선택하면 서버·캐릭터 필드와 조회 OCID를 함께 바꾼다', async () => {
  const {picker, input, find, selections} = mountPicker();
  await picker.ready;
  assert.equal(find('nx-world-select').value, '스카니아');
  assert.equal(picker.selectCharacter({name:'루나부캐', world:'루나'}), true);
  assert.equal(find('nx-world-select').value, '루나');
  assert.equal(find('nx-character-select').value, '1');
  assert.equal(find('nx-world-icon').src, 'icons/server/루나.webp');
  assert.equal(input.value, '루나부캐');
  assert.equal(input.dataset.accountOcid, '1');
  assert.equal(input.dataset.accountWorld, '루나');
  assert.deepEqual(selections, ['스카메인', '루나부캐']);
  picker.selectCharacter({name:'스카부캐', world:'스카니아'});
  assert.equal(find('nx-world-select').value, '스카니아');
  assert.equal(find('nx-character-select').value, '4');
  assert.equal(input.dataset.accountOcid, '4');
});

test('계정 목록 로딩 중 배지를 선택해도 로딩 완료 후 최고 레벨 캐릭터로 되돌리지 않는다', async () => {
  let resolve;
  const response = new Promise(r => {resolve = r;});
  const {picker, input, find} = mountPicker(response);
  picker.selectCharacter({name:'루나부캐', world:'루나'});
  assert.equal(input.value, '루나부캐');
  resolve(payload);
  await picker.ready;
  assert.equal(find('nx-world-select').value, '루나');
  assert.equal(find('nx-character-select').value, '1');
  assert.equal(input.dataset.accountOcid, '1');
});

test('계정 밖 저장 캐릭터는 직접 검색으로 표시하고 이전 캐릭터의 OCID를 지운다', async () => {
  const {picker, input, find} = mountPicker();
  await picker.ready;
  picker.selectCharacter({name:'다른계정캐릭터', world:'베라'});
  assert.equal(input.hidden, false);
  assert.equal(input.value, '다른계정캐릭터');
  assert.equal(input.dataset.accountOcid, undefined);
  assert.equal(input.dataset.accountWorld, undefined);
  assert.equal(find('nx-character-mode').attrs['aria-checked'], 'true');
  await picker.reload();
  assert.equal(input.value, '다른계정캐릭터');
  assert.equal(find('nx-character-mode').attrs['aria-checked'], 'true');
});

test('조회 없이 필드만 동기화하는 선택은 목록 로딩 전후 모두 자동 조회를 중복 호출하지 않는다', async () => {
  let resolve;
  const {picker, input, find, selections} = mountPicker(new Promise(r => {resolve = r;}));
  picker.selectCharacter({name:'루나부캐'}, {notify:false});
  resolve(payload);
  await picker.ready;
  assert.equal(find('nx-world-select').value, '루나');
  assert.equal(input.dataset.accountOcid, '1');
  assert.deepEqual(selections, []);
  picker.selectCharacter({name:'스카부캐'}, {notify:false});
  assert.equal(input.dataset.accountOcid, '4');
  assert.deepEqual(selections, []);
  find('nx-character-select').dispatchEvent({type:'change'});
  assert.deepEqual(selections, ['스카부캐']);
});
