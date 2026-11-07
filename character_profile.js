(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?require('./scouter_data.js'):root.ScouterData);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CharacterProfile=api;
})(typeof window!=='undefined'?window:globalThis,function(data){
  'use strict';
  function client(fetchImpl,getKey){
    async function get(path,params,signal){
      var key=getKey();if(!key)throw new Error('API_KEY_REQUIRED');if(signal&&signal.aborted)throw new DOMException('Aborted','AbortError');
      var response=await fetchImpl('https://open.api.nexon.com/maplestory/v1'+path+'?'+new URLSearchParams(params),{headers:{'x-nxopen-api-key':key},signal:signal});
      var body=await response.json();if(!response.ok){var e=new Error('NEXON_API_ERROR');e.code=body&&body.error&&body.error.name;throw e;}return body;
    }
    return {load:async function(name,signal){
      if(!data.validName(name))throw new Error('PROFILE_INVALID');
      var id=await get('/id',{character_name:name},signal);if(!id||typeof id.ocid!=='string'||!id.ocid)throw new Error('PROFILE_INVALID');
      var raw=await get('/character/basic',{ocid:id.ocid},signal);
      var profile=data.publicCharacter({name:raw.character_name,world:raw.world_name,job:raw.character_class,level:raw.character_level,image:raw.character_image,updatedAt:Date.now()},name);
      if(!profile)throw new Error('PROFILE_INVALID');return profile;
    }};
  }
  function fresh(raw,name){var c=data.publicCharacter(raw,name);return c&&Date.now()-c.updatedAt<30*86400000?c:null;}
  function renderInfo(doc,c,name){
    var info=doc.createElement('div'),title=doc.createElement('strong');
    info.className='character-info';title.className='character-name';title.textContent=name||'캐릭터를 선택하세요';info.append(title);
    if(!c)return info;
    var meta=doc.createElement('div');meta.className='character-meta';
    [[c.world,'character-world'],[c.level?'Lv. '+c.level:'',''],[c.job,'']].forEach(function(entry){
      if(!entry[0])return;
      var chip=doc.createElement('span');chip.className='character-chip '+entry[1];
      var path=entry[1]&&doc.defaultView?.NexonCharacters?.worldIconPath?.(c.world);
      if(path){var icon=doc.createElement('img');icon.src=path;icon.alt='';chip.append(icon);}
      chip.append(entry[0]);meta.append(chip);
    });
    if(meta.childElementCount)info.append(meta);
    return info;
  }
  function render(doc,c,name){
    var box=doc.createElement('div');box.className='shared-character-card';
    if(c&&c.image){
      var frame=doc.createElement('div'),img=doc.createElement('img');frame.className='shared-profile-portrait';
      img.src=c.image;img.alt=name+' 캐릭터 외형';img.referrerPolicy='no-referrer';
      img.addEventListener('error',function(){frame.textContent='외형 로드 실패';});
      frame.append(img);box.append(frame);
    }
    box.append(renderInfo(doc,c,name));return box;
  }
  return {client:client,fresh:fresh,render:render,renderInfo:renderInfo};
});
