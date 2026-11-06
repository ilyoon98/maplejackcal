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
    var el=function(id){return doc.getElementById(id);},choices=catalog(win.MapleBossDB),parties=[],selected='',current=null,owned=new Set(),accountLoading=false,snapshots=Object.create(null),rateStates=Object.create(null);
    var profileController=null,accountController=null,profileVersion=0,accountVersion=0;
    var api=client(win.fetch.bind(win),function(){return win.NexonKey&&win.NexonKey.get();});
    var multiplierApi=scouterClient(win.fetch.bind(win));
    try{var saved=JSON.parse(win.localStorage.getItem(STORAGE)||'{}');parties=restore(saved,choices);parties.forEach(function(p){p.members.forEach(function(m){var c=m.character,raw=saved.snapshots&&saved.snapshots[c.ocid],value=scouter.normalizeSnapshot(raw,c.name,'00000');if(value)snapshots[c.ocid]=value;});});}catch(e){}
    function node(tag,cls,label){var n=doc.createElement(tag);if(cls)n.className=cls;if(label!=null)n.textContent=label;return n;}
    function status(message,error){el('party-search-status').textContent=message||'';el('party-search-status').classList.toggle('error',!!error);}
    function persist(){try{var retained=Object.create(null);parties.forEach(function(p){p.members.forEach(function(m){if(snapshots[m.character.ocid])retained[m.character.ocid]=snapshots[m.character.ocid];});});win.localStorage.setItem(STORAGE,JSON.stringify({parties:parties,snapshots:retained}));el('party-storage-status').textContent='';}catch(e){el('party-storage-status').textContent='브라우저에 저장하지 못했습니다. 현재 화면에서만 유지됩니다.';}}
    function snapshotFor(c){var s=snapshots[c.ocid];return s&&s.characterName===c.name?s:null;}
    function makeMember(c,bossId){var s=snapshotFor(c),r=s&&s.rates.find(function(row){return row.bossId===bossId;});return {character:Object.assign({},c),rate:r?r.percent:null,rateMode:'auto',rateUpdatedAt:s?s.fetchedAt:''};}
    function timeLabel(value){return new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});}
    function portrait(c){
      var box=node('div','party-portrait'),fallback=node('span','',c.image?'이미지 로딩 중':'외형 없음');box.appendChild(fallback);
      // API 캐시가 30일 이상 된 이미지는 다시 검색하기 전까지 표시하지 않는다.
      if(c.image&&Date.now()-c.updatedAt<30*86400000){var img=node('img');img.alt=c.name+' 캐릭터 외형';img.referrerPolicy='no-referrer';img.addEventListener('load',function(){fallback.hidden=true;});img.addEventListener('error',function(){img.hidden=true;fallback.hidden=false;fallback.textContent='외형 로드 실패';});img.src=c.image;box.appendChild(img);}else fallback.textContent=c.image?'외형 새로고침':'외형 없음';
      return box;
    }
    function renderPreview(){
      var host=el('party-character-preview');host.replaceChildren();
      if(!current){host.appendChild(node('p','party-note','캐릭터를 선택하면 현재 외형이 표시됩니다.'));return;}
      host.append(portrait(current),node('strong','',current.name),node('p','party-note',current.world+' · Lv.'+current.level+' · '+current.job));
      var s=snapshotFor(current),state=rateStates[current.ocid],note=node('p','party-note',state==='loading'?'환산 배율 조회 중…':state==='error'?(s?'환산 조회 실패 · 이전 조회값 유지':'환산 배율 조회 실패'):s?(s.storage==='public-json'?'공용 저장값 ':'환산 ')+s.rates.length+'개 · '+timeLabel(s.fetchedAt):'환산 배율 미조회');if(state==='error')note.classList.toggle('error',true);host.appendChild(note);
      var link=node('a','','공용 배율 설정 · 캡처 입력');link.href='shared_boss_rates.html?'+new URLSearchParams({name:current.name});link.target='_blank';link.rel='noopener noreferrer';host.appendChild(link);
    }
    function visible(){return parties.filter(function(p){return el('party-view').value!=='mine'||p.members.some(function(m){return owned.has(m.character.ocid);});});}
    function renderBoard(){
      var list=el('party-list'),detail=el('party-detail'),shown=visible();list.replaceChildren();detail.replaceChildren();
      if(!shown.some(function(p){return p.id===selected;}))selected=shown[0]?shown[0].id:'';
      shown.forEach(function(p){var button=node('button'),s=summary(p.members),boss=choices.find(function(c){return c.id===p.bossId;});button.type='button';button.setAttribute('aria-pressed',String(p.id===selected));button.append(node('strong','',boss.label),node('span','',p.name),node('small','',(p.schedule||'일정 미정')+' · '+p.members.length+'/'+boss.max+'명'),node('small','',s.total.toLocaleString('ko-KR',{maximumFractionDigits:2})+'%'+(s.missing?' + '+s.missing+'명 미입력':'')));button.addEventListener('click',function(){selected=p.id;renderBoard();});list.appendChild(button);});
      var p=parties.find(function(item){return item.id===selected;});
      if(!p){detail.appendChild(node('p','party-empty',el('party-view').value==='mine'?(accountLoading?'내 계정 캐릭터를 확인하는 중입니다.':'내 캐릭터가 포함된 파티가 없습니다. 계정 목록을 불러왔는지 확인하세요.'):'파티를 만들고 검색한 캐릭터를 추가하세요.'));return;}
      var boss=choices.find(function(c){return c.id===p.bossId;}),s=summary(p.members),head=node('div','party-search-row'),add=node('button','party-primary','검색한 캐릭터 추가');add.type='button';add.disabled=!current;add.addEventListener('click',function(){
        if(!current)return;
        if(p.members.some(function(m){return m.character.ocid===current.ocid;})){status('이미 이 파티에 있는 캐릭터입니다.',true);return;}
        if(p.members.length>=boss.max){status('이 보스·난이도는 최대 '+boss.max+'명까지 구성할 수 있습니다.',true);return;}
        p.members.push(makeMember(current,p.bossId));persist();renderBoard();status(current.name+' 캐릭터를 파티에 추가했습니다.');
      });head.append(node('h3','',boss.label+' · '+p.name),add);detail.appendChild(head);
      var total=node('div','party-total'),values=node('div');values.append(node('p','party-note',p.members.some(function(m){return m.rateMode==='manual';})?'환산 / 직접 입력 배율 합계':'개인 환산 배율 합계'),node('output','',s.total.toLocaleString('ko-KR',{maximumFractionDigits:2})+'%'));if(s.missing)values.appendChild(node('p','party-note',s.missing+'명 미조회·미입력 · 부분 합계'));total.append(values,node('span','party-note',p.schedule||'일정 미정'));detail.appendChild(total);
      detail.appendChild(node('p','party-note','환산 기본 프리셋 · 보스 시간 20분 · 데스티니/유챔 확인 켬'));
      if(!p.members.length)detail.appendChild(node('p','party-empty','캐릭터를 검색한 뒤 위 버튼으로 추가하세요.'));
      p.members.forEach(function(m){var row=node('div','party-member'),info=node('div'),label=node('label'),input=node('input'),remove=node('button','','빼기');
        info.append(node('strong','',m.character.name),node('p','',m.character.world+' · '+m.character.job));
        var state=rateStates[m.character.ocid],snap=snapshotFor(m.character),sourceRow=snap&&snap.rates.find(function(r){return r.bossId===p.bossId;}),sourceLabel=m.rateMode==='manual'?'직접 입력':state==='loading'?'환산 조회 중':state==='error'?'조회 실패'+(m.rate===null?' · 미조회':' · 이전 값'):snap&&!sourceRow?'환산 미제공 보스·난이도':m.rateUpdatedAt?'환산 '+timeLabel(m.rateUpdatedAt):'환산 미조회';if(m.rateMode!=='manual'&&sourceRow&&sourceRow.eligibility)sourceLabel+=' · '+sourceRow.eligibility;info.appendChild(node('p','party-rate-source',sourceLabel));
        label.append(node('output','',m.rate===null?'미등록':m.rate.toLocaleString('ko-KR',{maximumFractionDigits:2})+'%'));var manage=node('a','','공용 배율 설정');manage.href='shared_boss_rates.html?'+new URLSearchParams({name:m.character.name});manage.target='_blank';manage.rel='noopener noreferrer';info.appendChild(manage);
        remove.type='button';remove.setAttribute('aria-label',m.character.name+' 파티에서 빼기');remove.addEventListener('click',function(){p.members=p.members.filter(function(item){return item!==m;});persist();renderBoard();});row.append(portrait(m.character),info,label,remove);detail.appendChild(row);
      });
    }
    async function loadScouter(c,version,signal){
      if(signal&&signal.aborted||rateStates[c.ocid]==='loading')return;rateStates[c.ocid]='loading';renderPreview();renderBoard();
      try{var snapshot=await multiplierApi.load(c.name,signal);if(version!==profileVersion||!current||current.ocid!==c.ocid)return;snapshots[c.ocid]=snapshot;applySnapshot(parties,c.ocid,snapshot,true);rateStates[c.ocid]='ready';persist();status(c.name+' 공용 저장 배율 '+snapshot.rates.length+'개를 반영했습니다. 조회 시각: '+timeLabel(snapshot.fetchedAt));}
      catch(e){if(version!==profileVersion||e.name==='AbortError')return;rateStates[c.ocid]='error';status(e.message==='RATE_NOT_SAVED'?'이 캐릭터의 공용 배율이 없거나 30일 이상 지났습니다. ‘공용 배율 설정’에서 저장하세요.':'공용 배율을 읽지 못했습니다. 연결을 확인하세요. 기존 배율은 유지됩니다.',true);}
      finally{if(version===profileVersion){renderPreview();renderBoard();}}
    }
    async function search(target){
      if(current&&rateStates[current.ocid]==='loading')delete rateStates[current.ocid];
      if(profileController)profileController.abort();profileController=new AbortController();var signal=profileController.signal,version=++profileVersion;current=null;renderPreview();renderBoard();status('캐릭터 외형을 불러오는 중…');el('party-search-button').disabled=true;
      try{var c=await api.load(target,signal);if(version!==profileVersion)return;current=c;el('party-character-name').value=c.name;
        parties.forEach(function(p){p.members.forEach(function(m){if(m.character.ocid===c.ocid)m.character=Object.assign({},c);});});persist();renderPreview();renderBoard();await loadScouter(c,version,signal);
      }catch(e){if(version!==profileVersion||e.name==='AbortError')return;var msg=e.message==='API_KEY_REQUIRED'?'홈에서 넥슨 Open API 키를 등록하세요.':e.code==='OPENAPI00005'?'API 키가 유효하지 않습니다. 홈에서 키를 확인하세요.':e.code==='OPENAPI00007'?'API 호출 한도를 초과했습니다. 잠시 후 다시 검색하세요.':'캐릭터를 불러오지 못했습니다. 닉네임·API 키·네트워크를 확인하세요.';status(msg,true);
      }finally{if(version===profileVersion)el('party-search-button').disabled=false;}
    }
    async function loadAccount(){
      if(accountController)accountController.abort();accountController=new AbortController();var signal=accountController.signal,version=++accountVersion;
      owned=new Set();accountLoading=true;var select=el('party-my-character');select.replaceChildren(node('option','','계정 캐릭터를 불러오는 중…'));select.disabled=true;renderBoard();
      var has=win.NexonKey&&win.NexonKey.has();el('party-key-state').replaceChildren(doc.createTextNode(has?'홈에 등록한 API 키를 사용합니다. ':'API 키가 필요합니다. '));var link=node('a','',has?'키 변경':'홈에서 API 키 등록');link.href='index.html#apiKey';el('party-key-state').appendChild(link);
      try{var chars=await win.NexonCharacters.fetch({signal:signal});if(version!==accountVersion)return;select.replaceChildren();var placeholder=node('option','','내 캐릭터 선택');placeholder.value='';select.appendChild(placeholder);
        chars.forEach(function(c){owned.add(c.ocid);var option=node('option','',c.world+' · '+c.name+' · Lv.'+c.level);option.value=c.ocid;option.dataset.name=c.name;select.appendChild(option);});select.disabled=!chars.length;
        if(!chars.length)status('이 계정에서 조회할 수 있는 캐릭터가 없습니다.');
        if(!current&&chars[0]){select.value=chars[0].ocid;search({ocid:chars[0].ocid});}
      }catch(e){if(version!==accountVersion||e.name==='AbortError')return;select.replaceChildren(node('option','','계정 목록 조회 불가 · 닉네임 검색 가능'));if(has)status('계정 목록을 불러오지 못했습니다. 닉네임 검색은 계속 사용할 수 있습니다.',true);
      }finally{if(version===accountVersion){accountLoading=false;renderBoard();}}
    }
    choices.forEach(function(c){var option=node('option','',c.label+' · 최대 '+c.max+'명');option.value=c.id;el('party-boss').appendChild(option);});
    el('party-search-form').addEventListener('submit',function(e){e.preventDefault();var name=el('party-character-name').value.trim();if(name)search({name:name});});
    el('party-my-character').addEventListener('change',function(){if(this.value)search({ocid:this.value});});
    el('party-reload-account').addEventListener('click',loadAccount);
    el('party-view').addEventListener('change',renderBoard);
    el('party-create-toggle').addEventListener('click',function(){var form=el('party-create-form');form.hidden=!form.hidden;this.setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)el('party-name').focus();});
    el('party-create-form').addEventListener('submit',function(e){e.preventDefault();if(parties.length>=200){status('이 브라우저에는 최대 200개 파티를 저장할 수 있습니다.',true);return;}
      var p={id:win.crypto.randomUUID(),name:text(el('party-name').value,60),bossId:el('party-boss').value,schedule:text(el('party-schedule').value,80),members:current?[makeMember(current,el('party-boss').value)]:[]};
      if(!p.name||!choices.some(function(c){return c.id===p.bossId;}))return;parties.push(p);selected=p.id;el('party-view').value='all';persist();renderBoard();e.target.reset();e.target.hidden=true;el('party-create-toggle').setAttribute('aria-expanded','false');
    });
    function keyChanged(){profileVersion++;if(profileController)profileController.abort();current=null;rateStates=Object.create(null);el('party-search-button').disabled=false;renderPreview();status('');loadAccount();}
    win.addEventListener('nexon-key-changed',keyChanged);
    async function syncSaved(){
      try{var response=await win.fetch('/api/boss-rates',{cache:'no-store'});if(!response.ok)return;var saved=await response.json(),chars=new Map();parties.forEach(function(p){p.members.forEach(function(m){chars.set(m.character.ocid,m.character);});});if(current)chars.set(current.ocid,current);chars.forEach(function(c){var s=scouter.findShared(saved,c.name,'00000');if(s){snapshots[c.ocid]=s;applySnapshot(parties,c.ocid,s,true);rateStates[c.ocid]='ready';}});persist();renderBoard();renderPreview();}catch(e){}
    }
    win.addEventListener('storage',function(e){if(win.NexonKey&&e.key===win.NexonKey.STORAGE_KEY)keyChanged();else if(e.key==='sharedBossRates.changed')syncSaved();});
    win.addEventListener('focus',syncSaved);
    if(win.setInterval)win.setInterval(function(){if(!doc.hidden)syncSaved();},30000);
    renderBoard();loadAccount();syncSaved();
  }
  return {imageUrl:imageUrl,profile:profile,summary:summary,catalog:catalog,restore:restore,client:client,scouterClient:scouterClient,applySnapshot:applySnapshot,mount:mount};
});
