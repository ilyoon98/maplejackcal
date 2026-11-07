const {test}=require('node:test');
const assert=require('node:assert/strict');
const app=require('../party_boss_scheduler.js');
const db=require('../boss_db.json');
const image='https://open.api.nexon.com/static/maplestory/character/look/ABC123?action=A00';
function basic(name='내캐릭터'){return {character_name:name,world_name:'루나',character_class:'히어로',character_level:280,character_image:image};}

test('닉네임은 인코딩해 OCID 조회 후 기본 정보에서 외형을 가져온다; 키는 헤더에만 사용한다',async()=>{
 const calls=[];
 const api=app.client(async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>calls.length===1?{ocid:'char1'}:basic()};},()=> 'test-key-not-real');
 const p=await api.load({name:'이름&서버?'});
 assert.equal(p.ocid,'char1');assert.equal(p.image,image);assert.equal(p.name,'내캐릭터');
 assert.equal(new URL(calls[0].url).searchParams.get('character_name'),'이름&서버?');
 assert.equal(new URL(calls[1].url).pathname,'/maplestory/v1/character/basic');
 assert.equal(calls[1].options.headers['x-nxopen-api-key'],'test-key-not-real');
 assert(!JSON.stringify(p).includes('test-key-not-real'));assert(!calls.some(c=>c.url.includes('test-key-not-real')));
});
test('내 계정 목록의 OCID가 있으면 닉네임 조회 없이 직접 이미지 조회',async()=>{
 const urls=[];const api=app.client(async url=>{urls.push(url);return {ok:true,json:async()=>basic()};},()=> 'test-key');
 await api.load({ocid:'mine1'});assert.equal(urls.length,1);assert.equal(new URL(urls[0]).searchParams.get('ocid'),'mine1');
});
test('키 누락·조회 실패·잘못된 응답은 성공 프로필로 저장하지 않는다',async()=>{
 const api=app.client(()=>assert.fail('must not request'),()=> '');await assert.rejects(api.load({name:'내캐릭터'}),/API_KEY_REQUIRED/);
 const failing=app.client(async()=>({ok:false,json:async()=>({error:{name:'OPENAPI00005',message:'do not expose provider details'}})}),()=> 'test-key');
 await assert.rejects(failing.load({ocid:'mine1'}),e=>e.code==='OPENAPI00005'&&e.message==='NEXON_API_ERROR');
 assert.throws(()=>app.profile({},'mine1'),/PROFILE_INVALID/);
});
test('계정 전환으로 중단된 조회는 후속 기본정보 요청을 보내지 않는다',async()=>{
 const controller=new AbortController();let count=0;
 const api=app.client(async()=>{count++;controller.abort();return {ok:true,json:async()=>({ocid:'mine1'})};},()=> 'test-key');
 await assert.rejects(api.load({name:'이전계정'},controller.signal),{name:'AbortError'});assert.equal(count,1);
});
test('넥슨 외부 주소·자격증명 포함 주소는 이미지로 사용하지 않고 이미지 누락은 허용',()=>{
 for(const url of ['https://open.api.nexon.com.attacker.test/static/maplestory/character/look/A','https://secret@open.api.nexon.com/static/maplestory/character/look/A','javascript:alert(1)','data:image/png;base64,AA','https://open.api.nexon.com/other/A'])assert.equal(app.imageUrl(url),'');
 assert.equal(app.profile({...basic(),character_image:null},'mine1').image,'');
});
test('배율 0과 미입력을 구분하고 잘못된 값을 합계에 넣지 않는다',()=>{
 assert.deepEqual(app.summary([{rate:0},{rate:125.5},{rate:null},{rate:' '},{rate:true},{rate:-1},{rate:Infinity}]),{total:125.5,missing:5});
});
test('클리어 판정은 100%, 140%, 200%를 각각 다음 구간에 넣는다',()=>{
 assert.deepEqual([99.99,100,139.99,140,199.99,200].map(n=>app.clearStatus(n)[1]),['불가능','클리어 가능','클리어 가능','여유컷','여유컷','완전 개팸']);
});
test('파티 복원은 OCID 중복·난이도별 인원 제한·키/임의 필드 유입을 걸러낸다',()=>{
 const choices=app.catalog(db);
 const c=app.profile(basic(),'char1');
 const raw={parties:[{id:'p1',name:'익스우',bossId:'Lotus|Extreme',schedule:'금요일',apiKey:'do-not-keep',members:[{character:{...c,apiKey:'do-not-keep'},rate:null},{character:c,rate:999},{character:{...c,ocid:'char2'},rate:0},{character:{...c,ocid:'char3'},rate:50}]},{id:'p2',bossId:'missing',members:[]}]};
 const restored=app.restore(raw,choices);assert.equal(restored.length,1);assert.equal(restored[0].members.length,2);assert.equal(restored[0].members[0].rate,null);assert.equal(restored[0].members[1].rate,0);assert(!JSON.stringify(restored).includes('do-not-keep'));
 assert.equal(choices.find(c=>c.id==='Lotus|Extreme').max,2);
 assert.equal(choices.find(c=>c.id==='BlackMage|Extreme').max,6);
});
