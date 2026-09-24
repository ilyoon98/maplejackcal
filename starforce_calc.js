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
      var r = D.RATES[s];
      var p = r.success, d = r.destroy;

      // 5·10·15성 100% 성공 이벤트
      if (opts.lucky5 && (s === 5 || s === 10 || s === 15)) { p = 1; d = 0; }

      // 21성 이하 파괴확률 30% 감소
      if (opts.destroyDown30 && s <= 21) d *= 0.7;

      var base = D.baseCost(s, opts.level);
      var rate = 1;
      if (s < 17) rate -= (opts.mvp || 0) + (opts.pcRoom ? 0.05 : 0); // 할인은 17성 미만만
      if (opts.discount30) rate -= 0.3;
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
        meso = st.cost / st.p + ratio * (spare + sumMeso);
        destroys = ratio * (1 + sumDestroy);
        tries = 1 / st.p + ratio * sumTries;
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
    return { rows: rows, total: total, steps: steps };
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
    safeguard: {},
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
    ev.appendChild(chip('샤타포스 한 번에', state.discount30 && state.destroyDown30, function () {
      var on = !(state.discount30 && state.destroyDown30);
      state.discount30 = on; state.destroyDown30 = on; refresh();
    }, 'sf-chip-preset'));

    var sg = $('safeguardChips');
    sg.innerHTML = '';
    D.PROTECT_STARS.forEach(function (s) {
      sg.appendChild(chip(s + '성', !!state.safeguard[s], function () {
        state.safeguard[s] = !state.safeguard[s]; refresh();
      }));
    });

    $('startInput').value = state.start;
    $('goalInput').value = state.goal;
    $('spareInput').value = state.spare ? state.spare : '';

    $('viewStep').classList.toggle('active', state.view === 'step');
    $('viewCum').classList.toggle('active', state.view === 'cum');
  }

  function renderResult(res) {
    $('resMeso').textContent = mesoText(res.total.meso);
    $('resMesoSub').textContent = Math.round(res.total.meso).toLocaleString('ko-KR') + ' 메소';
    $('resDestroy').textContent = num(res.total.destroys, 2) + ' 회';
    $('resTries').textContent = num(res.total.tries, 1) + ' 회';
    $('resRange').textContent = state.start + '성 → ' + state.goal + '성 · Lv.' + state.level + ' 장비';

    $('spareNote').textContent = state.spare > 0
      ? '파괴 1회마다 ' + mesoText(state.spare) + '이 추가로 들어갑니다.'
      : '대체 장비값(노작값)을 넣으면 파괴 손실까지 메소로 합산합니다.';

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
    var rows = D.PROTECT_STARS.map(function (s) {
      return { star: s, r: breakEvenSpare(opts, s) };
    });
    if (rows.every(function (x) { return x.r.kind === 'none'; })) {
      box.innerHTML = '<p class="sf-empty">지금 구간에서는 15~17성을 지나지 않아 파괴방지가 의미 없습니다.</p>';
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
      : '노작값이 0이라 지금은 전부 끄는 게 이득으로 나옵니다. 대체 장비값을 넣고 다시 보세요.';
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
    state.level = Math.min(300, Math.max(1, state.level || 1));
    state.start = Math.min(MAX - 1, Math.max(0, state.start));
    state.goal = Math.min(MAX, Math.max(0, state.goal));
    renderControls();
    var opts = {
      level: state.level, start: state.start, goal: state.goal, spare: state.spare,
      mvp: state.mvp, pcRoom: state.pcRoom, discount30: state.discount30,
      destroyDown30: state.destroyDown30, lucky5: state.lucky5, safeguard: state.safeguard
    };
    var res = calculate(opts);
    renderResult(res);
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
    load();
    bindNumber('levelInput', 'level', 1, 300);
    bindNumber('startInput', 'start', 0, MAX - 1);
    bindNumber('goalInput', 'goal', 1, MAX);
    $('spareInput').addEventListener('input', function () {
      var el = $('spareInput');
      var raw = el.value.replace(/[^0-9]/g, '');
      state.spare = raw ? parseInt(raw, 10) : 0;
      refresh();
      el.focus();
    });
    $('viewStep').addEventListener('click', function () { state.view = 'step'; refresh(); });
    $('viewCum').addEventListener('click', function () { state.view = 'cum'; refresh(); });
    refresh();
  });
})();
