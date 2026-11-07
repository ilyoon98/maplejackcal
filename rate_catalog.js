(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?require('./scouter_data.js'):root.ScouterData);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RateCatalog=api;
})(typeof window!=='undefined'?window:globalThis,function(data){
  'use strict';
  var DIFF={Easy:'이지',Normal:'노멀',Hard:'하드',Chaos:'카오스',Extreme:'익스트림'};
  var ICON={Lotus:'suu',Damien:'damien',GuardianAngelSlime:'guardian_angel_slime',Lucid:'lucid',Will:'will',Dusk:'dusk',Dunkel:'dunkel',VerusHilla:'jin_hilla',BlackMage:'black_mage',ChosenSeren:'seren',KalosTheGuardian:'watcher_kalos',TheFirstAdversary:'first_challenger',Kaling:'kaling',Limbo:'limbo',Baldrix:'baldrix',RadiantMalefic:'radiant',Jupiter:'jupiter',Bellona:'vellona'};
  async function request(fetchImpl,url,options){var r=await fetchImpl(url,options),doc;try{doc=await r.json();}catch(e){throw new Error('RATE_STORE_UNAVAILABLE');}if(!r.ok)throw new Error(doc&&doc.error&&doc.error.code||'RATE_STORE_UNAVAILABLE');return doc;}
  async function published(fetchImpl,signal){var doc=await request(fetchImpl,'/api/boss-rates',{signal:signal,cache:'no-store'});if(!doc||doc.schemaVersion!==1||!Array.isArray(doc.snapshots))throw new Error('RATE_STORE_UNAVAILABLE');return doc;}
  async function saveShared(fetchImpl,snapshot,revision,pin){return (await request(fetchImpl,'/api/boss-rates',{method:'POST',headers:{'Content-Type':'application/json','x-rate-pin':pin||''},body:JSON.stringify({snapshot:snapshot,expectedRevision:revision||''})})).snapshot;}
  async function readSaved(name,fetchImpl,storage,signal){
    if(!data.validName(name))throw new Error('SCOUTER_BAD_INPUT');
    var found=data.findShared(await published(fetchImpl,signal),name,'00000');if(!found)throw new Error('RATE_NOT_SAVED');return found;
  }
  async function fetchRemote(name,fetchImpl,signal){
    if(!data.validName(name))throw new Error('SCOUTER_BAD_INPUT');
    var response=await fetchImpl('/api/scouter?'+new URLSearchParams({name:name,preset:'00000'}),{signal:signal});var body;try{body=await response.json();}catch(e){throw new Error('SCOUTER_UNAVAILABLE');}
    if(!response.ok){var err=new Error('SCOUTER_FAILED');err.code=body&&body.error&&body.error.code;throw err;}
    var snapshot=data.normalizeSnapshot(body,name,'00000');if(!snapshot)throw new Error('SCOUTER_INVALID_RESPONSE');return snapshot;
  }
  function choices(db){return Object.keys(db||{}).filter(function(id){return ICON[id]&&db[id]&&typeof db[id].Name==='string';}).flatMap(function(id){return Object.keys(DIFF).filter(function(diff){return db[id][diff]&&Number(db[id][diff].CrystalPrice)>0;}).map(function(diff){return {id:id+'|'+diff,name:db[id].Name,diff:DIFF[diff],label:DIFF[diff]+' '+db[id].Name,icon:'icons/boss/'+ICON[id]+'.webp'};});});}
  function shotRows(rows,catalog){
    var counts=new Map();(rows||[]).forEach(function(r){var matches=catalog.filter(function(c){return c.name===r.name&&c.diff===r.diff;});if(matches.length===1)counts.set(matches[0].id,(counts.get(matches[0].id)||0)+1);});
    var used=new Set();return (rows||[]).map(function(r){
      var matches=catalog.filter(function(c){return c.name===r.name&&c.diff===r.diff;}),id=matches.length===1?matches[0].id:'';
      var value=typeof r.value==='number'&&Number.isFinite(r.value)&&r.value>=0&&r.value<=1e9?r.value:null;
      var duplicate=id&&counts.get(id)>1,selected=!!id&&value!==null&&r.sure===true&&!r.covered&&!duplicate&&!used.has(id);if(selected)used.add(id);
      return {bossId:id,value:value,selected:selected,thumb:typeof r.thumb==='string'&&/^data:image\/(?:jpeg|png);base64,/.test(r.thumb)?r.thumb:'',note:duplicate?'중복 카드 · 직접 확인':r.covered?'가려진 카드 · 직접 확인':!id?'보스·난이도 선택 필요':value===null?'숫자 확인 필요':!r.sure?'인식 불확실 · 직접 확인':'인식됨'};
    });
  }
  function applyShot(current,rows,catalog){
    var out=new Map((current||[]).map(function(r){return [r.bossId,{...r}];})),seen=new Set(),allowed=new Set(catalog.map(function(c){return c.id;})),count=0;
    rows.filter(function(r){return r.selected;}).forEach(function(r){
      if(!allowed.has(r.bossId)||r.value===null||typeof r.value!=='number'||!Number.isFinite(r.value)||r.value<0||r.value>1e9)throw new Error('SHOT_REVIEW_REQUIRED');
      if(seen.has(r.bossId))throw new Error('SHOT_DUPLICATE');seen.add(r.bossId);out.set(r.bossId,{bossId:r.bossId,percent:r.value,eligibility:''});count++;
    });if(!count)throw new Error('SHOT_EMPTY');return Array.from(out.values());
  }
  function snapshot(name,rates,method,destinyChampion=method!=='screenshot'){
    var raw={schemaVersion:1,characterName:name,preset:'00000',sourceUrl:data.resultUrl(name,'00000'),fetchedAt:new Date().toISOString(),conditions:{view:'all',bossTimeMinutes:20,destinyChampion:destinyChampion,simulation:false},rates:rates,storage:'local-edit',captureMethod:method||'manual'};
    var valid=data.normalizeSnapshot(raw,name,'00000');if(!valid)throw new Error('RATE_INVALID');return valid;
  }
  return {published:published,saveShared:saveShared,readSaved:readSaved,fetchRemote:fetchRemote,choices:choices,shotRows:shotRows,applyShot:applyShot,snapshot:snapshot};
});
