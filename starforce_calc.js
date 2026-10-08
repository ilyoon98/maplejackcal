// 스타포스 기댓값 계산기.
//
// 파괴되면 장비가 12성으로 되돌아가기 때문에, "s성 → s+1성" 한 칸의 기댓값에는
// 파괴 후 12성부터 다시 올라오는 비용이 통째로 섞여 들어간다. 그래서 아래 식들은
// 전부 12성부터의 누적값을 끌고 다니는 재귀식이다.
//
//   A[s] = C[s]/p + (d/p) × (스페어비용 + Σ A[12..s-1])     기대 메소
//   N[s] =          (d/p) × (1 + Σ N[12..s-1])              기대 파괴 횟수
//   T[s] = 1/p    + (d/p) × (    Σ T[12..s-1])              기대 시도 횟수
//
// 유도: 파괴도 성공도 아닌 "유지"는 같은 자리에서 다시 굴리는 것뿐이라 기하분포로 접히고,
// 파괴가 났을 때만 12성 복귀 비용이 추가로 붙는다.
(function () {
  var D = window.StarforceData;
  var MAX = D.MAX_STAR;
  var RESET = D.DESTROY_RESET_STAR;

  // ---------------------------------------------------------------- 계산

  function buildSteps(opts) {
    var steps = [];
    for (var s = 0; s < MAX; s++) {
      var r = opts.starcatch === false ? D.BASE_RATES[s] : D.RATES[s];
      var p = r.success, d = r.destroy;

      // 5·10·15성 100% 성공 이벤트
      if (opts.lucky5 && (s === 5 || s === 10 || s === 15)) { p = 1; d = 0; }

      // 21성 이하 파괴확률 30% 감소
      if (opts.destroyDown30 && s <= 21) d *= 0.7;
      var recorded = opts.eventModifiers && opts.eventModifiers[s];
      if (recorded) {
        p = recorded.success === 1 ? 1 : r.success;
        d = recorded.success === 1 ? 0 : r.destroy * (1-recorded.destroyDown);
      }

      var base = D.baseCost(s, opts.level);
      var rate = 1;
      if (s < 17) rate -= (opts.mvp || 0) + (opts.pcRoom ? 0.05 : 0); // 할인은 17성 미만만
      if (opts.discount30) rate -= 0.3;
      if (recorded) {
        rate = 1 - (s < 17 ? (opts.mvp || 0) + (opts.pcRoom ? 0.05 : 0) : 0) - recorded.discount;
      }
      var cost = base * Math.max(rate, 0);

      var guarded = opts.safeguard && opts.safeguard[s] && D.PROTECT_STARS.indexOf(s) >= 0;
      if (guarded) {
        // 파괴방지 추가분에는 할인이 붙지 않는다.
        cost += base * (D.PROTECT_COST_MULTIPLIER - 1);
        d = 0;
      }
      steps.push({ star: s, p: p, d: d, cost: Math.round(cost), guarded: !!guarded });
    }
    return steps;
  }

  function calculate(opts) {
    var steps = buildSteps(opts);
    var spare = opts.spare || 0;
    var per = [];
    var recovery = [];
    // 가이드의 추정 방식: 샤이닝 + 15~17성 파괴방지, 노작값 0의 12성부터 누적 비용.
    var fees = opts.recoveryMode && opts.recoveryMode !== 'off' ? calculate({
      level: opts.level, start: RESET, goal: 22, spare: 0,
      discount30: true, destroyDown30: true, safeguard: {15:true,16:true,17:true}
    }).rows : [];
    var sumMeso = 0, sumDestroy = 0, sumTries = 0; // 12성부터의 누적

    for (var s = 0; s < MAX; s++) {
      var st = steps[s];
      var ratio = st.d / st.p;
      var meso, destroys, tries;
      if (s < RESET) {
        meso = st.cost / st.p;
        destroys = 0;
        tries = 1 / st.p;
      } else {
        var backMeso = sumMeso, backDestroy = sumDestroy, backTries = sumTries;
        var restoreStar = Math.min(s, 22);
        var feeRow = fees[restoreStar - RESET - 1];
        var fee = feeRow ? feeRow.cumMeso * (opts.recoveryDiscount20 ? 0.8 : 1) : 0;
        var copies = restoreStar <= 18 ? 1 : restoreStar <= 20 ? 2 : restoreStar === 21 ? 3 : 4;
        var normalCost = spare + sumMeso;
        var fixedCost = fee + copies * spare;
        var tailMeso = 0, tailDestroy = 0, tailTries = 0;
        for (var j = restoreStar; j < s; j++) {
          tailMeso += per[j].meso; tailDestroy += per[j].destroys; tailTries += per[j].tries;
        }
        fixedCost += tailMeso;
        var useFixed = !!feeRow && (opts.recoveryMode === 'always' || fixedCost < normalCost);
        if (useFixed) {
          backMeso = fixedCost - spare; backDestroy = tailDestroy; backTries = tailTries;
        }
        recovery.push({star:s, restoreStar:restoreStar, fee:fee, copies:copies,
          normalCost:normalCost, fixedCost:fixedCost, useFixed:useFixed, available:!!feeRow, destroy:st.d});
        meso = st.cost / st.p + ratio * (spare + backMeso);
        destroys = ratio * (1 + backDestroy);
        tries = 1 / st.p + ratio * backTries;
        sumMeso += meso; sumDestroy += destroys; sumTries += tries;
      }
      per.push({ star: s, meso: meso, destroys: destroys, tries: tries, step: st });
    }

    // 시작~목표 구간만 더한다. 12성 미만에서 시작해도 파괴 복귀 지점은 언제나 12성이라
    // per[] 값을 그대로 쓸 수 있다.
    var rows = [], total = { meso: 0, destroys: 0, tries: 0 };
    for (var k = opts.start; k < opts.goal; k++) {
      total.meso += per[k].meso;
      total.destroys += per[k].destroys;
      total.tries += per[k].tries;
      rows.push({
        star: k,
        meso: per[k].meso, destroys: per[k].destroys, tries: per[k].tries,
        cumMeso: total.meso, cumDestroys: total.destroys, cumTries: total.tries,
        step: per[k].step
      });
    }
    return { rows: rows, total: total, steps: steps, recovery: recovery };
  }

  // 파괴방지 손익분기.
  //
  // 대체 장비값 R이 붙는 곳은 "파괴 1회당 R" 뿐이라 총 기대 메소는 R에 대해 직선이고,
  // 기울기가 곧 기대 파괴 횟수다.  총비용(R) = 메소(R=0) + R × 파괴횟수
  // 그래서 어떤 성의 파괴방지를 켜고 끈 두 경우를 비교하면
  //
  //   R* = (켠 쪽 메소 - 끈 쪽 메소) / (끈 쪽 파괴 - 켠 쪽 파괴)
  //
  // 노작값이 R*보다 비싸면 파괴방지를 켜는 쪽이 싸다.
  function breakEvenSpare(opts, star) {
    function run(on) {
      var sg = {};
      Object.keys(opts.safeguard || {}).forEach(function (k) { sg[k] = opts.safeguard[k]; });
      sg[star] = on;
      var o = {};
      Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
      o.safeguard = sg;
      o.spare = 0;
      return calculate(o).total;
    }
    var off = run(false), on = run(true);
    var savedDestroys = off.destroys - on.destroys;
    if (savedDestroys <= 1e-12) return { kind: 'none' };        // 이 구간을 아예 안 지나거나 파괴가 0
    var extra = on.meso - off.meso;
    if (extra <= 0) return { kind: 'always' };                  // 켜는 쪽이 노작값과 무관하게 싸다
    return { kind: 'value', spare: extra / savedDestroys, savedDestroys: savedDestroys };
  }

  // 아이템 제작 비용 계산기(item_craft_calc.js)가 같은 재귀식을 그대로 쓴다.
  // 유지 실패는 기하분포로 묶고, 성공/파괴 때만 상태를 이동한다.
  // 전체 표본을 끝내지 못하면 일부 표본으로 백분위를 만들지 않는다.
  function* sampleCosts(opts, count, random, limit, sampleSpare) {
    var res = calculate(opts), samples = [], operations = 0;
    var recovery = {};
    res.recovery.forEach(function (r) { recovery[r.star] = r; });
    if (opts.goal <= opts.start) return null;
    for (var i = 0; i < count; i++) {
      var star = opts.start, spent = 0;
      while (star < opts.goal) {
        if (++operations > limit) return null;
        if (operations % 10000 === 0) yield null;
        var st = res.steps[star], event = st.p + st.d;
        var attempts = event >= 1 ? 1 : Math.floor(Math.log(1 - random()) / Math.log(1 - event)) + 1;
        spent += attempts * st.cost;
        if (random() < st.p / event) star++;
        else {
          var r = recovery[star];
          var copies = r.useFixed ? r.copies : 1;
          spent += r.useFixed ? r.fee : 0;
          // 제작 비용 분포에서는 대체 장비의 추가옵션 비용도 매번 새로 뽑는다.
          if (sampleSpare) {
            for (var copy = 0; copy < copies; copy++) spent += sampleSpare();
          } else spent += copies * (opts.spare || 0);
          star = r.useFixed ? r.restoreStar : RESET;
        }
      }
      samples.push(spent);
    }
    return samples.sort(function (a,b) { return a-b; });
  }

  function percentileProvider(opts) {
    var pending;
    var snapshot = Object.assign({}, opts, {safeguard:Object.assign({}, opts.safeguard)});
    return function (actual) {
      if (!pending) pending = (async function () {
        var seed = 123456789;
        function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
        var gen = sampleCosts(snapshot, 5000, random, 5000000), next;
        do {
          next = gen.next();
          if (!next.done) await new Promise(function (resolve) { setTimeout(resolve, 0); });
        } while (!next.done);
        return next.value;
      })();
      return pending.then(function (samples) {
        if (!samples) return null;
        var lo = 0, hi = samples.length;
        while (lo < hi) { var mid = (lo + hi) >>> 1; if (samples[mid] <= actual) lo = mid + 1; else hi = mid; }
        return {percent:lo / samples.length * 100, samples:samples.length};
      });
    };
  }
  window.StarforceCalc = { calculate: calculate, buildSteps: buildSteps, breakEvenSpare: breakEvenSpare, sampleCosts:sampleCosts };

  // ---------------------------------------------------------------- 표기

  function mesoText(n) {
    if (!isFinite(n)) return '-';
    var rest = Math.round(n);
    var units = [[1e16, '경'], [1e12, '조'], [1e8, '억'], [1e4, '만']];
    var out = [];
    for (var i = 0; i < units.length; i++) {
      var q = Math.floor(rest / units[i][0]);
      if (q > 0) { out.push(q.toLocaleString('en-US') + units[i][1]); rest -= q * units[i][0]; }
      if (out.length === 2) break; // 위에서 두 단위면 충분하다
    }
    if (!out.length) return rest.toLocaleString('en-US') + ' 메소';
    return out.join(' ') + ' 메소';
  }
  function num(n, digits) {
    if (!isFinite(n)) return '-';
    return n.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  // 12.6375% 같은 값이 부동소수점 때문에 12.637%로 깎이지 않도록 자릿수를 고정한 뒤 다듬는다.
  function pct(n) {
    return (n * 100).toFixed(4).replace(/\.?0+$/, '') + '%';
  }

  // ---------------------------------------------------------------- UI

  var LEVEL_PRESETS = [130, 140, 150, 160, 200, 250];
  var MVP_OPTIONS = [
    { value: 0, label: '없음' },
    { value: 0.03, label: '실버' },
    { value: 0.05, label: '골드' },
    { value: 0.10, label: '다이아' }
  ];

  var state = {
    level: 200, start: 12, goal: 22, spare: 0,
    mvp: 0, pcRoom: false,
    discount30: false, destroyDown30: false, lucky5: false,
    safeguard: {}, autoSafeguard: true,
    recoveryMode: 'auto', recoveryDiscount20: false,
    view: 'step'
  };

  function $(id) { return document.getElementById(id); }

  function save() {
    try { localStorage.setItem('starforceCalc', JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    try {
      var raw = localStorage.getItem('starforceCalc');
      if (!raw) return;
      var v = JSON.parse(raw);
      Object.keys(state).forEach(function (k) { if (v[k] !== undefined) state[k] = v[k]; });
    } catch (e) {}
  }

  function chip(label, active, onClick, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sf-chip' + (active ? ' active' : '') + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function renderControls() {
    var lv = $('levelChips');
    lv.innerHTML = '';
    LEVEL_PRESETS.forEach(function (level) {
      lv.appendChild(chip(String(level), state.level === level, function () {
        state.level = level; refresh();
      }, 'sf-chip-level'));
    });
    $('levelInput').value = state.level;

    var mvp = $('mvpChips');
    mvp.innerHTML = '';
    MVP_OPTIONS.forEach(function (o) {
      mvp.appendChild(chip(o.label, state.mvp === o.value, function () { state.mvp = o.value; refresh(); }));
    });

    var ev = $('eventChips');
    ev.innerHTML = '';
    ev.appendChild(chip('PC방 5%', state.pcRoom, function () { state.pcRoom = !state.pcRoom; refresh(); }));
    ev.appendChild(chip('비용 30% 할인', state.discount30, function () { state.discount30 = !state.discount30; refresh(); }));
    ev.appendChild(chip('파괴확률 30% 감소', state.destroyDown30, function () { state.destroyDown30 = !state.destroyDown30; refresh(); }));
    ev.appendChild(chip('5·10·15성 100%', state.lucky5, function () { state.lucky5 = !state.lucky5; refresh(); }));
    ev.appendChild(chip('복구 메소 20% 할인', state.recoveryDiscount20, function () {
      state.recoveryDiscount20 = !state.recoveryDiscount20; refresh();
    }));
    renderSwitch('shiningSwitch', '샤타포스', state.discount30 && state.destroyDown30, function () {
      var on = !(state.discount30 && state.destroyDown30);
      state.discount30 = on; state.destroyDown30 = on; refresh();
    });

    var sg = $('safeguardChips');
    sg.innerHTML = '';
    renderSwitch('safeguardSwitch', '자동 파괴방지', state.autoSafeguard, function () {
      state.autoSafeguard = !state.autoSafeguard; refresh();
    });
    $('safeguardHint').textContent = state.autoSafeguard ? '노작값에 맞춰 선택했어요. 직접 바꾸려면 자동을 꺼 주세요.' : '파괴방지를 켤 구간을 선택하세요.';
    D.PROTECT_STARS.forEach(function (s) {
      var button = chip(s + '→' + (s+1) + '성 · ' + (state.safeguard[s] ? 'ON' : 'OFF'), !!state.safeguard[s], function () {
        if (state.autoSafeguard) return;
        state.safeguard[s] = !state.safeguard[s]; refresh();
      });
      button.disabled = state.autoSafeguard;
      sg.appendChild(button);
    });

    renderSwitch('recoverySwitch', '자동 복구 선택', state.recoveryMode === 'auto', function () {
      state.recoveryMode = state.recoveryMode === 'auto' ? 'off' : 'auto'; refresh();
    });
    $('recoveryHint').textContent = state.recoveryMode === 'auto' ? '파괴되면 확정 복구와 12성 복구 중 더 저렴한 쪽을 선택해요.' : '파괴되면 모두 12성으로 복구해요.';

    $('startInput').value = state.start;
    $('goalInput').value = state.goal;
    $('spareInput').value = state.spare ? state.spare.toLocaleString('en-US') : '';

    $('viewStep').classList.toggle('active', state.view === 'step');
    $('viewCum').classList.toggle('active', state.view === 'cum');
  }

  function renderResult(res) {
    $('resMeso').dataset.expectedUsage = res.total.meso;
    $('resMeso').textContent = mesoText(res.total.meso);
    $('resMesoSub').textContent = Math.round(res.total.meso).toLocaleString('ko-KR') + ' 메소';
    $('resDestroy').textContent = num(res.total.destroys, 2) + ' 회';
    $('resTries').textContent = num(res.total.tries, 1) + ' 회';
    $('resRange').textContent = state.start + '성 → ' + state.goal + '성 · Lv.' + state.level + ' 장비';


    var tb = $('stepTable');
    if (!res.rows.length) {
      tb.innerHTML = '<p class="sf-empty">목표 성이 시작 성보다 높아야 합니다.</p>';
      return;
    }
    var cum = state.view === 'cum';
    var html = '<table class="sf-table"><thead><tr>' +
      '<th>구간</th><th>기대 메소</th><th>기대 파괴</th><th>기대 시도</th><th>성공 / 파괴</th>' +
      '</tr></thead><tbody>';
    res.rows.forEach(function (r) {
      var label = cum ? (state.start + ' ➔ ' + (r.star + 1)) : (r.star + ' ➔ ' + (r.star + 1));
      html += '<tr' + (r.step.guarded ? ' class="guarded"' : '') + '>' +
        '<td>' + label + (r.step.guarded ? ' <span class="sf-tag">방지</span>' : '') + '</td>' +
        '<td class="strong">' + mesoText(cum ? r.cumMeso : r.meso) + '</td>' +
        '<td>' + num(cum ? r.cumDestroys : r.destroys, 2) + '</td>' +
        '<td>' + num(cum ? r.cumTries : r.tries, 1) + '</td>' +
        '<td class="sf-odds">' + pct(r.step.p) + ' / ' + (r.step.d > 0 ? pct(r.step.d) : '-') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    tb.innerHTML = html;
  }

  function renderSafeguardAdvice(opts) {
    var box = $('safeguardAdvice');
    if (opts.recoveryMode !== 'off') {
      var current = calculate(opts).total.meso;
      box.innerHTML = '<table class="sf-table"><thead><tr><th>강화 구간</th><th>현재 설정</th><th>반대로 바꾸면</th></tr></thead><tbody>' + D.PROTECT_STARS.map(function (s) {
        var on = !!opts.safeguard[s];
        var sg = Object.assign({}, opts.safeguard); sg[s] = !on;
        var delta = calculate(Object.assign({}, opts, {safeguard:sg})).total.meso - current;
        return '<tr><td>' + s + ' → ' + (s+1) + '</td><td>' + (on ? 'ON' : 'OFF') + '</td><td>' + (Math.abs(delta) < 1 ? '차이 없음' : mesoText(Math.abs(delta)) + (delta > 0 ? ' 증가' : ' 절약')) + '</td></tr>';
      }).join('') + '</tbody></table>';
      $('spareCompare').textContent = '현재 노작값과 복구 선택을 반영한 총 기대비용 비교입니다. 다른 성의 파괴방지는 현재 설정을 유지합니다.';
      return;
    }
    var rows = D.PROTECT_STARS.map(function (s) {
      return { star: s, r: breakEvenSpare(opts, s) };
    });
    if (rows.every(function (x) { return x.r.kind === 'none'; })) {
      box.innerHTML = '<p class="sf-empty">현재 구간과 이벤트에서는 파괴방지로 줄일 파괴가 없습니다.</p>';
      $('spareCompare').textContent = '';
      return;
    }
    var html = '<table class="sf-table"><thead><tr>' +
      '<th>성</th><th>손익분기 노작값</th><th>줄어드는 파괴</th><th>지금 설정</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (x) {
      var on = !!state.safeguard[x.star], verdict, cls = '';
      if (x.r.kind === 'none') {
        verdict = '해당 없음';
      } else if (x.r.kind === 'always') {
        verdict = on ? '켠 상태 · 이득' : '켜는 게 이득';
        cls = on ? 'good' : 'bad';
      } else {
        var worth = (state.spare || 0) >= x.r.spare;
        verdict = (worth ? '켜는 게 이득' : '끄는 게 이득') + (on === worth ? '' : ' ⚠');
        cls = (on === worth) ? 'good' : 'bad';
      }
      html += '<tr' + (cls ? ' class="' + cls + '"' : '') + '>' +
        '<td>' + x.star + '성' + (on ? ' <span class="sf-tag">방지 ON</span>' : '') + '</td>' +
        '<td class="strong">' + (x.r.kind === 'value' ? mesoText(x.r.spare) + ' 이상' :
                                 x.r.kind === 'always' ? '항상 이득' : '-') + '</td>' +
        '<td>' + (x.r.kind === 'none' ? '-' : num(x.r.savedDestroys || 0, 2) + ' 회') + '</td>' +
        '<td>' + verdict + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    box.innerHTML = html;

    $('spareCompare').textContent = state.spare > 0
      ? '현재 노작값 ' + mesoText(state.spare) + ' 기준으로 판정했습니다.'
      : '노작값 0 메소 기준입니다. 실제 대체 장비값을 입력하면 판정이 달라질 수 있습니다.';
  }

  function renderSwitch(id, label, on, toggle) {
    var host = $(id);
    host.innerHTML = '';
    var button = chip(on ? 'ON' : 'OFF', on, toggle, 'sf-switch');
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', String(on));
    button.setAttribute('aria-label', label);
    host.appendChild(button);
  }

  function renderStrategy(opts, res) {
    $('strategyTitle').textContent = state.autoSafeguard && opts.recoveryMode === 'auto' ? '추천 강화 방식' : '선택한 강화 방식';
    $('safeguardSummary').innerHTML = D.PROTECT_STARS.map(function (s) {
      var on = !!opts.safeguard[s];
      return '<div class="sf-action-card' + (on ? ' is-on' : '') + '"><span>' + s + ' → ' + (s+1) + '성</span><strong>' + (on ? 'ON' : 'OFF') + '</strong></div>';
    }).join('');
    $('safeguardMode').textContent = state.autoSafeguard ? '자동 선택 적용' : '직접 선택 적용';
    var relevant = res.recovery.filter(function (r) { return r.star >= 15 && r.star < opts.goal; });
    var active = relevant.filter(function (r) { return r.destroy > 0; });
    $('recoverySummary').innerHTML = opts.goal <= opts.start ? '<p class="tiny">목표 성을 시작 성보다 높게 설정해 주세요.</p>' :
      !active.length ? '<p class="tiny">이 구간에서는 파괴되지 않아요.</p>' : active.map(function (r) {
        return '<div class="sf-action-card' + (r.useFixed ? ' is-on' : '') + '"><span>' + r.star + '성에서 파괴</span><strong>' + (r.useFixed ? r.restoreStar + '성 확정 복구' : '12성 복구') + '</strong></div>';
      }).join('');
    var reference = calculate(Object.assign({}, opts, {recoveryMode:'always'})).recovery.filter(function (r) { return r.star >= 15 && r.star <= 22; });
    $('recoveryAdvice').innerHTML = '<table class="sf-table"><thead><tr><th>복구할 성</th><th>복구 메소 (추정)</th><th>필요 스페어</th></tr></thead><tbody>' + reference.map(function (r) {
      return '<tr><td>' + r.restoreStar + '성</td><td>' + mesoText(r.fee) + '</td><td>' + r.copies + '개</td></tr>';
    }).join('') + '</tbody></table>';
  }

  function renderReference(res) {
    var html = '<table class="sf-table"><thead><tr>' +
      '<th>구간</th><th>성공</th><th>유지</th><th>파괴</th><th>강화 비용</th>' +
      '</tr></thead><tbody>';
    for (var s = 0; s < MAX; s++) {
      var st = res.steps[s];
      var inRange = s >= state.start && s < state.goal;
      html += '<tr' + (inRange ? ' class="in-range"' : '') + '>' +
        '<td>' + s + ' ➔ ' + (s + 1) + '</td>' +
        '<td>' + pct(st.p) + '</td>' +
        '<td>' + pct(Math.max(1 - st.p - st.d, 0)) + '</td>' +
        '<td>' + (st.d > 0 ? pct(st.d) : '-') + '</td>' +
        '<td>' + st.cost.toLocaleString('ko-KR') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
    $('rateTable').innerHTML = html;
  }

  function refresh() {
    if (state.recoveryMode !== 'off') state.recoveryMode = 'auto';
    state.level = Math.min(300, Math.max(1, state.level || 1));
    state.start = Math.min(MAX - 1, Math.max(0, state.start));
    state.goal = Math.min(MAX, Math.max(0, state.goal));
    var opts = {
      level: state.level, start: state.start, goal: state.goal, spare: state.spare,
      mvp: state.mvp, pcRoom: state.pcRoom, discount30: state.discount30,
      destroyDown30: state.destroyDown30, lucky5: state.lucky5, safeguard: state.safeguard,
      recoveryMode: state.recoveryMode, recoveryDiscount20: state.recoveryDiscount20
    };
    if (state.autoSafeguard) {
      state.safeguard = D.bestSafeguard(opts, function (o) { return calculate(o).total.meso; });
      opts.safeguard = state.safeguard;
    }
    renderControls();
    var res = calculate(opts);
    $('resMeso').actualPercentile = percentileProvider(opts);
    renderResult(res);
    renderStrategy(opts, res);
    renderSafeguardAdvice(opts);
    renderReference(res);
    save();
  }

  // 입력 중에도 바로 다시 계산하되, 커서가 날아가지 않도록 렌더 뒤 포커스를 돌려준다.
  function bindNumber(id, key, min, max) {
    var el = $(id);
    el.addEventListener('input', function () {
      var v = parseInt(el.value, 10);
      if (isNaN(v)) return;
      state[key] = Math.min(max, Math.max(min, v));
      refresh();
      el.focus();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('levelInput')) return; // 계산기 화면이 아닌 페이지에서는 UI를 만들지 않는다
    load();
    bindNumber('levelInput', 'level', 1, 300);
    bindNumber('startInput', 'start', 0, MAX - 1);
    bindNumber('goalInput', 'goal', 1, MAX);
    $('spareInput').addEventListener('input', function () {
      var el = $('spareInput');
      var digitsBefore = el.value.slice(0, el.selectionStart).replace(/\D/g, '').length;
      var raw = el.value.replace(/[^0-9]/g, '');
      state.spare = raw ? parseInt(raw, 10) : 0;
      refresh();
      el.focus();
      var pos = 0, seen = 0;
      while (pos < el.value.length && seen < digitsBefore) { if (/\d/.test(el.value[pos])) seen++; pos++; }
      el.setSelectionRange(pos, pos);
    });
    $('viewStep').addEventListener('click', function () { state.view = 'step'; refresh(); });
    $('viewCum').addEventListener('click', function () { state.view = 'cum'; refresh(); });
    refresh();
  });
})();
