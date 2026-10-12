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
    window:options.mountPicker ? {NexonCharacters:{mount:options.mountPicker}} : {},
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
      applySchedulerState,
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
      mergeScheduler(data, preserveSelection) {
        const parsed = bossesFromScheduler(data);
        state.bosses = mergeSchedulerBosses(parsed.bosses, preserveSelection);
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
      async readShot(results) {
        window.BossShotReader = globalThis.BossShotReader = {readBlob:() => Promise.resolve(results)};
        await readShot({type:'image/png'});
        return shotRows;
      },
      shotPreview() { return shotResult.innerHTML; },
      shotStatus() { return shotStatus.textContent; },
      addProfile(name, character) { profiles.push({name, character, state:JSON.parse(JSON.stringify(state))}); renderProfiles(); },
      clickProfile(name) { const i = profiles.findIndex(p => p.name === name); profileBar.children[i].children[0].handlers.click(); },
      setCharacterPicker(selectCharacter) { characterPicker = {selectCharacter}; },
      characterInput() { return charInput; },
      setApiFetch(handler) { globalThis.fetch = handler; window.NexonKey = globalThis.NexonKey = {has:() => true, get:() => 'fake-key'}; },
      importCharacter,
      fetching() { return fetchBtn.disabled; },
      searchButton() { return fetchBtn; },
      applyShot,
      packAll,
      binCost,
      renderAll,
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
  const res = engine.applySchedulerState({boss_contents:[
    {content_name:'검은 마법사', difficulty:'hard', cycle:'bossMonthly', registration_flag:'false', complete_flag:'false'},
    {content_name:'검은 마법사', difficulty:'extreme', cycle:'bossMonthly', registration_flag:'true', complete_flag:'true'},
    {content_name:'듄켈', difficulty:'hard', cycle:'bossWeekly', registration_flag:'true', complete_flag:'false'},
  ]});
  assert.deepEqual(Array.from(res.changed), ['검은 마법사 하드→익스트림']);
  assert.equal(res.done, 1);
  const [bm, dk] = engine.bosses();
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

test('스크린샷 배율은 소수 둘째 자리와 1% 미만을 유지하고, 다른 난이도·불확실한 값은 제외한다', async () => {
  const engine = loadPlanner();
  engine.setBosses([
    {name:'스우', diff:'익스트림', mult:100},
    {name:'찬란한 흉성', diff:'노멀', mult:100},
    {name:'최초의 대적자', diff:'익스트림', mult:100},
    {name:'검은 마법사', diff:'익스트림', mult:100},
    {name:'윌', diff:'하드', mult:1006},
  ]);
  const row = (name, diff, value) => ({name, diff, value, score:1, scale:1.5, thumb:''});
  await engine.readShot([
    row('스우', '익스트림', 43.10), row('찬란한 흉성', '노멀', 26.13),
    row('최초의 대적자', '익스트림', 0.42), row('검은 마법사', '하드', 362.3),
    row('윌', '하드', null),
  ]);
  assert.match(engine.shotPreview(), /value="26.13"/);
  assert.match(engine.shotPreview(), /value="0.42"/);
  engine.applyShot();
  assert.deepEqual(Array.from(engine.bosses(), b => b.mult), [43.1, 26.13, 0.42, 100, 1006]);
  engine.reload();
  assert.deepEqual(['스우','찬란한 흉성','최초의 대적자','검은 마법사','윌'].map(name => engine.bosses().find(b => b.name === name).mult),
    [43.1, 26.13, 0.42, 100, 1006]);
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
  engine.applySchedulerState(data);
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

test('가려진 카드의 예전 배율은 유지한다고 안내하고 인식한 값만 적용한다', async () => {
  const engine = loadPlanner();
  engine.setBosses([
    {name:'벨로나', diff:'이지', mult:60016, on:true},
    {name:'선택받은 세렌', diff:'하드', mult:17679, on:true},
    {name:'더스크', diff:'카오스', mult:641506, on:true},
    {name:'윌', diff:'하드', mult:10176, on:true},
  ]);
  await engine.readShot([
    {name:'벨로나', diff:'이지', value:null, covered:true, score:1, scale:1, thumb:''},
    {name:'선택받은 세렌', diff:'하드', value:244.5, score:1, scale:1, thumb:''},
    {name:'더스크', diff:'카오스', value:1175, score:1, scale:1, thumb:''},
    {name:'윌', diff:'하드', value:1395, score:1, scale:1, thumb:''},
  ]);
  assert.match(engine.shotPreview(), /기존 60016%는 유지/);
  assert.match(engine.shotStatus(), /툴팁/);
  engine.applyShot();
  assert.deepEqual(Array.from(engine.bosses(), b => b.mult), [60016, 244.5, 1175, 1395]);
  assert.match(engine.shotStatus(), /읽지 못한 1개는 적용하지 않았으며 기존 배율이 유지/);
});

test('첨부 스크린샷을 넣으면 벨로나 60016%와 카링 14809%를 실제 소수점 배율로 교체한다', async () => {
  const {decodePng} = require('./helpers/png-rgba.cjs');
  require('../boss_shot_reader.js');
  const reader = globalThis.BossShotReader;
  const shot = decodePng(path.join(__dirname, 'fixtures/boss_shot_small.png'));
  const recognized = reader.analyze(shot, reader.siteRefs());
  const engine = loadPlanner();
  engine.setBosses([
    {name:'벨로나', diff:'이지', mult:60016, on:true},
    {name:'카링', diff:'이지', mult:14809, on:true},
  ]);
  await engine.readShot(recognized);
  assert.match(engine.shotPreview(), /value="176.4"/);
  assert.match(engine.shotPreview(), /value="209.7"/);
  engine.applyShot();
  assert.deepEqual(Array.from(engine.bosses(), b => b.mult), [176.4, 209.7]);
  engine.reload();
  assert.equal(engine.bosses().find(b => b.name === '벨로나').mult, 176.4);
  assert.equal(engine.bosses().find(b => b.name === '카링').mult, 209.7);
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
