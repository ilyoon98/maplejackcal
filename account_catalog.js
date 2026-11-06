(function(root,factory){var api=factory(typeof module==='object'&&module.exports?require('./scouter_data.js'):root.ScouterData);if(typeof module==='object'&&module.exports)module.exports=api;else root.AccountCatalog=api;})(typeof window!=='undefined'?window:globalThis,function(data){
  'use strict';
  function normalize(accounts){
    if(!Array.isArray(accounts)||accounts.length>200)throw new Error('ACCOUNT_INVALID');var ids=new Set(),names=new Set(),count=0;
    return accounts.map(function(a){if(!a||typeof a.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(a.id)||ids.has(a.id)||!Array.isArray(a.characters)||a.characters.length>200)throw new Error('ACCOUNT_INVALID');ids.add(a.id);
      return {id:a.id,label:typeof a.label==='string'?a.label.trim().slice(0,40):'',characters:a.characters.map(function(raw){var name=typeof raw==='string'?raw:raw&&raw.name;if(!data.validName(name)||names.has(name)||++count>1000)throw new Error('ACCOUNT_INVALID');names.add(name);var c={name:name},profile=data.publicCharacter(raw.profile||raw,name);if(profile)c.profile=profile;return c;})};
    });
  }
  function groups(store){
    var snapshots=store.snapshots||[],used=new Set(),out=(store.accounts||[]).map(function(a){return {id:a.id,customLabel:a.label||'',characters:a.characters.map(function(member){var name=typeof member==='string'?member:member.name;used.add(name);var snap=snapshots.find(function(s){return s.characterName===name;}),p=snap&&data.publicCharacter(snap.character,name),old=member.profile&&data.publicCharacter(member.profile,name);if(old&&(!p||old.updatedAt>p.updatedAt))p=old;if(p&&Date.now()-p.updatedAt>=30*86400000)p=null;return {name:name,profile:p,snapshot:snap||null};})};});
    var ungrouped=snapshots.filter(function(s){return !used.has(s.characterName);}).map(function(s){var p=data.publicCharacter(s.character,s.characterName);return {name:s.characterName,profile:p&&Date.now()-p.updatedAt<30*86400000?p:null,snapshot:s};});
    if(ungrouped.length)out.push({id:'',customLabel:'미분류 캐릭터',characters:ungrouped});
    out.forEach(function(a){a.characters.sort(function(a,b){return (b.profile?b.profile.level:0)-(a.profile?a.profile.level:0)||a.name.localeCompare(b.name,'ko');});a.label=a.customLabel||(a.characters[0]?a.characters[0].name:'새 계정');});return out;
  }
  function accountId(store,name){var found=(store.accounts||[]).find(function(a){return a.characters.some(function(c){return (typeof c==='string'?c:c.name)===name;});});return found?found.id:'character:'+name;}
  function conflict(store,members,name){var id=accountId(store,name);return members.some(function(m){return accountId(store,m.character.name)===id;});}
  function assign(accounts,id,label,characters){
    var names=new Set(characters.map(function(c){return c.name;})),out=accounts.map(function(a){return {id:a.id,label:a.label,characters:a.characters.filter(function(c){return !names.has(c.name);})};}),target=out.find(function(a){return a.id===id;});if(!target){target={id:id,label:label,characters:[]};out.push(target);}target.label=label;target.characters=characters;return normalize(out);
  }
  function importOwn(store,rows,newId){
    var groupsByPrivateId=new Map();rows.forEach(function(r){var id=r.accountId||'current';if(!groupsByPrivateId.has(id))groupsByPrivateId.set(id,[]);var p=data.publicCharacter({name:r.name,world:r.world,job:r.characterClass||'',level:r.level,image:'',updatedAt:Date.now()},r.name);if(p)groupsByPrivateId.get(id).push({name:r.name,profile:p});});
    var accounts=normalize(store.accounts||[]);groupsByPrivateId.forEach(function(members){var current=accounts.find(function(a){return a.characters.some(function(c){return members.some(function(m){return m.name===c.name;});});});accounts=assign(accounts,current?current.id:newId(),current?current.label:'',members);});return accounts;
  }
  async function save(fetchImpl,accounts,revision,pin){var r=await fetchImpl('/api/boss-rates',{method:'POST',headers:{'Content-Type':'application/json','x-rate-pin':pin||''},body:JSON.stringify({action:'accounts',accounts:normalize(accounts),expectedRevision:revision||''})}),b=await r.json();if(!r.ok)throw new Error(b.error&&b.error.code||'RATE_STORE_UNAVAILABLE');return b;}
  return {normalize:normalize,groups:groups,accountId:accountId,conflict:conflict,assign:assign,importOwn:importOwn,save:save};
});
