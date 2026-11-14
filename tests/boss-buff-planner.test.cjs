const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPlanner(options = {}) {
  const elements = new Map();
  function element() {
    return {
      handlers:{}, children:[], dataset:{},
      value:'', innerHTML:'', textContent:'', classList:{toggle(){}},
      addEventListener(name, callback){ this.handlers[name] = callback; }, setAttribute(){}, after(){}, before(){}, append(...items){this.children.push(...items);},
      removeAttribute(name){ if(name === 'data-account-ocid') delete this.dataset.accountOcid; if(name === 'data-account-world') delete this.dataset.accountWorld; },
      appendChild(child){ this.children.push(child); }, replaceChildren(){ this.children = []; },
      parentNode:{appendChild(){}},
    };
  }
  const context = vm.createContext({
    document:{
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement:element,
      addEventListener(){},
      dispatchEvent(){},
      querySelector(){ return null; },
    },
    localStorage:{getItem:() => null, setItem(){}},
    window:Object.assign(options.mountPicker ? {NexonCharacters:{mount:options.mountPicker}} : {}, options.window),
    NexonCharacters:options.mountPicker ? {mount:options.mountPicker} : undefined,
    Event:class {constructor(type){this.type = type;}},
  });
  const script = fs.readFileSync(path.join(__dirname, '../boss_buff_planner.js'), 'utf8');
  vm.runInContext(script.replace(/  renderAll\(\);\s*\}\)\(\);\s*$/, `
    globalThis.engine = {
      importBosses(data) { state.bosses = bossesFromScheduler(data).bosses; return state.bosses; },
      activeItems,
      exclude(value) { state.excludeCompleted = value; },
      setSlack(value) { state.slackPct = value; },
      bosses() { return state.bosses; },
      reload() { state = loadState(state); },
      setLegacyDoping(value) { state.doping = value; },
      doping() { return state.doping; },
      riceLabel,
      inputBossTime(index, minutes) {
        const other = {};
        listEl.handlers.input({target:{dataset:{i:String(index), act:'time'}, value:String(minutes), closest(){return {querySelector(){return other;}};}}});
        return other.value;
      },
      setBosses(bosses) { state.bosses = bosses; },
      mergeScheduler(data, preserveSelection, refresh) {
        const parsed = bossesFromScheduler(data);
        state.bosses = mergeSchedulerBosses(parsed.bosses, preserveSelection, refresh);
        return state.bosses;
      },
      clickBoss(name, act) {
        const i = state.bosses.findIndex(b => b.name === name);
        listEl.handlers.click({target:{closest(){return {dataset:{act,i:String(i)}};}}});
      },
      changeDifficulty(name, value) {
        const i = state.bosses.findIndex(b => b.name === name);
        listEl.handlers.change({target:{dataset:{act:'diff',i:String(i)}, value}});
      },
      toggleExclude() { excludeCompletedBtn.handlers.click(); },
      listRows() {
        renderList();
        const count = visibleBosses().length;
        return count ? listEl.children.slice(-count).map(row => row.innerHTML) : [];
      },
      visibleBosses,
      showAll() { document.getElementById('showAllBossesBtn').handlers.click(); },
      allOn() { document.getElementById('allOn').handlers.click(); },
      allOff() { document.getElementById('allOff').handlers.click(); },
      addProfile(name, character) { profiles.push({name, character, state:JSON.parse(JSON.stringify(state))}); renderProfiles(); },
      clickProfile(name) { const i = profiles.findIndex(p => p.name === name); profileBar.children[i].children[0].handlers.click(); },
      setCharacterPicker(selectCharacter) { characterPicker = {selectCharacter}; },
      characterInput() { return charInput; },
      setApiFetch(handler) { globalThis.fetch = handler; window.NexonKey = globalThis.NexonKey = {has:() => true, get:() => 'fake-key'}; },
      importCharacter,
      refreshScheduler() { return refreshSchedulerBtn.handlers.click(); },
      schedulerStatus() { return schedulerStatus.textContent; },
      schedulerLoading() { return refreshSchedulerBtn.disabled; },
      fetching() { return fetchBtn.disabled; },
      searchButton() { return fetchBtn; },
      packAll,
      binCost,
      renderAll,
      collectPartyRates,
      setPartyRates(db, rates) { window.MapleBossDB = db; partyRates = rates; },
      collectSharedRates,
      setSharedRates(db, own) { window.MapleBossDB = db; sharedRates = own.rates; sharedRateAt = own.at; sharedRateLoaded = true; sharedRegistered = own.registered; sharedRateName = '나'; },
      inputBossMult(index, value) {
        const other = {};
        listEl.handlers.input({target:{dataset:{i:String(index), act:'mult'}, value:String(value), closest(){return {querySelector(){return other;}};}}});
      },
      boss(name) { return state.bosses.find(b => b.name === name); },
      useSharedAll() { document.getElementById('useSharedAll').handlers.click(); },
      setPartyInfo(info) { partyInfo = info; },
      rateBadges() { return document.getElementById('partyRateStatus').innerHTML; },
      sharedCta() { return {text:document.getElementById('sharedRateCtaText').textContent, link:document.getElementById('sharedRateLink').textContent, href:document.getElementById('sharedRateLink').href}; },
      results() { return {pack:packEl.innerHTML, combos:comboEl.innerHTML}; },
    };
  })();`), context);
  return context.engine;
}

test('완료한 월간 검은 마법사도 불러오며 ON일 때만 동선에서 제외한다', () => {
  const engine = loadPlanner();
  const bosses = engine.importBosses({boss_contents:[{
    content_name:'검은 마법사', difficulty:'hard', cycle:'bossMonthly',
    registration_flag:true, clear_flag:'TRUE',
  }]});
  assert.equal(bosses[0].completed, true);
  assert.equal(bosses[0].on, true);
  assert.equal(engine.activeItems().length, 1);
  engine.exclude(true);
  assert.equal(engine.activeItems().length, 0);
  engine.reload();
  assert.equal(engine.activeItems().length, 0);
  engine.exclude(false);
  assert.equal(engine.activeItems().length, 1);
});

