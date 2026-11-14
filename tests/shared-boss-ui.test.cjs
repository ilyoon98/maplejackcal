'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');
const data=require('../scouter_data.js'),catalog=require('../rate_catalog.js');
const image='https://open.api.nexon.com/static/maplestory/character/look/ABC123';
const profile=name=>({name,world:'루나',job:'히어로',level:285,image,updatedAt:Date.now()});
function snapshot(name='다른사람'){const s=catalog.snapshot(name,[{bossId:'Lotus|Extreme',percent:49.68},{bossId:'Will|Hard',percent:77}],'manual');return {...s,revision:'v1',character:profile(name)};}
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
async function boot(page,{snapshots=[snapshot()],accounts=[],key='',fetchExtra,shot=[],ownRows=[],parties=[],url=''}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../'+page+'.html'),'utf8'),{url:'https://example.test/'+(url||page+'.html'),runScripts:'outside-only'}),w=dom.window,calls=[];let values=structuredClone(snapshots),registry=structuredClone(accounts);
 w.confirm=()=>true;w.setInterval=()=>1;if(key)w.localStorage.setItem('nxopen_api_key',key);
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 if(parties.length)w.localStorage.setItem('partyBossScheduler.v1',JSON.stringify({parties}));
 w.fetch=async(url,options={})=>{calls.push({url,options});if(url==='/api/boss-rates'){
   if(options.method==='POST'){const b=JSON.parse(options.body);if(b.action==='delete'){values=values.filter(s=>s.characterName!==b.characterName);return {ok:true,json:async()=>({deleted:true})};}if(b.action==='accounts'){registry=b.accounts;return {ok:true,json:async()=>({accounts:registry,accountRevision:'accounts-v2'})};}const saved={...b.snapshot,revision:'v2'};values=values.filter(s=>s.characterName!==saved.characterName).concat(saved);return {ok:true,json:async()=>({snapshot:saved})};}
   return {ok:true,json:async()=>({schemaVersion:1,persistent:true,snapshots:structuredClone(values),accounts:structuredClone(registry),accountRevision:registry.length?'accounts-v1':''})};
  }if(fetchExtra)return fetchExtra(url,options);throw new Error('Unexpected network request: '+url);
 };
 const scripts=['boss_db.js','boss_rewards.js','scouter_data.js','account_catalog.js','rate_catalog.js','nexon_key.js','nexon_characters.js','character_profile.js','boss_identity.js'];
 for(const file of scripts)w.eval(fs.readFileSync(path.join(__dirname,'../'+file),'utf8'));
 w.NexonCharacters={...w.NexonCharacters,fetch:async()=>structuredClone(ownRows)};
 w.BossShotReader={readBlob:async()=>shot};w.eval(fs.readFileSync(path.join(__dirname,'../'+page+'.js'),'utf8'));await settle();
 return {w,doc:w.document,calls,close:()=>w.close(),setCatalog(next){values=structuredClone(next);}};
}
function select(w,id,value){const n=w.document.getElementById(id);n.value=value;n.dispatchEvent(new w.Event('change',{bubbles:true}));}
function type(w,id,value){const n=w.document.getElementById(id);n.value=value;n.dispatchEvent(new w.Event('input',{bubbles:true}));}
test('저장된 캐릭터 선택 즉시 프로필과 배율을 열고 중복 열기·조건 확인 버튼 없이 저장한다',async()=>{
 const p=await boot('shared_boss_rates',{snapshots:[snapshot('다른사람'),snapshot('두번째캐릭터')]});try{
  assert.equal(p.doc.querySelector('#shared-open').hidden,false);assert.equal(p.doc.querySelectorAll('#shared-rows tr').length,2);assert(p.doc.querySelector('#shared-profile').textContent.includes('Lv. 285'));assert(p.doc.querySelector('#shared-profile img').src===image);
  select(p.w,'shared-character','두번째캐릭터');await settle();assert(p.doc.querySelector('#shared-profile').textContent.includes('두번째캐릭터'));assert.equal(p.doc.querySelector('#shared-open').hidden,false);assert(!p.doc.querySelector('#shared-confirm'));assert(!p.doc.querySelector('#shared-apply-shot'));
  assert(p.doc.querySelector('#shared-rows .boss-face').src.endsWith('suu.webp'));assert(p.doc.querySelector('#shared-rows .diff-badge.extreme'));
  p.doc.querySelector('#shared-save').click();await settle();assert.equal(p.calls.filter(c=>c.options.method==='POST'&&JSON.parse(c.options.body).snapshot).length,1);assert(p.doc.querySelector('#shared-save-state').textContent.includes('저장 완료'));assert.equal(p.doc.querySelector('#shared-toast').hidden,false);
 }finally{p.close();}
});
test('환산 차단 시 작성 배율을 유지하며 캡처 영역에 포커스를 옮긴다',async()=>{
 const p=await boot('shared_boss_rates',{fetchExtra:async url=>{
  assert(url.startsWith('/api/scouter?'));return {ok:false,json:async()=>({error:{code:'SCOUTER_BLOCKED'}})};
 }});try{
  const row=p.doc.querySelector('#shared-rows input');row.value='136.47';row.dispatchEvent(new p.w.Event('input',{bubbles:true}));
  p.doc.querySelector('#shared-mode-fetch').click();assert.equal(p.doc.querySelector('#shared-capture').hidden,true);
  p.doc.querySelector('#shared-fetch').click();await settle();
  assert.equal(p.doc.querySelector('#shared-capture').hidden,false);
  assert.equal(p.doc.activeElement.id,'shared-drop');assert.equal(row.value,'136.47');
  assert.match(p.doc.querySelector('#shared-status').textContent,/차단/);
 }finally{p.close();}
});
test('파티원 세 명의 예상 딜 비중을 표시하고 파티원을 빼면 다시 계산한다',async()=>{
 const rates=[42.26,43.34,50.87],snapshots=['첫번째','두번째','세번째'].map((name,index)=>{
  const saved=snapshot(name);saved.rates[1].percent=rates[index];return saved;
 });
 const members=snapshots.map((s,index)=>({character:{...s.character,ocid:'shared:'+s.characterName},rate:rates[index]}));
 const p=await boot('party_boss_scheduler',{snapshots,parties:[{id:'p1',name:'테스트',bossId:'Will|Hard',members}]});try{
  // 직접 지은 이름이 있으면 그 이름을, 대표 캐릭터(환산 배율 1위)는 보조 줄에 보여준다.
  assert.match(p.doc.querySelector('#party-list .party-row-title').textContent,/^테스트,/);
  // 목록은 한 줄이라 대표 캐릭터는 화면 읽기용 이름에만 넣는다.
  assert.match(p.doc.querySelector('#party-list .party-row-title').textContent,/대표 세번째/);
  // 목록에는 배율과 판정을 두지 않고 상세에서만 보여준다.
  assert.equal(p.doc.querySelector('#party-list .party-row-total'),null);
  const totals=p.doc.querySelector('#party-detail .party-totals');
  assert.equal(totals.querySelector('.party-metric-value').textContent,'136.47%');
  assert.equal(totals.querySelector('.party-verdict').textContent,'클리어 가능');
  // 예상 딜 비중은 환산 합계 카드 안에 함께 표시한다.
  assert(totals.querySelector('.party-share-chart'));
  const shares=id=>[...p.doc.querySelectorAll('#'+id+' .party-member-metrics .party-metric:nth-child(2) .party-metric-value')].map(n=>n.textContent);
  assert.deepEqual(shares('party-detail'),['30.97%','31.76%','37.28%']);
  const legend=cls=>[...p.doc.querySelectorAll('.party-share-legend .'+cls)].map(n=>n.textContent);
  const segments=[...p.doc.querySelectorAll('.party-share-segment')];
  const colors=segments.map(n=>n.style.backgroundColor);
  assert.deepEqual(legend('party-share-name'),['첫번째','두번째','세번째']);
  assert.deepEqual(legend('party-share-value'),shares('party-detail'));
  assert.equal(new Set(colors).size,3);
  assert.deepEqual([...p.doc.querySelectorAll('.party-share-marker')].map(n=>n.style.backgroundColor),colors);
  assert(Math.abs(segments.reduce((sum,n)=>sum+parseFloat(n.style.width),0)-100)<0.001);
  p.doc.querySelector('.party-edit').click();
  p.doc.querySelector('#party-draft-members .party-member:last-child .party-remove').click();
  assert.deepEqual(shares('party-draft-members'),['49.37%','50.63%']);
  p.doc.querySelector('#party-create-cancel').click();
  assert.deepEqual(shares('party-detail'),['30.97%','31.76%','37.28%']);
  p.doc.querySelector('#party-detail .party-member:last-child .party-remove').click();
  assert.deepEqual(legend('party-share-value'),['49.37%','50.63%']);
 }finally{p.close();}
});
test('기존 파티 수정은 파티원과 ID를 유지하고 변경한 보스의 배율만 합산한다',async()=>{
 const a=snapshot(),b=snapshot('스우전용');b.rates=b.rates.slice(0,1);
 const party={id:'saved-party',name:'금요팟',bossId:'Lotus|Extreme',members:[a,b].map(s=>({character:{...s.character,ocid:'shared:'+s.characterName},rate:49.68,rateMode:'auto'}))};
 const p=await boot('party_boss_scheduler',{snapshots:[a,b],parties:[party]});try{
  const edit=()=>p.doc.querySelector('.party-edit').click();
  const stored=()=>JSON.parse(p.w.localStorage.getItem('partyBossScheduler.v1')).parties[0];
  const form=p.doc.querySelector('#party-create-form');
  assert.equal(p.doc.querySelector('.party-edit').nextElementSibling.className,'party-delete');
  edit();assert.equal(p.doc.querySelector('#party-form-title').textContent,'파티 수정');
  type(p.w,'party-name','취소할 이름');p.doc.querySelector('#party-draft-members .party-remove').click();
  assert.equal(p.doc.querySelectorAll('#party-draft-members .party-member').length,1);
  p.doc.querySelector('#party-create-cancel').click();assert.equal(stored().name,'금요팟');assert.equal(stored().members.length,2);
  edit();type(p.w,'party-name','');select(p.w,'party-boss','Will|Hard');
  p.w.dispatchEvent(new p.w.Event('focus'));await settle();
  assert.equal(form.hidden,false);assert.equal(p.doc.querySelector('#party-boss').value,'Will|Hard');
  form.dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(form.hidden,true);assert.equal(stored().id,party.id);assert.equal(stored().name,'하드 윌');assert.equal(stored().bossId,'Will|Hard');
  assert.deepEqual(stored().members.map(m=>[m.character.name,m.rate]),[['다른사람',77],['스우전용',null]]);
  assert(p.doc.querySelector('#party-detail').textContent.includes('1명 미등록'));
  assert.equal(p.doc.querySelector('.party-share-chart'),null);
  assert.deepEqual([...p.doc.querySelectorAll('#party-detail .party-member-metrics .party-metric:nth-child(2) .party-metric-value')].map(n=>n.textContent),['—','—']);
  edit();type(p.w,'party-name','새 금요팟');p.doc.querySelector('#party-draft-members .party-member:last-child .party-remove').click();
  form.dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(stored().name,'새 금요팟');assert.equal(stored().members[0].rate,77);assert.equal(stored().members.length,1);
 }finally{p.close();}
});
test('보스 보상은 선택한 난이도와 편집 중 인원수를 반영하고 필터 대상 카드만 강조한다',async()=>{
 const members=['첫번째','두번째'].map(name=>({character:{...profile(name),ocid:'shared:'+name},rate:50}));
 const parties=[{id:'boss',name:'대적자 파티',bossId:'TheFirstAdversary|Hard',members},{id:'other',name:'두 번째 파티',bossId:'Will|Hard',members:members.slice(1)}];
 const accounts=[{id:'account1',label:'첫 번째 계정',characters:[{name:'첫번째',profile:profile('첫번째')}]}];
 const p=await boot('party_boss_scheduler',{parties,accounts});try{
  const amount=id=>p.doc.querySelector('#'+id+' .party-crystal .party-metric-value').textContent;
  const highlights=()=>[...p.doc.querySelectorAll('#party-detail .party-member-highlighted .party-member-match')].map(n=>n.textContent);
  [...p.doc.querySelectorAll('#party-list button')].find(b=>b.textContent.includes('대적자 파티')).click();
  assert.equal(amount('party-detail'),'6억 9,500만 메소');
  assert.match(p.doc.querySelector('#party-detail .party-reward').textContent,/2인 균등 분배/);
  const item=(id,name)=>[...p.doc.querySelectorAll('#'+id+' .party-reward-item')].find(tile=>tile.dataset.tooltip===name);
  assert.match(item('party-detail','불멸의 유산').firstElementChild.style.backgroundImage,/TheFirstAdversary\.png/);
  for(const [name,count] of [['이어진 고대의 결의','6'],['에리온의 조각 교환권','30'],['솔 에르다의 기운','450']]){
   assert.equal(item('party-detail',name).querySelector('.party-reward-quantity').textContent,count);
  }
  assert.deepEqual(highlights(),[]);
  const filter=(query,label)=>{p.doc.querySelector('#party-open-filter').click();type(p.w,'party-filter-query',query);p.doc.querySelector('#party-filter-results button[aria-label="'+label+'"]').click();};
  filter('첫번째','캐릭터 첫번째');
  assert.equal(p.doc.querySelectorAll('#party-list button').length,1);
  assert.deepEqual(highlights(),['선택한 캐릭터']);
  filter('첫 번째','계정 첫 번째 계정');assert.deepEqual(highlights(),['선택한 계정']);
  p.doc.querySelector('.party-edit').click();
  assert.equal(amount('party-draft-summary'),'6억 9,500만 메소');
  p.doc.querySelector('#party-draft-members .party-remove').click();
  assert.equal(amount('party-draft-summary'),'13억 9,000만 메소');
  assert.equal(item('party-draft-summary','이어진 고대의 결의').querySelector('.party-reward-quantity').textContent,'6');
  select(p.w,'party-boss','TheFirstAdversary|Normal');
  assert.equal(item('party-draft-summary','불멸의 유산'),undefined);
  assert.equal(item('party-draft-summary','이어진 고대의 결의 조각').querySelector('.party-reward-quantity').textContent,'4');
  p.doc.querySelector('#party-draft-members .party-remove').click();
  select(p.w,'party-boss','Lotus|Normal');
  assert.equal(amount('party-draft-summary'),'835만 메소');
  assert.match(p.doc.querySelector('#party-draft-summary .party-crystal').textContent,/결정석 기본가/);
  p.doc.querySelector('#party-create-cancel').click();
  assert.equal(amount('party-detail'),'6억 9,500만 메소');
 }finally{p.close();}
});
test('보스 필터는 별칭으로 찾고 해당 보스의 모든 난이도를 보여주며 한 번에 해제한다',async()=>{
 const parties=[['검마 하드','BlackMage|Hard'],['검마 익스트림','BlackMage|Extreme'],['스우','Lotus|Hard']].map(([name,bossId],id)=>({id:String(id),name,bossId,members:[]}));
 const p=await boot('party_boss_scheduler',{parties});try{
  p.doc.querySelector('#party-open-filter').click();
  type(p.w,'party-filter-query','없는 보스');assert.equal(p.doc.querySelector('#party-filter-empty').hidden,false);
  type(p.w,'party-filter-query','검마');
  const option=p.doc.querySelector('#party-filter-results button[aria-label="보스 검은 마법사"]');
  assert(option.querySelector('img').src.endsWith('black_mage.webp'));option.click();
  assert.equal(p.doc.querySelector('#party-view-count').textContent,'파티 2개');
  assert.equal(p.doc.querySelector('#party-active-filter').textContent,'보스 · 검은 마법사');
  assert.deepEqual([...p.doc.querySelectorAll('#party-list .diff-badge')].map(n=>n.textContent),['하드','익스트림']);
  assert.equal(p.doc.querySelector('#party-filter-dialog').open,false);
  p.doc.querySelector('#party-clear-filter').click();
  assert.equal(p.doc.querySelector('#party-view-count').textContent,'파티 3개');
  assert.equal(p.doc.querySelector('#party-view-all').getAttribute('aria-pressed'),'true');
 }finally{p.close();}
});
test('스케줄러에서 선택 가능한 모든 난이도의 보상 아이콘은 로컬 이미지 안에 있다',()=>{
 const rewards=require('../boss_rewards.js'),db=require('../boss_db.js');
 const cache=new Map();
 for(const {id} of catalog.choices(db)){
  const items=rewards.forBoss(id);assert(items.length,id);
  for(const item of items){
   if(!cache.has(item.image)){
    const bytes=fs.readFileSync(path.join(__dirname,'..',item.image));
    assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
    cache.set(item.image,[bytes.readUInt32BE(16),bytes.readUInt32BE(20)]);
   }
   const [width,height]=cache.get(item.image);
   assert(Number.isInteger(item.x)&&Number.isInteger(item.y)&&item.x>=0&&item.y>=0&&item.x+40<=width&&item.y+40<=height,id+' '+item.name);
  }
 }
 assert.deepEqual(rewards.forBoss('Lotus|Unknown'),[]);
});
test('공용 외형이 누락된 기존 파티원을 다시 조회하고 계정 새로고침 뒤에도 사진을 유지한다',async()=>{
 const a=snapshot();a.character.image='';
 const member={character:{...a.character,ocid:'shared:'+a.characterName},rate:49.68,rateMode:'auto'};
 const p=await boot('party_boss_scheduler',{snapshots:[a],key:'test-key',parties:[{id:'party',name:'파티',bossId:'Lotus|Extreme',members:[member]}],fetchExtra:async url=>{
  const raw=new URL(url).pathname.endsWith('/id')?{ocid:'lookup-id'}:{character_name:a.characterName,world_name:'루나',character_class:'히어로',character_level:285,character_image:image};
  return {ok:true,json:async()=>raw};
 }});try{
  assert.equal(p.doc.querySelector('#party-detail .party-portrait img').src,image);
  a.character.updatedAt=Date.now()+1000;p.setCatalog([a]);p.w.dispatchEvent(new p.w.Event('focus'));await settle();
  assert.equal(p.doc.querySelector('#party-detail .party-portrait img').src,image);
 }finally{p.close();}
});
test('최신 계정 정보에 외형이 빠져 있어도 저장된 공식 외형과 저장 완료 상태를 표시한다',async()=>{
 const a=snapshot(),avatar='https://avatar.maplestory.nexon.com/CharacterEx/180/ABCDEFG.png';
 a.character={...a.character,image:avatar};
 const p=await boot('shared_boss_rates',{snapshots:[a],accounts:[{id:'owner',label:'계정',characters:[{name:a.characterName,profile:{...a.character,image:'',level:286,updatedAt:Date.now()+1000}}]}]});try{
  assert.equal(p.doc.querySelector('#shared-profile img').src,avatar);
  assert.match(p.doc.querySelector('#shared-profile').textContent,/Lv\. 286/);
  p.doc.querySelector('#shared-save').click();await settle();
  assert.equal(p.doc.querySelector('#shared-save-bar').dataset.state,'saved');
  assert.equal(p.doc.querySelector('#shared-save').textContent,'✓ 저장 완료');
  const row=p.doc.querySelector('#shared-rows input');row.value='50';row.dispatchEvent(new p.w.Event('input',{bubbles:true}));
  assert.equal(p.doc.querySelector('#shared-save-bar').dataset.state,'');
  assert.equal(p.doc.querySelector('#shared-save').textContent,'공용 배율 저장');
 }finally{p.close();}
});
test('캡처 토글·붙여넣기는 확실한 카드만 즉시 반영하고 불확실한 기존 배율과 나머지 값은 유지한다',async()=>{
 const p=await boot('shared_boss_rates',{shot:[{name:'스우',diff:'익스트림',value:41.22,sure:true},{name:'윌',diff:'하드',value:999,sure:false}]});try{
  assert.equal(p.doc.querySelector('#shared-mode-capture').getAttribute('aria-pressed'),'true');assert.equal(p.doc.querySelector('#shared-capture').hidden,false);assert(p.doc.querySelector('#shared-fetch-panel').hidden);
  assert.equal(p.doc.querySelectorAll('.shared-capture-steps li').length,4);
  assert.equal(p.doc.querySelector('#shared-capture-guide').dataset.uxHelpTrigger,'shared-capture-guide-section');
  assert.match(p.doc.querySelector('#shared-capture-guide').textContent,/^\? 캡처 등록 방법$/);
  assert.equal(p.doc.querySelectorAll('.shared-capture-steps img').length,2);
  assert.match(p.doc.querySelector('.shared-capture-steps li').textContent,/내 기준보기.*전체 보기.*데스티니\/유챔 확인.*OFF/);
  const e=new p.w.Event('paste',{bubbles:true,cancelable:true});e.clipboardData={items:[{kind:'file',getAsFile:()=>new p.w.Blob(['fake-pixels'],{type:'image/png'})}]};p.doc.querySelector('#shared-drop').dispatchEvent(e);await settle();
  const inputs=[...p.doc.querySelectorAll('#shared-rows input')];assert.equal(inputs[0].value,'41.22');assert.equal(inputs[1].value,'77');assert(p.doc.querySelector('#shared-shot-status').textContent.includes('1개 배율 자동 반영'));assert(p.doc.querySelector('#shared-review').textContent.includes('기존 값 유지'));assert.equal(p.calls.filter(c=>c.options.method==='POST'&&JSON.parse(c.options.body).snapshot).length,0);
  p.doc.querySelector('#shared-save').click();await settle();const saved=JSON.parse(p.calls.find(c=>c.options.method==='POST'&&JSON.parse(c.options.body).snapshot).options.body).snapshot;assert.equal(saved.captureMethod,'screenshot');assert.equal(saved.conditions.destinyChampion,false);assert.equal(saved.rates[0].percent,41.22);assert.equal(saved.rates[1].percent,77);
 }finally{p.close();}
});
test('타인 닉네임 검색은 id/basic만 조회하고 레벨·서버·직업·외형만 공유 저장한다',async()=>{
 const stale=snapshot();stale.character.updatedAt=Date.now()-7200000;const p=await boot('shared_boss_rates',{snapshots:[stale],key:'test-key-only',fetchExtra:async(url,options)=>{const u=new URL(url);assert.equal(options.headers['x-nxopen-api-key'],'test-key-only');assert(!u.pathname.endsWith('/character/list'));return {ok:true,json:async()=>u.pathname.endsWith('/id')?{ocid:'private-ocid'}:{character_name:u.searchParams.get('ocid')==='private-ocid'?'다른사람':'',world_name:'스카니아',character_class:'비숍',character_level:290,character_image:image}};}});try{
  assert.deepEqual([...p.doc.querySelectorAll('#shared-profile .character-chip')].map(n=>n.textContent),['스카니아','Lv. 290','비숍']);p.doc.querySelector('#shared-save').click();await settle();const body=p.calls.find(c=>c.options.method==='POST'&&JSON.parse(c.options.body).snapshot).options.body;assert(!body.includes('test-key-only'));assert(!body.includes('private-ocid'));const c=JSON.parse(body).snapshot.character;assert.equal(c.level,290);assert.equal(c.world,'스카니아');assert.equal(c.job,'비숍');assert.equal(c.image,image);
 }finally{p.close();}
});
test('파티는 API 키 없이 공용 캐릭터를 추가하고 해당 보스 배율을 합산한다',async()=>{
 const p=await boot('party_boss_scheduler',{snapshots:[snapshot(),{...snapshot('윌전용캐릭터'),rates:[{bossId:'Will|Hard',percent:12}]}]});try{
  p.doc.querySelector('#party-create-toggle').click();select(p.w,'party-boss','Lotus|Extreme');type(p.w,'party-name','금요팟');p.doc.querySelector('#party-create-form').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  const options=[...p.doc.querySelector('#party-saved-character').options];assert(options.some(o=>o.value==='다른사람'));assert(options.find(o=>o.value==='윌전용캐릭터').disabled);
  select(p.w,'party-saved-character','다른사람');await settle();
  assert.deepEqual([...p.doc.querySelectorAll('#party-character-preview .character-chip')].map(n=>n.textContent),['루나','Lv. 285','히어로']);
  assert(p.doc.querySelector('#party-character-preview .character-world img').src.endsWith('/icons/server/%EB%A3%A8%EB%82%98.webp'));
  assert.equal(p.doc.querySelector('#party-character-preview .party-portrait img').src,image);
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
   select(p.w,'party-boss','Lotus|Extreme');
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
test('공용 계정은 키 없이 등록된 260 이상 캐릭터로 편집하고 숨긴 기존 소속을 보존한다',async()=>{
 const main=snapshot('친구본캐'),added=snapshot('추가캐릭터'),low=snapshot('낮은캐릭터'),unknown=snapshot('레벨미확인'),elsewhere=snapshot('다른계정캐릭터');
 added.character.level=260;low.character.level=259;delete unknown.character;
 const registry=[{id:'friend',label:'친구 계정',characters:[{name:main.characterName},{name:low.characterName},{name:'배율미등록',profile:profile('배율미등록')}]},
  {id:'other',label:'기존 묶음',characters:[{name:elsewhere.characterName}]}];
 const p=await boot('shared_boss_rates',{snapshots:[main,added,low,unknown,elsewhere],accounts:registry});try{
  assert.equal(p.doc.querySelector('#shared-group-fields').hidden,true);
  select(p.w,'shared-group-select','friend');
  assert.equal(p.doc.querySelector('#shared-group-fields').hidden,false);
  const candidates=()=>[...p.doc.querySelectorAll('#shared-group-members button')];
  const results=()=>[...p.doc.querySelectorAll('#shared-group-results button')];
  assert.deepEqual(candidates().map(n=>n.value),['친구본캐']);assert.equal(candidates()[0].textContent,'빼기');
  assert.equal(p.doc.querySelector('#shared-group-label').closest('details').id,'shared-account-editor');
  candidates()[0].click();assert.equal(candidates()[0].textContent,'되돌리기');
  candidates()[0].click();assert.equal(candidates()[0].textContent,'빼기');
  // 검색하지 않아도 미분류 등록 캐릭터만 보이고, 다른 계정 소속·260 미만·레벨 미확인 캐릭터는 숨긴다.
  assert.deepEqual(results().map(n=>n.value),['추가캐릭터']);
  type(p.w,'shared-group-search','다른계정');assert.deepEqual(results(),[]);
  type(p.w,'shared-group-search','추가');assert.deepEqual(results().map(n=>n.value),['추가캐릭터']);
  assert.equal(results()[0].textContent,'추가');
  results()[0].click();assert.deepEqual(results(),[]);
  assert.equal(p.doc.querySelector('.shared-group-pending').textContent,'추가 예정');
  type(p.w,'shared-group-label','친구 새 이름');
  p.doc.querySelector('#shared-refresh').click();await settle();
  assert.equal(candidates()[1].textContent,'빼기');assert.equal(p.doc.querySelector('#shared-group-label').value,'친구 새 이름');
  p.doc.querySelector('#shared-group-save').click();await settle();
  const body=JSON.parse(p.calls.find(c=>c.options.method==='POST').options.body);
  assert.deepEqual(body.accounts[0].characters.map(c=>c.name),['친구본캐','낮은캐릭터','배율미등록','추가캐릭터']);
  assert.equal(body.accounts[0].label,'친구 새 이름');assert.deepEqual(body.accounts[1].characters.map(c=>c.name),['다른계정캐릭터']);
  assert.match(p.doc.querySelector('#shared-group-status').textContent,/공용 계정에 저장했습니다/);
  p.doc.querySelector('#shared-refresh').click();await settle();
  assert.equal(candidates().filter(n=>n.textContent==='빼기').length,2);assert(p.calls.every(c=>c.url==='/api/boss-rates'));
 }finally{p.close();}
});
test('새 계정 이름을 비우면 소속 캐릭터 중 가장 높은 레벨의 닉네임을 사용한다',async()=>{
 const high=snapshot('높은캐릭터'),low=snapshot('낮은캐릭터');high.character.level=297;low.character.level=270;
 const p=await boot('shared_boss_rates',{snapshots:[high,low]});try{
  select(p.w,'shared-group-select','');
  const name=p.doc.querySelector('#shared-group-label');assert.equal(name.closest('#shared-group-fields').hidden,false);
  assert.equal(name.closest('details').id,'shared-account-editor');
  for(const s of [high,low]){
   type(p.w,'shared-group-search',s.characterName);p.doc.querySelector('#shared-group-results button').click();
  }
  assert.equal(p.doc.querySelector('#shared-group-members input[type="checkbox"]'),null);
  p.doc.querySelector('#shared-group-save').click();await settle();
  const body=JSON.parse(p.calls.find(c=>c.options.method==='POST').options.body);
  assert.equal(body.accounts[0].label,'');
  assert.equal(p.doc.querySelector('#shared-group-select option:checked').textContent,high.characterName);
  p.doc.querySelector('#shared-refresh').click();await settle();
  assert.equal(p.doc.querySelector('#shared-group-select option:checked').textContent,high.characterName);
 }finally{p.close();}
});
test('내 계정 자동 연결은 비공개 계정 ID와 OCID를 공용 요청에 넣지 않고 수동 불러오기 버튼을 두지 않는다',async()=>{
 const ownRows=[{name:'계정본캐',accountId:'private-account',ocid:'private-ocid',world:'루나',characterClass:'히어로',level:290},{name:'계정부캐',accountId:'private-account',ocid:'private-ocid2',world:'루나',characterClass:'비숍',level:280}];
 const p=await boot('shared_boss_rates',{snapshots:[],key:'test-key',ownRows});try{
  assert.equal(p.doc.querySelector('#shared-import-account'),null);await settle();assert.equal(p.doc.querySelectorAll('#shared-account option').length,2);const body=p.calls.find(c=>c.options.method==='POST').options.body;assert(!body.includes('private-'));assert.equal(JSON.parse(body).accounts[0].characters.length,2);assert(p.doc.querySelector('#shared-account').textContent.includes('계정본캐'));
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
test('계정 선택은 전체 계정과 미분류를 구분선과 강조로 나누고 캐릭터 목록의 미분류 묶음도 강조한다',async()=>{
 const p=await boot('shared_boss_rates',{snapshots:[snapshot('묶인캐릭터'),snapshot('미분류캐릭터')],accounts:[{id:'group-one',label:'본계정',characters:[{name:'묶인캐릭터'}]}]});try{
  const account=p.doc.querySelector('#shared-account');
  assert.deepEqual([...account.children].map(n=>n.tagName==='HR'?'—':n.textContent),['전체 계정','—','본계정','—','미분류 캐릭터 · 계정 설정 필요']);
  assert(account.options[0].classList.contains('shared-account-all'));assert(account.options[2].classList.contains('shared-unassigned'));
  const unassigned=p.doc.querySelector('#shared-character optgroup.shared-unassigned');assert.equal(unassigned.label,'미분류 캐릭터 · 계정 설정 필요');
  assert.deepEqual([...unassigned.children].map(o=>o.value),['미분류캐릭터']);
 }finally{p.close();}
});
test('잘못 넣은 캐릭터는 확인 후 공용 배율과 계정 소속에서 삭제한다',async()=>{
 const p=await boot('shared_boss_rates',{snapshots:[snapshot('남길캐릭터'),snapshot('잘못넣음')],accounts:[{id:'group-one',label:'본계정',characters:[{name:'남길캐릭터'},{name:'잘못넣음'}]}]});try{
  select(p.w,'shared-character','잘못넣음');await settle();
  const remove=p.doc.querySelector('#shared-delete');assert.equal(remove.hidden,false);
  remove.click();await settle();
  const posts=p.calls.filter(c=>c.options.method==='POST').map(c=>JSON.parse(c.options.body));
  assert.deepEqual(posts[0],{action:'delete',characterName:'잘못넣음',expectedRevision:'v1'});
  assert.deepEqual(posts[1].accounts[0].characters.map(c=>c.name),['남길캐릭터']);
  assert(![...p.doc.querySelector('#shared-character').options].some(o=>o.value==='잘못넣음'));
  assert.match(p.doc.querySelector('#shared-status').textContent,/잘못넣음 캐릭터를 공용 배율에서 삭제했습니다/);
 }finally{p.close();}
});
test('새 캐릭터 조회가 실패하면 저장을 막고 등록된 캐릭터는 그대로 저장할 수 있다',async()=>{
 const p=await boot('shared_boss_rates',{snapshots:[snapshot('기존캐릭터')],key:'test-key',fetchExtra:async url=>{const u=new URL(url);if(u.pathname.endsWith('/id'))return {ok:false,json:async()=>({error:{name:'OPENAPI00004'}})};return {ok:true,json:async()=>[]};}});try{
  type(p.w,'shared-nickname','없는캐릭터');p.doc.querySelector('#shared-open').dispatchEvent(new p.w.Event('submit',{cancelable:true}));await settle();
  p.doc.querySelector('#shared-add').click();await settle();
  assert.equal(p.doc.querySelector('#shared-save').disabled,true);assert.equal(p.doc.querySelector('#shared-delete').hidden,true);
  assert.match(p.doc.querySelector('#shared-profile-status').textContent,/캐릭터를 찾을 수 없습니다.*조회에 성공한 캐릭터만 등록할 수 있습니다/);
  select(p.w,'shared-character','기존캐릭터');await settle();assert.equal(p.doc.querySelector('#shared-save').disabled,false);
 }finally{p.close();}
});
test('API 키가 없으면 새 캐릭터는 등록할 수 없고 등록된 캐릭터 배율은 저장할 수 있다',async()=>{
 const p=await boot('shared_boss_rates',{snapshots:[snapshot('기존캐릭터')]});try{
  assert.equal(p.doc.querySelector('#shared-save').disabled,false);
  type(p.w,'shared-nickname','새캐릭터');p.doc.querySelector('#shared-open').dispatchEvent(new p.w.Event('submit',{cancelable:true}));await settle();
  p.doc.querySelector('#shared-add').click();await settle();
  assert.equal(p.doc.querySelector('#shared-save').disabled,true);
  assert.match(p.doc.querySelector('#shared-profile-status').textContent,/새 캐릭터는 홈에서 API 키를 등록하고 조회에 성공해야 등록할 수 있습니다/);
  assert(!p.calls.some(c=>c.options.method==='POST'));
 }finally{p.close();}
});
test('주소의 party와 scope로 들어오면 해당 파티를 열고 없으면 안내한다',async()=>{
 const members=['첫번째','두번째'].map(name=>({character:{...profile(name),ocid:'shared:'+name},rate:50}));
 const parties=[{id:'first',name:'첫 파티',bossId:'Will|Hard',members},{id:'second',name:'두 번째 파티',bossId:'Lucid|Hard',members:members.slice(1)}];
 let p=await boot('party_boss_scheduler',{parties,url:'party_boss_scheduler.html?scope=local&party=second'});try{
  assert.match(p.doc.querySelector('#party-list button[aria-pressed="true"] .party-row-title').textContent,/^두 번째 파티,/);
  assert.equal(p.w.localStorage.getItem('partyBossScheduler.scope.v1'),null);
 }finally{p.close();}
 p=await boot('party_boss_scheduler',{parties,url:'party_boss_scheduler.html?scope=local&party=missing'});try{
  assert.match(p.doc.querySelector('#party-storage-status').textContent,/찾는 파티가 없습니다/);
 }finally{p.close();}
});
test('이름을 짓지 않은 파티는 본캐 먼저 딜 비중 순으로 파티원 이름 앞글자를 이어 목록 제목으로 쓴다',async()=>{
 const rates=[42.26,43.34,50.87],snapshots=['첫번째','두번째','세번째'].map((name,index)=>{const saved=snapshot(name);saved.rates[1].percent=rates[index];return saved;});
 const members=snapshots.map((s,index)=>({character:{...s.character,ocid:'shared:'+s.characterName},rate:rates[index]}));
 const visible=title=>[...title.childNodes].filter(n=>!n.classList?.contains('sr-only')).map(n=>n.textContent).join('');
 let p=await boot('party_boss_scheduler',{snapshots,parties:[{id:'p1',name:'하드 윌',bossId:'Will|Hard',members}]});try{
  const title=p.doc.querySelector('#party-list .party-row-title');
  // 3명이라 2글자씩, 본캐가 없으면 딜 비중(환산 배율)이 높은 순이다. 화면 읽기용으로는 전체 이름을 둔다.
  assert.equal(visible(title),'세번,두번,첫번');
  assert.equal(title.querySelector('.sr-only').textContent,'세번째, 두번째, 첫번째');
  // 목록 폭이 좁아 잘릴 수 있으므로 마우스를 올리면 전체 파티원 이름을 보여준다.
  assert.equal(title.dataset.tooltip,'세번째, 두번째, 첫번째');
 }finally{p.close();}
 // 같은 계정의 본캐(계정 이름과 같은 캐릭터)는 딜 비중과 관계없이 맨 앞에 온다. 2명이면 3글자씩이다.
 p=await boot('party_boss_scheduler',{snapshots,accounts:[{id:'acc',label:'첫번째',characters:[{name:'첫번째'}]}],parties:[{id:'p1',name:'하드 윌',bossId:'Will|Hard',members:[members[0],members[2]]}]});try{
  assert.equal(visible(p.doc.querySelector('#party-list .party-row-title')),'첫번째,세번째');
 }finally{p.close();}
 p=await boot('party_boss_scheduler',{snapshots,parties:[{id:'p1',name:'하드 윌',bossId:'Will|Hard',members:[members[1]]}]});try{
  assert.equal(p.doc.querySelector('#party-list .party-row-title').textContent,'두번째');
 }finally{p.close();}
});
