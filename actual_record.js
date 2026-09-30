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
      'starforce_calc.html': ['#resMeso', '#expectedResultCard', '실제로 쓴 메소', '메소', '현재 시작 성 → 목표 성까지의 지출입니다. 파괴 후 복구 메소·장비 재구입비는 포함하고, 처음 장비를 산 비용은 제외하세요.'],
      'cube_option_calc.html': ['#resMeso', '#expectedResultCard', '실제로 쓴 메소', '메소', '목표 옵션을 얻을 때까지 쓴 비용입니다. 메소 재설정은 사용 메소, 큐브는 구입비를 제외한 사용 수수료만 입력하세요.'],
      'item_craft_calc.html': ['#resAvg', '#resRatio', '실제 총 제작비', '메소', '노작 구입비와 선택한 제작 단계의 지출을 합산하세요. 기대값에 포함되지 않은 비용은 제외하세요.'],
      'trace_calc.html': ['#summary', '#expectedResultCard', '실제로 쓴 주흔', '개', '처음부터 완성까지 사용한 주흔 개수입니다. 순백·이노센트를 주흔으로 마련했다면 해당 소모량도 포함하세요. 현재 조달 설정과 같은 범위로 비교합니다.']
    };
    const page = location.pathname.split('/').pop();
    const config = configs[page];
    if (!config) return;
    const compact = ['cube_option_calc.html', 'starforce_calc.html', 'item_craft_calc.html'].includes(page);
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
      '<p id="actualAttempts" class="actual-verdict" role="status" aria-live="polite" hidden></p>' +
      '<p id="actualPercentile" class="actual-verdict" role="status" aria-live="polite"></p>' +
      '<p id="actualHint" class="actual-hint"></p>';
    anchor.after(panel);
    if (anchor.id === 'expectedResultCard') {
      panel.classList.add('actual-record-standalone');
      const heading = document.createElement('h2'); heading.id='actualRecordTitle'; heading.textContent='내 기록 비교';
      panel.querySelector('h3').replaceWith(heading);
    }
    const input = panel.querySelector('input');
    let countInput = null;
    let inputMode = 'meso';
    if (page === 'cube_option_calc.html') {
      const modes = document.createElement('div');
      modes.className = 'actual-input-modes';
      modes.setAttribute('role', 'group');
      modes.setAttribute('aria-label', '기록 입력 방식');
      modes.innerHTML = '<button type="button" data-mode="meso" aria-pressed="true">메소</button><button type="button" data-mode="count" aria-pressed="false">횟수</button>';
      const moneyWrap = document.createElement('div');
      const moneyRow = input.closest('.actual-input-row');
      moneyRow.before(modes, moneyWrap);
      moneyWrap.append(moneyRow);
      const countRow = document.createElement('div');
      countRow.className = 'actual-input-row';
      countRow.hidden = true;
      countRow.innerHTML = '<input id="actualCount" type="text" inputmode="numeric" autocomplete="off" placeholder="시도 횟수 입력" aria-describedby="actualHint"><span>회</span>';
      moneyWrap.after(countRow);
      countInput = countRow.querySelector('input');
      modes.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        inputMode = button.dataset.mode;
        moneyWrap.hidden = inputMode === 'count';
        countRow.hidden = inputMode !== 'count';
        const labelNode = panel.querySelector('label');
        labelNode.textContent = inputMode === 'count' ? '사용 횟수' : '사용 메소';
        labelNode.htmlFor = inputMode === 'count' ? 'actualCount' : 'actualUsage';
        modes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        update();
      });
    }
    const baseline = panel.querySelector('#actualBaseline'), verdict = panel.querySelector('#actualVerdict');
    const rank = panel.querySelector('#actualPercentile');
    const attempts = panel.querySelector('#actualAttempts');
    const hintNode = panel.querySelector('#actualHint');
    hintNode.textContent = hint;
    if (compact) {
      panel.classList.add('actual-record-compact');
      panel.querySelector('label').textContent = '사용 메소';
      baseline.remove();
      attempts.remove();
      rank.after(verdict);
      const helpSection = document.createElement('section');
      helpSection.className = 'ux-help-section';
      const heading = document.createElement('h3');
      heading.textContent = '내 기록 비교';
      const explanation = document.createElement('p');
      explanation.textContent = page === 'item_craft_calc.html'
        ? '상위 %는 선택한 제작 단계 전체를 시뮬레이션해 입력한 비용 이하로 완성한 비율입니다. 낮을수록 운이 좋은 기록입니다.'
        : page === 'starforce_calc.html'
        ? '상위 %는 현재 조건의 시뮬레이션에서 입력한 비용 이하로 목표에 도달한 비율이며, 낮을수록 운이 좋은 기록입니다. 강화 단계마다 비용이 달라 사용 메소만으로 실제 시도 횟수를 역산할 수 없습니다.'
        : '메소 또는 횟수를 직접 입력할 수 있습니다. 메소 입력은 1회 비용으로 나누고 나머지를 제외하며, 횟수 입력은 현재 1회 비용을 곱해 지출을 비교합니다. 상위 %는 해당 횟수 안에 성공할 확률로, 낮을수록 운이 좋은 기록입니다.';
      helpSection.append(heading, hintNode, explanation);
      document.getElementById('uxHelp').append(helpSection);
    }
    let revision = 0;
    const fmt = n => n.toLocaleString('ko-KR');
    function amount(n) {
      if (unit === '개' || n < 10000) return fmt(n) + unit;
      const eok = Math.floor(n / 1e8), man = Math.floor(n % 1e8 / 1e4);
      return [eok ? fmt(eok) + '억' : '', man ? fmt(man) + '만' : ''].filter(Boolean).join(' ') + ' 메소';
    }
    function update() {
      const current = ++revision;
      rank.textContent = '';
      rank.className = 'actual-verdict';
      rank.title = '';
      attempts.textContent = '';
      attempts.hidden = true;
      const raw = source.dataset.expectedUsage;
      const expected = raw === undefined || raw === '' ? NaN : Number(raw);
      const valid = compareUsage(expected, 0);
      baseline.textContent = valid ? (unit === '개' ? '처음부터 총 기대 주흔 ' : '현재 조건의 기대 비용 ') + amount(valid.baseline) : '조건을 선택하면 기대값과 비교할 수 있어요.';
      if (compact && valid) baseline.textContent = '기대 비용 ' + amount(valid.baseline);
      baseline.title = valid ? fmt(valid.baseline) + ' ' + unit : '';
      verdict.title = '';
      verdict.className = 'actual-verdict';
      const activeInput = inputMode === 'count' ? countInput : input;
      if (!activeInput.value) { verdict.textContent = ''; return; }
      const entered = Number(activeInput.value.replaceAll(',', ''));
      if (!Number.isSafeInteger(entered)) { verdict.textContent = '입력값이 너무 큽니다. 사용량을 확인하세요.'; return; }
      if (inputMode === 'count' && entered < 1) { verdict.textContent = '1회 이상 입력하세요.'; return; }
      const actual = inputMode === 'count' ? entered * Number(source.dataset.attemptPrice) : entered;
      if (!Number.isSafeInteger(actual)) { verdict.textContent = '입력값이 너무 큽니다. 사용량을 확인하세요.'; return; }
      const result = compareUsage(expected, actual);
      if (!result) { verdict.textContent = '비교 가능한 기대값이 없습니다. 계산 조건을 확인하세요.'; return; }
      if (typeof source.actualPercentile === 'function') {
        rank.textContent = '상위 몇 %인지 계산 중…';
        source.actualPercentile(actual, inputMode === 'count' ? entered : undefined).then(value => {
          if (current !== revision) return;
          if (value && Number.isSafeInteger(value.attempts)) {
            attempts.hidden = false;
            attempts.textContent = '역산한 시도 횟수: ' + fmt(value.attempts) + '회 · 1회 ' + fmt(value.price) + ' 메소';
            if (value.remainder > 0) attempts.textContent += ' · 나머지 ' + fmt(value.remainder) + ' 메소 (횟수에서 제외)';
            if (compact) attempts.textContent = '1회 ' + amount(value.price) + (value.remainder > 0 ? ' · 잔액 ' + amount(value.remainder) + ' 제외' : '');
            if (value.attempts === 0) {
              rank.textContent = '1회 비용 이상을 입력하면 상위 %를 계산할 수 있어요.';
              return;
            }
          }
          if (value) {
            const tier = value.percent <= 10 ? ['lucky', '🍀', '대박 행운'] :
              value.percent <= 40 ? ['good', '😎', '운 좋은 기록'] :
              value.percent <= 60 ? ['neutral', '🙂', '중간권 기록'] :
              value.percent <= 90 ? ['poor', '🥲', '아쉬운 기록'] : ['unlucky', '😭', '많이 아쉬운 기록'];
            rank.className = 'actual-verdict actual-rank is-' + tier[0];
            rank.textContent = tier[1] + ' 상위 ' + (value.percent < 0.1 ? '0.1% 미만' : value.percent.toLocaleString('ko-KR', {maximumFractionDigits:1}) + '%') + ' · ' + tier[2] + (value.samples ? ' (추정)' : '');
            if (compact) rank.textContent = (Number.isSafeInteger(value.attempts) ? fmt(value.attempts) + '회 · ' : '') + '상위 ' + (value.percent < 0.1 ? '0.1% 미만' : value.percent.toLocaleString('ko-KR', {maximumFractionDigits:1}) + '%') + (value.samples ? ' (추정)' : '');
          } else {
            rank.textContent = '이 조건은 시뮬레이션이 오래 걸려 상위 %를 계산하지 못했어요.';
          }
          rank.title = value ? (value.samples
            ? '현재 조건으로 ' + value.samples.toLocaleString('ko-KR') + '회 시뮬레이션한 결과입니다. 입력한 비용 이하로 완료한 비율이며 낮을수록 운이 좋은 기록입니다.'
            : '현재 목표 옵션을 ' + fmt(value.attempts) + '회 이내에 얻을 확률입니다. 낮을수록 운이 좋은 기록입니다.') : '';
          if (value && !value.samples && !compact) rank.textContent += ' · ' + fmt(value.attempts) + '회 이내 성공 확률';
        }).catch(() => { if (current === revision) rank.textContent = '상위 %를 계산하지 못했어요.'; });
      }
      if (!result.difference) { verdict.textContent = '기대 사용량과 같아요.'; return; }
      const less = result.difference < 0;
      verdict.classList.add(less ? 'is-less' : 'is-more');
      const percent = result.percent === null ? '' : ' · ' + (result.percent < 0.1 ? '0.1% 미만' : result.percent.toLocaleString('ko-KR', {maximumFractionDigits:1}) + '%') + (less ? ' 절약' : ' 초과');
      verdict.textContent = '기대보다 ' + amount(Math.abs(result.difference)) + (less ? ' 덜 썼어요' : ' 더 썼어요') + percent;
      if (compact) verdict.textContent = '기대보다 ' + amount(Math.abs(result.difference)) + (less ? ' 절약' : ' 초과');
      verdict.title = '정확한 차이: ' + fmt(Math.abs(result.difference)) + ' ' + unit;
    }
    [input, countInput].filter(Boolean).forEach(field => field.addEventListener('input', () => {
      const before = field.value.slice(0, field.selectionStart).replace(/\D/g, '').length;
      const digits = field.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      field.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      let pos = 0, count = 0;
      while (pos < field.value.length && count < before) { if (/\d/.test(field.value[pos])) count++; pos++; }
      field.setSelectionRange(pos, pos); update();
    }));
    new MutationObserver(update).observe(source, {attributes:true, attributeFilter:['data-expected-usage']});
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