test('주간·월간 완료 필드를 모두 지원하며 명시적인 false를 우선한다', () => {
  const engine = loadPlanner();
  for (const cycle of ['bossWeekly', 'bossMonthly']) {
    for (const [flags, expected] of [
      [{clear_flag:true}, true],
      [{clear_flag:false, complete_flag:true}, false],
      [{clear_flag:'false', complete_flag:'true'}, false],
      [{complete_flag:'true'}, true],
      [{clear_flag:null, complete_flag:true}, true],
      [{}, false],
    ]) {
      const bosses = engine.importBosses({boss_contents:[{
        content_name:'검은 마법사', difficulty:'hard', cycle,
        registration_flag:true, ...flags,
      }]});
      assert.equal(bosses[0].completed, expected);
      assert.equal(bosses[0].on, true);
    }
  }
});

test('풀도핑으로 돌려도 버프가 줄지 않으면 쌀도핑 보스는 쌀도핑 판에 둔다', () => {
  const engine = loadPlanner();
  const items = [
    {full:800, riceSec:820, rice:false},
    {full:780, riceSec:800, rice:true},
    {full:800, riceSec:820, rice:false},
    {full:780, riceSec:800, rice:true},
  ];
  const result = engine.packAll(items, 1800);
  assert.equal(result.bins.length, 2);
  assert.equal(result.exact, true);
  for (const bin of result.bins) {
    assert.equal(bin.idx.length, 2);
    assert.ok(bin.idx.every(i => items[i].rice === !bin.full));
    assert.equal(engine.binCost(bin, items), 1660);
  }
});

test('쌀도핑 보스를 풀도핑 판에 넣어 버프가 줄면 풀도핑으로 계산한다', () => {
  const engine = loadPlanner();
  const items = [{full:900, riceSec:930, rice:false}, {full:800, riceSec:830, rice:true}];
  const result = engine.packAll(items, 1800);
  assert.equal(result.bins.length, 1);
  assert.equal(result.bins[0].full, true);
  assert.equal(engine.binCost(result.bins[0], items), 1760);
});

test('듄켈을 쌀도핑으로 두어도 풀도핑 판에 넣어 버프 3개로 돈다', () => {
  const engine = loadPlanner();
  engine.setBosses([
    ['스우',2477,true],['데미안',1855,true],['루시드',455,true],['윌',964,true],
    ['더스크',812,true],['진 힐라',674,true],['듄켈',770,true],
    ['검은 마법사',344,false],['선택받은 세렌',392,false],['감시자 칼로스',275,false],['최초의 대적자',223,false],
  ].map(([name, mult, rice]) => ({name, mult, rice, on:true, extra:name === '윌' ? 4 : 0})));
  engine.setSlack(30);
  const items = engine.activeItems();
  const result = engine.packAll(items, 1800);
  assert.equal(result.bins.length, 3);
  for (const bin of result.bins) {
    assert.ok(bin.full || bin.idx.every(i => items[i].rice));
    assert.ok(engine.binCost(bin, items) <= 1800);
  }
});

test('쌀도핑으로 시간 초과인 보스를 풀도핑으로 자동 변경하지 않는다', () => {
  const engine = loadPlanner();
  const result = engine.packAll([{full:1790, riceSec:1845, rice:true}], 1800);
  assert.equal(result.bins.length, 0);
  assert.deepEqual(Array.from(result.over), [0]);
});

test('보스가 많아 근사 계산을 해도 같은 도핑만 묶고 제한 시간을 지킨다', () => {
  const engine = loadPlanner();
  const items = Array.from({length:32}, (_, i) => ({full:200, riceSec:207, rice:i % 2 === 0}));
  const result = engine.packAll(items, 900);
  assert.equal(result.exact, false);
  const placed = result.bins.flatMap(bin => Array.from(bin.idx));
  assert.equal(new Set(placed).size, items.length);
  for (const bin of result.bins) {
    assert.ok(bin.full || bin.idx.every(i => items[i].rice));
    assert.ok(engine.binCost(bin, items) <= 900);
  }
});

test('도핑 선택은 저장 복원과 재조회 후에도 유지되고 조합도 분리된다', () => {
  const engine = loadPlanner();
  engine.setBosses([
    {name:'스우', mult:400, rice:true, on:true},
    {name:'데미안', mult:400, rice:false, on:true},
  ]);
  engine.reload();
  const bosses = engine.importBosses({boss_contents:['스우','데미안'].map(content_name => ({
    content_name, difficulty:'hard', cycle:'bossWeekly', registration_flag:true,
  }))});
  assert.equal(bosses[0].rice, true);
  assert.equal(bosses[1].rice, false);
  assert.equal(bosses[0].mult, 400);
  engine.renderAll();
  const {pack, combos} = engine.results();
  // 둘 다 5분이라 한 버프에 들어가므로 스우를 풀도핑으로 돌린다.
  assert.match(pack, /풀도핑 1판/);
  assert.match(pack, /쌀도핑 0판/);
  assert.match(pack, /풀도핑으로 넣었습니다: 스우/);
  const [full, rice] = combos.split('<p class="note">' + engine.riceLabel() + ' 보스 조합</p>');
  assert.match(full, /데미안/);
  assert.doesNotMatch(full, /스우/);
  assert.match(rice, /스우/);
  assert.doesNotMatch(rice, /데미안/);
});

test('쌀도핑은 입력 배율에서 상대 3%를 차감하고 풀도핑 배율은 보존한다', () => {
  const engine = loadPlanner();
  for (const mult of [100, 400, 1000]) {
    engine.setBosses([{name:'스우', mult, rice:true, on:true}]);
    const [item] = engine.activeItems();
    assert.equal(item.mult, mult);
    assert.equal(item.full, Math.round(120000 / mult));
    assert.equal(item.riceSec, Math.round(120000 / (mult * 0.97)));
  }
});

