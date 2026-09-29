const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = require('../starforce_history_core.js');
test('장비 JSON은 정식 이름·띄어쓰기·별칭을 연결하고 미등록 장비는 구분한다',()=>{
  const info=C.itemInfo('루즈컨트롤머신마크');
  assert.equal(info.level,160);
  assert.equal(info.slot,'얼굴장식');
  assert.equal(info.set,'칠흑의 보스');
  assert.equal(C.itemInfo('루컨마'),info);
  assert.equal(C.itemInfo('여명의 가디언 엔젤 링'),null);
  assert.equal(C.itemInfo('에테르넬 없는장비'),null);
  assert.equal(C.itemInfo('에테르넬 메이지팬츠').slot,'하의');
  assert.equal(C.itemInfo('앱솔랩스 블레이드').slot,'보조무기');
  assert.equal(C.itemLevel('루컨마'),160);
  const generated=require('../equipment_data.js');
  assert.deepEqual(generated,require('../equipment_data.json'));
});
const row = (id, before=12, after=13, extra={}) => ({id, before_starforce_count:before, after_starforce_count:after, target_item:'테스트 장비', character_name:'테스터', world_name:'스카니아', item_upgrade_result:'성공', date_create:'2026-09-20T12:00:00+09:00', ...extra});
test('기록별 할인 범위와 파괴방지를 비용에 자동 반영',()=>{
  const data={baseCost:()=>1000,PROTECT_STARS:[15,16,17],PROTECT_COST_MULTIPLIER:3};
  const event={cost_discount_rate:'30%',starforce_event_range:'0~29'};
  const r=row('a',15,16,{starforce_event_list:[event],destroy_defence:'적용'});
  assert.equal(C.recordCost(r,200,data),2700);
  assert.equal(C.recordCost(r,200,data,{mvp:.1,pcRoom:true}),2550);
  assert.equal(C.recordCost({...r,destroy_defence:'미적용'},200,data),700);
  assert.equal(C.recordCost({...r,starforce_event_list:[{...event,starforce_event_range:'0~14'}]},200,data),3000);
  assert.equal(C.recordCost({...r,starforce_event_list:[{...event,starforce_event_range:'알 수 없음'}]},200,data),null);
  assert.equal(C.recordCost(r,null,data),null);
  assert.equal(C.recordCost({...r,upgrade_item:'펄스 인핸서'},200,data),null);
  assert.equal(C.itemLevel('에테르넬 메이지팬츠'),250);
  assert.equal(C.itemLevel('모르는 장비'),null);
});
test('이벤트가 섞여도 각 시도의 할인율은 독립 적용한다',()=>{
  const data={baseCost:()=>1000,PROTECT_STARS:[15,16,17],PROTECT_COST_MULTIPLIER:3};
  const records=[row('a'),row('b',13,14,{starforce_event_list:[{cost_discount_rate:'30',starforce_event_range:'전체'}]})];
  assert.equal(records.reduce((n,r)=>n+C.recordCost(r,200,data),0),1700);
  assert.equal(C.inEventRange('5,10,15',15),true);
  assert.equal(C.inEventRange('21성 이하',22),false);
});
test('빠른 연속 요청의 시작 간격은 최소 300ms',async()=>{
  let time=0;const starts=[];
  const request=C.pacedRequest(async()=>{starts.push(time);time+=20;return {};},{now:()=>time,wait:async ms=>{time+=ms;}});
  for(let i=0;i<6;i++)await request('/history/starforce',{count:1000});
  assert.deepEqual(starts,[0,300,600,900,1200,1500]);
});
test('429는 같은 커서를 지수 대기로 재시도하고 회복되면 계속한다',async()=>{
  let time=0;const starts=[],params=[];
  const request=C.pacedRequest(async(path,p)=>{starts.push(time);params.push(p);if(starts.length<3)throw Object.assign(new Error('limited'),{status:429});return {ok:true};},{now:()=>time,wait:async ms=>{time+=ms;}});
  assert.deepEqual(await request('/history/starforce',{cursor:'same'}),{ok:true});
  assert.deepEqual(starts,[0,1000,3000]);assert.ok(params.every(p=>p.cursor==='same'));
});
test('지속적인 한도 초과는 재시도 3회 후 멈추고 다른 오류는 재시도하지 않는다',async()=>{
  let calls=0,time=0;
  const request=C.pacedRequest(async()=>{calls++;throw Object.assign(new Error('limited'),{code:'OPENAPI00007'});},{now:()=>time,wait:async ms=>{time+=ms;}});
  await assert.rejects(request('/history/starforce',{}),/limited/);assert.equal(calls,4);assert.equal(time,7000);
  calls=0;await assert.rejects(C.pacedRequest(async()=>{calls++;throw new Error('invalid key');})('',{}),/invalid key/);assert.equal(calls,1);
});
test('Retry-After를 존중하며 긴 제한은 자동 재시도하지 않는다',async()=>{
  let time=0,calls=0;
  const request=C.pacedRequest(async()=>{if(++calls===1)throw Object.assign(new Error('limited'),{status:429,retryAfterMs:5000});return {};},{now:()=>time,wait:async ms=>{time+=ms;}});
  await request('',{});assert.equal(time,5000);
  await assert.rejects(C.pacedRequest(async()=>{throw Object.assign(new Error('daily'),{status:429,retryAfterMs:86400000});},{wait:async()=>assert.fail('must not wait a day')})('',{}),/daily/);
});
test('호출 제한 대기 중 취소하면 재요청하지 않는다',async()=>{
  const controller=new AbortController();let calls=0;
  const request=C.pacedRequest(async()=>{calls++;throw Object.assign(new Error('limited'),{status:429});},{signal:controller.signal,onRetry:()=>controller.abort()});
  await assert.rejects(request('',{}),{name:'AbortError'});assert.equal(calls,1);
  const waiting=new AbortController();const delay=C.abortableDelay(10000,waiting.signal);waiting.abort();await assert.rejects(delay,{name:'AbortError'});
});
test('KST 일자 검증과 2년 범위 지원',()=>{
  assert.deepEqual(C.days('2026-09-29','2026-09-30'),['2026-09-29','2026-09-30']);
  assert.throws(()=>C.days('2026-02-30','2026-03-01'));
  assert.equal(C.days('2026-08-01','2026-09-01').length,32);
  assert.equal(C.days('2024-09-29','2026-09-29').length,731);
  assert.throws(()=>C.days('2023-01-01','2026-09-01'));
  assert.throws(()=>C.days('2026-09-21','2026-09-20'));
});
test('전체 2년 조회가 빈 날짜도 빠짐없이 끝까지 진행된다',async()=>{
  let calls=0;
  const rows=await C.fetchHistory(async()=>{calls++;return {starforce_history:[],next_cursor:null};},'2024-09-29','2026-09-29');
  assert.equal(calls,731);assert.deepEqual(rows,[]);
});
test('중복 ID 제거, 날짜 범위와 시간순 정렬',()=>{
  const a=row('a'),b=row('b',13,14,{date_create:'2026-09-20T13:00:00+09:00'});
  assert.deepEqual(C.normalize([b,a,a,row('old',12,13,{date_create:'2026-09-19T00:00:00+09:00'})],'2026-09-20','2026-09-20').map(r=>r.id),['a','b']);
  assert.throws(()=>C.normalize([row('bad',-1)],'2026-09-20','2026-09-20'));
});
test('동일 장비 이름이어도 월드·캐릭터별로 분리한다',()=>{
  const rows=[row('a'),row('b',12,13,{world_name:'루나'}),row('c',12,13,{character_name:'다른캐릭터'})];
  assert.equal(C.grouped(rows,'').length,3);
  assert.equal(C.grouped(rows,'테스터').length,2);
  assert.equal(C.grouped(rows,'없는캐릭터').length,0);
});
test('다음 커서는 날짜 대신 전달하고 날짜별로 독립 조회한다',async()=>{
  const calls=[];
  const rows=await C.fetchHistory(async(path,params)=>{
    calls.push([path,params]);
    if(params.cursor) return {starforce_history:[row('a'),row('b')],next_cursor:null};
    if(params.date==='2026-09-20') return {starforce_history:[row('a')],next_cursor:'next'};
    return {starforce_history:[row('c',12,13,{date_create:'2026-09-21T00:00:00+09:00'})],next_cursor:''};
  },'2026-09-20','2026-09-21');
  assert.equal(rows.length,3);
  assert.deepEqual(calls[1][1],{count:1000,cursor:'next'});
  assert.equal(calls[2][1].date,'2026-09-21');
  assert.ok(calls.every(c=>!('ocid' in c[1])&&!('character_name' in c[1])));
});
test('반복 커서·API 오류·잘못된 응답은 부분 성공으로 처리하지 않는다',async()=>{
  await assert.rejects(C.fetchHistory(async()=>({starforce_history:[],next_cursor:'same'}),'2026-09-20','2026-09-20'),/다음 기록/);
  await assert.rejects(C.fetchHistory(async()=>({}),'2026-09-20','2026-09-20'),/응답/);
  let calls=0;
  await assert.rejects(C.fetchHistory(async()=>{if(++calls===2)throw new Error('rate limit');return {starforce_history:[row('a')],next_cursor:'x'};},'2026-09-20','2026-09-20'),/rate limit/);
});
test('기하분포와 정확한 최초 도달 횟수 누적확률 일치',()=>{
  const steps=Array.from({length:30},()=>({p:.25,d:0}));
  for(const n of [0,1,2,10,100]) assert.ok(Math.abs(C.countCDF(steps,12,13,n)-(1-Math.pow(.75,n)))<1e-12);
  assert.equal(C.countCDF(steps,12,14,1),0);
  assert.equal(C.countCDF(steps,12,14,2),.25*.25);
  assert.equal(C.countCDF(steps,12,14,20001),null);
});
test('파괴 후 12성 복귀가 성공까지의 분포에 반영된다',()=>{
  const steps=Array.from({length:30},()=>({p:1,d:0}));steps[13]={p:.5,d:.5};
  assert.equal(C.countCDF(steps,13,14,1),.5);
  assert.equal(C.countCDF(steps,13,14,2),.5);
  assert.equal(C.countCDF(steps,13,14,3),.75);
});
test('기존 엔진 기대 횟수와 CDF 생존확률 합이 일치한다',()=>{
  const context={window:{},document:{addEventListener(){}}};vm.createContext(context);
  for(const file of ['starforce_data.js','starforce_calc.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  const result=context.window.StarforceCalc.calculate({level:200,start:12,goal:17,spare:0,safeguard:{}});
  let mean=0;for(let n=0;n<400;n++)mean+=1-C.countCDF(result.steps,12,17,n);
  assert.ok(Math.abs(mean-result.total.tries)<1e-7);
});
test('장비 혼합·복구·특수 강화는 분석을 막고 정상 12성 복귀는 허용',()=>{
  assert.equal(C.pathIssue([row('a',15,0,{item_upgrade_result:'파괴'}),row('b',12,13)]),'');
  assert.match(C.pathIssue([row('a'),row('b',17,18)]),/이어지지/);
  assert.match(C.pathIssue([row('a',12,14)]),/다중/);
  assert.match(C.pathIssue([row('a',12,13,{upgrade_item:'펄스 인핸서'})]),/특수/);
  assert.match(C.pathIssue([row('a',12,13,{superior_item_flag:'적용'})]),/특수/);
});
