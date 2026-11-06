const {test}=require('node:test');
const assert=require('node:assert/strict');
const data=require('../scouter_data.js');
const {scrape,createService,extractRenderedResult}=require('../server/scouter.cjs');
const {createHandler}=require('../api/scouter.js');
const {createSharedSource}=require('../api/scouter.js');
const party=require('../party_boss_scheduler.js');

function snapshot(name='토끼털쇼타'){
 return {schemaVersion:1,characterName:name,preset:'00000',sourceUrl:data.resultUrl(name,'00000'),fetchedAt:new Date().toISOString(),conditions:{view:'all',bossTimeMinutes:20,destinyChampion:true,simulation:false},rates:[{bossId:'Lotus|Extreme',percent:49.68,eligibility:'파티 최소컷'},{bossId:'TheFirstAdversary|Normal',percent:89.58,eligibility:'파티격 가능'}]};
}
test('보스와 난이도는 아이콘 코드로 매핑하며 데스티니·챔피언을 일반 난이도로 오인하지 않는다',()=>{
 const parsed=data.rowsToRates([{icon:'/bossIcon/extreme_lotus.png',percent:49.68},{icon:'/bossIcon/normal_adversary.png',percent:89.58},{icon:'/bossIcon/normal_maleficStar.png',percent:42.26},{icon:'/bossIcon/hard_verusHilla.png',percent:770.5},{icon:'/bossIcon/destiny_kalos.png',percent:20.91},{icon:'/bossIcon/champion_seren.png',percent:136.4}]);
 assert.deepEqual(parsed.rates.map(r=>r.bossId),['Lotus|Extreme','TheFirstAdversary|Normal','RadiantMalefic|Normal','VerusHilla|Hard']);assert.equal(parsed.unmapped.length,2);
 assert.equal(data.bossId('/bossIcon/normal_slime.png'),'GuardianAngelSlime|Normal');assert.equal(data.bossId('/bossIcon/hard_darknell.png'),'Dunkel|Hard');
});
test('수집한 0%는 유효하며 숫자 누락·중복 매핑·음수·무한대는 실패한다',()=>{
 assert.equal(data.rowsToRates([{icon:'/bossIcon/extreme_bardrix.png',percent:0}]).rates[0].percent,0);
 for(const percent of [null,-1,NaN,Infinity])assert.throws(()=>data.rowsToRates([{icon:'/bossIcon/extreme_lotus.png',percent}]),/SCOUTER_INVALID_PERCENT/);
 assert.throws(()=>data.rowsToRates([{icon:'/bossIcon/extreme_lotus.png',percent:1},{icon:'/bossIcon/extreme_lotus.png',percent:2}]),/SCOUTER_AMBIGUOUS_ROWS/);
});
test('다른 캐릭터·난이도 중복·다른 시간 조건·잘못된 출처의 응답은 반영하지 않는다',()=>{
 const s=snapshot();assert(data.normalizeSnapshot(s,s.characterName,s.preset));
 assert.equal(data.normalizeSnapshot(s,'다른캐릭터','00000'),null);
 assert.equal(data.normalizeSnapshot({...s,sourceUrl:'https://attacker.test'},s.characterName,s.preset),null);
 assert.equal(data.normalizeSnapshot({...s,conditions:{...s.conditions,bossTimeMinutes:30}},s.characterName,s.preset),null);
 assert.equal(data.normalizeSnapshot({...s,rates:[s.rates[0],s.rates[0]]},s.characterName,s.preset),null);
 assert.throws(()=>data.resultUrl('https://localhost/private','00000'),/SCOUTER_BAD_INPUT/);
});
test('서버는 동일 요청을 합치고 15분 캐시를 쓰며 만료 후 다시 수집한다',async()=>{
 let now=0,count=0,resolve;const wait=new Promise(r=>{resolve=r;});
 const service=createService({now:()=>now,collect:async()=>{count++;await wait;return snapshot();}});
 const first=service.get('토끼털쇼타'),second=service.get('토끼털쇼타');resolve();
 assert.deepEqual(await first,await second);assert.equal(count,1);assert.equal((await service.get('토끼털쇼타')).cached,true);
 now=900001;await service.get('토끼털쇼타');assert.equal(count,2);
});
test('실패 응답은 캐시하지 않고 동시 수집 수를 제한한다',async()=>{
 let count=0;const failed=createService({collect:async()=>{count++;throw Object.assign(new Error(),{code:'SCOUTER_BLOCKED'});}});
 await assert.rejects(failed.get('토끼털쇼타'));await assert.rejects(failed.get('토끼털쇼타'));assert.equal(count,2);
 let done;const busy=createService({maxConcurrent:1,collect:async name=>{await new Promise(r=>{done=r;});return snapshot(name);}});
 const active=busy.get('토끼털쇼타');await Promise.resolve();await assert.rejects(busy.get('다른캐릭터'),e=>e.code==='SCOUTER_BUSY');done();await active;
});
test('서버 API는 외부 URL·중복 이름·POST를 거부하고 차단 오류에 내부 정보를 노출하지 않는다',async()=>{
 const calls=[];const handler=createHandler({get:async(name,preset)=>{calls.push([name,preset]);return snapshot(name);}});
 function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=JSON.parse(body);}};}
 for(const url of ['/api/scouter?name=https://127.0.0.1','/api/scouter?name=토끼털쇼타&name=다른캐릭터','/api/scouter?name=토끼털쇼타&preset=../../']){const res=response();await handler({url,method:'GET'},res);assert.equal(res.statusCode,400);}
 const post=response();await handler({url:'/api/scouter?name=토끼털쇼타',method:'POST'},post);assert.equal(post.statusCode,405);assert.equal(calls.length,0);
 const ok=response();await handler({url:'/api/scouter?name=토끼털쇼타',method:'GET'},ok);assert.equal(ok.statusCode,200);assert.equal(ok.body.rates[0].percent,49.68);
 const blocked=createHandler({get:async()=>{throw Object.assign(new Error('secret-url'),{code:'SCOUTER_BLOCKED'});}}),res=response();await blocked({url:'/api/scouter?name=토끼털쇼타',method:'GET'},res);assert.equal(res.statusCode,503);assert.deepEqual(res.body,{error:{code:'SCOUTER_BLOCKED'}});
});

