// 소형 재물 획득의 비약 제작 계산기.
//
// 제작 사슬은 두 단계다.
//   씨앗 오일   = 쥬니퍼베리 씨앗 6 + 최고급 허브 오일병 1, 성공 90% (실패해도 재료는 사라진다)
//   비약 6개    = 씨앗 오일 5 + 최고급 포션 빈병 1 + 최상급 아이템 결정 2 + 현자의 돌 1
// 그래서 오일 1개 평균 비용은 (씨앗 6 + 오일병) / 0.9 이고, 이걸 경매장 오일 값과 비교해
// 싼 쪽으로 비약 원가를 낸다. 레시피는 사면 24시간 동안 횟수 제한 없이 쓸 수 있어서 그 안에 만들 횟수로 나눠 붙인다.
// 재료마다 체크를 끄면 자체 수급으로 보고 0메소로 계산한다.
(function () {
  const STORE_KEY = 'wealthElixirCalc';
  const OIL_RATE = 0.9;
  const SEEDS_PER_OIL = 6;
  const OILS_PER_CRAFT = 5;
  const CRYSTALS_PER_CRAFT = 2;
  const ELIXIRS_PER_CRAFT = 6;
  const FEE = 5;            // 경매장 판매 수수료
  const DISCOUNT_FEE = 3;   // 수수료 할인 켰을 때
  const CRAFT_CHIPS = [1, 5, 10, 20, 50, 100];
  const MAX_CRAFTS = 100000;
  // 상점 정가라 입력받지 않는 고정 지출.
  const HERB_BOTTLE = 1000;   // 최고급 허브 오일병, 오일 시도 1회에 1개
  const POTION_BOTTLE = 800;  // 최고급 포션 빈병, 비약 1회에 1개

  const MATS = [
    { group: '씨앗 오일 재료 (1회 시도)' },
    { k: 'seed', name: '쥬니퍼베리 씨앗', icon: '쥬니퍼베리씨앗.webp', note: '오일 1회 시도에 6개' },
    { group: '비약 재료 (1회 = 6개)' },
    { k: 'oil', name: '쥬니퍼베리 씨앗 오일', icon: '쥬니퍼베리씨앗오일.png', note: '5개 · 끄면 보유 오일' },
    { k: 'crystal', name: '최상급 아이템 결정', icon: '최상급아이템결정.webp', note: '2개' },
    { k: 'stone', name: '현자의 돌', icon: '현자의돌.webp', note: '1개' },
    { k: 'recipe', name: '소형 재물 획득의 비약 레시피', icon: '소형재물획득의비약레시피.png', note: '끄면 이미 산 걸로' }
  ];
  const KEYS = MATS.filter(m => m.k).map(m => m.k);
  const NAME = {};
  MATS.forEach(m => { if (m.k) NAME[m.k] = m.name; });

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // "1억 2000만", "350만", "1,200,000" 모두 받는다.
  function parseMeso(s) {
    let rest = String(s).replace(/[,\s]/g, '');
    let total = 0, m;
    if ((m = rest.match(/([\d.]+)억/))) { total += parseFloat(m[1]) * 1e8; rest = rest.replace(m[0], ''); }
    if ((m = rest.match(/([\d.]+)만/))) { total += parseFloat(m[1]) * 1e4; rest = rest.replace(m[0], ''); }
    const tail = parseFloat(rest.replace(/[^\d.]/g, ''));
    if (Number.isFinite(tail)) total += tail;
    return Number.isFinite(total) && total > 0 ? Math.round(total) : 0;
  }
  const parseNum = s => { const v = parseFloat(String(s).replace(/[^0-9.]/g, '')); return Number.isFinite(v) ? v : 0; };

  const fmt = n => Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '-';
  // 큰 금액은 "1억 2,345만" 으로 줄여 읽기 쉽게.
  function short(n) {
    if (!Number.isFinite(n)) return '-';
    const neg = n < 0; n = Math.round(Math.abs(n));
    let s;
    if (n >= 1e8) {
      const e = Math.floor(n / 1e8), man = Math.round((n % 1e8) / 1e4);
      s = fmt(e) + '억' + (man ? ' ' + fmt(man) + '만' : '');
    } else if (n >= 1e4) {
      const man = Math.floor(n / 1e4), won = n % 1e4;
      s = fmt(man) + '만' + (won ? ' ' + fmt(won) : '');
    } else s = fmt(n);
    return (neg ? '-' : '') + s;
  }
  const meso = n => short(n) + ' 메소';
  const signed = n => (n > 0 ? '+' : '') + meso(n);
  function pct(r) {
    if (!Number.isFinite(r)) return '';
    const v = r * 100;
    return (v > 0 ? '+' : '') + (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.?0+$/, '') + '%';
  }

  // ---------------------------------------------------------------- 상태

  const state = { p: {}, on: {}, elixir: 0, crafts: 1, discount: false };
  MATS.forEach(m => { if (m.k) { state.p[m.k] = 0; state.on[m.k] = true; } });
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    KEYS.forEach(k => {
      if (saved.p && Number.isFinite(saved.p[k])) state.p[k] = saved.p[k];
      if (saved.on && typeof saved.on[k] === 'boolean') state.on[k] = saved.on[k];
    });
    if (Number.isFinite(saved.elixir)) state.elixir = saved.elixir;
    if (Number.isFinite(saved.crafts) && saved.crafts >= 1) state.crafts = Math.min(Math.floor(saved.crafts), MAX_CRAFTS);
    if (typeof saved.discount === 'boolean') state.discount = saved.discount;
  } catch (e) {}
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} };

  // ---------------------------------------------------------------- 계산

  // 켜져 있는데 값이 없으면 모르는 값(null). 꺼져 있으면 자체 수급이라 0.
  const cost = k => !state.on[k] ? 0 : state.p[k] > 0 ? state.p[k] : null;

  const feeRate = () => state.discount ? DISCOUNT_FEE : FEE;

  function calc() {
    const keep = 1 - feeRate() / 100;
    const crafts = state.crafts >= 1 ? state.crafts : 1;
    const r = { keep, crafts, missing: [] };

    const seed = cost('seed');
    r.oilCraft = seed !== null ? (seed * SEEDS_PER_OIL + HERB_BOTTLE) / OIL_RATE : null;
    r.oilBuy = cost('oil');                  // 꺼져 있으면 0 = 갖고 있는 오일
    r.oilOwned = !state.on.oil;

    // 오일 말고 비약 1회에 꼭 드는 것들.
    const other = ['crystal', 'stone'];
    const otherMissing = other.filter(k => cost(k) === null);
    r.otherMissing = otherMissing;
    if (!otherMissing.length) r.otherMat = POTION_BOTTLE + cost('crystal') * CRYSTALS_PER_CRAFT + cost('stone');
    // 레시피는 비약 원가에 넣지 않는다. 대신 몇 개 팔아야 레시피 값을 넘기는지 따로 센다.
    r.recipe = cost('recipe');
    r.recipeShare = r.recipe === null ? null : r.recipe / crafts;

    // 비약 1회 재료 원가 (레시피 제외). 오일을 어디서 구하느냐로 길이 갈린다.
    const batch = oil => oil === null || r.otherMat === undefined ? null
      : oil * OILS_PER_CRAFT + r.otherMat;
    r.routes = [];
    if (r.oilOwned) {
      r.routes.push({ k: 'own', label: '갖고 있는 오일로 제작', batch: batch(0) });
    } else {
      r.routes.push({ k: 'seed', label: '씨앗 사서 오일부터 제작', oil: r.oilCraft, batch: batch(r.oilCraft) });
      r.routes.push({ k: 'oil', label: '오일 사서 제작', oil: r.oilBuy, batch: batch(r.oilBuy) });
    }
    r.routes.forEach(rt => { rt.unit = rt.batch === null ? null : rt.batch / ELIXIRS_PER_CRAFT; });
    r.routes.push({ k: 'buy', label: '비약 그냥 사기', unit: state.elixir > 0 ? state.elixir : null,
                    batch: state.elixir > 0 ? state.elixir * ELIXIRS_PER_CRAFT : null });

    const known = r.routes.filter(rt => rt.unit !== null);
    r.best = known.length ? known.reduce((a, b) => (b.unit < a.unit ? b : a)) : null;
    const crafting = known.filter(rt => rt.k !== 'buy');
    r.bestCraft = crafting.length ? crafting.reduce((a, b) => (b.unit < a.unit ? b : a)) : null;

    // 마지노선 (레시피 제외). 오일: 비약 6개 팔아 받는 돈에서 다른 재료를 빼고 5로 나눈 값.
    // 씨앗: 만든 오일 원가가 오일 시세나 오일 마지노선에 닿는 값 중 낮은 쪽.
    const seedFor = oil => (oil * OIL_RATE - HERB_BOTTLE) / SEEDS_PER_OIL;
    r.oilMax = state.elixir > 0 && r.otherMat !== undefined
      ? (state.elixir * ELIXIRS_PER_CRAFT * keep - r.otherMat) / OILS_PER_CRAFT : null;
    r.seedVsOil = state.on.oil && state.p.oil > 0 ? seedFor(state.p.oil) : null;
    r.seedVsElixir = r.oilMax !== null ? seedFor(r.oilMax) : null;
    const seedCaps = [r.seedVsOil, r.seedVsElixir].filter(v => v !== null);
    r.seedMax = seedCaps.length ? Math.min.apply(null, seedCaps) : null;

    // 팔 때: 레시피는 24시간 한 번 사는 값이라 회차 이익과 따로 본다.
    if (r.bestCraft && state.elixir > 0 && r.recipe !== null) {
      const oilUnit = r.bestCraft.k === 'own' ? 0 : r.bestCraft.k === 'seed' ? r.oilCraft : r.oilBuy;
      r.oilUnit = oilUnit;
      r.matPerCraft = oilUnit * OILS_PER_CRAFT + r.otherMat;           // 레시피 뺀 재료값
      r.gross = state.elixir * ELIXIRS_PER_CRAFT;
      r.net = r.gross * keep;
      r.perCraft = r.net - r.matPerCraft;                               // 레시피 빼기 전 1회 이익
      r.total = r.perCraft * crafts - r.recipe;
      r.totalCost = r.matPerCraft * crafts + r.recipe;
      r.rate = r.totalCost > 0 ? r.total / r.totalCost : null;
      r.evenPrice = keep > 0 ? Math.ceil((r.matPerCraft + r.recipeShare) / (ELIXIRS_PER_CRAFT * keep)) : null;
      // 레시피 값을 넘기려면 최소 몇 개 팔아야 하나. 재료는 6개 단위로 들어가서
      // 먼저 필요한 제작 횟수를 구하고, 그만큼의 재료값+레시피를 넘기는 판매 개수를 센다.
      // 본전은 이득이 아니라서 하나 더.
      if (r.perCraft > 0) {
        r.minCrafts = Math.floor(r.recipe / r.perCraft) + 1;
        r.minSell = Math.floor((r.minCrafts * r.matPerCraft + r.recipe) / (state.elixir * keep)) + 1;
      } else {
        r.minSell = null;
      }
    }
    return r;
  }

  // ---------------------------------------------------------------- 그리기

  function buildRows() {
    $('matRows').innerHTML = MATS.map(m => m.group
      ? '<div class="we-group">' + esc(m.group) + '</div>'
      : '<div class="we-row" id="row_' + m.k + '">' +
          '<input type="checkbox" id="on_' + m.k + '" data-on="' + m.k + '" title="끄면 자체 수급 (0메소)" />' +
          (m.icon ? '<img class="we-icon" src="icons/' + m.icon + '" alt="" width="28" height="28" />' : '<span class="we-icon"></span>') +
          '<label class="we-name" for="on_' + m.k + '">' + esc(m.name) + '<small id="note_' + m.k + '">' + esc(m.note) + '</small></label>' +
          '<div class="mm-field"><input type="text" id="p_' + m.k + '" data-price="' + m.k + '" inputmode="numeric" autocomplete="off" placeholder="시세" aria-label="' + esc(m.name) + ' 가격" />' +
          '<div class="mm-unit" id="u_' + m.k + '"></div></div>' +
        '</div>'
    ).join('') +
      '<div class="we-fixed">고정 지출 · 최고급 허브 오일병 <b>' + fmt(HERB_BOTTLE) + '</b> · 최고급 포션 빈병 <b>' + fmt(POTION_BOTTLE) + '</b> 메소</div>';
    KEYS.forEach(k => {
      $('on_' + k).checked = state.on[k];
      $('p_' + k).value = state.p[k] ? fmt(state.p[k]) : '';
    });
    $('p_elixir').value = state.elixir ? fmt(state.elixir) : '';
    $('crafts').value = state.crafts !== 1 ? String(state.crafts) : '';
  }

  function render() {
    const c = calc();
    KEYS.forEach(k => {
      $('row_' + k).classList.toggle('off', !state.on[k]);
      $('u_' + k).textContent = !state.on[k] ? '자체 수급 · 0메소' : state.p[k] >= 1e4 ? short(state.p[k]) : '';
    });
    $('u_elixir').textContent = state.elixir > 0
      ? short(state.elixir) + ' · 팔면 ' + short(state.elixir * c.keep) + ' (수수료 ' + feeRate() + '%)' : '';
    $('craftsUnit').textContent = '= 비약 ' + fmt(c.crafts * ELIXIRS_PER_CRAFT) + '개';
    document.querySelectorAll('[data-discount]').forEach(b => {
      const on = (b.dataset.discount === '1') === state.discount;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('craftChips').innerHTML = CRAFT_CHIPS.map(n =>
      '<button type="button" class="mm-chip' + (c.crafts === n ? ' active' : '') + '" data-crafts="' + n + '">' + n + '회</button>'
    ).join('');

    renderRoutes(c);
    renderMin(c);
    renderCaps(c);
    renderReco(c);
    renderVerdict(c);
  }

  function lineHtml(lines) {
    return lines.map(l =>
      '<div class="mm-line' + (l[3] ? ' total' : '') + '"><span class="k">' + esc(l[0]) + '</span>' +
      '<span class="v ' + (l[2] || '') + '">' + esc(l[1]) + '</span></div>'
    ).join('');
  }

  function renderRoutes(c) {
    $('routeTable').querySelector('tbody').innerHTML = c.routes.map(rt => {
      const best = c.best && rt === c.best;
      return '<tr class="' + (best ? 'best' : '') + '">' +
        '<td class="name">' + (best ? '✔ ' : '') + esc(rt.label) +
          (rt.oil != null ? '<small>오일 1개 ' + esc(short(rt.oil)) + '</small>' : '') + '</td>' +
        (rt.unit === null
          ? '<td class="na" colspan="2">' + (rt.k === 'buy' ? '비약 시세 필요' : '시세 필요') + '</td>'
          : '<td class="price">' + esc(short(rt.unit)) + '</td><td class="price">' + esc(short(rt.batch)) + '</td>') +
        '</tr>';
    }).join('');

    const miss = c.otherMissing.slice();
    if (!c.oilOwned && c.oilCraft === null && c.oilBuy === null) miss.unshift('seed');
    if (c.recipe === null && c.bestCraft) miss.push('recipe');
    $('routeMissing').textContent = miss.length ? '빈 칸: ' + miss.map(k => NAME[k]).join(', ') : '';
    $('routeMissing').classList.toggle('hidden', !miss.length);
  }

  function stat(k, v, s, cls) {
    return '<div class="we-stat"><div class="k">' + esc(k) + '</div><div class="v ' + (cls || '') + '">' + esc(v) + '</div>' +
      (s ? '<div class="s">' + esc(s) + '</div>' : '') + '</div>';
  }

  // 맨 위 추천 한 줄. 계산은 하지 않고 위에서 낸 값을 문장으로 묶는다.
  const VIA = { seed: '씨앗 사서 오일부터', oil: '오일 사서', own: '보유 오일로' };
  function renderReco(c) {
    const box = $('recoBox');
    const b = s => '<b>' + esc(s) + '</b>';
    let title, desc, alt = '', warn = false;
    if (c.perCraft !== undefined && c.minSell !== null) {
      title = VIA[c.bestCraft.k] + ' 만들어 팔기';
      desc = (c.recipe > 0
        ? b('최소 ' + fmt(c.minSell) + '개') + '(' + fmt(c.minCrafts) + '회) 팔면 레시피 값 회수, '
        : '') + '이후 1회마다 ' + b(signed(c.perCraft));
      alt = '지금 입력한 ' + fmt(c.crafts) + '회면 ' + signed(c.total) + (c.total < 0 ? ' — 더 많이 만들어야 이득' : '');
    } else if (c.perCraft !== undefined) {
      warn = true;
      title = '만들어 팔면 손해';
      desc = '비약 판매가가 ' + b(meso(Math.ceil(c.matPerCraft / (ELIXIRS_PER_CRAFT * c.keep)))) + '를 넘어야 남아요';
      if (c.best && c.bestCraft) {
        alt = c.best.k === 'buy'
          ? '직접 쓸 거면 비약을 사는 게 1개당 ' + meso(c.bestCraft.unit - c.best.unit) + ' 쌈'
          : '직접 쓸 거면 ' + VIA[c.best.k] + ' 만드는 게 1개당 ' + meso(state.elixir - c.best.unit) + ' 쌈';
      }
    } else if (c.best) {
      // 판매 계산에 필요한 값이 아직 없을 때는 싸게 구하는 길만.
      title = c.best.k === 'buy' ? '비약 그냥 사기' : VIA[c.best.k] + ' 만들기';
      desc = '비약 1개 ' + b(meso(c.best.unit)) + '로 가장 쌈';
      alt = state.elixir > 0 ? '레시피 시세를 넣으면 팔 때 이득도 알려줘요' : '비약 시세를 넣으면 팔 때 이득도 알려줘요';
    } else {
      box.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden');
    box.classList.toggle('warn', warn);
    $('recoTitle').textContent = title;
    $('recoDesc').innerHTML = desc;
    $('recoAlt').textContent = alt;
  }

  // 지금 가격이 마지노선 밑이면 여유, 넘으면 초과로 표시.
  function capRoom(max, now) {
    if (!(now > 0)) return '';
    const room = Math.floor(max) - now;
    return '지금 ' + short(now) + ' · ' + (room >= 0 ? short(room) + ' 여유' : short(-room) + ' 초과');
  }

  function renderCaps(c) {
    const panel = $('capPanel');
    if (c.seedMax === null && c.oilMax === null) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    const cards = [];
    if (c.seedMax !== null) {
      const why = c.seedMax === c.seedVsOil ? '넘으면 오일을 사는 게 쌈' : '넘으면 씨앗부터 만들어 팔아도 손해';
      const over = state.on.seed && state.p.seed > Math.floor(c.seedMax);
      cards.push(stat('씨앗 마지노선', c.seedMax > 0 ? short(Math.floor(c.seedMax)) : '없음',
        [state.on.seed ? capRoom(c.seedMax, state.p.seed) : '', why].filter(Boolean).join(' · '), over ? 'cost' : ''));
    }
    if (c.oilMax !== null) {
      // 오일 원가는 지금 쓰는 방법 기준(만들기·사기 중 싼 쪽).
      const oilNow = c.oilOwned ? 0 : [c.oilCraft, c.oilBuy].filter(v => v !== null).reduce((a, b) => Math.min(a, b), Infinity);
      const over = Number.isFinite(oilNow) && oilNow > Math.floor(c.oilMax);
      cards.push(stat('오일 마지노선', c.oilMax > 0 ? short(Math.floor(c.oilMax)) : '없음',
        [Number.isFinite(oilNow) && oilNow > 0 ? capRoom(c.oilMax, oilNow) : '', '넘으면 비약 만들어 팔아도 손해'].filter(Boolean).join(' · '), over ? 'cost' : ''));
    }
    $('capStats').innerHTML = cards.join('');
  }

  function renderMin(c) {
    const box = $('minBox');
    if (c.perCraft === undefined) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.classList.toggle('bad', c.minSell === null);
    if (c.minSell === null) {
      $('minStats').innerHTML = stat('결과', '팔수록 손해', '', 'cost');
      $('minSub').textContent = '판매가가 ' + meso(Math.ceil(c.matPerCraft / (ELIXIRS_PER_CRAFT * c.keep))) + '를 넘어야 남기 시작';
      return;
    }
    const invest = c.minCrafts * c.matPerCraft + c.recipe;
    $('minStats').innerHTML =
      stat('최소 판매', fmt(c.minSell) + '개') +
      stat('제작', fmt(c.minCrafts) + '회', '비약 ' + fmt(c.minCrafts * ELIXIRS_PER_CRAFT) + '개') +
      stat('투자비용', short(invest), '재료 ' + short(c.minCrafts * c.matPerCraft) + ' + 레시피 ' + short(c.recipe), 'cost') +
      stat('추가 1회당', '+' + short(c.perCraft), '이후 1회(6개) 더 만들 때마다', 'plus');
    $('minSub').textContent = '';
  }

  function renderVerdict(c) {
    const box = $('verdictBox');
    $('verdictCrafts').textContent = c.crafts + '회 · ' + fmt(c.crafts * ELIXIRS_PER_CRAFT) + '개';
    if (c.perCraft === undefined) {
      box.classList.add('hidden');
      $('verdictEmpty').classList.remove('hidden');
      return;
    }
    box.classList.remove('hidden');
    $('verdictEmpty').classList.add('hidden');

    const win = c.total > 0.5, lose = c.total < -0.5;
    box.classList.toggle('good', win);
    box.classList.toggle('bad', lose);
    $('verdictTag').textContent = win ? '이득' : lose ? '손해' : '본전';
    $('verdictValue').textContent = signed(c.total);
    $('verdictRate').textContent = c.rate === null ? '' : pct(c.rate);

    $('verdictLines').innerHTML = lineHtml([
      ['판매 실수령 (수수료 ' + feeRate() + '% 뗌)', meso(c.net * c.crafts), ''],
      ['투자비용 (재료 + 레시피)', '-' + meso(c.totalCost), 'fee'],
      ['손익분기 비약 판매가', meso(c.evenPrice), 'dim']
    ]);
  }

  // ---------------------------------------------------------------- 입력

  buildRows();

  // 입력 칸은 사용자가 친 그대로 두고 결과만 다시 그린다.
  document.addEventListener('input', function (e) {
    const t = e.target;
    if (t.dataset.price) state.p[t.dataset.price] = Math.min(parseMeso(t.value), 1e13);
    else if (t.id === 'p_elixir') state.elixir = Math.min(parseMeso(t.value), 1e13);
    else if (t.id === 'crafts') { const v = Math.floor(parseNum(t.value)); state.crafts = v >= 1 ? Math.min(v, MAX_CRAFTS) : 1; }
    else return;
    save();
    render();
  });
  document.addEventListener('change', function (e) {
    const k = e.target.dataset && e.target.dataset.on;
    if (!k) return;
    state.on[k] = e.target.checked;
    save();
    render();
  });
  document.addEventListener('click', function (e) {
    const d = e.target.closest('[data-discount]');
    if (d) {
      state.discount = d.dataset.discount === '1';
      save();
      render();
      return;
    }
    const b = e.target.closest('[data-crafts]');
    if (!b) return;
    state.crafts = parseInt(b.dataset.crafts, 10);
    $('crafts').value = state.crafts !== 1 ? String(state.crafts) : '';
    save();
    render();
  });

  render();
})();
