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