function browserHarness(raw,status=200){
 let closed=false,contextClosed=false,view='';
 const tab={click:async()=>{view='all';},waitFor:async()=>{}},close={count:async()=>0};
 const page={setDefaultTimeout(){},goto:async()=>({status:()=>status}),waitForFunction:async()=>{},getByRole:(role,args)=>role==='tab'?tab:close,evaluate:async()=>raw};
 return {options:{launchBrowser:async()=>({newContext:async()=>({newPage:async()=>page,close:async()=>{contextClosed=true;}}),close:async()=>{closed=true;}})},state:()=>({closed,contextClosed,view})};
}
test('수집기는 전체 보기 결과와 캐릭터·조건을 검증하고 성공·실패 모두 브라우저를 닫는다',async()=>{
 const raw={characterName:'토끼털쇼타',allView:true,bossTimeMinutes:20,destinyChampion:true,simulation:false,rows:[{icon:'/bossIcon/extreme_lotus.png',percent:49.68}]};
 const good=browserHarness(raw);assert.equal((await scrape('토끼털쇼타','00000',good.options)).rates[0].percent,49.68);assert.deepEqual(good.state(),{closed:true,contextClosed:true,view:'all'});
 for(const changed of [{...raw,characterName:'다른캐릭터'},{...raw,bossTimeMinutes:30},{...raw,simulation:null},{...raw,allView:false}]){const fake=browserHarness(changed);await assert.rejects(scrape('토끼털쇼타','00000',fake.options));assert.equal(fake.state().closed,true);}
 const blocked=browserHarness(raw,403);await assert.rejects(scrape('토끼털쇼타','00000',blocked.options),e=>e.code==='SCOUTER_BLOCKED');assert.equal(blocked.state().closed,true);
});
test('배율 클라이언트는 넥슨 키를 수집 서버에 보내지 않고 캐릭터가 일치하는 결과만 받는다',async()=>{
 let options;const api=party.scouterClient(async(url,opts)=>{options=opts;assert.equal(url,'/api/boss-rates');return {ok:true,json:async()=>({schemaVersion:1,snapshots:[snapshot()]})};});
 assert.equal((await api.load('토끼털쇼타')).rates[0].percent,49.68);assert.equal(options.headers,undefined);
 const mismatch=party.scouterClient(async()=>({ok:true,json:async()=>({schemaVersion:1,snapshots:[snapshot('다른캐릭터')]})}));await assert.rejects(mismatch.load('토끼털쇼타'),/RATE_NOT_SAVED/);
});
test('캐릭터의 자동 배율은 파티별 보스 난이도에 맞춰 반영하고 수동값·다른 캐릭터는 보존한다',()=>{
 const member=(ocid,mode='auto',rate=null)=>({character:{ocid},rateMode:mode,rate});
 const parties=[{bossId:'Lotus|Extreme',members:[member('a'),member('b','auto',25)]},{bossId:'TheFirstAdversary|Normal',members:[member('a'),member('b','manual',33)]},{bossId:'Lotus|Hard',members:[member('a','manual',900),member('a','auto',800)]}];
 party.applySnapshot(parties,'a',snapshot());assert.equal(parties[0].members[0].rate,49.68);assert.equal(parties[1].members[0].rate,89.58);assert.equal(parties[2].members[0].rate,900);assert.equal(parties[2].members[1].rate,null);assert.deepEqual(party.summary(parties[0].members),{total:74.68,missing:0});
});

