// 보스 버프 동선 짜기.
// 보스마다 "배율"(100% = 기준 시간, 200% = 절반)을 적어두면
//  ① 켜둔 보스를 전부 도는 데 필요한 최소 버프 개수와 판마다의 순서
//  ② 버프를 한 번만 쓸 때 가장 알찬 조합
// 을 계산한다. 시간은 전부 초 단위 정수로 다뤄 부동소수 오차를 없앤다.
//
// 쌀도핑 모드를 켜면 판(버프 한 번)마다 도핑 상태가 갈린다. 풀도핑 판에서는 적어둔
// 배율 그대로, 쌀도핑 판에서는 배율의 97%로 계산하고, 풀도핑을 쓸 수 있는 판 수를
// 제한한 채로 "어느 보스를 풀도핑 판에 몰아야 버프를 가장 적게 쓰는지"까지 푼다.
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

  // 배율과 무관하게 그 보스에서 더 걸리는 시간(분). 젠 대기·컷신·페이즈 이동 같은 것들.
  var DEFAULT_EXTRA = { '윌': 4 };
  var RICE_RATE = 0.97;      // 쌀도핑 판의 배율 = 적어둔 배율의 97%(%P가 아니라 상대값).
  var MAX_EXACT_1 = 15;      // 판 종류가 하나뿐일 때 3^n DP 한계.
  var MAX_EXACT_2 = 13;      // 풀/쌀 두 종류를 같이 풀 때는 (F+1)배 무거워서 더 낮게.
  var MAX_ENUM = 20;         // 조합 전수조사 한계(2^n).
  var BIN_W = 1000000;       // DP 점수: 버프 한 개 = 100만점. 남는 초 단위 비교보다 항상 우선한다.
  var INF = 0x3fffffff;

  var state = loadState();

  function defaultState() {
    return {
      buffMin: 30,
      baseMin: 20,
      moveMin: 1,
      slackPct: 0,
      rice: false,
      fullRuns: 1,
      bosses: DEFAULT_BOSSES.map(function (b, i) {
        return { id: 'b' + i, name: b.name, diff: b.diff, icon: b.icon, mult: 100, extra: DEFAULT_EXTRA[b.name] || 0, on: true };
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
      s.slackPct = Math.max(0, num(s.slackPct, 0));
      s.rice = s.rice === true;
      s.fullRuns = Math.max(0, Math.round(num(s.fullRuns, 1)));
      s.bosses = s.bosses.map(function (b, i) {
        return {
          id: b.id || 'b' + i,
          name: String(b.name || '보스'),
          diff: b.diff || '',
          icon: b.icon || '',
          mult: Math.max(1, num(b.mult, 100)),
          extra: DEFAULT_EXTRA[b.name] || 0,
          on: b.on !== false
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
  function riceSecOf(mult) { return secOf(mult * RICE_RATE); }
  // 여유 %: 처치 시간을 그 비율만큼 늘려 잡는다(고정 추가 시간에는 붙이지 않는다).
  function withSlack(sec) { return Math.max(1, Math.round(sec * (1 + state.slackPct / 100))); }
  function extraSec(b) { return Math.max(0, Math.round((b.extra || 0) * 60)); }
  // 한 버프 안에서 보스를 n마리 잡으면 이동은 n-1번.
  function moveSec() { return Math.max(0, Math.round(state.moveMin * 60)); }
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
  // 판 종류(풀/쌀)에 따른 보스 한 마리 소요 시간.
  function secIn(item, full) { return full ? item.full : item.riceSec; }

  // ── 최적화 ──────────────────────────────────────────────────
  // 버프 한 번에 담을 수 있는 조합 중 '쓰는 시간이 가장 긴' 순서로 상위 몇 개.
  function bestCombos(items, cap, topN, full) {
    var n = items.length;
    if (!n || n > MAX_ENUM) return [];
    var total = 1 << n;
    var sums = new Int32Array(total);
    var counts = new Int8Array(total);
    var top = [];
    for (var mask = 1; mask < total; mask++) {
      var low = mask & -mask;
      var idx = Math.log2(low) | 0;
      var rest = mask ^ low;
      var sum = sums[rest] + secIn(items[idx], full);
      var cnt = counts[rest] + 1;
      sums[mask] = sum; counts[mask] = cnt;
      var cost = costOf(sum, cnt); // 이동 시간까지 포함한 실제 소모 시간
      if (cost > cap) continue;
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

  // 켜둔 보스를 전부 도는 데 필요한 최소 버프 개수(빈 패킹).
  // maxFull = 풀도핑을 쓸 수 있는 판 수(쌀도핑 모드가 꺼져 있으면 Infinity).
  // 반환 bins: [{ idx:[보스 index...], full:bool }]
  function packAll(items, cap, maxFull) {
    var fitIdx = [], overIdx = [];
    items.forEach(function (it, i) {
      // 풀도핑 판에서도 버프 시간을 넘기면 어떤 판에도 못 들어간다.
      (it.full <= cap ? fitIdx : overIdx).push(i);
    });
    var twoKind = isFinite(maxFull);
    var limit = twoKind ? MAX_EXACT_2 : MAX_EXACT_1;
    var exact = fitIdx.length <= limit;
    var bins = exact
      ? (twoKind ? packExactMixed(fitIdx, items, cap, maxFull) : packExactSingle(fitIdx, items, cap))
      : packGreedy(fitIdx, items, cap, maxFull);
    // 풀도핑 판 수를 제한하면 '쌀도핑으론 시간 초과 + 풀도핑 판은 다 씀'이라 못 넣는 보스가 생길 수 있다.
    var placed = Object.create(null);
    bins.forEach(function (bin) { bin.idx.forEach(function (i) { placed[i] = 1; }); });
    var stuck = fitIdx.filter(function (i) { return !placed[i]; });
    return { bins: bins, over: overIdx, stuck: stuck, exact: exact };
  }

  // 부분집합 합/개수 미리 계산. sums는 판 종류별로 따로 필요하다.
  function subsetSums(idxList, items, full) {
    var total = 1 << idxList.length;
    var sums = new Int32Array(total);
    for (var m = 1; m < total; m++) {
      var lb = m & -m;
      sums[m] = sums[m ^ lb] + secIn(items[idxList[Math.log2(lb) | 0]], full);
    }
    return sums;
  }
  function popcounts(total) {
    var bits = new Int8Array(total);
    for (var q = 1; q < total; q++) bits[q] = bits[q >> 1] + (q & 1);
    return bits;
  }

  // 판 종류가 하나뿐(전부 풀도핑)일 때: 고전적인 최소 빈 패킹.
  function packExactSingle(idxList, items, cap) {
    var n = idxList.length;
    if (!n) return [];
    var total = 1 << n;
    var sums = subsetSums(idxList, items, true);
    var bits = popcounts(total);
    var dp = new Int32Array(total);
    var pick = new Int32Array(total);
    for (var mask = 1; mask < total; mask++) {
      dp[mask] = INF;
      var lowbit = mask & -mask;
      // 최저 비트를 반드시 포함하는 부분집합만 훑으면 같은 묶음을 두 번 세지 않는다.
      for (var sub = mask; sub > 0; sub = (sub - 1) & mask) {
        if (!(sub & lowbit)) continue;
        var c = costOf(sums[sub], bits[sub]);
        if (c > cap) continue;
        // 점수 = 버프 개수 × BIN_W + 실제 사용 시간. 버프 수가 우선, 같으면 시간이 짧은 쪽.
        var cand = dp[mask ^ sub] + BIN_W + c;
        if (cand < dp[mask]) { dp[mask] = cand; pick[mask] = sub; }
      }
    }
    var bins = [], cur = total - 1;
    while (cur) {
      var sub = pick[cur];
      bins.push({ idx: subToIdx(sub, idxList), full: true });
      cur ^= sub;
    }
    return bins;
  }

  // 풀도핑 판을 f개까지만 쓸 수 있을 때의 최소 빈 패킹.
  // dp[f][mask] = 풀도핑 판을 f개 이하로 써서 mask를 전부 도는 최소 버프 수.
  function packExactMixed(idxList, items, cap, maxFull) {
    var n = idxList.length;
    if (!n) return [];
    var total = 1 << n;
    var F = Math.min(maxFull, n);
    var sumFull = subsetSums(idxList, items, true);
    var sumRice = subsetSums(idxList, items, false);
    var bits = popcounts(total);
    var fitFull = new Uint8Array(total);
    var fitRice = new Uint8Array(total);
    for (var m = 1; m < total; m++) {
      fitFull[m] = costOf(sumFull[m], bits[m]) <= cap ? 1 : 0;
      fitRice[m] = costOf(sumRice[m], bits[m]) <= cap ? 1 : 0;
    }
    var dp = new Int32Array((F + 1) * total);
    var pickSub = new Int32Array((F + 1) * total);
    var pickFull = new Uint8Array((F + 1) * total);
    for (var f = 0; f <= F; f++) {
      var base = f * total;
      for (var mask = 1; mask < total; mask++) {
        var best = INF, bSub = 0, bFull = 0;
        var lowbit = mask & -mask;
        for (var sub = mask; sub > 0; sub = (sub - 1) & mask) {
          if (!(sub & lowbit)) continue;
          var rest = mask ^ sub;
          if (fitRice[sub]) {
            var c1 = dp[base + rest] + BIN_W + costOf(sumRice[sub], bits[sub]);
            if (c1 < best) { best = c1; bSub = sub; bFull = 0; }
          }
          if (f > 0 && fitFull[sub]) {
            // 풀도핑 판은 쓸 수 있으면 쓰는 게 이득이라, 시간이 짧아 자연히 우선된다.
            var c2 = dp[base - total + rest] + BIN_W + costOf(sumFull[sub], bits[sub]);
            if (c2 < best) { best = c2; bSub = sub; bFull = 1; }
          }
        }
        dp[base + mask] = best;
        pickSub[base + mask] = bSub;
        pickFull[base + mask] = bFull;
      }
    }
    var bins = [], cur = total - 1, fl = F;
    while (cur) {
      var i = fl * total + cur;
      var s = pickSub[i];
      if (!s) break; // 안전장치: 못 채우는 경우
      var isFull = pickFull[i] === 1;
      bins.push({ idx: subToIdx(s, idxList), full: isFull });
      cur ^= s;
      if (isFull) fl--;
    }
    return bins;
  }
  function subToIdx(sub, idxList) {
    var out = [];
    for (var i = 0; i < idxList.length; i++) if (sub & (1 << i)) out.push(idxList[i]);
    return out;
  }
  // 보스가 너무 많을 때의 근사: 오래 걸리는 보스부터 풀도핑 판에 먼저 채운다.
  function packGreedy(idxList, items, cap, maxFull) {
    var sorted = idxList.slice().sort(function (a, b) { return items[b].full - items[a].full; });
    var bins = [], used = [], fullLeft = isFinite(maxFull) ? maxFull : Infinity;
    sorted.forEach(function (i) {
      for (var b = 0; b < bins.length; b++) {
        var sec = secIn(items[i], bins[b].full);
        if (costOf(used[b] + sec, bins[b].idx.length + 1) <= cap) {
          bins[b].idx.push(i); used[b] += sec; return;
        }
      }
      var makeFull = fullLeft > 0;
      if (makeFull) fullLeft--;
      if (secIn(items[i], makeFull) > cap && !makeFull) { makeFull = true; } // 쌀도핑으론 못 넣는 보스
      bins.push({ idx: [i], full: makeFull });
      used.push(secIn(items[i], makeFull));
    });
    return bins;
  }

  // ── 렌더 ────────────────────────────────────────────────────
  var listEl = document.getElementById('bossList');
  var comboEl = document.getElementById('comboResult');
  var packEl = document.getElementById('packResult');
  var buffInput = document.getElementById('buffMin');
  var baseInput = document.getElementById('baseMin');
  var moveInput = document.getElementById('moveMin');
  var slackInput = document.getElementById('slackPct');
  var fullRunsWrap = document.getElementById('fullRunsWrap');
  var fullRunsInput = document.getElementById('fullRuns');
  var riceBtn = document.getElementById('riceBtn');

  function maxFullRuns() { return state.rice ? state.fullRuns : Infinity; }

  function activeItems() {
    return state.bosses.filter(function (b) { return b.on; }).map(function (b) {
      return {
        name: b.name, diff: b.diff, icon: b.icon, mult: b.mult, extra: b.extra,
        full: withSlack(secOf(b.mult)) + extraSec(b),
        riceSec: withSlack(riceSecOf(b.mult)) + extraSec(b)
      };
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
        '<div class="row-name"><strong>' + esc(b.name) + '</strong><small>' + esc(b.diff || '') +
        (b.extra ? (b.diff ? ' · ' : '') + '+' + trim(b.extra) + '분' : '') + '</small></div>' +
        '<div class="row-input"><input type="number" min="1" step="10" value="' + trim(b.mult) + '" data-act="mult" data-i="' + i + '"><span class="unit">%</span></div>' +
        '<div class="row-input"><input type="number" tabindex="-1" min="0.1" step="0.5" value="' + trim(sec / 60) + '" data-act="time" data-i="' + i + '"><span class="unit">분</span></div>' +
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
    if (!items.length) {
      comboEl.innerHTML = '<p class="empty">보스를 하나 이상 켜주세요.</p>';
      packEl.innerHTML = '';
      return;
    }
    renderPack(items, cap);
    renderCombos(items, cap);
  }

  // ① 켜둔 보스를 전부 도는 루트
  function renderPack(items, cap) {
    var res = packAll(items, cap, maxFullRuns());
    var bins = res.bins.slice();
    bins.forEach(function (bin) {
      bin.idx.sort(function (a, b) { return secIn(items[b], bin.full) - secIn(items[a], bin.full); });
      bin.sec = binCost(bin, items);
    });
    // 풀도핑 판을 먼저, 그 안에서는 빡빡한 판부터.
    bins.sort(function (a, b) { return (b.full - a.full) || (b.sec - a.sec); });

    var usedSec = bins.reduce(function (a, bin) { return a + bin.sec; }, 0);
    var clearSec = bins.reduce(function (a, bin) { return a + binSec(bin, items); }, 0);
    var waste = bins.length * cap - usedSec;
    var moveCnt = bins.reduce(function (a, bin) { return a + Math.max(0, bin.idx.length - 1); }, 0);
    var fullCnt = bins.filter(function (b) { return b.full; }).length;

    var bossCnt = bins.reduce(function (a, bin) { return a + bin.idx.length; }, 0);
    var html = '<div class="pack-head">' +
      '<div class="pack-title">버프 <span class="big">' + bins.length + '</span>개 · 보스 ' + bossCnt + '마리</div>' +
      (state.rice
        ? '<div class="tag-row"><span class="tag full">풀도핑 ' + fullCnt + '판</span>' +
          '<span class="tag rice">쌀도핑 ' + (bins.length - fullCnt) + '판</span></div>'
        : '') +
      '<p class="note">처치 ' + fmt(clearSec) + ' + 이동 ' + moveCnt + '회 ' + fmt(moveCnt * moveSec()) +
      ' = <b>' + fmt(usedSec) + '</b> 사용 · 남는 시간 ' + fmt(waste) + '</p>' +
      (res.exact ? '' : '<p class="note warn">보스가 많아 근사 계산으로 묶었습니다.</p>') +
      '</div>';

    html += bins.map(function (bin, i) {
      var left = cap - bin.sec;
      return '<div class="pack-bin' + (bin.full ? '' : ' rice') + '">' +
        '<div class="bin-head"><strong>버프 ' + (i + 1) + '</strong>' +
        (state.rice ? '<span class="tag ' + (bin.full ? 'full">풀도핑' : 'rice">쌀도핑 −3%') + '</span>' : '') +
        '<span class="cnt">' + bin.idx.length + '마리</span></div>' +
        bar(bin.sec, cap) +
        '<div class="bin-meta"><span class="bin-time">' + fmt(bin.sec) + ' / ' + fmt(cap) + '</span>' +
        '<span class="bin-left' + (left === 0 ? ' zero' : '') + '">' + (left === 0 ? '딱 맞음' : '남음 ' + fmt(left)) + '</span></div>' +
        '<ol class="route">' + bin.idx.map(function (k, j) {
          var it = items[k];
          return (j ? '<li class="hop"><span>↓ 이동 ' + fmtMin(moveSec()) + '분</span></li>' : '') +
            '<li class="stop"><span class="step-no">' + (j + 1) + '</span>' +
            (it.icon ? '<img src="' + it.icon + '" alt="" loading="lazy">' : '') +
            '<span class="nm">' + esc(it.name) + '</span>' +
            '<span class="tm">' + fmtMin(secIn(it, bin.full)) + '분</span></li>';
        }).join('') + '</ol>' +
        '</div>';
    }).join('');

    if (res.over.length) {
      html += '<p class="empty warn">버프 시간보다 오래 걸려 넣을 수 없는 보스: ' +
        res.over.map(function (i) { return esc(items[i].name); }).join(', ') + '</p>';
    }
    if (res.stuck.length) {
      html += '<p class="empty warn">풀도핑 판이 모자라 못 넣은 보스: ' +
        res.stuck.map(function (i) { return esc(items[i].name); }).join(', ') +
        ' — 풀도핑 판 수를 늘려주세요.</p>';
    }
    packEl.innerHTML = html;
  }

  // ② 버프를 한 번만 쓸 때
  function renderCombos(items, cap) {
    if (items.length > MAX_ENUM) {
      comboEl.innerHTML = '<p class="empty">보스가 너무 많습니다(최대 ' + MAX_ENUM + '마리).</p>';
      return;
    }
    var full = !state.rice || state.fullRuns > 0; // 풀도핑 판이 하나도 없으면 쌀도핑 기준
    var top = bestCombos(items, cap, 5, full);
    comboEl.innerHTML = (state.rice ? '<p class="note" style="margin:0 0 2px">' + (full ? '풀도핑' : '쌀도핑 −3%') + ' 판 기준</p>' : '') +
      (top.length
        ? top.map(function (c, rank) { return comboCard(c, items, cap, rank, full); }).join('')
        : '<p class="empty">버프 ' + fmt(cap) + ' 안에 들어가는 조합이 없습니다. 버프 시간이나 배율을 확인해 주세요.</p>');
  }

  function binSec(bin, items) {
    return bin.idx.reduce(function (a, i) { return a + secIn(items[i], bin.full); }, 0);
  }
  function binCost(bin, items) {
    return costOf(binSec(bin, items), bin.idx.length);
  }
  function comboCard(c, items, cap, rank, full) {
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
      '<div class="chips">' + picked.map(function (it) { return chip(it, full); }).join('') + '</div>' +
      '</div>';
  }
  function chip(it, full) {
    return '<span class="chip">' + (it.icon ? '<img src="' + it.icon + '" alt="" loading="lazy">' : '') +
      esc(it.name) + '<small>' + fmtMin(secIn(it, full)) + '분</small></span>';
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
    if (t.dataset.act === 'del') state.bosses.splice(i, 1);
    else return;
    saveState(); renderAll();
  });

  buffInput.value = trim(state.buffMin);
  baseInput.value = trim(state.baseMin);
  moveInput.value = trim(state.moveMin);
  fullRunsInput.value = String(state.fullRuns);
  buffInput.addEventListener('input', function () {
    state.buffMin = Math.max(1, num(buffInput.value, 30));
    saveState(); renderResults();
  });
  baseInput.addEventListener('input', function () {
    state.baseMin = Math.max(1, num(baseInput.value, 20));
    saveState(); renderAll();
  });
  moveInput.addEventListener('input', function () {
    state.moveMin = Math.max(0, num(moveInput.value, 1));
    saveState(); renderResults();
  });
  slackInput.value = trim(state.slackPct);
  slackInput.addEventListener('input', function () {
    state.slackPct = Math.max(0, num(slackInput.value, 0));
    saveState(); renderResults();
  });
  fullRunsInput.addEventListener('input', function () {
    state.fullRuns = Math.max(0, Math.round(num(fullRunsInput.value, 1)));
    saveState(); renderResults();
  });

  // 쌀도핑 토글: 켜져 있는 동안만 판마다 도핑 여부가 갈린다.
  function syncRice() {
    riceBtn.classList.toggle('on', state.rice);
    riceBtn.setAttribute('aria-pressed', String(state.rice));
    fullRunsWrap.classList.toggle('hidden', !state.rice);
  }
  riceBtn.addEventListener('click', function () {
    state.rice = !state.rice;
    syncRice();
    saveState(); renderResults();
  });
  syncRice();

  var newName = document.getElementById('newName');
  var newMult = document.getElementById('newMult');
  function addBoss() {
    var name = (newName.value || '').trim() || '새 보스';
    state.bosses.push({
      id: 'c' + Date.now(), name: name, diff: '', icon: '',
      mult: Math.max(1, num(newMult.value, 100)), extra: DEFAULT_EXTRA[name] || 0, on: true
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
    slackInput.value = trim(state.slackPct);
    fullRunsInput.value = String(state.fullRuns);
    syncRice();
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

  // ── 넥슨 스케줄러에서 보스 목록 불러오기 ──────────────────
  // 보스 수익 정산과 같은 방식: 캐릭터 이름 → ocid → 스케줄러의 주간·월간 보스.
  var API_BASE = 'https://open.api.nexon.com/maplestory/v1';
  var BOSS_ICON = {
    '검은 마법사': 'black_mage', '카링': 'kaling', '유피테르': 'jupiter',
    '최초의 대적자': 'first_challenger', '감시자 칼로스': 'watcher_kalos', '발드릭스': 'baldrix',
    '벨로나': 'vellona', '찬란한 흉성': 'radiant', '림보': 'limbo', '선택받은 세렌': 'seren',
    '스우': 'suu', '진 힐라': 'jin_hilla', '듄켈': 'dunkel', '윌': 'will',
    '가디언 엔젤 슬라임': 'guardian_angel_slime', '더스크': 'dusk', '루시드': 'lucid',
    '데미안': 'damien', '파풀라투스': 'papulatus', '벨룸': 'vellum', '매그너스': 'magnus',
    '피에르': 'pierre', '반반': 'banban', '블러디 퀸': 'bloody_queen', '자쿰': 'zakum'
  };
  var API_BOSS_NAME = { '블러디퀸': '블러디 퀸' };
  var API_DIFFICULTY = { easy: '이지', normal: '노멀', hard: '하드', chaos: '카오스', extreme: '익스트림' };
  var API_ERROR_MSG = {
    OPENAPI00001: 'API 서버 오류입니다. 잠시 후 다시 시도하세요.',
    OPENAPI00002: '이 API 키로 조회할 수 없는 캐릭터입니다. 본인 계정의 캐릭터인지 확인하세요.',
    OPENAPI00003: '캐릭터 정보를 찾을 수 없습니다.',
    OPENAPI00004: '조회 조건이 올바르지 않습니다.',
    OPENAPI00005: 'API 키가 유효하지 않습니다. 홈에서 다시 등록하세요.',
    OPENAPI00007: 'API 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요.',
    OPENAPI00009: '데이터 준비 중입니다. 잠시 후 다시 시도하세요.',
    OPENAPI00010: '게임 점검 중입니다.',
    OPENAPI00011: 'API 점검 중입니다.'
  };
  var charInput = document.getElementById('charName');
  var fetchBtn = document.getElementById('fetchBtn');
  var fetchStatus = document.getElementById('fetchStatus');
  var keyState = document.getElementById('apiKeyState');

  function setStatus(msg, kind) {
    fetchStatus.textContent = msg || '';
    fetchStatus.className = 'note fetch-status' + (kind ? ' ' + kind : '');
  }
  function refreshKeyState() {
    keyState.innerHTML = (window.NexonKey && NexonKey.has())
      ? '<span>API 키 등록됨 ✓</span><a href="index.html#apiKey">키 변경</a>'
      : '<span>불러오기에는 넥슨 오픈 API 키가 필요합니다.</span><a href="index.html#apiKey">API 키 등록</a>';
  }
  function apiGet(path, params) {
    var query = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    return fetch(API_BASE + path + '?' + query, { headers: { 'x-nxopen-api-key': NexonKey.get() } })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (body) {
          if (!res.ok) {
            var e = body && body.error ? body.error : {};
            var err = new Error(e.message || ('HTTP ' + res.status));
            err.code = e.name || '';
            throw err;
          }
          return body;
        });
      });
  }
  function describeApiError(err, stage) {
    if (err && err.code) {
      if (stage === 'id' && (err.code === 'OPENAPI00003' || err.code === 'OPENAPI00004')) return '캐릭터를 찾을 수 없습니다. 닉네임을 확인하세요.';
      if (stage === 'scheduler' && (err.code === 'OPENAPI00002' || err.code === 'OPENAPI00003' || err.code === 'OPENAPI00004')) {
        return '스케줄러를 조회할 수 없습니다. API 키를 발급한 본인 계정의 캐릭터인지 확인하세요.';
      }
      return API_ERROR_MSG[err.code] || (err.code + ': ' + err.message);
    }
    if (err && err.name === 'TypeError') return '네트워크 오류로 넥슨 API에 연결하지 못했습니다.';
    return '불러오지 못했습니다: ' + (err && err.message ? err.message : err);
  }
  function trueFlag(v) { return v === true || String(v).toLowerCase() === 'true'; }

  // 스케줄러 응답 → 보스 목록. 이미 잡은 보스는 꺼둔 채로 넣는다.
  function bossesFromScheduler(data) {
    var prevMult = Object.create(null);
    state.bosses.forEach(function (b) { prevMult[b.name] = b.mult; });
    var out = [], skipped = [];
    (data && Array.isArray(data.boss_contents) ? data.boss_contents : []).forEach(function (item) {
      if (!item || !trueFlag(item.registration_flag)) return;
      var cycle = String(item.cycle || '').toLowerCase();
      if (cycle !== 'bossweekly' && cycle !== 'bossmonthly') return;
      var apiName = String(item.content_name || '').trim();
      var name = API_BOSS_NAME[apiName] || apiName;
      var icon = BOSS_ICON[name];
      if (!icon) skipped.push(name);
      out.push({
        id: 'a' + out.length,
        name: name,
        diff: API_DIFFICULTY[String(item.difficulty || '').toLowerCase()] || '',
        icon: icon ? 'icons/boss/' + icon + '.webp' : '',
        mult: prevMult[name] || 100,
        extra: DEFAULT_EXTRA[name] || 0,
        on: !trueFlag(item.complete_flag)
      });
    });
    return { bosses: out, skipped: skipped };
  }

  function importCharacter() {
    var name = (charInput.value || '').trim();
    if (!name) { setStatus('캐릭터 이름을 입력하세요.', 'err'); charInput.focus(); return; }
    if (!window.NexonKey || !NexonKey.has()) { setStatus('먼저 홈에서 넥슨 오픈 API 키를 등록하세요.', 'err'); return; }
    fetchBtn.disabled = true;
    setStatus('불러오는 중…');
    apiGet('/id', { character_name: name })
      .then(null, function (e) { e.stage = 'id'; throw e; })
      .then(function (r) {
        if (!r || !r.ocid) throw new Error('캐릭터 식별자(OCID)를 받지 못했습니다.');
        return apiGet('/scheduler/character-state', { ocid: r.ocid })
          .then(null, function (e) { e.stage = 'scheduler'; throw e; });
      })
      .then(function (data) {
        var parsed = bossesFromScheduler(data);
        if (!parsed.bosses.length) { setStatus('스케줄러에 등록된 주간·월간 보스가 없습니다.', 'err'); return; }
        state.bosses = parsed.bosses;
        saveState(); renderAll();
        var offCnt = parsed.bosses.filter(function (b) { return !b.on; }).length;
        setStatus('보스 ' + parsed.bosses.length + '마리를 불러왔습니다.' +
          (offCnt ? ' (이미 잡은 ' + offCnt + '마리는 꺼둠)' : '') +
          (parsed.skipped.length ? ' 아이콘 없는 보스: ' + parsed.skipped.join(', ') : ''), 'ok');
        try { localStorage.setItem('bossBuffPlanner.lastChar', name); } catch (err) {}
      })
      .catch(function (err) { setStatus(describeApiError(err, err && err.stage), 'err'); })
      .then(function () { fetchBtn.disabled = false; });
  }
  fetchBtn.addEventListener('click', importCharacter);
  charInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') importCharacter(); });
  try { charInput.value = localStorage.getItem('bossBuffPlanner.lastChar') || ''; } catch (err) {}
  refreshKeyState();

  renderAll();
})();
