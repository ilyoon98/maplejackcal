// 접속 기록 데모 모드. access_log.html?demo 로 열면 넥슨 API 대신 가짜 계정·기록으로 동작한다.
// 실제 API는 부르지 않고, 저장 기록도 진짜와 따로(demo: 접두어) 둔다.
// ?demo&quota=200 처럼 주면 그 횟수 뒤에 호출 한도 초과를 흉내 낸다.
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  if (!params.has('demo')) return;

  var FIRST_DATE = '2023-12-21';
  var DAY_MS = 24 * 60 * 60 * 1000;
  var quota = Number(params.get('quota')) || Infinity;
  var basicCalls = 0;

  // 캐릭터마다 플레이하는 날의 규칙 (date → 플레이 여부)
  function addDays(date, n) { return new Date(Date.parse(date + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10); }
  function hash(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 10000) / 10000;
  }
  var CHARACTERS = [
    { ocid: 'demo-main', name: '데모본캐', world: '스카니아', cls: '히어로', level: 285,
      plays: function (d) { return !(d >= '2024-05-01' && d <= '2024-06-15') && hash('m' + d) < 0.85; } },
    { ocid: 'demo-alt', name: '데모부캐', world: '스카니아', cls: '비숍', level: 270,
      plays: function (d) { return hash('a' + d) < 0.3; } },
    { ocid: 'demo-link', name: '링크작업', world: '스카니아', cls: '제논', level: 210,
      plays: function (d) { return d >= '2026-06-18' && d <= '2026-08-19' && hash('l' + d) < 0.6; } },
    { ocid: 'demo-new', name: '새캐릭', world: '루나', cls: '렌', level: 260, created: '2026-08-01',
      plays: function (d) { return hash('n' + d) < 0.7; } },
    { ocid: 'demo-mule', name: '창고', world: '스카니아', cls: '초보자', level: 30,
      plays: function () { return false; } }
  ];

  function snapshot(character, date) {
    var exp = 0, recent = false;
    for (var d = character.created || FIRST_DATE; d <= date; d = addDays(d, 1)) {
      if (character.plays(d)) { exp++; if ((Date.parse(date) - Date.parse(d)) / DAY_MS < 7) recent = true; }
    }
    return { date: date + 'T00:00+09:00', character_name: character.name, character_level: character.level, character_exp: exp, access_flag: String(recent) };
  }

  function json(body, status) {
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(new Response(JSON.stringify(body), { status: status || 200, headers: { 'content-type': 'application/json' } })); }, 30);
    });
  }
  function error(name, status) { return json({ error: { name: name, message: name } }, status || 400); }

  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.hostname !== 'open.api.nexon.com') return realFetch(input, init);
    var path = url.pathname.replace('/maplestory/v1', '');
    if (path === '/character/list') {
      return json({ account_list: [{ account_id: 'demo', character_list: CHARACTERS.map(function (c) {
        return { ocid: c.ocid, character_name: c.name, world_name: c.world, character_class: c.cls, character_level: c.level };
      }) }] });
    }
    if (path === '/character/basic') {
      if (++basicCalls > quota) return error('OPENAPI00007', 429);
      var character = CHARACTERS.find(function (c) { return c.ocid === url.searchParams.get('ocid'); });
      var date = url.searchParams.get('date');
      if (!character || !date) return error('OPENAPI00004');
      if (character.created && date < character.created) return error('OPENAPI00004');
      return json(snapshot(character, date));
    }
    if (path === '/notice-event') return json({ event_notice: [] });
    return error('OPENAPI00006', 404);
  };

  // 진짜 API 키 대신 데모 키를 쓴다 (localStorage의 진짜 키는 건드리지 않는다)
  if (window.NexonKey) {
    window.NexonKey.get = function () { return 'demo'; };
    window.NexonKey.has = function () { return true; };
  }

  window.AccessLogDemo = {
    storagePrefix: 'demo:',
    gapMs: 5,
    reset: function () {
      Object.keys(localStorage).forEach(function (key) { if (key.indexOf('demo:') === 0) localStorage.removeItem(key); });
      location.reload();
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.createElement('p');
    banner.className = 'access-demo';
    banner.textContent = '데모 모드 · 가짜 계정과 기록으로 보여주며 넥슨 API는 호출하지 않습니다' + (quota < Infinity ? ' · ' + quota + '회 뒤 한도 초과' : '') + '. ';
    var reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = '데모 기록 지우기';
    reset.addEventListener('click', window.AccessLogDemo.reset);
    var exit = document.createElement('a');
    exit.href = location.pathname;
    exit.textContent = '데모 끄기';
    banner.append(reset, exit);
    var main = document.querySelector('main');
    if (main) main.prepend(banner);
  });
})();
