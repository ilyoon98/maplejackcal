/* Readable units alongside numeric inputs; never changes calculator input values. */
(function () {
  'use strict';
  function koreanAmount(value, scale = 0, unit = '메소') {
    const raw = String(value).replaceAll(',', '').trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return '';
    let [whole, fraction = ''] = raw.split('.');
    whole = (whole || '0') + fraction.padEnd(scale, '0').slice(0, scale);
    fraction = fraction.slice(scale).replace(/0+$/, '');
    let n = BigInt(whole), parts = [], i = 0;
    const units = ['', '만', '억', '조', '경', '해', '자', '양', '구', '간', '정'];
    while (n > 0n) {
      const group = n % 10000n;
      if (i >= units.length) return '금액이 너무 큽니다.';
      if (group || (i === 0 && fraction)) parts.unshift(String(group) + (i === 0 && fraction ? '.' + fraction : '') + units[i]);
      n /= 10000n; i++;
    }
    if (!parts.length) parts.push('0' + (fraction ? '.' + fraction : ''));
    return parts.join(' ') + ' ' + unit;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { koreanAmount }; return; }
  function init() {
    const page = location.pathname.split('/').pop();
    const fields = {
      'starforce_calc.html': {spareInput:[], actualUsage:[]},
      'starforce_play.html': {spareInput:[]},
      'item_craft_calc.html': {basePrice:[], actualUsage:[]},
      'cube_option_calc.html': {actualUsage:[]},
      'trace_calc.html': {jujeonPrice:[]},
      'trade_margin_calc.html': {buyPrice:[], sellPrice:[], extraCost:[]},
      'meso_market_calc.html': {amount:[8], baseRate:[0,'메이플포인트'], sellRate:[0,'메이플포인트']}
    }[page];
    if (!fields) return;
    const attached = new Map();
    function update() {
      Object.entries(fields).forEach(([id, args]) => {
        const input = document.getElementById(id);
        if (!input) return;
        let hint = attached.get(input);
        if (!hint || !hint.isConnected) {
          hint = document.createElement('span'); hint.className = 'money-input-reading'; hint.id = id + '-korean-amount';
          const row = input.closest('.actual-input-row');
          (row || input).after(hint);
          const described = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
          if (!described.includes(hint.id)) described.push(hint.id);
          input.setAttribute('aria-describedby', described.join(' '));
          attached.set(input, hint);
          const legacyHint = document.getElementById(id + 'Unit');
          if (legacyHint && !(page === 'meso_market_calc.html' && id !== 'amount')) legacyHint.hidden = true;
        }
        let text = koreanAmount(input.value, ...args);
        if (page === 'trade_margin_calc.html' && ['buyPrice','sellPrice'].includes(id) && text) {
          const qty = document.getElementById('qty').value.replaceAll(',', '');
          const value = input.value.replaceAll(',', '');
          if (/^\d+$/.test(qty) && /^\d+$/.test(value) && BigInt(qty) > 1n) text += ' × ' + qty + '개 = ' + koreanAmount(String(BigInt(value) * BigInt(qty)));
        }
        if (hint.textContent !== text) hint.textContent = text;
      });
    }
    // Engines restore and rerender values programmatically as well as on user input.
    document.addEventListener('input', update);
    document.addEventListener('change', update);
    new MutationObserver(update).observe(document.body, {childList:true, subtree:true, characterData:true});
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
