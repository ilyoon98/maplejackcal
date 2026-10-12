const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadCalculator({accountResponse, symbolResponse} = {}) {
  function node(tag) {
    const n = {children:[], dataset:{}, handlers:{}, className:'', hidden:false};
    let value = '', label = '';
    Object.defineProperty(n, 'value', {
      get:() => tag === 'select' ? (n.children.find(c => c.value === value) || n.children[0] || {}).value || '' : value,
      set:v => {value = String(v);},
    });
    Object.defineProperty(n, 'textContent', {get:() => label, set:v => {label = String(v); n.children = [];}});
    n.append = (...items) => n.children.push(...items);
    n.appendChild = child => n.children.push(child);
    n.setAttribute = () => {};
    n.removeAttribute = key => {if(key.startsWith('data-')) delete n.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())];};
    n.addEventListener = (type, fn) => {n.handlers[type] = fn;};
    n.dispatchEvent = e => n.handlers[e.type]?.(e);
    n.focus = n.select = () => {};
    n.classList = {toggle:() => {}, add:() => {}};
    return n;
  }
  const nodes = new Map(), calls = [], storage = new Map([
    ['authentic_recent_chars', JSON.stringify(['기존', '새캐릭터', '외부'])],
  ]);
  const get = id => {if(!nodes.has(id)) nodes.set(id, node(id === 'charNameInput' ? 'input' : 'div')); return nodes.get(id);};
  get('fetchBtn').textContent = '캐릭터 검색';
  const account = {account_list:[{character_list:[
    {ocid:'old', character_name:'기존', world_name:'루나', character_level:290},
    {ocid:'new', character_name:'새캐릭터', world_name:'베라', character_level:280},
  ]}]};
  const env = {
    document:{getElementById:get, querySelector:selector => get(selector.slice(1)), createElement:node},
    Event:class {constructor(type){this.type = type;}}, addEventListener:() => {},
    NexonKey:{has:() => true, get:() => 'test-key'},
    localStorage:{getItem:k => storage.get(k), setItem:(k,v) => storage.set(k,v), removeItem:k => storage.delete(k)},
    SYMBOLS:[{name:'세르니움'}], curLevels:[0], unlocked:[false], afterLevelChange:() => {}, levelCard:{open:true},
    fetch:async url => {
      const u = new URL(url); calls.push(u);
      let body;
      if(u.pathname.endsWith('/character/list')) body = await (accountResponse || account);
      else if(u.pathname.endsWith('/id')) body = {ocid:'external'};
      else if(u.pathname.endsWith('/symbol-equipment')) body = await (symbolResponse ? symbolResponse(u.searchParams.get('ocid')) : {symbol:[{symbol_name:'어센틱심볼 : 세르니움',symbol_level:5}]});
      else body = null;
      return {ok:true, json:async () => body};
    },
  };
  env.window = env;
  vm.createContext(env);
  vm.runInContext(fs.readFileSync('nexon_characters.js', 'utf8'), env);
  const html = fs.readFileSync('authentic_symbol_calc.html', 'utf8');
  const source = html.slice(html.indexOf('  // ---------- Character import'), html.indexOf('  renderLevelGrid();', html.indexOf('  // ---------- Character import')));
  vm.runInContext(source + '\nglobalThis.testApi = {picker:characterPicker, select:selectRecentCharacter, fetch:doFetch};', env);
  const tick = () => new Promise(setImmediate);
  const find = (name, root = get('authenticCharacterPicker')) => root.className.split(/\s+/).includes(name) ? root : root.children.map(c => find(name,c)).find(Boolean);
  const clickBadge = name => get('charRecent').children.find(c => c.children[0]?.textContent === name).children[0].dispatchEvent({type:'click'});
  return {env, get, calls, storage, tick, find, clickBadge};
}

test('어센틱 최근 검색 배지를 누르면 서버·내 캐릭터·심볼 조회가 같은 캐릭터로 바뀐다', async () => {
  const c = loadCalculator();
  await c.env.testApi.picker.ready; await c.tick();
  c.calls.length = 0;
  c.clickBadge('새캐릭터'); await c.tick();
  assert.equal(c.find('nx-world-select').value, '베라');
  assert.equal(c.find('nx-character-select').value, 'new');
  assert.equal(c.get('charNameInput').dataset.accountOcid, 'new');
  assert.equal(c.calls.filter(u => u.pathname.endsWith('/symbol-equipment')).length, 1);
  assert.equal(c.calls.find(u => u.pathname.endsWith('/symbol-equipment')).searchParams.get('ocid'), 'new');
  assert.equal(c.storage.get('authentic_last_char'), '새캐릭터');
  c.clickBadge('외부'); await c.tick();
  assert.equal(c.get('charNameInput').hidden, false);
  assert.equal(c.get('charNameInput').dataset.accountOcid, undefined);
  assert.equal(c.calls.find(u => u.pathname.endsWith('/id')).searchParams.get('character_name'), '외부');
});

test('계정 목록 로딩 중 배지를 누르면 나중에 필드만 동기화하고 조회를 중복하지 않는다', async () => {
  let resolve;
  const c = loadCalculator({accountResponse:new Promise(r => {resolve = r;})});
  c.clickBadge('새캐릭터'); await c.tick();
  resolve({account_list:[{character_list:[{ocid:'new',character_name:'새캐릭터',world_name:'베라',character_level:280}]}]});
  await c.env.testApi.picker.ready; await c.tick();
  assert.equal(c.find('nx-world-select').value, '베라');
  assert.equal(c.get('charNameInput').dataset.accountOcid, 'new');
  assert.equal(c.calls.filter(u => u.pathname.endsWith('/symbol-equipment')).length, 1);
});

test('빠르게 전환하면 늦게 도착한 이전 캐릭터의 심볼·상태가 현재 선택을 덮지 않는다', async () => {
  const pending = new Map();
  const c = loadCalculator({symbolResponse:ocid => new Promise(resolve => pending.set(ocid, resolve))});
  await c.env.testApi.picker.ready; await c.tick();
  const newer = c.env.testApi.select('새캐릭터'); await c.tick();
  pending.get('new')({symbol:[{symbol_name:'어센틱심볼 : 세르니움',symbol_level:8}]});
  await newer;
  pending.get('old')({symbol:[{symbol_name:'어센틱심볼 : 세르니움',symbol_level:2}]});
  await c.tick();
  assert.equal(c.env.curLevels[0], 8);
  assert.equal(c.storage.get('authentic_last_char'), '새캐릭터');
  assert.match(c.get('fetchStatus').textContent, /새캐릭터/);
  assert.equal(c.get('fetchBtn').textContent, '캐릭터 검색');
  assert.equal(c.get('fetchBtn').disabled, false);
});
