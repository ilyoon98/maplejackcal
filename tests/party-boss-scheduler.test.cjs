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
test('파티 복원은 OCID 중복·난이도별 인원 제한·키/임의 필드 유입을 걸러낸다',()=>{
 const choices=app.catalog(db);
 const c=app.profile(basic(),'char1');
 const raw={parties:[{id:'p1',name:'익스우',bossId:'Lotus|Extreme',schedule:'금요일',apiKey:'do-not-keep',members:[{character:{...c,apiKey:'do-not-keep'},rate:null},{character:c,rate:999},{character:{...c,ocid:'char2'},rate:0},{character:{...c,ocid:'char3'},rate:50}]},{id:'p2',bossId:'missing',members:[]}]};
 const restored=app.restore(raw,choices);assert.equal(restored.length,1);assert.equal(restored[0].members.length,2);assert.equal(restored[0].members[0].rate,null);assert.equal(restored[0].members[1].rate,0);assert(!JSON.stringify(restored).includes('do-not-keep'));
 assert.equal(choices.find(c=>c.id==='Lotus|Extreme').max,2);
 assert.equal(choices.find(c=>c.id==='BlackMage|Extreme').max,6);
});

function pageHarness({fetch,characters=[],saved={}}){
 const fs=require('node:fs'),path=require('node:path');
 function element(tag){
  const n={tag,children:[],handlers:{},dataset:{},attrs:{},value:'',className:'',hidden:false};
  let ownText='';Object.defineProperty(n,'textContent',{get(){return ownText+n.children.map(c=>c.textContent).join('');},set(value){ownText=String(value);n.children=[];}});
  n.append=(...children)=>n.children.push(...children);n.appendChild=c=>(n.children.push(c),c);n.replaceChildren=(...children)=>{ownText='';n.children=children;};
  n.setAttribute=(k,v)=>{n.attrs[k]=v;};n.addEventListener=(k,fn)=>{n.handlers[k]=fn;};n.focus=()=>{};n.reset=()=>{};n.classList={toggle(){}};
  n.fire=(type)=>n.handlers[type]?.call(n,{target:n,preventDefault(){}});
  return n;
 }
 const ids=Object.fromEntries([...fs.readFileSync(path.join(__dirname,'../party_boss_scheduler.html'),'utf8').matchAll(/id="([^"]+)"/g)].map(m=>[m[1],element('div')]));
 ids['party-view'].value='all';const store=new Map([['partyBossScheduler.v1',JSON.stringify(saved)]]),handlers={};let key='test-key';
 const win={document:{getElementById:id=>ids[id],createElement:element,createTextNode:text=>{const n=element('#text');n.textContent=text;return n;}},MapleBossDB:db,fetch,
  NexonKey:{get:()=>key,has:()=>!!key,STORAGE_KEY:'nxopen_api_key'},NexonCharacters:{fetch:async()=>characters},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  crypto:{randomUUID:()=> 'new-party'},addEventListener:(name,fn)=>{handlers[name]=fn;}};
 app.mount(win);
 function find(host,tag){return host.children.flatMap(n=>[...(n.tag===tag?[n]:[]),...find(n,tag)]);}
 return {ids,store,find,changeKey(value){key=value;handlers['nexon-key-changed']();}};
}
const settle=async()=>{await new Promise(setImmediate);await new Promise(setImmediate);};

test('페이지에서 계정 캐릭터 이미지와 파티원 이미지를 갱신하고 이미지 로드 실패에도 이름·배율을 보존한다',async()=>{
 const character=app.profile({...basic('이전이름'),character_image:null},'mine1');
 const page=pageHarness({characters:[{ocid:'mine1',name:'내캐릭터',world:'루나',level:280}],saved:{parties:[{id:'p1',name:'금요팟',bossId:'Lotus|Extreme',members:[{character,rate:125}]}]},fetch:async()=>({ok:true,json:async()=>basic()})});
 await settle();
 assert.equal(page.find(page.ids['party-character-preview'],'img')[0].src,image);
 const memberImage=page.find(page.ids['party-detail'],'img')[0];assert.equal(memberImage.src,image);memberImage.fire('error');
 assert.equal(memberImage.hidden,true);assert(page.ids['party-detail'].textContent.includes('외형 로드 실패'));assert(page.ids['party-detail'].textContent.includes('내캐릭터'));assert(page.ids['party-detail'].textContent.includes('125%'));
 const stored=JSON.parse(page.store.get('partyBossScheduler.v1'));assert.equal(stored.parties[0].members[0].character.name,'내캐릭터');assert.equal(stored.parties[0].members[0].rate,125);assert(!JSON.stringify(stored).includes('test-key'));
});
test('느린 이전 검색이나 API 키 변경 전의 결과가 현재 캐릭터 외형을 덮어쓰지 않는다',async()=>{
 let resolveSlow;const slow=new Promise(r=>{resolveSlow=r;});
 const page=pageHarness({fetch:async url=>{const u=new URL(url);if(u.pathname.endsWith('/id'))return {ok:true,json:async()=>({ocid:u.searchParams.get('character_name')})};if(u.searchParams.get('ocid')==='느린캐릭터')return slow;return {ok:true,json:async()=>basic('빠른캐릭터')};}});
 await settle();
 page.ids['party-character-name'].value='느린캐릭터';page.ids['party-search-form'].fire('submit');await settle();
 page.ids['party-character-name'].value='빠른캐릭터';page.ids['party-search-form'].fire('submit');await settle();
 resolveSlow({ok:true,json:async()=>basic('느린캐릭터')});await settle();
 assert(page.ids['party-character-preview'].textContent.includes('빠른캐릭터'));assert(!page.ids['party-character-preview'].textContent.includes('느린캐릭터'));
 page.changeKey('new-test-key');await settle();assert.equal(page.find(page.ids['party-character-preview'],'img').length,0);
});

function scouterSnapshot(name='내캐릭터',rates=[{bossId:'Lotus|Extreme',percent:49.68},{bossId:'TheFirstAdversary|Normal',percent:89.58}]){
 return {schemaVersion:1,characterName:name,preset:'00000',sourceUrl:require('../scouter_data.js').resultUrl(name,'00000'),fetchedAt:new Date().toISOString(),conditions:{view:'all',bossTimeMinutes:20,destinyChampion:true,simulation:false},rates};
}
function rateButton(page){return page.find(page.ids['party-character-preview'],'button').find(b=>b.textContent.includes('배율')&&b.textContent.includes('불러오기'));}
test('검색만으로는 환산을 호출하지 않고 버튼을 누른 한 캐릭터만 불러와 합산하며 수동값·이전값을 유지한다',async()=>{
 const c=app.profile(basic(),'mine1');let fail=false;const calls=[];
 const page=pageHarness({characters:[{ocid:'mine1',name:'내캐릭터'}],saved:{parties:[{id:'suu',name:'스우팟',bossId:'Lotus|Extreme',members:[{character:c,rate:null},{character:{...c,ocid:'other'},rate:25}]},{id:'adversary',name:'대적자팟',bossId:'TheFirstAdversary|Normal',members:[{character:c,rate:null}]}]},fetch:async(url,options)=>{
  calls.push({url,options});if(url.startsWith('/api/scouter'))return {ok:!fail,json:async()=>fail?{error:{code:'SCOUTER_BLOCKED'}}:scouterSnapshot()};return {ok:true,json:async()=>basic()};
 }});
 await settle();assert.equal(calls.filter(c=>c.url.startsWith('/api/scouter')).length,0);
 const button=rateButton(page);button.fire('click');button.fire('click');await settle();
 let stored=JSON.parse(page.store.get('partyBossScheduler.v1'));assert.equal(stored.parties[0].members[0].rate,49.68);assert.equal(stored.parties[1].members[0].rate,89.58);assert(page.ids['party-detail'].textContent.includes('74.68%'));
 assert.equal(calls.filter(c=>c.url.startsWith('/api/scouter')).length,1);assert.equal(calls.find(c=>c.url.startsWith('/api/scouter')).options.headers,undefined);
 const input=page.find(page.ids['party-detail'],'input')[0];input.value='70';input.fire('change');
 page.ids['party-my-character'].value='mine1';page.ids['party-my-character'].fire('change');await settle();assert.equal(calls.filter(c=>c.url.startsWith('/api/scouter')).length,1);rateButton(page).fire('click');await settle();stored=JSON.parse(page.store.get('partyBossScheduler.v1'));assert.equal(stored.parties[0].members[0].rate,70);assert.equal(stored.parties[0].members[0].rateMode,'manual');
 const auto=page.find(page.ids['party-detail'],'button').find(b=>b.textContent==='환산값 사용');auto.fire('click');assert(page.ids['party-detail'].textContent.includes('74.68%'));
 fail=true;page.ids['party-my-character'].fire('change');await settle();rateButton(page).fire('click');await settle();stored=JSON.parse(page.store.get('partyBossScheduler.v1'));assert.equal(stored.parties[0].members[0].rate,49.68);assert(page.ids['party-search-status'].textContent.includes('접근을 차단'));assert(page.ids['party-detail'].textContent.includes('이전 값'));
});
test('늦게 도착한 이전 캐릭터의 환산 응답은 현재 화면이나 저장한 파티에 반영하지 않는다',async()=>{
 let resolveSlow;const slow=new Promise(r=>{resolveSlow=r;});const c=app.profile(basic('느린캐릭터'),'slow');
 const page=pageHarness({saved:{parties:[{id:'p1',name:'스우팟',bossId:'Lotus|Extreme',members:[{character:c,rate:null}]}]},fetch:async url=>{
  const u=new URL(url,'http://localhost');if(u.pathname==='/api/scouter'){const name=u.searchParams.get('name');return name==='느린캐릭터'?slow:{ok:true,json:async()=>scouterSnapshot(name)};}
  if(u.pathname.endsWith('/id'))return {ok:true,json:async()=>({ocid:u.searchParams.get('character_name')==='느린캐릭터'?'slow':'fast'})};return {ok:true,json:async()=>basic(u.searchParams.get('ocid')==='slow'?'느린캐릭터':'빠른캐릭터')};
 }});
 await settle();page.ids['party-character-name'].value='느린캐릭터';page.ids['party-search-form'].fire('submit');await settle();rateButton(page).fire('click');await settle();page.ids['party-character-name'].value='빠른캐릭터';page.ids['party-search-form'].fire('submit');await settle();resolveSlow({ok:true,json:async()=>scouterSnapshot('느린캐릭터')});await settle();
 assert(page.ids['party-character-preview'].textContent.includes('빠른캐릭터'));assert.equal(JSON.parse(page.store.get('partyBossScheduler.v1')).parties[0].members[0].rate,null);
 page.ids['party-character-name'].value='느린캐릭터';page.ids['party-search-form'].fire('submit');await settle();assert.equal(rateButton(page).disabled,false);
});
