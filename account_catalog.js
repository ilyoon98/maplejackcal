(function(root,factory){var api=factory(typeof module==='object'&&module.exports?require('./scouter_data.js'):root.ScouterData);if(typeof module==='object'&&module.exports)module.exports=api;else root.AccountCatalog=api;})(typeof window!=='undefined'?window:globalThis,function(data){
  'use strict';
  function normalize(accounts){
    if(!Array.isArray(accounts)||accounts.length>200)throw new Error('ACCOUNT_INVALID');var ids=new Set(),names=new Set(),count=0;
    return accounts.map(function(a){if(!a||typeof a.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(a.id)||ids.has(a.id)||!Array.isArray(a.characters)||a.characters.length>200)throw new Error('ACCOUNT_INVALID');ids.add(a.id);
      var characters=a.characters.map(function(raw){var name=typeof raw==='string'?raw:raw&&raw.name;if(!data.validName(name)||names.has(name)||++count>1000)throw new Error('ACCOUNT_INVALID');names.add(name);var c={name:name},profile=data.publicCharacter(raw.profile||raw,name);if(profile)c.profile=profile;return c;});
      var label=typeof a.label==='string'?a.label.trim().slice(0,40):'';
      // Retain names chosen through the old representative selector.
      if(!label&&characters.some(function(c){return c.name===a.representative;}))label=a.representative;
      return {id:a.id,label:label,characters:characters};
    });
  }
  function groups(store){
    var snapshots=store.snapshots||[],used=new Set(),out=(store.accounts||[]).map(function(a){return {id:a.id,customLabel:a.label||'',characters:a.characters.map(function(member){var name=typeof member==='string'?member:member.name;used.add(name);var snap=snapshots.find(function(s){return s.characterName===name&&s.preset==='00000';}),saved=snap&&data.publicCharacter(snap.character,name),roster=data.publicCharacter(member.profile,name);return {name:name,profile:data.mergeCharacter(saved,roster),snapshot:snap||null};})};});
    var ungrouped=snapshots.filter(function(s){return !used.has(s.characterName);}).map(function(s){var p=data.publicCharacter(s.character,s.characterName);return {name:s.characterName,profile:p&&Date.now()-p.updatedAt<30*86400000?p:null,snapshot:s};});
    if(ungrouped.length)out.push({id:'',customLabel:'미분류 캐릭터',characters:ungrouped});
    out.forEach(function(a){a.characters.sort(function(a,b){return (b.profile?b.profile.level:0)-(a.profile?a.profile.level:0)||a.name.localeCompare(b.name,'ko');});a.label=a.customLabel||a.characters[0]?.name||'새 계정';});return out.filter(function(a){return a.characters.length||a.customLabel;});
  }
  // 계정별 본캐: 계정 이름과 같은 캐릭터, 없으면 레벨이 가장 높은 캐릭터. 미분류 캐릭터는 본캐로 보지 않는다.
  function mainNames(store){
    var out=new Set();
    groups(store||{}).forEach(function(g){if(!g.id)return;var main=g.characters.find(function(c){return c.name===g.customLabel;})||g.characters[0];if(main)out.add(main.name);});
    return out;
  }
  // 파티원 순서: 본캐 먼저, 그다음 환산 배율(예상 딜 비중)이 높은 순. members는 {name, rate}.
  function partyOrder(members,mains){
    var score=function(m){return typeof m.rate==='number'&&Number.isFinite(m.rate)?m.rate:-Infinity;};
    return members.map(function(m,i){return {m:m,i:i};}).sort(function(a,b){
      var am=!!(mains&&mains.has(a.m.name)),bm=!!(mains&&mains.has(b.m.name));
      if(am!==bm)return am?-1:1;
      return (score(b.m)-score(a.m))||a.i-b.i;
    }).map(function(x){return x.m;});
  }
  // 이름 없는 파티의 자동 이름: 1명은 이름 전체, 여러 명은 여섯 글자 폭을 나눠 앞글자를 쉼표로 잇는다(2명 3글자, 3명 2글자, 4명 이상 1글자).
  function partyTitle(members,mains){
    var ordered=partyOrder(members||[],mains);
    if(ordered.length<2)return ordered[0]?ordered[0].name:'';
    var size=Math.max(1,Math.floor(6/ordered.length));
    return ordered.map(function(m){return Array.from(m.name).slice(0,size).join('');}).join(',');
  }
  function accountId(store,name){var found=(store.accounts||[]).find(function(a){return a.characters.some(function(c){return (typeof c==='string'?c:c.name)===name;});});return found?found.id:'character:'+name;}
  function conflict(store,members,name){var id=accountId(store,name);return members.some(function(m){return accountId(store,m.character.name)===id;});}
  function assign(accounts,id,label,characters){
    var names=new Set(characters.map(function(c){return c.name;})),out=accounts.map(function(a){return {...a,characters:a.characters.filter(function(c){return !names.has(c.name);})};}),target=out.find(function(a){return a.id===id;});if(!target){target={id:id,label:label,characters:[]};out.push(target);}target.label=label;target.characters=characters;
    return normalize(out);
  }
  function importOwn(store,rows,newId){
    var known=new Map();groups(store).forEach(function(g){g.characters.forEach(function(c){if(c.profile)known.set(c.name,c.profile);});});
    var groupsByPrivateId=new Map();rows.forEach(function(r){var id=r.accountId||'current';if(!groupsByPrivateId.has(id))groupsByPrivateId.set(id,[]);var p=data.publicCharacter({name:r.name,world:r.world,job:r.characterClass||'',level:r.level,image:'',updatedAt:Date.now()},r.name),old=known.get(r.name);if(p&&old){if(old.image)p={...p,image:old.image,updatedAt:old.updatedAt};else if(old.world===p.world&&old.job===p.job&&old.level===p.level&&Date.now()-old.updatedAt<86400000)p=old;}if(p)groupsByPrivateId.get(id).push({name:r.name,profile:p});});
    var accounts=normalize(store.accounts||[]);
    groupsByPrivateId.forEach(function(members){
      if(!members.length)return;
      var incoming=new Set(members.map(function(m){return m.name;}));
      var current=accounts.find(function(a){return a.characters.some(function(c){return incoming.has(c.name);});});
      var assignedElsewhere=new Set(accounts.filter(function(a){return a!==current;}).flatMap(function(a){return a.characters.map(function(c){return c.name;});}));
      var merged=new Map((current?.characters||[]).map(function(c){return [c.name,c];}));
      members.forEach(function(c){if(!assignedElsewhere.has(c.name))merged.set(c.name,c);});
      accounts=assign(accounts,current?current.id:newId(),current?current.label:'',Array.from(merged.values()));
    });
    return accounts;
  }
  async function save(fetchImpl,accounts,revision,pin){var r=await fetchImpl('/api/boss-rates',{method:'POST',headers:{'Content-Type':'application/json','x-rate-pin':pin||''},body:JSON.stringify({action:'accounts',accounts:normalize(accounts),expectedRevision:revision||''})}),b=await r.json();if(!r.ok)throw new Error(b.error&&b.error.code||'RATE_STORE_UNAVAILABLE');return b;}
  async function syncOwn(store,options){
    if(!store.persistent||store.requiresPin&&!options.pin)return store;var rows=await options.load();if(!Array.isArray(rows)||!rows.length)return store;
    for(var attempt=0;attempt<2;attempt++){
      var next=importOwn(store,rows,options.newId);if(JSON.stringify(next)===JSON.stringify(normalize(store.accounts||[])))return store;
      try{var result=await save(options.fetch,next,store.accountRevision,options.pin);return {...store,...result};}
      catch(e){if(e.message!=='RATE_CONFLICT'||attempt)throw e;var response=await options.fetch('/api/boss-rates',{cache:'no-store'});if(!response.ok)throw new Error('RATE_STORE_UNAVAILABLE');store=await response.json();}
    }
  }
  return {normalize:normalize,groups:groups,mainNames:mainNames,partyOrder:partyOrder,partyTitle:partyTitle,accountId:accountId,conflict:conflict,assign:assign,importOwn:importOwn,save:save,syncOwn:syncOwn};
});
