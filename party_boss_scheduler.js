(function(root,factory){
  'use strict';
  var api=factory(typeof module==='object'&&module.exports?require('./scouter_data.js'):root.ScouterData);
  if(typeof module==='object'&&module.exports) module.exports=api;
  else {root.PartyBossScheduler=api;api.mount(root);}
})(typeof window!=='undefined'?window:globalThis,function(scouter){
  'use strict';
  var STORAGE='partyBossScheduler.v1';
  var BASE='https://open.api.nexon.com/maplestory/v1';
  function text(v,n){return typeof v==='string'?v.trim().slice(0,n||100):'';}
  function imageUrl(v){
    try{var u=new URL(v);return u.origin==='https://open.api.nexon.com'&&!u.username&&!u.password&&/^\/static\/maplestory\/character\/look\/[A-Za-z0-9]+$/.test(u.pathname)?u.href:'';}catch(e){return '';}
  }
  function profile(raw,ocid){
    if(!raw||!text(raw.character_name,30)||!text(ocid,160))throw new Error('PROFILE_INVALID');
    return {ocid:text(ocid,160),name:text(raw.character_name,30),world:text(raw.world_name,30),job:text(raw.character_class,50),level:Math.max(0,Math.floor(Number(raw.character_level)||0)),image:imageUrl(raw.character_image),updatedAt:Date.now()};
  }
  function rate(v){if(v==null||(typeof v!=='number'&&typeof v!=='string')||typeof v==='string'&&!v.trim())return null;var n=Number(v);return Number.isFinite(n)&&n>=0&&n<=1e9?n:null;}
  function summary(members){return members.reduce(function(s,m){var n=rate(m.rate);if(n===null)s.missing++;else s.total+=n;return s;},{total:0,missing:0});}
  function catalog(db){
    var labels={Easy:'이지',Normal:'노멀',Hard:'하드',Chaos:'카오스',Extreme:'익스트림'};
    return Object.keys(db||{}).filter(function(k){return k!=='BossAliases'&&db[k]&&db[k].Name;}).flatMap(function(k){
      return Object.keys(labels).filter(function(d){return db[k][d]&&Number(db[k][d].CrystalPrice)>0;}).map(function(d){return {id:k+'|'+d,label:labels[d]+' '+db[k].Name,max:Number(db[k][d].RestrictionPersonnel)||1};});
    });
  }
  function restore(raw,choices){
    var data=raw&&Array.isArray(raw.parties)?raw.parties:[],allowed=new Set(choices.map(function(c){return c.id;})),seen=new Set();
    return data.slice(0,200).flatMap(function(p){
      if(!p||!text(p.id,100)||seen.has(p.id)||!allowed.has(p.bossId))return [];seen.add(p.id);
      var chars=new Set();
      var members=(Array.isArray(p.members)?p.members:[]).slice(0,99).flatMap(function(m){
        if(!m||!m.character)return [];var c=m.character,id=text(c.ocid,160);if(!id||chars.has(id)||!text(c.name,30))return [];chars.add(id);
        return [{character:{ocid:id,name:text(c.name,30),world:text(c.world,30),job:text(c.job,50),level:Math.max(0,Math.floor(Number(c.level)||0)),image:imageUrl(c.image),updatedAt:Number(c.updatedAt)||0},rate:rate(m.rate),rateMode:m.rateMode==='auto'||rate(m.rate)===null?'auto':'manual',rateUpdatedAt:Number.isFinite(Date.parse(m.rateUpdatedAt))?m.rateUpdatedAt:''}];
      });
      var max=choices.find(function(c){return c.id===p.bossId;}).max;
      return [{id:text(p.id,100),name:text(p.name,60)||'새 파티',bossId:p.bossId,schedule:text(p.schedule,80),members:members.slice(0,max)}];
    });
  }
  function client(fetchImpl,getKey){
    async function get(path,params,signal){
      var key=getKey();if(!key)throw new Error('API_KEY_REQUIRED');
      if(signal&&signal.aborted)throw new DOMException('Aborted','AbortError');
      var res=await fetchImpl(BASE+path+'?'+new URLSearchParams(params),{headers:{'x-nxopen-api-key':key},signal:signal});
      var body=await res.json();
      if(!res.ok){var e=new Error('NEXON_API_ERROR');e.code=body&&body.error&&body.error.name;throw e;}
      return body;
    }
    return {load:async function(target,signal){
      var id=target.ocid;
      if(!id){var found=await get('/id',{character_name:target.name},signal);id=found&&found.ocid;}
      if(!text(id,160))throw new Error('PROFILE_INVALID');
      return profile(await get('/character/basic',{ocid:id},signal),id);
    }};
  }
  function scouterClient(fetchImpl){return {load:async function(name,signal){
    if(!scouter.validName(name))throw new Error('SCOUTER_BAD_INPUT');
    var response=await fetchImpl('/api/boss-rates',{signal:signal,cache:'no-store'});
    if(!response.ok)throw new Error('RATE_STORE_UNAVAILABLE');
    var result=scouter.findShared(await response.json(),name,'00000');if(!result)throw new Error('RATE_NOT_SAVED');return result;
  }};}
  function applySnapshot(parties,ocid,snapshot,canonical){
    parties.forEach(function(p){var row=snapshot.rates.find(function(r){return r.bossId===p.bossId;});p.members.forEach(function(m){
      if(m.character.ocid!==ocid||m.rateMode==='manual'&&!canonical)return;
      m.rate=row?row.percent:null;m.rateMode='auto';m.rateUpdatedAt=snapshot.fetchedAt;
    });});
  }
  function mount(win){
    var doc=win.document;if(!doc||!doc.getElementById('party-search-form'))return;
    var el=function(id){return doc.getElementById(id);},choices=catalog(win.MapleBossDB),parties=[],selected='',current=null,owned=new Set(),shared={snapshots:[]},profileVersion=0,syncVersion=0,controller=null;
    var profiles=win.CharacterProfile||(typeof module==='object'?require('./character_profile.js'):null),visual=win.BossIdentity||(typeof module==='object'?require('./boss_identity.js'):null);
    var profileApi=profiles.client(win.fetch.bind(win),function(){return win.NexonKey&&win.NexonKey.get();});
    try{var saved=JSON.parse(win.localStorage.getItem(STORAGE)||'{}');parties=restore(saved,choices);}catch(e){}
    function node(tag,cls,label){var n=doc.createElement(tag);if(cls)n.className=cls;if(label!=null)n.textContent=label;return n;}
    function status(message,error){el('party-search-status').textContent=message||'';el('party-search-status').classList.toggle('error',!!error);}
    function persist(){try{win.localStorage.setItem(STORAGE,JSON.stringify({parties:parties}));el('party-storage-status').textContent='';}catch(e){el('party-storage-status').textContent='브라우저에 저장하지 못했습니다.';}}
    function snapshotFor(c){return scouter.findShared(shared,c.name,'00000');}
    function makeMember(c,bossId){var snap=snapshotFor(c),r=snap&&snap.rates.find(function(row){return row.bossId===bossId;});return {character:{...c},rate:r?r.percent:null,rateMode:'auto',rateUpdatedAt:snap?snap.fetchedAt:''};}
    function targetBoss(){var p=parties.find(function(p){return p.id===selected;});return !el('party-create-form').hidden?el('party-boss').value:p?p.bossId:'';}
    function available(){var bossId=targetBoss();return shared.snapshots.filter(function(raw){var snap=scouter.findShared(shared,raw.characterName,'00000');return snap&&(!bossId||snap.rates.some(function(r){return r.bossId===bossId;}));});}
    function candidates(){
      var select=el('party-saved-character'),items=available(),bossId=targetBoss();select.replaceChildren();var placeholder=node('option','',items.length?'공용 캐릭터 선택':'이 보스의 등록 배율이 없습니다');placeholder.value='';select.append(placeholder);
      items.forEach(function(s){var c=profiles.fresh(s.character,s.characterName),r=s.rates.find(function(r){return r.bossId===bossId;}),option=node('option','',s.characterName+(c?' · '+c.world+' · Lv.'+c.level:'')+(r?' · '+r.percent+'%':''));option.value=s.characterName;select.append(option);});select.disabled=!items.length;
      if(current&&!items.some(function(s){return s.characterName===current.name;})){current=null;profileVersion++;if(controller)controller.abort();}
      select.value=current?current.name:'';renderPreview();
    }
    function portrait(c){
      var box=node('div','party-portrait'),fallback=node('span','',c.image?'이미지 로딩 중':'외형 미등록');box.append(fallback);
      if(c.image&&Date.now()-c.updatedAt<30*86400000){var img=node('img');img.alt=c.name+' 캐릭터 외형';img.referrerPolicy='no-referrer';img.addEventListener('load',function(){fallback.hidden=true;});img.addEventListener('error',function(){img.hidden=true;fallback.hidden=false;fallback.textContent='외형 로드 실패';});img.src=c.image;box.append(img);}return box;
    }
    function renderPreview(){
      var host=el('party-character-preview');host.replaceChildren();if(!current){host.append(node('p','party-note','공용 배율 캐릭터를 선택하세요.'));return;}
      var s=snapshotFor(current);host.append(portrait(current),node('strong','',current.name),node('p','party-note',current.level?current.world+' · Lv.'+current.level+' · '+current.job:'캐릭터 정보 미등록'),node('p','party-note',s?'공용 배율 '+s.rates.length+'개':'공용 배율 미등록'));
      var link=node('a','','공용 배율 · 캐릭터 정보 설정');link.href='shared_boss_rates.html?'+new URLSearchParams({name:current.name});link.target='_blank';link.rel='noopener noreferrer';host.append(link);
    }
    function visible(){return parties.filter(function(p){return el('party-view').value!=='mine'||p.members.some(function(m){return owned.has(m.character.name);});});}
    function renderBoard(){
      var list=el('party-list'),detail=el('party-detail'),shown=visible();list.replaceChildren();detail.replaceChildren();if(!shown.some(function(p){return p.id===selected;}))selected=shown[0]?shown[0].id:'';
      shown.forEach(function(p){var button=node('button'),sum=summary(p.members),boss=choices.find(function(c){return c.id===p.bossId;});button.type='button';button.setAttribute('aria-pressed',String(p.id===selected));var heading=node('strong');heading.append(visual.create(doc,p.bossId,win.MapleBossDB));button.append(heading,node('span','',p.name),node('small','',(p.schedule||'일정 미정')+' · '+p.members.length+'/'+boss.max+'명'),node('small','',sum.total.toLocaleString('ko-KR',{maximumFractionDigits:2})+'%'+(sum.missing?' · '+sum.missing+'명 미등록':'')));button.addEventListener('click',function(){selected=p.id;candidates();renderBoard();});list.append(button);});
      var p=parties.find(function(item){return item.id===selected;});if(!p){detail.append(node('p','party-empty',el('party-view').value==='mine'?'내 캐릭터가 있는 파티가 없습니다.':'파티를 만들고 공용 캐릭터를 추가하세요.'));return;}
      var boss=choices.find(function(c){return c.id===p.bossId;}),sum=summary(p.members),head=node('div','party-search-row'),add=node('button','party-primary','선택한 캐릭터 추가');add.type='button';add.disabled=!current||!snapshotFor(current)||!snapshotFor(current).rates.some(function(r){return r.bossId===p.bossId;});
      add.addEventListener('click',function(){if(!current)return;if(p.members.some(function(m){return m.character.name===current.name;})){status('이미 이 파티에 있는 캐릭터입니다.',true);return;}if(p.members.length>=boss.max){status('최대 '+boss.max+'명까지 구성할 수 있습니다.',true);return;}p.members.push(makeMember(current,p.bossId));persist();renderBoard();status(current.name+' 캐릭터를 추가했습니다.');});
      var title=node('h3');title.append(visual.create(doc,p.bossId,win.MapleBossDB),node('span','',p.name));head.append(title,add);detail.append(head);
      var total=node('div','party-total'),values=node('div');values.append(node('p','party-note','개인 환산 배율 합계'),node('output','',sum.total.toLocaleString('ko-KR',{maximumFractionDigits:2})+'%'));if(sum.missing)values.append(node('p','party-note',sum.missing+'명 배율 미등록 · 부분 합계'));total.append(values,node('span','party-note',p.schedule||'일정 미정'));detail.append(total);
      p.members.forEach(function(m){var row=node('div','party-member'),info=node('div'),remove=node('button','','빼기');info.append(node('strong','',m.character.name),node('p','',m.character.level?m.character.world+' · Lv.'+m.character.level+' · '+m.character.job:'캐릭터 정보 미등록'),node('p','party-rate-source',m.rateUpdatedAt?'공용 저장 배율':'이전 저장값'));
        var manage=node('a','','공용 배율 설정');manage.href='shared_boss_rates.html?'+new URLSearchParams({name:m.character.name});manage.target='_blank';manage.rel='noopener noreferrer';info.append(manage);
        remove.type='button';remove.setAttribute('aria-label',m.character.name+' 파티에서 빼기');remove.addEventListener('click',function(){p.members=p.members.filter(function(item){return item!==m;});persist();renderBoard();});row.append(portrait(m.character),info,node('output','',m.rate===null?'미등록':m.rate.toLocaleString('ko-KR',{maximumFractionDigits:2})+'%'),remove);detail.append(row);
      });
    }
    async function choose(name){
      var snap=scouter.findShared(shared,name,'00000');if(!snap){status('공용 환산 배율에서 먼저 캐릭터를 등록하세요.',true);return;}
      var version=++profileVersion;if(controller)controller.abort();controller=new AbortController();
      var publicInfo=profiles.fresh(snap.character,name);current=publicInfo?{...publicInfo,ocid:'shared:'+name}:{ocid:'shared:'+name,name:name,world:'',job:'',level:0,image:'',updatedAt:0};
      el('party-saved-character').value=name;el('party-character-name').value=name;renderPreview();renderBoard();status(name+' 공용 배율을 선택했습니다.');
      if(!publicInfo&&win.NexonKey&&win.NexonKey.has()){
        try{var info=await profileApi.load(name,controller.signal);if(version!==profileVersion)return;current={...info,ocid:'shared:'+name};parties.forEach(function(p){p.members.forEach(function(m){if(m.character.name===name)m.character={...info,ocid:m.character.ocid};});});persist();renderPreview();renderBoard();}catch(e){if(version!==profileVersion||e.name==='AbortError')return;status(name+' 배율을 선택했습니다. 캐릭터 정보는 공용 배율 관리에서 등록할 수 있습니다.');}
      }
    }
    async function syncSaved(){
      var request=++syncVersion;
      try{var response=await win.fetch('/api/boss-rates',{cache:'no-store'});if(!response.ok)throw new Error();var store=await response.json();if(request!==syncVersion)return;if(store.schemaVersion!==1||!Array.isArray(store.snapshots))throw new Error();shared=store;
        parties.forEach(function(p){p.members.forEach(function(m){var snap=snapshotFor(m.character);if(!snap)return;var info=profiles.fresh(snap.character,m.character.name);if(info)m.character={...info,ocid:m.character.ocid};applySnapshot([p],m.character.ocid,snap,true);});});
        if(current){var s=snapshotFor(current),info=s&&profiles.fresh(s.character,current.name);if(info)current={...info,ocid:current.ocid};}
        persist();renderBoard();candidates();renderBoard();
      }catch(e){if(request===syncVersion)status('공용 캐릭터 목록을 불러오지 못했습니다. 기존 파티는 유지됩니다.',true);}
    }
    async function loadMine(){
      owned.clear();if(!win.NexonKey||!win.NexonKey.has()){status('내 캐릭터 필터는 홈에서 API 키를 등록하면 사용할 수 있습니다.',true);return;}
      try{var chars=await win.NexonCharacters.fetch();chars.forEach(function(c){owned.add(c.name);});renderBoard();candidates();}catch(e){status('내 계정 확인에 실패했습니다. 공용 캐릭터 선택은 계속 사용할 수 있습니다.',true);}
    }
    var supported=new Set(win.RateCatalog.choices(win.MapleBossDB).map(function(c){return c.id;}));choices.filter(function(c){return supported.has(c.id);}).forEach(function(c){var option=node('option','',c.label+' · 최대 '+c.max+'명');option.value=c.id;el('party-boss').append(option);});
    if(el('party-boss').options)visual.picker(doc,el('party-boss'),win.MapleBossDB);
    el('party-search-form').addEventListener('submit',function(e){e.preventDefault();var name=el('party-character-name').value.trim();if(available().some(function(s){return s.characterName===name;}))choose(name);else status('선택한 보스의 공용 배율이 없는 캐릭터입니다. 공용 환산 배율에서 등록하세요.',true);});
    el('party-saved-character').addEventListener('change',function(){if(this.value)choose(this.value);else{profileVersion++;if(controller)controller.abort();current=null;renderPreview();renderBoard();}});
    el('party-reload-catalog').addEventListener('click',syncSaved);el('party-boss').addEventListener('change',function(){candidates();renderBoard();});
    el('party-view').addEventListener('change',function(){if(this.value==='mine')loadMine();renderBoard();candidates();});
    el('party-create-toggle').addEventListener('click',function(){var form=el('party-create-form');form.hidden=!form.hidden;this.setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)el('party-name').focus();candidates();renderBoard();});
    el('party-create-form').addEventListener('submit',function(e){e.preventDefault();if(parties.length>=200){status('최대 200개 파티를 저장할 수 있습니다.',true);return;}
      var bossId=el('party-boss').value,snap=current&&snapshotFor(current),p={id:win.crypto.randomUUID(),name:text(el('party-name').value,60),bossId:bossId,schedule:text(el('party-schedule').value,80),members:snap&&snap.rates.some(function(r){return r.bossId===bossId;})?[makeMember(current,bossId)]:[]};
      if(!p.name||!choices.some(function(c){return c.id===p.bossId;}))return;parties.push(p);selected=p.id;el('party-view').value='all';persist();e.target.reset();e.target.hidden=true;el('party-create-toggle').setAttribute('aria-expanded','false');renderBoard();candidates();renderBoard();
    });
    el('party-key-state').replaceChildren(node('span','','내 계정과 관계없이 공용 배율에 등록된 캐릭터를 선택합니다. '));var register=node('a','','캐릭터 등록 · 배율 설정');register.href='shared_boss_rates.html';el('party-key-state').append(register);
    win.addEventListener('nexon-key-changed',function(){profileVersion++;if(controller)controller.abort();if(current)choose(current.name);if(el('party-view').value==='mine')loadMine();});
    win.addEventListener('storage',function(e){if(e.key==='sharedBossRates.changed')syncSaved();});win.addEventListener('focus',syncSaved);if(win.setInterval)win.setInterval(function(){if(!doc.hidden)syncSaved();},30000);
    renderBoard();renderPreview();syncSaved();
  }
  return {imageUrl:imageUrl,profile:profile,summary:summary,catalog:catalog,restore:restore,client:client,scouterClient:scouterClient,applySnapshot:applySnapshot,mount:mount};
});
