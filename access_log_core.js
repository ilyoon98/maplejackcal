// 접속 기록 계산. 넥슨 Open API에는 날짜별 접속 이력이 없어서,
// character/basic의 일별 스냅샷(레벨·경험치)이 전날과 달라졌으면 그날 접속한 것으로 본다.
// 스냅샷 D는 D일이 끝난 시점의 상태이므로 D와 D-1을 비교해 D일의 접속 여부를 정한다.
// 계정의 어느 캐릭터든 접속했으면 그날은 접속한 날이다.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AccessLogCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DAY_MS = 24 * 60 * 60 * 1000;
  var KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  // 넥슨 Open API가 날짜 지정 조회를 지원하는 첫날
  var FIRST_DATE = '2023-12-21';
  var ACCESS_WINDOW_DAYS = 7; // access_flag = 최근 7일간 접속 여부

  function isDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'));
  }
  function kstDate(nowValue) {
    var now = typeof nowValue === 'number' ? nowValue : Date.now();
    return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
  }
  function addDays(date, days) {
    return new Date(Date.parse(date + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10);
  }
  function diffDays(from, to) {
    return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY_MS);
  }
  function dateRange(from, to) {
    var out = [];
    if (!isDate(from) || !isDate(to) || from > to) return out;
    for (var d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }
  // API 시각 문자열(예: 2026-10-01T10:00+09:00)을 KST 날짜로
  function toKstDate(value) {
    var t = Date.parse(value);
    return Number.isFinite(t) ? kstDate(t) : '';
  }
  // 오늘 데이터는 아직 없으므로 조회 가능한 마지막 날은 어제(KST)
  function lastQueryableDate(nowValue) {
    return addDays(kstDate(nowValue), -1);
  }

  function snapshotFrom(body) {
    if (!body) return null;
    var level = Number(body.character_level), exp = Number(body.character_exp);
    if (!Number.isFinite(level) || !Number.isFinite(exp)) return null;
    return { level: level, exp: exp, access: String(body.access_flag) === 'true' };
  }

  // 캐릭터별 결과를 계정 하루 상태로 합친다. 한 캐릭터라도 접속했으면 접속.
  // results: [{ name, states: { date: 'on'|'off'|'unknown' } }]
  // state: on, off, unknown(확인 못 함), future(아직 조회 불가)
  function mergeDays(dates, results, lastDate) {
    return dates.map(function (date) {
      if (lastDate && date > lastDate) return { date: date, state: 'future', characters: [] };
      // 한 캐릭터라도 접속했으면 접속, 모두 미접속이어야 미접속. 기록이 없는 캐릭터가 있으면 확인 못 함.
      var names = [], unknown = !results.length;
      results.forEach(function (r) {
        var state = r.states[date];
        if (state === 'on') names.push(r.name);
        else if (state !== 'off') unknown = true;
      });
      return { date: date, state: names.length ? 'on' : unknown ? 'unknown' : 'off', characters: names };
    });
  }

  // 확인된 마지막 날부터 거꾸로 이어진 접속 일수 (남은 기간은 건너뛴다)
  function currentStreak(days) {
    var run = 0;
    for (var i = days.length - 1; i >= 0; i--) {
      if (days[i].state === 'future') continue;
      if (days[i].state !== 'on') break;
      run++;
    }
    return run;
  }

  function summarize(days) {
    var counted = days.filter(function (d) { return d.state === 'on' || d.state === 'off'; });
    var on = days.filter(function (d) { return d.state === 'on'; });
    var longest = 0, run = 0;
    days.forEach(function (d) {
      run = d.state === 'on' ? run + 1 : 0;
      if (run > longest) longest = run;
    });
    return {
      total: days.length,
      checked: counted.length,
      on: on.length,
      rate: counted.length ? on.length / counted.length : 0,
      longestStreak: longest,
      currentStreak: currentStreak(days),
      accessDates: on.map(function (d) { return d.date; })
    };
  }

  function sameSnapshot(a, b) { return a.level === b.level && a.exp === b.exp; }

  // 한 캐릭터의 접속일을 이분 탐색으로 찾는다. 구간 양 끝 스냅샷이 같으면 그 사이엔 플레이하지 않은 것이므로
  // 안 쓰는 캐릭터는 몇 번만 호출하고 끝난다. 다른 캐릭터로 이미 접속이 확인된 날은 더 파고들지 않는다.
  // get(date) → Promise<snapshot|null|undefined> (null = 그날 캐릭터 없음, undefined = 호출 한도 등으로 조회 못 함)
  // isOn(date) → 계정 기준 이미 접속 확인
  // 결과: { date: 'on' | 'off' | 'unknown' } (건너뛴 날은 빠진다)
  async function scanCharacter(from, to, get, isOn) {
    var out = {};
    var start = addDays(from, -1);
    if (start < FIRST_DATE) start = FIRST_DATE;
    if (from > to || start >= to) return out;
    function mark(a, b, state) { dateRange(addDays(a, 1), b).forEach(function (d) { if (!out[d]) out[d] = state; }); }
    async function segment(a, b, sa, sb) {
      var days = dateRange(addDays(a, 1), b);
      if (days.every(isOn)) return;
      if (sa === undefined || sb === undefined) return mark(a, b, 'unknown');
      if (!sa && !sb) return mark(a, b, 'off'); // 아직 만들어지기 전
      if (sa && sb && sameSnapshot(sa, sb)) return mark(a, b, 'off');
      if (sb && !sb.access && diffDays(a, b) <= ACCESS_WINDOW_DAYS) return mark(a, b, 'off');
      if (diffDays(a, b) === 1) { out[b] = sb ? 'on' : 'unknown'; return; } // 없던 캐릭터가 생긴 날도 접속
      var mid = addDays(a, Math.floor(diffDays(a, b) / 2));
      var sm = await get(mid);
      await Promise.all([segment(a, mid, sa, sm), segment(mid, b, sm, sb)]);
    }
    var ends = await Promise.all([get(start), get(to)]);
    await segment(start, to, ends[0], ends[1]);
    return out;
  }

  // Open API 이벤트 공지 → { title, from, to }
  function eventsFromApi(list) {
    return (Array.isArray(list) ? list : []).map(function (event) {
      return { title: String(event && event.title || ''), from: toKstDate(event && event.date_event_start), to: toKstDate(event && event.date_event_end) };
    });
  }

  // 홈페이지 제목의 "(수정2)" 같은 머리말을 떼서 같은 이벤트를 한 번만 센다
  function cleanTitle(title) {
    return String(title || '').replace(/^\s*\(\s*수정\s*\d*\s*\)\s*/, '').replace(/\s+/g, ' ').trim();
  }

  // 굵직한 업데이트만 고른다. 큰 업데이트 날에는 이벤트가 한꺼번에 여러 개 열리므로
  // 같은 날 시작한 여러 날짜짜리 이벤트가 minCount개 이상이면 굵직한 업데이트로 본다.
  // 기간은 그 묶음에서 가장 많이 겹치는 종료일(메인 이벤트 기간)까지. 겹치지 않게 줄(lane)을 나눈다.
  // events: [{ title, from, to }] (여러 출처를 섞어도 된다)
  var MAJOR_MIN_EVENTS = 6;
  function majorUpdates(events, from, to, minCount) {
    minCount = minCount || MAJOR_MIN_EVENTS;
    var groups = Object.create(null), list = [];
    (Array.isArray(events) ? events : []).forEach(function (event) {
      var title = cleanTitle(event && event.title);
      if (!title || !isDate(event.from) || !isDate(event.to) || event.from >= event.to) return;
      var group = groups[event.from];
      if (!group) { group = groups[event.from] = { from: event.from, items: [] }; list.push(group); }
      if (group.items.some(function (item) { return item.title === title && item.to === event.to; })) return;
      group.items.push({ title: title, from: event.from, to: event.to });
    });
    var laneEnds = [];
    return list.filter(function (group) { return group.items.length >= minCount; }).map(function (group) {
      var counts = Object.create(null), end = '';
      group.items.forEach(function (item) {
        counts[item.to] = (counts[item.to] || 0) + 1;
        if (!end || counts[item.to] > counts[end] || (counts[item.to] === counts[end] && item.to > end)) end = item.to;
      });
      group.to = end;
      group.items.sort(function (x, y) { return x.to < y.to ? 1 : x.to > y.to ? -1 : 0; });
      group.titles = group.items.map(function (item) { return item.title; });
      group.title = group.from.slice(2, 4) + '년 ' + Number(group.from.slice(5, 7)) + '월 업데이트';
      return group;
    }).filter(function (group) {
      return group.from <= to && group.to >= from;
    }).sort(function (x, y) { return x.from < y.from ? -1 : 1; }).map(function (group) {
      group.start = group.from < from ? from : group.from;
      group.end = group.to > to ? to : group.to;
      var lane = laneEnds.findIndex(function (laneEnd) { return laneEnd < group.start; });
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(''); }
      laneEnds[lane] = group.end;
      group.lane = lane;
      return group;
    });
  }

  return {
    FIRST_DATE: FIRST_DATE,
    isDate: isDate,
    kstDate: kstDate,
    addDays: addDays,
    diffDays: diffDays,
    dateRange: dateRange,
    toKstDate: toKstDate,
    lastQueryableDate: lastQueryableDate,
    snapshotFrom: snapshotFrom,
    mergeDays: mergeDays,
    summarize: summarize,
    scanCharacter: scanCharacter,
    eventsFromApi: eventsFromApi,
    majorUpdates: majorUpdates
  };
});
