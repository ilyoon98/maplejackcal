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
  function render(doc,c,name){
    var box=doc.createElement('div');box.className='shared-character-card';
    if(c&&c.image){
      var frame=doc.createElement('div'),img=doc.createElement('img');frame.className='shared-profile-portrait';
      img.src=c.image;img.alt=name+' 캐릭터 외형';img.referrerPolicy='no-referrer';
      img.addEventListener('error',function(){frame.textContent='외형 로드 실패';});
      frame.append(img);box.append(frame);
    }
    var info=doc.createElement('div'),title=doc.createElement('strong'),meta=doc.createElement('p');title.textContent=name||'캐릭터를 선택하세요';meta.textContent=c?c.world+' · Lv.'+c.level+' · '+c.job:'캐릭터 정보 미조회';info.append(title,meta);box.append(info);return box;
  }
  return {client:client,fresh:fresh,render:render};
});