test('쌀도핑 보정 뒤에 여유 시간과 윌의 고정 추가 시간을 더한다', () => {
  const engine = loadPlanner();
  engine.setBosses([{name:'윌', mult:400, extra:4, on:true, rice:true}]);
  engine.setSlack(30);
  const [item] = engine.activeItems();
  assert.equal(item.full, 630);
  assert.equal(item.riceSec, Math.round(Math.round(300 / 0.97) * 1.3) + 240);
});

test('예전 버프별 선택은 복원할 때 버리고 배율과 보스별 도핑은 유지한다', () => {
  const engine = loadPlanner();
  engine.setBosses([{name:'스우', mult:400, rice:true, on:true}]);
  for (const legacy of [{full:{}, rice:{}}, {full:{collector:true, master:true}, rice:{collector:true, master:true}}]) {
    engine.setLegacyDoping(legacy);
    engine.reload();
    assert.equal(engine.doping(), undefined);
    const [item] = engine.activeItems();
    assert.equal(item.mult, 400);
    assert.equal(item.rice, true);
    assert.equal(item.full, 300);
    assert.equal(item.riceSec, 309);
  }
});

test('보스별 도핑 버튼과 시간 입력에 같은 97% 보정을 적용한다', () => {
  const engine = loadPlanner();
  engine.setBosses([{name:'스우', mult:400, rice:false, on:true}]);
  engine.clickBoss('스우', 'rice');
  assert.equal(engine.activeItems()[0].rice, true);
  assert.equal(engine.activeItems()[0].mult, 400);
  assert.equal(engine.activeItems()[0].riceSec, 309);
  assert.equal(engine.inputBossTime(0, 5), '412.4');
  assert.equal(engine.activeItems()[0].riceSec, 300);
  engine.clickBoss('스우', 'rice');
  assert.equal(engine.activeItems()[0].rice, false);
  assert.equal(engine.activeItems()[0].mult, 412.4);
});

test('저장한 목록의 난이도가 스케줄러 등록 난이도와 다르면 맞추고 완료를 반영한다', () => {
  const engine = loadPlanner();
  engine.setBosses([{name:'검은 마법사', diff:'하드', mult:483.7, on:true}, {name:'듄켈', diff:'하드', mult:1073, on:true}]);
  engine.mergeScheduler({boss_contents:[
    {content_name:'검은 마법사', difficulty:'hard', cycle:'bossMonthly', registration_flag:'false', complete_flag:'false'},
    {content_name:'검은 마법사', difficulty:'extreme', cycle:'bossMonthly', registration_flag:'true', complete_flag:'true'},
    {content_name:'듄켈', difficulty:'hard', cycle:'bossWeekly', registration_flag:'true', complete_flag:'false'},
  ]}, true, true);
  const bm = engine.bosses().find(b => b.name === '검은 마법사');
  const dk = engine.bosses().find(b => b.name === '듄켈');
  assert.equal(bm.diff, '익스트림');
  assert.equal(bm.completed, true);
  assert.equal(dk.completed, false);
});

test('다시 불러올 때 배율은 같은 난이도일 때만 이어 쓴다', () => {
  const engine = loadPlanner();
  engine.setBosses([{name:'검은 마법사', diff:'하드', mult:483.7}, {name:'듄켈', diff:'하드', mult:1073}]);
  const bosses = engine.importBosses({boss_contents:[
    {content_name:'검은 마법사', difficulty:'extreme', cycle:'bossMonthly', registration_flag:'true'},
    {content_name:'듄켈', difficulty:'hard', cycle:'bossWeekly', registration_flag:'true'},
  ]});
  assert.equal(bosses[0].diff, '익스트림');
  assert.equal(bosses[0].mult, 100);
  assert.equal(bosses[1].mult, 1073);
});

test('전체 보스 설정을 보관하되 첫 목록과 동선에는 기본 12보스만 표시한다', () => {
  const engine = loadPlanner();
  assert.equal(engine.bosses().length, 25);
  assert.equal(new Set(Array.from(engine.bosses(), b => b.name)).size, 25);
  assert.equal(engine.activeItems().length, 12);
  assert.equal(engine.visibleBosses().length, 12);
  assert.ok(engine.bosses().some(b => b.name === '검은 마법사' && !b.on));
  assert.ok(engine.bosses().some(b => b.name === '유피테르' && !b.on));
});

test('기존 저장 목록을 보존하고 빠진 보스는 제외 상태로 채운다', () => {
  const engine = loadPlanner();
  engine.setBosses([{name:'벨로나', diff:'이지', mult:80.16, rice:true, on:true, completed:true}]);
  engine.reload();
  const boss = engine.bosses().find(b => b.name === '벨로나');
  assert.equal(engine.bosses().length, 25);
  assert.equal(boss.mult, 80.16);
  assert.equal(boss.rice, true);
  assert.equal(boss.completed, true);
  assert.equal(engine.activeItems().length, 1);
  assert.ok(engine.bosses().filter(b => b.name !== '벨로나').every(b => !b.on));
});

