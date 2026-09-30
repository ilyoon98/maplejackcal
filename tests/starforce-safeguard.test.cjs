const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {window:{}, document:{addEventListener(){}}};
vm.createContext(context);
for (const file of ['starforce_data.js','starforce_calc.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'), context);
}
const {StarforceData:data, StarforceCalc:calc} = context.window;
const base = {level:200,start:12,goal:22,spare:0,safeguard:{}};
const cost = opts => calc.calculate(opts).total.meso;

test('자동 방지는 노작값·이벤트·복귀 구간을 포함한 최소 비용 조합을 고른다',()=>{
  for (const spare of [0,1e9,1e11]) for (const start of [0,12,18,22]) {
    for (const lucky5 of [false,true]) for (const discount30 of [false,true]) {
      const opts = {...base,spare,start,goal:24,lucky5,discount30,destroyDown30:discount30};
      const selected = data.bestSafeguard(opts,cost);
      const actual = cost({...opts,safeguard:selected});
      for (let mask=0;mask<8;mask++) {
        const safeguard = Object.fromEntries(data.PROTECT_STARS.map((s,i)=>[s,!!(mask & (1<<i))]));
        assert.ok(actual <= cost({...opts,safeguard}), JSON.stringify(opts));
      }
      assert.deepEqual(opts.safeguard,{});
    }
  }
});
test('파괴가 없는 구간에서는 방지를 켜지 않고 비싼 노작에는 방지로 절약한다',()=>{
  const low = {...base,start:0,goal:10,spare:1e11};
  assert.ok(Object.values(data.bestSafeguard(low,cost)).every(x=>!x));
  const high = {...base,spare:1e11};
  const selected = data.bestSafeguard(high,cost);
  assert.ok(Object.values(selected).some(Boolean));
  assert.ok(cost({...high,safeguard:selected}) < cost(high));
});

test('확정 복구 자동 선택은 일반 복구와 항상 확정 복구보다 비싸지 않다',()=>{
  for (const level of [130,200,250]) for (const spare of [0,1e9,1e11]) {
    for (const goal of [17,22,24,30]) for (const discount30 of [false,true]) {
      const opts = {...base,level,spare,goal,discount30,destroyDown30:discount30};
      const auto = cost({...opts,recoveryMode:'auto'});
      assert.ok(auto <= cost(opts) + 1);
      assert.ok(auto <= cost({...opts,recoveryMode:'always'}) + 1);
      const best = data.bestSafeguard({...opts,recoveryMode:'auto'},cost);
      for (let mask=0;mask<8;mask++) {
        const safeguard = Object.fromEntries(data.PROTECT_STARS.map((s,i)=>[s,!!(mask & (1<<i))]));
        assert.ok(cost({...opts,recoveryMode:'auto',safeguard:best}) <= cost({...opts,recoveryMode:'auto',safeguard}) + 1);
      }
    }
  }
});

test('확정 복구 스페어 수·22성 상한·복구 할인과 재강화 비용을 반영한다',()=>{
  const opts = {...base,spare:1e9,goal:25,recoveryMode:'always'};
  const result = calc.calculate(opts);
  const at = s => result.recovery.find(r=>r.star===s);
  for (const [star,copies] of [[18,1],[19,2],[20,2],[21,3],[22,4],[24,4]]) {
    assert.equal(at(star).copies,copies);
  }
  assert.equal(at(24).restoreStar,22);
  const row22 = result.rows.find(r=>r.star===22);
  const row23 = result.rows.find(r=>r.star===23);
  assert.ok(Math.abs(at(24).fixedCost - at(24).fee - 4e9 - row22.meso - row23.meso) < 0.01);
  const discounted = calc.calculate({...opts,recoveryDiscount20:true});
  assert.equal(discounted.recovery.find(r=>r.star===22).fee,at(22).fee * 0.8);
  assert.ok(discounted.total.meso < result.total.meso);
  const single = calc.calculate({...opts,start:19,goal:20});
  const step = single.steps[19];
  const restore = single.recovery.find(r=>r.star===19);
  assert.ok(Math.abs(single.total.meso - (step.cost + step.d * (restore.fee + 2e9)) / step.p) < 0.01);
  assert.ok(Math.abs(single.total.destroys - step.d / step.p) < 1e-12);
  assert.ok(Math.abs(single.total.tries - 1 / step.p) < 1e-12);
});

