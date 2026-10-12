// 보스 버프 동선 짜기.
// 보스마다 "배율"(100% = 기준 시간, 200% = 절반)을 적어두면
//  ① 켜둔 보스를 전부 도는 데 필요한 최소 버프 개수와 판마다의 순서
//  ② 버프를 한 번만 쓸 때 가장 알찬 조합
// 을 계산한다. 시간은 전부 초 단위 정수로 다뤄 부동소수 오차를 없앤다.
//
// 보스별 도핑 선택에 따라 풀도핑/쌀도핑 판을 나눠 묶되, 쌀도핑 보스는 버프가 줄어들면 풀도핑 판에도 넣는다.
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

  // 전체 주간·월간 보스 목록. 보스 수익 정산과 같은 순서·난이도.
  var BOSS_CATALOG = [
    ['유피테르', 'jupiter', ['하드', '노멀']],
    ['발드릭스', 'baldrix', ['하드', '노멀']],
    ['림보', 'limbo', ['하드', '노멀']],
    ['벨로나', 'vellona', ['하드', '노멀', '이지']],
    ['찬란한 흉성', 'radiant', ['하드', '노멀']],
    ['카링', 'kaling', ['익스트림', '하드', '노멀', '이지']],
    ['최초의 대적자', 'first_challenger', ['익스트림', '하드', '노멀', '이지']],
    ['감시자 칼로스', 'watcher_kalos', ['익스트림', '카오스', '노멀', '이지']],
    ['선택받은 세렌', 'seren', ['익스트림', '하드', '노멀']],
    ['듄켈', 'dunkel', ['하드', '노멀']],
    ['진 힐라', 'jin_hilla', ['하드', '노멀']],
    ['더스크', 'dusk', ['카오스', '노멀']],
    ['윌', 'will', ['하드', '노멀', '이지']],
    ['루시드', 'lucid', ['하드', '노멀', '이지']],
    ['가디언 엔젤 슬라임', 'guardian_angel_slime', ['카오스', '노멀']],
    ['데미안', 'damien', ['하드', '노멀']],
    ['스우', 'suu', ['익스트림', '하드', '노멀']],
    ['파풀라투스', 'papulatus', ['카오스']],
    ['벨룸', 'vellum', ['카오스']],
    ['블러디 퀸', 'bloody_queen', ['카오스']],
    ['반반', 'banban', ['카오스']],
    ['피에르', 'pierre', ['카오스']],
    ['매그너스', 'magnus', ['하드']],
    ['자쿰', 'zakum', ['카오스']],
    ['검은 마법사', 'black_mage', ['익스트림', '하드']]
  ];
  // 난이도 배지 색(스크린샷 사이트와 같은 색).
  var DIFF_CLASS = { '이지': 'easy', '노멀': 'normal', '하드': 'hard', '카오스': 'chaos', '익스트림': 'extreme' };

  // 배율과 무관하게 그 보스에서 더 걸리는 시간(분). 젠 대기·컷신·페이즈 이동 같은 것들.
  var DEFAULT_EXTRA = { '윌': 4 };
  function catalogEntry(name) {
    return BOSS_CATALOG.find(function (b) { return b[0] === name; });
  }
  function normalizeBoss(b, i) {
    var entry = catalogEntry(b.name);
    var preset = DEFAULT_BOSSES.find(function (row) { return row.name === b.name; });
    return {
      id: b.id || 'b' + i, name: String(b.name || '보스'),
      diff: b.diff || (preset ? preset.diff : entry ? entry[2][entry[2].length - 1] : ''),
      icon: b.icon || (entry ? 'icons/boss/' + entry[1] + '.webp' : ''),
      mult: Math.max(0.01, num(b.mult, 100)), extra: DEFAULT_EXTRA[b.name] || 0,
      on: b.on !== false, rice: b.rice === true, completed: b.completed === true,
      completionOverride: b.completionOverride === true,
      difficultySettings: b.difficultySettings || {}
    };
  }
  function catalogBosses(selected) {
    var byName = Object.create(null);
    (selected || []).forEach(function (b, i) {
      if (!b || !b.name) return;
      var row = normalizeBoss(b, i), previous = byName[row.name];
      // 예전에 같은 보스를 여러 난이도로 추가했다면 선택한 한 줄을 남기고 배율은 난이도별로 보관한다.
      if (previous) {
        var keep = !previous.on && row.on ? row : previous;
        keep.difficultySettings = Object.assign({}, previous.difficultySettings, row.difficultySettings);
        keep.difficultySettings[previous.diff] = {mult:previous.mult, rice:previous.rice};
        keep.difficultySettings[row.diff] = {mult:row.mult, rice:row.rice};
        byName[row.name] = keep;
      } else byName[row.name] = row;
    });
    var result = BOSS_CATALOG.map(function (entry, i) {
      return byName[entry[0]] || normalizeBoss({name:entry[0], on:false}, i);
    });
    // 예전 저장값에 있는 사용자 정의 보스도 잃지 않도록 맨 아래에 남긴다.
    Object.keys(byName).forEach(function (name) { if (!catalogEntry(name)) result.push(byName[name]); });
    return result;
  }
  function changeDifficulty(b, diff) {
    var entry = catalogEntry(b.name);
    if (!entry || entry[2].indexOf(diff) < 0 || diff === b.diff) return;
    b.difficultySettings = b.difficultySettings || {};
    b.difficultySettings[b.diff] = {mult:b.mult, rice:b.rice};
    var setting = b.difficultySettings[diff];
    b.diff = diff;
    b.mult = setting ? Math.max(0.01, num(setting.mult, 100)) : 100;
    if (setting) b.rice = setting.rice === true;
  }
  // 사용자 제공 표의 최종뎀 환산값(%). 캐릭터 스탯에 따른 실측값이 아닌 근사치다.
  var DOPING_BUFFS = [
    { id: 'mvp', name: 'MVP 슈퍼파워', fd: 0.844, icon: 'superpower' },
    { id: 'fish', name: '붕어빵 뿌리기', fd: 0.844, icon: 'fish' },
    { id: 'urus', name: '마슈르의 선물 (우뿌)', fd: 0.844, icon: 'urus' },
    { id: 'union', name: '유니온의 힘', fd: 0.844, icon: 'union' },
    { id: 'extreme', name: '익스트림 레드/블루', fd: 0.844, icon: 'extreme' },
    { id: 'sayram', name: '세이람의 영약', fd: 5.825, icon: 'sayram' },
    { id: 'vip', name: 'VIP 버프', fd: 3.527, icon: 'vipbuff' },
    { id: 'stat', name: '향상된 10단계 물약', fd: 0.279, icon: 'statpotion' },
    { id: 'honor', name: '명예의 영약', fd: 1.68, icon: 'buff300' },
    { id: 'collector', name: '콜렉터의 영약', fd: 1.804, icon: 'collector' },
    { id: 'legend', name: '전설의 영웅 비약', fd: 0.832, icon: 'legendhero' },
    { id: 'hero', name: '고급 대영웅의 비약', fd: 1.085, icon: 'bighero' },
    { id: 'master', name: '명장 — 고급 무기 제련', fd: 1.608, icon: 'jangbi' }
  ];
  // 각 조합에서 하나만 사용. 저장된 중복 선택은 최종뎀이 큰 항목을 남긴다.
  var EXCLUSIVE_DOPING = ['master', 'hero', 'legend'];
  function normalizeDoping(raw) {
    var result = { full: {}, rice: {} };
    DOPING_BUFFS.forEach(function (buff) {
      var exclusive = EXCLUSIVE_DOPING.indexOf(buff.id) >= 0;
      var full = raw && raw.full && typeof raw.full[buff.id] === 'boolean'
        ? raw.full[buff.id] : !exclusive || buff.id === 'master';
      var rice = raw && raw.rice && typeof raw.rice[buff.id] === 'boolean'
        ? raw.rice[buff.id] : exclusive ? buff.id === 'legend' : buff.id !== 'collector';
      result.full[buff.id] = full;
      result.rice[buff.id] = rice && (full || exclusive);
    });
    ['full', 'rice'].forEach(function (mode) {
      var selected = EXCLUSIVE_DOPING.filter(function (id) { return result[mode][id]; });
      selected.slice(1).forEach(function (id) { result[mode][id] = false; });
    });
    return result;
  }
  // 입력 배율은 풀도핑 기준. 비약 교체를 포함해 두 조합의 최종뎀 배수를 비교한다.
  function riceRate() {
    return DOPING_BUFFS.reduce(function (rate, buff) {
      var factor = 1 + buff.fd / 100;
      if (state.doping.full[buff.id]) rate /= factor;
      if (state.doping.rice[buff.id]) rate *= factor;
      return rate;
    }, 1);
  }
  function riceLabel() { return '쌀도핑'; }
  var MAX_EXACT_1 = 15;      // 판 종류가 하나뿐일 때 3^n DP 한계.
  var MAX_ENUM = 20;         // 조합 전수조사 한계(2^n).
  var BIN_W = 1000000;       // DP 점수: 버프 한 개 = 100만점. 남는 초 단위 비교보다 항상 우선한다.
  var INF = 0x3fffffff;

  var profiles = [];
  var activeProfile = '';
  try { profiles = JSON.parse(localStorage.getItem('bossBuffPlanner.profiles') || '[]').filter(function(p){return p && typeof p.name === 'string' && p.state && Array.isArray(p.state.bosses);}); } catch (e) {}
  var state = loadState();

  function defaultState() {
    return {
      buffMin: 30,
      baseMin: 20,
      moveMin: 1,
      slackPct: 0,
      excludeCompleted: false,
      doping: normalizeDoping(),
      bosses: catalogBosses(DEFAULT_BOSSES.map(function (b, i) {
        return { id: 'b' + i, name: b.name, diff: b.diff, icon: b.icon, mult: 100, extra: DEFAULT_EXTRA[b.name] || 0, on: true };
      }))
    };
  }
  function loadState(snapshot) {
    try {
      var raw = snapshot ? JSON.stringify(snapshot) : localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      var s = JSON.parse(raw);
      if (!s || !Array.isArray(s.bosses)) return defaultState();
      // 버프 지속 30분 · 배율 100% 기준 20분은 고정값이다(화면에서 바꾸지 않는다).
      s.buffMin = 30;
      s.baseMin = 20;
      s.moveMin = Math.max(0, num(s.moveMin, 1));
      s.slackPct = Math.max(0, num(s.slackPct, 0));
      s.excludeCompleted = s.excludeCompleted === true;
      s.doping = normalizeDoping(s.doping);
      s.bosses = catalogBosses(s.bosses);
      return s;
    } catch (err) { return defaultState(); }
  }
  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      if (activeProfile) {
        var profile = profiles.find(function(p){ return p.name === activeProfile; });
        if (profile) { profile.state = JSON.parse(JSON.stringify(state)); localStorage.setItem('bossBuffPlanner.profiles', JSON.stringify(profiles)); }
      }
    } catch (err) { if (typeof setStatus === 'function' && fetchStatus) setStatus('브라우저 저장 공간에 저장하지 못했습니다.', 'err'); }
  }
  function num(v, fallback) {
    var n = parseFloat(v);
    return isFinite(n) ? n : fallback;
  }

  // ── 시간 변환 ────────────────────────────────────────────────
  // 배율 100%가 기준 시간(기본 20분), 200%면 그 절반.
  function secOf(mult) { return Math.max(1, Math.round(state.baseMin * 60 * 100 / mult)); }
  function multOf(sec) { return state.baseMin * 60 * 100 / sec; }
  function riceSecOf(mult) { return secOf(mult * riceRate()); }
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

  // 한 버프 안에서는 도핑을 섞지 않는다. 쌀도핑 보스는 풀도핑 판에 넣어 버프 개수가
  // 줄어들 때만 풀도핑 시간으로 계산해 풀도핑 판에 넣는다.
  function packAll(items, cap) {
    var over = [], fixedFull = [], flex = [];
    items.forEach(function (it, i) {
      // 쌀도핑으로도 버프 시간을 넘는 보스는 버프를 하나 더 쓰게 되므로 풀도핑으로 돌리지 않는다.
      if (it.rice) (it.riceSec <= cap ? flex : over).push(i);
      else (it.full <= cap ? fixedFull : over).push(i);
    });
    if (fixedFull.length + flex.length <= MAX_EXACT_1) {
      return { bins: packExactMixed(fixedFull.concat(flex), items, cap), over: over, exact: true };
    }
    // 보스가 많으면 도핑별로 따로 묶은 결과와, 풀도핑 판의 빈 시간에 쌀도핑 보스를 채운 결과 중 버프가 적은 쪽.
    var fullBins = packGroup(fixedFull, items, cap, true);
    var base = fullBins.concat(packGroup(flex, items, cap, false));
    var filled = fullBins.map(function (bin) { return { idx: bin.idx.slice(), full: true }; });
    var used = filled.map(function (bin) { return binSec(bin, items); });
    var rest = [];
    flex.slice().sort(function (a, b) { return items[b].full - items[a].full; }).forEach(function (i) {
      for (var b = 0; b < filled.length; b++) {
        if (costOf(used[b] + items[i].full, filled[b].idx.length + 1) <= cap) {
          filled[b].idx.push(i); used[b] += items[i].full; return;
        }
      }
      rest.push(i);
    });
    var alt = filled.concat(packGroup(rest, items, cap, false));
    return { bins: alt.length < base.length ? alt : base, over: over, exact: false };
  }
  function packGroup(idxList, items, cap, full) {
    return idxList.length <= MAX_EXACT_1 ? packExactSingle(idxList, items, cap, full) : packGreedy(idxList, items, cap, full);
  }

  // 풀도핑 보스와 쌀도핑 보스를 함께 놓고 최소 버프 개수를 계산한다.
  // 점수 = 버프 개수 → 풀도핑으로 돌린 쌀도핑 보스 수 → 실제 사용 시간 순으로 작은 쪽.
  function packExactMixed(idxList, items, cap) {
    var n = idxList.length;
    if (!n) return [];
    var total = 1 << n;
    var fullSums = subsetSums(idxList, items, true);
    var riceSums = subsetSums(idxList, items, false);
    var bits = popcounts(total);
    var riceMask = 0;
    idxList.forEach(function (k, j) { if (items[k].rice) riceMask |= 1 << j; });
    var PROMO_W = 1e7, MIX_BIN_W = 1e12;
    var binScore = new Float64Array(total);
    var isFull = new Uint8Array(total);
    for (var s = 1; s < total; s++) {
      var promo = bits[s & riceMask];
      var rc = costOf(riceSums[s], bits[s]);
      var fc = costOf(fullSums[s], bits[s]);
      if (promo === bits[s] && rc <= cap) binScore[s] = rc;          // 전부 쌀도핑 보스면 쌀도핑 판이 우선
      else if (fc <= cap) { binScore[s] = promo * PROMO_W + fc; isFull[s] = 1; }
      else binScore[s] = Infinity;
    }
    var dp = new Float64Array(total);
    var pick = new Int32Array(total);
    for (var mask = 1; mask < total; mask++) {
      dp[mask] = Infinity;
      var lowbit = mask & -mask;
      for (var sub = mask; sub > 0; sub = (sub - 1) & mask) {
        if (!(sub & lowbit) || binScore[sub] === Infinity) continue;
        var cand = dp[mask ^ sub] + MIX_BIN_W + binScore[sub];
        if (cand < dp[mask]) { dp[mask] = cand; pick[mask] = sub; }
      }
    }
    var bins = [], cur = total - 1;
    while (cur) {
      var sub = pick[cur];
      bins.push({ idx: subToIdx(sub, idxList), full: isFull[sub] === 1 });
      cur ^= sub;
    }
    return bins;
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

  // 같은 도핑 그룹 안에서 최소 버프 개수를 계산한다.
  function packExactSingle(idxList, items, cap, full) {
    var n = idxList.length;
    if (!n) return [];
    var total = 1 << n;
    var sums = subsetSums(idxList, items, full);
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
      bins.push({ idx: subToIdx(sub, idxList), full: full });
      cur ^= sub;
    }
    return bins;
  }

  function subToIdx(sub, idxList) {
    var out = [];
    for (var i = 0; i < idxList.length; i++) if (sub & (1 << i)) out.push(idxList[i]);
    return out;
  }
  // 같은 도핑 그룹에서 오래 걸리는 보스부터 채우는 근사 계산.
  function packGreedy(idxList, items, cap, full) {
    var sorted = idxList.slice().sort(function (a, b) { return secIn(items[b], full) - secIn(items[a], full); });
    var bins = [], used = [];
    sorted.forEach(function (i) {
      var sec = secIn(items[i], full);
      for (var b = 0; b < bins.length; b++) {
        if (costOf(used[b] + sec, bins[b].idx.length + 1) <= cap) {
          bins[b].idx.push(i); used[b] += sec; return;
        }
      }
      bins.push({ idx: [i], full: full });
      used.push(sec);
    });
    return bins;
  }

  // ── 렌더 ────────────────────────────────────────────────────
  var listEl = document.getElementById('bossList');
  var comboEl = document.getElementById('comboResult');
  var packEl = document.getElementById('packResult');
  var moveInput = document.getElementById('moveMin');
  var slackInput = document.getElementById('slackPct');
  var excludeCompletedBtn = document.getElementById('excludeCompletedBtn');
  var dopingListEl = document.getElementById('dopingList');
  var dopingSummaryEl = document.getElementById('dopingSummary');
  var fullDopingOpen = false;
  dopingListEl.addEventListener('toggle', function (e) {
    if (e.target.id === 'fullDopingOptions' && e.target.isConnected) fullDopingOpen = e.target.open;
  }, true);

  function renderDoping() {
    dopingListEl.innerHTML = ['rice', 'full'].map(function (mode) {
      var heading = mode === 'full' ? '풀도핑' : '쌀도핑';
      var group = '<fieldset class="doping-group"><legend><span class="doping-heading">' +
        (mode === 'rice' ? '<img class="rice-sack-icon" src="icons/buff/rice-sack.webp" width="24" height="24" alt="">' : '') +
        heading + '</span></legend><div class="doping-icons">' +
        DOPING_BUFFS.map(function (buff) {
          var selected = state.doping[mode][buff.id];
          var exclusive = EXCLUSIVE_DOPING.indexOf(buff.id) >= 0;
          var disabled = mode === 'rice' && !state.doping.full[buff.id] && !exclusive;
          var note = exclusive ? '명장 · 전영비 · 고대비 중 하나만 선택' : '';
          if (disabled) note += (note ? '\n' : '') + '풀도핑에서 먼저 선택하세요.';
          return '<label class="doping-tile' + (exclusive ? ' exclusive' : '') + '" data-tooltip="' + esc(buff.name) + '" data-tooltip-value="최종뎀 +' + buff.fd.toFixed(3) + '%" data-tooltip-note="' + esc(note) + '">' +
            '<input type="checkbox" data-buff="' + buff.id + '" data-mode="' + mode + '" aria-label="' + esc(buff.name) + ' ' + heading + '"' + (selected ? ' checked' : '') + (disabled ? ' disabled' : '') + '>' +
            '<span class="doping-tile-face"><img class="doping-icon" src="icons/buff/' + buff.icon + '.webp" width="32" height="32" alt="">' +
            '<span class="doping-fd">+' + buff.fd.toFixed(3) + '%</span><span class="doping-check" aria-hidden="true">' + (selected ? '✓' : '') + '</span></span></label>';
        }).join('') + '</div></fieldset>';
      return mode === 'full' ? '<details id="fullDopingOptions" class="doping-full-options"' + (fullDopingOpen ? ' open' : '') + '><summary>풀도핑 설정</summary><p class="note">환산에서 도핑 설정을 바꿨다면, 배율 측정에 사용한 조합으로 맞춰주세요.</p>' + group + '</details>' : group;
    }).join('');
    var pct = (riceRate() - 1) * 100;
    dopingSummaryEl.textContent = '쌀도핑 배율 ×' + riceRate().toFixed(5) + ' · ' +
      (Math.abs(pct) < 0.005 ? '풀도핑과 동일' : '최종뎀 ' + (pct > 0 ? '증가 ' : '감소 ') + Math.abs(pct).toFixed(2) + '%');
    document.getElementById('dopingNote').textContent = '입력 배율은 풀도핑 기준이며, 쌀도핑에는 배율 ×' + riceRate().toFixed(5) + '를 적용합니다. 보스별 버튼으로 풀도핑 ↔ 쌀도핑을 선택하세요. 버프 개수가 줄어들면 쌀도핑 보스를 풀도핑 판에 넣습니다.';
  }
  dopingListEl.addEventListener('change', function (e) {
    var t = e.target, id = t.dataset.buff, mode = t.dataset.mode;
    if (!DOPING_BUFFS.some(function (buff) { return buff.id === id; }) || (mode !== 'full' && mode !== 'rice')) return;
    state.doping[mode][id] = t.checked;
    if (EXCLUSIVE_DOPING.indexOf(id) >= 0) {
      if (t.checked) EXCLUSIVE_DOPING.forEach(function (other) { if (other !== id) state.doping[mode][other] = false; });
    } else if (mode === 'full') state.doping.rice[id] = t.checked;
    state.doping = normalizeDoping(state.doping);
    saveState(); renderAll();
  });


  function activeItems() {
    return state.bosses.filter(function (b) { return b.on && !(state.excludeCompleted && b.completed); }).map(function (b) {
      return {
        name: b.name, diff: b.diff, icon: b.icon, mult: b.mult, extra: b.extra, rice: b.rice === true,
        full: withSlack(secOf(b.mult)) + extraSec(b),
        riceSec: withSlack(riceSecOf(b.mult)) + extraSec(b)
      };
    });
  }

  function renderList() {
    var active = document.activeElement;
    var focus = active && typeof listEl.contains === 'function' && listEl.contains(active)
      ? {act:active.dataset.act, index:active.dataset.i} : null;
    listEl.innerHTML = '';
    document.getElementById('bossSelectionCount').textContent = activeItems().length + '마리 동선 · 전체 ' + state.bosses.length + '마리';
    state.bosses.forEach(function (b, i) {
      var sec = b.rice ? riceSecOf(b.mult) : secOf(b.mult);
      var excluded = state.excludeCompleted && b.completed;
      var dopingName = b.rice ? '쌀도핑' : '풀도핑';
      var nextDoping = b.rice ? '풀도핑' : '쌀도핑';
      var dopingIcon = b.rice ? 'rice-sack' : 'collector';
      var row = document.createElement('div');
      var entry = catalogEntry(b.name);
      row.className = 'boss-row' + (b.on && !excluded ? '' : ' off') + (b.completed ? ' done' : '');
      row.innerHTML =
        '<button type="button" class="row-include' + (b.on ? ' selected' : '') + '" data-act="on" data-i="' + i + '" aria-pressed="' + b.on + '" aria-label="' + esc(b.name) + ' 동선 포함">' + (b.on ? '✓ 포함' : '제외') + '</button>' +
        (b.icon ? '<img class="row-icon" src="' + b.icon + '" alt="">' : '<span class="row-icon blank"></span>') +
        // 완료 표시는 고정된 오른쪽 버튼에만 두어 이름·난이도가 밀리지 않는다.
        '<div class="row-name"><strong><span class="nm" data-tooltip="' + esc(b.name) + '">' + esc(b.name) + '</span>' +
        (entry ? '<select class="row-diff diff-badge ' + (DIFF_CLASS[b.diff] || '') + '" data-act="diff" data-i="' + i + '" aria-label="' + esc(b.name) + ' 난이도">' +
          entry[2].map(function (diff) { return '<option value="' + diff + '"' + (diff === b.diff ? ' selected' : '') + '>' + diff + '</option>'; }).join('') + '</select>' : diffBadge(b.diff)) +
        (b.extra ? '<span class="row-tag" data-tooltip="페이즈 이동 등으로 처치 시간에 더하는 시간">+' + trim(b.extra) + '분</span>' : '') +
        '</strong></div>' +
        '<div class="row-input"><input type="number" min="0.01" step="0.01" value="' + percentText(b.mult) + '" data-act="mult" data-i="' + i + '"><span class="unit">%</span></div>' +
        '<div class="row-input"><input type="number" tabindex="-1" min="0.1" step="0.5" value="' + trim(sec / 60) + '" data-act="time" data-i="' + i + '"><span class="unit">분</span></div>' +
        '<button type="button" class="row-doping ' + (b.rice ? 'rice' : 'full') + '" data-act="rice" data-i="' + i + '" aria-label="' + esc(b.name) + ' 도핑: ' + dopingName + ', ' + nextDoping + '으로 변경" aria-pressed="' + !!b.rice + '" data-tooltip="현재 ' + dopingName + '" data-tooltip-note="누르면 ' + nextDoping + '으로 바뀝니다.">' +
        '<img src="icons/buff/' + dopingIcon + '.webp" width="22" height="22" alt=""><span>' + dopingName + '</span></button>' +
        '<button type="button" class="row-complete' + (b.completed ? ' completed' : '') + '" data-act="complete" data-i="' + i + '" aria-pressed="' + !!b.completed + '" aria-label="' + esc(b.name) + ' 완료 상태">' + (b.completed ? '✓ 완료' : '미완료') + '</button>';
      listEl.appendChild(row);
    });
    if (focus) {
      var control = listEl.querySelector('[data-act="' + focus.act + '"][data-i="' + focus.index + '"]');
      if (control) control.focus({preventScroll:true});
    }
  }
  function trim(v) {
    return String(Math.abs(v - Math.round(v)) < 0.005 ? Math.round(v) : Math.round(v * 10) / 10);
  }
  function percentText(v) { return String(Math.round(v * 100) / 100); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderResults() {
    var items = activeItems();
    var cap = Math.round(state.buffMin * 60);
    if (!items.length) {
      comboEl.innerHTML = '<p class="empty">동선에 포함할 보스를 선택하세요. 완료한 보스를 다시 계산하려면 완료 제외를 꺼주세요.</p>';
      packEl.innerHTML = '';
      return;
    }
    renderPack(items, cap);
    renderCombos(items, cap);
  }

  // ① 켜둔 보스를 전부 도는 루트
  function renderPack(items, cap) {
    var res = packAll(items, cap);
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
    var promoted = [];
    bins.forEach(function (bin) {
      if (bin.full) bin.idx.forEach(function (k) { if (items[k].rice) promoted.push(items[k].name); });
    });
    var html = '<div class="pack-head">' +
      '<div class="pack-title">버프 <span class="big">' + bins.length + '</span>개 · 보스 ' + bossCnt + '마리</div>' +
      ('<div class="tag-row"><span class="tag full">풀도핑 ' + fullCnt + '판</span>' +
          '<span class="tag rice">쌀도핑 ' + (bins.length - fullCnt) + '판</span></div>') +
      '<p class="note">처치 ' + fmt(clearSec) + ' + 이동 ' + moveCnt + '회 ' + fmt(moveCnt * moveSec()) +
      ' = <b>' + fmt(usedSec) + '</b> 사용 · 남는 시간 ' + fmt(waste) + '</p>' +
      (promoted.length ? '<p class="note">버프를 줄이려고 쌀도핑 보스를 풀도핑으로 넣었습니다: ' + promoted.map(esc).join(', ') + '</p>' : '') +
      (res.exact ? '' : '<p class="note warn">보스가 많아 근사 계산으로 묶었습니다.</p>') +
      '</div>';

    html += bins.map(function (bin, i) {
      var left = cap - bin.sec;
      return '<div class="pack-bin' + (bin.full ? '' : ' rice') + '">' +
        '<div class="bin-head"><strong>버프 ' + (i + 1) + '</strong>' +
        ('<span class="tag ' + (bin.full ? 'full">풀도핑' : 'rice">' + riceLabel()) + '</span>') +
        '<span class="cnt">' + bin.idx.length + '마리</span></div>' +
        bar(bin.sec, cap) +
        '<div class="bin-meta"><span class="bin-time">' + fmt(bin.sec) + ' / ' + fmt(cap) + '</span>' +
        '<span class="bin-left' + (left === 0 ? ' zero' : '') + '">' + (left === 0 ? '딱 맞음' : '남음 ' + fmt(left)) + '</span></div>' +
        '<ol class="route">' + bin.idx.map(function (k, j) {
          var it = items[k];
          return (j ? '<li class="hop"><span>↓ 이동 ' + fmtMin(moveSec()) + '분</span></li>' : '') +
            '<li class="stop"><span class="step-no">' + (j + 1) + '</span>' +
            (it.icon ? '<img src="' + it.icon + '" alt="">' : '') +
            '<span class="nm">' + esc(it.name) + (bin.full && it.rice ? ' <span class="tag full">풀도핑 전환</span>' : '') + '</span>' +
            '<span class="tm">' + fmtMin(secIn(it, bin.full)) + '분</span></li>';
        }).join('') + '</ol>' +
        '</div>';
    }).join('');

    if (res.over.length) {
      html += '<p class="empty warn">버프 시간보다 오래 걸려 넣을 수 없는 보스: ' +
        res.over.map(function (i) { return esc(items[i].name); }).join(', ') + '</p>';
    }
    packEl.innerHTML = html;
  }

  // ② 버프를 한 번만 쓸 때
  function renderCombos(items, cap) {
    comboEl.innerHTML = [true, false].map(function (full) {
      var group = items.filter(function (it) { return (!it.rice) === full; });
      if (!group.length) return '';
      var heading = '<p class="note">' + (full ? '풀도핑' : riceLabel()) + ' 보스 조합</p>';
      if (group.length > MAX_ENUM) return heading + '<p class="empty">같은 도핑의 보스는 최대 ' + MAX_ENUM + '마리까지 조합을 계산합니다.</p>';
      var top = bestCombos(group, cap, 5, full);
      return heading + (top.length
        ? top.map(function (c, rank) { return comboCard(c, group, cap, rank, full); }).join('')
        : '<p class="empty">버프 ' + fmt(cap) + ' 안에 들어가는 조합이 없습니다.</p>');
    }).join('');
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
    return '<span class="chip">' + (it.icon ? '<img src="' + it.icon + '" alt="">' : '') +
      esc(it.name) + '<small>' + fmtMin(secIn(it, full)) + '분</small></span>';
  }
  function bar(sec, cap) {
    var pct = Math.min(100, sec / cap * 100);
    return '<div class="bar"><span style="width:' + pct.toFixed(2) + '%"></span></div>';
  }

  function renderAll() {
    excludeCompletedBtn.classList.toggle('on', state.excludeCompleted);
    excludeCompletedBtn.setAttribute('aria-pressed', String(state.excludeCompleted));
    excludeCompletedBtn.textContent = '완료한 보스 제외하기 ' + (state.excludeCompleted ? 'ON' : 'OFF');
    renderDoping(); renderList(); renderResults();
  }

  // ── 이벤트 ──────────────────────────────────────────────────
  listEl.addEventListener('input', function (e) {
    var t = e.target, i = parseInt(t.dataset.i, 10);
    if (isNaN(i)) return;
    var b = state.bosses[i];
    var row = t.closest('.boss-row');
    if (t.dataset.act === 'mult') {
      b.mult = Math.max(0.01, num(t.value, b.mult));
      // 입력 중인 칸은 그대로 두고 짝이 되는 칸만 갱신한다(커서가 튀지 않게).
      row.querySelector('[data-act="time"]').value = trim((b.rice ? riceSecOf(b.mult) : secOf(b.mult)) / 60);
    } else if (t.dataset.act === 'time') {
      var min = Math.max(0.1, num(t.value, 1));
      b.mult = Math.round(multOf(min * 60) / (b.rice ? riceRate() : 1) * 10) / 10;
      row.querySelector('[data-act="mult"]').value = percentText(b.mult);
    } else return;
    saveState(); renderResults();
  });
  listEl.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;
    var i = parseInt(t.dataset.i, 10);
    if (isNaN(i)) return;
    if (t.dataset.act === 'rice') state.bosses[i].rice = !state.bosses[i].rice;
    else if (t.dataset.act === 'on') state.bosses[i].on = !state.bosses[i].on;
    else if (t.dataset.act === 'complete') {
      state.bosses[i].completed = !state.bosses[i].completed;
      state.bosses[i].completionOverride = true;
    }
    else return;
    saveState(); renderAll();
  });
  listEl.addEventListener('change', function (e) {
    var t = e.target, b = state.bosses[parseInt(t.dataset.i, 10)];
    if (!b || t.dataset.act !== 'diff') return;
    changeDifficulty(b, t.value);
    saveState(); renderAll();
  });

  moveInput.value = trim(state.moveMin);
  moveInput.addEventListener('input', function () {
    state.moveMin = Math.max(0, num(moveInput.value, 1));
    saveState(); renderResults();
  });
  slackInput.value = trim(state.slackPct);
  slackInput.addEventListener('input', function () {
    state.slackPct = Math.max(0, num(slackInput.value, 0));
    saveState(); renderResults();
  });
  function diffBadge(diff, attrs) {
    return '<span class="diff-badge ' + (DIFF_CLASS[diff] || '') + '"' + (attrs || '') + '>' + esc(diff) + '</span>';
  }
  document.getElementById('resetBtn').addEventListener('click', function () {
    if (!confirm('입력한 배율을 모두 초기값으로 되돌릴까요?')) return;
    state = defaultState();
    moveInput.value = trim(state.moveMin);
    slackInput.value = trim(state.slackPct);
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
  excludeCompletedBtn.addEventListener('click', function () {
    state.excludeCompleted = !state.excludeCompleted;
    saveState(); renderAll();
  });
  document.getElementById('refreshCompletedBtn').addEventListener('click', refreshCompleted);

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
  var characterImportCard = document.getElementById('characterImportCard');
  var characterShowcase = document.getElementById('buffCharacterShowcase');
  var characterShowcaseImage = document.getElementById('buffCharacterShowcaseImage');
  var characterShowcaseName = document.getElementById('buffCharacterShowcaseName');
  var characterShowcaseMeta = document.getElementById('buffCharacterShowcaseMeta');

  // 내 캐릭터 고르기 모드에서는 '보스 불러오기'를 서버·캐릭터 칸과 한 줄에 두고,
  // 직접 검색 모드에서는 이름 입력칸 옆으로 돌려놓는다.
  var fetchHome = fetchBtn.parentNode;
  function placeFetchBtn(manual) {
    var fields = document.querySelector('#buffCharacterPicker .nx-character-fields');
    if (!manual && fields) fields.appendChild(fetchBtn); else fetchHome.appendChild(fetchBtn);
    fetchHome.hidden = !manual && !!fields;
  }
  if (window.NexonCharacters) NexonCharacters.mount({ host: '#buffCharacterPicker', input: charInput, onModeChange: placeFetchBtn });
  placeFetchBtn(!charInput.hidden);
  // 드롭다운에서 캐릭터(또는 서버)를 직접 바꾸면 바로 보스를 불러온다.
  // 페이지를 열 때의 자동 선택은 change 이벤트가 없어서 API를 부르지 않는다.
  document.getElementById('buffCharacterPicker').addEventListener('change', function (e) {
    if (e.target.matches('.nx-character-select, .nx-world-select') && charInput.value.trim()) importCharacter();
  });

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

  function normalizeCharacterImage(value) {
    var image = typeof value === 'string' ? value.trim() : '';
    return /^https:\/\/open\.api\.nexon\.com\/static\/maplestory\/character\/look\/[A-Za-z0-9]+(?:\?[^\s"'<>]*)?$/.test(image) ? image : '';
  }
  function normalizeCharacterProfile(raw, fallbackName) {
    if (!raw) return null;
    var image = normalizeCharacterImage(raw.characterImage || raw.character_image);
    var name = String(raw.name || raw.character_name || fallbackName || '').trim().slice(0, 20);
    if (!image || !name) return null;
    return {
      name: name,
      worldName: String(raw.worldName || raw.world_name || '').trim(),
      characterClass: String(raw.characterClass || raw.character_class || '').trim(),
      characterLevel: Number(raw.characterLevel || raw.character_level) || 0,
      characterImage: image
    };
  }
  function renderCharacterProfile(raw) {
    var profile = normalizeCharacterProfile(raw);
    characterShowcase.hidden = !profile;
    characterImportCard.classList.toggle('has-profile', !!profile);
    if (!profile) return;
    characterShowcaseImage.src = profile.characterImage;
    characterShowcaseImage.alt = profile.name + ' 캐릭터 외형';
    characterShowcaseName.textContent = profile.name;
    var details = [];
    if (profile.characterLevel) details.push('Lv.' + profile.characterLevel);
    if (profile.worldName) details.push(profile.worldName);
    if (profile.characterClass) details.push(profile.characterClass);
    characterShowcaseMeta.textContent = details.join(' · ');
  }

  // 완료 여부와 무관하게 모두 선택하고, 완료 상태는 제외 토글에서만 사용한다.
  function bossesFromScheduler(data) {
    // 배율은 난이도마다 달라서 같은 이름·난이도일 때만 이어 쓴다(난이도 없는 예전 저장값은 이름으로).
    var prevMult = Object.create(null), prevRice = Object.create(null), prevSettings = Object.create(null);
    state.bosses.forEach(function (b) {
      Object.keys(b.difficultySettings || {}).forEach(function (diff) { prevMult[b.name + '|' + diff] = b.difficultySettings[diff].mult; });
      prevMult[b.name + '|' + (b.diff || '')] = b.mult; prevRice[b.name] = b.rice === true;
      prevSettings[b.name] = b.difficultySettings || {};
    });
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
        mult: prevMult[name + '|' + (API_DIFFICULTY[String(item.difficulty || '').toLowerCase()] || '')] || prevMult[name + '|'] || 100,
        rice: prevRice[name] || false,
        difficultySettings: prevSettings[name] || {},
        extra: DEFAULT_EXTRA[name] || 0,
        on: true,
        // clear_flag가 제공되면 우선 사용하고, 기존 complete_flag 응답도 지원한다.
        completed: trueFlag(item.clear_flag != null ? item.clear_flag : item.complete_flag)
      });
    });
    return { bosses: out, skipped: skipped };
  }

  function mergeSchedulerBosses(registered, preserveSelection) {
    var result = catalogBosses(state.bosses), byName = Object.create(null);
    registered.forEach(function (b) { byName[b.name] = b; });
    result.forEach(function (b) {
      var incoming = byName[b.name];
      if (!preserveSelection) { b.on = !!incoming; b.completionOverride = false; }
      if (!incoming) { if (!b.completionOverride) b.completed = false; return; }
      changeDifficulty(b, incoming.diff);
      b.mult = incoming.mult; b.rice = incoming.rice;
      if (!b.completionOverride) b.completed = incoming.completed;
      delete byName[b.name];
    });
    Object.keys(byName).forEach(function (name) { result.push(normalizeBoss(byName[name], result.length)); });
    return result;
  }

  function importCharacter() {
    if (fetchBtn.disabled) return; // 불러오는 중이면 겹쳐 부르지 않는다.
    var name = (charInput.value || '').trim();
    if (!name) { setStatus('캐릭터 이름을 입력하세요.', 'err'); charInput.focus(); return; }
    if (!window.NexonKey || !NexonKey.has()) { setStatus('먼저 홈에서 넥슨 오픈 API 키를 등록하세요.', 'err'); return; }
    fetchBtn.disabled = true;
    setStatus('불러오는 중…');
    renderCharacterProfile(null);
    var selectedOcid = charInput.dataset.accountOcid || '';
    (selectedOcid ? Promise.resolve({ ocid:selectedOcid }) : apiGet('/id', { character_name: name }))
      .then(null, function (e) { e.stage = 'id'; throw e; })
      .then(function (r) {
        if (!r || !r.ocid) throw new Error('캐릭터 식별자(OCID)를 받지 못했습니다.');
        return Promise.all([
          apiGet('/scheduler/character-state', { ocid: r.ocid })
            .then(null, function (e) { e.stage = 'scheduler'; throw e; }),
          apiGet('/character/basic', { ocid: r.ocid }).then(null, function () { return null; })
        ]);
      })
      .then(function (results) {
        var data = results[0];
        var characterProfile = normalizeCharacterProfile(results[1], name);
        renderCharacterProfile(characterProfile);
        var savedProfile = profiles.find(function(p){ return p.name === name; });
        if (savedProfile) state = loadState(savedProfile.state);
        else if (activeProfile !== name) state = defaultState();
        var parsed = bossesFromScheduler(data);
        state.bosses = mergeSchedulerBosses(parsed.bosses, !!savedProfile || activeProfile === name);
        syncProfileInputs();
        activeProfile = name;
        rememberProfile(name, characterProfile);
        saveState(); renderAll();
        setStatus('등록 보스 ' + parsed.bosses.length + '마리를 반영했습니다. 전체 보스에서 동선 포함 여부를 선택하세요.' +
          (parsed.skipped.length ? ' 아이콘 없는 보스: ' + parsed.skipped.join(', ') : ''), 'ok');
        try { localStorage.setItem('bossBuffPlanner.lastChar', name); } catch (err) {}
      })
      .catch(function (err) { setStatus(describeApiError(err, err && err.stage), 'err'); })
      .then(function () { fetchBtn.disabled = false; });
  }
  // 목록·배율은 그대로 두고 완료 여부만 스케줄러에서 다시 받아 반영한다. 저장해 둔 목록의
  // 난이도가 지금 스케줄러에 등록된 난이도와 다르면(예: 검은 마법사 하드 → 익스트림) 등록된 쪽으로 맞춘다.
  function applySchedulerState(data) {
    var reg = Object.create(null);
    bossesFromScheduler(data).bosses.forEach(function (b) { reg[b.name] = b; });
    var done = 0, changed = [];
    state.bosses.forEach(function (b) {
      var r = reg[b.name];
      if (r && r.diff && r.diff !== b.diff) {
        changed.push(b.name + ' ' + (b.diff || '?') + '→' + r.diff);
        changeDifficulty(b, r.diff);
        b.mult = r.mult;
      }
      b.completed = !!(r && r.diff === b.diff && r.completed);
      b.completionOverride = false;
      if (b.completed) done++;
    });
    return { done: done, changed: changed };
  }
  function refreshCompleted() {
    var name = (charInput.value || '').trim();
    if (!name || !window.NexonKey || !NexonKey.has()) {
      setStatus('스케줄러 완료 상태를 불러오려면 캐릭터와 API 키가 필요합니다. 목록에서는 직접 완료를 표시할 수 있습니다.', 'err');
      return;
    }
    setStatus('완료한 보스를 확인하는 중…');
    var selectedOcid = charInput.dataset.accountOcid || '';
    (selectedOcid ? Promise.resolve({ ocid: selectedOcid }) : apiGet('/id', { character_name: name }))
      .then(null, function (e) { e.stage = 'id'; throw e; })
      .then(function (r) {
        if (!r || !r.ocid) throw new Error('캐릭터 식별자(OCID)를 받지 못했습니다.');
        return apiGet('/scheduler/character-state', { ocid: r.ocid }).then(null, function (e) { e.stage = 'scheduler'; throw e; });
      })
      .then(function (data) {
        var res = applySchedulerState(data);
        saveState(); renderAll();
        setStatus('스케줄러의 완료 상태를 반영했습니다. 완료 ' + res.done + '마리.' +
          (res.changed.length ? ' 스케줄러 난이도로 바꿨으니 배율을 확인하세요: ' + res.changed.join(', ') : ''), 'ok');
      })
      .catch(function (err) { setStatus(describeApiError(err, err && err.stage), 'err'); });
  }
  fetchBtn.addEventListener('click', importCharacter);
  charInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') importCharacter(); });
  try { charInput.value = localStorage.getItem('bossBuffPlanner.lastChar') || ''; } catch (err) {}

  // ── 스크린샷에서 배율 읽기 ──────────────────────────────────
  // 다른 사이트의 보스 카드 캡처를 boss_shot_reader.js로 읽고, 목록에 있는 보스(같은 이름·난이도)만
  // 골라 배율을 넣는다. 목록은 사용자가 고른 보스라 100% 미만이어도 그대로 넣는다.
  var shotDrop = document.getElementById('shotDrop');
  var shotFile = document.getElementById('shotFile');
  var shotStatus = document.getElementById('shotStatus');
  var shotResult = document.getElementById('shotResult');
  var shotRows = [], shotUnknown = [], shotOutside = 0, shotBusy = false, shotOpen = -1;

  function setShotStatus(msg, kind) {
    shotStatus.textContent = msg || '';
    shotStatus.className = 'note fetch-status' + (kind ? ' ' + kind : '');
  }
  function findBossIndex(name, diff) {
    for (var i = 0; i < state.bosses.length; i++) {
      if (state.bosses[i].name === name && state.bosses[i].diff === diff) return i;
    }
    return -1;
  }
  // 얼굴 · 이름 · 난이도 배지.
  function bossChip(b) {
    return (b.icon ? '<img class="shot-face" src="' + b.icon + '" alt="">' : '<span class="shot-face blank"></span>') +
      '<span class="shot-bname">' + esc(b.name) + '</span>' +
      (b.diff ? '<span class="diff-badge ' + (DIFF_CLASS[b.diff] || '') + '">' + esc(b.diff) + '</span>' : '');
  }
  function readShot(file) {
    if (!file || !/^image\//.test(file.type || '') || shotBusy) return;
    if (!window.BossShotReader) { setShotStatus('스크린샷 읽기 모듈을 불러오지 못했습니다.', 'err'); return; }
    shotBusy = true;
    setShotStatus('스크린샷을 읽는 중…');
    var icons = Object.keys(BOSS_ICON).map(function (name) { return { name: name, icon: 'icons/boss/' + BOSS_ICON[name] + '.webp' }; });
    return BossShotReader.readBlob(file, icons).then(function (list) {
      if (!list.length) {
        shotResult.hidden = true;
        setShotStatus('보스 카드를 찾지 못했습니다. 카드 격자가 보이게 캡처했는지 확인하세요.', 'err');
        return;
      }
      shotRows = []; shotUnknown = []; shotOutside = 0; shotOpen = -1;
      var taken = Object.create(null);
      // 덜 닮은 카드가 같은 보스를 차지하지 않게 확실한 것부터 배정한다.
      list.slice().sort(function (a, b) { return b.score - a.score; }).forEach(function (r) {
        var row = { thumb: r.thumb, value: r.value, idx: -1, on: false };
        if (!r.name || !r.diff) { shotUnknown.push(row); return; }
        var idx = findBossIndex(r.name, r.diff);
        if (idx < 0) { shotOutside++; return; }
        if (taken[idx]) { shotUnknown.push(row); return; }
        taken[idx] = true;
        row.idx = idx;
        row.on = r.value != null;
        shotRows.push(row);
      });
      shotRows.sort(function (a, b) { return a.idx - b.idx; }); // 목록 순서대로.
      var odd = list.some(function (r) { return r.scale > 1.03 && r.scale < 1.4; });
      var unread = shotRows.filter(function (r) { return r.value == null; }).length;
      setShotStatus('카드 ' + list.length + '장을 읽었습니다. 확인 후 ‘선택한 배율 넣기’를 누르세요.' +
        (unread ? ' 배율을 확실히 읽지 못한 보스 ' + unread + '개는 직접 입력하세요.' : '') +
        (odd ? ' 숫자가 흐리면 원본 크기로 다시 캡처해 주세요.' : ''), unread ? 'err' : 'ok');
      renderShot();
    }).catch(function (err) {
      setShotStatus('스크린샷을 읽지 못했습니다: ' + (err && err.message ? err.message : err), 'err');
    }).then(function () { shotBusy = false; shotFile.value = ''; });
  }
  function shotRowHtml(row, i, group) {
    var b = state.bosses[row.idx], note, warn = false;
    if (!b) { note = '목록의 어느 보스인지 고르세요.'; warn = true; }
    else if (row.value == null) { note = '배율 숫자를 확실히 읽지 못했습니다. 직접 적으세요.'; warn = true; }
    else note = '지금 ' + percentText(b.mult) + '% → ' + percentText(row.value) + '%';
    var name;
    if (group === 'unknown') {
      // 얼굴과 난이도 배지를 보여주려고 <select> 대신 직접 만든 목록을 쓴다.
      var open = shotOpen === i;
      name = '<div class="shot-pick-boss">' +
        '<button type="button" class="shot-pick-btn" data-shot="pick" data-i="' + i + '" aria-haspopup="listbox" aria-expanded="' + open + '">' +
          (b ? bossChip(b) : '<span class="shot-bname dim">보스 선택</span>') + '<span class="shot-caret">▾</span></button>' +
        (open ? '<div class="shot-menu" role="listbox">' + state.bosses.map(function (x, k) {
          return '<button type="button" role="option" class="shot-opt" data-shot="choose" data-i="' + i + '" data-k="' + k + '" aria-selected="' + (k === row.idx) + '">' + bossChip(x) + '</button>';
        }).join('') + '</div>' : '') +
        '</div>';
    } else name = '<div class="shot-fixed">' + bossChip(b) + '</div>';
    return '<div class="shot-row' + (row.on ? '' : ' off') + '">' +
      '<input type="checkbox" data-shot="on" data-g="' + group + '" data-i="' + i + '"' + (row.on ? ' checked' : '') + ' aria-label="이 배율 넣기">' +
      '<img src="' + row.thumb + '" alt="" data-tooltip="스크린샷의 카드">' +
      '<div class="shot-name">' + name + '<small' + (warn ? ' class="warn"' : '') + '>' + esc(note) + '</small></div>' +
      '<div class="row-input shot-pct"><input type="number" min="0.01" step="0.01" data-shot="value" data-g="' + group + '" data-i="' + i + '" value="' + (row.value != null ? percentText(row.value) : '') + '" aria-label="배율"><span class="unit">%</span></div>' +
      '</div>';
  }
  function renderShot() {
    var found = Object.create(null);
    shotRows.concat(shotUnknown).forEach(function (r) { if (r.idx >= 0) found[r.idx] = true; });
    var missing = state.bosses.filter(function (b, k) { return !found[k]; }).map(function (b) { return b.name + ' ' + b.diff; });
    var html = '<div class="shot-summary">목록 보스 ' + shotRows.length + '개를 찾았습니다' +
      (shotOutside ? ' · 목록에 없는 보스 ' + shotOutside + '개는 뺐습니다' : '') + '</div>';
    html += shotRows.map(function (row, i) { return shotRowHtml(row, i, 'list'); }).join('');
    if (!shotRows.length) html += '<p class="empty">스크린샷에서 목록에 있는 보스를 찾지 못했습니다.</p>';
    if (missing.length) html += '<p class="shot-skip">스크린샷에 없는 목록 보스: ' + esc(missing.join(' · ')) + '</p>';
    if (shotUnknown.length) {
      html += '<details class="shot-skip" id="shotUnknown"' + (shotRows.length && shotOpen < 0 && !shotUnknownOpen ? '' : ' open') + '><summary>알아보지 못한 카드 ' + shotUnknown.length + '장 (직접 고르기)</summary>' +
        shotUnknown.map(function (row, i) { return shotRowHtml(row, i, 'unknown'); }).join('') + '</details>';
    }
    html += '<div class="shot-actions"><button type="button" class="tool-btn" id="shotCancel">닫기</button>' +
      '<button type="button" class="tool-btn" id="shotApply">선택한 배율 넣기</button></div>';
    shotResult.innerHTML = html;
    shotResult.hidden = false;
  }
  var shotUnknownOpen = false;
  function applyShot() {
    var set = 0;
    shotRows.concat(shotUnknown).forEach(function (row) {
      var b = state.bosses[row.idx];
      if (!row.on || !b || !(row.value > 0)) return;
      b.mult = Math.max(0.01, row.value);
      set++;
    });
    saveState(); renderAll();
    shotResult.hidden = true;
    setShotStatus(set ? '배율 ' + set + '개를 넣었습니다.' : '넣을 배율을 고르지 않았습니다.', set ? 'ok' : 'err');
  }
  shotResult.addEventListener('change', function (e) {
    var t = e.target, row = (t.dataset.g === 'unknown' ? shotUnknown : shotRows)[parseInt(t.dataset.i, 10)];
    if (!row) return;
    if (t.dataset.shot === 'on') row.on = t.checked;
    else if (t.dataset.shot === 'value') { row.value = t.value === '' ? null : Math.max(0, num(t.value, 0)); row.on = row.value > 0 && row.idx >= 0; }
    else return;
    renderShot();
  });
  shotResult.addEventListener('toggle', function (e) {
    if (e.target.id === 'shotUnknown') shotUnknownOpen = e.target.open;
  }, true);
  shotResult.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;
    var i = parseInt(t.dataset.i, 10);
    if (t.dataset.shot === 'pick') { shotOpen = shotOpen === i ? -1 : i; renderShot(); }
    else if (t.dataset.shot === 'choose') {
      var row = shotUnknown[i];
      row.idx = parseInt(t.dataset.k, 10);
      row.on = row.value > 0;
      shotOpen = -1; renderShot();
    }
    else if (t.id === 'shotApply') applyShot();
    else if (t.id === 'shotCancel') { shotResult.hidden = true; setShotStatus(''); }
  });
  // 보스 고르기 메뉴는 바깥을 누르거나 Esc를 누르면 닫는다.
  document.addEventListener('click', function (e) {
    if (shotOpen >= 0 && !e.target.closest('.shot-pick-boss')) { shotOpen = -1; renderShot(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && shotOpen >= 0) { shotOpen = -1; renderShot(); }
  });
  shotDrop.addEventListener('click', function () { shotFile.click(); });
  shotDrop.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); shotFile.click(); }
  });
  shotFile.addEventListener('change', function () { readShot(shotFile.files && shotFile.files[0]); });
  shotDrop.addEventListener('dragover', function (e) { e.preventDefault(); shotDrop.classList.add('over'); });
  shotDrop.addEventListener('dragleave', function () { shotDrop.classList.remove('over'); });
  shotDrop.addEventListener('drop', function (e) {
    e.preventDefault(); shotDrop.classList.remove('over');
    readShot(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });
  // 페이지 어디서든 이미지를 붙여넣으면 읽는다(글자 붙여넣기는 그대로 둔다).
  document.addEventListener('paste', function (e) {
    var items = e.clipboardData ? Array.prototype.slice.call(e.clipboardData.items || []) : [];
    var img = items.filter(function (it) { return it.kind === 'file' && /^image\//.test(it.type); })[0];
    if (!img) return;
    e.preventDefault();
    shotDrop.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    readShot(img.getAsFile());
  });

  var profileBar = document.createElement('div'); profileBar.className = 'ux-profile-list';
  profileBar.setAttribute('aria-label', '저장한 캐릭터');
  fetchStatus.after(profileBar);
  function syncProfileInputs() {
    moveInput.value = trim(state.moveMin); slackInput.value = trim(state.slackPct);
    document.dispatchEvent(new Event('buff-profile-loaded'));
  }
  function rememberProfile(name, characterProfile) {
    var p = profiles.find(function(p){ return p.name === name; });
    if (!p) { p = {name:name}; profiles.push(p); }
    p.state = JSON.parse(JSON.stringify(state));
    if (characterProfile) p.character = normalizeCharacterProfile(characterProfile, name);
    activeProfile = name;
    try { localStorage.setItem('bossBuffPlanner.profiles', JSON.stringify(profiles)); }
    catch(e) { setStatus('브라우저 저장 공간에 저장하지 못했습니다.', 'err'); }
    renderProfiles();
  }
  function renderProfiles() {
    profileBar.replaceChildren();
    profiles.forEach(function(p){
      var group = document.createElement('span'); group.className = 'ux-profile';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ux-button';
      b.textContent = p.name; b.setAttribute('aria-pressed', String(p.name === activeProfile));
      b.addEventListener('click', function(){
        activeProfile = p.name; charInput.value = p.name; state = loadState(p.state);
        // 위 선택 칸에서 고른 다른 캐릭터의 OCID가 남지 않게 지운다(이름으로 다시 찾는다).
        charInput.removeAttribute('data-account-ocid');
        renderCharacterProfile(p.character);
        syncProfileInputs(); saveState(); renderAll(); renderProfiles();
        // API 키가 있으면 스케줄러에서 보스·난이도·완료 여부를 바로 새로 받는다(배율은 같은 보스·난이도면 유지).
        if (window.NexonKey && NexonKey.has()) importCharacter();
        else setStatus('저장한 배율과 보스 선택을 불러왔습니다. 최신 보스 목록은 API 키를 등록하면 바로 받아옵니다.', 'ok');
      });
      var del = document.createElement('button'); del.type = 'button'; del.className = 'ux-button'; del.textContent = '×';
      del.setAttribute('aria-label', p.name + ' 저장 삭제');
      del.addEventListener('click', function(){
        profiles = profiles.filter(function(x){ return x !== p; });
        if(activeProfile === p.name) { activeProfile = ''; renderCharacterProfile(null); }
        try { localStorage.setItem('bossBuffPlanner.profiles', JSON.stringify(profiles)); } catch(e) {}
        renderProfiles();
      });
      group.append(b, del); profileBar.append(group);
    });
  }
  renderProfiles();
  var initialProfile = profiles.find(function(p){ return p.name === charInput.value; });
  if (initialProfile) { activeProfile = initialProfile.name; renderCharacterProfile(initialProfile.character); renderProfiles(); }
  refreshKeyState();

  renderAll();
})();