test('포함·완료 버튼은 독립적이고 완료 제외 토글은 수동 표시와 포함 선택을 유지한다', () => {
  const engine = loadPlanner();
  const order = Array.from(engine.bosses(), b => b.name);
  engine.clickBoss('벨로나', 'complete');
  let boss = engine.bosses().find(b => b.name === '벨로나');
  assert.equal(boss.on, false);
  assert.equal(boss.completed, true);
  engine.clickBoss('벨로나', 'on');
  engine.toggleExclude();
  assert.equal(boss.on, true);
  assert.equal(boss.completed, true);
  assert.ok(!engine.activeItems().some(b => b.name === '벨로나'));
  const row = engine.listRows()[engine.visibleBosses().findIndex(b => b.name === '벨로나')];
  assert.match(row, /row-include selected/);
  assert.match(row, /row-complete completed/);
  assert.doesNotMatch(row, /disabled|data-act="del"/);
  engine.clickBoss('벨로나', 'complete');
  assert.ok(engine.activeItems().some(b => b.name === '벨로나'));
  engine.reload();
  boss = engine.bosses().find(b => b.name === '벨로나');
  assert.equal(boss.on, true);
  assert.equal(boss.completed, false);
  assert.deepEqual(Array.from(engine.bosses(), b => b.name), order);
});

test('난이도별 배율을 복원하고 난이도를 바꿔도 포함·완료 선택은 유지한다', () => {
  const engine = loadPlanner();
  engine.setBosses([{name:'스우', diff:'하드', mult:1933, rice:true, on:false, completed:true}]);
  engine.reload();
  engine.changeDifficulty('스우', '익스트림');
  let boss = engine.bosses().find(b => b.name === '스우');
  assert.equal(boss.mult, 100);
  assert.equal(boss.on, false);
  assert.equal(boss.completed, true);
  boss.mult = 43.10; boss.rice = false;
  engine.changeDifficulty('스우', '하드');
  assert.equal(boss.mult, 1933);
  assert.equal(boss.rice, true);
  engine.reload();
  engine.changeDifficulty('스우', '익스트림');
  boss = engine.bosses().find(b => b.name === '스우');
  assert.equal(boss.mult, 43.10);
  assert.equal(boss.rice, false);
  assert.equal(boss.completed, true);
});

test('스케줄러를 불러와도 전체 목록을 유지하고 재조회 시 수동 포함 선택을 보존한다', () => {
  const engine = loadPlanner();
  const data = {boss_contents:[{content_name:'검은 마법사', difficulty:'hard', cycle:'bossMonthly', registration_flag:true, complete_flag:true}]};
  engine.mergeScheduler(data, false);
  assert.equal(engine.bosses().length, 25);
  assert.equal(engine.activeItems().length, 1);
  engine.clickBoss('검은 마법사', 'on');
  engine.clickBoss('벨로나', 'on');
  engine.clickBoss('벨로나', 'complete');
  engine.mergeScheduler(data, true);
  assert.equal(engine.bosses().length, 25);
  assert.equal(engine.bosses().find(b => b.name === '검은 마법사').on, false);
  assert.equal(engine.bosses().find(b => b.name === '검은 마법사').completed, true);
  assert.equal(engine.bosses().find(b => b.name === '벨로나').on, true);
  assert.equal(engine.bosses().find(b => b.name === '벨로나').completed, true);
  engine.reload();
  engine.mergeScheduler(data, true);
  assert.equal(engine.bosses().find(b => b.name === '벨로나').completed, true);
  engine.mergeScheduler(data, true, true);
  assert.equal(engine.bosses().find(b => b.name === '벨로나').completed, false);
  engine.mergeScheduler({boss_contents:[]}, false);
  assert.equal(engine.bosses().length, 25);
  assert.equal(engine.activeItems().length, 0);
});

test('기본 목록은 스케줄러 등록 보스만 표시하며 포함 취소·완료 표시로 행이 사라지지 않는다', () => {
  const engine = loadPlanner();
  engine.mergeScheduler({boss_contents:[
    {content_name:'스우', difficulty:'hard', cycle:'bossWeekly', registration_flag:true},
    {content_name:'검은 마법사', difficulty:'hard', cycle:'bossMonthly', registration_flag:true, complete_flag:true},
    {content_name:'벨로나', difficulty:'easy', cycle:'bossWeekly', registration_flag:false},
  ]}, false);
  const names = () => Array.from(engine.visibleBosses(), b => b.name);
  assert.deepEqual(names(), ['스우', '검은 마법사']);
  engine.clickBoss('스우', 'on');
  engine.toggleExclude();
  assert.equal(engine.activeItems().length, 0);
  assert.deepEqual(names(), ['스우', '검은 마법사']);
  engine.reload();
  assert.deepEqual(names(), ['스우', '검은 마법사']);
  assert.equal(engine.listRows().length, 2);
});

test('전체 보기를 바꿔도 계산·배율은 유지하며 전체 포함은 보이는 등록 목록에만 적용한다', () => {
  const engine = loadPlanner();
  engine.mergeScheduler({boss_contents:[
    {content_name:'스우', difficulty:'hard', cycle:'bossWeekly', registration_flag:true},
  ]}, false);
  engine.bosses().find(b => b.name === '스우').mult = 2582;
  engine.allOff(); engine.allOn();
  assert.equal(engine.activeItems().length, 1);
  assert.equal(engine.visibleBosses().length, 1);
  engine.showAll();
  assert.equal(engine.visibleBosses().length, 25);
  assert.equal(engine.activeItems().length, 1);
  engine.reload();
  assert.equal(engine.visibleBosses().length, 25);
  engine.clickBoss('벨로나', 'on');
  engine.showAll();
  assert.deepEqual(Array.from(engine.visibleBosses(), b => b.name), ['벨로나', '스우']);
  assert.equal(engine.activeItems().length, 2);
  engine.clickBoss('벨로나', 'on');
  assert.equal(engine.visibleBosses().length, 2);
  assert.equal(engine.bosses().find(b => b.name === '스우').mult, 2582);
});

