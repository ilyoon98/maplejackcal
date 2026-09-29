/* Compare actual usage with the exact expectation published by each calculator. */
(function () {
  'use strict';
  function compareUsage(expected, actual) {
    if (!Number.isFinite(expected) || expected < 0 || !Number.isSafeInteger(actual) || actual < 0) return null;
    const baseline = Math.round(expected);
    if (!Number.isSafeInteger(baseline)) return null;
    const difference = actual - baseline;
    return { baseline, difference, percent: baseline > 0 ? Math.abs(difference) / baseline * 100 : null };
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { compareUsage }; return; }

  function init() {
    const configs = {
      'starforce_calc.html': ['#resMeso', '.sf-metrics', '실제로 쓴 메소', '메소', '현재 시작 성 → 목표 성까지의 지출입니다. 파괴 후 복구 메소·장비 재구입비는 포함하고, 처음 장비를 산 비용은 제외하세요.'],
      'cube_option_calc.html': ['#resMeso', '.primary-metrics', '실제로 쓴 메소', '메소', '목표 옵션을 얻을 때까지 쓴 비용입니다. 메소 재설정은 사용 메소, 큐브는 구입비를 제외한 사용 수수료만 입력하세요.'],
      'item_craft_calc.html': ['#resAvg', '#resRatio', '실제 총 제작비', '메소', '노작 구입비와 선택한 제작 단계의 지출을 합산하세요. 기대값에 포함되지 않은 비용은 제외하세요.'],
      'trace_calc.html': ['#summary', '#resultBody > .card-primary', '실제로 쓴 주흔', '개', '처음부터 완성까지 사용한 주흔 개수입니다. 순백·이노센트를 주흔으로 마련했다면 해당 소모량도 포함하세요. 현재 조달 설정과 같은 범위로 비교합니다.']
    };
    const config = configs[location.pathname.split('/').pop()];
    if (!config) return;
    const [sourceSelector, anchorSelector, label, unit, hint] = config;
    const source = document.querySelector(sourceSelector), anchor = document.querySelector(anchorSelector);
    if (!source || !anchor) return;
    const panel = document.createElement('section'); panel.className = 'actual-record';
    panel.setAttribute('aria-labelledby', 'actualRecordTitle');
    panel.innerHTML = '<h3 id="actualRecordTitle">내 기록 비교</h3>' +
      '<p class="actual-baseline" id="actualBaseline"></p>' +
      '<label for="actualUsage">' + label + '</label>' +
      '<div class="actual-input-row"><input id="actualUsage" type="text" inputmode="numeric" autocomplete="off" placeholder="사용량 입력" aria-describedby="actualHint"><span>' + unit + '</span></div>' +
      '<p id="actualVerdict" class="actual-verdict" role="status" aria-live="polite"></p>' +
      '<p id="actualHint" class="actual-hint"></p>';
    anchor.after(panel);
    const input = panel.querySelector('input');
    const baseline = panel.querySelector('#actualBaseline'), verdict = panel.querySelector('#actualVerdict');
    panel.querySelector('#actualHint').textContent = hint;
    const fmt = n => n.toLocaleString('ko-KR');
    function amount(n) {
      if (unit === '개' || n < 10000) return fmt(n) + unit;
      const eok = Math.floor(n / 1e8), man = Math.floor(n % 1e8 / 1e4);
      return [eok ? fmt(eok) + '억' : '', man ? fmt(man) + '만' : ''].filter(Boolean).join(' ') + ' 메소';
    }
    function update() {
      const raw = source.dataset.expectedUsage;
      const expected = raw === undefined || raw === '' ? NaN : Number(raw);
      const valid = compareUsage(expected, 0);
      baseline.textContent = valid ? (unit === '개' ? '처음부터 총 기대 주흔 ' : '현재 조건의 기대 비용 ') + amount(valid.baseline) : '조건을 선택하면 기대값과 비교할 수 있어요.';
      baseline.title = valid ? fmt(valid.baseline) + ' ' + unit : '';
      verdict.title = '';
      verdict.className = 'actual-verdict';
      if (!input.value) { verdict.textContent = ''; return; }
      const actual = Number(input.value.replaceAll(',', ''));
      if (!Number.isSafeInteger(actual)) { verdict.textContent = '입력값이 너무 큽니다. 사용량을 확인하세요.'; return; }
      const result = compareUsage(expected, actual);
      if (!result) { verdict.textContent = '비교 가능한 기대값이 없습니다. 계산 조건을 확인하세요.'; return; }
      if (!result.difference) { verdict.textContent = '기대 사용량과 같아요.'; return; }
      const less = result.difference < 0;
      verdict.classList.add(less ? 'is-less' : 'is-more');
      const percent = result.percent === null ? '' : ' · ' + (result.percent < 0.1 ? '0.1% 미만' : result.percent.toLocaleString('ko-KR', {maximumFractionDigits:1}) + '%') + (less ? ' 절약' : ' 초과');
      verdict.textContent = '기대보다 ' + amount(Math.abs(result.difference)) + (less ? ' 덜 썼어요' : ' 더 썼어요') + percent;
      verdict.title = '정확한 차이: ' + fmt(Math.abs(result.difference)) + ' ' + unit;
    }
    input.addEventListener('input', () => {
      const before = input.value.slice(0, input.selectionStart).replace(/\D/g, '').length;
      const digits = input.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      input.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      let pos = 0, count = 0;
      while (pos < input.value.length && count < before) { if (/\d/.test(input.value[pos])) count++; pos++; }
      input.setSelectionRange(pos, pos); update();
    });
    new MutationObserver(update).observe(source, {attributes:true, attributeFilter:['data-expected-usage']});
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