test('실제로 관찰한 카드 DOM 구조에서 아이콘·소수 배율·0%·다른 화면의 퍼센트를 구분한다',()=>{
 const vm=require('node:vm');
 const images=[{icon:'/bossIcon/extreme_lotus.png',text:'파티 최소컷\n47,934\n49.68%'},{icon:'/bossIcon/extreme_bardrix.png',text:'입장 불가능\n3,548\n[파티] 0%'},{icon:'/bossIcon/hard_verusHilla.png',text:'솔플 여유컷\n49,666\n770.5%'}];
 const sim={getAttribute:()=> 'false'},simParent={querySelector:()=>sim};
 const heading={textContent:'Lv. 285 토끼털쇼타/ 렌'},simHeading={textContent:'추가 스펙 시뮬레이터',querySelector:()=>null,parentElement:simParent};
 const document={querySelectorAll(selector){if(selector==='h1,h2,h3,h4')return [heading,simHeading];if(selector==='[role="tab"]')return [{textContent:'전체 보기',getAttribute:()=> 'true'}];if(selector==='img[alt="boss"]')return images.map(row=>({getAttribute:()=>row.icon,closest:()=>({parentElement:{innerText:row.text}})}));return [];},getElementById:()=>({getAttribute:()=> 'true'}),body:{innerText:'최종뎀 99% · 적용중인 보스 시간 : 20 분'}};
 const raw=vm.runInNewContext('('+extractRenderedResult.toString()+')()',{document});assert.equal(raw.characterName,'토끼털쇼타');assert.equal(raw.rows.length,3);assert.equal(raw.rows[0].percent,49.68);assert.equal(raw.rows[1].percent,0);assert.equal(raw.rows[2].percent,770.5);assert.equal(raw.simulation,false);assert.equal(raw.allView,true);
});

test('이번 실제 브라우저 기록은 60행·지원 배율 49개이며 가져온 시각과 대표 배율이 공용 파일에 보존된다',()=>{
 const capture=require('../references/maplescouter/tokki-2026-11-07.json');
 const {convert}=require('../tools/import-scouter-snapshot.cjs');
 const store=require('../shared_scouter_snapshots.json');const imported=convert(capture);
 const stored=store.snapshots.find(s=>s.characterName==='토끼털쇼타');
 assert.deepEqual(stored,imported);assert.equal(stored.rowCount,60);assert.equal(stored.rates.length,49);assert.equal(stored.unmapped.length,11);assert.equal(stored.sourceRows.length,60);assert.equal(stored.fetchedAt,'2026-11-06T15:34:35.183Z');
 for(const [boss,rate] of [['Lotus|Extreme',49.68],['TheFirstAdversary|Normal',89.58],['RadiantMalefic|Normal',42.26]])assert.equal(stored.rates.find(r=>r.bossId===boss).percent,rate);
 assert(!JSON.stringify(store).includes('nxopen_api_key'));
});
test('두 독립 클라이언트는 공용 JSON에서 같은 실측값을 읽고 서버 수집을 호출하지 않는다',async()=>{
 const store=require('../shared_scouter_snapshots.json');const urls=[];
 const fetch=async(url,options)=>{urls.push(url);assert.equal(url,'/api/boss-rates');assert.equal(options.headers,undefined);return {ok:true,json:async()=>structuredClone(store)};};
 const a=await party.scouterClient(fetch).load('토끼털쇼타'),b=await party.scouterClient(fetch).load('토끼털쇼타');
 assert.deepEqual(a,b);assert.equal(a.storage,'public-json');assert.equal(urls.length,2);
});
test('서버 API도 공용 저장값을 먼저 읽으며 미등록 캐릭터만 수집기로 보낸다',async()=>{
 const store=require('../shared_scouter_snapshots.json');let calls=0;
 const service=createSharedSource({get:async name=>{calls++;return snapshot(name);}},store);
 const value=await service.get('토끼털쇼타','00000');assert.equal(value.storage,'public-json');assert.equal(value.rates.length,49);assert.equal(calls,0);
 await service.get('다른캐릭터','00000');assert.equal(calls,1);
 const old=structuredClone(store);old.snapshots[0].fetchedAt='2020-01-01T00:00:00Z';assert.equal(data.findShared(old,'토끼털쇼타','00000'),null);
});
