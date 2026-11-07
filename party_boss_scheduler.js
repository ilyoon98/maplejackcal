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
  function mount(win){
    var doc=win.document;if(!doc||!doc.getElementById('party-create-form'))return;
    var el=function(id){return doc.getElementById(id);},choices=catalog(win.MapleBossDB),parties=[],selected='',current=null,owned=new Set(),shared={snapshots:[],accounts:[]},profileVersion=0,syncVersion=0,controller=null,draftMembers=[],accounts=win.AccountCatalog;
    var profiles=win.CharacterProfile||(typeof module==='object'?require('./character_profile.js'):null),visual=win.BossIdentity||(typeof module==='object'?require('./boss_identity.js'):null);
    var profileApi=profiles.client(win.fetch.bind(win),function(){return win.NexonKey&&win.NexonKey.get();});
    var ownSyncedKey='',ownSyncPending=null;
    var editing='',portraitAttempts=new Set();
    try{var saved=JSON.parse(win.localStorage.getItem(STORAGE)||'{}');parties=restore(saved,choices);}catch(e){}
    function node(tag,cls,label){var n=doc.createElement(tag);if(cls)n.className=cls;if(label!=null)n.textContent=label;return n;}
    function status(message,error){el('party-search-status').textContent=message||'';el('party-search-status').classList.toggle('error',!!error);}
    function persist(nextParties=parties){
      try{
        win.localStorage.setItem(STORAGE,JSON.stringify({parties:nextParties}));
        if(el('party-storage-status').classList.contains('error'))el('party-storage-status').textContent='';
        el('party-storage-status').classList.remove('error');
        return true;
      }catch(e){
        el('party-storage-status').textContent='브라우저에 저장하지 못했습니다.';
        el('party-storage-status').classList.add('error');
        return false;
      }
    }
    function snapshotFor(c){return scouter.findShared(shared,c.name,'00000');}
    function publicInfo(name){for(var a of accounts.groups(shared)){var c=a.characters.find(function(c){return c.name===name;});if(c)return c.profile;}return null;}
    function mergeProfile(character,info){var merged=scouter.mergeCharacter(character,info);return merged?{...merged,ocid:character.ocid}:character;}
    function rememberPortrait(info){
      parties.forEach(function(p){p.members.forEach(function(m){if(m.character.name===info.name)m.character=mergeProfile(m.character,info);});});
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
    function targetBoss(){return parties.find(function(p){return p.id===selected;})?.bossId||'';}
    function candidates(){
      fillAccounts('party-account');fillCharacters('party-saved-character',el('party-account').value,targetBoss(),current?current.name:'');
      if(current&&el('party-saved-character').value!==current.name){current=null;profileVersion++;if(controller)controller.abort();}renderPreview();renderDraft();
    }
    function renderDraft(){
      if(el('party-create-form').hidden)return;
      var bossId=el('party-boss').value,boss=choices.find(function(c){return c.id===bossId;});
      if(!boss)return;
      fillAccounts('party-draft-account');fillCharacters('party-draft-character',el('party-draft-account').value,bossId,el('party-draft-character').value);
      var host=el('party-draft-members'),members=draftRoster(bossId);host.replaceChildren();
      el('party-draft-summary').replaceChildren(totals(members,boss.max,false));
      host.append(...memberCards(members,function(m,index){draftMembers.splice(index,1);draftStatus('');renderDraft();}));
      el('party-draft-add').disabled=!el('party-draft-character').value;
    }
    function draftRoster(bossId){
      var original=parties.find(function(p){return p.id===editing&&p.bossId===bossId;});
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
    function memberCards(members,onRemove){
      var sum=summary(members);
      return members.map(function(m,index){
        var share=!sum.missing&&sum.total>0?percentLabel(m.rate/sum.total*100):'—';
        return memberCard(m,share,function(){onRemove(m,index);});
      });
    }
    function memberCard(m,share,onRemove){
      var c=m.character,row=node('div','party-member'),info=profiles.renderInfo(doc,c,c.name),metrics=node('div','party-member-metrics');
      info.append(node('p','party-account-label',accountName(c.name)));
      metrics.append(metric('환산 배율',m.rate===null?'미등록':percentLabel(m.rate)));
      if(share!==undefined)metrics.append(metric('예상 딜 비중',share));
      row.append(portrait(c),info,metrics);
      if(onRemove){
        var remove=node('button','party-remove','빼기');remove.type='button';remove.setAttribute('aria-label',c.name+' 파티에서 빼기');
        remove.addEventListener('click',onRemove);row.append(remove);
      }
      return row;
    }
    function visible(){return parties.filter(function(p){return el('party-view').value!=='mine'||p.members.some(function(m){return owned.has(m.character.name);});});}
    function draftStatus(message,error){var note=el('party-draft-status');note.textContent=message;note.classList.toggle('error',!!error);}
    function closeEditor(){
      editing='';draftMembers=[];el('party-create-form').hidden=true;
      el('party-create-toggle').setAttribute('aria-expanded','false');
    }
    function openEditor(p){
      var form=el('party-create-form'),boss=el('party-boss');form.reset();bossPicker.open=false;
      editing=p?p.id:'';draftMembers=p?p.members.map(function(m){return {...m};}):[];
      if(p){
        boss.value=p.bossId;
        var choice=choices.find(function(c){return c.id===p.bossId;});
        el('party-name').value=p.name===choice.label?'':p.name;
      }
      boss.dispatchEvent(new win.Event('change'));
      el('party-form-title').textContent=p?'파티 수정':'새 파티';
      el('party-create-toggle').setAttribute('aria-expanded',String(!p));
      draftStatus('');form.hidden=false;candidates();renderBoard();
      (p?el('party-name'):bossPicker.querySelector('summary')).focus();
    }
    function updateMembers(p,members){
      var next=parties.map(function(item){return item===p?{...p,members:members}:item;});
      if(!persist(next))return false;
      parties=next;renderBoard();return true;
    }
    function renderBoard(){
      var list=el('party-list'),headingHost=el('party-detail-heading'),detail=el('party-detail-content'),shown=visible();list.replaceChildren();headingHost.replaceChildren();detail.replaceChildren();if(!shown.some(function(p){return p.id===selected;}))selected=shown[0]?shown[0].id:'';
      if(editing&&editing!==selected)closeEditor();
      shown.forEach(function(p){
        var button=node('button'),boss=choices.find(function(c){return c.id===p.bossId;});
        button.type='button';button.setAttribute('aria-pressed',String(p.id===selected));
        button.append(visual.create(doc,p.bossId,win.MapleBossDB));
        if(p.name!==boss.label)button.append(node('span','party-list-name',p.name));
        button.append(totals(p.members,boss.max,true));
        button.addEventListener('click',function(){
          if(p.id!==selected){status('');if(editing)closeEditor();}
          selected=p.id;candidates();renderBoard();repairPortraits(p);
        });list.append(button);
      });
      var p=parties.find(function(item){return item.id===selected;}),formOpen=!el('party-create-form').hidden;
      el('party-detail').hidden=formOpen;el('party-add-panel').hidden=!p||formOpen;var add=el('party-add-current');add.disabled=true;
      if(!p){detail.append(node('p','party-empty',el('party-view').value==='mine'?'내 캐릭터 파티가 없습니다.':'새 파티를 만들어보세요.'));return;}
      if(formOpen)return;
      var boss=choices.find(function(c){return c.id===p.bossId;});add.disabled=!current||!snapshotFor(current)||!snapshotFor(current).rates.some(function(r){return r.bossId===p.bossId;});
      add.onclick=function(){if(!current)return;if(accounts.conflict(shared,p.members,current.name)){status('같은 계정은 한 명만 배치할 수 있습니다.',true);return;}if(p.members.length>=boss.max){status('최대 '+boss.max+'명입니다.',true);return;}if(updateMembers(p,p.members.concat(makeMember(current,p.bossId))))status(current.name+' 추가됨');};
      var header=node('div','party-detail-head');
      var title=node('h3');
      title.append(visual.create(doc,p.bossId,win.MapleBossDB));
      if(p.name!==boss.label)title.append(node('span','party-detail-name',p.name));
      var actions=node('div','party-detail-actions'),editButton=node('button','party-edit','수정');
      editButton.type='button';
      editButton.setAttribute('aria-controls','party-create-form');
      editButton.addEventListener('click',function(){openEditor(p);});
      var deleteButton=node('button','party-delete','파티 삭제');
      deleteButton.type='button';
      deleteButton.addEventListener('click',function(){
        if(!win.confirm('“'+p.name+'” 파티를 삭제할까요?'))return;
        var remaining=parties.filter(function(party){return party.id!==p.id;});
        if(!persist(remaining))return;
        parties=remaining;
        selected=visible()[0]?.id||'';
        candidates();
        renderBoard();
        status('');
        el('party-storage-status').textContent='“'+p.name+'” 파티를 삭제했습니다.';
      });
      actions.append(editButton,deleteButton);
      header.append(title,actions);
      headingHost.append(header);
      detail.append(totals(p.members,boss.max,false));
      if(p.members.some(function(m,i){return accounts.conflict(shared,p.members.slice(0,i),m.character.name);}))detail.append(node('p','party-note account-error','계정 묶음이 변경되어 같은 계정의 캐릭터가 중복되었습니다. 한 명을 빼주세요.'));
      var roster=node('div','party-members');
      roster.append(...memberCards(p.members,function(m){updateMembers(p,p.members.filter(function(item){return item!==m;}));}));
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
        persist();candidates();renderBoard();
        repairPortraits(parties.find(function(p){return p.id===selected;}));
      }catch(e){if(request===syncVersion)status('공용 캐릭터 목록을 불러오지 못했습니다. 기존 파티는 유지됩니다.',true);}
    }
    async function loadMine(){
      owned.clear();if(!win.NexonKey||!win.NexonKey.has()){status('내 캐릭터 필터는 홈에서 API 키를 등록하면 사용할 수 있습니다.',true);return;}
      try{var chars=await win.NexonCharacters.fetch();chars.forEach(function(c){owned.add(c.name);});renderBoard();candidates();}catch(e){status('내 계정 확인에 실패했습니다. 공용 캐릭터 선택은 계속 사용할 수 있습니다.',true);}
    }
    var supported=new Set(win.RateCatalog.choices(win.MapleBossDB).map(function(c){return c.id;}));
    var savedBosses=new Set(parties.map(function(p){return p.bossId;}));
    choices.filter(function(c){return supported.has(c.id)||savedBosses.has(c.id);}).forEach(function(c){
      var option=node('option','',c.label+' (최대 '+c.max+'명)');option.value=c.id;el('party-boss').append(option);
    });
    var bossPicker=visual.picker(doc,el('party-boss'),win.MapleBossDB);
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
    el('party-view').addEventListener('change',function(){if(this.value==='mine')loadMine();renderBoard();candidates();});
    el('party-create-toggle').addEventListener('click',function(){
      if(!el('party-create-form').hidden&&!editing){closeEditor();candidates();renderBoard();}else openEditor();
    });
    el('party-create-cancel').addEventListener('click',function(){
      var wasEditing=editing;closeEditor();candidates();renderBoard();
      (wasEditing?doc.querySelector('.party-edit'):el('party-create-toggle'))?.focus();
    });
    el('party-create-form').addEventListener('submit',function(e){
      e.preventDefault();
      var original=parties.find(function(p){return p.id===editing;}),boss=choices.find(function(c){return c.id===el('party-boss').value;});
      if(e.target.hidden||!boss)return;
      if(!original&&parties.length>=200){draftStatus('최대 200개 파티를 저장할 수 있습니다.',true);return;}
      var members=draftRoster(boss.id);
      if(members.length>boss.max){draftStatus('최대 '+boss.max+'명인 보스입니다. 파티원을 줄인 뒤 저장하세요.',true);return;}
      if(members.some(function(m,i){return accounts.conflict(shared,members.slice(0,i),m.character.name);})){draftStatus('같은 계정의 캐릭터는 한 명만 넣을 수 있습니다.',true);return;}
      var p={...original,id:original?original.id:win.crypto.randomUUID(),name:text(el('party-name').value,60)||boss.label,bossId:boss.id,members:members};
      var next=original?parties.map(function(item){return item.id===p.id?p:item;}):parties.concat(p);
      if(!persist(next)){draftStatus('브라우저에 저장하지 못했습니다.',true);return;}
      parties=next;selected=p.id;closeEditor();
      if(!visible().includes(p))el('party-view').value='all';
      candidates();renderBoard();status('');repairPortraits(p);
      el('party-storage-status').textContent=original?'파티 변경사항을 저장했습니다.':p.name+' 파티를 만들었습니다.';
      doc.querySelector('.party-edit')?.focus();
    });
    win.addEventListener('nexon-key-changed',function(){profileVersion++;if(controller)controller.abort();portraitAttempts.clear();if(current)choose(current.name);ownSyncedKey='';if(ownSyncPending)ownSyncPending.catch(function(){}).finally(function(){ownSyncedKey='';syncSaved();});else syncSaved();if(el('party-view').value==='mine')loadMine();});
    win.addEventListener('storage',function(e){if(e.key==='sharedBossRates.changed'||e.key===win.NexonKey.STORAGE_KEY)syncSaved();});win.addEventListener('focus',syncSaved);if(win.setInterval)win.setInterval(function(){if(!doc.hidden)syncSaved();},30000);
    renderBoard();renderPreview();syncSaved();
  }
  return {imageUrl:imageUrl,profile:profile,summary:summary,clearStatus:clearStatus,catalog:catalog,restore:restore,client:client,scouterClient:scouterClient,applySnapshot:applySnapshot,mount:mount};
});
