// 메소마켓 시세 계산기.
//
// 메소마켓은 "1억 메소당 몇 메이플포인트"라는 시세로 돌아간다. 화면에 뜬 시세가
// 그대로 손에 들어오지는 않고, 수수료를 뗀 만큼만 남는다. 그래서 물어볼 건 두 개다.
//   실수령 시세   = 기준 시세 * (1 - 구매 수수료율)
//   손익분기 시세 = 실수령 시세 / (1 - 판매 수수료율)
// 수수료가 어느 쪽에 붙는지는 상황마다 달라서 두 칸으로 나눠 받는다.
// 기본값은 "메포를 받을 때 1%"라서 2304 시세면 실제로는 2280.96 메포가 들어오고,
// 직접 걸어서 팔 때 수수료가 없다면 2281부터 이득이 된다.
(function () {
  const STORE_KEY = 'mesoMarketCalc';
  const DEFAULT_BASE = 2304;
  const DEFAULT_BUY_FEE = 1;
  const DEFAULT_SELL_FEE = 0;
  const EOK = 1e8;
  // 기준 실수령보다 더 남기고 싶은 비율. 0은 본전 줄.
  const TARGETS = [0, 0.01, 0.02, 0.03, 0.05, 0.1];

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const parseNum = s => { const raw = String(s).replace(/[^0-9.]/g, ''); const v = parseFloat(raw); return Number.isFinite(v) ? v : 0; };

  // 메포는 소수점이 자연스럽게 생긴다(2304 * 0.99 = 2280.96). 끝자리 0은 지운다.
  function pt(n) {
    if (!Number.isFinite(n)) return '-';
    if (Math.abs(n) >= 1000) return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
    const s = n.toFixed(2);
    return s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, '');
  }
  const fmt = n => Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '-';

  // 1.5 → "1억 5,000만" 처럼 크기가 바로 보이는 보조 표기.
  function mesoText(eok) {
    if (!Number.isFinite(eok) || eok <= 0) return '';
    const n = Math.round(eok * EOK);
    const jo = Math.floor(n / 1e12), e = Math.floor((n % 1e12) / 1e8), man = Math.floor((n % 1e8) / 1e4);
    if (jo) return fmt(jo) + '조' + (e ? ' ' + fmt(e) + '억' : '');
    if (e) return fmt(e) + '억' + (man ? ' ' + fmt(man) + '만' : '');
    if (man) return fmt(man) + '만';
    return fmt(n) + '메소';
  }
  function rateText(r) {
    if (!Number.isFinite(r)) return '';
    const v = r * 100;
    let s = (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return (v > 0 ? '+' : '') + s + '%';
  }

  // ---------------------------------------------------------------- 상태

  const state = { base: DEFAULT_BASE, buyFee: DEFAULT_BUY_FEE, sellFee: DEFAULT_SELL_FEE, sell: 0, amount: 1 };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    Object.keys(state).forEach(k => { if (Number.isFinite(saved[k])) state[k] = saved[k]; });
  } catch (e) {}
  if (!(state.amount > 0)) state.amount = 1;
  if (!(state.buyFee >= 0) || state.buyFee >= 100) state.buyFee = DEFAULT_BUY_FEE;
  if (!(state.sellFee >= 0) || state.sellFee >= 100) state.sellFee = DEFAULT_SELL_FEE;
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} };

  // ---------------------------------------------------------------- 계산

  function calc() {
    const amount = state.amount > 0 ? state.amount : 1;   // 억 단위
    const buyKeep = 1 - state.buyFee / 100;               // 메포를 받을 때 남는 비율
    const sellKeep = 1 - state.sellFee / 100;             // 팔 때 남는 비율
    const baseNet = state.base * buyKeep;                 // 1억당 실제로 들어오는 메포
    const r = {
      amount, buyKeep, sellKeep, baseNet,
      baseFee: state.base - baseNet,
      totalNet: baseNet * amount,
      // 걸어야 하는 시세는 정수로 올린다(내림하면 0.x 메포 모자라 손해).
      evenSell: baseNet > 0 && sellKeep > 0 ? Math.ceil(baseNet / sellKeep) : 0,
      perPoint: baseNet > 0 ? EOK / baseNet : 0           // 메포 1점을 받기까지 들어간 메소
    };
    if (state.sell > 0) {
      r.sellGross = state.sell * amount;
      r.sellFeeP = r.sellGross - r.sellGross * sellKeep;
      r.sellNet = r.sellGross * sellKeep;
      r.perNet = state.sell * sellKeep;                   // 1억당 실수령
      r.diff = r.sellNet - r.totalNet;
      r.diffPer = r.perNet - baseNet;
      r.rate = baseNet > 0 ? r.diffPer / baseNet : null;
    }
    return r;
  }

  // 기준 실수령보다 t 만큼 더 받으려면 1억당 얼마에 걸어야 하는지.
  function priceForTarget(c, t) {
    if (!(c.baseNet > 0) || !(c.sellKeep > 0)) return 0;
    return Math.ceil(c.baseNet * (1 + t) / c.sellKeep);
  }

  // ---------------------------------------------------------------- 그리기

  function render() {
    const c = calc();

    $('baseRate').value = state.base ? String(state.base) : '';
    $('amount').value = state.amount !== 1 ? String(state.amount) : '';
    $('sellRate').value = state.sell ? String(state.sell) : '';
    $('buyFee').value = state.buyFee === DEFAULT_BUY_FEE ? '' : String(state.buyFee);
    $('sellFee').value = state.sellFee === DEFAULT_SELL_FEE ? '' : String(state.sellFee);
    $('amountUnit').textContent = mesoText(c.amount);
    $('baseRateUnit').textContent = state.base
      ? '수수료 ' + state.buyFee + '% 떼면 ' + pt(c.baseNet) + ' 메포'
      : '';
    $('sellRateUnit').textContent = state.sell
      ? (state.sellFee ? '수수료 ' + state.sellFee + '% 떼면 ' + pt(c.perNet) + ' 메포'
                       : '수수료 없이 그대로 ' + pt(state.sell) + ' 메포')
      : '';

    renderFeeChips();
    renderSellChips(c);
    renderNet(c);
    renderVerdict(c);
    renderTargets(c);
  }

  function renderFeeChips() {
    const chips = [
      { k: 'buyFee', v: 1, label: '받을 때 1%' },
      { k: 'buyFee', v: 0, label: '받을 때 0%' },
      { k: 'sellFee', v: 1, label: '팔 때 1%' },
      { k: 'sellFee', v: 0, label: '팔 때 0%' }
    ];
    $('feeChips').innerHTML = chips.map(ch =>
      '<button type="button" class="mm-chip' + (state[ch.k] === ch.v ? ' active' : '') + '" data-fee="' + ch.k + ':' + ch.v + '">' + esc(ch.label) + '</button>'
    ).join('');
  }

  function renderSellChips(c) {
    const chips = [];
    if (c.evenSell) chips.push({ v: c.evenSell, label: '손익분기 시세 넣기' });
    if (state.base) chips.push({ v: state.base, label: '기준 시세 그대로' });
    $('sellChips').innerHTML = chips.map(ch =>
      '<button type="button" class="mm-chip' + (state.sell === ch.v ? ' active' : '') + '" data-sell="' + ch.v + '">' + esc(ch.label) + '</button>'
    ).join('');
  }

  function renderNet(c) {
    const box = $('netBox');
    if (!(c.baseNet > 0)) {
      box.classList.add('empty');
      $('netValue').textContent = '기준 시세를 입력하세요';
      $('netSub').textContent = '';
      $('evenValue').textContent = '-';
      $('evenSub').textContent = '';
      return;
    }
    box.classList.remove('empty');
    $('netValue').textContent = pt(c.baseNet) + ' 메포';
    const parts = ['1억 메소당 · 수수료 ' + pt(c.baseFee) + ' 메포 차감'];
    if (c.amount !== 1) parts.push(mesoText(c.amount) + ' 전부면 ' + pt(c.totalNet) + ' 메포');
    parts.push('메포 1점당 ' + fmt(c.perPoint) + ' 메소');
    $('netSub').textContent = parts.join(' · ');

    $('evenValue').textContent = pt(c.evenSell) + ' 메포';
    $('evenSub').textContent = state.sellFee
      ? '판매 수수료 ' + state.sellFee + '%를 떼고도 ' + pt(c.baseNet) + ' 메포가 남는 시세'
      : '기준 실수령 ' + pt(c.baseNet) + ' 메포를 넘기는 첫 정수 시세';
  }

  function renderVerdict(c) {
    const box = $('verdictBox');
    if (!(state.sell > 0) || !(c.baseNet > 0)) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');

    const win = c.diffPer > 1e-9;
    const lose = c.diffPer < -1e-9;
    box.classList.toggle('good', win);
    box.classList.toggle('bad', lose);
    $('verdictTag').textContent = win ? '이득' : lose ? '손해' : '본전';
    $('verdictValue').textContent = (c.diff > 0 ? '+' : '') + pt(c.diff) + ' 메포';
    $('verdictRate').textContent = c.rate === null ? ''
      : rateText(c.rate) + (c.amount !== 1 ? ' · 1억당 ' + (c.diffPer > 0 ? '+' : '') + pt(c.diffPer) : '');

    const lines = [
      ['판매 시세' + (c.amount !== 1 ? ' × ' + mesoText(c.amount) : ''), pt(c.sellGross) + ' 메포', 'dim']
    ];
    if (state.sellFee) {
      lines.push(['판매 수수료 ' + state.sellFee + '%', '-' + pt(c.sellFeeP) + ' 메포', 'fee']);
      lines.push(['팔아서 받는 메포', pt(c.sellNet) + ' 메포', '']);
    }
    lines.push(['기준 시세로 받았다면 (수수료 ' + state.buyFee + '%)', pt(c.totalNet) + ' 메포', 'dim']);
    lines.push(['차이', (c.diff > 0 ? '+' : '') + pt(c.diff) + ' 메포', '']);
    $('verdictLines').innerHTML = lines.map((l, i) =>
      '<div class="mm-line' + (i === lines.length - 1 ? ' total' : '') + '"><span class="k">' + esc(l[0]) + '</span>' +
      '<span class="v ' + l[2] + '">' + esc(l[1]) + '</span></div>'
    ).join('');
  }

  function renderTargets(c) {
    const panel = $('targetPanel');
    if (!(c.baseNet > 0)) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    const rows = TARGETS.map(t => {
      const rate = priceForTarget(c, t);
      const gain = (rate * c.sellKeep - c.baseNet) * c.amount;
      const here = state.sell > 0 && state.sell === rate;
      return '<tr class="' + (t === 0 ? 'breakeven' : '') + (here ? ' here' : '') + '">' +
        '<td class="name">' + (t === 0 ? '본전' : '+' + Math.round(t * 100) + '%') +
        (here ? ' <span style="color:var(--accent);font-weight:400;font-size:.7rem">← 지금</span>' : '') + '</td>' +
        '<td class="price"><button type="button" class="mm-pick" data-sell="' + rate + '">' + pt(rate) + '</button></td>' +
        '<td class="profit">' + (gain > 0 ? '+' : '') + pt(gain) + '</td>' +
        '</tr>';
    });
    $('targetTable').querySelector('tbody').innerHTML = rows.join('');
  }

  // ---------------------------------------------------------------- 입력

  // 시세·수수료 칸은 "2." 같은 중간 상태를 그대로 칠 수 있어야 해서 값을 되돌려 쓰지 않는다.
  function bindNum(id, apply) {
    $(id).addEventListener('input', function () {
      const keep = this.value;
      apply(parseNum(this.value));
      save();
      render();
      this.value = keep;
    });
  }
  bindNum('baseRate', v => { state.base = v > 0 ? Math.min(v, 1e6) : 0; });
  bindNum('sellRate', v => { state.sell = v > 0 ? Math.min(v, 1e6) : 0; });
  bindNum('amount', v => { state.amount = v > 0 ? Math.min(v, 1e6) : 1; });
  bindNum('buyFee', v => { state.buyFee = v >= 0 && v < 100 ? v : DEFAULT_BUY_FEE; });
  bindNum('sellFee', v => { state.sellFee = v >= 0 && v < 100 ? v : DEFAULT_SELL_FEE; });

  document.addEventListener('click', function (e) {
    const sellBtn = e.target.closest('[data-sell]');
    if (sellBtn) {
      state.sell = parseFloat(sellBtn.dataset.sell) || 0;
      save();
      render();
      return;
    }
    const feeBtn = e.target.closest('[data-fee]');
    if (feeBtn) {
      const parts = feeBtn.dataset.fee.split(':');
      state[parts[0]] = parseFloat(parts[1]);
      save();
      render();
    }
  });

  render();
})();
