(function(root,factory){
  'use strict';
  var api=factory(typeof module==='object'&&module.exports?require('./scouter_data.js'):root.ScouterData);
  if(typeof module==='object'&&module.exports) module.exports=api;
  else {root.PartyBossScheduler=api;api.mount(root);}
})(typeof window!=='undefined'?window:globalThis,function(scouter){
  'use strict';
  var STORAGE='partyBossScheduler.v1';
  var SCOPE_STORAGE='partyBossScheduler.scope.v1';
  var OWNER_STORAGE='partyBossScheduler.owner.v1';
  var RECENT_STORAGE='partyBossScheduler.recentBosses.v1';
  var COMPLETE_STORAGE='partyBossScheduler.completed.v1';
  var SORT_STORAGE='partyBossScheduler.sort.v1';
  var DAILY_BOSSES=['Akayrum','PinkBean','Cygnus'];
  var BASE='https://open.api.nexon.com/maplestory/v1';
  var SHARE_COLORS=['#75adff','#59d8ad','#ffc46b','#c39bfa','#ff849d','#efe879'];
  function text(v,n){return typeof v==='string'?v.trim().slice(0,n||100):'';}
  function normalizeSearch(value){return value.toLocaleLowerCase('ko-KR').replace(/\s+/g,'');}
  var imageUrl=scouter.imageUrl;
  function profile(raw,ocid){
    if(!raw||!text(raw.character_name,30)||!text(ocid,160))throw new Error('PROFILE_INVALID');
    return {ocid:text(ocid,160),name:text(raw.character_name,30),world:text(raw.world_name,30),job:text(raw.character_class,50),level:Math.max(0,Math.floor(Number(raw.character_level)||0)),image:imageUrl(raw.character_image),updatedAt:Date.now()};
  }
  function rate(v){if(v==null||(typeof v!=='number'&&typeof v!=='string')||typeof v==='string'&&!v.trim())return null;var n=Number(v);return Number.isFinite(n)&&n>=0&&n<=1e9?n:null;}
  function summary(members){return members.reduce(function(s,m){var n=rate(m.rate);if(n===null)s.missing++;else s.total+=n;return s;},{total:0,missing:0});}
  function clearStatus(total){
    if(total>=200)return ['overkill','완전 개팸'];
    if(total>=140)return ['easy','여유컷'];
    if(total>=100)return ['clear','클리어 가능'];
    return ['short','불가능'];
  }
  // 완료 표시는 보스 초기화 주기 안에서만 유효하다. 한국 시간 기준 일간은 매일 0시, 주간은 목요일 0시, 월간은 1일 0시에 바뀐다.
  function periodKey(bossId,now){
    var key=String(bossId||'').split('|')[0],d=new Date((now==null?Date.now():now)+9*3600e3);
    if(DAILY_BOSSES.includes(key))return 'D'+d.toISOString().slice(0,10);
    if(key==='BlackMage')return 'M'+d.toISOString().slice(0,7);
    return 'W'+new Date(d.getTime()-((d.getUTCDay()+3)%7)*864e5).toISOString().slice(0,10);
  }
  // 넥슨 스케줄러 응답에서 이번 주기에 클리어한 보스를 'Key|Difficulty' 집합으로 만든다.
  function schedulerClears(data,db){
    var labels={easy:'Easy',normal:'Normal',hard:'Hard',chaos:'Chaos',extreme:'Extreme'},names=new Map(),out=new Set();
    Object.keys(db||{}).forEach(function(k){
      if(k==='BossAliases'||!db[k]||!db[k].Name)return;
      [db[k].Name].concat(db.BossAliases&&db.BossAliases[k]||[]).forEach(function(n){names.set(normalizeSearch(String(n)),k);});
    });
    (data&&Array.isArray(data.boss_contents)?data.boss_contents:[]).forEach(function(item){
      if(!item)return;
      var flag=item.clear_flag!=null?item.clear_flag:item.complete_flag;
      if(!(flag===true||String(flag).toLowerCase()==='true'))return;
      var key=names.get(normalizeSearch(String(item.content_name||''))),diff=labels[String(item.difficulty||'').toLowerCase()];
      if(key&&diff)out.add(key+'|'+diff);
    });
    return out;
  }
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
  function mountBossPicker(win,choices,supported){
    var doc=win.document,db=win.MapleBossDB,visual=win.BossIdentity;
    var select=doc.getElementById('party-boss'),opener=doc.getElementById('party-open-boss'),dialog=doc.getElementById('party-boss-dialog');
    var search=doc.getElementById('party-boss-search'),query=doc.getElementById('party-boss-query'),results=doc.getElementById('party-boss-results'),empty=doc.getElementById('party-boss-empty');
    var recentSection=doc.getElementById('party-recent-bosses'),recentList=doc.getElementById('party-recent-list');
    var difficulty=doc.getElementById('party-boss-difficulty'),title=doc.getElementById('party-difficulty-title'),options=doc.getElementById('party-difficulty-options');
    var recent=[],available=[],bosses=new Map();
    try{var saved=JSON.parse(win.localStorage.getItem(RECENT_STORAGE)||'[]');if(Array.isArray(saved))recent=saved.slice(0,3);}catch(e){}
    function setChoices(existing){
      available=choices.filter(function(c){return supported.has(c.id)||c.id===existing;});bosses.clear();
      select.replaceChildren(new win.Option('보스 선택',''));
      available.forEach(function(c){
        var key=c.id.split('|')[0];if(!bosses.has(key))bosses.set(key,[]);bosses.get(key).push(c);
        select.append(new win.Option(c.label,c.id));
      });
      select.value=existing||'';select.dispatchEvent(new win.Event('change'));
    }
    function button(content,click){
      var item=doc.createElement('button');item.type='button';item.className='ux-button';item.append(content);item.addEventListener('click',click);return item;
    }
    function choose(id){
      select.value=id;select.dispatchEvent(new win.Event('change'));
      recent=[id].concat(recent.filter(function(previous){return previous!==id;})).slice(0,3);
      try{win.localStorage.setItem(RECENT_STORAGE,JSON.stringify(recent));}catch(e){}
      dialog.close();
    }
    function showDifficulties(key){
      search.hidden=true;results.hidden=true;empty.hidden=true;recentSection.hidden=true;difficulty.hidden=false;
      title.replaceChildren(visual.create(doc,key,db),' 난이도');options.replaceChildren();
      bosses.get(key).forEach(function(c){
        var badge=visual.create(doc,c.id,db).querySelector('.diff-badge'),name=doc.createElement('span');
        name.className='diff-option-name';name.textContent=badge?badge.textContent:c.label;
        var item=button(name,function(){choose(c.id);});item.className='diff-option '+(badge?badge.classList[1]:'');item.setAttribute('aria-pressed',String(select.value===c.id));options.append(item);
      });
      options.querySelector('button').focus();
    }
    function showBosses(){
      var term=normalizeSearch(query.value);difficulty.hidden=true;search.hidden=false;results.hidden=false;results.replaceChildren();recentList.replaceChildren();
      recent.filter(function(id){return available.some(function(c){return c.id===id;});}).forEach(function(id){
        recentList.append(button(visual.create(doc,id,db),function(){choose(id);}));
      });
      recentSection.hidden=!recentList.childElementCount;
      bosses.forEach(function(_,key){
        var names=[db[key].Name].concat(db.BossAliases?.[key]||[]);
        if(names.some(function(name){return normalizeSearch(name).includes(term);}))results.append(button(visual.create(doc,key,db),function(){showDifficulties(key);}));
      });
      empty.hidden=results.childElementCount>0;
    }
    select.addEventListener('change',function(){opener.replaceChildren(select.value?visual.create(doc,select.value,db):'보스 선택');});
    opener.addEventListener('click',function(){opener.focus();query.value='';showBosses();dialog.showModal();dialog.scrollTop=0;query.focus();});
    doc.getElementById('party-close-boss').addEventListener('click',function(){dialog.close();});
    doc.getElementById('party-boss-back').addEventListener('click',function(){showBosses();query.focus();});
    query.addEventListener('input',showBosses);
    query.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();dialog.close();}});
    dialog.addEventListener('close',function(){
      if(!doc.getElementById('party-create-form').hidden&&(doc.activeElement===doc.body||dialog.contains(doc.activeElement)))opener.focus();
    });
    return {setChoices:setChoices,close:function(){if(dialog.open)dialog.close();}};
  }
  function mount(win){
    var doc=win.document;if(!doc||!doc.getElementById('party-create-form'))return;
    var el=function(id){return doc.getElementById(id);},choices=catalog(win.MapleBossDB),parties=[],selected='',current=null,owned=new Set(),shared={snapshots:[],accounts:[]},profileVersion=0,syncVersion=0,controller=null,draftMembers=[],accounts=win.AccountCatalog;
    var profiles=win.CharacterProfile||(typeof module==='object'?require('./character_profile.js'):null),visual=win.BossIdentity||(typeof module==='object'?require('./boss_identity.js'):null);
    var profileApi=profiles.client(win.fetch.bind(win),function(){return win.NexonKey&&win.NexonKey.get();});
    var ownSyncedKey='',ownSyncPending=null;
    var editing='',editingRevision='',draftId='',portraitAttempts=new Set();
    var scope='local',remoteRows=[],remoteParties=[],remoteAvailable=false,remoteLoading=false,remoteWriting=false,remoteError='',remoteVersion=0;
    var chartCount=0,revealSelected=false,view={value:'all',label:''},filterTypes={boss:'보스',account:'계정',character:'캐릭터'};
    try{var saved=JSON.parse(win.localStorage.getItem(STORAGE)||'{}');parties=restore(saved,choices);}catch(e){}
    try{if(win.localStorage.getItem(SCOPE_STORAGE)==='shared')scope='shared';}catch(e){}
    // 다른 화면(보스 버프 동선 계산기)에서 '?scope=shared&party=ID'로 오면 그 파티를 연다. 저장된 탭 선택은 바꾸지 않는다.
    var wantedParty='';
    try{var query=new URLSearchParams(win.location&&win.location.search||'');if(['local','shared'].includes(query.get('scope')))scope=query.get('scope');wantedParty=text(query.get('party')||'',100);}catch(e){}
    var sortMode='boss';
    try{var savedSort=win.localStorage.getItem(SORT_STORAGE);if(savedSort&&Array.from(el('party-sort').options).some(function(o){return o.value===savedSort;}))sortMode=savedSort;}catch(e){}
    el('party-sort').value=sortMode;
    // 직접 표시한 완료는 파티 ID별로 주기 키를 저장하고, 스케줄러 완료는 내 캐릭터 이름별로 메모리에만 둔다.
    var manualDone={},apiClears=new Map(),clearsFetchedAt=new Map(),clearsKey='',clearsPending=null,mineCache=null;
    try{var savedDone=JSON.parse(win.localStorage.getItem(COMPLETE_STORAGE)||'{}');if(savedDone&&typeof savedDone==='object')manualDone=savedDone;}catch(e){}
    function completion(p){
      if(p.members.some(function(m){var set=apiClears.get(m.character.name);return set&&periodKey(p.bossId,set.at)===periodKey(p.bossId)&&set.has(p.bossId);}))return 'api';
      return manualDone[p.id]===periodKey(p.bossId)?'manual':'';
    }
    function setManualDone(p,done){
      var next={};
      Object.keys(manualDone).forEach(function(id){var party=parties.concat(remoteParties).find(function(item){return item.id===id;});if(party&&manualDone[id]===periodKey(party.bossId))next[id]=manualDone[id];});
      if(done)next[p.id]=periodKey(p.bossId);else delete next[p.id];
      try{win.localStorage.setItem(COMPLETE_STORAGE,JSON.stringify(next));}catch(e){storageStatus('완료 표시를 브라우저에 저장하지 못했습니다.',true);return false;}
      manualDone=next;return true;
    }
    async function loadClears(force){
      var key=win.NexonKey&&win.NexonKey.get();
      if(!key||!win.NexonCharacters){apiClears.clear();clearsFetchedAt.clear();return;}
      if(clearsKey!==key){clearsKey=key;apiClears.clear();clearsFetchedAt.clear();mineCache=null;}
      if(clearsPending)return clearsPending;
      clearsPending=(async function(){
        if(force||!mineCache||Date.now()-mineCache.at>5*60e3){var rows=await win.NexonCharacters.fetch();if(key!==win.NexonKey.get())return;mineCache={at:Date.now(),rows:rows};}
        var mine=mineCache.rows;
        var names=new Set(parties.concat(remoteParties).flatMap(function(p){return p.members.map(function(m){return m.character.name;});}));
        var changed=false;
        for(var c of mine){
          owned.add(c.name);
          if(!names.has(c.name)||!c.ocid)continue;
          var last=clearsFetchedAt.get(c.name)||0;if(!force&&Date.now()-last<5*60e3)continue;
          try{
            var res=await win.fetch(BASE+'/scheduler/character-state?'+new URLSearchParams({ocid:c.ocid}),{headers:{'x-nxopen-api-key':key},cache:'no-store'});
            if(key!==win.NexonKey.get())return;
            if(!res.ok){clearsFetchedAt.set(c.name,Date.now());continue;}
            var set=schedulerClears(await res.json(),win.MapleBossDB),stamp=Date.now();
            // 주기 키는 보스마다 다르므로 조회 시각을 남겨 두고 completion에서 해당 보스의 현재 주기와 비교한다.
            set.at=stamp;apiClears.set(c.name,set);clearsFetchedAt.set(c.name,stamp);changed=true;
          }catch(e){clearsFetchedAt.set(c.name,Date.now());}
        }
        if(changed)renderBoard();
      })().catch(function(){}).finally(function(){clearsPending=null;});
      return clearsPending;
    }
    function node(tag,cls,label){var n=doc.createElement(tag);if(cls)n.className=cls;if(label!=null)n.textContent=label;return n;}
    function status(message,error){el('party-search-status').textContent=message||'';el('party-search-status').classList.toggle('error',!!error);}
    function persist(nextParties=parties){
      try{
        win.localStorage.setItem(STORAGE,JSON.stringify({parties:nextParties}));
        if(scope==='local'&&el('party-storage-status').classList.contains('error'))storageStatus('');
        return true;
      }catch(e){
        if(scope==='local')storageStatus('브라우저에 저장하지 못했습니다.',true);
        return false;
      }
    }
    function activeParties(){return scope==='shared'?remoteParties:parties;}
    function ownerToken(create){
      var token=win.localStorage.getItem(OWNER_STORAGE);
      if(!token&&create){token=win.crypto.randomUUID();win.localStorage.setItem(OWNER_STORAGE,token);}
      return token||'';
    }
    function updateScopeUI(){
      ['local','shared'].forEach(function(value){
        var tab=el('party-scope-'+value),active=value===scope;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;tab.disabled=remoteWriting;
      });
      el('party-scope-panel').setAttribute('aria-labelledby','party-scope-'+scope);
      var sharedScope=scope==='shared',note=el('party-scope-note'),refresh=el('party-refresh-shared');
      note.textContent=sharedScope?(remoteLoading?'공유 파티 불러오는 중…':remoteError||'누구나 보고 수정할 수 있습니다.'):'이 브라우저에서만 볼 수 있습니다.';
      note.classList.toggle('error',sharedScope&&!!remoteError&&!remoteLoading);
      refresh.hidden=!sharedScope;refresh.disabled=remoteLoading||remoteWriting;
      el('party-create-toggle').disabled=remoteWriting||(sharedScope&&!remoteAvailable);
      el('party-create-cancel').disabled=remoteWriting;el('party-save').disabled=remoteWriting||(sharedScope&&!remoteAvailable);
      el('party-create-form').inert=remoteWriting;
      ['party-view-all','party-view-mine','party-open-filter','party-clear-filter','party-list-search','party-sort'].forEach(function(id){el(id).disabled=remoteWriting;});
      el('party-save').textContent=remoteWriting?'저장 중…':sharedScope?'공유 파티 저장':'파티 저장';
      el('party-draft-scope').textContent=sharedScope?'저장하면 누구나 보고 수정할 수 있습니다.':'이 브라우저에 저장';
    }
    function hydrateRemote(){
      remoteParties=remoteRows.filter(function(row){return choices.some(function(c){return c.id===row.bossId;});}).map(function(row){
        var previous=remoteParties.find(function(p){return p.id===row.id;});
        return {...row,members:row.members.map(function(name){
          var member=publicMember(name,row.bossId),old=previous?.members.find(function(m){return m.character.name===name;});
          if(old)member.character=mergeProfile(old.character,member.character);
          return member;
        })};
      });
    }
    async function loadRemote(){
      if(remoteWriting)return;
      var request=++remoteVersion;remoteLoading=true;updateScopeUI();
      try{
        var token='';try{token=ownerToken(false);}catch(e){}
        var response=await win.fetch('/api/boss-parties',{cache:'no-store',headers:token?{'x-party-owner':token}:{}});
        if(!response.ok)throw new Error();
        var data=await response.json();if(request!==remoteVersion)return;
        if(!Array.isArray(data.parties)||!data.parties.every(function(p){return p&&typeof p.id==='string'&&Array.isArray(p.members)&&p.members.every(scouter.validName);}))throw new Error();
        remoteRows=data.parties;remoteAvailable=data.persistent===true;
        remoteError=remoteAvailable?'':'공유 저장소를 사용할 수 없습니다.';
        hydrateRemote();
      }catch(e){if(request===remoteVersion)remoteError='공유 파티를 불러오지 못했습니다. 목록을 새로고침하세요.';}
      finally{if(request===remoteVersion){remoteLoading=false;updateScopeUI();if(scope==='shared')refreshBoard();}}
    }
    async function writeRemote(action,p,revision,notify){
      if(remoteWriting)return null;
      ++remoteVersion;remoteLoading=false;remoteWriting=true;updateScopeUI();
      try{
        var token;
        try{token=ownerToken(true);}catch(e){throw new Error('PARTY_OWNER_STORAGE');}
        var payload=action==='delete'?{id:p.id}:{id:p.id,name:p.name,bossId:p.bossId,members:p.members.map(function(m){return m.character.name;})};
        var response=await win.fetch('/api/boss-parties',{method:'POST',headers:{'Content-Type':'application/json','x-party-owner':token},body:JSON.stringify({action:action,party:payload,revision:revision||''})});
        var data=await response.json();if(!response.ok)throw new Error(data.error?.code);
        if(action==='save'){
          var index=remoteRows.findIndex(function(row){return row.id===p.id;});
          if(index<0)remoteRows.push(data.party);else remoteRows[index]=data.party;
        }else remoteRows=remoteRows.filter(function(row){return row.id!==p.id;});
        hydrateRemote();return action==='save'?remoteParties.find(function(row){return row.id===p.id;}):true;
      }catch(e){
        var errors={PARTY_CONFLICT:'다른 화면에서 먼저 수정했습니다. 편집을 닫고 공유 목록을 새로고침한 뒤 다시 시도하세요.',PARTY_FORBIDDEN:'공유 저장소가 요청을 거부했습니다. 새로고침한 뒤 다시 시도하세요.',PARTY_ACCOUNT_CONFLICT:'같은 계정의 캐릭터가 있습니다. 공용 계정 목록을 확인하세요.',PARTY_MEMBER_NOT_REGISTERED:'공용 배율에 등록되지 않은 파티원이 있습니다.',PARTY_LIMIT:'공유 파티 저장 한도에 도달했습니다.',PARTY_OWNER_STORAGE:'수정 권한을 브라우저에 저장할 수 없습니다.'};
        notify(errors[e.message]||'공유 저장소에 반영하지 못했습니다. 입력값을 확인하고 다시 시도하세요.',true);return null;
      }finally{remoteWriting=false;updateScopeUI();}
    }
    function snapshotFor(c){return scouter.findShared(shared,c.name,'00000');}
    function publicInfo(name){for(var a of accounts.groups(shared)){var c=a.characters.find(function(c){return c.name===name;});if(c)return c.profile;}return null;}
    function mergeProfile(character,info){var merged=scouter.mergeCharacter(character,info);return merged?{...merged,ocid:character.ocid}:character;}
    function rememberPortrait(info){
      parties.concat(remoteParties).forEach(function(p){p.members.forEach(function(m){if(m.character.name===info.name)m.character=mergeProfile(m.character,info);});});
      draftMembers.forEach(function(m){if(m.character.name===info.name)m.character=mergeProfile(m.character,info);});
      if(current&&current.name===info.name)current=mergeProfile(current,info);
      persist();renderPreview();renderDraft();renderBoard();
    }
    function repairPortraits(p){
      var key=win.NexonKey&&win.NexonKey.get();if(!key||!p)return;
      p.members.forEach(function(m){
        var c=m.character;
        if(profiles.fresh(c,c.name)?.image||portraitAttempts.has(c.name))return;
        portraitAttempts.add(c.name);
        var abort=new AbortController(),timer=setTimeout(function(){abort.abort();},10000);
        profileApi.load(c.name,abort.signal).then(function(info){
          if(info.image&&key===win.NexonKey.get())rememberPortrait(info);
        }).catch(function(){}).finally(function(){clearTimeout(timer);});
      });
    }
    function accountName(name){var id=accounts.accountId(shared,name),g=accounts.groups(shared).find(function(g){return g.id===id;});return g?g.label:'미분류';}
    function publicMember(name,bossId){var p=publicInfo(name),c=p?{...p,ocid:'shared:'+name}:{ocid:'shared:'+name,name:name,world:'',job:'',level:0,image:'',updatedAt:0};return makeMember(c,bossId);}
    function fillAccounts(id){var select=el(id),value=select.value;select.replaceChildren();var first=node('option','','전체 계정');first.value='';select.append(first);accounts.groups(shared).forEach(function(g){var o=node('option','',g.label);o.value=g.id||'__unassigned__';select.append(o);});select.value=Array.from(select.options).some(function(o){return o.value===value;})?value:'';}
    function fillCharacters(id,accountId,bossId,value){
      var select=el(id);
      select.replaceChildren();
      var placeholder=node('option','','캐릭터 선택');
      placeholder.value='';
      select.append(placeholder);
      for(var account of accounts.groups(shared)){
        if(accountId&&(account.id||'__unassigned__')!==accountId)continue;
        var registered=account.characters.filter(function(character){return character.snapshot;});
        if(!registered.length)continue;
        var group=node('optgroup');
        group.label=account.label;
        for(var character of registered){
          var snapshot=scouter.findShared(shared,character.name,'00000');
          var bossRate=snapshot&&snapshot.rates.find(function(rate){return rate.bossId===bossId;});
          var facts=[];
          if(character.profile)facts.push('Lv. '+character.profile.level);
          if(bossId)facts.push(bossRate?bossRate.percent+'%':'배율 미등록');
          var label=character.name+(facts.length?' ('+facts.join(', ')+')':'');
          var option=node('option','',label);
          option.value=character.name;
          option.disabled=!snapshot||Boolean(bossId&&!bossRate);
          group.append(option);
        }
        select.append(group);
      }
      select.disabled=select.options.length===1;
      if(select.disabled)placeholder.textContent='등록된 캐릭터 없음';
      select.value=Array.from(select.options).some(function(option){return option.value===value&&!option.disabled;})?value:'';
    }
    function makeMember(c,bossId){var snap=snapshotFor(c),r=snap&&snap.rates.find(function(row){return row.bossId===bossId;});return {character:{...c},rate:r?r.percent:null,rateMode:'auto',rateUpdatedAt:snap?snap.fetchedAt:''};}
    function targetBoss(){return activeParties().find(function(p){return p.id===selected;})?.bossId||'';}
    function candidates(){
      fillAccounts('party-account');fillCharacters('party-saved-character',el('party-account').value,targetBoss(),current?current.name:'');
      if(current&&el('party-saved-character').value!==current.name){current=null;profileVersion++;if(controller)controller.abort();}renderPreview();renderDraft();
    }
    function renderDraft(){
      if(el('party-create-form').hidden)return;
      var bossId=el('party-boss').value,boss=choices.find(function(c){return c.id===bossId;});
      if(!boss){el('party-draft-summary').replaceChildren();el('party-draft-members').replaceChildren();el('party-draft-account').disabled=true;el('party-draft-character').disabled=true;el('party-draft-add').disabled=true;return;}
      el('party-draft-account').disabled=false;
      fillAccounts('party-draft-account');fillCharacters('party-draft-character',el('party-draft-account').value,bossId,el('party-draft-character').value);
      var host=el('party-draft-members'),members=draftRoster(bossId);host.replaceChildren();
      el('party-draft-summary').replaceChildren(partySummary(members,boss));
      host.append(...memberCards(members,damageShares(members),function(m,index){draftMembers.splice(index,1);draftStatus('');renderDraft();}));
      el('party-draft-add').disabled=!el('party-draft-character').value;
    }
    function draftRoster(bossId){
      var original=activeParties().find(function(p){return p.id===editing&&p.bossId===bossId;});
      return draftMembers.map(function(m){
        var c=mergeProfile(m.character,publicInfo(m.character.name));
        var previous=original?.members.find(function(member){return member.character.ocid===c.ocid;});
        return previous&&!snapshotFor(c)?{...previous,character:c}:makeMember(c,bossId);
      });
    }
    function portrait(c){
      var image=profiles.fresh(c,c.name)?.image;
      var box=node('div','party-portrait'),fallback=node('span','',image?'이미지 로딩 중':'외형 미등록');box.append(fallback);
      if(image){var img=node('img');img.alt=c.name+' 캐릭터 외형';img.referrerPolicy='no-referrer';img.addEventListener('load',function(){fallback.hidden=true;});img.addEventListener('error',function(){img.hidden=true;fallback.hidden=false;fallback.textContent='외형 로드 실패';});img.src=image;box.append(img);}return box;
    }
    function renderPreview(){
      var host=el('party-character-preview');host.replaceChildren();host.hidden=!current;if(!current)return;
      host.append(memberCard(makeMember(current,targetBoss())));
    }
    function percentLabel(value){return value.toLocaleString('ko-KR',{maximumFractionDigits:2})+'%';}
    function metric(label,value,badge){
      var box=node('span','party-metric'),amount=node('strong','party-metric-value',value);
      box.append(node('span','party-metric-label',label));
      if(badge){var line=node('span','party-metric-line');line.append(amount,badge);box.append(line);}else box.append(amount);
      return box;
    }
    // 파티원 순서는 본캐 먼저, 그다음 환산 배율(예상 딜 비중)이 높은 순이다. 첫 번째가 대표 캐릭터다.
    function orderedMembers(members,mains){
      var byName=new Map(members.map(function(m){return [m.character.name,m];}));
      return accounts.partyOrder(members.map(function(m){return {name:m.character.name,rate:rate(m.rate)};}),mains).map(function(m){return byName.get(m.name);});
    }
    function doneBadge(){return node('span','party-done-badge','✓ 완료');}
    function mesoLabel(value){
      var eok=Math.floor(value/1e8),man=Math.floor(value%1e8/1e4),rest=value%1e4;
      var parts=[eok?eok.toLocaleString('ko-KR')+'억':'',man?man.toLocaleString('ko-KR')+'만':'',rest?rest.toLocaleString('ko-KR'):''];
      return (parts.filter(Boolean).join(' ')||'0')+' 메소';
    }
    // 왼쪽 카드는 파티 전투력(환산 합계와 예상 딜 비중), 오른쪽 카드는 받는 보상(결정석과 아이템)을 보여준다.
    function partyOverview(members,boss){
      var sum=summary(members),known=members.length>sum.missing,shares=damageShares(members);
      var box=node('section','party-totals'),head=node('div','party-overview-head');
      var verdict=sum.missing?['pending','판정 대기']:members.length?clearStatus(Math.round(sum.total*100)/100):null;
      head.append(metric('환산 합계',known?percentLabel(sum.total):'—',verdict?node('span','party-verdict '+verdict[0],verdict[1]):null));
      head.append(node('span','party-member-count',members.length+' / '+boss.max+'명'));
      box.append(head);
      if(shares)box.append(damageChart(members,shares));
      else if(sum.missing)box.append(node('p','party-note',sum.missing+'명 미등록. 모든 파티원의 배율이 있어야 예상 딜 비중을 계산합니다.'));
      return box;
    }
    function partySummary(members,boss){
      var [key,difficulty]=boss.id.split('|'),price=Number(win.MapleBossDB[key][difficulty].CrystalPrice),count=members.length;
      var layout=node('div','party-summary-grid'),reward=node('section','party-reward');
      var icon=node('img');
      icon.src=DAILY_BOSSES.includes(key)?'icons/home/강렬한힘의결정.webp':'icons/home/boss-crystal-'+(key==='BlackMage'?'monthly':'weekly')+'.png';
      icon.alt='';
      // 1인당 금액 바로 오른쪽에 전체 금액을 두어 분배 기준을 한 줄에서 읽게 한다.
      var crystal=node('div','party-crystal');crystal.append(icon,metric(count?'1인당 결정석':'결정석 기본가',mesoLabel(Math.floor(price/Math.max(1,count)))));
      if(count>1)crystal.append(metric('전체 ('+count+'인 균등 분배)',mesoLabel(price)));
      reward.append(node('h4','','보스 보상'),crystal);
      if(!count)reward.append(node('p','party-note','파티원을 추가하면 1인당 금액을 표시합니다.'));
      var items=win.BossRewards.forBoss(boss.id);
      if(items.length){
        var list=node('ul','party-reward-items');list.setAttribute('aria-label',boss.label+' 주요 보상 아이템');
        items.forEach(function(item){
          var entry=node('li'),tile=node('span','party-reward-item'),picture=node('span','party-reward-icon');
          tile.tabIndex=0;tile.dataset.tooltip=item.name;
          picture.style.backgroundImage='url('+item.image+')';picture.style.backgroundPosition=(-item.x)+'px '+(-item.y)+'px';
          picture.setAttribute('role','img');picture.setAttribute('aria-label',item.name);tile.append(picture);
          // 수량은 아이콘 아래에 두어 옆 아이콘의 수량으로 읽히지 않게 한다.
          if(item.quantity!==undefined){
            var amount=item.quantity.toLocaleString('ko-KR'),badge=node('strong','party-reward-quantity',amount);
            badge.setAttribute('aria-label',amount+' '+item.unit);tile.dataset.tooltipValue=amount+' '+item.unit;tile.append(badge);
          }
          entry.append(tile);list.append(entry);
        });
        reward.append(list);
      }else reward.append(node('p','party-note','이 난이도의 아이템 보상 정보가 없습니다.'));
      var guide=node('a','','공식 보상 안내');guide.href=win.BossRewards.guide;guide.target='_blank';guide.rel='noopener';
      var note=node('p','party-note');note.append(guide);reward.append(note);
      layout.append(partyOverview(members,boss),reward);return layout;
    }
    function damageShares(members){
      var sum=summary(members);
      return sum.missing||sum.total<=0?null:members.map(function(m){return rate(m.rate)/sum.total*100;});
    }
    function damageChart(members,shares){
      var section=node('section','party-share-chart'),title=node('h4','','예상 딜 비중');
      title.id='party-share-title-'+(++chartCount);section.setAttribute('aria-labelledby',title.id);section.append(title);
      var bar=node('div','party-share-bar'),legend=node('ul','party-share-legend');
      bar.setAttribute('aria-hidden','true');
      members.forEach(function(m,index){
        var share=shares[index],color=SHARE_COLORS[index%SHARE_COLORS.length];
        var segment=node('span','party-share-segment'),entry=node('li'),marker=node('span','party-share-marker');
        segment.style.width=share+'%';segment.style.backgroundColor=color;
        marker.style.backgroundColor=color;marker.setAttribute('aria-hidden','true');
        entry.append(marker,node('span','party-share-name',m.character.name),node('strong','party-share-value',percentLabel(share)));
        bar.append(segment);legend.append(entry);
      });
      section.append(bar,legend);return section;
    }
    function memberCards(members,shares,onRemove,highlight){
      return members.map(function(m,index){
        var share=shares?percentLabel(shares[index]):'—';
        return memberCard(m,share,onRemove?function(){onRemove(m,index);}:null,highlight?highlight(m):'');
      });
    }
    function memberCard(m,share,onRemove,highlight){
      var c=m.character,row=node('div','party-member'),info=profiles.renderInfo(doc,c,c.name),metrics=node('div','party-member-metrics');
      info.append(node('p','party-account-label',accountName(c.name)));
      if(highlight){row.classList.add('party-member-highlighted');info.append(node('span','party-member-match',highlight));}
      metrics.append(metric('환산 배율',m.rate===null?'미등록':percentLabel(m.rate)));
      if(share!==undefined)metrics.append(metric('예상 딜 비중',share));
      row.append(portrait(c),info,metrics);
      if(onRemove){
        var remove=node('button','party-remove','빼기');remove.type='button';remove.setAttribute('aria-label',c.name+' 파티에서 빼기');
        remove.addEventListener('click',onRemove);row.append(remove);
      }
      return row;
    }
    function matchingMember(filter,name){
      if(filter==='mine')return owned.has(name);
      if(filter.startsWith('character:'))return filter==='character:'+name;
      if(!filter.startsWith('account:'))return false;
      var id=accounts.accountId(shared,name);
      return filter==='account:'+id||filter==='account:'&&id==='character:'+name;
    }
    function filtered(){
      var filter=view.value,items=activeParties();
      if(filter==='all')return items;
      if(filter.startsWith('boss:'))return items.filter(function(p){return p.bossId.split('|')[0]===filter.slice(5);});
      return items.filter(function(p){return p.members.some(function(m){return matchingMember(filter,m.character.name);});});
    }
    // 목록 검색은 보스 이름과 별칭, 파티 이름, 파티원 닉네임, 계정 이름에서 찾는다.
    function searchText(p){
      var db=win.MapleBossDB,key=p.bossId.split('|')[0],boss=choices.find(function(c){return c.id===p.bossId;});
      return normalizeSearch([boss?boss.label:'',db[key]?.Name||'',p.name].concat(db.BossAliases?.[key]||[],p.members.flatMap(function(m){return [m.character.name,accountName(m.character.name)];})).join(' '));
    }
    function sortParties(items){
      var order=new Map(choices.map(function(c,i){return [c.id,i];})),created=new Map(activeParties().map(function(p,i){return [p.id,i];}));
      var byBoss=function(a,b){return (order.get(a.bossId)??999)-(order.get(b.bossId)??999)||a.name.localeCompare(b.name,'ko-KR');};
      var total=function(p){var s=summary(p.members);return s.missing||!p.members.length?null:s.total;};
      var byTotal=function(dir){return function(a,b){var x=total(a),y=total(b);if(x===null||y===null)return (x===null)-(y===null)||byBoss(a,b);return (x-y)*dir||byBoss(a,b);};};
      var compare={
        boss:byBoss,
        remaining:function(a,b){return !!completion(a)-!!completion(b)||byBoss(a,b);},
        'total-desc':byTotal(-1),'total-asc':byTotal(1),
        recent:function(a,b){return created.get(b.id)-created.get(a.id);}
      }[sortMode]||byBoss;
      return items.slice().sort(compare);
    }
    function visible(){
      var term=normalizeSearch(el('party-list-search').value||'');
      var items=filtered();if(term)items=items.filter(function(p){return searchText(p).includes(term);});
      return sortParties(items);
    }
    function setView(value,label){
      if(remoteWriting)return;
      view={value:value,label:label||''};filterStatus('');
      if(value==='mine')loadMine();
      refreshBoard();
    }
    function renderView(count){
      ['all','mine'].forEach(function(id){el('party-view-'+id).setAttribute('aria-pressed',String(view.value===id));});
      var kind=filterTypes[view.value.split(':')[0]],clear=el('party-clear-filter');
      clear.hidden=!kind;
      el('party-active-filter').textContent=kind?kind+' · '+view.label:'';
      clear.setAttribute('aria-label',kind?kind+' '+view.label+' 필터 해제':'필터 해제');
      var term=el('party-list-search').value.trim(),total=filtered().length;
      el('party-view-count').textContent=term&&count!==total?'파티 '+total+'개 중 '+count+'개':'파티 '+count+'개';
    }
    function renderFilterOptions(){
      var db=win.MapleBossDB,items=activeParties(),host=el('party-filter-results'),term=normalizeSearch(el('party-filter-query').value);
      var bossIds=new Set(items.map(function(p){return p.bossId.split('|')[0];}));
      var names=new Set(items.flatMap(function(p){return p.members.map(function(m){return m.character.name;});}));
      var options={
        boss:Array.from(bossIds,function(id){return {id:id,label:db[id].Name,aliases:db.BossAliases?.[id]||[]};}),
        account:accounts.groups(shared),
        character:Array.from(names,function(name){return {id:name,label:name};})
      };
      host.replaceChildren();
      Object.entries(options).forEach(function([kind,entries]){
        var matches=entries.filter(function(entry){return [entry.label].concat(entry.aliases||[]).some(function(name){return normalizeSearch(name).includes(term);});});
        if(!matches.length)return;
        matches.sort(function(a,b){return a.label.localeCompare(b.label,'ko-KR');});
        var section=node('section'),list=node('div','party-boss-grid');
        section.append(node('h3','',filterTypes[kind]),list);
        matches.forEach(function(entry){
          var key=kind+':'+entry.id,button=node('button','ux-button');button.type='button';
          button.setAttribute('aria-pressed',String(view.value===key));
          button.setAttribute('aria-label',filterTypes[kind]+' '+entry.label);
          button.append(kind==='boss'?visual.create(doc,entry.id,db):node('span','',entry.label));
          if(kind==='account')button.append(node('span','party-note','소속 '+entry.characters.length+'명'));
          button.addEventListener('click',function(){setView(key,entry.label);el('party-filter-dialog').close();});
          list.append(button);
        });
        host.append(section);
      });
      el('party-filter-empty').hidden=host.childElementCount>0;
    }
    function storageStatus(message,error){var note=el('party-storage-status');note.textContent=message;note.classList.toggle('error',!!error);}
    function filterStatus(message,error){var note=el('party-filter-status');note.textContent=message;note.classList.toggle('error',!!error);}
    function draftStatus(message,error){var note=el('party-draft-status');note.textContent=message;note.classList.toggle('error',!!error);}
    function closeEditor(){
      editing='';editingRevision='';draftId='';draftMembers=[];el('party-create-form').hidden=true;el('party-draft-summary').replaceChildren();el('party-draft-members').replaceChildren();bossPicker.close();
      el('party-create-toggle').setAttribute('aria-expanded','false');
    }
    function openEditor(p,copy){
      var form=el('party-create-form');form.reset();bossPicker.close();
      editing=p&&!copy?p.id:'';editingRevision=editing?p.revision||'':'';draftId='';draftMembers=p?p.members.map(function(m){return {...m};}):[];
      if(p){
        var choice=choices.find(function(c){return c.id===p.bossId;});
        el('party-name').value=p.name===choice.label?'':p.name;
      }
      bossPicker.setChoices(p?.bossId);
      el('party-form-title').textContent=copy?'공유 파티로 복사':p?'파티 수정':'새 파티';
      el('party-create-toggle').setAttribute('aria-expanded',String(!editing));
      draftStatus('');form.hidden=false;candidates();renderBoard();
      (p?el('party-name'):el('party-open-boss')).focus();
    }
    async function switchScope(next,copy){
      if(remoteWriting||next===scope)return;
      if(!el('party-create-form').hidden){
        var before=scope,title='저장 위치를 바꿀까요?';
        if(!(win.SiteUX?await win.SiteUX.confirm(title,'작성 중인 파티는 저장되지 않습니다.','위치 변경'):win.confirm(title))||scope!==before||remoteWriting)return;
      }
      closeEditor();scope=next;selected='';storageStatus('');status('');
      try{win.localStorage.setItem(SCOPE_STORAGE,scope);}catch(e){}
      updateScopeUI();refreshBoard();
      if(copy)openEditor(copy,true);else el('party-scope-'+scope).focus();
      if(scope==='shared')loadRemote();
    }
    async function updateMembers(p,members){
      if(scope==='shared'){
        if(!p.canEdit||!await writeRemote('save',{...p,members:members},p.revision,storageStatus))return false;
        refreshBoard();return true;
      }
      var next=parties.map(function(item){return item===p?{...p,members:members}:item;});
      if(!persist(next))return false;
      parties=next;refreshBoard();return true;
    }
    function selectVisible(shown){
      if(wantedParty){
        if(shown.some(function(p){return p.id===wantedParty;})){selected=wantedParty;wantedParty='';revealSelected=true;}
        else if(scope==='local'||remoteAvailable||remoteError){
          // 목록을 다 불러왔는데도 없으면 지워졌거나 다른 브라우저의 로컬 파티다.
          if(!activeParties().some(function(p){return p.id===wantedParty;})){wantedParty='';storageStatus('주의: 찾는 파티가 없습니다. 삭제되었거나 다른 브라우저에만 저장된 파티입니다.');}
        }
      }
      if(!shown.some(function(p){return p.id===selected;}))selected=shown[0]?.id||'';
    }
    function refreshBoard(){var shown=visible();selectVisible(shown);candidates();renderBoard(shown);}
    function renderBoard(shown=visible()){
      var list=el('party-list'),headingHost=el('party-detail-heading'),detail=el('party-detail-content'),formOpen=!el('party-create-form').hidden;
      renderView(shown.length);
      list.replaceChildren();headingHost.replaceChildren();detail.replaceChildren();selectVisible(shown);
      var mains=accounts.mainNames(shared);
      shown.forEach(function(p){
        var button=node('button'),boss=choices.find(function(c){return c.id===p.bossId;});
        button.type='button';button.disabled=formOpen||remoteWriting;button.setAttribute('aria-pressed',String(p.id===selected));
        // 목록은 파티를 고르기 위한 요약이라 보스, 난이도, 이름, 인원, 완료만 둔다. 환산 합계와 판정은 오른쪽 상세에서 보여준다.
        var done=completion(p),sum=summary(p.members),meta=node('span','party-row-meta');
        if(done)button.classList.add('party-list-done');
        // 같은 보스 파티가 여러 개면 보스 이름으로는 구분이 안 되므로, 보스는 아이콘과 난이도로만 보여주고
        // 제목에는 직접 지은 파티 이름을 쓰고, 없으면 파티원 이름으로 자동 이름을 만든다.
        // 자동 이름: 1명은 이름 전체, 2명은 3글자씩, 3명은 2글자씩, 4명 이상은 1글자씩을 쉼표로 잇는다. 순서는 본캐 먼저, 그다음 딜 비중 순.
        // 목록 폭이 좁아 잘릴 수 있으므로, 마우스를 올리면 전체 이름과 파티원을 툴팁으로 보여준다.
        var ordered=orderedMembers(p.members,mains),lead=ordered[0]||null;
        var custom=p.name!==boss.label,identity=visual.create(doc,p.bossId,win.MapleBossDB);
        identity.querySelector('span:not(.diff-badge)')?.classList.add('sr-only');
        var title=node('span','party-row-title',custom?p.name:ordered.length>1?null:lead?lead.character.name:'파티원 없음');
        if(!custom&&ordered.length>1){
          // 줄인 이름 대신 화면 읽기용으로는 전체 파티원 이름을 읽는다.
          var short=node('span','',accounts.partyTitle(ordered.map(function(m){return {name:m.character.name};})));
          short.setAttribute('aria-hidden','true');
          title.append(short,node('span','sr-only',ordered.map(function(m){return m.character.name;}).join(', ')));
        }
        if(ordered.length){
          var fullNames=ordered.map(function(m){return m.character.name;}).join(', ');
          title.dataset.tooltip=custom?p.name:fullNames;
          if(custom)title.dataset.tooltipNote=fullNames;
        }
        identity.append(title);
        // 한 줄에 들어가도록 대표 캐릭터와 미등록 인원은 화면 읽기용으로만 두고, 상세에서 보여준다.
        if(custom&&lead)title.append(node('span','sr-only',', 대표 '+lead.character.name));
        if(sum.missing)title.append(node('span','sr-only',', '+sum.missing+'명 미등록'));
        // 완료 표시는 인원 왼쪽에 두어, 완료 여부와 관계없이 인원이 항상 오른쪽 끝 같은 자리에 오게 한다.
        if(done)meta.append(doneBadge());
        meta.append(node('span','party-member-count',p.members.length+'/'+boss.max+'명'));
        button.append(identity,meta);
        button.addEventListener('click',function(){
          if(remoteWriting||!el('party-create-form').hidden)return;
          if(p.id!==selected){status('');if(editing)closeEditor();}
          selected=p.id;candidates();renderBoard();repairPortraits(p);
        });list.append(button);
      });
      var p=activeParties().find(function(item){return item.id===selected;}),editable=scope==='local'||p?.canEdit;
      if(revealSelected){
        // 링크로 연 파티는 목록에서 보이게 하고 상세로 화면을 옮긴다.
        revealSelected=false;
        var openedRow=list.querySelector('[aria-pressed="true"]');
        if(openedRow&&openedRow.scrollIntoView){openedRow.scrollIntoView({block:'nearest'});el('party-detail').scrollIntoView({block:'start'});}
        if(p)repairPortraits(p);
      }
      el('party-detail').hidden=formOpen;el('party-add-panel').hidden=!p||formOpen||!editable;var add=el('party-add-current');add.disabled=true;
      if(!p){
        var filter=view.value;
        var message=scope==='shared'&&!remoteAvailable?(remoteError||'공유 파티를 불러오는 중입니다.'):el('party-list-search').value.trim()&&filtered().length?'검색어에 맞는 파티가 없습니다. 다른 이름으로 찾아보세요.':filter==='mine'?'내 캐릭터 파티가 없습니다.':filter!=='all'?'선택한 조건에 맞는 파티가 없습니다.':scope==='shared'?'아직 공유된 파티가 없습니다.':'새 파티를 만들어보세요.';
        detail.append(node('p','party-empty',message));return;
      }
      if(formOpen)return;
      var boss=choices.find(function(c){return c.id===p.bossId;});add.disabled=!editable||remoteWriting||!current||!snapshotFor(current)||!snapshotFor(current).rates.some(function(r){return r.bossId===p.bossId;});
      add.onclick=async function(){if(!editable||remoteWriting||!current)return;if(accounts.conflict(shared,p.members,current.name)){status('같은 계정은 한 명만 배치할 수 있습니다.',true);return;}if(p.members.length>=boss.max){status('최대 '+boss.max+'명입니다.',true);return;}var name=current.name;if(await updateMembers(p,p.members.concat(makeMember(current,p.bossId))))status(name+' 추가됨');};
      var header=node('div','party-detail-head');
      var title=node('h3');
      title.append(visual.create(doc,p.bossId,win.MapleBossDB));
      if(p.name!==boss.label)title.append(node('span','party-detail-name',p.name));
      var done=completion(p);if(done)title.append(doneBadge());
      var actions=node('div','party-detail-actions'),editButton=node('button','party-edit','수정');
      var doneButton=node('button','ux-button ux-choice ux-complete-toggle party-complete',done?'완료':'미완료');
      doneButton.type='button';doneButton.setAttribute('aria-pressed',String(!!done));
      doneButton.setAttribute('aria-label',p.name+' 완료 상태');
      doneButton.disabled=done==='api'||remoteWriting;
      doneButton.addEventListener('click',function(){
        var next=!completion(p);if(!setManualDone(p,next))return;
        renderBoard();storageStatus(next?'완료 표시를 이 브라우저에 저장했습니다.':'완료 표시를 해제했습니다.');
        doc.querySelector('.party-complete')?.focus();
      });
      actions.append(doneButton);
      editButton.type='button';
      editButton.setAttribute('aria-controls','party-create-form');
      editButton.addEventListener('click',function(){if(!remoteWriting)openEditor(p);});
      var deleteButton=node('button','party-delete','파티 삭제');
      deleteButton.type='button';
      deleteButton.addEventListener('click',async function(){
        var previousScope=scope;
        var title='“'+p.name+'” 파티를 삭제할까요?';
        if(!(win.SiteUX?await win.SiteUX.confirm(title,'이 파티의 보스와 파티원 목록을 지웁니다.','파티 삭제'):win.confirm(title)))return;
        if(scope!==previousScope||remoteWriting)return;
        if(scope==='shared'){
          if(!await writeRemote('delete',p,p.revision,storageStatus))return;
        }else{
          var remaining=parties.filter(function(party){return party.id!==p.id;});
          if(!persist(remaining))return;
          parties=remaining;
        }
        selected='';
        refreshBoard();
        status('');
        storageStatus('“'+p.name+'” 파티를 삭제했습니다.');
      });
      if(scope==='local'){
        var publishButton=node('button','ux-button','공유로 복사');publishButton.type='button';
        publishButton.addEventListener('click',function(){switchScope('shared',p);});actions.append(publishButton);
      }
      if(editable)actions.append(editButton,deleteButton);
      header.append(title,actions);
      headingHost.append(header);
      var reset=DAILY_BOSSES.includes(p.bossId.split('|')[0])?'매일 0시':p.bossId.startsWith('BlackMage|')?'매월 1일 0시':'매주 목요일 0시';
      headingHost.append(node('p','party-note party-complete-note',done==='api'?'넥슨 스케줄러에서 내 캐릭터의 클리어를 확인했습니다. '+reset+'에 초기화됩니다.':'완료 표시는 '+reset+'에 초기화됩니다.'+(win.NexonKey&&win.NexonKey.has()?'':' 홈에서 API 키를 등록하면 내 캐릭터의 클리어를 자동으로 확인합니다.')));
      detail.append(partySummary(p.members,boss));
      var shares=damageShares(p.members);
      if(p.members.some(function(m,i){return accounts.conflict(shared,p.members.slice(0,i),m.character.name);}))detail.append(node('p','party-note account-error','계정 묶음이 변경되어 같은 계정의 캐릭터가 중복되었습니다. 한 명을 빼주세요.'));
      var roster=node('div','party-members');
      var filter=view.value,highlight=filter==='mine'?'내 캐릭터':filter.startsWith('character:')?'선택한 캐릭터':'선택한 계정';
      roster.append(...memberCards(p.members,shares,editable?function(m){updateMembers(p,p.members.filter(function(item){return item!==m;}));}:null,function(m){return matchingMember(filter,m.character.name)?highlight:'';}));
      detail.append(roster);
    }
    async function choose(name){
      var snap=scouter.findShared(shared,name,'00000');if(!snap){status('공용 환산 배율에서 먼저 캐릭터를 등록하세요.',true);return;}
      var version=++profileVersion;if(controller)controller.abort();controller=new AbortController();
      var cachedInfo=publicInfo(name);current=cachedInfo?{...cachedInfo,ocid:'shared:'+name}:{ocid:'shared:'+name,name:name,world:'',job:'',level:0,image:'',updatedAt:0};
      el('party-saved-character').value=name;renderPreview();renderBoard();status('');
      if(!cachedInfo?.image&&win.NexonKey&&win.NexonKey.has()){
        try{var info=await profileApi.load(name,controller.signal);if(version!==profileVersion)return;rememberPortrait(info);}catch(e){if(version!==profileVersion||e.name==='AbortError')return;}
      }
    }
    async function syncSaved(){
      var request=++syncVersion;
      try{var response=await win.fetch('/api/boss-rates',{cache:'no-store'});if(!response.ok)throw new Error();var store=await response.json();if(request!==syncVersion)return;if(store.schemaVersion!==1||!Array.isArray(store.snapshots))throw new Error();shared=store;
        var key=win.NexonKey&&win.NexonKey.get();if(key&&ownSyncedKey!==key&&!ownSyncPending){ownSyncedKey=key;var abort=new AbortController(),timer=setTimeout(function(){abort.abort();},10000);ownSyncPending=accounts.syncOwn(shared,{fetch:win.fetch.bind(win),newId:function(){return win.crypto.randomUUID();},load:async function(){var rows=await win.NexonCharacters.fetch({signal:abort.signal});if(key!==win.NexonKey.get())throw new DOMException('Aborted','AbortError');return rows;}}).finally(function(){clearTimeout(timer);});}
        if(ownSyncPending){var pending=ownSyncPending;try{var synced=await pending;if(request!==syncVersion)return;shared={...shared,accounts:synced.accounts,accountRevision:synced.accountRevision};}catch(e){}finally{if(ownSyncPending===pending)ownSyncPending=null;}}
        parties.forEach(function(p){p.members.forEach(function(m){var snap=snapshotFor(m.character);m.character=mergeProfile(m.character,publicInfo(m.character.name));if(snap)applySnapshot([p],m.character.ocid,snap,true);});});
        if(current)current=mergeProfile(current,publicInfo(current.name));
        persist();hydrateRemote();refreshBoard();
        repairPortraits(activeParties().find(function(p){return p.id===selected;}));
      }catch(e){if(request===syncVersion)status('공용 캐릭터 목록을 불러오지 못했습니다. 기존 파티는 유지됩니다.',true);}
    }
    async function loadMine(){
      owned.clear();if(!win.NexonKey||!win.NexonKey.has()){filterStatus('내 캐릭터 필터는 홈에서 API 키를 등록하면 사용할 수 있습니다.',true);return;}
      filterStatus('내 캐릭터를 불러오는 중…');
      try{var chars=await win.NexonCharacters.fetch();chars.forEach(function(c){owned.add(c.name);});if(view.value==='mine'){filterStatus('');refreshBoard();}}catch(e){if(view.value==='mine')filterStatus('내 캐릭터를 불러오지 못했습니다. API 키를 확인하세요.',true);}
    }
    var supported=new Set(win.RateCatalog.choices(win.MapleBossDB).map(function(c){return c.id;}));
    var bossPicker=mountBossPicker(win,choices,supported);
    ['local','shared'].forEach(function(value){
      var tab=el('party-scope-'+value);tab.addEventListener('click',function(){switchScope(value);});
      tab.addEventListener('keydown',function(e){
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
        e.preventDefault();switchScope(e.key==='Home'?'local':e.key==='End'?'shared':value==='local'?'shared':'local');
      });
    });
    el('party-refresh-shared').addEventListener('click',loadRemote);
    el('party-saved-character').addEventListener('change',function(){if(this.value)choose(this.value);else{profileVersion++;if(controller)controller.abort();current=null;renderPreview();renderBoard();}});
    el('party-reload-catalog').addEventListener('click',function(){ownSyncedKey='';portraitAttempts.clear();syncSaved();});
    el('party-boss').addEventListener('change',function(){draftStatus('');renderDraft();});
    el('party-account').addEventListener('change',function(){candidates();renderBoard();});el('party-draft-account').addEventListener('change',renderDraft);el('party-draft-character').addEventListener('change',function(){el('party-draft-add').disabled=!this.value;});
    el('party-draft-add').addEventListener('click',function(){
      var name=el('party-draft-character').value,boss=choices.find(function(c){return c.id===el('party-boss').value;});
      if(!name||!boss)return;
      if(accounts.conflict(shared,draftMembers,name)){draftStatus('같은 계정의 캐릭터는 한 명만 넣을 수 있습니다.',true);return;}
      if(draftMembers.length>=boss.max){draftStatus('이 보스는 최대 '+boss.max+'명입니다.',true);return;}
      var member=publicMember(name,boss.id);draftMembers.push(member);draftStatus(name+' 캐릭터를 추가했습니다.');renderDraft();repairPortraits({members:[member]});
    });
    ['all','mine'].forEach(function(id){el('party-view-'+id).addEventListener('click',function(){setView(id);});});
    el('party-clear-filter').addEventListener('click',function(){setView('all');el('party-view-all').focus();});
    el('party-list-search').addEventListener('input',function(){if(!remoteWriting)refreshBoard();});
    el('party-sort').addEventListener('change',function(){sortMode=this.value;try{win.localStorage.setItem(SORT_STORAGE,sortMode);}catch(e){}refreshBoard();});
    var filterDialog=el('party-filter-dialog'),filterQuery=el('party-filter-query'),filterOpener=el('party-open-filter');
    filterOpener.addEventListener('click',function(){filterOpener.focus();filterQuery.value='';renderFilterOptions();filterDialog.showModal();filterQuery.focus();});
    el('party-close-filter').addEventListener('click',function(){filterDialog.close();});
    filterQuery.addEventListener('input',renderFilterOptions);
    filterQuery.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();filterDialog.close();}});
    filterDialog.addEventListener('close',function(){if(doc.activeElement===doc.body||filterDialog.contains(doc.activeElement))filterOpener.focus();});
    el('party-create-toggle').addEventListener('click',function(){
      if(!el('party-create-form').hidden&&!editing){closeEditor();candidates();renderBoard();}else openEditor();
    });
    el('party-create-cancel').addEventListener('click',function(){
      var wasEditing=editing;closeEditor();candidates();renderBoard();
      (wasEditing?doc.querySelector('.party-edit'):el('party-create-toggle'))?.focus();
    });
    el('party-create-form').addEventListener('submit',async function(e){
      e.preventDefault();
      if(e.target.hidden||remoteWriting)return;
      var original=activeParties().find(function(p){return p.id===editing;}),boss=choices.find(function(c){return c.id===el('party-boss').value;});
      if(!boss){draftStatus('보스와 난이도를 선택하세요.',true);el('party-open-boss').focus();return;}
      if(editing&&!original){draftStatus('파티가 목록에서 사라졌습니다. 편집을 닫고 목록을 확인하세요.',true);return;}
      if(!original&&activeParties().length>=200){draftStatus('최대 200개 파티를 저장할 수 있습니다.',true);return;}
      var members=draftRoster(boss.id);
      if(members.length>boss.max){draftStatus('최대 '+boss.max+'명인 보스입니다. 파티원을 줄인 뒤 저장하세요.',true);return;}
      if(members.some(function(m,i){return accounts.conflict(shared,members.slice(0,i),m.character.name);})){draftStatus('같은 계정의 캐릭터는 한 명만 넣을 수 있습니다.',true);return;}
      var p={...original,id:original?original.id:(draftId||(draftId=win.crypto.randomUUID())),name:text(el('party-name').value,60)||boss.label,bossId:boss.id,members:members};
      if(scope==='shared'){
        if(!remoteAvailable){draftStatus('공유 목록을 새로고침한 뒤 다시 시도하세요.',true);return;}
        p=await writeRemote('save',p,editingRevision,draftStatus);if(!p){el('party-save').focus();return;}
      }else{
        var next=original?parties.map(function(item){return item.id===p.id?p:item;}):parties.concat(p);
        if(!persist(next)){draftStatus('브라우저에 저장하지 못했습니다.',true);return;}
        parties=next;
      }
      selected=p.id;closeEditor();
      if(!visible().includes(p)){view={value:'all',label:''};el('party-list-search').value='';filterStatus('');}
      candidates();renderBoard();status('');repairPortraits(p);loadClears();
      storageStatus(scope==='shared'?'공유 목록에 파티를 저장했습니다.':original?'파티 변경사항을 저장했습니다.':p.name+' 파티를 만들었습니다.');
      doc.querySelector('.party-edit')?.focus();
    });
    win.addEventListener('nexon-key-changed',function(){profileVersion++;if(controller)controller.abort();portraitAttempts.clear();if(current)choose(current.name);ownSyncedKey='';if(ownSyncPending)ownSyncPending.catch(function(){}).finally(function(){ownSyncedKey='';syncSaved();});else syncSaved();if(view.value==='mine')loadMine();loadClears(true).then(function(){renderBoard();});});
    function refresh(){syncSaved();if(scope==='shared')loadRemote().then(function(){loadClears();});else loadClears();}
    win.addEventListener('storage',function(e){if(e.key==='sharedBossRates.changed'||e.key===win.NexonKey.STORAGE_KEY)syncSaved();});win.addEventListener('focus',refresh);if(win.setInterval)win.setInterval(function(){if(!doc.hidden)refresh();},30000);
    updateScopeUI();refreshBoard();refresh();
  }
  return {imageUrl:imageUrl,profile:profile,summary:summary,clearStatus:clearStatus,periodKey:periodKey,schedulerClears:schedulerClears,catalog:catalog,restore:restore,client:client,scouterClient:scouterClient,applySnapshot:applySnapshot,mount:mount};
});
