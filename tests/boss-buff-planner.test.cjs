const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPlanner() {
  const elements = new Map();
  function element() {
    return {
      handlers:{}, children:[],
      value:'', innerHTML:'', textContent:'', classList:{toggle(){}},
      addEventListener(name, callback){ this.handlers[name] = callback; }, setAttribute(){}, after(){}, append(){},
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
      querySelector(){ return null; },
    },
    localStorage:{getItem:() => null, setItem(){}},
    window:{},
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
      setDoping(value) { state.doping = normalizeDoping(value); },
      doping() { return state.doping; },
      riceRate,
      riceLabel,
      changeDoping(id, mode, checked) { dopingListEl.handlers.change({target:{dataset:{buff:id, mode}, checked}}); },
      dopingSummary() { return dopingSummaryEl.textContent; },
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
        return listEl.children.slice(-state.bosses.length).map(row => row.innerHTML);
      },
      async readShot(results) {
        window.BossShotReader = globalThis.BossShotReader = {readBlob:() => Promise.resolve(results)};
        await readShot({type:'image/png'});
        return shotRows;
      },
      shotPreview() { return shotResult.innerHTML; },
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

test('제공 표의 최종뎀은 곱연산으로 역산하고 풀도핑 배율은 보존한다', () => {
  const engine = loadPlanner();
  engine.setDoping({rice:{collector:false, master:false, hero:false}});
  const expected = 1.00832 / (1.01804 * 1.01608);
  assert.ok(Math.abs(engine.riceRate() - expected) < 1e-12);
  engine.setBosses([{name:'스우', mult:400, rice:true, on:true}]);
  const [item] = engine.activeItems();
  assert.equal(item.mult, 400);
  assert.equal(item.full, 300);
  assert.equal(item.riceSec, Math.round(300 / expected));
});

test('공마30 버프는 각각 0.844%이고 기준에 없는 버프는 손실에서 제외한다', () => {
  const engine = loadPlanner();
  const all = Object.fromEntries(Object.keys(engine.doping().full).map(id => [id, true]));
  engine.setDoping({rice:{...all, mvp:false, union:false}});
  assert.ok(Math.abs(engine.riceRate() - 1 / (1.00844 ** 2)) < 1e-12);
  engine.setDoping({full:{union:false}, rice:{...all, mvp:false}});
  assert.equal(engine.doping().rice.union, false);
  assert.ok(Math.abs(engine.riceRate() - 1 / 1.00844) < 1e-12);
});

test('두 도핑이 같으면 손실이 없고 여유 시간·윌 추가 시간은 보정 뒤에 더한다', () => {
  const engine = loadPlanner();
  const all = Object.fromEntries(Object.keys(engine.doping().full).map(id => [id, true]));
  engine.setDoping({rice:all});
  assert.equal(engine.riceRate(), 1);
  engine.setDoping({rice:{...all, sayram:false}});
  engine.setBosses([{name:'윌', mult:400, extra:4, on:true, rice:true}]);
  engine.setSlack(30);
  const [item] = engine.activeItems();
  assert.equal(item.full, 630);
  assert.equal(item.riceSec, Math.round(Math.round(300 * 1.05825) * 1.3) + 240);
});

test('도핑 선택은 저장 복원 뒤에도 유지한다', () => {
  const engine = loadPlanner();
  engine.setDoping({full:{vip:false}, rice:{sayram:false, collector:true}});
  const rate = engine.riceRate();
  engine.reload();
  assert.equal(engine.doping().full.vip, false);
  assert.equal(engine.doping().rice.vip, false);
  assert.equal(engine.doping().rice.sayram, false);
  assert.equal(engine.doping().rice.collector, true);
  assert.equal(engine.riceRate(), rate);
});

test('체크박스 변경은 요약과 동선을 갱신하고 쌀도핑 시간 입력을 역산한다', () => {
  const engine = loadPlanner();
  engine.setBosses([{name:'스우', mult:400, rice:true, on:true}]);
  engine.changeDoping('collector', 'rice', true);
  assert.equal(engine.doping().rice.collector, true);
  assert.match(engine.dopingSummary(), /최종뎀 감소/);
  const expectedMult = Math.round(400 / engine.riceRate() * 10) / 10;
  assert.equal(engine.inputBossTime(0, 5), String(expectedMult));
  assert.equal(engine.activeItems()[0].riceSec, 300);
  engine.changeDoping('hero', 'full', false);
  assert.equal(engine.doping().rice.hero, false);
  engine.changeDoping('master', 'rice', true);
  assert.equal(engine.riceRate(), 1);
  assert.match(engine.dopingSummary(), /풀도핑과 동일/);
});

test('명장·전영비·고대비는 각 조합에서 하나만 선택하고 비약 교체 효과를 계산한다', () => {
  const engine = loadPlanner();
  const group = ['master', 'legend', 'hero'];
  assert.equal(engine.doping().full.master, true);
  assert.equal(engine.doping().rice.legend, true);
  engine.changeDoping('hero', 'rice', true);
  assert.equal(engine.doping().rice.legend, false);
  assert.equal(engine.doping().full.master, true);
  assert.ok(Math.abs(engine.riceRate() - 1.01085 / (1.01608 * 1.01804)) < 1e-12);
  engine.changeDoping('legend', 'full', true);
  assert.equal(engine.doping().full.master, false);
  assert.equal(engine.doping().rice.hero, true);
  engine.reload();
  for (const mode of ['full', 'rice']) {
    assert.equal(group.filter(id => engine.doping()[mode][id]).length, 1);
  }
  engine.changeDoping('hero', 'rice', false);
  assert.equal(group.filter(id => engine.doping().rice[id]).length, 0);
});

test('예전 저장값에 비약이 중복되어 있으면 각 조합에서 하나만 복원한다', () => {
  const engine = loadPlanner();
  engine.setDoping({full:{master:true, legend:true, hero:true}, rice:{master:false, legend:true, hero:true}});
  assert.equal(engine.doping().full.master, true);
  assert.equal(engine.doping().full.legend, false);
  assert.equal(engine.doping().full.hero, false);
  assert.equal(engine.doping().rice.hero, true);
  assert.equal(engine.doping().rice.legend, false);
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

test('처음부터 주간·월간 전체 보스가 보이고 기본 12보스만 동선에 포함한다', () => {
  const engine = loadPlanner();
  assert.equal(engine.bosses().length, 25);
  assert.equal(new Set(Array.from(engine.bosses(), b => b.name)).size, 25);
  assert.equal(engine.activeItems().length, 12);
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
  const row = engine.listRows()[order.indexOf('벨로나')];
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