test('저장 배지를 누르면 캐릭터 선택기에 같은 이름·서버를 전달하고 오래된 조회 정보를 지운다', () => {
  const engine = loadPlanner();
  engine.addProfile('토끼털쇼타', {worldName:'베라'});
  const input = engine.characterInput();
  input.value = '형아의소환수'; input.dataset.accountOcid = 'old-ocid'; input.dataset.accountWorld = '루나';
  const calls = [];
  engine.setCharacterPicker(target => {
    calls.push({...target});
    assert.equal(input.dataset.accountOcid, undefined);
    assert.equal(input.dataset.accountWorld, undefined);
    input.dataset.accountOcid = 'rabbit-ocid'; input.dataset.accountWorld = target.world;
  });
  engine.clickProfile('토끼털쇼타');
  assert.equal(input.value, '토끼털쇼타');
  assert.deepEqual(calls, [{name:'토끼털쇼타', world:'베라'}]);
  assert.equal(input.dataset.accountOcid, 'rabbit-ocid');
  assert.equal(input.dataset.accountWorld, '베라');
});

test('캐릭터를 바꾼 뒤 늦게 도착한 이전 조회 응답은 현재 선택과 보스 목록을 덮지 않는다', async () => {
  const engine = loadPlanner(), pending = new Map();
  engine.setApiFetch(url => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/scheduler/character-state')) {
      return new Promise(resolve => { pending.set(parsed.searchParams.get('ocid'), body => resolve({ok:true, json:() => Promise.resolve(body)})); });
    }
    return Promise.resolve({ok:true, json:() => Promise.resolve(null)});
  });
  const input = engine.characterInput();
  input.value = '형아의소환수'; input.dataset.accountOcid = 'old';
  const older = engine.importCharacter();
  await new Promise(setImmediate);
  input.value = '토끼털쇼타'; input.dataset.accountOcid = 'new';
  const newer = engine.importCharacter();
  await new Promise(setImmediate);
  pending.get('new')({boss_contents:[{content_name:'검은 마법사', difficulty:'hard', cycle:'bossMonthly', registration_flag:true}]});
  await newer;
  assert.deepEqual(Array.from(engine.activeItems(), b => b.name), ['검은 마법사']);
  pending.get('old')({boss_contents:[{content_name:'스우', difficulty:'hard', cycle:'bossWeekly', registration_flag:true}]});
  await older;
  assert.equal(input.value, '토끼털쇼타');
  assert.deepEqual(Array.from(engine.activeItems(), b => b.name), ['검은 마법사']);
  assert.equal(engine.fetching(), false);
});

test('목록에서 현재 캐릭터의 스케줄러를 새로고침하고 실패 후 다시 시도한다', async () => {
  const engine = loadPlanner();
  const item = (name, difficulty, complete = false) =>
    ({content_name:name, difficulty, cycle:'bossWeekly', registration_flag:true, clear_flag:complete});
  let respond;
  const requests = [];
  engine.setApiFetch((url, options) => {
    if (!url.includes('/scheduler/character-state')) return Promise.resolve({ok:true, json:async () => null});
    requests.push([new URL(url).searchParams.get('ocid'), options.cache]);
    return new Promise(resolve => { respond = body => resolve({ok:true, json:async () => body}); });
  });
  const input = engine.characterInput();
  input.value = '현재캐릭터'; input.dataset.accountOcid = 'current';
  const initial = engine.importCharacter();
  await new Promise(setImmediate);
  respond({boss_contents:[item('스우', 'hard', true), item('루시드', 'hard'), item('듄켈', 'hard')]});
  await initial;
  engine.bosses().find(b => b.name === '스우').mult = 245.5;
  engine.clickBoss('스우', 'on');
  const before = JSON.stringify(engine.bosses());
  const failure = engine.refreshScheduler();
  assert.equal(engine.schedulerLoading(), true);
  assert.equal(engine.refreshScheduler(), undefined);
  await new Promise(setImmediate);
  respond({unexpected:true});
  await failure;
  assert.match(engine.schedulerStatus(), /갱신 실패.*마지막 갱신/);
  assert.equal(engine.schedulerLoading(), false);
  assert.equal(JSON.stringify(engine.bosses()), before);

  const retry = engine.refreshScheduler();
  await new Promise(setImmediate);
  respond({boss_contents:[item('스우', 'hard'), item('루시드', 'normal', true), item('벨로나', 'easy')]});
  await retry;
  const boss = name => engine.bosses().find(b => b.name === name);
  assert.equal(boss('스우').mult, 245.5);
  assert.equal(boss('스우').on, false);
  assert.equal(boss('스우').completed, false);
  assert.equal(boss('루시드').diff, '노멀');
  assert.equal(boss('루시드').completed, true);
  assert.equal(boss('벨로나').on, true);
  assert.equal(boss('듄켈').registered, false);
  assert.equal(boss('듄켈').on, false);
  assert.match(engine.schedulerStatus(), /갱신 완료.*3마리 중 1마리 완료.*노멀 루시드/);
  assert.deepEqual(requests, Array.from({length:3}, () => ['current', 'no-store']));
});

test('계정 선택은 바로 조회하고 직접 검색 모드에서만 검색 버튼을 보여 준다', async () => {
  let pickerOptions;
  const engine = loadPlanner({mountPicker:options => {
    pickerOptions = options;
    options.onModeChange(false);
    return {selectCharacter(){}};
  }});
  assert.equal(engine.searchButton().hidden, true);
  pickerOptions.onModeChange(true);
  assert.equal(engine.searchButton().hidden, false);
  pickerOptions.onModeChange(false);
  let requests = 0;
  engine.setApiFetch(url => {
    if(url.includes('/scheduler/character-state')) requests++;
    return Promise.resolve({ok:true, json:() => Promise.resolve({boss_contents:[]})});
  });
  engine.characterInput().value = '토끼털쇼타';
  engine.characterInput().dataset.accountOcid = 'rabbit';
  pickerOptions.onSelect();
  await new Promise(setImmediate);
  assert.equal(requests, 1);
  assert.equal(engine.searchButton().hidden, true);
  assert.equal(engine.fetching(), false);
});

