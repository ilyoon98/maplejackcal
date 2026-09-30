const {test} = require('node:test');
const assert = require('node:assert/strict');
const {calculate} = require('../hunting_calc.js');
const base = {drop:200,mobs:38,meso:100,monster:260,sixMinuteKills:''};
test('30분 기본: 240젠 전부 처치, 로그식, 메소 최소·기대·최대',()=>{
  const r=calculate(base);
  assert.equal(r.kills,9120); assert.equal(r.measured,false);
  assert.ok(Math.abs(r.fragments-8.134221230877595)<1e-9);
  assert.deepEqual([r.pureLow,r.pure,r.pureHigh],[14227200,17784000,21340800]);
  assert.deepEqual([r.low,r.meso,r.high],[28454400,35568000,42681600]);
});
test('6분 실측값은 맵 마릿수보다 우선하고 0과 빈 입력을 구분',()=>{
  assert.equal(calculate({...base,sixMinuteKills:1500}).kills,7500);
  assert.equal(calculate({...base,mobs:undefined,sixMinuteKills:1500}).kills,7500);
  assert.equal(calculate({...base,sixMinuteKills:0}).kills,0);
  assert.equal(calculate({...base,sixMinuteKills:null}).kills,9120);
  assert.equal(calculate({...base,sixMinuteKills:undefined}).kills,9120);
});
test('아획 0·60·66·67·200%의 주머니 확률과 순수 메소에 반영',()=>{
  for (const [drop,probability] of [[0,.6],[60,.96],[66,.996],[67,1],[200,1]]) {
    const r=calculate({...base,drop});
    assert.ok(Math.abs(r.bag-probability)<1e-12);
    assert.ok(Math.abs(r.pure-17784000*probability)<1e-6);
    assert.ok(Math.abs(r.low-28454400*probability)<1e-6);
    assert.ok(Math.abs(r.high-42681600*probability)<1e-6);
  }
});
test('메획은 순수 메소·조각에 영향 없고 일일 상한은 적용하지 않음',()=>{
  const a=calculate({...base,meso:0}), b=calculate({...base,meso:200});
  assert.equal(a.pure,b.pure); assert.equal(a.fragments,b.fragments);
  assert.equal(b.meso,a.meso*3);
  assert.ok(calculate({...base,sixMinuteKills:100000}).pure>150000000);
  assert.equal(calculate({...base,monster:259}).fragments,0);
});
test('음수·소수 마릿수·범위 밖 입력 거부',()=>{
  for(const invalid of [{drop:NaN},{meso:-1},{monster:301},{monster:260.5},{mobs:1.5},{sixMinuteKills:-1},{sixMinuteKills:1.5},{sixMinuteKills:Infinity}]) assert.throws(()=>calculate({...base,...invalid}),RangeError);
});