test('저성 구간과 역방향 구간은 복구 비용을 추가하지 않는다',()=>{
  assert.equal(cost({...base,start:0,goal:15,recoveryMode:'auto'}),cost({...base,start:0,goal:15}));
  assert.equal(cost({...base,start:22,goal:12,recoveryMode:'auto'}),0);
});

test('기록 백분위 시뮬레이션은 파방·복구·노작값·할인을 반영한 평균과 일치한다',()=>{
  for (const recoveryMode of ['auto','off']) for (const discounted of [false,true]) {
    const opts = {...base,goal:20,spare:1.5e9,recoveryMode,discount30:discounted,
      destroyDown30:discounted,recoveryDiscount20:discounted,safeguard:{15:true,17:true}};
    let seed=7654321;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const gen=calc.sampleCosts(opts,20000,random,5000000);
    let next; do {next=gen.next();} while(!next.done);
    assert.equal(next.value.length,20000);
    const mean=next.value.reduce((sum,x)=>sum+x,0)/next.value.length;
    assert.ok(Math.abs(mean/cost(opts)-1)<0.04,`${recoveryMode} ${discounted}: ${mean/cost(opts)}`);
    assert.ok(next.value.every((v,i,a)=>i===0 || a[i-1]<=v));
  }
});

test('표본 계산 제한에 도달하면 편향된 부분 백분위를 반환하지 않는다',()=>{
  const gen=calc.sampleCosts({...base,recoveryMode:'auto'},5000,()=>0.5,1);
  assert.equal(gen.next().value,null);
  assert.equal(calc.sampleCosts({...base,start:22,goal:12},1,()=>0.5,100).next().value,null);
});

test('결과 UI가 노작값·복구 방법·파괴방지 안내를 렌더링하고 설정 변경을 반영한다',()=>{
  const nodes = new Map();
  function node() {
    return {innerHTML:'',textContent:'',value:'',dataset:{},children:[],listeners:{},classList:{toggle(){}},
      setAttribute(key,value){this[key]=value;},appendChild(child){this.children.push(child);},addEventListener(type,cb){this.listeners[type]=cb;}};
  }
  let ready;
  const ui = {window:{},localStorage:{getItem(){return null;},setItem(){}},document:{
    getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},
    createElement(){return node();},addEventListener(type,cb){ready=cb;}
  }};
  vm.createContext(ui);
  for (const file of ['starforce_data.js','starforce_calc.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ui);
  }
  ready();
  assert.ok(Number.isFinite(nodes.get('resMeso').dataset.expectedUsage));
  assert.equal(nodes.get('strategyTitle').textContent,'추천 강화 방식');
  assert.match(nodes.get('safeguardSummary').innerHTML,/15 → 16성/);
  assert.match(nodes.get('recoveryAdvice').innerHTML,/<td>3개<\/td>/);
  assert.equal(nodes.get('safeguardChips').children[0].disabled,true);
  nodes.get('safeguardSwitch').children.at(-1).listeners.click();
  assert.equal(nodes.get('strategyTitle').textContent,'선택한 강화 방식');
  assert.equal(nodes.get('safeguardChips').children.at(-1).disabled,false);
  nodes.get('shiningSwitch').children.at(-1).listeners.click();
  assert.equal(nodes.get('shiningSwitch').children.at(-1)['aria-checked'],'true');
  nodes.get('recoverySwitch').children.at(-1).listeners.click();
  assert.equal(nodes.get('recoverySwitch').children.at(-1)['aria-checked'],'false');
  assert.match(nodes.get('recoverySummary').innerHTML,/12성 복구/);
  assert.doesNotMatch(nodes.get('recoverySummary').innerHTML,/확정 복구/);
  assert.match(nodes.get('recoveryAdvice').innerHTML,/<td>3개<\/td>/);
  assert.match(nodes.get('safeguardAdvice').innerHTML,/손익분기/);
});
