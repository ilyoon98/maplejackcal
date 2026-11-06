(function(){
  'use strict';
  var el=function(id){return document.getElementById(id);},catalog=window.RateCatalog,data=window.ScouterData,profiles=window.CharacterProfile,visual=window.BossIdentity,choices=catalog.choices(window.MapleBossDB);
  var store={snapshots:[],persistent:false},name='',rates=[],revision='',method='manual',stamp='',character=null,dirty=false,busy=false,version=0,profileController=null,profilePending=null,shotIds=new Set();
  var profileApi=profiles.client(fetch,function(){return window.NexonKey.get();});
  var errors={RATE_DB_NOT_CONFIGURED:'공용 DB가 아직 연결되지 않았습니다.',RATE_CONFLICT:'다른 사람이 먼저 수정했습니다. 작성값은 유지했습니다. 목록을 새로고침한 뒤 캐릭터를 다시 선택하세요.',RATE_PIN_REQUIRED:'기록 비밀번호를 확인하세요.',RATE_INVALID:'닉네임과 배율을 확인하세요.',RATE_LIMIT:'저장 한도를 초과했습니다.',SCOUTER_BLOCKED:'환산 사이트가 서버 조회를 차단했습니다. 캡처 입력으로 등록할 수 있습니다.'};
  function node(tag,text){var n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
  function say(message,error){el('shared-status').textContent=message;el('shared-status').classList.toggle('shared-error',!!error);}
  function fail(e){say(errors[e.code]||errors[e.message]||'요청을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.',true);}
  function controls(){
    el('shared-fetch').disabled=busy||!name;el('shared-save').disabled=busy||!name||!rates.length||!store.persistent;el('shared-add').disabled=busy||!name;el('shared-image').disabled=busy||!name;el('shared-open').querySelector('button').disabled=busy;
    ['shared-character','shared-refresh','shared-nickname','shared-add-boss','shared-pin','shared-mode-fetch','shared-mode-capture'].forEach(function(id){el(id).disabled=busy;});
    document.querySelectorAll('#shared-rows input,#shared-rows button,.boss-picker button,.boss-picker summary').forEach(function(n){if(n.tagName==='SUMMARY')n.inert=busy;else n.disabled=busy;});
  }
  function changed(){dirty=true;method='manual';stamp=new Date().toISOString();el('shared-save-state').textContent='수정됨 · 아직 공용 저장 전';controls();}
  choices.forEach(function(c){var o=node('option',c.label);o.value=c.id;el('shared-add-boss').append(o);});visual.picker(document,el('shared-add-boss'),window.MapleBossDB);
  function renderProfile(){el('shared-profile').replaceChildren(profiles.render(document,character,name));}
  function render(){
    renderProfile();el('shared-source').hidden=!name;if(name)el('shared-source').href=data.resultUrl(name,'00000');
    el('shared-table').hidden=!rates.length;el('shared-rows').replaceChildren();
    rates.forEach(function(r){var tr=node('tr'),td=node('td'),input=node('input'),remove=node('button','삭제'),eligibility=node('td',r.eligibility||'—'),boss=node('td');boss.append(visual.create(document,r.bossId,window.MapleBossDB));if(shotIds.has(r.bossId))tr.className='shared-shot-applied';
      input.type='number';input.min='0';input.max='1000000000';input.step='0.01';input.value=r.percent===null?'':String(r.percent);input.setAttribute('aria-label',boss.textContent+' 배율');input.addEventListener('input',function(){r.percent=input.value.trim()===''?null:Number(input.value);r.eligibility='';eligibility.textContent='—';changed();});td.append(input);
      remove.type='button';remove.addEventListener('click',function(){rates=rates.filter(function(v){return v!==r;});changed();render();});var action=node('td');action.append(remove);tr.append(boss,td,eligibility,action);el('shared-rows').append(tr);
    });controls();
  }
  async function loadProfile(v){
    if(profileController)profileController.abort();profileController=new AbortController();
    var note=el('shared-profile-status');
    if(!window.NexonKey.has()){note.replaceChildren(node('span',character?'저장된 캐릭터 정보입니다. ':'레벨·서버·외형을 조회하려면 '));var link=node('a','홈에서 넥슨 API 키 등록');link.href='index.html#apiKey';note.append(link);return;}
    note.textContent='캐릭터 정보 불러오는 중…';
    try{var found=await profileApi.load(name,profileController.signal);if(v!==version)return;character=found;renderProfile();note.textContent='Data based on NEXON Open API';}
    catch(e){if(v!==version||e.name==='AbortError')return;note.textContent='캐릭터 정보를 가져오지 못했습니다. 닉네임과 홈의 API 키를 확인하세요.';}
  }
  function open(value){
    if(dirty&&!window.confirm('저장하지 않은 수정이 있습니다. 다른 캐릭터를 선택할까요?')){el('shared-character').value=name;return;}
    if(value&&!data.validName(value)){say('캐릭터 닉네임을 확인하세요.',true);return;}
    version++;if(profileController)profileController.abort();name=value;var saved=store.snapshots.find(function(s){return s.characterName===name&&s.preset==='00000';});
    rates=saved?saved.rates.map(function(r){return {...r};}):[];revision=saved&&saved.revision||'';character=saved&&profiles.fresh(saved.character,name)||null;method=saved&&saved.captureMethod||'manual';stamp=saved&&saved.fetchedAt||'';dirty=false;shotIds.clear();
    el('shared-review').replaceChildren();el('shared-shot-status').textContent='';el('shared-profile-status').textContent='';el('shared-nickname').value=name;el('shared-character').value=saved?name:'';el('shared-open').hidden=!!saved;
    el('shared-save-state').textContent=saved?'저장된 배율 · '+new Date(saved.fetchedAt).toLocaleString('ko-KR'):'새 캐릭터 · 배율을 추가하세요.';
    say(saved?'저장된 배율 '+rates.length+'개':name?'환산 불러오기 또는 캡처로 배율을 등록하세요.':'새 캐릭터의 닉네임을 검색하세요.');render();profilePending=name?loadProfile(version):null;if(!name)el('shared-nickname').focus();
  }
  async function refresh(){
    try{store=await catalog.published(fetch);el('shared-character').replaceChildren();var first=node('option','+ 새 캐릭터 추가');first.value='';el('shared-character').append(first);store.snapshots.forEach(function(s){var c=profiles.fresh(s.character,s.characterName),o=node('option',s.characterName+(c?' · '+c.world+' · Lv.'+c.level:''));o.value=s.characterName;el('shared-character').append(o);});el('shared-character').value=name;
      el('shared-connection').textContent=store.persistent?'모두와 공유 중':'공용 DB 연결 전 · 기존 배율만 볼 수 있습니다.';el('shared-pin-label').hidden=!store.requiresPin;controls();return true;
    }catch(e){el('shared-connection').textContent='공용 저장소 연결 실패 · 작성 중인 값은 유지합니다.';store.persistent=false;controls();fail(e);return false;}
  }
  function mode(capture){el('shared-mode-fetch').setAttribute('aria-pressed',String(!capture));el('shared-mode-capture').setAttribute('aria-pressed',String(capture));el('shared-fetch-panel').hidden=capture;el('shared-capture').hidden=!capture;}
  el('shared-mode-fetch').addEventListener('click',function(){mode(false);});el('shared-mode-capture').addEventListener('click',function(){mode(true);});
  el('shared-open').addEventListener('submit',function(e){e.preventDefault();open(el('shared-nickname').value.trim());});el('shared-character').addEventListener('change',function(){open(this.value);});
  el('shared-refresh').addEventListener('click',async function(){if(await refresh()){if(!dirty&&name)open(name);else say('캐릭터 목록을 새로 불러왔습니다.');}});
  el('shared-add').addEventListener('click',function(){var id=el('shared-add-boss').value;if(rates.some(function(r){return r.bossId===id;})){say('이미 있는 보스·난이도입니다.',true);return;}rates.push({bossId:id,percent:null,eligibility:''});changed();render();});
  el('shared-fetch').addEventListener('click',async function(){
    if(dirty&&!window.confirm('작성 중인 배율을 환산 조회값으로 바꿀까요?'))return;var v=version;busy=true;controls();say('배율 불러오는 중…');
    try{var s=await catalog.fetchRemote(name,fetch);if(v!==version)return;rates=s.rates;shotIds.clear();changed();method=s.captureMethod||'browser-dom';stamp=s.fetchedAt;render();say('배율 '+rates.length+'개를 불러왔습니다. 공용으로 저장하면 파티에 반영됩니다.');}catch(e){fail(e);}finally{busy=false;controls();}
  });
  el('shared-save').addEventListener('click',async function(){
    busy=true;controls();
    try{if(profilePending)await profilePending;var snapshot=catalog.snapshot(name,rates,method);if(stamp)snapshot.fetchedAt=stamp;if(character)snapshot.character=character;var saved=await catalog.saveShared(fetch,snapshot,revision,el('shared-pin').value);revision=saved.revision;dirty=false;el('shared-save-state').textContent='공용 저장 완료';try{localStorage.setItem('sharedBossRates.changed',String(Date.now()));}catch(e){}await refresh();el('shared-open').hidden=true;say(name+' 배율을 저장했습니다.');}catch(e){fail(e);}finally{busy=false;controls();}
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
      el('shared-shot-status').textContent=sure.length+'개 배율 자동 반영'+(unresolved.length?' · '+unresolved.length+'개 확인 필요':'')+' · 아래 표에서 수정하고 공용으로 저장하세요.';
    }catch(e){el('shared-shot-status').textContent=e.message==='IMAGE_SIZE'?'보스 카드 영역만 잘라 다시 선택하세요.':'인식하지 못했습니다. 선명한 보스 카드 캡처를 선택하세요.';}finally{busy=false;controls();}
  }
  el('shared-image').addEventListener('change',function(){readImage(this.files[0]);this.value='';});el('shared-drop').addEventListener('dragover',function(e){e.preventDefault();});el('shared-drop').addEventListener('drop',function(e){e.preventDefault();readImage(e.dataTransfer.files[0]);});
  document.addEventListener('paste',function(e){if(el('shared-capture').hidden)return;var item=Array.from(e.clipboardData.items).find(function(i){return i.kind==='file';});if(item){e.preventDefault();readImage(item.getAsFile());}});
  window.addEventListener('nexon-key-changed',function(){if(name)profilePending=loadProfile(version);});window.addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue='';}});
  window.addEventListener('storage',function(e){if(e.key===window.NexonKey.STORAGE_KEY&&name)profilePending=loadProfile(version);});
  render();refresh().then(function(ok){if(!ok)return;var wanted=new URLSearchParams(location.search).get('name');if(wanted&&data.validName(wanted))open(wanted);else if(store.snapshots[0])open(store.snapshots[0].characterName);});
})();
