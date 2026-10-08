const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = require('../starforce_history_core.js');
test('완료 날짜는 빈 결과도 저장하고 실패한 페이지의 날짜는 다음에 재시도',async()=>{
  const saved=new Map(),cache={get:async d=>saved.get(d),set:async(d,rows)=>saved.set(d,{rows,savedAt:Date.now()})};
  const calls=[];
  await assert.rejects(C.fetchHistory(async(p,q)=>{
    calls.push(q);if(q.date==='2026-09-19')return {starforce_history:[]};
    if(!q.cursor)return {starforce_history:[row('a')],next_cursor:'next'};
    throw new Error('quota');
  },'2026-09-19','2026-09-20',null,{cache,refreshFrom:'2026-09-19'}),/quota/);
  assert.equal(saved.has('2026-09-19'),true);assert.equal(saved.has('2026-09-20'),false);
  const retry=[];
  const loaded=await C.fetchHistory(async(p,q)=>{retry.push(q);return {starforce_history:[row('a')]};},'2026-09-19','2026-09-20',null,{cache,refreshFrom:'2026-09-19'});
  assert.deepEqual(retry,[{count:1000,date:'2026-09-20'}]);assert.equal(loaded.length,1);
});
test('최근 날짜만 만료 후 갱신하며 요청 실패 시 기존 저장분을 제공',async()=>{
  const old=Date.now()-600000,seen=[],calls=[];
  const cache={get:async()=>({rows:[],savedAt:old}),set:async()=>{}};
  await assert.rejects(C.fetchHistory(async(p,q)=>{calls.push(q.date);throw new Error('quota');},'2026-09-18','2026-09-20',null,{cache,refreshFrom:'2026-09-19',newestFirst:true,onDay:(d,r,stale)=>seen.push([d,stale])}),/quota/);
  assert.deepEqual(calls,['2026-09-20']);assert.deepEqual(seen,[['2026-09-20',true],['2026-09-19',true],['2026-09-18',false]]);
});
test('저장소 오류로 API 조회가 중단되지 않는다',async()=>{
  let errors=0;
  const loaded=await C.fetchHistory(async()=>({starforce_history:[row('a')]}),'2026-09-20','2026-09-20',null,{cache:{get:async()=>{throw Error();},set:async()=>{throw Error();}},onCacheError:()=>errors++});
  assert.equal(errors,2);assert.equal(loaded.length,1);
});
test('장비 JSON은 정식 이름·띄어쓰기·별칭을 연결하고 미등록 장비는 구분한다',()=>{
  const info=C.itemInfo('루즈컨트롤머신마크');
  assert.equal(info.level,160);
  assert.equal(info.slot,'얼굴장식');
  assert.equal(info.set,'칠흑의 보스');
  assert.equal(C.itemInfo('루컨마'),info);
  assert.equal(C.itemInfo('여명의 가디언 엔젤 링').level,160);
  assert.equal(C.itemInfo('에테르넬 없는장비'),null);
  assert.equal(C.itemInfo('에테르넬 메이지팬츠').slot,'하의');
  assert.equal(C.itemInfo('앱솔랩스 블레이드').slot,'보조무기');
  assert.equal(C.itemLevel('루컨마'),160);
  const generated=require('../equipment_data.js');
  assert.deepEqual(generated,require('../equipment_data.json'));
});
test('사용자 지정 장신구·하트·블랙·아케인 장비의 레벨과 부위를 비용 계산에 사용한다',()=>{
  for(const [name,level,slot] of [
    ['마이스터링',140,'반지'],['트와일라이트 마크',140,'얼굴장식'],['분노한 자쿰의 벨트',150,'벨트'],['블랙빈 마크',135,'눈장식'],
    ['데이브레이크 펜던트',140,'펜던트'],['여명의 가디언 엔젤링',160,'반지'],['가디언 엔젤링',160,'반지'],['메커네이터 펜던트',120,'펜던트'],
    ['플라즈마 하트',130,'기계심장'],['페어리하트',100,'기계심장'],['에스텔라 이어링',160,'귀고리'],
    ['도미네이터 펜던트',140,'펜던트'],['골든 클로버 벨트',140,'벨트'],
    ['블랙 햇',100,'모자'],['블랙 슈트',100,'한벌옷'],['블랙 케이프',100,'망토'],['블랙 소드',100,'무기·보조무기'],
    ['아케인셰이드 메이지로브',200,'한벌옷'],['아케인셰이드 나이트슈트',200,'한벌옷'],['아케인셰이드 아처슈즈',200,'신발'],['아케인셰이드 파이렛케이프',200,'망토']
  ]){
    assert.equal(C.itemInfo(name).level,level,name);assert.equal(C.itemInfo(name).slot,slot,name);
    assert.equal(C.itemLevel(name),level,name);
  }
  assert.equal(C.itemInfo('블랙큐브'),null);
  assert.notEqual(C.itemInfo('여명의 가디언 엔젤링'),C.itemInfo('가디언 엔젤링'));
});
const row = (id, before=12, after=13, extra={}) => ({id, before_starforce_count:before, after_starforce_count:after, target_item:'테스트 장비', character_name:'테스터', world_name:'스카니아', item_upgrade_result:'성공', date_create:'2026-09-20T12:00:00+09:00', ...extra});
test('2026-03-19 개편 이후 null 스타캐치는 자동 보정으로 계산하고 과거·누락 기록은 구분한다',()=>{
  const data={baseCost:()=>1000,PROTECT_STARS:[15,16,17],PROTECT_COST_MULTIPLIER:3};
  const calculate=()=>({steps:Array.from({length:30},()=>({p:.5,d:0})),rows:Array.from({length:30},()=>({meso:2000}))});
  const modern=row('modern',13,14,{starcatch_result:null});
  const boundary={...modern,id:'boundary',date_create:'2026-03-19T12:00:00+09:00'};
  const older={...modern,id:'older',date_create:'2026-03-18T12:00:00+09:00'};
  assert.equal(C.attemptComparison(modern,{level:140},data,calculate).delta,1000);
  assert.equal(C.attemptComparison(boundary,{level:140},data,calculate).status,'complete');
  assert.equal(C.starcatchIssue([modern]),'');assert.match(C.starcatchLabel(modern),/자동/);
  for(const record of [older,row('missing')]){
    assert.equal(C.starcatchApplied(record),false);assert.equal(C.attemptComparison(record,{level:140},data,calculate).status,'excluded');
  }
  assert.equal(C.automaticStarcatch({...modern,date_create:'날짜 미확인'}),false);
  assert.equal(C.sessions([row('explicit',12,13,{starcatch_result:'성공'}),modern]).length,1);
});
test('시도별 손익은 성공에서도 비용을 차감하며 성공·유지·파괴 가중 평균이 0이다',()=>{
  const context={window:{},document:{addEventListener(){}}};vm.createContext(context);
  for(const file of ['starforce_data.js','starforce_calc.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  const data=context.window.StarforceData,calculate=context.window.StarforceCalc.calculate,cache=new Map();
  for(const star of [0,12,13,15,17,22])for(const safeguard of [false,true]){
    if(safeguard&&!data.PROTECT_STARS.includes(star))continue;
    const options={level:200,spare:100000000,mvp:.05,pcRoom:true};
    const extra={starcatch_result:'성공',destroy_defence:safeguard?'사용':'미사용'};
    const success=C.attemptComparison(row('s',star,star+1,extra),options,data,calculate,cache);
    const failure=C.attemptComparison(row('f',star,star,{...extra,item_upgrade_result:'실패'}),options,data,calculate,cache);
    const step=calculate({...options,start:0,goal:30,safeguard:safeguard?{[star]:true}:{}}).steps[star];
    assert.equal(success.actual,success.cost);
    assert.equal(success.cost,step.cost);
    assert.ok(Math.abs(success.reference-success.cost-success.delta)<1e-6);
    assert.equal(failure.delta,-failure.cost);
    let mean=step.p*success.delta+(1-step.p-step.d)*failure.delta;
    if(step.d){
      const destroyed=C.attemptComparison(row('d',star,0,{...extra,item_upgrade_result:'파괴'}),options,data,calculate,cache);
      assert.ok(destroyed.reference<0);assert.equal(destroyed.actual,destroyed.cost+options.spare);
      mean+=step.d*destroyed.delta;
    }
    assert.ok(Math.abs(mean)<Math.max(1,Math.abs(success.reference))*1e-10,'star '+star+' expected score '+mean);
  }
});
test('목표·연속성 없이 시도 손익을 합산하고 특수 재화는 분리하며 공백을 잇지 않는다',()=>{
  const data={baseCost:()=>1000,PROTECT_STARS:[15,16,17],PROTECT_COST_MULTIPLIER:3};
  let calculations=0;
  const calculate=()=>{calculations++;return {steps:Array.from({length:30},()=>({p:.5,d:0})),rows:Array.from({length:30},()=>({meso:2000}))};};
  const records=[row('s',13,14,{starcatch_result:'성공'}),row('special',14,15,{starcatch_result:'성공',upgrade_item:'펄스 인핸서'}),row('f',14,14,{starcatch_result:'성공',item_upgrade_result:'실패'})];
  const totals=C.aggregateAttempts(C.grouped(records,''),()=>({level:140}),data,calculate);
  assert.equal(totals.delta,0);assert.equal(totals.actual,2000);assert.equal(totals.reference,2000);assert.equal(totals.gains,1000);assert.equal(totals.losses,1000);assert.equal(totals.excludedRecords,1);assert.equal(calculations,1);
  const normal=C.currencyRows(records,'normal');assert.equal(normal.length,2);assert.equal(normal[1].history_gap_before,true);
  assert.equal(C.currencyRows(records,'special')[0].id,'special');assert.equal(C.sessions(normal).length,2);assert.match(C.pathIssue(normal),/필터/);
  assert.equal(C.specialCurrency(row('m',12,13,{upgrade_item:' 메소 '})),false);
});
test('시도별 기대비용은 이벤트 확정 성공·할인·파괴 감소를 반영하고 모순된 기록은 제외한다',()=>{
  const context={window:{},document:{addEventListener(){}}};vm.createContext(context);
  for(const file of ['starforce_data.js','starforce_calc.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  const data=context.window.StarforceData,calculate=context.window.StarforceCalc.calculate;
  const options={level:140,spare:10000000,mvp:.1,pcRoom:true};
  const events=[{cost_discount_rate:'30%',starforce_event_range:'전체'},{success_rate:'100%',starforce_event_range:'5,10,15'},{destroy_decrease_rate:'30%',starforce_event_range:'21 이하'}];
  const extra={starcatch_result:'성공',starforce_event_list:events};
  const model=calculate({...options,start:0,goal:30,discount30:true,lucky5:true,destroyDown30:true});
  for(const star of [5,15,20,22]){
    const success=C.attemptComparison(row('s',star,star+1,extra),options,data,calculate);
    const failure=C.attemptComparison(row('f',star,star,{...extra,item_upgrade_result:'실패'}),options,data,calculate);
    const broken=C.attemptComparison(row('d',star,0,{...extra,item_upgrade_result:'파괴'}),options,data,calculate);
    const step=model.steps[star];assert.equal(success.expected,model.rows[star].meso);assert.equal(success.cost,step.cost);
    if(step.p===1){assert.equal(success.delta,0);assert.equal(failure.status,'excluded');assert.equal(broken.status,'excluded');}
    else {const mean=step.p*success.delta+(1-step.p-step.d)*failure.delta+step.d*broken.delta;assert.ok(Math.abs(mean)<success.expected*1e-10);}
  }
  const partial=C.attemptComparison(row('partial',13,14,{...extra,starforce_event_list:[{cost_discount_rate:'30%',starforce_event_range:'0~14'}]}),options,data,calculate);
  assert.equal(partial.status,'complete');assert.equal(partial.cost,C.recordCost(row('partial',13,14,{...extra,starforce_event_list:[{cost_discount_rate:'30%',starforce_event_range:'0~14'}]}),140,data,options));
  const noCatch=C.attemptComparison(row('no-catch',13,14,{starcatch_result:'실패'}),options,data,calculate);
  assert.equal(noCatch.status,'complete');assert.equal(noCatch.expected,noCatch.cost/.35);
});

test('스타캐치 미적용과 구간별 이벤트 손익은 성공·유지·파괴를 확률로 가중하면 0이다',()=>{
  const context={window:{},document:{addEventListener(){}}};vm.createContext(context);
  for(const file of ['starforce_data.js','starforce_calc.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  const data=context.window.StarforceData,calculate=context.window.StarforceCalc.calculate,options={level:200,spare:1500000000,mvp:.05,pcRoom:true};
  for(const catchResult of ['실패','미적용',false,'성공'])for(const star of [13,16,19]){
    const extra={starcatch_result:catchResult,starforce_event_list:[{cost_discount_rate:'20%',starforce_event_range:'0~16'},{destroy_decrease_rate:'30%',starforce_event_range:'15~21'}]};
    const success=C.attemptComparison(row('s',star,star+1,extra),options,data,calculate),failure=C.attemptComparison(row('f',star,star,{...extra,item_upgrade_result:'실패'}),options,data,calculate),broken=C.attemptComparison(row('d',star,0,{...extra,item_upgrade_result:'파괴'}),options,data,calculate);
    assert.equal(success.status,'complete');assert.equal(failure.status,'complete');
    const rates=catchResult==='성공'?data.RATES[star]:data.BASE_RATES[star],p=rates.success,d=rates.destroy*(star>=15&&star<=21?.7:1);
    assert.ok(Math.abs(p*success.delta+(1-p-d)*failure.delta+(d?d*broken.delta:0))<success.expected*1e-10);
  }
});
test('기록별 할인 범위와 파괴방지를 비용에 자동 반영',()=>{
  const data={baseCost:()=>1000,PROTECT_STARS:[15,16,17],PROTECT_COST_MULTIPLIER:3};
  const event={cost_discount_rate:'30%',starforce_event_range:'0~29'};
  const r=row('a',15,16,{starforce_event_list:[event],destroy_defence:'적용'});
  assert.equal(C.recordCost(r,200,data),2700);
  assert.equal(C.recordCost(r,200,data,{mvp:.1,pcRoom:true}),2550);
  assert.equal(C.recordCost({...r,destroy_defence:'미적용'},200,data),700);
  assert.equal(C.recordCost({...r,starforce_event_list:[{...event,starforce_event_range:'0~14'}]},200,data),3000);
  assert.equal(C.recordCost({...r,starforce_event_list:[{...event,starforce_event_range:'알 수 없음'}]},200,data),null);
  assert.equal(C.recordCost({...r,starforce_event_list:[null]},200,data),null);
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
test('총 사용 메소는 강화비와 입력한 파괴 대체 장비비를 더하고 누락 사유를 보존한다',()=>{
  const data={baseCost:()=>1000,PROTECT_STARS:[15,16,17],PROTECT_COST_MULTIPLIER:3};
  const records=[row('a'),row('b',15,0,{item_upgrade_result:'파괴'}),row('c',13,14,{upgrade_item:'펄스 인핸서'})];
  const totals=C.costTotals(records,200,data,{spare:10000});
  assert.equal(totals.cost,2000);assert.equal(totals.count,2);assert.equal(totals.spareCost,10000);assert.equal(totals.total,12000);
  assert.deepEqual(totals.reasons,{'특수 강화 재화 사용':1});assert.equal(totals.unpricedDestroy,0);
  assert.equal(C.costTotals(records,200,data).unpricedDestroy,1);
  const unknown=C.costTotals(records,null,data,{spare:10000});
  assert.equal(unknown.cost,0);assert.equal(unknown.total,10000);assert.equal(unknown.reasons['장비 레벨 미확인'],3);
  assert.equal(C.costTotals([],200,data).total,0);
});
test('저장 설정은 유효한 레벨·할인·장비값만 복원한다',()=>{
  const valid={level:200,mvp:.05,pcRoom:true,spare:100000000};
  assert.deepEqual(C.cleanSettings(valid),valid);
  for(const invalid of [{...valid,level:0},{...valid,mvp:.99},{...valid,pcRoom:'false'},{...valid,spare:-1},{...valid,spare:1.5},null])assert.equal(C.cleanSettings(invalid),null);
});
test('연속 구간 후보는 정상 파괴 복귀를 유지하고 흐름·조건 변경을 분리한다',()=>{
  const records=[row('a',15,0,{item_upgrade_result:'파괴',starcatch_result:'성공'}),row('b',12,13,{starcatch_result:'성공'}),row('c',17,18,{starcatch_result:'성공'}),row('d',18,19,{starcatch_result:'성공',starforce_event_list:[{cost_discount_rate:'30',starforce_event_range:'전체'}]})];
  assert.deepEqual(C.sessions(records),[{from:1,to:2,reason:'전체 시작'},{from:3,to:3,reason:'별 흐름 단절'},{from:4,to:4,reason:'이벤트 변경'}]);
  assert.deepEqual(C.sessions([]),[]);
  assert.equal(C.starcatchIssue(records),'');assert.match(C.starcatchIssue([row('missing')]),/스타캐치/);
  assert.match(C.starcatchIssue([row('failed',12,13,{starcatch_result:'실패'})]),/스타캐치/);
  assert.equal(C.sessions([row('a',15,15),row('b',15,16,{destroy_defence:'사용'})])[1].reason,'파괴방지 조건 변경');
  assert.equal(C.eventSignature({starforce_event_list:[{a:1,b:2},{c:3}]}),C.eventSignature({starforce_event_list:[{c:3},{b:2,a:1}]}));
});
test('확정된 과거 날짜는 30일 이후에도 재사용하고 반영 완료 전에 저장한 날짜만 갱신한다',async()=>{
  let requests=0;const seen=[];
  const cache={get:async()=>({rows:[],savedAt:Date.now()-31*86400000}),set:async()=>{}};
  const loaded=await C.fetchHistory(async()=>{requests++;throw new Error('must not fetch');},'2024-09-20','2024-09-20',null,{cache,refreshFrom:'2026-09-19',onDay:(date,records,stale)=>seen.push(stale)});
  assert.equal(requests,0);assert.deepEqual(loaded,[]);assert.deepEqual(seen,[false]);
  const unsettled={get:async()=>({rows:[],savedAt:Date.parse('2024-09-20T23:59:00+09:00')})};
  await assert.rejects(C.fetchHistory(async()=>{requests++;throw new Error('offline');},'2024-09-20','2024-09-20',null,{cache:unsettled,refreshFrom:'2026-09-19'}),/offline/);
  assert.equal(requests,1);
});

test('저장된 기록을 모두 먼저 전달하고 최근 날짜 갱신은 기존 ID를 보존하며 새 값으로 교체한다',async()=>{
  const events=[],saved=new Map();
  const cache={get:async date=>date==='2026-09-20'?{rows:[row('a'),row('keep',13,14)],savedAt:Date.now()-600000}:undefined,set:async(date,records)=>saved.set(date,records)};
  const loaded=await C.fetchHistory(async()=>{events.push('network');return {starforce_history:[row('a',12,12,{item_upgrade_result:'실패'}),row('new',14,15)]};},'2026-09-20','2026-09-20',null,{cache,refreshFrom:'2026-09-19',onDay:(date,records)=>events.push(records.map(r=>r.id)),onCacheReady:()=>events.push('ready')});
  assert.deepEqual(events.slice(0,3),[['a','keep'],'ready','network']);
  assert.deepEqual(loaded.map(r=>r.id),['a','new','keep']);assert.equal(loaded[0].after_starforce_count,12);
  assert.deepEqual(saved.get('2026-09-20'),loaded);
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
  assert.equal(C.grouped(rows,'테스터','루나').length,1);
  assert.equal(C.grouped(rows,'','스카니아').length,2);
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
