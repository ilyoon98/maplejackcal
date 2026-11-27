(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const core = SoulCore;
  const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat('ko-KR', { style: 'percent', maximumFractionDigits: 6 });
  const recordPercent = new Intl.NumberFormat('ko-KR', { style: 'percent', maximumFractionDigits: 2 });
  function pct(p) {
    if (p > 0 && p < 0.00000001) return '< 0.000001%';
    if (p < 1 && p > .99999999) return '> 99.999999%';
    return percent.format(p);
  }
  const meso = n => Number.isFinite(n) ? MoneyInput.koreanAmount(BigInt(Math.round(n))) : '—';
  const expectedMeso = n => meso(Math.round(n / 10000) * 10000);
  const times = n => `${number.format(n)}회`;
  const stageName = n => n ? `${n}단계` : '미증폭';
  const attackPercentKeys = ['공격력 %', '마력 %'];
  const preferredGoalKeys = [...attackPercentKeys, '공격력', '마력'];
  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
  const choices = (values, label) => values.map(value => [value, label(value)]);
  const get = id => Number($(id).value);
  const text = (id, value) => {
    if ($(id).textContent !== value) $(id).textContent = value;
  };
  const spentMeso = (count, price) => MoneyInput.koreanAmount(BigInt(count) * BigInt(price));

  function toneSelect(id, kind) {
    $(id).dataset.soulTone = `${kind}-${get(id)}`;
  }

  function tone(label, kind, value) {
    const span = document.createElement('span');
    span.dataset.soulTone = `${kind}-${value}`;
    span.textContent = label;
    return span;
  }

  function percentile(lower, upper = lower) {
    const format = value => (value > 0 && value < .0001) || (value < 1 && value > .9999) ? pct(value) : recordPercent.format(value);
    const start = format(lower);
    const end = format(upper);
    return `상위 ${start === end ? start : `${start} ~ ${end}`}`;
  }

  function optionalAttempts(field, hint, limit, message) {
    field.max = limit;
    const min = Number(field.min);
    const value = field.valueAsNumber;
    const recorded = field.value !== '' || field.validity.badInput;
    const valid = !recorded || (Number.isSafeInteger(value) && value >= min && value <= limit);
    field.setAttribute('aria-invalid', String(!valid));
    hint.textContent = valid ? message : limit === Number.MAX_SAFE_INTEGER ? `입력 오류. ${min} 이상의 정수를 입력하세요.`
      : `입력 오류. ${times(min)}부터 ${times(limit)}까지 입력하세요.`;
    return valid && recorded ? value : null;
  }

  function limitInputToMaximum(input) {
    if (input.max && input.valueAsNumber > Number(input.max)) input.value = input.max;
  }

  function recordValue(label, actual, expected, format, placement) {
    return ActualRecord.metric(document, { label, actual, expected, format,
      placement: placement?.length ? percentile(...placement) : '' });
  }

  function renderRecord(id, record, comparison, note = '') {
    $(id).hidden = !record.hasData;
    const list = $(id + '-metrics');
    const costDisplay = value => typeof value === 'bigint' ? MoneyInput.koreanAmount(value) : expectedMeso(value).replace(/ 메소$/, '');
    list.replaceChildren(...(record.hasData ? [
      recordValue('사용 메소', record.spent, comparison?.cost, costDisplay, comparison?.byCost),
      recordValue('시도 횟수', record.attempts, comparison?.attempts, times, comparison?.byAttempts)
    ] : []));
    text(id + '-note', note);
  }

  function select(id, entries, preferred = $(id).value) {
    const field = $(id);
    const key = JSON.stringify(entries);
    if (field.dataset.choices !== key) {
      field.replaceChildren(...entries.map(([value, label]) => new Option(label, value)));
      field.dataset.choices = key;
    }
    if (entries.some(([value]) => String(value) === String(preferred))) field.value = preferred;
    else field.selectedIndex = 0;
  }

  function metrics(id, values) {
    const fragment = document.createDocumentFragment();
    for (const [name, value] of values) {
      const item = document.createElement('div');
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = name;
      detail.textContent = value;
      item.append(term, detail);
      fragment.append(item);
    }
    $(id).replaceChildren(fragment);
  }

  function table(id, rows) {
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const tr = document.createElement('tr');
      row.forEach((value, index) => {
        const cell = document.createElement(index ? 'td' : 'th');
        if (!index) cell.scope = 'row';
        cell.textContent = value;
        tr.append(cell);
      });
      fragment.append(tr);
    }
    $(id).replaceChildren(fragment);
  }

  function attackPresets(lines, key) {
    const commonValue = line => line.reduce((best, option) =>
      option.key === key && (!best || option.p > best.p) ? option : best, null)?.value;
    const [first, second, third] = lines.map(commonValue);
    return [
      { total: first, label: '1줄' },
      { total: first + second, label: '2줄' },
      { total: first + second + third, label: '3줄' }
    ].filter(preset => Number.isFinite(preset.total));
  }

  function renderGoalPicks(input, picks, totals, unit, presets) {
    const key = JSON.stringify([unit, totals, presets]);
    if (picks.dataset.totals !== key) {
      const featuredTotals = new Set(presets.map(preset => preset.total));
      const otherTotals = totals.filter(total => !featuredTotals.has(total)).map(total => ({ total }));
      const createButton = ({ total, label }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ux-button ux-choice';
        button.dataset.goalSum = total;
        const value = `${number.format(total)}${unit}`;
        if (label) {
          button.classList.add('soul-goal-preset');
          const caption = document.createElement('small');
          caption.textContent = label;
          const amount = document.createElement('strong');
          amount.textContent = value;
          button.append(caption, amount);
        } else {
          button.textContent = value;
        }
        button.addEventListener('click', () => {
          input.value = total;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        return button;
      };
      picks.replaceChildren();
      for (const entries of [presets, otherTotals].filter(group => group.length)) {
        const row = document.createElement('div');
        row.className = 'soul-goal-pick-row';
        if (entries === presets) row.classList.add('soul-goal-preset-row');
        row.append(...entries.map(createButton));
        picks.append(row);
      }
      picks.dataset.totals = key;
    }
    for (const button of picks.querySelectorAll('[data-goal-sum]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.goalSum) === input.valueAsNumber));
    }
  }

  function goalInput(lines, initialTotal, ids, available) {
    const [typeId, totalId] = ids;
    const optionKeys = [
      ...preferredGoalKeys.filter(key => available.has(key)),
      ...[...available.keys()].filter(key => !preferredGoalKeys.includes(key))
    ];
    select(typeId, [['', '옵션 선택'], ...choices(optionKeys, key => key)]);
    const key = $(typeId).value;
    const option = available.get(key);
    const totalField = $(totalId);
    const field = totalField.closest('.field');
    const hint = field.querySelector('[data-goal-hint]');
    const shown = Boolean(option && option.key !== option.name);
    field.hidden = !shown;
    if (totalField.dataset.goalKey !== key) {
      totalField.value = totalField.dataset.goalKey === undefined && key === '공격력 %' ? initialTotal ?? '' : '';
    }
    totalField.dataset.goalKey = key;
    if (!option) return null;
    if (!shown) return { key, lines: 1, total: 1, unit: '', shown };
    const totals = core.goalValues(lines, key, 1);
    const total = totalField.valueAsNumber;
    const valid = Number.isFinite(total) && total > 0;
    const maximum = totals.at(-1);
    const presets = attackPercentKeys.includes(key) ? attackPresets(lines, key) : [];
    renderGoalPicks(totalField, field.querySelector('[data-goal-picks]'), totals, option.unit, presets);
    field.querySelector('label').textContent = option.unit ? '직접 입력 (%)' : '직접 입력';
    totalField.max = maximum;
    totalField.placeholder = `최대 ${number.format(maximum)}${option.unit}`;
    const invalid = !valid && (totalField.value !== '' || totalField.validity.badInput);
    totalField.setAttribute('aria-invalid', String(invalid));
    const next = totals.find(value => value >= total);
    hint.textContent = invalid ? '입력 오류. 0보다 큰 합계를 입력하세요.'
      : !valid ? '합계를 고르거나 숫자를 입력하세요.' : next === total ? ''
      : next === undefined ? `가능한 최대 합계는 ${number.format(maximum)}${option.unit}입니다.`
      : `실제로 나오는 합계 중 ${number.format(next)}${option.unit} 이상이 성공입니다.`;
    hint.hidden = !hint.textContent;
    return valid ? { key, lines: 1, total, unit: option.unit, shown } : null;
  }

  function goalName(goal) {
    if (!goal.shown) return goal.key;
    return `${goal.key.replace(/ %$/, '')} 합계 ${goal.total.toLocaleString('ko-KR', { maximumFractionDigits: 12 })}${goal.unit} 이상`;
  }

  function goalSummary(groups) {
    if (groups.length > 1) return `옵션 조건 ${groups.length}개 중 하나 이상 충족`;
    return groups[0].length > 1 ? `${groups[0].length}개 옵션을 모두 충족` : goalName(groups[0][0]);
  }

  function createGoalEditor(onChange, defaultAttack = false) {
    const editor = $('option-editor');
    editor.innerHTML = `
      <p class="ux-hint soul-wide">한 조건 안의 옵션은 모두 맞아야 해요.</p>
      <div class="soul-wide soul-goal-groups" id="option-goals"></div>
      <div class="soul-wide"><button type="button" class="ux-button" id="add-option-group">또는 조건 추가</button></div>
      <template>
        <div class="soul-fields soul-goal-row">
          <div class="field soul-wide"><label data-goal-label="type">목표 옵션</label><select data-goal-input="type"></select></div>
          <div class="field soul-wide soul-number-row">
            <div class="soul-goal-picks" role="group" aria-label="가능한 합계" data-goal-picks></div>
            <label data-goal-label="total">직접 입력</label>
            <input data-goal-input="total" type="number" min="0" step="any" inputmode="decimal">
            <small class="ux-hint" data-goal-hint></small>
          </div>
          <div class="soul-wide" data-goal-remove-slot><button type="button" class="ux-button" data-goal-remove>옵션 삭제</button></div>
        </div>
      </template>
    `;
    const rowTemplate = editor.querySelector('template');
    const groupsHost = $('option-goals');
    const goalGroups = () => [...groupsHost.children];
    const goalRows = group => [...group.querySelectorAll('.soul-goal-row')];
    let nextGoal = 0;

    function addGoalRow(group) {
      const row = rowTemplate.content.firstElementChild.cloneNode(true);
      const index = nextGoal++;
      const suffix = index ? `-${index}` : '';
      for (const input of row.querySelectorAll('[data-goal-input]')) {
        const name = input.dataset.goalInput;
        input.id = `goal-${name}${suffix}`;
        row.querySelector(`[data-goal-label="${name}"]`).htmlFor = input.id;
        if (name === 'total') {
          const hint = row.querySelector('[data-goal-hint]');
          hint.id = `${input.id}-hint`;
          input.setAttribute('aria-describedby', hint.id);
        }
      }
      group.querySelector('.soul-goal-rows').append(row);
      return row.querySelector('[data-goal-input="type"]');
    }

    function addGoalGroup() {
      const group = document.createElement('fieldset');
      group.className = 'soul-goal-group';
      group.innerHTML = '<legend></legend><div class="soul-goal-rows"></div><div class="soul-actions"><button type="button" class="ux-button" data-goal-add>동시에 필요한 옵션 추가</button><button type="button" class="ux-button" data-group-remove>조건 삭제</button></div>';
      groupsHost.append(group);
      return addGoalRow(group);
    }

    function read(lines, stage) {
      const allOptions = new Map(lines.flat().map(option => [option.key, option]));
      return goalGroups().map((group, index, groups) => {
        group.querySelector('legend').textContent = index ? `또는 조건 ${index + 1}` : '조건 1';
        group.querySelector('[data-group-remove]').hidden = groups.length === 1;
        const rows = goalRows(group);
        group.querySelector('[data-goal-add]').disabled = rows.length >= 3;
        return rows.map((row, rowIndex) => {
          const ids = [...row.querySelectorAll('[data-goal-input]')].map(input => input.id);
          const otherKeys = new Set(rows.filter(other => other !== row).map(other => other.querySelector('select').value));
          const available = new Map([...allOptions].filter(([key]) => !otherKeys.has(key)));
          row.querySelector('[data-goal-remove-slot]').hidden = rows.length === 1;
          row.querySelector('[data-goal-remove]').setAttribute('aria-label', `조건 ${index + 1}의 옵션 ${rowIndex + 1} 삭제`);
          const initial = defaultAttack && index === 0 && rowIndex === 0 ? stage * 2 : null;
          return goalInput(lines, initial, ids, available);
        });
      });
    }

    $('add-option-group').addEventListener('click', () => {
      const option = addGoalGroup();
      onChange();
      option.focus();
    });
    groupsHost.addEventListener('click', event => {
      const button = event.target.closest('[data-goal-add], [data-goal-remove], [data-group-remove]');
      if (!button) return;
      const group = button.closest('fieldset');
      let focus;
      if (button.hasAttribute('data-goal-add')) {
        focus = addGoalRow(group);
      } else if (button.hasAttribute('data-goal-remove')) {
        button.closest('.soul-goal-row').remove();
        focus = group.querySelector('[data-goal-add]');
      } else {
        group.remove();
        focus = $('add-option-group');
      }
      onChange();
      focus.focus();
    });
    editor.addEventListener('input', event => {
      if (event.target.matches('[data-goal-input="total"]')) limitInputToMaximum(event.target);
      onChange();
    });
    const first = addGoalGroup();
    if (defaultAttack) first.add(new Option('공격력 %', '공격력 %'));
    return { read };
  }

  function calculator() {
    const inputs = { amp: new Map(), rank: new Map() };
    const etherPrices = new Map();
    const etherPriceMax = Math.floor(Number.MAX_SAFE_INTEGER / (2 * core.amplification.reduce((sum, step) => sum + step.cap, 0)));
    let miracle = false;
    let savedRankStart = 1;
    const goalsEditor = createGoalEditor(render);
    const miracleSwitch = $('soul-miracle');
    const rankName = n => core.ranks[n];
    const budgetMeso = value => Number.isFinite(value) ? meso(value) : '달성 불가';

    select('amp-start', choices(range(0, 4), stageName), 0);
    select('amp-target', choices(range(0, 4), stageName), 4);
    select('rank-start', choices(range(1, 4), rankName), 1);
    select('rank-target', choices(range(1, 4), rankName), 4);
    select('option-current-stage', choices(range(1, 4), stageName), 4);
    select('option-current-rank', choices(range(1, 4), rankName), 4);

    function readAmpSteps(start, target) {
      const steps = core.amplification.slice(start, target);
      const fields = $('amp-prices');
      $('amp-price-panel').hidden = !steps.length;
      const key = start + '-' + target;
      if (fields.dataset.transitions !== key) {
        fields.replaceChildren(...steps.map((_, offset) => {
          const stage = start + offset + 1;
          const field = document.createElement('div');
          field.className = 'field soul-number-row';
          const input = document.createElement('input');
          input.id = 'amp-price-' + stage;
          input.type = 'number';
          input.inputMode = 'numeric';
          input.placeholder = '메소';
          input.min = 0;
          input.max = etherPriceMax;
          input.step = 1;
          input.value = etherPrices.get(stage) ?? '';
          input.dataset.etherPrice = stage;
          const label = document.createElement('label');
          label.htmlFor = input.id;
          label.append(tone(stageName(stage), 'stage', stage));
          const hint = document.createElement('small');
          hint.id = input.id + '-hint';
          hint.className = 'ux-hint';
          input.setAttribute('aria-describedby', 'amp-price-hint ' + hint.id);
          field.append(label, input, hint);
          return field;
        }));
        fields.dataset.transitions = key;
      }
      let invalid = false;
      const priced = steps.map((step, offset) => {
        const field = $('amp-price-' + (start + offset + 1));
        const value = field.valueAsNumber;
        const blank = field.value === '' && !field.validity.badInput;
        const valid = blank || (Number.isSafeInteger(value) && value >= 0 && value <= etherPriceMax);
        field.setAttribute('aria-invalid', String(!valid));
        text(field.id + '-hint', valid ? '' : '0 이상 ' + meso(etherPriceMax) + ' 이하로 입력하세요.');
        invalid ||= !valid;
        return { ...step, cost: step.cost + (valid && !blank ? value : 0) };
      });
      return { steps: priced, invalid };
    }

    function readProgressAttempts(mode, steps, start, name) {
      const fields = $(mode + '-attempts');
      const key = `${mode}-${start}-${steps.length}`;
      if (fields.dataset.transitions !== key) {
        fields.replaceChildren();
        steps.forEach((step, offset) => {
          const index = start + offset;
          const field = document.createElement('div');
          field.className = 'field soul-number-row';
          const input = document.createElement('input');
          input.id = mode + '-attempt-' + index;
          input.type = 'number';
          input.inputMode = 'numeric';
          input.placeholder = `최대 ${step.cap}회`;
          input.min = 1;
          input.step = 1;
          input.value = inputs[mode].get(index) ?? '';
          input.dataset.progressAttempt = index;
          const hint = document.createElement('small');
          hint.className = 'ux-hint';
          hint.id = `${input.id}-hint`;
          input.setAttribute('aria-describedby', mode + '-record-hint ' + hint.id);
          const label = document.createElement('label');
          label.htmlFor = input.id;
          const kind = mode === 'amp' ? 'stage' : 'rank';
          label.append(tone(name(index), kind, index), ' → ', tone(name(index + 1), kind, index + 1));
          field.append(label, input, hint);
          fields.append(field);
        });
        fields.dataset.transitions = key;
      }
      return steps.map((step, offset) => {
        const input = $(mode + '-attempt-' + (start + offset));
        return optionalAttempts(input, $(`${input.id}-hint`), step.cap, '');
      });
    }

    function renderProgress(mode, steps, start, target, name, invalidCost = false) {
      const kind = mode === 'amp' ? 'stage' : 'rank';
      $(mode + '-attempts').closest('fieldset').hidden = !steps.length;
      $(mode + '-rates').hidden = !steps.length || invalidCost;
      $(mode + '-metrics').hidden = !steps.length || invalidCost;
      $(mode + '-context').replaceChildren(tone(name(start), kind, start), ' → ', tone(name(target), kind, target),
        steps.length ? '' : ' · 생략');
      const counts = readProgressAttempts(mode, steps, start, name);
      const total = counts.reduce((sum, count) => sum + (count ?? 0), 0);
      const complete = counts.every(count => count !== null);
      const spent = counts.reduce((sum, count, index) => sum + (count ?? 0) * steps[index].cost, 0);
      const result = core.progressStats(steps, 0, complete ? total : 0, total && complete ? spent : undefined);
      const record = { attempts: BigInt(total), spent: BigInt(spent), hasData: Boolean(total) && !invalidCost,
        complete: complete && !invalidCost };
      const comparison = record.hasData && record.complete ? {
        cost: result.cost, attempts: result.expected, byCost: [result.withinMeso], byAttempts: [result.within]
      } : null;
      const note = comparison ? '' : '횟수를 모두 넣으면 상위 비율을 볼 수 있어요.';
      renderRecord(mode + '-record', record, comparison, note);
      renderRecord(mode + '-detail-record', record, comparison, note);
      metrics(mode + '-metrics', [
        ['평균 횟수', times(result.expected)],
        ['평균 메소', expectedMeso(result.cost)],
        ['최대 횟수', times(result.max)],
        ['최대 메소', meso(result.maxCost)]
      ]);
      if (mode === 'amp') {
        $('amp-materials').hidden = !steps.length;
        metrics('amp-ether-counts', result.details.map((step, index) => [
          stageName(start + index + 1), '평균 ' + number.format(step.expected) + '개'
        ]));
      }
      table(mode + '-table', result.details.map((step, i) => [
        name(start + i) + ' → ' + name(start + i + 1), pct(step.next),
        times(step.expected), times(step.max), meso(step.price)
      ]));
      return record;
    }

    function renderOption(rank, lines, goals, ready) {
      const price = core.resetCost[rank - 1];
      const context = message => text('option-context', message);
      const result = ready ? core.optionStats(lines, goals, 1) : null;
      $('option-budget-section').hidden = !ready;
      if (!ready) {
        text('option-chance', '—');
        context('목표 옵션을 설정하면 재설정 확률을 볼 수 있습니다.');
        metrics('option-metrics', []);
        metrics('option-budgets', []);
        table('option-table', []);
        return;
      }
      const matches = goalSummary(goals);
      text('option-chance', pct(result.chance));
      context(result.chance ? matches + ' · 목표 등급 유지 기준' : '이 등급에서는 입력한 옵션을 한 번에 뽑을 수 없습니다.');
      metrics('option-metrics', [
        ['기대 재설정 횟수', result.chance ? times(result.expected) : '불가능'],
        ['기대 메소', expectedMeso(result.expected * price)],
        ['재설정 1회 비용', meso(price)]
      ]);
      const costFor = count => Number.isFinite(count)
        ? `${spentMeso(count, price)} (${times(count)})` : '—';
      metrics('option-budgets', [
        ['50% 성공 예산', costFor(result.attempts50)],
        ['90% 성공 예산', costFor(result.attempts90)]
      ]);
      const targetKeys = new Set(goals.flat().map(goal => goal.key));
      const names = [...new Set(lines.flat().filter(option => targetKeys.has(option.key)).map(option => option.name))];
      table('option-table', names.map(name => [name, ...lines.map(line => pct(line.find(option => option.name === name)?.p ?? 0))]));
      return result;
    }

    function readOptionRecord(rank, phases) {
      const ready = Boolean(phases.length);
      $('option-record-fields').hidden = !ready;
      $('option-spent-field').hidden = true;
      const empty = { attempts: 0n, spent: 0n, hasData: false, complete: false };
      if (!ready) return empty;

      const input = $('option-attempts');
      const canFinishOnArrival = phases[0].arrivalChance > 0;
      input.min = canFinishOnArrival ? 0 : 1;
      text('option-record-hint', canFinishOnArrival
        ? '목표 등급에 오른 뒤 횟수예요. 바로 떴으면 0회.'
        : '목표 등급에서 옵션을 뽑기까지 몇 번 했나요?');
      const count = optionalAttempts(input, $('option-attempts-hint'), Number.MAX_SAFE_INTEGER, '');
      if (count === null) return empty;

      const spent = $('option-spent');
      const needsActualCost = rank < 4 && count > 0;
      $('option-spent-field').hidden = !needsActualCost;
      const hasSpent = needsActualCost && (spent.value !== '' || spent.validity.badInput);
      const valid = !hasSpent || (Number.isSafeInteger(spent.valueAsNumber) && spent.valueAsNumber >= 0);
      spent.setAttribute('aria-invalid', String(!valid));
      text('option-spent-hint', valid ? '비우면 목표 등급의 1회 비용을 적용해요.' : '0 이상의 메소를 입력하세요.');
      if (!valid) return empty;
      const cost = hasSpent ? BigInt(spent.valueAsNumber) : BigInt(count) * BigInt(core.resetCost[rank - 1]);
      return { attempts: BigInt(count), spent: cost, hasData: true, complete: true };
    }

    function comparePlan(record, steps, phases, pricing, summary) {
      if (!record.complete || !summary) return null;
      const byCost = [summary.withinCost(Number(record.spent))];
      if (pricing.increment) {
        const optimistic = core.budgetPricing(steps, phases, Math.floor);
        const sameSpend = PotentialPlan.calculate(optimistic.steps, optimistic.phases, { budgets: false })
          .withinCost(Number(record.spent));
        byCost.push(Math.max(byCost[0], sameSpend));
      }
      const expectedAttempts = summary.details.reduce((sum, step) => sum + step.attempts, summary.optionAttempts);
      return {
        cost: summary.expected,
        attempts: expectedAttempts,
        byCost,
        byAttempts: [PotentialPlan.withinAttempts(steps, phases, Number(record.attempts))]
      };
    }

    function renderCombinedRecord(records, steps, phases, pricing, summary) {
      const total = records.reduce((sum, record) => ({
        attempts: sum.attempts + (record.hasData ? record.attempts : 0n),
        spent: sum.spent + (record.hasData ? record.spent : 0n),
        hasData: sum.hasData || record.hasData,
        complete: sum.complete && record.complete
      }), { attempts: 0n, spent: 0n, hasData: false, complete: true });
      const comparison = total.hasData ? comparePlan(total, steps, phases, pricing, summary) : null;
      let note = '';
      if (!total.complete) note = '횟수를 모두 넣으면 전체 평균과 상위 비율을 볼 수 있어요.';
      else if (comparison && phases.length) note = '옵션을 포함한 상위 비율은 추정치예요.';
      renderRecord('total-record', total, comparison, note);
    }

    function render() {
      const ampEnabled = $('enable-amp').checked;
      const rankEnabled = $('enable-rank').checked;
      const optionEnabled = $('enable-option').checked;
      for (const [mode, enabled] of [['amp', ampEnabled], ['rank', rankEnabled], ['option', optionEnabled]]) {
        $(mode + '-settings').hidden = !enabled;
        $(mode + '-details').hidden = !enabled;
      }
      const startStage = get('amp-start');
      const minStage = Math.max(1, startStage);
      select('amp-target', choices(range(minStage, 4), stageName), Math.max(minStage, get('amp-target')));
      const stage = ampEnabled ? get('amp-target') : get('option-current-stage');
      const unlocksRare = ampEnabled && startStage === 0;
      const rankStart = $('rank-start');
      rankStart.disabled = unlocksRare;
      const startRank = unlocksRare ? 1 : savedRankStart;
      rankStart.value = startRank;
      select('rank-target', choices(range(startRank, 4), rankName), Math.max(startRank, get('rank-target')));
      const currentRank = $('option-current-rank');
      currentRank.disabled = unlocksRare;
      if (unlocksRare) {
        if (!currentRank.dataset.previousRank) currentRank.dataset.previousRank = currentRank.value;
        currentRank.value = 1;
      } else if (currentRank.dataset.previousRank) {
        currentRank.value = currentRank.dataset.previousRank;
        delete currentRank.dataset.previousRank;
      }
      const rank = rankEnabled ? get('rank-target') : get('option-current-rank');
      $('option-current-stage-field').hidden = ampEnabled;
      $('option-current-rank-field').hidden = rankEnabled;
      $('option-current-settings').hidden = ampEnabled && rankEnabled;
      toneSelect('option-current-stage', 'stage');
      toneSelect('option-current-rank', 'rank');
      miracleSwitch.hidden = !rankEnabled;
      for (const side of ['start', 'target']) {
        toneSelect('amp-' + side, 'stage');
        toneSelect('rank-' + side, 'rank');
      }
      text('rank-start-note', rankStart.disabled ? '첫 증폭에 성공하면 레어 잠재능력이 열립니다.' : '');
      miracleSwitch.setAttribute('aria-checked', String(miracle));
      miracleSwitch.querySelector('.switch-state').textContent = miracle ? '켜짐' : '꺼짐';
      const { steps: amp, invalid: invalidPrice } = readAmpSteps(startStage, ampEnabled ? stage : startStage);
      const grades = core.gradeSteps(rankEnabled && miracle);
      const upgrades = rankEnabled ? grades.slice(startRank - 1, rank - 1) : [];
      const ampRecord = renderProgress('amp', amp, startStage, stage, stageName, invalidPrice);
      const rankRecord = renderProgress('rank', upgrades, startRank, rank, rankName);
      let goals = [];
      let option;
      let ready = false;
      if (optionEnabled) {
        const lines = core.optionTables(rank, stage);
        goals = goalsEditor.read(lines, stage);
        ready = !goals.some(group => group.includes(null));
        option = renderOption(rank, lines, goals, ready);
      }
      let phases = [];
      if (ready) {
        const rolledOnArrival = Boolean(upgrades.length || (unlocksRare && rank === 1));
        phases = range(rank, 4).map((current, index) => {
          const stats = index === 0 ? option : core.optionStats(core.optionTables(current, stage), goals, 1);
          const arrivalChance = index || rolledOnArrival ? stats.chance : 0;
          const paidExpected = arrivalChance && arrivalChance < 1 ? (stats.expected - 1) / (1 - arrivalChance) : stats.expected;
          return { chance: stats.chance, arrivalChance, paidExpected, cost: core.resetCost[current - 1],
            upgrade: grades[current - 1] };
        });
      }
      const optionRecord = readOptionRecord(rank, phases);
      const optionPricing = optionRecord.hasData ? core.budgetPricing([], phases) : null;
      const optionPlan = optionPricing ? PotentialPlan.calculate(optionPricing.steps, optionPricing.phases, { budgets: false }) : null;
      const optionComparison = comparePlan(optionRecord, [], phases, optionPricing, optionPlan);
      const optionNote = optionComparison ? '상위 비율은 추정치예요.' : '';
      renderRecord('option-record', optionRecord, optionComparison, optionNote);
      renderRecord('option-detail-record', optionRecord, optionComparison, optionNote);

      const steps = [...amp, ...upgrades];
      const priced = core.budgetPricing(steps, phases);
      const selected = ampEnabled || rankEnabled || optionEnabled;
      const summary = !selected || invalidPrice || (optionEnabled && !ready) ? null : PotentialPlan.calculate(priced.steps, priced.phases);
      const records = optionEnabled ? [ampRecord, rankRecord, optionRecord] : [ampRecord, rankRecord];
      renderCombinedRecord(records, steps, phases, priced, summary);
      text('potential-cost', !summary ? '—' : Number.isFinite(summary.expected) ? expectedMeso(summary.expected) : '기댓값 없음');
      $('soul-hunt').setAttribute('meso', summary?.expected ?? '');
      text('potential-50', summary ? budgetMeso(summary.budget50) : '—');
      text('potential-90', summary ? budgetMeso(summary.budget90) : '—');
      const target = optionEnabled || (ampEnabled && rankEnabled) ? stageName(stage) + ' ' + rankName(rank)
        : rankEnabled ? rankName(rank) : stageName(stage) + ' 증폭';
      text('potential-context', !selected ? '계산할 강화를 선택하세요.' : invalidPrice ? '에테르 가격을 확인하세요.'
        : optionEnabled && !ready ? '목표 옵션과 합계를 입력하세요.'
        : target + (ready ? (rank < 4 ? ' 이상에서 ' : '에서 ') + '목표 옵션 달성까지' : '까지'));
      text('amp-budget-note', summary && priced.increment
        ? '예산은 1회 비용을 ' + meso(priced.increment) + ' 단위로 올려 계산합니다.' : '');
      metrics('option-route-metrics', summary && ready && Number.isFinite(summary.optionCost) ? [
        ['평균 재설정 비용', expectedMeso(summary.optionCost)],
        ['평균 재설정 횟수', times(summary.optionAttempts)]
      ] : []);
    }

    miracleSwitch.addEventListener('click', () => {
      miracle = !miracle;
      render();
    });
    document.querySelector('main').addEventListener('input', event => {
      const field = event.target;
      if (field.matches('[data-progress-attempt]')) {
        limitInputToMaximum(field);
        const mode = field.closest('#amp-attempts') ? 'amp' : 'rank';
        inputs[mode].set(Number(field.dataset.progressAttempt), field.value);
        render();
      } else if (field.matches('[data-ether-price]')) {
        etherPrices.set(Number(field.dataset.etherPrice), field.value);
        render();
      } else if (field.id === 'option-attempts' || field.id === 'option-spent') {
        render();
      } else if (field.matches('.potential-route select, .potential-section-head input, .soul-current-settings select')) {
        if (field.id === 'rank-start') savedRankStart = get('rank-start');
        render();
      }
    });
    render();
  }

  function simulator() {
    const limit = 100000;
    let config;
    let state;
    let timer = null;
    let remaining = 0;
    let inputIssue = '';
    let probabilityPlans;
    const fields = $('sim-fields');
    const auto = $('sim-auto');
    const stop = $('sim-stop');
    const reset = $('sim-reset');
    const status = $('sim-status');
    const goalsEditor = createGoalEditor(readConfig, true);
    const currentRanks = { 'sim-start-rank': 1, 'sim-option-rank': 4 };
    const rankChoices = choices(range(1, 4), n => core.ranks[n]);
    let outcome = 'ready';

    select('sim-start-stage', choices(range(0, 4), stageName), 0);
    select('sim-stage', choices(range(1, 4), stageName), 4);
    select('sim-rank', rankChoices, 4);
    select('sim-option-stage', choices(range(1, 4), stageName), 4);

    function overallPercentiles() {
      if (!probabilityPlans) {
        const { steps, phases, upperPhases } = core.simulationCostPlan(config);
        const lower = PotentialPlan.calculate(steps, phases, { budgets: false });
        const wider = phases.some((phase, index) => phase.chance !== upperPhases[index].chance);
        const upper = wider ? PotentialPlan.calculate(steps, upperPhases, { budgets: false }) : lower;
        const maxCost = phases.length ? Infinity : steps.reduce((sum, step) => sum + step.cap * step.cost, 0);
        probabilityPlans = { steps, phases, upperPhases, wider, lower, upper, maxCost };
      }
      const { steps, phases, upperPhases, wider, lower, upper, maxCost } = probabilityPlans;
      const cost = state.meso >= maxCost ? 1 : lower.withinCost(state.meso);
      const costUpper = wider ? upper.withinCost(state.meso) : cost;
      const attempts = phases.length ? PotentialPlan.withinAttempts(steps, phases, state.attempts)
        : core.progressStats(steps, 0, state.attempts).within;
      const attemptsUpper = wider ? PotentialPlan.withinAttempts(steps, upperPhases, state.attempts) : attempts;
      return { cost: percentile(cost, Math.max(cost, costUpper)), attempts: percentile(attempts, Math.max(attempts, attemptsUpper)) };
    }

    function resultIcon({ type, stage, rank }) {
      const icon = document.createElement('img');
      icon.className = 'soul-item-icon';
      icon.width = icon.height = 24;
      icon.alt = '';
      if (type === 'ether') {
        icon.src = `icons/craft/soul-ether-${stage}.webp`;
        icon.dataset.soulTone = `stage-${stage}`;
      } else {
        const rankIcons = { 2: '에픽잠재.webp', 3: '유니크.webp', 4: '이벤트 레전 잠재.webp' };
        icon.src = type === 'rank' ? `icons/coin-shop/${rankIcons[rank]}` : 'icons/cube/잠재.webp';
        if (type === 'rank') icon.dataset.soulTone = `rank-${rank}`;
      }
      return icon;
    }

    function countRow(icon, label, count, placement, pity = false) {
      const row = document.createElement('li');
      const value = document.createElement('div');
      value.className = 'soul-sim-count-value';
      const quantity = document.createElement('strong');
      quantity.textContent = count;
      value.append(quantity);
      if (pity) {
        const mark = document.createElement('small');
        mark.className = 'soul-sim-pity';
        mark.textContent = '천장';
        value.append(mark);
      }
      if (placement) {
        const rank = document.createElement('small');
        rank.className = 'actual-metric-percentile';
        rank.textContent = placement;
        value.append(rank);
      }
      row.append(resultIcon(icon), label, value);
      return row;
    }

    function renderCounts(id, emptyId, rows) {
      const list = $(id);
      list.replaceChildren(...rows);
      list.hidden = !rows.length;
      $(emptyId).hidden = Boolean(rows.length);
    }

    function renderBreakdown(complete) {
      renderCounts('sim-ether', 'sim-ether-empty', state.ether.flatMap((count, index) => {
        if (!count) return [];
        const stage = index + 1;
        const step = core.amplification[index];
        const reached = state.stage >= stage;
        const placement = reached ? percentile(core.progressStats([step], 0, count).within) : '';
        return [countRow({ type: 'ether', stage }, tone(stageName(stage), 'stage', stage), `${number.format(count)}개`, placement,
          reached && count === step.cap)];
      }));

      $('sim-grade-usage').hidden = !config.selection.rank;
      const grades = core.gradeSteps(config.miracle);
      renderCounts('sim-grade-attempts', 'sim-grade-empty', state.gradeAttempts.flatMap((count, index) => {
        if (!count) return [];
        const rank = index + 2;
        const step = grades[index];
        const reached = state.rank >= rank;
        const placement = reached ? percentile(core.progressStats([step], 0, count).within) : '';
        return [countRow({ type: 'rank', rank }, tone(core.ranks[rank], 'rank', rank), times(count), placement, reached && count === step.cap)];
      }));

      $('sim-option-usage').hidden = !config.selection.option;
      if (config.selection.option) {
        let placement = '';
        if (complete && probabilityPlans?.phases.length) {
          const { phases, upperPhases, wider } = probabilityPlans;
          const lower = PotentialPlan.withinAttempts([], phases, state.optionAttempts);
          const upper = wider ? PotentialPlan.withinAttempts([], upperPhases, state.optionAttempts) : lower;
          placement = percentile(lower, Math.max(lower, upper));
        }
        $('sim-option-attempts').replaceChildren(countRow({ type: 'option' }, '옵션 재설정', times(state.optionAttempts), placement));
      }
    }

    function render() {
      const phase = core.simulationPhase(state, config);
      const running = timer !== null;
      const complete = phase === 'done';
      const unavailable = phase === 'unavailable';
      const { amp, rank, option } = config.selection;
      const selected = amp || rank || option;
      const showRank = rank || option;
      const finished = selected && !inputIssue && (complete || unavailable);
      const started = state.attempts > 0;
      fields.disabled = running;
      auto.hidden = running || finished;
      auto.disabled = !selected || Boolean(inputIssue);
      stop.hidden = !running;
      reset.hidden = running || !started;
      reset.classList.toggle('primary', finished);
      reset.classList.toggle('ux-button', !finished);
      text('sim-auto', started ? '이어서 자동 진행' : '목표까지 자동 진행');
      const parts = [];
      if (amp || option) parts.push(tone(stageName(state.stage), 'stage', state.stage));
      if (showRank) parts.push(tone(core.ranks[state.rank], 'rank', state.rank));
      const current = parts.length ? parts.map(part => part.textContent).join(' · ') : '—';
      if ($('sim-state').textContent !== current) {
        $('sim-state').replaceChildren(...(parts.length === 2 ? [parts[0], ' · ', parts[1]] : parts.length ? parts : ['—']));
      }
      const goalParts = [];
      if (amp) goalParts.push(stageName(config.targetStage));
      if (rank) goalParts.push(core.ranks[config.targetRank]);
      if (config.goal) goalParts.push(goalSummary(config.goal));
      if (config.miracle) goalParts.push('미라클 타임');
      text('sim-target', goalParts.length ? `목표 ${goalParts.join(' · ')}` : '');

      const upgrade = phase === 'amp' ? core.amplification[state.stage] : core.gradeSteps(config.miracle)[state.rank - 1];
      const failures = phase === 'amp' ? state.ampFailures : state.rankFailures;
      const showsCounter = upgrade && !complete && !unavailable;
      const hint = phase === 'amp'
        ? `다음 ${state.stage + 1}단계 증폭 성공 확률 ${pct(core.nextChance(upgrade, failures))}. ${meso(upgrade.cost)}와 에테르 1개 소모.`
        : showsCounter ? `다음 재설정의 등급 상승 확률 ${pct(core.nextChance(upgrade, failures))}. ${meso(upgrade.cost)} 소모.`
        : phase === 'option' ? `다음 재설정 비용 ${meso(core.resetCost[state.rank - 1])}.` : '';
      text('sim-next', hint);
      $('sim-next').hidden = !hint;
      $('sim-gauge').hidden = !showsCounter;
      if (showsCounter) {
        const counter = $('sim-counter');
        counter.max = upgrade.cap - 1;
        counter.value = failures;
        const count = `${number.format(failures)} / ${times(upgrade.cap - 1)}`;
        const title = phase === 'amp' ? '증폭 게이지' : '등급 상승 보장까지 진행';
        text('sim-counter-label', `${title} ${count}${failures === upgrade.cap - 1 ? ' (다음 시도 천장)' : ''}`);
      }

      $('sim-options').hidden = !option || !state.options;
      if (option && state.options) {
        $('sim-options').replaceChildren(...state.options.map(option => {
          const line = document.createElement('li');
          line.textContent = option.name;
          return line;
        }));
      }
      const [message, statusTone] = !selected ? ['진행할 강화를 선택하세요.', 'info']
        : inputIssue ? [inputIssue, 'warning']
        : unavailable ? ['목표 미달성. 등급이 올라 선택한 옵션 조건을 더 이상 달성할 수 없습니다.', 'warning']
        : complete ? (started ? ['완료. 설정한 목표에 도달했습니다.', 'success']
          : ['이미 목표 상태입니다. 시작 조건이나 목표를 바꿔 보세요.', 'info'])
        : running ? ['진행 중. 목표에 도달하면 자동으로 멈춥니다.', 'info']
        : outcome === 'limit' ? ['일시 정지. 이번 자동 진행에서 100,000회를 시도했습니다. 이어서 진행할 수 있습니다.', 'warning']
        : outcome === 'paused' ? ['일시 정지. 이어서 진행할 수 있습니다.', 'info']
        : ['준비. 목표까지 자동 진행하세요.', 'info'];
      text(status.id, message);
      status.dataset.tone = statusTone;

      text('sim-spend', meso(state.meso));
      $('sim-hunt').setAttribute('meso', state.meso);
      const placements = started && complete ? overallPercentiles() : null;
      text('sim-spend-rank', placements?.cost ?? '');
      text('sim-attempts', times(state.attempts));
      text('sim-attempts-rank', placements?.attempts ?? '');
      renderBreakdown(complete);
    }

    function readConfig() {
      if (timer !== null) return;
      const amp = $('sim-want-amp').checked;
      const rank = $('sim-want-rank').checked;
      const option = $('sim-want-option').checked;
      $('sim-amp-settings').hidden = !amp;
      $('sim-rank-settings').hidden = !rank;
      $('sim-goal-fields').hidden = !option;
      $('sim-option-stage-field').hidden = amp;
      $('sim-option-rank-field').hidden = rank;

      const ampStart = get('sim-start-stage');
      const minStage = Math.max(1, ampStart);
      select('sim-stage', choices(range(minStage, 4), stageName), Math.max(minStage, get('sim-stage')));
      const startStage = amp ? ampStart : option ? get('sim-option-stage') : 1;
      const targetStage = amp ? get('sim-stage') : startStage;
      const unlocksRare = startStage === 0;
      for (const [id, value] of Object.entries(currentRanks)) {
        select(id, rankChoices, unlocksRare ? 1 : value);
        $(id).disabled = unlocksRare;
      }
      const firstRank = get(rank ? 'sim-start-rank' : 'sim-option-rank');
      const startRank = unlocksRare ? 0 : firstRank;
      const rankStart = get('sim-start-rank');
      select('sim-rank', rankChoices.slice(rankStart - 1), Math.max(rankStart, get('sim-rank')));
      const targetRank = rank ? get('sim-rank') : option ? firstRank : 0;
      for (const id of ['sim-start-stage', 'sim-stage', 'sim-option-stage']) toneSelect(id, 'stage');
      for (const id of ['sim-start-rank', 'sim-rank', 'sim-option-rank']) toneSelect(id, 'rank');
      const canUpgrade = rank && firstRank < core.ranks.length - 1 && (targetRank > firstRank || option);
      $('sim-miracle-field').hidden = !canUpgrade;
      const groups = option ? goalsEditor.read(core.optionTables(targetRank, targetStage), targetStage) : [];
      const goal = option && groups.every(group => group.every(Boolean)) ? groups : null;
      const lastEligibleRank = goal ? range(targetRank, 4).findLast(rank =>
        core.optionStats(core.optionTables(rank, targetStage), goal, 1).chance > 0) : 0;
      inputIssue = option && !goal ? '목표 옵션과 합계를 입력하세요.'
        : goal && !lastEligibleRank ? '이 조합을 뽑을 수 없습니다. 옵션이나 합계를 바꿔 보세요.' : '';
      config = { startStage, targetStage, startRank, targetRank, ampFailures: 0, rankFailures: 0,
        goal, lastEligibleRank, miracle: canUpgrade && $('sim-miracle').checked, selection: { amp, rank, option } };
      state = core.startSimulation(config);
      probabilityPlans = undefined;
      outcome = 'ready';
      render();
    }

    function batch() {
      const batchSize = Math.min(remaining, 200);
      let attempts = 0;
      while (attempts < batchSize && !['done', 'unavailable'].includes(core.simulationPhase(state, config))) {
        core.simulateAttempt(state, config);
        attempts++;
      }
      remaining -= attempts;
      const finished = !remaining || ['done', 'unavailable'].includes(core.simulationPhase(state, config));
      timer = finished ? null : setTimeout(batch, 40);
      if (!remaining) outcome = 'limit';
      render();
      if (finished && (document.activeElement === stop || document.activeElement === document.body)) {
        (auto.hidden ? reset : auto).focus({ preventScroll: true });
      }
    }

    fields.addEventListener('input', event => {
      if (event.target.matches('[data-goal-input]')) return;
      if (Object.hasOwn(currentRanks, event.target.id)) currentRanks[event.target.id] = get(event.target.id);
      readConfig();
    });
    function startAuto() {
      remaining = limit;
      outcome = 'ready';
      timer = setTimeout(batch, 0);
      render();
      stop.focus({ preventScroll: true });
    }
    auto.addEventListener('click', startAuto);
    stop.addEventListener('click', () => {
      clearTimeout(timer);
      timer = null;
      outcome = 'paused';
      render();
      auto.focus({ preventScroll: true });
    });
    reset.addEventListener('click', () => {
      state = core.startSimulation(config);
      startAuto();
    });
    readConfig();
  }

  if ($('amp-route')) calculator();
  else simulator();
})();
