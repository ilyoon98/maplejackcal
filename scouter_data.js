(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ScouterData=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  var BOSS={lotus:'Lotus',damien:'Damien',slime:'GuardianAngelSlime',lucid:'Lucid',will:'Will',gloom:'Dusk',darknell:'Dunkel',verusHilla:'VerusHilla',blackMage:'BlackMage',seren:'ChosenSeren',kalos:'KalosTheGuardian',adversary:'TheFirstAdversary',kaling:'Kaling',limbo:'Limbo',bardrix:'Baldrix',maleficStar:'RadiantMalefic',jupiter:'Jupiter',bellona:'Bellona'};
  var DIFFICULTY={easy:'Easy',normal:'Normal',hard:'Hard',chaos:'Chaos',extreme:'Extreme'};
  function validName(name){return typeof name==='string'&&/^[\p{L}\p{N}]{1,30}$/u.test(name);}
  function validPreset(preset){return typeof preset==='string'&&/^\d{5}$/.test(preset);}
  function resultUrl(name,preset){if(!validName(name)||!validPreset(preset))throw new Error('SCOUTER_BAD_INPUT');return 'https://maplescouter.com/ko/result?'+new URLSearchParams({name:name,preset:preset});}
  function bossId(icon){var m=typeof icon==='string'&&icon.match(/^\/bossIcon\/([a-z]+)_([A-Za-z]+)\.png$/);return m&&DIFFICULTY[m[1]]&&BOSS[m[2]]?BOSS[m[2]]+'|'+DIFFICULTY[m[1]]:null;}
  function percent(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e9?value:null;}
  function imageUrl(value){
    try{
      var url=new URL(value);
      if(url.username||url.password)return '';
      if(url.origin==='https://open.api.nexon.com'&&/^\/static\/maplestory\/character\/look\/[A-Za-z0-9]+$/.test(url.pathname))return url.href;
      if(url.origin==='https://avatar.maplestory.nexon.com'&&/^\/CharacterEx\/180\/[A-Z]+\.png$/.test(url.pathname)&&!url.search&&!url.hash)return url.href;
    }catch(e){}
    return '';
  }
  function publicCharacter(raw,name){
    if(!raw||raw.name!==name||!validName(name)||typeof raw.world!=='string'||typeof raw.job!=='string'||!Number.isInteger(raw.level)||raw.level<1||raw.level>400||!Number.isFinite(raw.updatedAt)||raw.updatedAt>Date.now()+60000)return null;
    return {name:name,world:raw.world.slice(0,30),job:raw.job.slice(0,50),level:raw.level,image:imageUrl(raw.image),updatedAt:raw.updatedAt};
  }
  function mergeCharacter(first,second){
    var cutoff=Date.now()-30*86400000;
    if(first&&first.updatedAt<=cutoff)first=null;
    if(second&&second.updatedAt<=cutoff)second=null;
    if(!first)return second||null;
    if(second&&second.updatedAt>first.updatedAt)[first,second]=[second,first];
    return first&&!first.image&&second&&second.image?{...first,image:second.image}:first;
  }
  function rowsToRates(rows){
    var rates=[],unmapped=[],seen=new Set();
    (Array.isArray(rows)?rows:[]).forEach(function(row){
      var id=bossId(row.icon);if(!id){if(typeof row.icon==='string')unmapped.push(row.icon);return;}
      if(seen.has(id))throw new Error('SCOUTER_AMBIGUOUS_ROWS');
      var n=percent(row.percent);if(n===null)throw new Error('SCOUTER_INVALID_PERCENT');seen.add(id);
      rates.push({bossId:id,percent:n,eligibility:typeof row.eligibility==='string'?row.eligibility.slice(0,30):''});
    });
    if(!rates.length)throw new Error('SCOUTER_NO_RATES');return {rates:rates,unmapped:unmapped};
  }
  function normalizeSnapshot(raw,name,preset){
    if(!raw||raw.schemaVersion!==1||raw.characterName!==name||raw.preset!==preset||!validName(name)||!validPreset(preset))return null;
    if(raw.sourceUrl!==resultUrl(name,preset)||!Number.isFinite(Date.parse(raw.fetchedAt))||Date.parse(raw.fetchedAt)>Date.now()+60000)return null;
    var c=raw.conditions;if(!c||c.view!=='all'||c.bossTimeMinutes!==20||c.simulation!==false||typeof c.destinyChampion!=='boolean')return null;
    if(!Array.isArray(raw.rates)||raw.rates.length===0||raw.rates.length>100)return null;
    var seen=new Set(),rates=[];
    for(var row of raw.rates){if(!row||typeof row.bossId!=='string'||!Object.values(BOSS).some(function(b){return Object.values(DIFFICULTY).some(function(d){return row.bossId===b+'|'+d;});})||seen.has(row.bossId)||percent(row.percent)===null)return null;seen.add(row.bossId);rates.push({bossId:row.bossId,percent:row.percent,eligibility:typeof row.eligibility==='string'?row.eligibility.slice(0,30):''});}
    var snapshot={schemaVersion:1,characterName:name,preset:preset,sourceUrl:raw.sourceUrl,fetchedAt:raw.fetchedAt,conditions:{view:'all',bossTimeMinutes:20,destinyChampion:c.destinyChampion,simulation:false},rates:rates};
    if(['public-json','local-edit','shared-server'].includes(raw.storage))snapshot.storage=raw.storage;
    if(['browser-dom','screenshot','manual'].includes(raw.captureMethod))snapshot.captureMethod=raw.captureMethod;
    var character=publicCharacter(raw.character,name);if(character)snapshot.character=character;
    return snapshot;
  }
  function findShared(store,name,preset){
    if(!store||store.schemaVersion!==1||!Array.isArray(store.snapshots))return null;
    var found=store.snapshots.find(function(s){return s&&s.characterName===name&&s.preset===preset;});
    var snapshot=normalizeSnapshot(found,name,preset);
    if(!snapshot||Date.now()-Date.parse(snapshot.fetchedAt)>=30*86400000)return null;
    snapshot.storage='public-json';return snapshot;
  }
  return {validName:validName,validPreset:validPreset,resultUrl:resultUrl,bossId:bossId,rowsToRates:rowsToRates,normalizeSnapshot:normalizeSnapshot,findShared:findShared,imageUrl:imageUrl,publicCharacter:publicCharacter,mergeCharacter:mergeCharacter};
});
