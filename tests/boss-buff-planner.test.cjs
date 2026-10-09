const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPlanner() {
  const elements = new Map();
  function element() {
    return {
      value:'', innerHTML:'', textContent:'', classList:{toggle(){}},
      addEventListener(){}, setAttribute(){}, after(){}, append(){},
      appendChild(){}, replaceChildren(){},
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
      setBosses(bosses) { state.bosses = bosses; },
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
  const [full, rice] = combos.split('<p class="note">쌀도핑 −3% 보스 조합</p>');
  assert.match(full, /데미안/);
  assert.doesNotMatch(full, /스우/);
  assert.match(rice, /스우/);
  assert.doesNotMatch(rice, /데미안/);
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
