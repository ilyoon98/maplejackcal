/* Completed KST days only. API keys are never stored in this database. */
(function(root){
  'use strict';
  // Key hash -> account namespace. Records follow the game account, so a reissued API key reuses them.
  const LINKS='maple-starforce-history-links';
  async function hash(text){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  }
  function readLinks(){
    try{const value=JSON.parse(localStorage.getItem(LINKS));if(value&&typeof value.keys==='object'&&typeof value.accounts==='object')return value;}catch(e){}
    return {keys:{},accounts:{}};
  }
  function writeLinks(value){try{localStorage.setItem(LINKS,JSON.stringify(value));}catch(e){}}
  async function isLinked(key){return !!readLinks().keys[await hash(key)];}
  async function link(key,accountIds){
    const ids=[...new Set((accountIds||[]).map(String).filter(Boolean))].sort();
    if(!ids.length)return null;
    const keyHash=await hash(key),accountHashes=await Promise.all(ids.map(id=>hash('account:'+id)));
    const links=readLinks();
    const namespace=accountHashes.map(h=>links.accounts[h]).find(Boolean)||links.keys[keyHash]||'account:'+accountHashes[0];
    links.keys[keyHash]=namespace;
    accountHashes.forEach(h=>{links.accounts[h]=namespace;});
    writeLinks(links);
    return namespace;
  }
  // Moves days saved under the key hash into the account namespace, keeping the newer copy of each day.
  function migrate(db,from,to){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('days','readwrite'),store=tx.objectStore('days');
      const request=store.openCursor(IDBKeyRange.bound([from,''],[from,'￿']));
      request.onsuccess=()=>{
        const cursor=request.result;if(!cursor)return;
        const name=cursor.key[1],value=cursor.value,target=[to,name];
        store.get(target).onsuccess=event=>{
          const existing=event.target.result;
          if(name==='settings'){if(value&&typeof value==='object')store.put(existing&&typeof existing==='object'?{...value,...existing}:value,target);}
          else if(!existing||Number(value?.savedAt)>Number(existing?.savedAt))store.put(value,target);
        };
        cursor.delete();cursor.continue();
      };
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error||new Error('저장이 중단되었습니다.'));
    });
  }
  async function open(key){
    const keyHash=await hash(key);
    const account=readLinks().keys[keyHash]||keyHash;
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('maple-starforce-history-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('days');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('저장소가 다른 탭에서 사용 중입니다.'));
    });
    if(account!==keyHash)try{await migrate(db,keyHash,account);}catch(e){db.close();throw e;}
    function transaction(mode,operation){
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('days',mode),store=tx.objectStore('days');
        let result;
        const request=operation(store);
        request.onsuccess=()=>{result=request.result;};
        tx.oncomplete=()=>resolve(result);
        tx.onerror=()=>reject(tx.error);
        tx.onabort=()=>reject(tx.error||new Error('저장이 중단되었습니다.'));
      });
    }
    function getRange(from,to){
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('days','readonly'),store=tx.objectStore('days'),range=IDBKeyRange.bound([account,from],[account,to]);
        let keys=[],values=[];
        store.getAllKeys(range).onsuccess=event=>{keys=event.target.result;};
        store.getAll(range).onsuccess=event=>{values=event.target.result;};
        tx.oncomplete=()=>resolve(new Map(keys.map((k,i)=>[k[1],values[i]])));
        tx.onerror=()=>reject(tx.error);
        tx.onabort=()=>reject(tx.error||new Error('저장소를 읽지 못했습니다.'));
      });
    }
    return {
      get:date=>transaction('readonly',store=>store.get([account,date])),
      getRange,
      set:(date,rows)=>transaction('readwrite',store=>store.put({rows,savedAt:Date.now()},[account,date])),
      getSettings:()=>transaction('readonly',store=>store.get([account,'settings'])),
      setSettings:settings=>transaction('readwrite',store=>store.put(settings,[account,'settings'])),
      clear:()=>transaction('readwrite',store=>store.delete(IDBKeyRange.bound([account,''],[account,'￿']))),
      close:()=>db.close()
    };
  }
  root.StarforceHistoryCache={open,link,isLinked};
})(window);
