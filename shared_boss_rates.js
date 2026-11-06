(function(){
  'use strict';
  var el=function(id){return document.getElementById(id);},catalog=window.RateCatalog,data=window.ScouterData,choices=catalog.choices(window.MapleBossDB);
  var store={snapshots:[],persistent:false},name='',rates=[],revision='',method='manual',stamp='',dirty=false,busy=false,shot=[],version=0;
  var errors={RATE_DB_NOT_CONFIGURED:'공용 DB가 아직 연결되지 않았습니다. Vercel에서 Upstash를 연결해야 저장할 수 있습니다.',RATE_CONFLICT:'다른 사람이 먼저 수정했습니다. 작성값은 남겨 두었습니다. 목록 새로고침 후 해당 캐릭터를 다시 열어 최신 배율을 확인하세요.',RATE_PIN_REQUIRED:'기록 비밀번호를 확인하세요.',RATE_INVALID:'닉네임과 배율을 확인하세요.',RATE_LIMIT:'저장 한도를 초과했습니다.',SCOUTER_BLOCKED:'환산 사이트가 서버 조회를 차단했습니다. 아래 캡처 인식으로 입력할 수 있습니다.',SHOT_EMPTY:'반영할 카드를 선택하세요.',SHOT_DUPLICATE:'같은 보스·난이도를 중복 선택했습니다.',SHOT_REVIEW_REQUIRED:'선택한 카드의 보스·난이도와 숫자를 확인하세요.'};
  function node(tag,text){var n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
  function say(message,error){el('shared-status').textContent=message;el('shared-status').classList.toggle('shared-error',!!error);}
  function fail(e){say(errors[e.code]||errors[e.message]||'요청을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.',true);}
  function controls(){el('shared-fetch').disabled=busy||!name;el('shared-save').disabled=busy||!name||!rates.length||!store.persistent;el('shared-add').disabled=busy||!name;el('shared-image').disabled=busy||!name;el('shared-open').querySelector('button').disabled=busy;el('shared-character').disabled=busy;el('shared-refresh').disabled=busy;['shared-nickname','shared-add-boss','shared-confirm','shared-pin','shared-apply-shot'].forEach(function(id){el(id).disabled=busy;});document.querySelectorAll('#shared-rows input,#shared-rows button,#shared-review input,#shared-review select').forEach(function(n){n.disabled=busy;});}
  function changed(){dirty=true;method='manual';stamp=new Date().toISOString();el('shared-confirm').checked=false;el('shared-save-state').textContent='수정됨 · 아직 공용 저장 전';controls();}
  function options(selected,blank){var select=node('select');if(blank){var empty=node('option','보스·난이도 선택');empty.value='';select.append(empty);}choices.forEach(function(c){var o=node('option',c.label);o.value=c.id;select.append(o);});select.value=selected;return select;}
  choices.forEach(function(c){var o=node('option',c.label);o.value=c.id;el('shared-add-boss').append(o);});
  function render(){
    el('shared-name').textContent=name||'캐릭터를 선택하세요';el('shared-source').hidden=!name;if(name)el('shared-source').href=data.resultUrl(name,'00000');
    el('shared-table').hidden=!rates.length;el('shared-rows').replaceChildren();
    rates.forEach(function(r){var tr=node('tr'),label=choices.find(function(c){return c.id===r.bossId;}),td=node('td'),input=node('input'),remove=node('button','삭제');
      input.type='number';input.min='0';input.max='1000000000';input.step='0.01';input.value=r.percent===null?'':String(r.percent);input.setAttribute('aria-label',(label?label.label:r.bossId)+' 배율');input.addEventListener('input',function(){r.percent=input.value.trim()===''?null:Number(input.value);changed();});td.append(input);
      remove.type='button';remove.addEventListener('click',function(){rates=rates.filter(function(v){return v!==r;});changed();render();});var action=node('td');action.append(remove);tr.append(node('td',label?label.label:r.bossId),td,node('td',r.eligibility||'—'),action);el('shared-rows').append(tr);
    });controls();
  }
  function open(value){
    if(dirty&&!window.confirm('공용으로 저장하지 않은 수정이 있습니다. 다른 캐릭터를 열까요?'))return;
    if(!data.validName(value)){say('캐릭터 닉네임을 입력하세요.',true);return;}
    version++;name=value;var saved=store.snapshots.find(function(s){return s.characterName===name&&s.preset==='00000';});rates=saved?saved.rates.map(function(r){return {...r};}):[];revision=saved&&saved.revision||'';method=saved&&saved.captureMethod||'manual';stamp=saved&&saved.fetchedAt||'';dirty=false;shot=[];
    el('shared-review').replaceChildren();el('shared-review-table').hidden=true;el('shared-apply-shot').hidden=true;el('shared-shot-status').textContent='';el('shared-nickname').value=name;el('shared-character').value=saved?name:'';el('shared-confirm').checked=false;
    el('shared-save-state').textContent=saved?'저장된 배율 · '+new Date(saved.fetchedAt).toLocaleString('ko-KR'):'새 캐릭터 · 배율을 추가하세요.';say(saved?'저장된 배율 '+rates.length+'개를 열었습니다.':'환산 조회, 캡처 인식 또는 직접 입력으로 배율을 추가하세요.');render();
  }
  async function refresh(){
    try{store=await catalog.published(fetch);el('shared-character').replaceChildren();var first=node('option','새 캐릭터');first.value='';el('shared-character').append(first);store.snapshots.forEach(function(s){var o=node('option',s.characterName);o.value=s.characterName;el('shared-character').append(o);});el('shared-character').value=name;
      el('shared-connection').textContent=store.persistent?'모두와 공유 중 · 서버에 저장한 배율을 함께 사용합니다.':'공용 DB 연결 전 · 기존 공개 배율만 볼 수 있습니다. 새 배율 저장은 DB 연결 후 가능합니다.';el('shared-pin-label').hidden=!store.requiresPin;controls();return true;
    }catch(e){el('shared-connection').textContent='공용 저장소 연결 실패 · 작성 중인 값은 유지합니다.';store.persistent=false;controls();fail(e);return false;}
  }
  el('shared-open').addEventListener('submit',function(e){e.preventDefault();open(el('shared-nickname').value.trim());});
  el('shared-character').addEventListener('change',function(){if(this.value)open(this.value);else el('shared-nickname').focus();});
  el('shared-refresh').addEventListener('click',async function(){if(await refresh())say('목록을 새로 불러왔습니다. 캐릭터를 다시 열면 최신 배율이 반영됩니다.');});
  el('shared-add').addEventListener('click',function(){var id=el('shared-add-boss').value;if(rates.some(function(r){return r.bossId===id;})){say('이미 있는 보스·난이도입니다.',true);return;}rates.push({bossId:id,percent:null,eligibility:''});changed();render();});
  el('shared-fetch').addEventListener('click',async function(){
    if(dirty&&!window.confirm('작성 중인 배율을 환산 조회값으로 바꿀까요?'))return;
    var v=version;busy=true;controls();say('선택한 캐릭터 한 명의 환산 배율을 확인하는 중…');
    try{var s=await catalog.fetchRemote(name,fetch);if(v!==version)return;rates=s.rates;changed();method=s.captureMethod||'browser-dom';stamp=s.fetchedAt;render();say('배율 '+rates.length+'개를 불러왔습니다. 확인 후 공용으로 저장하세요.');}catch(e){fail(e);}finally{busy=false;controls();}
  });
  el('shared-save').addEventListener('click',async function(){
    if(!el('shared-confirm').checked){say('계산 조건과 배율 확인에 체크하세요.',true);return;}
    var snapshot;try{snapshot=catalog.snapshot(name,rates,method);if(stamp)snapshot.fetchedAt=stamp;}catch(e){fail(e);return;}
    busy=true;controls();
    try{var saved=await catalog.saveShared(fetch,snapshot,revision,el('shared-pin').value);revision=saved.revision;dirty=false;el('shared-save-state').textContent='공용 저장 완료 · 모든 사용자에게 반영';try{localStorage.setItem('sharedBossRates.changed',String(Date.now()));}catch(e){}await refresh();say(name+' 배율을 서버에 저장했습니다.');}catch(e){fail(e);}finally{busy=false;controls();}
  });
  function renderShot(){
    el('shared-review').replaceChildren();el('shared-review-table').hidden=!shot.length;el('shared-apply-shot').hidden=!shot.length;
    shot.forEach(function(r){var tr=node('tr'),check=node('input'),a=node('td'),b=node('td'),c=node('td'),d=node('td'),number=node('input'),select=options(r.bossId,true);check.type='checkbox';check.checked=r.selected;check.setAttribute('aria-label','카드 반영');check.addEventListener('change',function(){r.selected=check.checked;});a.append(check);if(r.thumb){var img=node('img');img.src=r.thumb;img.alt='인식한 보스 카드';img.className='shared-thumb';b.append(img);}c.append(select);select.setAttribute('aria-label','인식한 보스와 난이도');select.addEventListener('change',function(){r.bossId=select.value;});number.type='number';number.min='0';number.max='1000000000';number.step='0.01';number.value=r.value===null?'':String(r.value);number.setAttribute('aria-label','인식한 배율');number.addEventListener('input',function(){r.value=number.value.trim()===''?null:Number(number.value);});d.append(number);tr.append(a,b,c,d,node('td',r.note));el('shared-review').append(tr);});
  }
  async function readImage(file){
    if(busy)return;if(!name){say('먼저 캐릭터 닉네임을 지정하세요.',true);return;}
    if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024){say('15MB 이하의 PNG, JPG, WebP 이미지를 선택하세요.',true);return;}
    busy=true;controls();var v=version;el('shared-shot-status').textContent='캡처를 분석하는 중…';
    try{
      if(window.createImageBitmap){var bitmap=await createImageBitmap(file);var pixels=bitmap.width*bitmap.height;bitmap.close();if(pixels>12000000)throw new Error('IMAGE_SIZE');}
      var icons=Array.from(new Map(choices.map(function(c){return [c.name,{name:c.name,icon:c.icon}];})).values());
      var rows=await window.BossShotReader.readBlob(file,icons);if(v!==version)return;shot=catalog.shotRows(rows,choices);renderShot();el('shared-shot-status').textContent=shot.length+'개 카드 인식 · 체크된 항목과 숫자를 확인하세요. 불확실하거나 가려진 카드는 자동 선택하지 않습니다.';
    }catch(e){el('shared-shot-status').textContent=e.message==='IMAGE_SIZE'?'이미지가 너무 큽니다. 보스 카드 영역만 잘라 다시 선택하세요.':'인식하지 못했습니다. 보스 카드와 배율이 선명한 캡처로 다시 시도하세요.';}finally{busy=false;controls();}
  }
  el('shared-image').addEventListener('change',function(){readImage(this.files[0]);this.value='';});
  el('shared-drop').addEventListener('dragover',function(e){e.preventDefault();});el('shared-drop').addEventListener('drop',function(e){e.preventDefault();readImage(e.dataTransfer.files[0]);});
  el('shared-drop').addEventListener('paste',function(e){var item=Array.from(e.clipboardData.items).find(function(i){return i.kind==='file';});if(item){e.preventDefault();readImage(item.getAsFile());}});
  el('shared-apply-shot').addEventListener('click',function(){try{rates=catalog.applyShot(rates,shot,choices);changed();method='screenshot';render();say('선택한 배율을 반영했습니다. 확인 후 공용으로 저장하세요.');}catch(e){fail(e);}});
  window.addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue='';}});
  render();refresh().then(function(ok){if(!ok)return;var wanted=new URLSearchParams(location.search).get('name');if(wanted&&data.validName(wanted))open(wanted);else if(store.snapshots[0])open(store.snapshots[0].characterName);});
})();
