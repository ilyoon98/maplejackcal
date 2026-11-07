'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const catalog=require('../rate_catalog.js');const {createStore,redisCommand,WRITE}=require('../server/rate-store.cjs');
const {createHandler}=require('../api/boss-rates.js');
function snapshot(name='테스트캐릭터',percent=49.68){return catalog.snapshot(name,[{bossId:'Lotus|Extreme',percent}],'manual');}
function backend(){const db=new Map();return async args=>{
 if(args[0]==='HVALS')return [...(db.get(args[1])||new Map()).values()];
 assert.equal(args[0],'EVAL');assert.equal(args[1],WRITE);const [, , ,key,id,expected,value,seedRevision]=args;let entries=db.get(key);if(!entries){entries=new Map();db.set(key,entries);}const old=entries.get(id);if((old?JSON.parse(old).revision:seedRevision)!==expected)return 0;entries.set(id,value);return 1;
};}
async function call(handler,method='GET',body,headers={}){let output;const res={setHeader(){},end(s){output=JSON.parse(s);}};await handler({method,url:'/api/boss-rates',body,headers:{'content-type':'application/json',...headers}},res);return {status:res.statusCode,body:output};}
test('독립 서버 인스턴스가 같은 DB 값을 읽고 동일 캐릭터의 충돌은 거부한다',async()=>{
 const command=backend(),a=createStore({command}),b=createStore({command});const first=await a.save(snapshot(),'');
 const fromB=(await b.read()).snapshots.find(s=>s.characterName==='테스트캐릭터');assert.equal(fromB.rates[0].percent,49.68);assert.equal(fromB.revision,first.revision);
 const results=await Promise.allSettled([a.save(snapshot('테스트캐릭터',50),first.revision),b.save(snapshot('테스트캐릭터',60),first.revision)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.message,'RATE_CONFLICT');
 await b.save(snapshot('다른캐릭터',0),'');assert.equal((await a.read()).snapshots.find(s=>s.characterName==='다른캐릭터').rates[0].percent,0);
});
test('기존 공개 배율은 초기값으로 유지하고 서버에서 수정한 값이 우선한다',async()=>{
 const a=createStore({command:backend()});const seed=(await a.read()).snapshots[0];assert.equal(seed.revision,'seed');await a.save({...seed,rates:[{bossId:'Lotus|Extreme',percent:55}]},'seed');assert.equal((await a.read()).snapshots[0].rates[0].percent,55);
});
test('DB 미설정은 읽기 전용으로 표시하고 저장 성공을 반환하지 않는다',async()=>{
 const handler=createHandler(createStore({command:null}),{});const read=await call(handler);assert.equal(read.status,200);assert.equal(read.body.persistent,false);assert(read.body.snapshots.length);
 const write=await call(handler,'POST',{snapshot:snapshot(),expectedRevision:''});assert.equal(write.status,503);assert.equal(write.body.error.code,'RATE_DB_NOT_CONFIGURED');
});
test('서버는 계산 조건·중복·악성값·과대 본문을 거부하고 DB 오류를 숨긴다',async()=>{
 const handler=createHandler(createStore({command:backend()}),{});for(const s of [{...snapshot(),conditions:{bossTimeMinutes:30}},{...snapshot(),rates:[{bossId:'Lotus|Extreme',percent:-1}]},{...snapshot(),rates:[...snapshot().rates,...snapshot().rates]}])assert.equal((await call(handler,'POST',{snapshot:s,expectedRevision:''})).status,400);
 assert.equal((await call(handler,'POST',{padding:'x'.repeat(70000)})).status,413);
 const bad=createHandler({read(){throw new Error('secret-db-token');}},{});const output=await call(bad);assert.equal(output.status,503);assert(!JSON.stringify(output).includes('secret-db-token'));
});
test('교차 출처 쓰기와 잘못된 PIN을 거부하며 올바른 PIN만 쓴다',async()=>{
 const handler=createHandler(createStore({command:backend()}),{RATE_EDIT_PIN:'test-pin'});const body={snapshot:snapshot(),expectedRevision:''};assert.equal((await call(handler,'POST',body,{'sec-fetch-site':'cross-site'})).status,403);assert.equal((await call(handler,'POST',body)).status,401);assert.equal((await call(handler,'POST',body,{'x-rate-pin':'test-pin'})).status,200);
});
test('Upstash 주소·토큰은 서버의 Authorization 헤더에만 있고 오류로 노출하지 않는다',async()=>{
 let request;const command=redisCommand({UPSTASH_REDIS_REST_URL:'https://example.upstash.io',UPSTASH_REDIS_REST_TOKEN:'test-secret'},async(url,options)=>{request={url,options};return {ok:true,json:async()=>({result:[]})};});await command(['HVALS','maplejackcal:boss-rates:v1']);assert.equal(request.options.headers.Authorization,'Bearer test-secret');assert(!request.options.body.includes('test-secret'));assert.equal(redisCommand({}),null);
});
test('캡처 검토는 가려짐·불확실·미인식·중복을 자동 선택하지 않고 누락을 0으로 만들지 않는다',()=>{
 const choices=catalog.choices(require('../boss_db.json')),raw=[{name:'스우',diff:'익스트림',value:0,sure:true},{name:'데미안',diff:'하드',value:60,sure:false},{name:'카링',diff:'하드',value:null,sure:true},{name:'루시드',diff:'노멀',value:50,sure:false},{name:'윌',diff:'하드',value:10,sure:true,covered:true}];const rows=catalog.shotRows(raw,choices);assert.deepEqual(rows.map(r=>r.selected),[true,false,false,false,false]);const old=[{bossId:'Damien|Hard',percent:100}];assert.deepEqual(catalog.applyShot(old,rows,choices),[...old,{bossId:'Lotus|Extreme',percent:0,eligibility:''}]);rows[1].selected=true;rows[1].bossId=rows[0].bossId;assert.throws(()=>catalog.applyShot(old,rows,choices),/SHOT_DUPLICATE/);
});
test('실제 캡처의 카드들을 공용 배율 보스·난이도에 연결한다',()=>{
 require('../boss_shot_reader.js');const {decodePng}=require('./helpers/png-rgba.cjs');const reader=globalThis.BossShotReader;const result=reader.analyze(decodePng(require('node:path').join(__dirname,'fixtures/boss_shot_1.png')),reader.siteRefs());const rows=catalog.shotRows(result,catalog.choices(require('../boss_db.json')));assert.equal(rows.length,47);assert(rows.filter(r=>r.selected).length>=40);assert.equal(rows.find(r=>r.bossId==='Lotus|Extreme').value,41.22);assert.equal(rows.find(r=>r.bossId==='Kaling|Extreme').selected,false);
});
test('공용 저장 클라이언트는 실패를 성공으로 취급하지 않고 로컬 초안으로 공용 값을 대체하지 않는다',async()=>{
 await assert.rejects(catalog.saveShared(async()=>({ok:false,json:async()=>({error:{code:'RATE_CONFLICT'}})}),snapshot(),'old'),/RATE_CONFLICT/);const store={schemaVersion:1,persistent:true,snapshots:[snapshot()]};const s=await catalog.readSaved('테스트캐릭터',async url=>{assert.equal(url,'/api/boss-rates');return {ok:true,json:async()=>store};},{getItem(){throw new Error('must not read local drafts');}});assert.equal(s.rates[0].percent,49.68);
});
test('공유 프로필은 서버 저장·조회에도 유지하고 OCID와 키는 저장하지 않는다',async()=>{
 const store=createStore({command:backend()}),raw=snapshot();raw.character={name:raw.characterName,world:'루나',job:'히어로',level:285,image:'https://open.api.nexon.com/static/maplestory/character/look/ABC123',updatedAt:Date.now(),ocid:'private-ocid',apiKey:'private-key'};
 await store.save(raw,'');const saved=(await store.read()).snapshots.find(s=>s.characterName===raw.characterName);assert.equal(saved.character.level,285);assert.equal(saved.character.world,'루나');assert.equal(saved.character.job,'히어로');assert(!JSON.stringify(saved).includes('private-'));
});
test('계정 묶음은 독립 서버에서 함께 읽고 동시 변경 충돌과 중복 소속은 거부한다',async()=>{
 const command=backend(),a=createStore({command}),b=createStore({command});const first=await a.saveAccounts([{id:'group-one',label:'',characters:[{name:'계정본캐'},{name:'계정부캐'}]}],'');const read=await b.read();assert.equal(read.accounts.length,1);assert.equal(read.accountRevision,first.accountRevision);assert(read.snapshots[0].rates.length>0);
 await b.saveAccounts([{id:'group-one',label:'수정',characters:[{name:'계정본캐'},{name:'계정부캐'}]}],first.accountRevision);await assert.rejects(a.saveAccounts(read.accounts,first.accountRevision),/RATE_CONFLICT/);await assert.rejects(a.saveAccounts([{id:'one',characters:[{name:'중복'}]},{id:'two',characters:[{name:'중복'}]}],''),/ACCOUNT_INVALID/);
});
test('공용 API는 계정 저장 동작을 배율과 분리해 처리하고 그룹 revision 충돌은 409로 반환한다',async()=>{
 const handler=createHandler(createStore({command:backend()}),{}),body={action:'accounts',accounts:[{id:'group-one',label:'계정',characters:[{name:'본캐'}]}],expectedRevision:''};
 const saved=await call(handler,'POST',body);assert.equal(saved.status,200);assert.equal(saved.body.accounts[0].label,'계정');assert(saved.body.accountRevision);assert.equal((await call(handler)).body.accounts[0].characters[0].name,'본캐');assert.equal((await call(handler,'POST',body)).status,409);
});
test('내 계정 자동 동기화는 타인 계정을 유지하고 같은 데이터를 반복 저장하지 않는다',async()=>{
 const account=require('../account_catalog.js'),command=backend(),store=createStore({command});await store.saveAccounts([{id:'friend',label:'친구',characters:[{name:'친구캐릭터'}]}],'');let writes=0;
 const handler=createHandler(store,{}),fetchImpl=async(url,options={})=>{const method=options.method||'GET';if(method==='POST')writes++;const r=await call(handler,method,options.body&&JSON.parse(options.body));return {ok:r.status===200,json:async()=>r.body};};
 const options={fetch:fetchImpl,load:async()=>[{name:'내캐릭터',accountId:'private-own',world:'루나',characterClass:'히어로',level:290}],newId:()=> 'mine'};
 let doc=await account.syncOwn(await store.read(),options);assert.equal(doc.accounts.length,2);assert(doc.accounts.some(a=>a.id==='friend'));assert.equal(writes,1);doc=await account.syncOwn(doc,options);assert.equal(writes,1);assert.equal(account.accountId(doc,'내캐릭터'),'mine');
});
test('내 계정 동기화는 기존 공용 묶음의 수동 소속을 보존한다',()=>{
 const account=require('../account_catalog.js');
 const store={snapshots:[],accounts:[{id:'mine',label:'내 그룹',characters:[{name:'내캐릭터'},{name:'수동으로추가'}]},
  {id:'other',label:'별도 그룹',characters:[{name:'수동으로이동'}]}]};
 const rows=['내캐릭터','수동으로이동','새캐릭터'].map(name=>({name,accountId:'private-own',world:'루나',level:290}));
 const next=account.importOwn(store,rows,()=> 'unused');
 assert.deepEqual(next.map(group=>group.characters.map(c=>c.name)),[['내캐릭터','수동으로추가','새캐릭터'],['수동으로이동']]);
});
