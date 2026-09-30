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
    };
  }
  const context = vm.createContext({
    document:{
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement:element,
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

test('시간이 남아도 풀도핑과 쌀도핑 보스는 별도 버프에 묶는다', () => {
  const engine = loadPlanner();
  const items = [
    {full:200, riceSec:210, rice:false},
    {full:200, riceSec:210, rice:true},
    {full:200, riceSec:210, rice:false},
    {full:200, riceSec:210, rice:true},
  ];
  const result = engine.packAll(items, 1800);
  assert.equal(result.bins.length, 2);
  assert.equal(result.exact, true);
  for (const bin of result.bins) {
    assert.equal(bin.idx.length, 2);
    assert.ok(bin.idx.every(i => items[i].rice === !bin.full));
    assert.equal(engine.binCost(bin, items), bin.full ? 460 : 480);
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
    assert.ok(bin.idx.every(i => items[i].rice === !bin.full));
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
  assert.match(pack, /풀도핑 1판/);
  assert.match(pack, /쌀도핑 1판/);
  const [full, rice] = combos.split('<p class="note">쌀도핑 −3% 보스 조합</p>');
  assert.match(full, /데미안/);
  assert.doesNotMatch(full, /스우/);
  assert.match(rice, /스우/);
  assert.doesNotMatch(rice, /데미안/);
});