test('저장 배지로 선택기를 동기화해도 보스 조회를 두 번 호출하지 않는다', async () => {
  let pickerOptions;
  const engine = loadPlanner({mountPicker:options => {
    pickerOptions = options;
    return {selectCharacter(target, selectionOptions) {
      assert.equal(selectionOptions.notify, false);
      options.input.dataset.accountOcid = 'rabbit';
      if(selectionOptions.notify) options.onSelect();
    }};
  }});
  let requests = 0;
  engine.setApiFetch(url => {
    if(url.includes('/scheduler/character-state')) requests++;
    return Promise.resolve({ok:true, json:() => Promise.resolve({boss_contents:[]})});
  });
  engine.addProfile('토끼털쇼타', {worldName:'베라'});
  engine.clickProfile('토끼털쇼타');
  await new Promise(setImmediate);
  assert.equal(pickerOptions.input.value, '토끼털쇼타');
  assert.equal(requests, 1);
});

test('캐릭터가 들어간 파티는 파티 환산 합계를 찾고 배율 미등록 파티원이 있으면 건너뛴다', () => {
  const engine = loadPlanner();
  const store = {snapshots:[
    {characterName:'나', preset:'00000', rates:[{bossId:'Lotus|Extreme', percent:60.5}, {bossId:'Will|Hard', percent:70}]},
    {characterName:'친구', preset:'00000', rates:[{bossId:'Lotus|Extreme', percent:80}]}
  ]};
  const shared = [{name:'익스트림 스우', bossId:'Lotus|Extreme', members:['나', '친구']}, {name:'남의 파티', bossId:'Dusk|Chaos', members:['친구']}];
  const local = [{name:'하드 윌', bossId:'Will|Hard', members:[{character:{name:'나'}, rate:70}, {character:{name:'미등록'}, rate:null}]}];
  const result = engine.collectPartyRates('나', local, shared, store);
  const rates = JSON.parse(JSON.stringify(result.rates));
  assert.deepEqual(rates['Lotus|Extreme'].members.map(m => m.name), ['친구', '나']);
  delete rates['Lotus|Extreme'].members;
  assert.deepEqual(rates, {'Lotus|Extreme':{total:140.5, name:'익스트림 스우', count:2, id:'', scope:'shared'}});
  assert.deepEqual([...result.skipped], ['하드 윌']);
});

