// 접속 기록 화면. 고른 계정 캐릭터들을 날짜별로 조회해 AccessLogCore로 계정 접속일을 추정한다.
(function () {
  'use strict';
  var A = window.AccessLogCore;
  var API = 'https://open.api.nexon.com/maplestory/v1';
  // 데모 모드(access_log_demo.js)면 저장 기록을 따로 두고 기다림 없이 호출한다
  var DEMO = window.AccessLogDemo, PREFIX = DEMO ? DEMO.storagePrefix : '';
  var CACHE_KEY = PREFIX + 'accessLogSnapshotsV1';
  var MIN_GAP_MS = DEMO ? DEMO.gapMs : 210; // 개발 키 초당 5회 제한
  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  var LABELS = { on: '접속', off: '미접속', unknown: '확인 못 함', future: '남은 기간' };
  var $ = function (id) { return document.getElementById(id); };

  var presetButtons = [].slice.call(document.querySelectorAll('#accessPresets button')), fromInput = $('accessFrom'), toInput = $('accessTo');
  var characters = [], running = null, view = null;

  function setStatus(message, kind) {
    $('accessStatus').textContent = message || '';
    $('accessStatus').className = 'access-status' + (kind ? ' ' + kind : '');
  }
  function shortDate(date) {
    var d = new Date(date + 'T00:00:00Z');
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '(' + WEEKDAYS[d.getUTCDay()] + ')';
  }
  function fullDate(date) { return date.replace(/-/g, '.'); }

  // ---------- 저장된 스냅샷 (지난 날짜는 바뀌지 않는다) ----------
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeCache(cache) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
  }

  // ---------- API (요청은 줄을 세워 MIN_GAP_MS 간격으로 하나씩 내보낸다) ----------
  // 최근 날짜 요청을 먼저 보내서, 한도에 걸려도 최근 기록부터 채워진다.
  var nextSlot = 0, calls = 0, queue = [], pumping = false, halted = null;
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function slot(priority) {
    if (halted) return Promise.reject(halted);
    return new Promise(function (resolve, reject) { queue.push({ priority: priority || '', resolve: resolve, reject: reject }); pump(); });
  }
  function takeLatest() {
    var best = 0;
    for (var i = 1; i < queue.length; i++) if (queue[i].priority > queue[best].priority) best = i;
    return queue.splice(best, 1)[0];
  }
  function pump() {
    if (pumping) return;
    pumping = true;
    (function next() {
      var delay = nextSlot - Date.now();
      if (delay > 0) { setTimeout(next, delay); return; }
      var item = queue.length ? takeLatest() : null;
      if (!item) { pumping = false; return; }
      nextSlot = Date.now() + MIN_GAP_MS;
      item.resolve();
      next();
    })();
  }
  // 한도 초과·중단 시 줄 선 요청을 더 보내지 않는다
  function dropQueue(error) { halted = error; queue.splice(0).forEach(function (item) { item.reject(error); }); }
  async function api(path, params, signal, retried) {
    await slot(params && params.date || '9999');
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    calls++;
    var response = await fetch(API + path + '?' + new URLSearchParams(params), { headers: { 'x-nxopen-api-key': NexonKey.get() }, signal: signal });
    var body = await response.json().catch(function () { return null; });
    if (response.ok) return body;
    var code = body && body.error && body.error.name;
    if ((code === 'OPENAPI00007' || response.status === 429) && !retried) { await wait(1500); return api(path, params, signal, true); }
    var messages = {
      OPENAPI00002: '이 API 키로 계정 정보를 조회할 수 없습니다.',
      OPENAPI00005: 'API 키가 유효하지 않습니다. 홈에서 다시 등록하세요.',
      OPENAPI00007: 'API 호출 한도를 초과했습니다. 개발 단계 키는 하루 1,000회까지입니다. 기간을 줄이거나 내일 다시 조회하세요. 지금까지 받은 기록은 저장되어 다음엔 호출하지 않습니다.',
      OPENAPI00009: '데이터 준비 중입니다. 잠시 후 다시 조회하세요.',
      OPENAPI00010: '게임 점검 중입니다.',
      OPENAPI00011: 'API 점검 중입니다.'
    };
    var error = new Error(messages[code] || '조회에 실패했습니다. (HTTP ' + response.status + ')');
    error.code = code;
    throw error;
  }

  // ---------- 계정 캐릭터와 선택 (선택은 이 브라우저에 기억한다) ----------
  var ACCOUNT_KEY = PREFIX + 'accessLogAccountV1', SELECT_KEY = PREFIX + 'accessLogSelectedV1';
  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  characters = readJson(ACCOUNT_KEY) || [];
  // 선택한 ocid 목록. 저장된 게 없으면 전체 선택.
  function selectedCharacters() {
    var chosen = readJson(SELECT_KEY);
    return characters.filter(function (c) { return !Array.isArray(chosen) || chosen.indexOf(c.ocid) >= 0; });
  }
  function setSelected(ocids) {
    writeJson(SELECT_KEY, ocids);
    renderCharacterList();
    showSaved();
  }
  function renderCharacterList() {
    var list = $('accessCharList');
    var selected = selectedCharacters().map(function (c) { return c.ocid; });
    list.replaceChildren();
    characters.forEach(function (c) {
      var label = document.createElement('label');
      label.className = 'access-char';
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.value = c.ocid;
      box.checked = selected.indexOf(c.ocid) >= 0;
      box.addEventListener('change', function () {
        setSelected([].filter.call(list.querySelectorAll('input'), function (input) { return input.checked; })
          .map(function (input) { return input.value; }));
      });
      var name = document.createElement('span');
      name.textContent = c.name;
      var meta = document.createElement('small');
      meta.textContent = 'Lv.' + c.level + ' · ' + c.world;
      label.append(box, name, meta);
      list.appendChild(label);
    });
    $('accessCharCount').textContent = selected.length + ' / ' + characters.length + '명';
    $('accessChars').hidden = !characters.length;
  }

  var loading = null;
  function loadCharacters() {
    if (!loading) loading = fetchCharacters().finally(function () { loading = null; });
    return loading;
  }
  async function fetchCharacters() {
    if (!NexonKey.has()) {
      $('accessAccount').textContent = '홈 화면에서 넥슨 Open API 키를 등록하면 계정 캐릭터로 조회합니다. ';
      var demo = document.createElement('a');
      demo.href = '?demo';
      demo.textContent = 'API 없이 데모로 둘러보기';
      $('accessAccount').appendChild(demo);
      return;
    }
    try {
      characters = (await NexonCharacters.fetch()).map(function (c) {
        return { ocid: c.ocid, name: c.name, level: c.level, world: c.world };
      });
      writeJson(ACCOUNT_KEY, characters);
      $('accessAccount').textContent = characters.length
        ? '고른 캐릭터 중 누구로든 접속한 날을 셉니다. 창고 캐릭터를 빼면 API 호출이 줄어듭니다.'
        : '계정에 캐릭터가 없습니다.';
      renderCharacterList();
    } catch (e) {
      var reasons = {
        OPENAPI00005: 'API 키가 유효하지 않습니다. 홈에서 다시 등록하세요.',
        OPENAPI00002: '이 API 키로는 계정 캐릭터 목록을 조회할 수 없습니다.',
        OPENAPI00007: 'API 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요.',
        OPENAPI00010: '게임 점검 중입니다.',
        OPENAPI00011: 'API 점검 중입니다.'
      };
      $('accessAccount').textContent = '계정 캐릭터를 불러오지 못했습니다. ' + (reasons[e.code] || '(' + (e.code || e.message) + ')');
      if (e.code === 'OPENAPI00005' || e.code === 'OPENAPI00002') characters = [];
    }
  }

  // ---------- 이벤트 (모아 둔 지난 이벤트 + API의 진행 중 이벤트) ----------
  var allEvents = (window.MapleEventHistory || []).slice(), apiEventsLoaded = null;
  function loadApiEvents() {
    if (!apiEventsLoaded && NexonKey.has()) {
      apiEventsLoaded = api('/notice-event', {}).then(function (body) {
        allEvents = allEvents.concat(A.eventsFromApi(body && body.event_notice));
        if (preset === 'event') setPreset('event');
        if (view && !$('accessResult').hidden) { view.events = A.majorUpdates(allEvents, view.from, view.to); render(); }
      }).catch(function () { apiEventsLoaded = null; });
    }
    return apiEventsLoaded || Promise.resolve();
  }
  // 가장 최근의 굵직한 업데이트 기간
  function recentEventRange() {
    var today = A.kstDate();
    var updates = A.majorUpdates(allEvents, A.FIRST_DATE, today);
    var latest = updates[updates.length - 1];
    return latest ? { from: latest.from < A.FIRST_DATE ? A.FIRST_DATE : latest.from, to: latest.to } : null;
  }

  // ---------- 기간 ----------
  var preset = 'max';
  function setPreset(value) {
    preset = value;
    presetButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.preset === value)); });
    if (value === 'max') { fromInput.value = A.FIRST_DATE; toInput.value = A.lastQueryableDate(); }
    if (value === 'event') {
      var range = recentEventRange();
      if (range) { fromInput.value = range.from; toInput.value = range.to; }
    }
  }

  // ---------- 저장된 결과 (캐릭터별 날짜 상태. 한 번 확인한 날은 다시 조회하지 않는다) ----------
  var RESULT_KEY = PREFIX + 'accessLogResultV2';
  function readResult() {
    var saved = readJson(RESULT_KEY);
    return saved && saved.chars ? saved : { chars: {} };
  }
  function writeResult(saved) {
    saved.savedAt = A.kstDate();
    writeJson(RESULT_KEY, saved);
  }
  function resultsFor(saved, list) {
    return list.map(function (c) { return { name: c.name, states: saved.chars[c.ocid] || {} }; });
  }
  // 저장된 결과로 기간을 그린다. 아직 안 받은 날은 빗금(확인 못 함)으로 둔다.
  function showSaved() {
    var saved = readResult(), list = selectedCharacters();
    var from = fromInput.value, to = toInput.value, last = A.lastQueryableDate();
    if (!A.isDate(from) || !A.isDate(to) || from > to) return false;
    if (from < A.FIRST_DATE) from = A.FIRST_DATE;
    var hasData = list.some(function (c) { return saved.chars[c.ocid]; });
    $('accessSubmit').textContent = hasData ? '기록 업데이트' : '접속 기록 조회';
    if (!hasData) {
      $('accessResult').hidden = true;
      if (characters.length && !list.length) setStatus('조회할 캐릭터를 하나 이상 고르세요.');
      else if (list.length) setStatus('고른 캐릭터의 저장된 기록이 없습니다. "접속 기록 조회"를 누르세요.');
      return false;
    }
    var days = A.mergeDays(A.dateRange(from, to), resultsFor(saved, list), last);
    view = { from: from, to: to, days: days, events: A.majorUpdates(allEvents, from, to), focus: null };
    render();
    var missing = days.some(function (day) { return day.state === 'unknown' && day.date !== A.FIRST_DATE; });
    setStatus(fullDate(saved.savedAt) + '에 저장한 기록입니다.' + (missing ? ' 빗금 칸은 "기록 업데이트"를 누르면 받습니다.' : ''));
    return true;
  }

  // ---------- 조회 ----------
  async function run(event) {
    event.preventDefault();
    if (running) { running.abort(); dropQueue(new DOMException('aborted', 'AbortError')); }
    var controller = new AbortController();
    running = controller;
    halted = null;
    var from = fromInput.value, to = toInput.value, last = A.lastQueryableDate();
    if (!NexonKey.has()) { setStatus('홈 화면에서 넥슨 Open API 키를 먼저 등록하세요.', 'bad'); return; }
    if (!A.isDate(from) || !A.isDate(to) || from > to) { setStatus('시작일과 끝일을 확인하세요.', 'bad'); return; }
    if (from < A.FIRST_DATE) from = A.FIRST_DATE;
    if (from > last) { setStatus('아직 조회할 수 있는 날이 없습니다. 오늘 기록은 내일부터 조회됩니다.', 'bad'); return; }
    var scanTo = to < last ? to : last;

    $('accessSubmit').disabled = true;
    calls = 0;
    var cache = readCache(), result = readResult(), stopped = null, scanned = 0;
    try {
      if (!characters.length) await loadCharacters();
      var list = selectedCharacters();
      if (!characters.length) throw new Error($('accessAccount').textContent);
      if (!list.length) throw new Error('조회할 캐릭터를 하나 이상 고르세요.');
      var events = loadApiEvents();
      // 이미 다른 캐릭터로 접속이 확인된 날은 더 볼 필요가 없다
      var onDays = Object.create(null);
      list.forEach(function (c) {
        var states = result.chars[c.ocid] || {};
        Object.keys(states).forEach(function (date) { if (states[date] === 'on') onDays[date] = true; });
      });
      // 본캐부터 확인하면 부캐는 남은 날만 보면 된다
      for (var i = 0; i < list.length; i++) {
        var who = list[i];
        var snaps = cache[who.ocid] || (cache[who.ocid] = {});
        var states = result.chars[who.ocid] || (result.chars[who.ocid] = {});
        // 이 캐릭터가 아직 확인 안 한 첫날부터만 조회한다 (API 첫날은 비교할 전날이 없어 뺀다)
        var scanFrom = A.dateRange(from, scanTo).find(function (date) {
          return date !== A.FIRST_DATE && states[date] !== 'on' && states[date] !== 'off' && !onDays[date];
        });
        if (!scanFrom) continue;
        scanned++;
        var progress = '기록 확인 중… 캐릭터 ' + (i + 1) + ' / ' + list.length + ' (' + who.name + ') · API ';
        setStatus(progress + calls + '회');
        var found = await A.scanCharacter(scanFrom, scanTo, function (date) {
          if (date in snaps) return Promise.resolve(snaps[date]);
          if (stopped) return Promise.resolve(undefined);
          return api('/character/basic', { ocid: who.ocid, date: date }, controller.signal).then(function (body) {
            setStatus(progress + calls + '회');
            return (snaps[date] = A.snapshotFrom(body));
          }, function (e) {
            if (e.code === 'OPENAPI00004') return (snaps[date] = null); // 그날 캐릭터 없음
            if (e.name === 'AbortError') throw e;
            // 호출 한도 등으로 막히면 받은 데까지만 보여준다
            if (!stopped) { stopped = e; dropQueue(e); }
            return undefined;
          });
        }, function (date) { return !!onDays[date]; });
        Object.keys(found).forEach(function (date) {
          states[date] = found[date];
          if (found[date] === 'on') onDays[date] = true;
        });
        if (i % 5 === 4) { writeCache(cache); writeResult(result); }
      }
      writeCache(cache);
      writeResult(result);
      if (running !== controller) return;
      await events;
      showSaved();
      if (stopped) setStatus(stopped.message + ' 받은 데까지 표시했고, 빗금 칸은 다음에 "기록 업데이트"를 누르면 이어서 받습니다.', 'bad');
      else if (!scanned) setStatus('이 기간은 모두 저장되어 있어 새로 받을 기록이 없습니다.');
      else setStatus(calls ? 'API ' + calls + '회 호출했습니다. 다음엔 저장된 기록을 씁니다.' : '이미 받아 둔 기록으로 채웠습니다. API는 호출하지 않았습니다.');
    } catch (e) {
      writeCache(cache);
      writeResult(result);
      if (e.name !== 'AbortError') setStatus(e.message, 'bad');
    } finally {
      if (running === controller) { running = null; $('accessSubmit').disabled = false; }
    }
  }

  // ---------- 그리기 ----------
  function pct(index, total) { return (index / total * 100) + '%'; }

  function render() {
    var days = view.days, n = days.length;
    var focus = view.focus;
    var shown = focus ? days.filter(function (d) { return d.date >= focus.start && d.date <= focus.end; }) : days;
    var s = A.summarize(shown);
    $('resultRange').textContent = focus
      ? focus.title + ' · ' + fullDate(focus.from) + ' ~ ' + fullDate(focus.to)
      : fullDate(view.from) + ' ~ ' + fullDate(view.to) + ' · ' + n + '일';
    $('resultOn').textContent = s.on;
    $('resultOf').textContent = '/ ' + s.checked + '일 접속';
    $('statRate').textContent = s.checked ? Math.round(s.rate * 100) + '%' : '-';
    $('statNow').textContent = s.currentStreak + '일';
    $('statStreak').textContent = s.longestStreak + '일';

    var line = $('accessLine');
    line.replaceChildren();
    line.classList.toggle('dense', n > 60);
    days.forEach(function (day) {
      var cell = document.createElement('span');
      var outside = focus && (day.date < focus.start || day.date > focus.end);
      cell.className = 'access-cell ' + day.state + (outside ? ' dim' : '');
      cell.title = shortDate(day.date) + ' · ' + LABELS[day.state] + (day.characters.length ? ' · ' + day.characters.join(', ') : '');
      line.appendChild(cell);
    });
    line.setAttribute('aria-label', s.checked + '일 중 ' + s.on + '일 접속');

    $('accessResult').hidden = false; // 축 글자 겹침을 재려면 먼저 보여야 한다
    renderEvents(n);
    renderAxis(n);
  }

  // 굵직한 업데이트를 기간만큼 괄호로 걸친다. 누르면 그 기간만 집계한다.
  function renderEvents(n) {
    var box = $('accessEvents');
    box.replaceChildren();
    var lanes = view.events.reduce(function (max, e) { return Math.max(max, e.lane + 1); }, 0);
    box.style.setProperty('--lanes', lanes);
    view.events.forEach(function (event) {
      var startIndex = A.diffDays(view.from, event.start), length = A.diffDays(event.start, event.end) + 1;
      var s = A.summarize(view.days.slice(startIndex, startIndex + length));
      var bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'access-event' + (view.focus === event ? ' active' : '') +
        (event.from < view.from ? ' cut-start' : '') + (event.to > view.to ? ' cut-end' : '');
      bar.style.left = pct(startIndex, n);
      bar.style.width = pct(length, n);
      bar.style.top = 'calc(' + event.lane + ' * var(--lane-h))';
      bar.title = event.title + ' · ' + fullDate(event.from) + ' ~ ' + fullDate(event.to) + ' · ' + s.on + ' / ' + s.checked + '일 접속\n' + event.titles.join('\n');
      bar.setAttribute('aria-pressed', String(view.focus === event));
      var label = document.createElement('span');
      label.className = 'access-event-label';
      label.textContent = event.from.slice(2, 4) + '.' + Number(event.from.slice(5, 7)) + ' · ' + s.on + '/' + s.checked + '일';
      bar.appendChild(label);
      bar.addEventListener('click', function () {
        view.focus = view.focus === event ? null : event;
        render();
      });
      box.appendChild(bar);
    });
    // 괄호가 좁으면 이름은 숨기고 마우스를 올렸을 때만 보여준다
    [].forEach.call(box.children, function (bar) { bar.classList.toggle('narrow', bar.offsetWidth < 48); });
    box.hidden = !view.events.length;
  }

  function renderAxis(n) {
    var axis = $('accessAxis');
    axis.replaceChildren();
    var marks = [[0, shortDate(view.from)]];
    view.days.forEach(function (day, i) {
      if (i > 0 && day.date.slice(8) === '01') marks.push([i, Number(day.date.slice(5, 7)) + '월']);
    });
    marks.push([n - 1, shortDate(view.to)]);
    var placed = [];
    marks.forEach(function (mark, k) {
      var edge = k === 0 ? 'start' : k === marks.length - 1 ? 'end' : '';
      var tick = document.createElement('span');
      tick.className = 'access-tick' + (edge ? ' ' + edge : '');
      tick.textContent = mark[1];
      if (!edge) tick.style.left = pct(mark[0] + 0.5, n);
      axis.appendChild(tick);
      placed.push(tick);
    });
    // 양 끝 날짜와 겹치거나 서로 붙는 월 표시는 뺀다
    var start = placed[0].getBoundingClientRect(), end = placed[placed.length - 1].getBoundingClientRect(), prevRight = start.right;
    placed.slice(1, -1).forEach(function (tick) {
      var r = tick.getBoundingClientRect();
      if (r.left < prevRight + 6 || r.right > end.left - 6) tick.remove();
      else prevRight = r.right;
    });
  }

  // ---------- 시작 ----------
  presetButtons.forEach(function (b) { b.addEventListener('click', function () { setPreset(b.dataset.preset); showSaved(); }); });
  [fromInput, toInput].forEach(function (input) { input.addEventListener('input', function () { setPreset('custom'); showSaved(); }); });
  $('accessForm').addEventListener('submit', run);
  window.addEventListener('resize', function () { if (view && !$('accessResult').hidden) renderAxis(view.days.length); });
  fromInput.min = toInput.min = A.FIRST_DATE;
  setPreset('max');
  renderCharacterList();
  showSaved();
  $('accessCharAll').addEventListener('click', function () { setSelected(null); });
  $('accessCharNone').addEventListener('click', function () { setSelected([]); });
  loadCharacters();
  // 다른 탭(홈)에서 API 키를 바꾸면 다시 불러온다
  window.addEventListener('storage', function (e) { if (e.key === NexonKey.STORAGE_KEY) { characters = []; loadCharacters(); loadApiEvents(); } });
  loadApiEvents();
})();
