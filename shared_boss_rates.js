(function(){
  'use strict';
  var el=function(id){return document.getElementById(id);},catalog=window.RateCatalog,data=window.ScouterData,accounts=window.AccountCatalog,profiles=window.CharacterProfile,visual=window.BossIdentity,choices=catalog.choices(window.MapleBossDB);
  var store={snapshots:[],persistent:false},name='',rates=[],revision='',method='manual',stamp='',character=null,dirty=false,busy=false,version=0,profileController=null,profilePending=null,shotIds=new Set();
  var profileApi=profiles.client(fetch,function(){return window.NexonKey.get();});
  var accountFilter='',groupEditId='',groupDirty=false,ownerDirty=false,toastTimer=null,ownSyncPending=null,ownSyncKey='';
  var errors={RATE_DB_NOT_CONFIGURED:'공용 DB가 아직 연결되지 않았습니다.',RATE_CONFLICT:'다른 사람이 먼저 수정했습니다. 작성값은 유지했습니다. 목록을 새로고침한 뒤 캐릭터를 다시 선택하세요.',RATE_PIN_REQUIRED:'기록 비밀번호를 확인하세요.',RATE_INVALID:'닉네임과 배율을 확인하세요.',RATE_LIMIT:'저장 한도를 초과했습니다.',SCOUTER_BLOCKED:'환산 사이트가 서버 조회를 차단했습니다. 캡처 입력으로 등록할 수 있습니다.'};
  function node(tag,text){var n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
  function say(message,error){el('shared-status').textContent=message;el('shared-status').classList.toggle('shared-error',!!error);}
  function fail(e){say(errors[e.code]||errors[e.message]||'요청을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.',true);}
  function toast(message){el('shared-toast').textContent='✓ '+message;el('shared-toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(function(){el('shared-toast').hidden=true;},5000);}
  function accountStore(){return store;}
  function allGroups(){return accounts.groups(accountStore());}
  function memberInfo(value){for(var g of allGroups()){var member=g.characters.find(function(c){return c.name===value;});if(member)return member;}return null;}
  function option(select,value,label){var o=node('option',label);o.value=value;select.append(o);return o;}
  function characterOptions(){
    var select=el('shared-character');
    select.replaceChildren();
    var placeholder=option(select,'','캐릭터 선택');
    placeholder.disabled=true;
    for(var account of allGroups()){
      if(accountFilter&&(account.id||'__unassigned__')!==accountFilter)continue;
      var registered=account.characters.filter(function(character){return character.snapshot;});
      if(!registered.length)continue;
      var group=node('optgroup');
      group.label=account.label;
      for(var character of registered){
        var profile=character.profile;
        var label=character.name+(profile?' · '+profile.world+' · Lv.'+profile.level:'');
        option(group,character.name,label);
      }
      select.append(group);
    }
    if(select.options.length===1)placeholder.textContent='등록된 캐릭터 없음';
    select.value=Array.from(select.options).some(function(entry){return entry.value===name;})?name:'';
  }
  function ownerOptions(){
    var owner=el('shared-owner');owner.replaceChildren();option(owner,'__unassigned__','미분류');allGroups().filter(function(g){return g.id;}).forEach(function(g){option(owner,g.id,g.label);});option(owner,'__new__','새 계정');
    var id=accounts.accountId(accountStore(),name);owner.value=Array.from(owner.options).some(function(o){return o.value===id;})?id:accountFilter&&Array.from(owner.options).some(function(o){return o.value===accountFilter;})?accountFilter:'__unassigned__';ownerLabel();el('shared-owner-fields').hidden=!name;
  }
  function ownerLabel(){var a=(accountStore().accounts||[]).find(function(a){return a.id===el('shared-owner').value;}),group=allGroups().find(function(g){return a&&g.id===a.id;});el('shared-owner-label').value=a?a.label:'';el('shared-owner-label').placeholder=group?.label||name||'대표 캐릭터 이름 사용';el('shared-owner-summary').textContent=group?group.label+' · 계정 변경':'계정 미분류 · 설정';}
  function renderGroupEditor(){
    var select=el('shared-group-select');select.replaceChildren();option(select,'','새 계정 만들기');allGroups().filter(function(g){return g.id;}).forEach(function(g){option(select,g.id,g.label);});select.value=groupEditId;
    var account=(accountStore().accounts||[]).find(function(a){return a.id===groupEditId;});el('shared-group-label').value=account?account.label:'';el('shared-group-members').replaceChildren();var members=new Map();allGroups().forEach(function(g){g.characters.forEach(function(c){members.set(c.name,c);});});if(name&&!members.has(name))members.set(name,{name:name,profile:character});
    members.forEach(function(c){var label=node('label'),check=node('input');check.type='checkbox';check.value=c.name;check.checked=account?account.characters.some(function(m){return m.name===c.name;}):c.name===name;label.append(check,node('span',c.name+(c.profile?' · Lv.'+c.profile.level:'')));el('shared-group-members').append(label);});
  }
  function accountOptions(){var select=el('shared-account');select.replaceChildren();option(select,'','전체 계정');allGroups().forEach(function(g){option(select,g.id||'__unassigned__',g.label);});if(!Array.from(select.options).some(function(o){return o.value===accountFilter;}))accountFilter='';select.value=accountFilter;characterOptions();ownerOptions();renderGroupEditor();}
  async function persistAccounts(next){var result=await accounts.save(fetch,next,store.accountRevision||'',el('shared-pin').value);store.accounts=result.accounts;store.accountRevision=result.accountRevision;return result;}
  async function saveOwner(){
    var id=el('shared-owner').value,label=el('shared-owner-label').value.trim();if(id==='__unassigned__'&&!label){if(!ownerDirty)return false;var unassigned=accounts.normalize((store.accounts||[]).map(function(a){return {...a,characters:a.characters.filter(function(c){return c.name!==name;})};}));if(JSON.stringify(unassigned)===JSON.stringify(store.accounts||[]))return false;await persistAccounts(unassigned);return true;}if(id==='__new__'||id==='__unassigned__')id=crypto.randomUUID();var old=(accountStore().accounts||[]).find(function(a){return a.id===id;}),members=old?old.characters.filter(function(c){return c.name!==name;}):[];var c={name:name};if(character)c.profile=character;members.push(c);
    var next=accounts.assign(accountStore().accounts||[],id,label,members);if(JSON.stringify(next)!==JSON.stringify(store.accounts||[])){await persistAccounts(next);return true;}return false;
  }
  async function syncOwnAccount(quiet){
    if(!window.NexonKey.has()){if(!quiet)toast('홈에서 API 키를 등록하세요.');return;}
    if(store.requiresPin&&!el('shared-pin').value){if(!quiet)toast('기록 비밀번호를 입력하세요.');return;}
    if(ownSyncPending)return ownSyncKey===window.NexonKey.get()?ownSyncPending:ownSyncPending.then(function(){return syncOwnAccount(quiet);});
    var key=window.NexonKey.get(),abort=new AbortController(),timer=setTimeout(function(){abort.abort();},10000);ownSyncKey=key;
    ownSyncPending=(async function(){try{
      var result=await accounts.syncOwn(store,{fetch:fetch,newId:function(){return crypto.randomUUID();},pin:el('shared-pin').value,load:async function(){var rows=await window.NexonCharacters.fetch({signal:abort.signal});if(key!==window.NexonKey.get())throw new DOMException('Aborted','AbortError');return rows;}});
      var owner=el('shared-owner').value,label=el('shared-owner-label').value,keep=ownerDirty,previous=store.accountRevision,groupLabel=el('shared-group-label').value,checked=new Set(Array.from(el('shared-group-members').querySelectorAll('input:checked')).map(function(n){return n.value;}));store={...store,accounts:result.accounts,accountRevision:result.accountRevision};accountOptions();if(keep){el('shared-owner').value=owner;el('shared-owner-label').value=label;}if(groupDirty){el('shared-group-label').value=groupLabel;el('shared-group-members').querySelectorAll('input').forEach(function(n){n.checked=checked.has(n.value);});}if(previous!==store.accountRevision)try{localStorage.setItem('sharedBossRates.changed',String(Date.now()));}catch(e){}
      if(!quiet)toast('내 계정 연결 완료');
    }catch(e){if(!quiet)toast('계정을 불러오지 못했습니다. API 키를 확인하세요.');}finally{clearTimeout(timer);ownSyncPending=null;el('shared-import-account').textContent='내 계정 불러오기';el('shared-import-account').disabled=busy;}})();el('shared-import-account').textContent='연결 중…';el('shared-import-account').disabled=true;return ownSyncPending;
  }
  function controls(){
    el('shared-fetch').disabled=busy||!name;el('shared-save').disabled=busy||!name||!rates.length||!store.persistent;el('shared-add').disabled=busy||!name;el('shared-image').disabled=busy||!name;el('shared-open').querySelector('button').disabled=busy;
    ['shared-character','shared-account','shared-owner','shared-owner-label','shared-group-select','shared-group-label','shared-group-save','shared-refresh','shared-nickname','shared-add-boss','shared-pin','shared-mode-fetch','shared-mode-capture'].forEach(function(id){el(id).disabled=busy;});el('shared-import-account').disabled=busy||!!ownSyncPending;
    document.querySelectorAll('#shared-rows input,#shared-rows button,#shared-group-members input,.boss-picker button,.boss-picker summary').forEach(function(n){if(n.tagName==='SUMMARY')n.inert=busy;else n.disabled=busy;});
  }
  function changed(){dirty=true;method='manual';stamp=new Date().toISOString();el('shared-save-state').textContent='저장 전';controls();}
  choices.forEach(function(c){var o=node('option',c.label);o.value=c.id;el('shared-add-boss').append(o);});visual.picker(document,el('shared-add-boss'),window.MapleBossDB);
  function renderProfile(){el('shared-profile').replaceChildren(profiles.render(document,character,name));}
  function render(){
    renderProfile();el('shared-source').hidden=!name;if(name)el('shared-source').href=data.resultUrl(name,'00000');
    el('shared-table').hidden=!rates.length;el('shared-rate-count').textContent=rates.length?String(rates.length):'';el('shared-rows').replaceChildren();
    rates.forEach(function(r){var tr=node('tr'),td=node('td'),input=node('input'),remove=node('button','×'),eligibility=node('td',r.eligibility||'—'),boss=node('td');boss.append(visual.create(document,r.bossId,window.MapleBossDB));if(shotIds.has(r.bossId))tr.className='shared-shot-applied';
      input.type='number';input.min='0';input.max='1000000000';input.step='0.01';input.value=r.percent===null?'':String(r.percent);input.setAttribute('aria-label',boss.textContent+' 배율');input.addEventListener('input',function(){r.percent=input.value.trim()===''?null:Number(input.value);r.eligibility='';eligibility.textContent='—';changed();});td.append(input);
      remove.type='button';remove.setAttribute('aria-label',boss.textContent+' 삭제');remove.addEventListener('click',function(){rates=rates.filter(function(v){return v!==r;});changed();render();});var action=node('td');action.append(remove);tr.append(boss,td,action);el('shared-rows').append(tr);
    });controls();
  }
  async function loadProfile(v,force){
    if(profileController)profileController.abort();profileController=new AbortController();
    var note=el('shared-profile-status');
    if(!force&&character&&character.image&&Date.now()-character.updatedAt<3600000){note.textContent='';return;}
    if(!window.NexonKey.has()){note.replaceChildren();if(!character){var link=node('a','API 키 등록');link.href='index.html#apiKey';note.append(link);}return;}
    note.textContent='캐릭터 정보 불러오는 중…';
    try{var found=await profileApi.load(name,profileController.signal);if(v!==version)return;character=found;renderProfile();note.textContent='';}
    catch(e){if(v!==version||e.name==='AbortError')return;note.textContent='캐릭터 정보 조회 실패';}
  }
  function open(value,forceProfile){
    if(dirty&&!window.confirm('저장하지 않은 수정이 있습니다. 다른 캐릭터를 선택할까요?')){el('shared-character').value=name;return;}
    if(value&&!data.validName(value)){say('캐릭터 닉네임을 확인하세요.',true);return;}
    version++;if(profileController)profileController.abort();name=value;var saved=store.snapshots.find(function(s){return s.characterName===name&&s.preset==='00000';});
    rates=saved?saved.rates.map(function(r){return {...r};}):[];revision=saved&&saved.revision||'';character=saved&&profiles.fresh(saved.character,name)||memberInfo(name)?.profile||null;method=saved&&saved.captureMethod||'manual';stamp=saved&&saved.fetchedAt||'';dirty=false;ownerDirty=false;shotIds.clear();
    el('shared-review').replaceChildren();el('shared-shot-status').textContent='';el('shared-profile-status').textContent='';el('shared-nickname').value='';el('shared-character').value=name;ownerOptions();renderGroupEditor();
    el('shared-save-state').textContent=saved?'저장됨 · '+new Date(saved.fetchedAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):name?'저장 전':'';
    say('');render();profilePending=name?loadProfile(version,forceProfile):null;if(!name)el('shared-nickname').focus();
  }
  async function refresh(){
    try{store=await catalog.published(fetch);accountOptions();
      el('shared-connection').textContent=store.persistent?'공유 중':'읽기 전용';el('shared-pin-label').hidden=!store.requiresPin;controls();return true;
    }catch(e){el('shared-connection').textContent='공용 저장소 연결 실패 · 작성 중인 값은 유지합니다.';store.persistent=false;controls();fail(e);return false;}
  }
  function mode(capture){el('shared-mode-fetch').setAttribute('aria-pressed',String(!capture));el('shared-mode-capture').setAttribute('aria-pressed',String(capture));el('shared-fetch-panel').hidden=capture;el('shared-capture').hidden=!capture;}
  el('shared-mode-fetch').addEventListener('click',function(){mode(false);});el('shared-mode-capture').addEventListener('click',function(){mode(true);});
  el('shared-open').addEventListener('submit',function(e){e.preventDefault();var value=el('shared-nickname').value.trim();if(value)open(value);});el('shared-character').addEventListener('change',function(){if(this.value)open(this.value);});
  el('shared-account').addEventListener('change',function(){if(dirty&&!window.confirm('저장하지 않은 수정이 있습니다. 다른 계정을 선택할까요?')){this.value=accountFilter;return;}dirty=false;accountFilter=this.value;characterOptions();var first=Array.from(el('shared-character').options).find(function(o){return o.value;});open(first?first.value:'');});
  el('shared-owner').addEventListener('change',function(){ownerLabel();dirty=true;ownerDirty=true;el('shared-save-state').textContent='계정 변경 · 저장 전';});el('shared-owner-label').addEventListener('input',function(){dirty=true;ownerDirty=true;el('shared-save-state').textContent='계정 이름 변경 · 저장 전';});
  el('shared-group-select').addEventListener('change',function(){groupEditId=this.value;groupDirty=false;renderGroupEditor();});el('shared-group-members').addEventListener('change',function(){groupDirty=true;});el('shared-group-label').addEventListener('input',function(){groupDirty=true;});
  el('shared-group-save').addEventListener('click',async function(){busy=true;controls();try{var members=Array.from(el('shared-group-members').querySelectorAll('input:checked')).map(function(n){var info=memberInfo(n.value),p=n.value===name&&character||info&&info.profile;return p?{name:n.value,profile:p}:{name:n.value};});if(!members.length)throw new Error('ACCOUNT_EMPTY');var id=groupEditId||crypto.randomUUID();await persistAccounts(accounts.assign(accountStore().accounts||[],id,el('shared-group-label').value.trim(),members));groupEditId=id;groupDirty=false;accountOptions();el('shared-group-status').textContent='계정 묶음을 저장했습니다.';toast('계정 묶음 저장 완료');try{localStorage.setItem('sharedBossRates.changed',String(Date.now()));}catch(e){}}catch(e){el('shared-group-status').textContent=e.message==='ACCOUNT_EMPTY'?'묶을 캐릭터를 선택하세요.':errors[e.message]||'계정 저장에 실패했습니다. 새로고침 후 다시 시도하세요.';}finally{busy=false;controls();}});
  el('shared-import-account').addEventListener('click',function(){syncOwnAccount(false);});
  el('shared-refresh').addEventListener('click',async function(){if(await refresh()){if(!dirty&&name)open(name,true);}});
  el('shared-add').addEventListener('click',function(){var id=el('shared-add-boss').value;if(rates.some(function(r){return r.bossId===id;})){say('이미 있는 보스·난이도입니다.',true);return;}rates.push({bossId:id,percent:null,eligibility:''});changed();render();});
  el('shared-fetch').addEventListener('click',async function(){
    if(dirty&&!window.confirm('작성 중인 배율을 환산 조회값으로 바꿀까요?'))return;var v=version;busy=true;controls();say('배율 불러오는 중…');
    try{var s=await catalog.fetchRemote(name,fetch);if(v!==version)return;rates=s.rates;shotIds.clear();changed();method=s.captureMethod||'browser-dom';stamp=s.fetchedAt;render();say(rates.length+'개 불러옴 · 저장 전');}catch(e){fail(e);}finally{busy=false;controls();}
  });
  el('shared-save').addEventListener('click',async function(){
    busy=true;controls();var ownerSaved=false;
    try{if(profilePending)await profilePending;var snapshot=catalog.snapshot(name,rates,method);if(stamp)snapshot.fetchedAt=stamp;if(character)snapshot.character=character;ownerSaved=await saveOwner();var saved=await catalog.saveShared(fetch,snapshot,revision,el('shared-pin').value);revision=saved.revision;dirty=false;ownerDirty=false;el('shared-save-state').textContent='✓ '+name+' 저장 완료 · '+new Date().toLocaleTimeString('ko-KR');try{localStorage.setItem('sharedBossRates.changed',String(Date.now()));}catch(e){}await refresh();say(name+' 배율을 저장했습니다.');toast(name+' 저장 완료');}catch(e){if(ownerSaved){accountOptions();say('계정 묶음은 저장했지만 배율 저장에 실패했습니다. 배율 입력값은 유지됩니다. '+(errors[e.message]||'다시 시도하세요.'),true);}else fail(e);}finally{busy=false;controls();}
  });
  async function readImage(file){
    if(busy)return;if(!name){say('먼저 캐릭터 닉네임을 검색하세요.',true);return;}
    if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024){say('15MB 이하 PNG, JPG, WebP 이미지를 선택하세요.',true);return;}
    busy=true;controls();var v=version;el('shared-shot-status').textContent='캡처 분석 중…';
    try{
      if(window.createImageBitmap){var bitmap=await createImageBitmap(file);var pixels=bitmap.width*bitmap.height;bitmap.close();if(pixels>12000000)throw new Error('IMAGE_SIZE');}
      var icons=Array.from(new Map(choices.map(function(c){return [c.name,{name:c.name,icon:c.icon}];})).values());
      var rows=catalog.shotRows(await window.BossShotReader.readBlob(file,icons),choices);if(v!==version)return;
      var sure=rows.filter(function(r){return r.selected;}),unresolved=rows.filter(function(r){return !r.selected;});
      if(sure.length){rates=catalog.applyShot(rates,sure,choices);shotIds=new Set(sure.map(function(r){return r.bossId;}));changed();method='screenshot';render();}
      el('shared-review').replaceChildren();unresolved.forEach(function(r){var item=node('div');if(r.thumb){var img=node('img');img.src=r.thumb;img.alt='확인이 필요한 카드';img.className='shared-thumb';item.append(img);}if(r.bossId)item.append(visual.create(document,r.bossId,window.MapleBossDB));item.append(node('span',r.note+' · 기존 값 유지'));el('shared-review').append(item);});
      el('shared-shot-status').textContent=sure.length+'개 배율 자동 반영'+(unresolved.length?' · '+unresolved.length+'개 확인 필요':'')+' · 저장 전';
    }catch(e){el('shared-shot-status').textContent=e.message==='IMAGE_SIZE'?'보스 카드 영역만 잘라 다시 선택하세요.':'인식하지 못했습니다. 선명한 보스 카드 캡처를 선택하세요.';}finally{busy=false;controls();}
  }
  el('shared-image').addEventListener('change',function(){readImage(this.files[0]);this.value='';});el('shared-drop').addEventListener('dragover',function(e){e.preventDefault();});el('shared-drop').addEventListener('drop',function(e){e.preventDefault();readImage(e.dataTransfer.files[0]);});
  document.addEventListener('paste',function(e){if(el('shared-capture').hidden)return;var item=Array.from(e.clipboardData.items).find(function(i){return i.kind==='file';});if(item){e.preventDefault();readImage(item.getAsFile());}});
  window.addEventListener('nexon-key-changed',function(){if(name)profilePending=loadProfile(version);syncOwnAccount(true);});window.addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue='';}});
  window.addEventListener('storage',function(e){if(e.key===window.NexonKey.STORAGE_KEY){if(name)profilePending=loadProfile(version);syncOwnAccount(true);}});
  render();refresh().then(function(ok){if(!ok)return;var wanted=new URLSearchParams(location.search).get('name');if(wanted&&data.validName(wanted))open(wanted);else if(store.snapshots[0])open(store.snapshots[0].characterName);syncOwnAccount(true);});
})();
