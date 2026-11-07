(() => {
  'use strict';

  const slots = ['반지 1', '반지 2', '반지 3', '반지 4', '얼굴장식', '눈장식', '펜던트 1', '펜던트 2', '귀걸이'];
  const slotLabels = ['반지 1', '반지 2', '반지 3', '반지 4', '얼굴', '눈', '펜던트 1', '펜던트 2', '귀걸이'];
  const shortLabels = ['반1', '반2', '반3', '반4', '얼굴', '눈', '펜1', '펜2', '귀'];
  // -1 represents a non-accessory slot. null leaves the space between columns open.
  const layout = [
    [0, 4, null, null, null, -1, -1],
    [1, 5, null, null, null, -1, -1],
    [2, 8, null, null, null, -1, -1],
    [3, 6, null, null, null, -1, -1],
    [-1, 7, -1, -1, -1, -1, -1],
    [-1, null, null, null, null, -1, -1]
  ];
  const combos = [
    { drop: 0, meso: 0, label: '비워 둠', badge: '' },
    { drop: 1, meso: 0, label: '드랍 20%', badge: '드1' },
    { drop: 0, meso: 1, label: '메획 20%', badge: '메1' },
    { drop: 2, meso: 0, label: '드랍 40%', badge: '드2' },
    { drop: 1, meso: 1, label: '드랍 20% · 메획 20%', badge: '드·메' },
    { drop: 0, meso: 2, label: '메획 40%', badge: '메2' }
  ];
  const pricedCombos = combos.slice(1);
  const lineValue = 20;
  const mesoPerEok = 100000000n;
  // A legacy 24-digit meso price may gain a decimal point when shown in eok.
  const maxPriceLength = 25;
  const maxFormattedPriceLength = maxPriceLength + Math.floor((maxPriceLength - 1) / 3);
  const storageKey = 'accessoryPlanner.v1';
  const priceKey = 'accessoryPlanner.prices.v3';
  const goalKey = 'accessoryPlanner.goals.v1';
  const { koreanAmount } = window.MoneyInput;
  const byId = id => document.getElementById(id);
  const sheet = byId('accessory-slots');
  const complete = byId('accessory-complete');
  const reset = byId('accessory-reset');
  const status = byId('accessory-status');
  const lineCount = byId('accessory-line-count');
  const lineEditor = byId('accessory-lines');
  const priceEditor = byId('accessory-prices');
  const ownedOptions = byId('accessory-owned-options');
  const ownedSummary = byId('accessory-owned-summary');
  const apply = byId('accessory-apply');
  const resultTitle = byId('accessory-result-title');
  const resultStatus = byId('accessory-result-status');
  const goalSummary = byId('accessory-goal-summary');
  const resultTable = byId('accessory-result-table');
  const resultRows = byId('accessory-result-rows');
  const resultGap = byId('accessory-result-gap');
  const gapMetrics = byId('accessory-gap-metrics');
  const gapNext = byId('accessory-gap-next');
  const gapSuggestions = byId('accessory-gap-suggestions');

  function load(key) {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(saved)) return saved;
    } catch {
      // Storage can be unavailable or contain invalid data.
    }
    return [];
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The planner still works when storage is unavailable.
    }
  }

  const savedLines = load(storageKey);
  const rows = slots.map((_, slot) => [0, 1].map(index => {
    const value = savedLines[slot * 2 + index];
    return value === 'drop' || value === 'meso' ? value : '';
  }));
  const storedVersions = [load(priceKey), load('accessoryPlanner.prices.v2'), load('accessoryPlanner.prices.v1')];
  const versionIndex = storedVersions.findIndex(version => version.length > 0);
  const storedPrices = storedVersions[versionIndex] || [];
  const prices = slots.map((_, slot) => {
    const saved = Array.isArray(storedPrices[slot]) ? storedPrices[slot] : [];
    return pricedCombos.map((_, index) => {
      const entry = saved[index];
      const raw = versionIndex === 2 ? entry : entry?.value;
      const value = typeof raw === 'string' ? raw.slice(0, maxFormattedPriceLength) : '';
      const owned = entry?.owned === true;
      if (versionIndex <= 0) return { value: formatPrice(value), owned };
      const amount = parsePrice(value, true);
      return { value: amount ? formatEok(amount) : '', owned: owned || (versionIndex === 2 && amount === 0n) };
    });
  });

  sheet.innerHTML = layout.flat().map(slot => {
    if (slot === null) return '<span aria-hidden="true"></span>';
    if (slot === -1) return '<span class="accessory-square" aria-hidden="true"></span>';
    return `
      <button type="button" class="accessory-square accessory-slot" data-slot="${slot}">
        <span class="accessory-slot-label">${slotLabels[slot]}</span>
        <span class="accessory-slot-short">${shortLabels[slot]}</span>
        <small></small>
        <span class="accessory-slot-ownership" hidden></span>
      </button>
    `;
  }).join('');
  const buttons = slots.map((_, slot) => sheet.querySelector(`[data-slot="${slot}"]`));

  lineEditor.innerHTML = ['첫째 줄', '둘째 줄'].map(label => `
    <div class="accessory-line" role="group" aria-label="${label}">
      <span>${label}</span>
      <div class="accessory-line-buttons">
        <button type="button" class="ux-button" value="">비움</button>
        <button type="button" class="ux-button" value="drop">드랍 +${lineValue}%</button>
        <button type="button" class="ux-button" value="meso">메획 +${lineValue}%</button>
      </div>
    </div>
  `).join('');
  const lineButtons = Array.from(lineEditor.children, group => group.querySelectorAll('button'));
  ownedOptions.innerHTML = pricedCombos.map(combo => `
    <button type="button" class="ux-button accessory-owned">
      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path class="accessory-owned-plus" d="M8 4v8M4 8h8"/>
        <path class="accessory-owned-check" d="m4 8 2.5 2.5L12 5"/>
      </svg>
      ${combo.label}
    </button>
  `).join('');
  priceEditor.innerHTML = pricedCombos.map((combo, index) => `
    <label class="accessory-price">
      <span id="accessory-price-option-${index}">${combo.label}</span>
      <span class="accessory-price-entry">
        <input type="text" inputmode="decimal" maxlength="${maxFormattedPriceLength}" autocomplete="off" spellcheck="false" aria-labelledby="accessory-slot-title accessory-price-option-${index}" aria-describedby="accessory-price-unit-${index}" aria-errormessage="accessory-price-error">
        <span id="accessory-price-unit-${index}">억 메소</span>
      </span>
    </label>
  `).join('') + '<p class="accessory-price-error" id="accessory-price-error" hidden>억 메소 단위로 0보다 큰 수를 입력하세요. 소수점 아래 최대 8자리까지 입력할 수 있습니다.</p>';
  const priceInputs = Array.from(priceEditor.querySelectorAll('input'));
  const ownedButtons = Array.from(ownedOptions.querySelectorAll('button'));
  const priceError = priceEditor.querySelector('.accessory-price-error');

  const savedGoals = load(goalKey);
  const metrics = Array.from(document.querySelectorAll('.accessory-metric'), (card, index) => {
    const target = card.querySelector('input[type="range"]');
    const cap = Number(target.max);
    const saved = savedGoals[index];
    if (Number.isInteger(saved) && saved >= 0 && saved <= cap && saved % lineValue === 0) target.value = String(saved);
    return {
      kind: card.dataset.kind,
      cap,
      target,
      targetValue: card.querySelector('.accessory-target-value'),
      progress: card.querySelector('progress'),
      score: card.querySelector('strong'),
      detail: card.querySelector('.accessory-detail')
    };
  });
  let selected = 0;
  let best;

  function countLines(lines, kind) {
    return lines.filter(line => line === kind).length;
  }

  function missingLines(lines) {
    return metrics.flatMap(({ kind, target }) =>
      Array(Math.max(0, Number(target.value) / lineValue - countLines(lines, kind))).fill(kind)
    );
  }

  function renderLineButtons() {
    lineButtons.forEach((choices, index) => {
      choices.forEach(choice => choice.setAttribute('aria-pressed', String(choice.value === rows[selected][index])));
    });
  }

  function renderSlotButtons() {
    buttons.forEach((button, slot) => {
      const drop = countLines(rows[slot], 'drop');
      const meso = countLines(rows[slot], 'meso');
      const index = combos.findIndex(option => option.drop === drop && option.meso === meso);
      const combo = combos[index];
      const owned = prices[slot][index - 1]?.owned;
      const ownedCount = prices[slot].filter(entry => entry.owned).length;
      const badge = button.querySelector('.accessory-slot-ownership');
      const ownership = owned ? '보유 중' : ownedCount ? `보유 조합 ${ownedCount}개 등록` : '';
      const description = [slots[slot], combo.label, ownership].filter(Boolean).join(' · ');
      button.setAttribute('aria-label', description);
      button.title = description;
      button.dataset.option = combo.badge;
      button.dataset.owned = owned ? 'equipped' : ownedCount ? 'registered' : '';
      button.querySelector('small').textContent = combo.badge;
      badge.textContent = owned ? '보유 중' : `보유 ${ownedCount}`;
      badge.hidden = !ownedCount;
    });
  }

  function renderOptions() {
    const lines = rows.flat();
    const empty = countLines(lines, '');
    const double = rows.filter(row => row.every(Boolean)).length;
    const missing = missingLines(lines).length;
    lineCount.textContent = `사용 ${lines.length - empty} / ${lines.length}줄 · 2줄 장비 ${double}개`;

    for (const { kind, cap, target, targetValue, progress, score, detail } of metrics) {
      const goal = Number(target.value);
      const total = countLines(lines, kind) * lineValue;
      const applied = Math.min(total, cap);
      const shortfall = goal - applied;
      targetValue.textContent = `${goal}%`;
      target.setAttribute('aria-valuetext', `${goal}%`);
      score.textContent = `${applied}%`;
      progress.value = goal === 0 ? 100 : Math.min(100, applied / goal * 100);
      if (total > cap) detail.textContent = `옵션 합계 ${total}% · 상한 ${total - cap}%p 초과`;
      else if (shortfall > 0) detail.textContent = `${shortfall}%p 부족 · ${shortfall / lineValue}줄`;
      else detail.textContent = '목표 달성';
    }

    complete.setAttribute('aria-disabled', String(missing === 0 || missing > empty));
    reset.setAttribute('aria-disabled', String(empty === lines.length));
    if (missing === 0) status.textContent = '드랍과 메획 목표를 모두 달성했습니다.';
    else if (missing > empty) status.textContent = `빈 줄이 ${missing - empty}줄 부족합니다. 목표를 넘긴 옵션을 바꾸면 두 목표를 채울 수 있어요.`;
    else status.textContent = `선택한 옵션을 유지하고 빈 줄에 ${missing}줄을 채웁니다.`;

    renderSlotButtons();
    renderLineButtons();
  }

  function formatPrice(value) {
    if (value.replaceAll(',', '').length > maxPriceLength) return value;
    const match = /^(\s*)([\d,]*)(\.\d*)?\s*(?:억(?:\s*메소)?\s*)?$/.exec(value);
    if (!match || (!match[2] && !match[3])) return value;
    const [, prefix, whole, fraction = ''] = match;
    const grouped = whole.replaceAll(',', '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return prefix + grouped + fraction;
  }

  function parsePrice(input, legacy = false) {
    const value = input.trim();
    if (value.replaceAll(',', '').length > (legacy ? 24 : maxPriceLength)) return null;
    const match = /^(\d+|\d{1,3}(?:,\d{3})+)?(?:\.(\d{0,8}))?\s*(억)?$/.exec(value);
    if (!match || (!match[1] && !match[2])) return null;
    const [, whole, fraction, unit] = match;
    if (legacy && (!whole || fraction === '')) return null;
    const digits = (whole || '0').replaceAll(',', '');
    if (legacy && !unit) return fraction ? null : BigInt(digits);
    return BigInt(digits + (fraction || '').padEnd(8, '0'));
  }

  function formatEok(amount) {
    const whole = String(amount / mesoPerEok);
    const fraction = String(amount % mesoPerEok).padStart(8, '0').replace(/0+$/, '');
    return formatPrice(fraction ? `${whole}.${fraction}` : whole);
  }

  function renderPriceErrors() {
    let hasError = false;
    priceInputs.forEach(input => {
      const invalid = !input.disabled && input.value.trim() !== '' && !parsePrice(input.value);
      input.setAttribute('aria-invalid', String(invalid));
      hasError ||= invalid;
    });
    priceError.hidden = !hasError;
  }

  function renderPriceInputs() {
    const ownedLabels = [];
    priceInputs.forEach((input, index) => {
      const { value, owned } = prices[selected][index];
      input.value = owned ? '' : value;
      input.placeholder = owned ? '0' : '';
      input.disabled = owned;
      ownedButtons[index].setAttribute('aria-pressed', String(owned));
      if (owned) ownedLabels.push(pricedCombos[index].label);
    });
    ownedSummary.textContent = ownedLabels.length > 1 ? `${ownedLabels.length}개 등록` : ownedLabels[0] || '미등록';
  }

  function selectSlot(slot) {
    selected = slot;
    buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === slot)));
    byId('accessory-slot-title').textContent = slots[slot];
    renderLineButtons();
    renderPriceInputs();
    renderPriceErrors();
  }

  function findPlans(candidates, dropGoal, mesoGoal) {
    // Rates beyond the requested goal are equivalent when comparing prices.
    // A registered plan wins over any plan that still needs a price for the same totals.
    const key = (drop, meso) => drop * (mesoGoal + 1) + meso;
    let states = new Map([[0, { drop: 0, meso: 0, missing: 0, cost: 0n, picks: [] }]]);
    for (const choices of candidates) {
      const next = new Map();
      for (const state of states.values()) {
        for (const choice of choices) {
          const drop = Math.min(dropGoal, state.drop + choice.drop);
          const meso = Math.min(mesoGoal, state.meso + choice.meso);
          const index = key(drop, meso);
          const missing = state.missing + Number(choice.price === null);
          const cost = state.cost + (choice.price ?? 0n);
          const previous = next.get(index);
          if (!previous || missing < previous.missing || (missing === previous.missing && cost < previous.cost)) {
            next.set(index, { drop, meso, missing, cost, picks: [...state.picks, choice] });
          }
        }
      }
      states = next;
    }
    return Array.from(states.values());
  }

  function renderShortfall(plans, goalPlan) {
    const closest = plans.filter(plan => plan.missing === 0).reduce((nearest, plan) => {
      const matched = plan.drop + plan.meso;
      const nearestMatched = nearest.drop + nearest.meso;
      return matched > nearestMatched || (matched === nearestMatched && plan.cost < nearest.cost) ? plan : nearest;
    });
    gapMetrics.innerHTML = metrics.map(({ kind, cap, target }) => {
      const actual = Math.min(cap, closest.picks.reduce((sum, pick) => sum + pick[kind], 0) * lineValue);
      const goal = Number(target.value);
      const deficit = Math.max(0, goal - actual);
      const label = kind === 'drop' ? '드랍률' : '메소 획득량';
      return `<div>
        <dt>${label}</dt>
        <dd><strong>${actual}%</strong> / ${goal}%</dd>
        <dd class="accessory-gap-status" data-shortfall="${deficit > 0}">${deficit ? `${deficit}%p 부족 · ${deficit / lineValue}줄` : '목표 달성'}</dd>
      </div>`;
    }).join('');
    gapNext.textContent = `최소 ${goalPlan.missing}개 추가 등록 예시`;
    gapSuggestions.innerHTML = goalPlan.picks.map((choice, slot) => choice.price === null ? `
      <li><button type="button" class="ux-button" data-suggest-slot="${slot}" data-suggest-option="${choice.option}">
        <span>${slots[slot]} · ${choice.label}</span><span>가격 입력 →</span>
      </button></li>` : '').join('');
  }

  function renderResult() {
    const [dropTarget, mesoTarget] = metrics.map(({ target }) => Number(target.value));
    goalSummary.textContent = `목표 드랍 ${dropTarget}% · 메획 ${mesoTarget}%`;
    const candidates = prices.map(slotPrices => [
      { ...combos[0], price: 0n },
      ...pricedCombos.map((combo, option) => {
        const { value, owned } = slotPrices[option];
        const price = owned ? 0n : (parsePrice(value) || null);
        return { ...combo, option, price, owned };
      })
    ]);
    const registered = candidates.reduce((total, choices) => total + choices.filter(choice => choice.price !== null).length - 1, 0);
    const dropGoal = dropTarget / lineValue;
    const mesoGoal = mesoTarget / lineValue;
    const plans = findPlans(candidates, dropGoal, mesoGoal);
    const goalPlan = plans.find(plan => plan.drop === dropGoal && plan.meso === mesoGoal);
    best = goalPlan?.missing === 0 ? goalPlan : undefined;
    apply.hidden = resultTable.hidden = !best;
    resultGap.hidden = Boolean(best || !registered || !goalPlan);

    if (!best) {
      resultStatus.textContent = registered
        ? `등록한 후보로 두 목표를 함께 달성할 수 없습니다. (${registered} / ${slots.length * pricedCombos.length}개 등록)`
        : '가격이나 보유 장비를 등록하면 최저가 조합을 확인할 수 있습니다.';
      if (!resultGap.hidden) renderShortfall(plans, goalPlan);
      return;
    }

    resultStatus.textContent = `최저 합계 ${koreanAmount(best.cost)}`;
    const displayRows = best.picks.map((choice, slot) => ({ ...choice, slot, group: choice.owned ? 0 : choice.badge ? 1 : 2 }));
    displayRows.sort((a, b) => a.group - b.group);
    resultRows.innerHTML = displayRows.map(({ label, badge, price, owned, slot }) => `
      <tr data-status="${owned ? 'owned' : badge ? 'buy' : 'empty'}">
        <th scope="row"><span class="accessory-result-slot">${slots[slot]}${badge ? `
          <span class="accessory-result-badge">${owned ? '✓ 보유 중' : '구매'}</span>` : ''}</span></th>
        <td>${label}</td>
        <td>${badge ? koreanAmount(price) : '—'}</td>
      </tr>
    `).join('');
  }

  function updateOptions() {
    save(storageKey, rows.flat());
    renderOptions();
  }

  function updatePrices() {
    save(priceKey, prices);
    renderPriceErrors();
    renderResult();
  }

  metrics.forEach(({ target }) => target.addEventListener('input', () => {
    save(goalKey, metrics.map(metric => Number(metric.target.value)));
    renderOptions();
    renderResult();
  }));
  buttons.forEach((button, slot) => button.addEventListener('click', () => selectSlot(slot)));
  lineButtons.forEach((choices, index) => {
    choices.forEach(choice => choice.addEventListener('click', () => {
      rows[selected][index] = choice.value;
      updateOptions();
    }));
  });
  priceInputs.forEach((input, index) => {
    function updatePrice(event) {
      if (event.isComposing) return;

      const value = input.value;
      const formatted = formatPrice(value);
      if (formatted !== value) {
        let remaining = Math.min(value.slice(0, input.selectionStart).replaceAll(',', '').length, formatted.replaceAll(',', '').length);
        let caret = 0;
        while (remaining > 0) {
          if (formatted[caret] !== ',') remaining--;
          caret++;
        }
        if (event.inputType === 'deleteContentForward' && formatted[caret] === ',') caret++;
        input.value = formatted;
        input.setSelectionRange(caret, caret);
      }

      prices[selected][index].value = input.value;
      updatePrices();
    }

    input.addEventListener('input', updatePrice);
    input.addEventListener('compositionend', updatePrice);
    input.addEventListener('keydown', event => {
      const forwardTab = event.key === 'Tab' && !event.shiftKey;
      if ((!forwardTab && event.key !== 'Enter') || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      const next = priceInputs.slice(index + 1).find(field => !field.disabled);
      if (next) {
        if (forwardTab) return;
        event.preventDefault();
        next.focus();
        return;
      }

      const nextSlot = prices.findIndex((options, slot) => slot > selected && options.some(option => !option.owned));
      if (nextSlot === -1) {
        if (!forwardTab) {
          event.preventDefault();
          resultTitle.focus();
        }
        return;
      }
      event.preventDefault();
      selectSlot(nextSlot);
      const first = priceInputs.find(field => !field.disabled);
      first.focus();
      first.select();
    });
  });
  ownedButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      const entry = prices[selected][index];
      entry.owned = !entry.owned;
      renderPriceInputs();
      renderSlotButtons();
      updatePrices();
    });
  });
  gapSuggestions.addEventListener('click', event => {
    const button = event.target.closest('[data-suggest-slot]');
    if (!button) return;
    selectSlot(Number(button.dataset.suggestSlot));
    const input = priceInputs[Number(button.dataset.suggestOption)];
    input.focus();
    input.select();
  });
  complete.addEventListener('click', () => {
    if (complete.getAttribute('aria-disabled') === 'true') return;

    // Use one line on each empty item before adding another two-line item.
    const available = rows.flatMap(row => row.flatMap((line, index) =>
      line ? [] : [{ row, index, first: index === 0 && !row[1] }]
    ));
    available.sort((a, b) => Number(b.first) - Number(a.first));
    missingLines(rows.flat()).forEach((kind, index) => {
      const target = available[index];
      target.row[target.index] = kind;
    });
    updateOptions();
  });
  reset.addEventListener('click', () => {
    if (reset.getAttribute('aria-disabled') === 'true') return;
    rows.forEach(row => row.fill(''));
    updateOptions();
  });
  apply.addEventListener('click', () => {
    if (!best) return;
    best.picks.forEach(({ drop, meso }, slot) => {
      rows[slot] = [...Array(drop).fill('drop'), ...Array(meso).fill('meso'), '', ''].slice(0, 2);
    });
    updateOptions();
    buttons[selected].focus();
  });

  renderOptions();
  selectSlot(0);
  renderResult();
})();
