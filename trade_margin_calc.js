// 되팔기 손익 계산기.
//
// 경매장은 살 때는 수수료가 없고 팔 때만 판매가의 5%를 뗀다. 그래서 산 가격 그대로
// 다시 걸면 딱 그 5%만큼 손해가 난다. 여기서 내는 숫자는 두 개뿐이다.
//   본전 판매가 = 원가 / (1 - 수수료율)   ← 수수료가 "올린 판매가"에도 붙으므로 5%를 더하는 것과 다르다
//   순이익      = 판매가 * 수량 * (1 - 수수료율) - 원가
// 원가 = 개당 구매가 * 수량 + 추가로 들어간 메소(큐브·스타포스 등).
(function () {
  const STORE_KEY = 'tradeMarginCalc';
  const DEFAULT_FEE = 5;
  // 원가 대비 남기고 싶은 비율. 0은 본전 줄.
  const TARGETS = [0, 0.05, 0.1, 0.2, 0.3, 0.5, 1];

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const comma = n => n ? Math.round(n).toLocaleString('ko-KR') : '';
  const fmt = n => Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '-';
  const parseMeso = s => { const raw = String(s).replace(/[^0-9]/g, ''); return raw ? parseInt(raw, 10) : 0; };

  // 3,500,000 → "350만" 처럼 한 눈에 크기가 보이는 보조 표기.
  function mesoText(n) {
    if (!Number.isFinite(n) || n <= 0) return '';
    n = Math.round(n);
    const jo = Math.floor(n / 1e12), eok = Math.floor((n % 1e12) / 1e8), man = Math.floor((n % 1e8) / 1e4);
    if (jo) return fmt(jo) + '조' + (eok ? ' ' + fmt(eok) + '억' : '');
    if (eok) return fmt(eok) + '억' + (man ? ' ' + fmt(man) + '만' : '');
    if (man) return fmt(man) + '만';
    return fmt(n) + '메소';
  }
  function rateText(r) {
    if (!Number.isFinite(r)) return '';
    const v = r * 100;
    const s = Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '');
    return (v > 0 ? '+' : '') + s + '%';
  }

  // ---------------------------------------------------------------- 상태

  const state = { buy: 0, qty: 1, extra: 0, sell: 0, fee: DEFAULT_FEE };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    Object.keys(state).forEach(k => { if (Number.isFinite(saved[k])) state[k] = saved[k]; });
  } catch (e) {}
  if (!(state.qty >= 1)) state.qty = 1;
  if (!(state.fee >= 0) || state.fee >= 100) state.fee = DEFAULT_FEE;
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} };

  // ---------------------------------------------------------------- 계산

  function calc() {
    const qty = Math.max(1, Math.round(state.qty));
    const keep = 1 - state.fee / 100;          // 판매가 중 실제로 손에 들어오는 비율
    const cost = state.buy * qty + state.extra; // 원가(총액)
    // 본전 판매가는 개당 가격으로 걸기 때문에 개당으로 올림한다(내림하면 1메소 모자라 손해).
    const evenUnit = cost > 0 && keep > 0 ? Math.ceil(cost / keep / qty) : 0;
    const r = { qty, keep, cost, evenUnit, sell: state.sell };
    if (state.sell > 0) {
      r.gross = state.sell * qty;
      r.feeMeso = r.gross - r.gross * keep;
      r.net = r.gross * keep;
      r.profit = r.net - cost;
      r.rate = cost > 0 ? r.profit / cost : null;
      // 이 가격에 팔 수 있다면, 원가가 여기까지는 버틴다(= 살 때 질러도 되는 상한).
      r.maxBuyUnit = Math.floor((r.net - state.extra) / qty);
    }
    return r;
  }

  // 목표 수익률 r 을 남기려면 개당 얼마에 걸어야 하는지.
  function priceForTarget(c, r) {
    if (!(c.cost > 0) || !(c.keep > 0)) return 0;
    return Math.ceil(c.cost * (1 + r) / c.keep / c.qty);
  }

  // ---------------------------------------------------------------- 그리기

  function render() {
    const c = calc();

    $('buyPrice').value = comma(state.buy);
    $('qty').value = state.qty > 1 ? comma(state.qty) : '';
    $('extraCost').value = comma(state.extra);
    $('sellPrice').value = comma(state.sell);
    $('feePct').value = state.fee === DEFAULT_FEE ? '' : String(state.fee);
    $('buyPriceUnit').textContent = state.buy ? mesoText(state.buy) + (c.qty > 1 ? ' × ' + c.qty + '개 = ' + mesoText(state.buy * c.qty) : '') : '';
    $('extraCostUnit').textContent = mesoText(state.extra);
    $('sellPriceUnit').textContent = state.sell ? mesoText(state.sell) + (c.qty > 1 ? ' × ' + c.qty + '개 = ' + mesoText(state.sell * c.qty) : '') : '';

    renderFeeChips();
    renderSellChips(c);
    renderBreakEven(c);
    renderVerdict(c);
    renderTargets(c);
  }

  function renderFeeChips() {
    const chips = [{ pct: 5, label: '경매장 5%' }, { pct: 0, label: '수수료 없음' }];
    $('feeChips').innerHTML = chips.map(ch =>
      '<button type="button" class="tm-chip' + (state.fee === ch.pct ? ' active' : '') + '" data-fee="' + ch.pct + '">' + esc(ch.label) + '</button>'
    ).join('');
  }

  function renderSellChips(c) {
    const chips = [];
    if (c.evenUnit) chips.push({ v: c.evenUnit, label: '본전 판매가 넣기' });
    if (state.buy) chips.push({ v: state.buy, label: '산 가격 그대로' });
    $('sellChips').innerHTML = chips.map(ch =>
      '<button type="button" class="tm-chip' + (state.sell === ch.v ? ' active' : '') + '" data-sell="' + ch.v + '">' + esc(ch.label) + '</button>'
    ).join('');
  }

  function renderBreakEven(c) {
    const box = $('breakEvenBox');
    if (!c.evenUnit) {
      box.classList.add('empty');
      $('breakEvenValue').textContent = state.buy ? '수수료율을 확인하세요' : '구매가를 입력하세요';
      $('breakEvenSub').textContent = '';
      return;
    }
    box.classList.remove('empty');
    $('breakEvenValue').textContent = fmt(c.evenUnit) + ' 메소';
    const lossIfSame = state.buy ? Math.round(state.buy * c.qty * c.keep - c.cost) : 0;
    const parts = [mesoText(c.evenUnit) + (c.qty > 1 ? ' × ' + c.qty + '개' : '')];
    parts.push('원가 ' + mesoText(c.cost) + ' · 수수료 ' + mesoText(c.evenUnit * c.qty - c.cost) + ' 감당');
    if (state.buy && lossIfSame < 0) parts.push('산 가격 그대로 팔면 ' + mesoText(-lossIfSame) + ' 손해');
    $('breakEvenSub').textContent = parts.join(' · ');
  }

  function renderVerdict(c) {
    const box = $('verdictBox');
    const note = $('maxBuyNote');
    if (!(state.sell > 0)) { box.classList.add('hidden'); note.classList.add('hidden'); return; }
    box.classList.remove('hidden');

    const win = c.profit > 0;
    box.classList.toggle('good', win);
    box.classList.toggle('bad', c.profit < 0);
    $('verdictTag').textContent = c.cost <= 0 ? '실수령' : win ? '이득' : c.profit < 0 ? '손해' : '본전';
    $('verdictValue').textContent = c.cost <= 0
      ? fmt(c.net) + ' 메소'
      : (c.profit > 0 ? '+' : '') + fmt(c.profit) + ' 메소';
    $('verdictRate').textContent = c.rate === null ? '' : rateText(c.rate) + (c.profit ? ' (' + mesoText(Math.abs(c.profit)) + ')' : '');

    const lines = [
      ['판매가' + (c.qty > 1 ? ' × ' + c.qty + '개' : ''), fmt(c.gross), 'dim'],
      ['수수료 ' + state.fee + '%', '-' + fmt(c.feeMeso), 'fee'],
      ['실제 들어오는 메소', fmt(c.net), '']
    ];
    if (c.cost > 0) {
      lines.push(['원가' + (state.extra ? ' (구매 ' + fmt(state.buy * c.qty) + ' + 추가 ' + fmt(state.extra) + ')' : ''), '-' + fmt(c.cost), 'dim']);
      lines.push(['남는 메소', (c.profit > 0 ? '+' : '') + fmt(c.profit), '']);
    }
    $('verdictLines').innerHTML = lines.map((l, i) =>
      '<div class="tm-line' + (i === lines.length - 1 ? ' total' : '') + '"><span class="k">' + esc(l[0]) + '</span>' +
      '<span class="v ' + l[2] + '">' + esc(l[1]) + '</span></div>'
    ).join('');

    if (c.maxBuyUnit > 0) {
      note.classList.remove('hidden');
      note.innerHTML = '거꾸로 보면, 이 가격에 팔 수 있다면 개당 <b>' + fmt(c.maxBuyUnit) + ' 메소</b>(' +
        esc(mesoText(c.maxBuyUnit)) + ')까지 사도 본전입니다.';
    } else {
      note.classList.add('hidden');
    }
  }

  function renderTargets(c) {
    const panel = $('targetPanel');
    if (!c.evenUnit) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    const rows = TARGETS.map(t => {
      const unit = priceForTarget(c, t);
      const profit = unit * c.qty * c.keep - c.cost;
      const here = state.sell > 0 && state.sell === unit;
      return '<tr class="' + (t === 0 ? 'breakeven' : '') + (here ? ' here' : '') + '">' +
        '<td class="name">' + (t === 0 ? '본전' : '+' + Math.round(t * 100) + '%') + (here ? ' <span style="color:var(--accent);font-weight:400;font-size:.7rem">← 지금</span>' : '') + '</td>' +
        '<td class="price"><button type="button" class="tm-pick" data-sell="' + unit + '">' + fmt(unit) + '</button></td>' +
        '<td class="profit">' + (t === 0 ? '0' : '+' + fmt(profit)) + '</td>' +
        '</tr>';
    });
    $('targetTable').querySelector('tbody').innerHTML = rows.join('');
  }

  // ---------------------------------------------------------------- 입력

  // 숫자 칸은 타이핑 중에도 콤마를 다시 붙인다. 커서는 끝으로 가지만
  // 메소 금액은 앞에서부터 쭉 치는 게 보통이라 실제로 걸리지 않는다.
  function bindMeso(id, key) {
    $(id).addEventListener('input', function () {
      state[key] = parseMeso(this.value);
      save();
      render();
    });
  }
  bindMeso('buyPrice', 'buy');
  bindMeso('extraCost', 'extra');
  bindMeso('sellPrice', 'sell');

  $('qty').addEventListener('input', function () {
    state.qty = Math.max(1, Math.min(9999, parseMeso(this.value) || 1));
    save();
    render();
  });
  $('feePct').addEventListener('input', function () {
    const raw = this.value.replace(/[^0-9.]/g, '');
    const v = parseFloat(raw);
    state.fee = Number.isFinite(v) && v >= 0 && v < 100 ? v : DEFAULT_FEE;
    save();
    // 입력 중인 칸은 되돌려 쓰면 "5." 같은 중간 상태를 못 치니 그대로 둔다.
    const keep = raw;
    render();
    this.value = keep;
  });

  document.addEventListener('click', function (e) {
    const sellBtn = e.target.closest('[data-sell]');
    if (sellBtn) {
      state.sell = parseInt(sellBtn.dataset.sell, 10) || 0;
      save();
      render();
      return;
    }
    const feeBtn = e.target.closest('[data-fee]');
    if (feeBtn) {
      state.fee = parseFloat(feeBtn.dataset.fee);
      save();
      render();
    }
  });

  render();
})();
