'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');
const data=require('../scouter_data.js'),catalog=require('../rate_catalog.js');
const image='https://open.api.nexon.com/static/maplestory/character/look/ABC123';
const profile=name=>({name,world:'루나',job:'히어로',level:285,image,updatedAt:Date.now()});
function snapshot(name='다른사람'){const s=catalog.snapshot(name,[{bossId:'Lotus|Extreme',percent:49.68},{bossId:'Will|Hard',percent:77}],'manual');return {...s,revision:'v1',character:profile(name)};}
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
async function boot(page,{snapshots=[snapshot()],accounts=[],key='',fetchExtra,shot=[],ownRows=[]}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../'+page+'.html'),'utf8'),{url:'https://example.test/'+page+'.html',runScripts:'outside-only'}),w=dom.window,calls=[];let values=structuredClone(snapshots),registry=structuredClone(accounts);
 w.confirm=()=>true;w.setInterval=()=>1;if(key)w.localStorage.setItem('nxopen_api_key',key);
 w.fetch=async(url,options={})=>{calls.push({url,options});if(url==='/api/boss-rates'){
   if(options.method==='POST'){const b=JSON.parse(options.body);if(b.action==='accounts'){registry=b.accounts;return {ok:true,json:async()=>({accounts:registry,accountRevision:'accounts-v2'})};}const saved={...b.snapshot,revision:'v2'};values=values.filter(s=>s.characterName!==saved.characterName).concat(saved);return {ok:true,json:async()=>({snapshot:saved})};}
   return {ok:true,json:async()=>({schemaVersion:1,persistent:true,snapshots:structuredClone(values),accounts:structuredClone(registry),accountRevision:registry.length?'accounts-v1':''})};
  }if(fetchExtra)return fetchExtra(url,options);throw new Error('Unexpected network request: '+url);
 };
 const scripts=['boss_db.js','scouter_data.js','account_catalog.js','rate_catalog.js','nexon_key.js','character_profile.js','boss_identity.js'];
 for(const file of scripts)w.eval(fs.readFileSync(path.join(__dirname,'../'+file),'utf8'));
 w.NexonCharacters={fetch:async()=>structuredClone(ownRows)};
 w.BossShotReader={readBlob:async()=>shot};w.eval(fs.readFileSync(path.join(__dirname,'../'+page+'.js'),'utf8'));await settle();
 return {w,doc:w.document,calls,close:()=>w.close(),setCatalog(next){values=structuredClone(next);}};
}
function select(w,id,value){const n=w.document.getElementById(id);n.value=value;n.dispatchEvent(new w.Event('change',{bubbles:true}));}
function type(w,id,value){const n=w.document.getElementById(id);n.value=value;n.dispatchEvent(new w.Event('input',{bubbles:true}));}
test('저장된 캐릭터 선택 즉시 프로필과 배율을 열고 중복 열기·조건 확인 버튼 없이 저장한다',async()=>{
 const p=await boot('shared_boss_rates',{snapshots:[snapshot('다른사람'),snapshot('두번째캐릭터')]});try{
  assert.equal(p.doc.querySelector('#shared-open').hidden,false);assert.equal(p.doc.querySelectorAll('#shared-rows tr').length,2);assert(p.doc.querySelector('#shared-profile').textContent.includes('Lv.285'));assert(p.doc.querySelector('#shared-profile img').src===image);
  select(p.w,'shared-character','두번째캐릭터');await settle();assert(p.doc.querySelector('#shared-profile').textContent.includes('두번째캐릭터'));assert.equal(p.doc.querySelector('#shared-open').hidden,false);assert(!p.doc.querySelector('#shared-confirm'));assert(!p.doc.querySelector('#shared-apply-shot'));
  assert(p.doc.querySelector('#shared-rows .boss-face').src.endsWith('suu.webp'));assert(p.doc.querySelector('#shared-rows .diff-badge.extreme'));
  p.doc.querySelector('#shared-save').click();await settle();assert.equal(p.calls.filter(c=>c.options.method==='POST'&&JSON.parse(c.options.body).snapshot).length,1);assert(p.doc.querySelector('#shared-save-state').textContent.includes('저장 완료'));assert.equal(p.doc.querySelector('#shared-toast').hidden,false);
 }finally{p.close();}
});
test('캡처 토글·붙여넣기는 확실한 카드만 즉시 반영하고 불확실한 기존 배율과 나머지 값은 유지한다',async()=>{
 const p=await boot('shared_boss_rates',{shot:[{name:'스우',diff:'익스트림',value:41.22,sure:true},{name:'윌',diff:'하드',value:999,sure:false}]});try{
  p.doc.querySelector('#shared-mode-capture').click();assert.equal(p.doc.querySelector('#shared-mode-capture').getAttribute('aria-pressed'),'true');assert.equal(p.doc.querySelector('#shared-capture').hidden,false);assert(p.doc.querySelector('#shared-fetch-panel').hidden);
  const e=new p.w.Event('paste',{bubbles:true,cancelable:true});e.clipboardData={items:[{kind:'file',getAsFile:()=>new p.w.Blob(['fake-pixels'],{type:'image/png'})}]};p.doc.querySelector('#shared-drop').dispatchEvent(e);await settle();
  const inputs=[...p.doc.querySelectorAll('#shared-rows input')];assert.equal(inputs[0].value,'41.22');assert.equal(inputs[1].value,'77');assert(p.doc.querySelector('#shared-shot-status').textContent.includes('1개 배율 자동 반영'));assert(p.doc.querySelector('#shared-review').textContent.includes('기존 값 유지'));assert.equal(p.calls.filter(c=>c.options.method==='POST'&&JSON.parse(c.options.body).snapshot).length,0);
  p.doc.querySelector('#shared-save').click();await settle();const saved=JSON.parse(p.calls.find(c=>c.options.method==='POST'&&JSON.parse(c.options.body).snapshot).options.body).snapshot;assert.equal(saved.captureMethod,'screenshot');assert.equal(saved.rates[0].percent,41.22);assert.equal(saved.rates[1].percent,77);
 }finally{p.close();}
});
test('타인 닉네임 검색은 id/basic만 조회하고 레벨·서버·직업·외형만 공유 저장한다',async()=>{
 const stale=snapshot();stale.character.updatedAt=Date.now()-7200000;const p=await boot('shared_boss_rates',{snapshots:[stale],key:'test-key-only',fetchExtra:async(url,options)=>{const u=new URL(url);assert.equal(options.headers['x-nxopen-api-key'],'test-key-only');assert(!u.pathname.endsWith('/character/list'));return {ok:true,json:async()=>u.pathname.endsWith('/id')?{ocid:'private-ocid'}:{character_name:u.searchParams.get('ocid')==='private-ocid'?'다른사람':'',world_name:'스카니아',character_class:'비숍',character_level:290,character_image:image}};}});try{
  assert(p.doc.querySelector('#shared-profile').textContent.includes('스카니아 · Lv.290 · 비숍'));p.doc.querySelector('#shared-save').click();await settle();const body=p.calls.find(c=>c.options.method==='POST'&&JSON.parse(c.options.body).snapshot).options.body;assert(!body.includes('test-key-only'));assert(!body.includes('private-ocid'));const c=JSON.parse(body).snapshot.character;assert.equal(c.level,290);assert.equal(c.world,'스카니아');assert.equal(c.job,'비숍');assert.equal(c.image,image);
 }finally{p.close();}
});
test('파티는 API 키 없이 공용 캐릭터를 추가하고 해당 보스 배율을 합산한다',async()=>{
 const p=await boot('party_boss_scheduler',{snapshots:[snapshot(),{...snapshot('윌전용캐릭터'),rates:[{bossId:'Will|Hard',percent:12}]}]});try{
  p.doc.querySelector('#party-create-toggle').click();select(p.w,'party-boss','Lotus|Extreme');type(p.w,'party-name','금요팟');p.doc.querySelector('#party-create-form').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  const options=[...p.doc.querySelector('#party-saved-character').options];assert(options.some(o=>o.value==='다른사람'));assert(options.find(o=>o.value==='윌전용캐릭터').disabled);
  select(p.w,'party-saved-character','다른사람');await settle();assert(p.doc.querySelector('#party-character-preview').textContent.includes('루나 · Lv.285 · 히어로'));assert.equal(p.doc.querySelector('#party-character-preview img').src,image);
  p.doc.querySelector('#party-add-current').click();assert(p.doc.querySelector('#party-detail').textContent.includes('49.68%'));assert.equal(JSON.parse(p.w.localStorage.getItem('partyBossScheduler.v1')).parties[0].members.length,1);assert(p.doc.querySelector('#party-detail .diff-badge.extreme'));
  assert(p.calls.every(c=>c.url==='/api/boss-rates'));
  const updated=snapshot();updated.rates[0].percent=60;p.setCatalog([updated]);p.w.dispatchEvent(new p.w.Event('focus'));await settle();assert(p.doc.querySelector('#party-detail').textContent.includes('60%'));
 }finally{p.close();}
});
test('캐릭터 정보가 늦게 도착해도 현재 선택을 덮어쓰지 않고 배율 목록 실패 시 파티를 유지한다',async()=>{
 let resolveSlow;const slow=new Promise(r=>{resolveSlow=r;});const a=snapshot('느린캐릭터'),b=snapshot('빠른캐릭터');delete a.character;delete b.character;
 const p=await boot('party_boss_scheduler',{snapshots:[a,b],key:'test-key',fetchExtra:async url=>{const u=new URL(url);if(u.pathname.endsWith('/id'))return {ok:true,json:async()=>({ocid:u.searchParams.get('character_name')})};if(u.searchParams.get('ocid')==='느린캐릭터')return slow;return {ok:true,json:async()=>({character_name:'빠른캐릭터',world_name:'루나',character_class:'히어로',character_level:280,character_image:image})};}});try{
  select(p.w,'party-saved-character','느린캐릭터');await settle();select(p.w,'party-saved-character','빠른캐릭터');await settle();resolveSlow({ok:true,json:async()=>({character_name:'느린캐릭터',world_name:'루나',character_class:'히어로',character_level:280,character_image:image})});await settle();assert(p.doc.querySelector('#party-character-preview').textContent.includes('빠른캐릭터'));assert(!p.doc.querySelector('#party-character-preview').textContent.includes('느린캐릭터'));
  const before=p.w.localStorage.getItem('partyBossScheduler.v1');p.w.fetch=async()=>({ok:false});p.w.dispatchEvent(new p.w.Event('focus'));await settle();assert.equal(p.w.localStorage.getItem('partyBossScheduler.v1'),before);assert(p.doc.querySelector('#party-search-status').textContent.includes('기존 파티는 유지'));
 }finally{p.close();}
});
test('공용 프로필 정규화는 키·OCID·임의 이미지 주소를 제거하고 잘못된 이름은 거부한다',()=>{
 const raw={...profile('다른사람'),ocid:'private',apiKey:'secret',image:'https://evil.test/pixel'};const valid=data.publicCharacter(raw,'다른사람');assert.equal(valid.image,'');assert(!JSON.stringify(valid).includes('private'));assert(!JSON.stringify(valid).includes('secret'));assert.equal(data.publicCharacter(raw,'이름불일치'),null);
 const s=snapshot();s.character=raw;assert.deepEqual(data.normalizeSnapshot(s,s.characterName,'00000').character,valid);
});
test('같은 보스·난이도의 중복 캡처는 어느 숫자도 자동 선택하지 않는다',()=>{
 const rows=catalog.shotRows([{name:'스우',diff:'익스트림',value:40,sure:true},{name:'스우',diff:'익스트림',value:50,sure:true}],catalog.choices(require('../boss_db.json')));assert(rows.every(r=>!r.selected));assert(rows.every(r=>r.note.includes('중복')));
});
test('계정 그룹을 선택하면 캐릭터 목록이 바뀌고 새 캐릭터 입력은 항상 별도로 보인다',async()=>{
 const a=snapshot('낮은캐릭터'),b=snapshot('높은캐릭터'),c=snapshot('다른계정');a.character.level=280;b.character.level=295;
 const p=await boot('shared_boss_rates',{snapshots:[a,b,c],accounts:[{id:'group-one',label:'',characters:[{name:a.characterName},{name:b.characterName},{name:'미등록캐릭터'}]},{id:'group-two',label:'친구',characters:[{name:c.characterName}]}]});try{
  const labels=[...p.doc.querySelector('#shared-account').options].map(o=>o.textContent);assert(labels.includes('높은캐릭터'));assert(labels.includes('친구'));assert.equal(p.doc.querySelector('#shared-open').hidden,false);assert(![...p.doc.querySelector('#shared-character').options].some(o=>o.textContent.includes('새 캐릭터')));
  select(p.w,'shared-account','group-one');await settle();const names=[...p.doc.querySelector('#shared-character').options].map(o=>o.value);assert.deepEqual(names,['','높은캐릭터','낮은캐릭터']);assert(p.doc.querySelector('#shared-character optgroup').label==='높은캐릭터');
  assert(!p.doc.querySelector('#shared-conditions'));assert(p.doc.querySelector('#shared-profile').parentElement.parentElement.classList.contains('shared-hero'));
 }finally{p.close();}
});
test('파티 생성 중 멤버를 구성하고 같은 계정 중복을 거부하며 이름을 비우면 보스 이름으로 저장한다',async()=>{
 const a=snapshot('본캐'),b=snapshot('부캐'),c=snapshot('친구캐릭터');
 const p=await boot('party_boss_scheduler',{snapshots:[a,b,c],accounts:[{id:'mine',label:'내 계정',characters:[{name:'본캐'},{name:'부캐'},{name:'미등록캐릭터'}]},{id:'friend',label:'친구 계정',characters:[{name:'친구캐릭터'}]}]});try{
  assert(!p.doc.querySelector('#party-schedule'));p.doc.querySelector('#party-create-toggle').click();select(p.w,'party-boss','Lotus|Extreme');select(p.w,'party-draft-account','mine');select(p.w,'party-draft-character','본캐');p.doc.querySelector('#party-draft-add').click();select(p.w,'party-draft-character','부캐');p.doc.querySelector('#party-draft-add').click();assert(p.doc.querySelector('#party-draft-status').textContent.includes('같은 계정'));assert.equal(p.doc.querySelectorAll('#party-draft-members .party-member').length,1);
  assert(!p.doc.querySelector('#party-draft-character option[value="미등록캐릭터"]'));
  select(p.w,'party-draft-account','friend');select(p.w,'party-draft-character','친구캐릭터');p.doc.querySelector('#party-draft-add').click();p.doc.querySelector('#party-create-form').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));await settle();const party=JSON.parse(p.w.localStorage.getItem('partyBossScheduler.v1')).parties[0];assert.equal(party.name,'익스트림 스우');assert.equal(party.members.length,2);assert(!('schedule' in party));assert.equal(p.doc.querySelectorAll('#party-detail .party-member').length,2);
  select(p.w,'party-account','mine');select(p.w,'party-saved-character','부캐');await settle();p.doc.querySelector('#party-add-current').click();assert(p.doc.querySelector('#party-search-status').textContent.includes('같은 계정'));assert.equal(p.doc.querySelectorAll('#party-detail .party-member').length,2);
  assert(!p.doc.querySelector('#party-saved-character option[value="미등록캐릭터"]'));
 }finally{p.close();}
});
test('선택한 파티만 확인 후 삭제하고 브라우저 목록에 저장한다',async()=>{
 const p=await boot('party_boss_scheduler');
 try{
  for(const name of ['첫 파티','둘째 파티']){
   p.doc.querySelector('#party-create-toggle').click();
   type(p.w,'party-name',name);
   p.doc.querySelector('#party-create-form').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));
  }
  const saved=()=>JSON.parse(p.w.localStorage.getItem('partyBossScheduler.v1')).parties.map(party=>party.name);
  p.w.confirm=()=>false;
  p.doc.querySelector('.party-delete').click();
  assert.deepEqual(saved(),['첫 파티','둘째 파티']);
  p.w.confirm=message=>message.includes('둘째 파티');
  p.doc.querySelector('.party-delete').click();
  assert.deepEqual(saved(),['첫 파티']);
  assert(p.doc.querySelector('#party-detail').textContent.includes('첫 파티'));
 }finally{p.close();}
});
test('배율 저장 시 선택한 계정으로 묶고 계정 이름과 저장 토스트를 갱신한다',async()=>{
 const p=await boot('shared_boss_rates',{snapshots:[snapshot('본캐'),snapshot('부캐')],accounts:[{id:'group-one',label:'주인',characters:[{name:'본캐'}]}]});try{
  select(p.w,'shared-character','부캐');select(p.w,'shared-owner','group-one');type(p.w,'shared-owner-label','우리 계정');p.doc.querySelector('#shared-save').click();await settle();const req=p.calls.find(c=>c.options.method==='POST'&&JSON.parse(c.options.body).action==='accounts');const account=JSON.parse(req.options.body).accounts.find(a=>a.id==='group-one');assert.equal(account.label,'우리 계정');assert.deepEqual(account.characters.map(c=>c.name).sort(),['본캐','부캐'].sort());assert(p.doc.querySelector('#shared-toast').textContent.includes('저장 완료'));
 }finally{p.close();}
});
test('내 계정 불러오기는 비공개 계정 ID와 OCID를 공용 요청에 넣지 않는다',async()=>{
 const p=await boot('shared_boss_rates',{snapshots:[],key:'test-key'});try{
  p.w.NexonCharacters.fetch=async()=>[{name:'계정본캐',accountId:'private-account',ocid:'private-ocid',world:'루나',characterClass:'히어로',level:290},{name:'계정부캐',accountId:'private-account',ocid:'private-ocid2',world:'루나',characterClass:'비숍',level:280}];
  p.doc.querySelector('#shared-import-account').click();await settle();assert.equal(p.doc.querySelectorAll('#shared-account option').length,2);p.doc.querySelector('#shared-group-save').click();await settle();const body=p.calls.find(c=>c.options.method==='POST').options.body;assert(!body.includes('private-'));assert.equal(JSON.parse(body).accounts[0].characters.length,2);assert(p.doc.querySelector('#shared-account').textContent.includes('계정본캐'));
 }finally{p.close();}
});
test('홈에 키가 있으면 공용 화면에서 내 계정을 자동 연결하고 수동 저장 절차를 요구하지 않는다',async()=>{
 const rows=[{name:'본캐',accountId:'private-own',ocid:'secret-ocid',world:'루나',characterClass:'히어로',level:295},{name:'부캐',accountId:'private-own',ocid:'secret-ocid2',world:'루나',characterClass:'비숍',level:280}];
 const p=await boot('shared_boss_rates',{key:'test-key',snapshots:[snapshot('본캐'),snapshot('부캐'),snapshot('다른사람')],ownRows:rows});try{
  const groupWrites=p.calls.filter(c=>c.options.method==='POST'&&JSON.parse(c.options.body).action==='accounts');assert.equal(groupWrites.length,1);const body=JSON.parse(groupWrites[0].options.body);assert.equal(body.accounts.length,1);assert.deepEqual(body.accounts[0].characters.map(c=>c.name).sort(),['본캐','부캐'].sort());assert(!groupWrites[0].options.body.includes('private-own'));assert(!groupWrites[0].options.body.includes('secret-ocid'));assert.equal(p.doc.querySelector('#shared-owner').value,body.accounts[0].id);assert.equal(p.doc.querySelector('#shared-account-editor').open,false);assert.equal(p.doc.querySelector('#shared-owner-settings').open,false);
 }finally{p.close();}
});
test('파티 화면도 내 계정을 자동 연결하고 같은 계정의 다른 캐릭터 추가를 막는다',async()=>{
 const rows=[{name:'본캐',accountId:'private-own',world:'루나',characterClass:'히어로',level:295},{name:'부캐',accountId:'private-own',world:'루나',characterClass:'비숍',level:280}];
 const p=await boot('party_boss_scheduler',{key:'test-key',snapshots:[snapshot('본캐'),snapshot('부캐')],ownRows:rows});try{
  const req=p.calls.find(c=>c.options.method==='POST'&&JSON.parse(c.options.body).action==='accounts');assert(req);const id=JSON.parse(req.options.body).accounts[0].id;
  p.doc.querySelector('#party-create-toggle').click();select(p.w,'party-boss','Lotus|Extreme');select(p.w,'party-draft-account',id);select(p.w,'party-draft-character','본캐');p.doc.querySelector('#party-draft-add').click();select(p.w,'party-draft-character','부캐');p.doc.querySelector('#party-draft-add').click();assert.equal(p.doc.querySelectorAll('#party-draft-members .party-member').length,1);assert(p.doc.querySelector('#party-draft-status').textContent.includes('같은 계정'));
 }finally{p.close();}
});
test('보조 설정은 접혀 있고 파티 선택 전에는 중복된 파티원 입력 화면을 보이지 않는다',async()=>{
 const shared=await boot('shared_boss_rates');try{assert.equal(shared.doc.querySelector('#shared-account-editor').open,false);assert.equal(shared.doc.querySelector('#shared-owner-settings').open,false);assert.equal(shared.doc.querySelector('.shared-manual-add').open,false);assert.equal(shared.doc.querySelectorAll('#shared-table th').length,3);assert(shared.doc.querySelector('#shared-open'));assert(!shared.doc.querySelector('#shared-conditions'));}finally{shared.close();}
 const party=await boot('party_boss_scheduler');try{assert.equal(party.doc.querySelector('#party-add-panel').hidden,true);assert.equal(party.doc.querySelector('#party-create-form').hidden,true);assert(!party.doc.querySelector('#party-search-form'));party.doc.querySelector('#party-create-toggle').click();assert.equal(party.doc.querySelector('#party-create-form').hidden,false);party.doc.querySelector('#party-create-cancel').click();assert.equal(party.doc.querySelector('#party-create-form').hidden,true);}finally{party.close();}
});
