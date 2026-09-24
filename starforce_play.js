// 스타포스 놀이. 기댓값 계산기(starforce_calc.js)와 같은 모델로 실제로 굴려 본다.
//
// 한 판 = 시작 성에서 목표 성에 도달할 때까지. 파괴되면 12성으로 되돌아가고
// 노작값(대체 장비값)이 그 자리에서 지출에 더해진다. 계산기의 기댓값 식을 그대로
// 가져와서, 굴려서 나온 실제 지출을 같은 기준의 기대 지출과 나란히 비교한다.
//
// 하락·찬스타임은 다루지 않는다. 계산기와 마찬가지로 한 번의 강화를 성공 / 유지 / 파괴
// 세 갈래로만 본다.
(function () {
  var D = window.StarforceData;
  var MAX = D.MAX_STAR;
  var RESET = D.DESTROY_RESET_STAR;
  var AUTO_SPEED = 70; // ms. 별이 올라가는 게 눈에 보일 정도

  // ---------------------------------------------------------------- 확률·비용 (계산기와 동일)

  function buildSteps(opts) {
    var steps = [];
    for (var s = 0; s < MAX; s++) {
      var r = D.RATES[s];
      var p = r.success, d = r.destroy;
      if (opts.lucky5 && (s === 5 || s === 10 || s === 15)) { p = 1; d = 0; }
      if (opts.destroyDown30 && s <= 21) d *= 0.7;

      var base = D.baseCost(s, opts.level);
      var rate = 1;
      if (s < 17) rate -= (opts.mvp || 0) + (opts.pcRoom ? 0.05 : 0);
      if (opts.discount30) rate -= 0.3;
      var cost = base * Math.max(rate, 0);

      var guarded = opts.safeguard && opts.safeguard[s] && D.PROTECT_STARS.indexOf(s) >= 0;
      if (guarded) { cost += base * (D.PROTECT_COST_MULTIPLIER - 1); d = 0; }
      steps.push({ star: s, p: p, d: d, cost: Math.round(cost), guarded: !!guarded });
    }
    return steps;
  }

  // 12성 복귀가 섞인 재귀식. 자세한 유도는 starforce_calc.js 주석 참고.
  function expected(opts) {
    var steps = buildSteps(opts);
    var spare = opts.spare || 0;
    var per = [], sumMeso = 0, sumDestroy = 0, sumTries = 0;
    for (var s = 0; s < MAX; s++) {
      var st = steps[s], ratio = st.d / st.p, meso, destroys, tries;
      if (s < RESET) {
        meso = st.cost / st.p; destroys = 0; tries = 1 / st.p;
      } else {
        meso = st.cost / st.p + ratio * (spare + sumMeso);
        destroys = ratio * (1 + sumDestroy);
        tries = 1 / st.p + ratio * sumTries;
        sumMeso += meso; sumDestroy += destroys; sumTries += tries;
      }
      per.push({ meso: meso, destroys: destroys, tries: tries });
    }
    var total = { meso: 0, destroys: 0, tries: 0 };
    for (var k = opts.start; k < opts.goal; k++) {
      total.meso += per[k].meso; total.destroys += per[k].destroys; total.tries += per[k].tries;
    }
    return total;
  }

  // ---------------------------------------------------------------- 한 판 지출 분포

  // 파괴가 12성 복귀 루프를 만들어서 총지출 분포에는 닫힌 식이 없다. 그래서 같은 설정으로
  // 한 판을 여러 번 굴려 정렬해 두고, 거기서 분위수를 읽는다.
  //   상위 x% = 내 지출 이하로 끝낸 판이 전체의 x%  → 낮을수록 운이 좋았다는 뜻
  // 설정이 바뀌면 키가 달라져 다시 굴린다. 첫 판이 끝나기 전에는 호출되지 않는다.
  var SAMPLE_N = 12000;
  var sampleCache = { key: null, costs: null };

  function sampleKey() {
    return [settings.level, settings.start, settings.goal, settings.spare, settings.mvp,
            settings.pcRoom, settings.discount30, settings.destroyDown30, settings.lucky5,
            D.PROTECT_STARS.map(function (s) { return settings.safeguard[s] ? 1 : 0; }).join('')].join('|');
  }
  function samples() {
    var key = sampleKey();
    if (sampleCache.key === key) return sampleCache.costs;
    var costs = new Float64Array(SAMPLE_N);
    var spare = settings.spare || 0;
    for (var i = 0; i < SAMPLE_N; i++) {
      var star = settings.start, sum = 0;
      while (star < settings.goal) {
        var st = steps[star];
        sum += st.cost;
        var r = Math.random();
        if (r < st.p) star++;
        else if (r < st.p + st.d) { sum += spare; star = RESET; }
      }
      costs[i] = sum;
    }
    costs.sort();
    sampleCache = { key: key, costs: costs };
    return costs;
  }
  // 내 지출 이하로 끝난 표본의 비율. 0%로는 적지 않는다(표본 1개분이 하한).
  function percentileOf(cost) {
    var c = samples(), lo = 0, hi = c.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (c[mid] <= cost) lo = mid + 1; else hi = mid; }
    return Math.max(lo, 1) / c.length;
  }
  function medianCost() { var c = samples(); return c[Math.floor(c.length / 2)]; }

  // ---------------------------------------------------------------- 상태

  var LEVEL_PRESETS = [130, 140, 150, 160, 200, 250];
  var MVP_OPTIONS = [
    { value: 0, label: '없음' }, { value: 0.03, label: '실버' },
    { value: 0.05, label: '골드' }, { value: 0.10, label: '다이아' }
  ];

  // settings: 저장되는 설정. session: 세션 통계(저장하지 않음).
  var settings = {
    level: 200, start: 12, goal: 22, spare: 0,
    mvp: 0, pcRoom: false, discount30: false, destroyDown30: false, lucky5: false,
    safeguard: {}
  };
  var session = null;
  var steps = [], expTotal = null, autoTimer = null;

  function newSession() {
    return {
      star: settings.start,
      runAttempts: 0, runDestroys: 0, runMeso: 0,
      tape: [],                 // 최근 강화 결과
      runs: 0,                  // 완료한 판
      doneAttempts: 0, doneDestroys: 0, doneMeso: 0, // 끝난 판만의 누적
      pctSum: 0,                // 판별 상위 % 합계(평균용)
      log: [],
      cleared: false            // 목표 도달 후 "다음 판" 대기 상태
    };
  }

  function $(id) { return document.getElementById(id); }

  function save() {
    try { localStorage.setItem('starforcePlay', JSON.stringify(settings)); } catch (e) {}
  }
  function load() {
    try {
      var raw = localStorage.getItem('starforcePlay');
      if (!raw) return;
      var v = JSON.parse(raw);
      Object.keys(settings).forEach(function (k) { if (v[k] !== undefined) settings[k] = v[k]; });
    } catch (e) {}
  }

  // ---------------------------------------------------------------- 표기

  function meso(n) {
    n = Math.round(n);
    var jo = Math.floor(n / 1e12), eok = Math.floor((n % 1e12) / 1e8), man = Math.floor((n % 1e8) / 1e4);
    if (jo) return jo.toLocaleString('ko-KR') + '조' + (eok ? ' ' + eok.toLocaleString('ko-KR') + '억' : '');
    if (eok) return eok.toLocaleString('ko-KR') + '억' + (man ? ' ' + man.toLocaleString('ko-KR') + '만' : '');
    if (man) return man.toLocaleString('ko-KR') + '만';
    return n.toLocaleString('ko-KR');
  }
  function mesoHtml(n) { return '<span title="' + Math.round(n).toLocaleString('ko-KR') + ' 메소">' + meso(n) + '</span>'; }
  function num(n, digits) {
    if (!isFinite(n)) return '-';
    return n.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  function pct(n) { return (n * 100).toFixed(4).replace(/\.?0+$/, '') + '%'; }
  // 등수는 표본에서 읽은 값이라 소수점을 길게 적을 이유가 없다.
  function rankPct(n) {
    var v = n * 100;
    return (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : v.toFixed(0)) + '%';
  }

  // ---------------------------------------------------------------- 설정 UI

  function chip(label, active, onClick, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sf-chip' + (active ? ' active' : '') + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }
  // 설정을 바꾸면 지출 기준이 섞이므로 판을 새로 시작한다.
  function changeSetting(fn) {
    return function () { stopAuto(); fn(); restart(); };
  }

  function renderControls() {
    var lv = $('levelChips'); lv.innerHTML = '';
    LEVEL_PRESETS.forEach(function (level) {
      lv.appendChild(chip(String(level), settings.level === level, changeSetting(function () {
        settings.level = level;
      }), 'sf-chip-level'));
    });
    if (document.activeElement !== $('levelInput')) $('levelInput').value = settings.level;

    var mvp = $('mvpChips'); mvp.innerHTML = '';
    MVP_OPTIONS.forEach(function (o) {
      mvp.appendChild(chip(o.label, settings.mvp === o.value, changeSetting(function () { settings.mvp = o.value; })));
    });

    var ev = $('eventChips'); ev.innerHTML = '';
    ev.appendChild(chip('PC방 5%', settings.pcRoom, changeSetting(function () { settings.pcRoom = !settings.pcRoom; })));
    ev.appendChild(chip('비용 30% 할인', settings.discount30, changeSetting(function () { settings.discount30 = !settings.discount30; })));
    ev.appendChild(chip('파괴확률 30% 감소', settings.destroyDown30, changeSetting(function () { settings.destroyDown30 = !settings.destroyDown30; })));
    ev.appendChild(chip('5·10·15성 100%', settings.lucky5, changeSetting(function () { settings.lucky5 = !settings.lucky5; })));
    ev.appendChild(chip('샤타포스 한 번에', settings.discount30 && settings.destroyDown30, changeSetting(function () {
      var on = !(settings.discount30 && settings.destroyDown30);
      settings.discount30 = on; settings.destroyDown30 = on;
    }), 'sf-chip-preset'));

    var sg = $('safeguardChips'); sg.innerHTML = '';
    D.PROTECT_STARS.forEach(function (s) {
      sg.appendChild(chip(s + '성', !!settings.safeguard[s], changeSetting(function () {
        settings.safeguard[s] = !settings.safeguard[s];
      })));
    });

    if (document.activeElement !== $('startInput')) $('startInput').value = settings.start;
    if (document.activeElement !== $('goalInput')) $('goalInput').value = settings.goal;
    if (document.activeElement !== $('spareInput')) $('spareInput').value = settings.spare ? settings.spare : '';
    $('spareNote').textContent = settings.spare > 0
      ? '파괴 1회마다 ' + meso(settings.spare) + ' 메소가 지출에 더해집니다.'
      : '대체 장비값을 넣으면 파괴 손실까지 지출에 합산합니다.';
  }

  // ---------------------------------------------------------------- 게임 UI

  function stepNow() { return steps[Math.min(session.star, MAX - 1)]; }

  function renderStage() {
    var st = stepNow();
    var done = session.cleared;
    $('stageStar').textContent = session.star;
    $('stageGoal').textContent = '목표 ' + settings.goal + '★';
    $('starBox').classList.toggle('cleared', done);

    var span = Math.max(settings.goal - settings.start, 1);
    var ratio = Math.min(Math.max((session.star - settings.start) / span, 0), 1);
    $('stageBar').style.width = (ratio * 100).toFixed(1) + '%';

    if (done) {
      $('stageOdds').innerHTML = '<b class="odds-win">목표 달성</b> · 다음 판을 시작하세요';
      $('stageCost').textContent = '';
    } else {
      $('stageOdds').innerHTML =
        '성공 <b class="odds-win">' + pct(st.p) + '</b>' +
        ' · 유지 <b>' + pct(Math.max(1 - st.p - st.d, 0)) + '</b>' +
        ' · 파괴 <b class="odds-boom">' + (st.d > 0 ? pct(st.d) : '없음') + '</b>' +
        (st.guarded ? ' <span class="sf-tag">파괴방지</span>' : '');
      $('stageCost').textContent = session.star + '★ → ' + (session.star + 1) + '★ · 1회 ' + st.cost.toLocaleString('ko-KR') + ' 메소';
    }

    $('tape').innerHTML = session.tape.slice(-14).map(function (t) {
      return '<span class="tape-dot ' + t + '"></span>';
    }).join('');

    var one = $('rollBtn'), auto = $('autoBtn');
    one.disabled = done;
    auto.disabled = done;
    auto.innerHTML = (autoTimer ? '정지' : '자동 강화') + '<small>' + (autoTimer ? '자동 진행 중' : '목표까지 계속') + '</small>';
    auto.classList.toggle('active', !!autoTimer);
    $('normalActions').classList.toggle('is-hidden', done);
    $('clearedActions').classList.toggle('is-hidden', !done);
  }

  function renderStats() {
    var parts = [];
    var perRunExp = expTotal;

    // 방금 끝난 판의 등수. 진행 중인 판은 아직 총지출이 정해지지 않아 띄우지 않는다.
    if (session.cleared && session.log.length) {
      var last = session.log[session.log.length - 1];
      parts.push('<div class="stat-tile hero"><div class="label">이번 판 결과</div>' +
        '<div class="value">상위 ' + rankPct(last.rank) + '</div>' +
        '<div class="sub">같은 설정으로 굴린 판 100개 중 ' + Math.max(Math.round(last.rank * 100), 1) + '개만 이만큼 싸게 끝나요</div></div>');
    }

    parts.push('<div class="stage-tiles">' +
      '<div class="stat-tile"><div class="label">이번 판 시도</div><div class="value">' + session.runAttempts + '회</div><div class="sub">기대 ' + num(perRunExp.tries, 1) + '회</div></div>' +
      '<div class="stat-tile"><div class="label">이번 판 파괴</div><div class="value' + (session.runDestroys ? ' boom' : '') + '">' + session.runDestroys + '회</div><div class="sub">기대 ' + num(perRunExp.destroys, 2) + '회</div></div>' +
      '<div class="stat-tile"><div class="label">이번 판 지출</div><div class="value">' + mesoHtml(session.runMeso) + '</div><div class="sub">기대 ' + meso(perRunExp.meso) + '</div></div>' +
      '</div>');

    if (session.runs > 0) {
      var avgActual = session.doneMeso / session.runs;
      var diff = avgActual - perRunExp.meso;
      var median = medianCost();
      parts.push('<div class="stat-tile compare">' +
        '<div class="cmp-col"><div class="label">판당 실제 지출</div><div class="value">' + mesoHtml(avgActual) + '</div></div>' +
        '<div class="cmp-vs">vs</div>' +
        '<div class="cmp-col expected"><div class="label">판당 기대 지출</div><div class="value">' + mesoHtml(perRunExp.meso) + '</div>' +
        '<div class="sub">중앙값 ' + meso(median) + '</div></div>' +
        '<div class="cmp-verdict"><span>판당 손익 · ' + session.runs + '판 평균</span>' + verdict(diff) + '</div>' +
        '<div class="cmp-note">평균 상위 <b>' + rankPct(session.pctSum / session.runs) + '</b> · 평균 시도 ' +
        num(session.doneAttempts / session.runs, 1) + '회 · 평균 파괴 ' +
        num(session.doneDestroys / session.runs, 2) + '회 (기대 ' + num(perRunExp.destroys, 2) + '회)<br>' +
        '판의 절반은 ' + meso(median) + ' 메소 안에 끝나요. 파괴가 몰리는 소수의 판이 평균을 끌어올려서, 기대 지출보다 싸게 끝나는 판이 더 흔합니다.</div>' +
        '</div>');
    }

    // 목표에 도달한 판은 이미 doneMeso에 접혀 있다. 그 상태에서 runMeso를 또 더하면 두 번 센다.
    var liveMeso = session.cleared ? 0 : session.runMeso;
    var totalMeso = session.doneMeso + liveMeso;
    // 1판만 끝나고 진행 중인 판이 없으면 판당 타일과 값이 같으므로 접는다.
    if (totalMeso > 0 && !(session.runs === 1 && liveMeso === 0)) {
      var expSoFar = perRunExp.meso * session.runs;
      parts.push('<div class="stat-tile compare cumulative">' +
        '<div class="cmp-col"><div class="label">누적 실제 지출</div><div class="value">' + mesoHtml(totalMeso) + '</div></div>' +
        '<div class="cmp-vs">vs</div>' +
        '<div class="cmp-col expected"><div class="label">누적 기대 지출</div><div class="value">' + mesoHtml(expSoFar) + '</div></div>' +
        '<div class="cmp-verdict"><span>누적 손익 · ' + (liveMeso > 0 ? session.runs + '판 + 진행 중' : session.runs + '판 전체') + '</span>' +
        verdict(session.doneMeso - expSoFar) + '</div></div>');
    }
    $('simStats').innerHTML = parts.join('');
  }

  function verdict(diff) {
    if (Math.round(diff) === 0) return '<b>기대와 같음</b>';
    return diff > 0
      ? '<b class="bad">' + mesoHtml(diff) + ' 메소 더 씀</b>'
      : '<b class="good">' + mesoHtml(-diff) + ' 메소 덜 씀</b>';
  }

  function renderLog() {
    var box = $('runLog');
    if (!session.log.length) { box.innerHTML = ''; return; }
    var rows = session.log.slice().reverse().map(function (r) {
      return '<div class="run-log-row"><b class="rl-n">' + r.n + '판</b>' +
        '<span>' + r.attempts + '회</span>' +
        '<span class="rl-boom' + (r.destroys ? ' on' : '') + '">파괴 ' + r.destroys + '</span>' +
        '<span class="rl-rank">상위 ' + rankPct(r.rank) + '</span>' +
        '<span class="rl-meso">' + mesoHtml(r.meso) + ' 메소</span></div>';
    }).join('');
    box.innerHTML = '<div class="run-log-head">판별 기록 <small>최신순</small></div>' + rows;
  }

  function flash(kind, text) {
    var el = $('flash');
    el.className = 'sf-flash ' + kind;
    el.textContent = text;
    el.style.animation = 'none';
    void el.offsetWidth; // 같은 결과가 연달아 나와도 애니메이션이 다시 돌도록
    el.style.animation = '';
  }

  // ---------------------------------------------------------------- 한 번 강화

  function attempt() {
    if (session.cleared) { stopAuto(); return; }
    var st = stepNow();
    session.runAttempts++;
    session.runMeso += st.cost;

    var r = Math.random();
    if (r < st.p) {
      session.star++;
      session.tape.push('win');
      if (session.star >= settings.goal) {
        session.runs++;
        session.doneAttempts += session.runAttempts;
        session.doneDestroys += session.runDestroys;
        session.doneMeso += session.runMeso;
        var rank = percentileOf(session.runMeso);
        session.pctSum += rank;
        session.log.push({ n: session.runs, attempts: session.runAttempts, destroys: session.runDestroys, meso: session.runMeso, rank: rank });
        session.cleared = true;
        stopAuto();
        flash('win', settings.goal + '★ 달성!');
      } else {
        flash('win', '성공 · ' + session.star + '★');
      }
    } else if (r < st.p + st.d) {
      session.runDestroys++;
      session.runMeso += settings.spare || 0;
      session.star = RESET;
      session.tape.push('boom');
      flash('boom', '파괴 · ' + RESET + '★로 복구');
    } else {
      session.tape.push('keep');
      flash('keep', '실패 · ' + session.star + '★ 유지');
    }
    renderGame();
  }

  function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }
  function toggleAuto() {
    if (autoTimer) { stopAuto(); renderStage(); return; }
    if (session.cleared) return;
    autoTimer = setInterval(attempt, AUTO_SPEED);
    renderStage();
  }
  function nextRun() {
    session.star = settings.start;
    session.runAttempts = 0; session.runDestroys = 0; session.runMeso = 0;
    session.tape = []; session.cleared = false;
    renderGame();
  }
  // 설정을 바꾸면 지출 기준이 달라져서 누적 비교가 섞인다. 세션을 통째로 새로 연다.
  function restart() { session = newSession(); refresh(); }

  function renderGame() { renderStage(); renderStats(); renderLog(); }

  function refresh() {
    settings.level = Math.min(300, Math.max(1, settings.level || 1));
    settings.start = Math.min(MAX - 1, Math.max(0, settings.start));
    settings.goal = Math.min(MAX, Math.max(settings.start + 1, settings.goal));
    if (!session.cleared && (session.star < settings.start || session.star >= settings.goal)) {
      session.star = settings.start;
    }
    var opts = {
      level: settings.level, start: settings.start, goal: settings.goal, spare: settings.spare,
      mvp: settings.mvp, pcRoom: settings.pcRoom, discount30: settings.discount30,
      destroyDown30: settings.destroyDown30, lucky5: settings.lucky5, safeguard: settings.safeguard
    };
    steps = buildSteps(opts);
    expTotal = expected(opts);
    renderControls();
    renderGame();
    save();
  }

  // 입력 중에도 바로 반영하되, 렌더 뒤 커서를 돌려준다.
  function bindNumber(id, key, min, max) {
    var el = $(id);
    el.addEventListener('input', function () {
      var v = parseInt(el.value, 10);
      if (isNaN(v)) return;
      stopAuto();
      settings[key] = Math.min(max, Math.max(min, v));
      restart();
      el.focus();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    load();
    session = newSession();
    bindNumber('levelInput', 'level', 1, 300);
    bindNumber('startInput', 'start', 0, MAX - 1);
    bindNumber('goalInput', 'goal', 1, MAX);
    $('spareInput').addEventListener('input', function () {
      var el = $('spareInput');
      var raw = el.value.replace(/[^0-9]/g, '');
      stopAuto();
      settings.spare = raw ? parseInt(raw, 10) : 0;
      restart();
      el.focus();
    });
    $('rollBtn').addEventListener('click', function () { stopAuto(); attempt(); });
    $('autoBtn').addEventListener('click', toggleAuto);
    $('nextBtn').addEventListener('click', nextRun);
    $('resetBtn').addEventListener('click', function () { stopAuto(); restart(); });
    refresh();
  });
})();
