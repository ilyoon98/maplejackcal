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
  var BASE='https://open.api.nexon.com/maplestory/v1';
  var SHARE_COLORS=['#75adff','#59d8ad','#ffc46b','#c39bfa','#ff849d','#efe879'];
  // Nexon lists these examples by boss across difficulties.
  var REWARD_GUIDE='https://maplestory.nexon.com/guide/n23gameinformation/articles/459';
  var MAJOR_REWARDS={
    Lotus:['루즈 컨트롤 머신 마크','컴플리트 언더컨트롤','특수형 에너지 코어(S급)'],
    Damien:['마력이 깃든 안대','루인 포스실드','뒤틀린 낙인의 영혼석'],
    GuardianAngelSlime:['가디언 엔젤 링','흑옥의 보스 반지 상자'],
    Lucid:['몽환의 벨트','트와일라이트 마크','나비날개 물방울석'],
    Will:['저주받은 마도서 선택 상자','트와일라이트 마크','코브웹 물방울석'],
    Dusk:['거대한 공포','에스텔라 이어링','아케인셰이드 무기 상자'],
    Dunkel:['커맨더 포스 이어링','에스텔라 이어링','아케인셰이드 방어구 상자'],
    VerusHilla:['고통의 근원','데이브레이크 펜던트','아케인셰이드 무기 상자'],
    BlackMage:['창세의 뱃지','익셉셔널 해머 (벨트)','백옥의 보스 반지 상자'],
    ChosenSeren:['미트라의 분노 선택 상자','데이브레이크 펜던트','익셉셔널 해머 (얼굴장식)'],
    KalosTheGuardian:['남겨진 칼로스의 의지','의지의 에테르넬 방어구 상자','생명의 보스 반지 상자'],
    TheFirstAdversary:['불멸의 유산','고대의 에테르넬 방어구 상자','이어진 고대의 결의','생명의 보스 반지 상자'],
    Kaling:['뒤엉킨 흉수의 고리','흉수의 에테르넬 방어구 상자','혼돈의 칠흑 장신구 상자'],
    Limbo:['근원의 속삭임','왜곡된 욕망의 결정','욕망의 에테르넬 방어구 상자'],
    Baldrix:['죽음의 맹세','맹세의 에테르넬 방어구 상자','영원한 충성의 흔적'],
    RadiantMalefic:['황홀한 악몽','환상의 에테르넬 방어구 상자','황홀한 환상의 단편 조각'],
    Jupiter:['오만의 원죄','갈망의 에테르넬 방어구 상자','뒤틀린 갈망의 편린'],
    Bellona:['굶주리는 핏빛 원혼','광기의 에테르넬 방어구 상자','저주받은 원혼의 잔재']
  };
  function text(v,n){return typeof v==='string'?v.trim().slice(0,n||100):'';}
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
        var badge=visual.create(doc,c.id,db).querySelector('.diff-badge');
        var item=button(badge,function(){choose(c.id);});item.setAttribute('aria-pressed',String(select.value===c.id));options.append(item);
      });
      options.querySelector('button').focus();
    }
    function normalize(value){return value.toLocaleLowerCase('ko-KR').replace(/\s+/g,'');}
    function showBosses(){
      var term=normalize(query.value);difficulty.hidden=true;search.hidden=false;results.hidden=false;results.replaceChildren();recentList.replaceChildren();
      recent.filter(function(id){return available.some(function(c){return c.id===id;});}).forEach(function(id){
        recentList.append(button(visual.create(doc,id,db),function(){choose(id);}));
      });
      recentSection.hidden=!recentList.childElementCount;
      bosses.forEach(function(_,key){
        var names=[db[key].Name].concat(db.BossAliases?.[key]||[]);
        if(names.some(function(name){return normalize(name).includes(term);}))results.append(button(visual.create(doc,key,db),function(){showDifficulties(key);}));
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
    try{var saved=JSON.parse(win.localStorage.getItem(STORAGE)||'{}');parties=restore(saved,choices);}catch(e){}
    try{if(win.localStorage.getItem(SCOPE_STORAGE)==='shared')scope='shared';}catch(e){}
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
      note.textContent=sharedScope?(remoteLoading?'공유 파티 불러오는 중…':remoteError||'누구나 볼 수 있습니다. 만든 브라우저에서 수정할 수 있습니다.'):'이 브라우저에서만 볼 수 있습니다.';
      note.classList.toggle('error',sharedScope&&!!remoteError&&!remoteLoading);
      refresh.hidden=!sharedScope;refresh.disabled=remoteLoading||remoteWriting;
      el('party-create-toggle').disabled=remoteWriting||(sharedScope&&!remoteAvailable);
      el('party-create-cancel').disabled=remoteWriting;el('party-save').disabled=remoteWriting||(sharedScope&&!remoteAvailable);
      el('party-create-form').inert=remoteWriting;el('party-view').disabled=remoteWriting;
      el('party-save').textContent=remoteWriting?'저장 중…':sharedScope?'공유 파티 저장':'파티 저장';
      el('party-draft-scope').textContent=sharedScope?'저장하면 누구나 볼 수 있습니다.':'이 브라우저에 저장';
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
        var errors={PARTY_CONFLICT:'다른 화면에서 먼저 수정했습니다. 편집을 닫고 공유 목록을 새로고침한 뒤 다시 시도하세요.',PARTY_FORBIDDEN:'파티를 만든 브라우저에서 수정할 수 있습니다.',PARTY_ACCOUNT_CONFLICT:'같은 계정의 캐릭터가 있습니다. 공용 계정 목록을 확인하세요.',PARTY_MEMBER_NOT_REGISTERED:'공용 배율에 등록되지 않은 파티원이 있습니다.',PARTY_LIMIT:'공유 파티 저장 한도에 도달했습니다.',PARTY_OWNER_STORAGE:'수정 권한을 브라우저에 저장할 수 없습니다.'};
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
    function totals(members,max,compact){
      var sum=summary(members),known=members.length>sum.missing;
      var box=node('span',compact?'party-totals compact':'party-totals'),footer=node('span','party-metrics-footer');
      var verdict=sum.missing?['pending','판정 대기']:members.length?clearStatus(Math.round(sum.total*100)/100):null;
      var badge=verdict?node('span','party-verdict '+verdict[0],verdict[1]):null;
      box.append(metric('환산 합계',known?percentLabel(sum.total):'—',compact?null:badge));
      if(compact&&badge)footer.append(badge);
      if(sum.missing)footer.append(node('span','party-note',sum.missing+'명 미등록'));
      footer.append(node('span','party-member-count',members.length+' / '+max+'명'));
      box.append(footer);return box;
    }
    function mesoLabel(value){
      var eok=Math.floor(value/1e8),man=Math.floor(value%1e8/1e4),rest=value%1e4;
      var parts=[eok?eok.toLocaleString('ko-KR')+'억':'',man?man.toLocaleString('ko-KR')+'만':'',rest?rest.toLocaleString('ko-KR'):''];
      return (parts.filter(Boolean).join(' ')||'0')+' 메소';
    }
    function partySummary(members,boss){
      var [key,difficulty]=boss.id.split('|'),price=Number(win.MapleBossDB[key][difficulty].CrystalPrice),count=members.length;
      var layout=node('div','party-summary-grid'),reward=node('section','party-reward');
      var icon=node('img');icon.src='icons/home/강렬한힘의결정.webp';icon.alt='';
      var crystal=node('div','party-crystal');crystal.append(icon,metric(count?'1인당 결정석':'결정석 기본가',mesoLabel(Math.floor(price/Math.max(1,count)))));
      var condition=count?count+'인 균등 분배':'파티원을 추가하면 1인당 금액 표시';
      if(count>1)condition+=' (전체 '+mesoLabel(price)+')';
      reward.append(node('h4','','보스 보상'),crystal,node('p','party-note',condition));
      var items=MAJOR_REWARDS[key];
      if(items){
        var labels=node('ul','party-reward-items');items.forEach(function(item){labels.append(node('li','',item));});
        var guide=node('a','','공식 보상 안내');guide.href=REWARD_GUIDE;guide.target='_blank';guide.rel='noopener';
        var note=node('p','party-note','아이템은 난이도에 따라 달라요. ');note.append(guide);
        reward.append(labels,note);
      }
      layout.append(totals(members,boss.max,false),reward);return layout;
    }
    function damageShares(members){
      var sum=summary(members);
      return sum.missing||sum.total<=0?null:members.map(function(m){return rate(m.rate)/sum.total*100;});
    }
    function damageChart(members,shares){
      var section=node('section','party-share-chart'),title=node('h4','','예상 딜 비중');
      title.id='party-share-title';section.setAttribute('aria-labelledby',title.id);section.append(title);
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
    function fillView(){
      var select=el('party-view'),value=select.value;
      select.replaceChildren(new win.Option('전체 파티','all'),new win.Option('내 캐릭터 파티','mine'));
      var groups=accounts.groups(shared);if(groups.length){
        var options=node('optgroup');options.label='계정별 보기';
        groups.forEach(function(group){options.append(new win.Option(group.label,'account:'+group.id));});select.append(options);
      }
      var names=new Set(activeParties().flatMap(function(p){return p.members.map(function(m){return m.character.name;});}));
      if(names.size){
        var characters=node('optgroup');characters.label='캐릭터별 보기';
        Array.from(names).sort(function(a,b){return a.localeCompare(b,'ko-KR');}).forEach(function(name){characters.append(new win.Option(name,'character:'+name));});
        select.append(characters);
      }
      select.value=Array.from(select.options).some(function(option){return option.value===value;})?value:'all';
    }
    function matchingMember(filter,name){
      if(filter==='mine')return owned.has(name);
      if(filter.startsWith('character:'))return filter==='character:'+name;
      if(!filter.startsWith('account:'))return false;
      var id=accounts.accountId(shared,name);
      return filter==='account:'+id||filter==='account:'&&id==='character:'+name;
    }
    function visible(){
      var filter=el('party-view').value,items=activeParties();
      if(filter==='all')return items;
      return items.filter(function(p){return p.members.some(function(m){return matchingMember(filter,m.character.name);});});
    }
    function storageStatus(message,error){var note=el('party-storage-status');note.textContent=message;note.classList.toggle('error',!!error);}
    function filterStatus(message,error){var note=el('party-filter-status');note.textContent=message;note.classList.toggle('error',!!error);}
    function draftStatus(message,error){var note=el('party-draft-status');note.textContent=message;note.classList.toggle('error',!!error);}
    function closeEditor(){
      editing='';editingRevision='';draftId='';draftMembers=[];el('party-create-form').hidden=true;bossPicker.close();
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
    function selectVisible(shown){if(!shown.some(function(p){return p.id===selected;}))selected=shown[0]?.id||'';}
    function refreshBoard(){fillView();var shown=visible();selectVisible(shown);candidates();renderBoard(shown);}
    function renderBoard(shown=visible()){
      var list=el('party-list'),headingHost=el('party-detail-heading'),detail=el('party-detail-content'),formOpen=!el('party-create-form').hidden;
      list.replaceChildren();headingHost.replaceChildren();detail.replaceChildren();selectVisible(shown);
      shown.forEach(function(p){
        var button=node('button'),boss=choices.find(function(c){return c.id===p.bossId;});
        button.type='button';button.disabled=formOpen||remoteWriting;button.setAttribute('aria-pressed',String(p.id===selected));
        button.append(visual.create(doc,p.bossId,win.MapleBossDB));
        if(p.name!==boss.label)button.append(node('span','party-list-name',p.name));
        button.append(totals(p.members,boss.max,true));
        button.addEventListener('click',function(){
          if(remoteWriting||!el('party-create-form').hidden)return;
          if(p.id!==selected){status('');if(editing)closeEditor();}
          selected=p.id;candidates();renderBoard();repairPortraits(p);
        });list.append(button);
      });
      var p=activeParties().find(function(item){return item.id===selected;}),editable=scope==='local'||p?.canEdit;
      el('party-detail').hidden=formOpen;el('party-add-panel').hidden=!p||formOpen||!editable;var add=el('party-add-current');add.disabled=true;
      if(!p){
        var filter=el('party-view').value;
        var message=scope==='shared'&&!remoteAvailable?(remoteError||'공유 파티를 불러오는 중입니다.'):filter==='mine'?'내 캐릭터 파티가 없습니다.':filter!=='all'?'이 계정의 파티가 없습니다.':scope==='shared'?'아직 공유된 파티가 없습니다.':'새 파티를 만들어보세요.';
        detail.append(node('p','party-empty',message));return;
      }
      if(formOpen)return;
      var boss=choices.find(function(c){return c.id===p.bossId;});add.disabled=!editable||remoteWriting||!current||!snapshotFor(current)||!snapshotFor(current).rates.some(function(r){return r.bossId===p.bossId;});
      add.onclick=async function(){if(!editable||remoteWriting||!current)return;if(accounts.conflict(shared,p.members,current.name)){status('같은 계정은 한 명만 배치할 수 있습니다.',true);return;}if(p.members.length>=boss.max){status('최대 '+boss.max+'명입니다.',true);return;}var name=current.name;if(await updateMembers(p,p.members.concat(makeMember(current,p.bossId))))status(name+' 추가됨');};
      var header=node('div','party-detail-head');
      var title=node('h3');
      title.append(visual.create(doc,p.bossId,win.MapleBossDB));
      if(p.name!==boss.label)title.append(node('span','party-detail-name',p.name));
      var actions=node('div','party-detail-actions'),editButton=node('button','party-edit','수정');
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
      detail.append(partySummary(p.members,boss));
      var shares=damageShares(p.members);
      if(shares)detail.append(damageChart(p.members,shares));
      if(p.members.some(function(m,i){return accounts.conflict(shared,p.members.slice(0,i),m.character.name);}))detail.append(node('p','party-note account-error','계정 묶음이 변경되어 같은 계정의 캐릭터가 중복되었습니다. 한 명을 빼주세요.'));
      var roster=node('div','party-members');
      var filter=el('party-view').value,highlight=filter==='mine'?'내 캐릭터':filter.startsWith('character:')?'선택한 캐릭터':'선택한 계정';
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
      try{var chars=await win.NexonCharacters.fetch();chars.forEach(function(c){owned.add(c.name);});if(el('party-view').value==='mine'){filterStatus('');refreshBoard();}}catch(e){if(el('party-view').value==='mine')filterStatus('내 캐릭터를 불러오지 못했습니다. API 키를 확인하세요.',true);}
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
    el('party-view').addEventListener('change',function(){filterStatus('');if(this.value==='mine')loadMine();refreshBoard();});
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
      fillView();
      if(!visible().includes(p))el('party-view').value='all';
      candidates();renderBoard();status('');repairPortraits(p);
      storageStatus(scope==='shared'?'공유 목록에 파티를 저장했습니다.':original?'파티 변경사항을 저장했습니다.':p.name+' 파티를 만들었습니다.');
      doc.querySelector('.party-edit')?.focus();
    });
    win.addEventListener('nexon-key-changed',function(){profileVersion++;if(controller)controller.abort();portraitAttempts.clear();if(current)choose(current.name);ownSyncedKey='';if(ownSyncPending)ownSyncPending.catch(function(){}).finally(function(){ownSyncedKey='';syncSaved();});else syncSaved();if(el('party-view').value==='mine')loadMine();});
    function refresh(){syncSaved();if(scope==='shared')loadRemote();}
    win.addEventListener('storage',function(e){if(e.key==='sharedBossRates.changed'||e.key===win.NexonKey.STORAGE_KEY)syncSaved();});win.addEventListener('focus',refresh);if(win.setInterval)win.setInterval(function(){if(!doc.hidden)refresh();},30000);
    updateScopeUI();refreshBoard();refresh();
  }
  return {imageUrl:imageUrl,profile:profile,summary:summary,clearStatus:clearStatus,catalog:catalog,restore:restore,client:client,scouterClient:scouterClient,applySnapshot:applySnapshot,mount:mount};
});
