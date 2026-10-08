/* Completed KST days only. API keys are never stored in this database. */
(function(root){
  'use strict';
  async function open(key){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
    const account=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('maple-starforce-history-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('days');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('저장소가 다른 탭에서 사용 중입니다.'));
    });
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
    return {
      get:date=>transaction('readonly',store=>store.get([account,date])),
      set:(date,rows)=>transaction('readwrite',store=>store.put({rows,savedAt:Date.now()},[account,date])),
      getSettings:()=>transaction('readonly',store=>store.get([account,'settings'])),
      setSettings:settings=>transaction('readwrite',store=>store.put(settings,[account,'settings'])),
      clear:()=>transaction('readwrite',store=>store.delete(IDBKeyRange.bound([account,''],[account,'\uffff']))),
      close:()=>db.close()
    };
  }
  root.StarforceHistoryCache={open};
})(window);
