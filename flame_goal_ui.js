(function (root) {
  'use strict';

  const escape = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function optionRow({ option, index, selectedTier, tiers, allowed, weapon, label, tierValue }) {
    const name = escape(label(option));
    const unit = escape(option.unit || '');
    const selection = !weapon && ['ATT', 'ALL_PCT'].includes(option.id)
      ? '<input class="ic-num" type="number" min="' + Math.min(...allowed) + '" max="' + Math.max(...allowed) +
        '" step="1" data-required="' + index + '" aria-label="필수 ' + name + ' 최소 수치" value="' + escape(selectedTier) + '">' + unit
      : escape(tierValue(option, selectedTier));
    const choices = tiers.map(tier => {
      const active = Number(selectedTier) === tier;
      const unavailable = allowed.includes(tier) ? '' : ' disabled title="이 불꽃에서 나오지 않는 단계입니다"';
      return '<button type="button" class="ic-tier' + (active ? ' active' : '') + '" data-cond="' + index +
        '" data-tier="' + tier + '"' + unavailable + ' aria-pressed="' + active + '">' +
        (8 - tier) + '추<small>' + escape(tierValue(option, tier)) + '</small></button>';
    }).join('');
    return '<div class="ic-row"><span class="ic-row-name">' + name + unit + '</span>' +
      '<span class="ic-row-val">' + selection + ' 이상</span>' +
      '<button type="button" class="ic-x" data-delcond="' + index + '" aria-label="' + name + ' 목표 삭제">×</button>' +
      '<span class="ic-tiers">' + choices + '</span></div>';
  }

  function picks({ options, conditions, limit, weapon, showAll, label }) {
    const full = conditions.length >= limit ? ' disabled' : '';
    const grade = conditions.some(condition => condition.kind === 'grade') ? '' :
      '<button type="button" class="ic-pick" data-addgrade="1"' + full + '>주스탯 급수</button>';
    const available = options.filter(option => !conditions.some(condition => condition.kind === 'opt' && condition.id === option.id));
    const primaryIds = weapon ? ['ATT', 'ALL_PCT', 'BOSS_DMG', 'DMG'] : ['ATT', 'ALL_PCT'];
    const button = option => '<button type="button" class="ic-pick" data-addflame="' + escape(option.id) + '"' + full +
      '>' + escape(label(option) + (option.unit || '')) + '</button>';
    const primary = available.filter(option => primaryIds.includes(option.id)).map(button).join('');
    const other = available.filter(option => !primaryIds.includes(option.id)).map(button).join('');
    return '<div class="ic-picks">' + (weapon ? primary + grade : grade + primary) + '</div>' +
      (other ? '<button type="button" class="ic-more" data-more="flame" aria-expanded="' + !!showAll + '">' +
        (showAll ? '세부 조건 접기 ▴' : '세부 조건 추가 ▾') + '</button>' +
        '<div class="ic-picks' + (showAll ? '' : ' hidden') + '">' + other + '</div>' : '');
  }

  root.FlameGoalUI = { optionRow, picks };
})(globalThis);
