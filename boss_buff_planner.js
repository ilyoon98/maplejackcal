// 보스 버프 동선 짜기.
// 보스마다 "배율"(100% = 기준 시간, 200% = 절반)을 적어두면
//  ① 버프 한 번(기본 30분)에 넣을 수 있는 최적 조합
//  ② 등록한 보스를 전부 도는 데 필요한 최소 버프 개수와 그 묶음
// 을 계산한다. 시간은 전부 초 단위 정수로 다뤄 부동소수 오차를 없앤다.
(function () {
  var STORE_KEY = 'bossBuffPlanner.v1';

  // 보스 수익 정산의 '검밑솔 12보스' 프리셋과 같은 구성. 배율은 캐릭터마다 달라서
  // 기본값은 전부 100%로 두고 사용자가 직접 채우게 한다.
  var DEFAULT_BOSSES = [
    { name: '듄켈',               diff: '하드',   icon: 'icons/boss/dunkel.webp' },
    { name: '진 힐라',            diff: '하드',   icon: 'icons/boss/jin_hilla.webp' },
    { name: '더스크',             diff: '카오스', icon: 'icons/boss/dusk.webp' },
    { name: '윌',                 diff: '하드',   icon: 'icons/boss/will.webp' },
    { name: '루시드',             diff: '하드',   icon: 'icons/boss/lucid.webp' },
    { name: '가디언 엔젤 슬라임', diff: '카오스', icon: 'icons/boss/guardian_angel_slime.webp' },
    { name: '데미안',             diff: '하드',   icon: 'icons/boss/damien.webp' },
    { name: '스우',               diff: '하드',   icon: 'icons/boss/suu.webp' },
    { name: '벨룸',               diff: '카오스', icon: 'icons/boss/vellum.webp' },
    { name: '블러디 퀸',          diff: '카오스', icon: 'icons/boss/bloody_queen.webp' },
    { name: '파풀라투스',         diff: '카오스', icon: 'icons/boss/papulatus.webp' },
    { name: '매그너스',           diff: '하드',   icon: 'icons/boss/magnus.webp' }
  ];

  var MAX_EXACT_PACK = 15; // 3^n 부분집합 DP를 돌릴 수 있는 한계. 넘으면 근사(FFD)로 떨어진다.
  var MAX_ENUM = 20;       // 조합 전수조사 한계(2^n).

  var state = loadState();

  function defaultState() {
    return {
      buffMin: 30,
      baseMin: 20,
      moveMin: 1,
      slackMin: 0,
      bosses: DEFAULT_BOSSES.map(function (b, i) {
        return { id: 'b' + i, name: b.name, diff: b.diff, icon: b.icon, mult: 100, on: true, must: false };
      })
    };
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      var s = JSON.parse(raw);
      if (!s || !Array.isArray(s.bosses) || !s.bosses.length) return defaultState();
      s.buffMin = num(s.buffMin, 30);
      s.baseMin = num(s.baseMin, 20);
      s.moveMin = Math.max(0, num(s.moveMin, 1));
      s.slackMin = Math.max(0, num(s.slackMin, 0));
      s.bosses = s.bosses.map(function (b, i) {
        return {
          id: b.id || 'b' + i,
          name: String(b.name || '보스'),
          diff: b.diff || '',
          icon: b.icon || '',
          mult: Math.max(1, num(b.mult, 100)),
          on: b.on !== false,
          must: b.must === true
        };
      });
      return s;
    } catch (err) { return defaultState(); }
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (err) {}
  }
  function num(v, fallback) {
    var n = parseFloat(v);
    return isFinite(n) ? n : fallback;
  }

  // ── 시간 변환 ────────────────────────────────────────────────
  // 배율 100%가 기준 시간(기본 20분), 200%면 그 절반.
  function secOf(mult) { return Math.max(1, Math.round(state.baseMin * 60 * 100 / mult)); }
  function multOf(sec) { return state.baseMin * 60 * 100 / sec; }
  // 한 버프 안에서 보스를 n마리 잡으면 이동은 n-1번.
  function moveSec() { return Math.max(0, Math.round(state.moveMin * 60)); }
  // 풀도핑을 못 했을 때를 대비해 보스마다 얹어두는 여유 시간.
  function slackSec() { return Math.max(0, Math.round(state.slackMin * 60)); }
  function costOf(sumSec, count) { return count > 0 ? sumSec + moveSec() * (count - 1) : 0; }
  function fmt(sec) {
    var m = Math.floor(sec / 60), s = Math.round(sec % 60);
    if (s === 60) { m += 1; s = 0; }
    return s ? m + '분 ' + s + '초' : m + '분';
  }
  function fmtMin(sec) {
    var v = sec / 60;
    return Math.abs(v - Math.round(v)) < 0.005 ? String(Math.round(v)) : v.toFixed(1);
  }

  // ── 최적화 ──────────────────────────────────────────────────
  // 버프 한 번에 담을 수 있는 조합 중 '쓰는 시간이 가장 긴' 순서로 상위 몇 개.
  function bestCombos(items, cap, topN) {
    var n = items.length;
    if (!n || n > MAX_ENUM) return [];
    var total = 1 << n;
    var sums = new Int32Array(total);
    var counts = new Int8Array(total);
    var mustMask = 0;
    items.forEach(function (it, i) { if (it.must) mustMask |= (1 << i); });

    var top = [];
    for (var mask = 1; mask < total; mask++) {
      var low = mask & -mask;
      var idx = Math.log2(low) | 0;
      var rest = mask ^ low;
      var sum = sums[rest] + items[idx].sec;
      var cnt = counts[rest] + 1;
      sums[mask] = sum; counts[mask] = cnt;
      var cost = costOf(sum, cnt); // 이동 시간까지 포함한 실제 소모 시간
      if (cost > cap) continue;
      if ((mask & mustMask) !== mustMask) continue;
      pushTop(top, { mask: mask, sum: cost, count: cnt }, topN);
    }
    return top;
  }
  // 남는 시간이 적은 순 → 같은 시간이면 보스 수가 많은 순.
  function betterCombo(a, b) {
    if (a.sum !== b.sum) return a.sum > b.sum;
    return a.count > b.count;
  }
  function pushTop(top, cand, topN) {
    var i = 0;
    while (i < top.length && betterCombo(top[i], cand)) i++;
    if (i >= topN) return;
    top.splice(i, 0, cand);
    if (top.length > topN) top.length = topN;
  }

  // 등록한 보스를 전부 도는 데 필요한 최소 버프 개수(빈 패킹).
  // n이 작으면 부분집합 DP로 정확히, 크면 큰 것부터 채우는 근사(FFD)로 푼다.
  function packAll(items, cap) {
    var fitIdx = [], overIdx = [];
    items.forEach(function (it, i) { (it.sec <= cap ? fitIdx : overIdx).push(i); });
    var exact = fitIdx.length <= MAX_EXACT_PACK;
    var pack = exact ? packExact(fitIdx, items, cap) : packGreedy(fitIdx, items, cap);
    pack.over = overIdx;
    pack.exact = exact;
    return pack;
  }
  function packExact(idxList, items, cap) {
    var n = idxList.length;
    if (!n) return { bins: [] };
    var total = 1 << n;
    var sums = new Int32Array(total);
    for (var m = 1; m < total; m++) {
      var lb = m & -m;
      sums[m] = sums[m ^ lb] + items[idxList[Math.log2(lb) | 0]].sec;
    }
    var bits = new Int8Array(total);
    for (var q = 1; q < total; q++) bits[q] = bits[q >> 1] + (q & 1);
    var dp = new Int16Array(total);
    var pick = new Int32Array(total);
    for (var mask = 1; mask < total; mask++) {
      dp[mask] = 32000;
      var lowbit = mask & -mask;
      // 최저 비트를 반드시 포함하는 부분집합만 훑으면 같은 묶음을 두 번 세지 않는다.
      for (var sub = mask; sub > 0; sub = (sub - 1) & mask) {
        if (!(sub & lowbit)) continue;
        if (costOf(sums[sub], bits[sub]) > cap) continue;
        var cand = dp[mask ^ sub] + 1;
        if (cand < dp[mask]) { dp[mask] = cand; pick[mask] = sub; }
      }
    }
    var bins = [], cur = total - 1;
    while (cur) {
      var sub = pick[cur];
      bins.push(subToIdx(sub, idxList));
      cur ^= sub;
    }
    return { bins: bins };
  }
  function subToIdx(sub, idxList) {
    var out = [];
    for (var i = 0; i < idxList.length; i++) if (sub & (1 << i)) out.push(idxList[i]);
    return out;
  }
  function packGreedy(idxList, items, cap) {
    var sorted = idxList.slice().sort(function (a, b) { return items[b].sec - items[a].sec; });
    var bins = [], used = [];
    sorted.forEach(function (i) {
      for (var b = 0; b < bins.length; b++) {
        if (costOf(used[b] + items[i].sec, bins[b].length + 1) <= cap) { bins[b].push(i); used[b] += items[i].sec; return; }
      }
      bins.push([i]); used.push(items[i].sec);
    });
    return { bins: bins };
  }

  // ── 렌더 ────────────────────────────────────────────────────
  var listEl = document.getElementById('bossList');
  var comboEl = document.getElementById('comboResult');
  var packEl = document.getElementById('packResult');
  var buffInput = document.getElementById('buffMin');
  var baseInput = document.getElementById('baseMin');
  var moveInput = document.getElementById('moveMin');
  var slackInput = document.getElementById('slackMin');

  function activeItems() {
    return state.bosses.filter(function (b) { return b.on; }).map(function (b) {
      return { name: b.name, diff: b.diff, icon: b.icon, must: b.must, sec: secOf(b.mult) + slackSec(), mult: b.mult };
    });
  }

  function renderList() {
    listEl.innerHTML = '';
    state.bosses.forEach(function (b, i) {
      var sec = secOf(b.mult);
      var row = document.createElement('div');
      row.className = 'boss-row' + (b.on ? '' : ' off');
      row.innerHTML =
        // 탭 키가 배율 칸만 따라 내려가도록 나머지 조작부는 탭 순서에서 뺀다.
        '<label class="row-check"><input type="checkbox" tabindex="-1" data-act="on" data-i="' + i + '"' + (b.on ? ' checked' : '') + '></label>' +
        (b.icon ? '<img class="row-icon" src="' + b.icon + '" alt="" loading="lazy">' : '<span class="row-icon blank"></span>') +
        '<div class="row-name"><strong>' + esc(b.name) + '</strong>' + (b.diff ? '<small>' + esc(b.diff) + '</small>' : '') + '</div>' +
        '<div class="row-input"><input type="number" min="1" step="10" value="' + trim(b.mult) + '" data-act="mult" data-i="' + i + '"><span class="unit">%</span></div>' +
        '<div class="row-input"><input type="number" tabindex="-1" min="0.1" step="0.5" value="' + trim(sec / 60) + '" data-act="time" data-i="' + i + '"><span class="unit">분</span></div>' +
        '<button type="button" tabindex="-1" class="row-btn pin' + (b.must ? ' on' : '') + '" data-act="must" data-i="' + i + '" title="이 보스는 무조건 포함">📌</button>' +
        '<button type="button" tabindex="-1" class="row-btn del" data-act="del" data-i="' + i + '" title="목록에서 삭제">✕</button>';
      listEl.appendChild(row);
    });
  }
  function trim(v) {
    return String(Math.abs(v - Math.round(v)) < 0.005 ? Math.round(v) : Math.round(v * 10) / 10);
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderResults() {
    var items = activeItems();
    var cap = Math.round(state.buffMin * 60);

    // ① 버프 한 번 최적 조합
    if (!items.length) {
      comboEl.innerHTML = '<p class="empty">보스를 하나 이상 켜주세요.</p>';
      packEl.innerHTML = '';
      return;
    }
    if (items.length > MAX_ENUM) {
      comboEl.innerHTML = '<p class="empty">보스가 너무 많습니다(최대 ' + MAX_ENUM + '마리).</p>';
    } else {
      var top = bestCombos(items, cap, 5);
      comboEl.innerHTML = top.length
        ? top.map(function (c, rank) { return comboCard(c, items, cap, rank); }).join('')
        : '<p class="empty">버프 ' + fmt(cap) + ' 안에 들어가는 조합이 없습니다. 📌 필수 지정이나 버프 시간을 확인해 주세요.</p>';
    }

    // ② 켜둔 보스를 전부 도는 루트
    var res = packAll(items, cap);
    var bins = res.bins
      .map(function (bin) { return bin.slice().sort(function (a, b) { return items[b].sec - items[a].sec; }); })
      .sort(function (a, b) { return binCost(b, items) - binCost(a, items); });
    var usedSec = bins.reduce(function (a, bin) { return a + binCost(bin, items); }, 0);
    var clearSec = bins.reduce(function (a, bin) { return a + binSec(bin, items); }, 0);
    var waste = bins.length * cap - usedSec;
    var moveCnt = bins.reduce(function (a, bin) { return a + Math.max(0, bin.length - 1); }, 0);
    var bossCnt = bins.reduce(function (a, bin) { return a + bin.length; }, 0);
    var slackTotal = bossCnt * slackSec();

    var html = '<div class="pack-head">' +
      '<div>버프 <span class="big">' + bins.length + '</span>개로 ' +
      (items.length - res.over.length) + '마리 전부 돌 수 있어요</div>' +
      '<p class="note">보스 처치 ' + fmt(clearSec - slackTotal) +
      (slackTotal ? ' + 여유 ' + bossCnt + '마리 ' + fmt(slackTotal) : '') +
      ' + 이동 ' + moveCnt + '회 ' + fmt(moveCnt * moveSec()) +
      ' = 실제 사용 ' + fmt(usedSec) + ' · 남는 버프 시간 ' + fmt(waste) + '</p>' +
      (res.exact ? '' : '<p class="note warn">보스가 많아 근사 계산으로 묶었습니다.</p>') +
      '</div>';
    html += bins.map(function (bin, i) {
      var sec = binCost(bin, items);
      var left = cap - sec;
      return '<div class="pack-bin">' +
        '<div class="combo-head"><strong>버프 ' + (i + 1) + '</strong>' +
        '<span class="bin-time">' + fmt(sec) + ' / ' + fmt(cap) + '</span>' +
        '<span class="bin-left' + (left === 0 ? ' zero' : '') + '">' + (left === 0 ? '딱 맞음' : '남음 ' + fmt(left)) + '</span>' +
        '<span class="cnt">' + bin.length + '마리</span></div>' +
        bar(sec, cap) +
        '<div class="route">' + bin.map(function (k, j) {
          return (j ? '<span class="move">→ 이동 ' + fmtMin(moveSec()) + '분 →</span>' : '') +
            '<span class="step-no">' + (j + 1) + '</span>' + chip(items[k]);
        }).join('') + '</div>' +
        '</div>';
    }).join('');
    if (res.over.length) {
      html += '<p class="empty warn">버프 시간보다 오래 걸려 넣을 수 없는 보스: ' +
        res.over.map(function (i) { return esc(items[i].name); }).join(', ') + '</p>';
    }
    packEl.innerHTML = html;
  }
  function binSec(bin, items) {
    return bin.reduce(function (a, i) { return a + items[i].sec; }, 0);
  }
  function binCost(bin, items) {
    return costOf(binSec(bin, items), bin.length);
  }
  function comboCard(c, items, cap, rank) {
    var picked = [];
    for (var i = 0; i < items.length; i++) if (c.mask & (1 << i)) picked.push(items[i]);
    var left = cap - c.sum;
    return '<div class="combo' + (rank === 0 ? ' best' : '') + '">' +
      '<div class="combo-head">' +
      (rank === 0 ? '<span class="badge">추천</span>' : '<span class="badge alt">대안 ' + rank + '</span>') +
      '<span class="bin-time">' + fmt(c.sum) + ' / ' + fmt(cap) + '</span>' +
      '<span class="bin-left' + (left === 0 ? ' zero' : '') + '">' + (left === 0 ? '딱 맞음' : '남음 ' + fmt(left)) + '</span>' +
      '<span class="cnt">' + picked.length + '마리</span>' +
      '</div>' +
      bar(c.sum, cap) +
      '<div class="chips">' + picked.map(chip).join('') + '</div>' +
      '</div>';
  }
  function chip(it) {
    return '<span class="chip">' + (it.icon ? '<img src="' + it.icon + '" alt="" loading="lazy">' : '') +
      esc(it.name) + '<small>' + fmtMin(it.sec) + '분</small></span>';
  }
  function bar(sec, cap) {
    var pct = Math.min(100, sec / cap * 100);
    return '<div class="bar"><span style="width:' + pct.toFixed(2) + '%"></span></div>';
  }

  function renderAll() { renderList(); renderResults(); }

  // ── 이벤트 ──────────────────────────────────────────────────
  listEl.addEventListener('input', function (e) {
    var t = e.target, i = parseInt(t.dataset.i, 10);
    if (isNaN(i)) return;
    var b = state.bosses[i];
    var row = t.closest('.boss-row');
    if (t.dataset.act === 'mult') {
      b.mult = Math.max(1, num(t.value, b.mult));
      // 입력 중인 칸은 그대로 두고 짝이 되는 칸만 갱신한다(커서가 튀지 않게).
      row.querySelector('[data-act="time"]').value = trim(secOf(b.mult) / 60);
    } else if (t.dataset.act === 'time') {
      var min = Math.max(0.1, num(t.value, 1));
      b.mult = Math.round(multOf(min * 60) * 10) / 10;
      row.querySelector('[data-act="mult"]').value = trim(b.mult);
    } else if (t.dataset.act === 'on') {
      b.on = t.checked;
      row.classList.toggle('off', !b.on);
    } else return;
    saveState(); renderResults();
  });
  listEl.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;
    var i = parseInt(t.dataset.i, 10);
    if (isNaN(i)) return;
    if (t.dataset.act === 'must') state.bosses[i].must = !state.bosses[i].must;
    else if (t.dataset.act === 'del') state.bosses.splice(i, 1);
    else return;
    saveState(); renderAll();
  });

  buffInput.value = trim(state.buffMin);
  baseInput.value = trim(state.baseMin);
  buffInput.addEventListener('input', function () {
    state.buffMin = Math.max(1, num(buffInput.value, 30));
    saveState(); renderResults();
  });
  baseInput.addEventListener('input', function () {
    state.baseMin = Math.max(1, num(baseInput.value, 20));
    saveState(); renderAll();
  });
  moveInput.value = trim(state.moveMin);
  moveInput.addEventListener('input', function () {
    state.moveMin = Math.max(0, num(moveInput.value, 1));
    saveState(); renderResults();
  });
  slackInput.value = trim(state.slackMin);
  slackInput.addEventListener('input', function () {
    state.slackMin = Math.max(0, num(slackInput.value, 0));
    saveState(); renderResults();
  });

  var newName = document.getElementById('newName');
  var newMult = document.getElementById('newMult');
  function addBoss() {
    var name = (newName.value || '').trim() || '새 보스';
    state.bosses.push({
      id: 'c' + Date.now(), name: name, diff: '', icon: '',
      mult: Math.max(1, num(newMult.value, 100)), on: true, must: false
    });
    newName.value = '';
    newMult.value = '100';
    saveState(); renderAll();
    newName.focus();
  }
  document.getElementById('addBoss').addEventListener('click', addBoss);
  [newName, newMult].forEach(function (el) {
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') addBoss(); });
  });
  document.getElementById('resetBtn').addEventListener('click', function () {
    if (!confirm('입력한 배율을 모두 초기값으로 되돌릴까요?')) return;
    state = defaultState();
    buffInput.value = trim(state.buffMin);
    baseInput.value = trim(state.baseMin);
    moveInput.value = trim(state.moveMin);
    slackInput.value = trim(state.slackMin);
    saveState(); renderAll();
  });
  document.getElementById('allOn').addEventListener('click', function () {
    state.bosses.forEach(function (b) { b.on = true; });
    saveState(); renderAll();
  });
  document.getElementById('allOff').addEventListener('click', function () {
    state.bosses.forEach(function (b) { b.on = false; });
    saveState(); renderAll();
  });

  renderAll();
})();