test('이름 없는 파티는 본캐 먼저 배율 순으로 자동 이름을 짓고 파티 표시 툴팁에 파티원 카드를 넣는다', () => {
  const engine = loadPlanner({window:{AccountCatalog:require('../account_catalog.js')}});
  const now = Date.now() - 1000;
  const character = (name, job, level) => ({name, world:'루나', job, level, image:'https://open.api.nexon.com/static/maplestory/character/look/ABC123', updatedAt:now});
  const store = {
    snapshots:[
      {characterName:'나의본캐', preset:'00000', character:character('나의본캐', '비숍', 290), rates:[{bossId:'Will|Hard', percent:40}]},
      {characterName:'딜러친구', preset:'00000', character:{...character('딜러친구', '히어로', 285), image:'javascript:alert(1)'}, rates:[{bossId:'Will|Hard', percent:70}]},
      {characterName:'나의부캐', preset:'00000', rates:[{bossId:'Will|Hard', percent:20}]}
    ],
    accounts:[{id:'mine', label:'', characters:[{name:'나의본캐', profile:character('나의본캐', '비숍', 290)}, {name:'나의부캐'}]}]
  };
  engine.setPartyRates(require('../boss_db.json'), {});
  const shared = [{id:'party-1', name:'하드 윌', bossId:'Will|Hard', members:['딜러친구', '나의부캐', '나의본캐']}];
  const party = engine.collectPartyRates('나의부캐', [], shared, store).rates['Will|Hard'];
  // 본캐가 먼저, 그다음 배율이 높은 순이다. 3명이라 2글자씩 잇는다.
  assert.equal(party.name, '나의,딜러,나의');
  assert.deepEqual(party.members.map(m => [m.name, m.main, m.me]), [['나의본캐', true, false], ['딜러친구', false, false], ['나의부캐', false, true]]);
  // 공유 저장소에 있던 잘못된 이미지 주소는 버린다.
  assert.equal(party.members[1].image, '');
  engine.setBosses([{id:'b0', name:'윌', diff:'하드', mult:80, on:true, extra:0}]);
  engine.setPartyRates(require('../boss_db.json'), {'Will|Hard':{...party, scope:'shared'}});
  const row = engine.listRows()[0].match(/<div class="row-party">.*?<\/div>/)[0];
  const attr = name => row.match(new RegExp(' ' + name + '="([^"]*)"'))[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  assert.equal(attr('data-tooltip'), '나의,딜러,나의 파티');
  assert.equal(attr('data-tooltip-value'), '3명 · 환산 합계 130%');
  const items = JSON.parse(attr('data-tooltip-items'));
  assert.deepEqual(items.map(item => [item.name, item.note, item.value, item.tags]), [
    ['나의본캐', '비숍 · Lv.290', '40%', ['본캐']], ['딜러친구', '히어로 · Lv.285', '70%', []], ['나의부캐', '', '20%', ['이 캐릭터']]
  ]);
  assert.equal(items[0].image, 'https://open.api.nexon.com/static/maplestory/character/look/ABC123');
});

test('파티 보스는 항상 파티 배율로 계산하고 고정 칸의 파티 표시로 그 파티를 연다', () => {
  const engine = loadPlanner();
  engine.setBosses([{name:'스우', diff:'익스트림', mult:50, on:true}, {name:'윌', diff:'하드', mult:80, on:true}].map((b, i) => ({id:'b' + i, extra:0, ...b})));
  engine.setPartyRates(require('../boss_db.json'), {'Lotus|Extreme':{total:140.5, name:'익스트림 스우', count:2, id:'party-1', scope:'shared'}});
  const mult = name => engine.activeItems().find(item => item.name === name).mult;
  assert.equal(mult('스우'), 140.5);
  assert.equal(mult('윌'), 80);
  const [suu, will] = engine.listRows();
  assert(suu.includes('<div class="row-party"><a class="party-link" href="party_boss_scheduler.html?scope=shared&amp;party=party-1"'));
  assert.match(suu, /aria-label="스우 파티 배율" disabled/);
  assert.doesNotMatch(suu, /data-act="party"/);
  assert(will.includes('<div class="row-party"></div>'));
  engine.clickBoss('스우', 'party');
  assert.equal(mult('스우'), 140.5);
});

test('공용 환산 배율을 기본값으로 쓰고 직접 고친 배율이 우선하며 되돌리기와 난이도별 기억을 지원한다', () => {
  const engine = loadPlanner();
  const db = require('../boss_db.json');
  const store = {snapshots:[
    {characterName:'나', preset:'00000', fetchedAt:'2026-11-06T15:34:35.183Z', rates:[{bossId:'Will|Hard', percent:150.5}, {bossId:'Lucid|Hard', percent:0}, {bossId:'Will|Normal', percent:400}]},
    {characterName:'남', preset:'00000', rates:[{bossId:'Will|Hard', percent:999}]}
  ]};
  const own = engine.collectSharedRates('나', store);
  // 0%(입장 불가)는 배율로 쓰지 않는다.
  assert.deepEqual({...own.rates}, {'Will|Hard':150.5, 'Will|Normal':400});
  assert.equal(engine.collectSharedRates('없는캐릭터', store).registered, false);
  engine.setBosses([{name:'윌', diff:'하드', mult:80, on:true}, {name:'루시드', diff:'하드', mult:90, on:true}].map((b, i) => ({id:'b' + i, extra:0, ...b})));
  engine.setSharedRates(db, own);
  const mult = name => engine.activeItems().find(item => item.name === name).mult;
  // 공용 기록이 있으면 공용 값, 없으면 이 화면에 저장한 값을 쓴다.
  assert.equal(mult('윌'), 150.5);
  assert.equal(mult('루시드'), 90);
  let [will, lucid] = engine.listRows();
  assert.match(will, /class="row-input row-mult" data-tooltip="공용 환산 배율" data-tooltip-value="150.5%" data-tooltip-note="11월 7일 기록/);
  assert.match(will, /class="rate-shared"/);
  assert.match(lucid, /data-tooltip="이 화면에 입력한 배율"/);
  // 배율 캡처는 공용 환산 배율 화면에서 한다. 기록 없는 동선 보스가 있으면 그 수를 알리고 선택한 캐릭터로 연다.
  assert.deepEqual({...engine.sharedCta()}, {text:'공용 환산 배율에 기록이 없는 동선 보스가 1개 있습니다. 캡처로 등록하면 이 동선과 파티에 함께 쓰입니다.', link:'공용 환산 배율에서 갱신', href:'shared_boss_rates.html?name=%EB%82%98'});
  assert.doesNotMatch(will, /rate-reset/);
  // 직접 고치면 그 값이 우선하고, 이름 옆에 공용으로 되돌리기 버튼이 생긴다.
  engine.inputBossMult(0, 120);
  assert.equal(mult('윌'), 120);
  [will] = engine.listRows();
  assert.match(will, /data-act="shared"[^>]*aria-label="윌 배율을 공용 환산 배율 150.5%로 되돌리기"/);
  assert.match(will, /data-tooltip="직접 입력한 배율"/);
  // 다른 난이도로 바꾸면 그 난이도의 공용 값을 쓰고, 돌아오면 직접 고친 값을 기억한다.
  engine.changeDifficulty('윌', '노멀');
  assert.equal(mult('윌'), 400);
  engine.changeDifficulty('윌', '하드');
  assert.equal(mult('윌'), 120);
  engine.clickBoss('윌', 'shared');
  assert.equal(mult('윌'), 150.5);
  assert.equal(engine.boss('윌').mult, 150.5);
  // 소요 시간을 고쳐도 직접 입력으로 보고, 목록 관리의 일괄 되돌리기로 공용 값을 다시 쓴다.
  engine.inputBossTime(0, 10);
  assert.equal(engine.boss('윌').manual, true);
  engine.useSharedAll();
  assert.equal(engine.boss('윌').manual, false);
  assert.equal(mult('윌'), 150.5);
  // 파티 환산 합계가 가장 우선한다.
  engine.setPartyRates(db, {'Will|Hard':{total:300, name:'파티', count:2, id:'', scope:'local'}});
  assert.equal(mult('윌'), 300);
});

test('공용 환산 배율에 없는 캐릭터는 캡처 등록을 안내하고 이 화면의 배율을 쓴다', () => {
  const engine = loadPlanner();
  engine.setBosses([{id:'b0', name:'윌', diff:'하드', mult:80, on:true, extra:0}]);
  engine.setSharedRates(require('../boss_db.json'), engine.collectSharedRates('나', {snapshots:[]}));
  engine.listRows();
  assert.equal(engine.activeItems()[0].mult, 80);
  assert.equal(engine.sharedCta().text, '공용 환산 배율에 나 캐릭터를 캡처로 등록하면 그 배율을 이 동선과 파티에 기본값으로 씁니다.');
  assert.equal(engine.sharedCta().link, '공용 환산 배율에 등록');
  // 스크린샷을 읽는 기능은 이 화면에서 뺐다.
  assert(!require('node:fs').readFileSync(require('node:path').join(__dirname, '../boss_buff_planner.html'), 'utf8').includes('boss_shot_reader.js'));
});

test('스케줄러에 없고 동선에서 뺀 보스는 새로고침하면 내 보스 목록에서 빠지고 직접 넣은 보스는 남는다', () => {
  const engine = loadPlanner();
  const weekly = names => ({boss_contents:names.map(([content_name, difficulty]) => ({content_name, difficulty, cycle:'bossWeekly', registration_flag:true}))});
  // 기본 12보스로 시작해 가디언 엔젤 슬라임은 동선에서 빼고, 스케줄러에 없는 벨룸은 직접 넣어 둔 상태.
  engine.setBosses(engine.bosses().map(b => b.name === '가디언 엔젤 슬라임' ? {...b, on:false, inList:true} : b));
  const names = () => engine.visibleBosses().map(b => b.name);
  assert(names().includes('가디언 엔젤 슬라임'));
  engine.mergeScheduler(weekly([['스우', 'extreme'], ['벨룸', 'chaos']]), true, true);
  engine.clickBoss('벨룸', 'on'); engine.clickBoss('벨룸', 'on');
  engine.mergeScheduler(weekly([['스우', 'extreme']]), true, true);
  assert(!names().includes('가디언 엔젤 슬라임'));
  assert(names().includes('스우'));
  // 직접 동선에 넣은 보스는 스케줄러에 없어도 남는다.
  assert(names().includes('벨룸'));
  assert.equal(engine.bosses().find(b => b.name === '벨룸').on, true);
  // 빠진 보스도 전체 보스 보기에서는 그대로 보이고 다시 넣을 수 있다.
  engine.showAll();
  assert(names().includes('가디언 엔젤 슬라임'));
});

test('목록 위 상태는 스케줄러 등록 수와 배율 출처를 짧은 배지로 보여주고 설명은 툴팁에 둔다', () => {
  const engine = loadPlanner();
  const db = require('../boss_db.json');
  engine.setBosses([
    {name:'윌', diff:'하드', mult:80, on:true, registered:true, completed:true},
    {name:'루시드', diff:'하드', mult:90, on:true, registered:true, manual:true},
    {name:'스우', diff:'하드', mult:90, on:true, registered:true},
    {name:'검은 마법사', diff:'하드', mult:90, on:false, registered:true},
    {name:'벨룸', diff:'카오스', mult:90, on:true},
  ].map((b, i) => ({id:'b' + i, extra:0, ...b})));
  engine.setSharedRates(db, engine.collectSharedRates('나', {snapshots:[{characterName:'나', preset:'00000', fetchedAt:'2026-11-14T03:00:00Z', rates:[{bossId:'Will|Hard', percent:150}, {bossId:'Lucid|Hard', percent:150}]}]}));
  engine.setPartyRates(db, {'Lotus|Hard':{total:300, name:'파티', count:2, id:'', scope:'local'}});
  engine.setPartyInfo({count:1, skipped:['혼자파티'], sharedFailed:false});
  engine.listRows();
  const html = engine.rateBadges();
  const labels = [...html.matchAll(/class="rate-badge[^"]*"[^>]*>([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(labels, ['스케줄러 등록 4마리', '공용 환산 배율 사용', '직접 입력 1마리', '파티 1개', '혼자 배율 1개']);
  assert.match(html, /data-tooltip="주간 3마리 · 월간 1마리 · 완료 1마리"/);
  assert.match(html, /data-tooltip="나 · 11월 14일 기록"/);
  assert.match(html, /동선 보스 1마리의 배율을 공용 환산 배율로 채웠습니다/);
  // 예전처럼 긴 문장으로 쓰지 않는다.
  assert.doesNotMatch(html, /배율 기본값으로 씁니다/);
});

test('버프 수가 같으면 파티 보스와 혼자 도는 보스를 한 버프에 섞지 않는다', () => {
  const engine = loadPlanner();
  // 파티 900초·800초, 혼자 850초·750초. 어느 쪽으로 묶어도 버프 2개이므로 파티끼리, 혼자끼리 묶는다.
  const make = (full, party) => ({full, riceSec:full, rice:false, party:party ? '파티' : ''});
  for (const items of [[make(900, true), make(850, false), make(800, true), make(750, false)], [make(850, false), make(900, true), make(750, false), make(800, true)]]) {
    const result = engine.packAll(items, 1800);
    assert.equal(result.bins.length, 2);
    for (const bin of result.bins) {
      const parties = bin.idx.filter(i => items[i].party).length;
      assert.ok(parties === 0 || parties === bin.idx.length, 'party and solo mixed: ' + JSON.stringify(bin.idx));
    }
  }
  // 섞어야만 버프가 줄어들면 버프 수를 우선한다.
  const tight = [make(1000, true), make(700, false)];
  assert.equal(engine.packAll(tight, 1800).bins.length, 1);
});

test('전체 동선에서 파티 보스는 버프 안에서 먼저 이어서 돌고 파티가 있는 버프를 먼저 보여준다', () => {
  const engine = loadPlanner();
  const db = require('../boss_db.json');
  engine.setBosses([
    {name:'윌', diff:'하드', mult:200, on:true},
    {name:'루시드', diff:'하드', mult:400, on:true},
    {name:'스우', diff:'하드', mult:100, on:true},
    {name:'데미안', diff:'하드', mult:400, on:true},
  ].map((b, i) => ({id:'b' + i, extra:0, ...b})));
  // 스우·데미안은 파티. 윌 10분, 루시드 5분, 스우(파티 400%) 5분, 데미안(파티 400%) 5분 → 한 버프에 들어간다.
  engine.setPartyRates(db, {'Lotus|Hard':{total:400, name:'스우팟', count:2, id:'p1', scope:'local'}, 'Damien|Hard':{total:400, name:'데미팟', count:2, id:'p2', scope:'local'}});
  engine.renderAll();
  const {pack} = engine.results();
  const route = [...pack.matchAll(/<li class="stop">.*?<span class="nm">([^<]+)</g)].map(m => m[1].trim());
  assert.deepEqual(route.slice(0, 2).sort(), ['데미안', '스우']);
  assert.deepEqual(route.slice(2), ['윌', '루시드']);
});
