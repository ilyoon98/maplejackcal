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
  const maxPriceLength = 24;
  const maxFormattedPriceLength = maxPriceLength + Math.floor((maxPriceLength - 1) / 3);
  const storageKey = 'accessoryPlanner.v1';
  const priceKey = 'accessoryPlanner.prices.v2';
  const { koreanAmount } = window.MoneyInput;
  const byId = id => document.getElementById(id);
  const sheet = byId('accessory-slots');
  const complete = byId('accessory-complete');
  const reset = byId('accessory-reset');
  const status = byId('accessory-status');
  const lineCount = byId('accessory-line-count');
  const lineEditor = byId('accessory-lines');
  const priceEditor = byId('accessory-prices');
  const apply = byId('accessory-apply');
  const resultTitle = byId('accessory-result-title');
  const resultStatus = byId('accessory-result-status');
  const resultTable = byId('accessory-result-table');
  const resultRows = byId('accessory-result-rows');

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
  const savedPrices = load(priceKey);
  const useLegacyPrices = savedPrices.length === 0;
  const storedPrices = useLegacyPrices ? load('accessoryPlanner.prices.v1') : savedPrices;
  const prices = slots.map((_, slot) => {
    const saved = Array.isArray(storedPrices[slot]) ? storedPrices[slot] : [];
    return pricedCombos.map((_, index) => {
      const entry = saved[index];
      const raw = useLegacyPrices ? entry : entry?.value;
      const value = typeof raw === 'string' ? raw.slice(0, maxFormattedPriceLength) : '';
      const amount = parsePrice(value);
      if (useLegacyPrices && amount === 0n) return { value: '', owned: true };
      return { value: amount === null ? value : formatPrice(value), owned: entry?.owned === true };
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
  // Keep ownership controls reachable before the continuous price entry sequence.
  priceEditor.innerHTML = pricedCombos.map((combo, index) => `
    <button type="button" class="ux-button accessory-owned" style="--price-row: ${index + 1}" aria-label="${combo.label} 보유">
      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path class="accessory-owned-plus" d="M8 4v8M4 8h8"/>
        <path class="accessory-owned-check" d="m4 8 2.5 2.5L12 5"/>
      </svg>
      보유
    </button>
  `).join('') + pricedCombos.map((combo, index) => `
    <label class="accessory-price" style="--price-row: ${index + 1}">
      <span id="accessory-price-option-${index}">${combo.label}</span>
      <input type="text" maxlength="${maxFormattedPriceLength}" autocomplete="off" spellcheck="false" aria-labelledby="accessory-slot-title accessory-price-option-${index}" aria-errormessage="accessory-price-error">
    </label>
  `).join('') + '<p class="accessory-price-error" id="accessory-price-error" hidden>0보다 큰 가격을 메소 숫자 또는 12.5억 형식으로 입력하세요.</p>';
  const priceInputs = Array.from(priceEditor.querySelectorAll('input'));
  const ownedButtons = Array.from(priceEditor.querySelectorAll('.accessory-owned'));
  const priceError = priceEditor.querySelector('.accessory-price-error');

  const metrics = Array.from(document.querySelectorAll('.accessory-metric'), card => {
    const progress = card.querySelector('progress');
    return {
      kind: card.dataset.kind,
      cap: progress.max,
      progress,
      score: card.querySelector('strong'),
      detail: card.querySelector('.accessory-detail')
    };
  });
  const [dropGoal, mesoGoal] = metrics.map(({ cap }) => cap / lineValue);
  let selected = 0;
  let best;

  function countLines(lines, kind) {
    return lines.filter(line => line === kind).length;
  }

  function missingLines(lines) {
    return metrics.flatMap(({ kind, cap }) =>
      Array(Math.max(0, cap / lineValue - countLines(lines, kind))).fill(kind)
    );
  }

  function renderLineButtons() {
    lineButtons.forEach((choices, index) => {
      choices.forEach(choice => choice.setAttribute('aria-pressed', String(choice.value === rows[selected][index])));
    });
  }

  function renderOptions() {
    const lines = rows.flat();
    const empty = countLines(lines, '');
    const double = rows.filter(row => row.every(Boolean)).length;
    const missing = missingLines(lines).length;
    lineCount.textContent = `사용 ${lines.length - empty} / ${lines.length}줄 · 2줄 장비 ${double}개`;

    for (const { kind, cap, progress, score, detail } of metrics) {
      const total = countLines(lines, kind) * lineValue;
      const applied = Math.min(total, cap);
      score.textContent = `${applied}%`;
      progress.value = applied;
      if (total > cap) detail.textContent = `옵션 합계 ${total}% · ${total - cap}%p 초과`;
      else if (total < cap) detail.textContent = `${cap - total}%p 부족 · ${(cap - total) / lineValue}줄`;
      else detail.textContent = '목표 달성';
    }

    complete.setAttribute('aria-disabled', String(missing === 0 || missing > empty));
    reset.setAttribute('aria-disabled', String(empty === lines.length));
    if (missing === 0) status.textContent = '드랍과 메획 목표를 모두 달성했습니다.';
    else if (missing > empty) status.textContent = `빈 줄이 ${missing - empty}줄 부족합니다. 상한을 초과한 옵션을 바꾸면 두 목표를 채울 수 있어요.`;
    else status.textContent = `선택한 옵션을 유지하고 빈 줄에 ${missing}줄을 채웁니다.`;

    buttons.forEach((button, slot) => {
      const drop = countLines(rows[slot], 'drop');
      const meso = countLines(rows[slot], 'meso');
      const combo = combos.find(option => option.drop === drop && option.meso === meso);
      const description = `${slots[slot]} · ${combo.label}`;
      button.setAttribute('aria-label', description);
      button.title = description;
      button.dataset.option = combo.badge;
      button.querySelector('small').textContent = combo.badge;
    });
    renderLineButtons();
  }

  function formatPrice(value) {
    if (value.replaceAll(',', '').length > maxPriceLength) return value;
    const match = /^(\s*)([\d,]+)((?:\.\d*)?\s*(?:억\s*)?)$/.exec(value);
    if (!match) return value;
    const [, prefix, whole, suffix] = match;
    const grouped = whole.replaceAll(',', '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return prefix + grouped + suffix;
  }

  function parsePrice(input) {
    const value = input.trim();
    if (value.replaceAll(',', '').length > maxPriceLength) return null;
    const match = /^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,8}))?\s*(억)?$/.exec(value);
    if (!match) return null;
    const [, whole, fraction, unit] = match;
    const digits = whole.replaceAll(',', '');
    if (unit) return BigInt(digits + (fraction || '').padEnd(8, '0'));
    return fraction ? null : BigInt(digits);
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
    priceInputs.forEach((input, index) => {
      const { value, owned } = prices[selected][index];
      input.value = owned ? '' : value;
      input.placeholder = owned ? '0 메소' : '';
      input.disabled = owned;
      ownedButtons[index].setAttribute('aria-pressed', String(owned));
    });
  }

  function selectSlot(slot) {
    selected = slot;
    buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === slot)));
    byId('accessory-slot-title').textContent = slots[slot];
    renderLineButtons();
    renderPriceInputs();
    renderPriceErrors();
  }

  function findLowestPrice(candidates) {
    // Rates beyond their caps have the same value for reaching the goal.
    const key = (drop, meso) => drop * (mesoGoal + 1) + meso;
    let states = new Map([[0, { drop: 0, meso: 0, cost: 0n, picks: [] }]]);
    for (const choices of candidates) {
      const next = new Map();
      for (const state of states.values()) {
        for (const choice of choices) {
          const drop = Math.min(dropGoal, state.drop + choice.drop);
          const meso = Math.min(mesoGoal, state.meso + choice.meso);
          const index = key(drop, meso);
          const cost = state.cost + choice.price;
          const previous = next.get(index);
          if (!previous || cost < previous.cost) {
            next.set(index, { drop, meso, cost, picks: [...state.picks, choice] });
          }
        }
      }
      states = next;
    }
    return states.get(key(dropGoal, mesoGoal));
  }

  function renderResult() {
    const candidates = prices.map(slotPrices => {
      const choices = [{ ...combos[0], price: 0n }];
      pricedCombos.forEach((combo, index) => {
        const { value, owned } = slotPrices[index];
        const price = owned ? 0n : parsePrice(value);
        if (owned || price) choices.push({ ...combo, price, owned });
      });
      return choices;
    });
    const registered = candidates.reduce((total, choices) => total + choices.length - 1, 0);
    best = findLowestPrice(candidates);
    apply.hidden = resultTable.hidden = !best;

    if (!best) {
      resultStatus.textContent = registered
        ? `등록한 후보로 두 목표를 함께 달성할 수 없습니다. 다른 조합을 더 등록하세요. (${registered} / ${slots.length * pricedCombos.length}개 등록)`
        : '가격이나 보유 장비를 등록하면 최저가 조합을 확인할 수 있습니다.';
      return;
    }

    resultStatus.textContent = `최저 합계 ${koreanAmount(best.cost)}`;
    resultRows.innerHTML = best.picks.map(({ label, badge, price, owned }, slot) => `
      <tr>
        <th scope="row">${slots[slot]}</th>
        <td>${label}</td>
        <td>${owned ? '보유 중' : badge ? koreanAmount(price) : '—'}</td>
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
        let remaining = value.slice(0, input.selectionStart).replaceAll(',', '').length;
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
      updatePrices();
    });
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
