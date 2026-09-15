// 넥슨 오픈 API 키를 이 브라우저의 localStorage에만 저장/조회하는 공용 헬퍼.
// 홈 화면(index.html)에서 등록하면, 같은 사이트(origin)의 다른 계산기 페이지에서도
// 그대로 읽힌다(계산기별로 다시 입력할 필요 없음).
window.NexonKey = (function(){
  var STORAGE_KEY = 'nxopen_api_key';

  function get(){
    try { return localStorage.getItem(STORAGE_KEY) || ''; }
    catch(e){ return ''; }
  }
  function set(v){
    try {
      if (v) localStorage.setItem(STORAGE_KEY, v);
      else localStorage.removeItem(STORAGE_KEY);
    } catch(e){}
  }
  function has(){ return !!get(); }

  return { get: get, set: set, has: has, STORAGE_KEY: STORAGE_KEY };
})();
