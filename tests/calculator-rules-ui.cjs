// Uses the installed Edge browser.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const open = name => page.goto(pathToFileURL(path.resolve(__dirname, '..', name + '.html')).href);

    for (const name of ['cube_calc', 'cube_play']) {
      await open(name);
      const caps = await page.evaluate(() => ({ white: CUBES.addWhite.cap, reset: CUBES.addReset.cap }));
      assert.deepEqual(caps.white, [31,76,214]);
      assert.deepEqual(caps.reset, [62,152,214]);
    }
    // Force every natural roll to fail; the 31st/76th roll must still upgrade.
    const forced = await page.evaluate(() => {
      const results = [], originalRandom = Math.random;
      Math.random = () => .999999;
      try {
        for (const [rank, cap] of [[0,31],[1,76]]) {
          resetSession();
          Object.assign(state, { cube:'addWhite', tab:'additional', from:rank, startRank:rank, to:3, miracle:false });
          for (let i = 0; i < cap - 1; i++) roll();
          results.push(state.from === rank && state.pity === cap - 1);
          roll();
          results.push(state.from === rank + 1 && state.pendingChoice.pityUsed === cap);
        }
      } finally { Math.random = originalRandom; }
      return results;
    });
    assert.ok(forced.every(Boolean));

    const spendingRanks = await page.evaluate(() => {
      const originalRandom = Math.random;
      try {
        resetSession();
        Object.assign(state, { cube:'potentialMeso', from:0, startRank:0, to:3, level:200, miracle:false });
        const rolls = [.99, 0, 0, 0];
        Math.random = () => rolls.shift();
        for (let i = 0; i < 4; i++) { state.pendingChoice = null; roll(); }
        const [first, second, third] = CUBES.potentialMeso.p;
        // The extra attempt is cheap enough only in the first grade at level 200.
        const expected = first * second * third * (1 + 1 - first);
        const fixed = state.runLog[0].pct;
        resetSession();
        Object.assign(state, { from:2, startRank:2, miracle:false });
        Math.random = () => .99;
        roll();
        state.miracle = true;
        Math.random = () => 0;
        roll();
        return { fixed, expected, mixed: state.runLog[0].pct };
      } finally { Math.random = originalRandom; }
    });
    assert.ok(Math.abs(spendingRanks.fixed - spendingRanks.expected) < 1e-9);
    assert.equal(spendingRanks.mixed, null);

    for (const name of ['starforce_calc', 'starforce_play', 'item_craft_calc']) {
      await open(name);
      const craft = name === 'item_craft_calc';
      const level = craft ? '#level' : '#levelInput';
      const start = craft ? '#starStart' : '#startInput';
      const goal = craft ? '#starGoal' : '#goalInput';
      if (craft) await page.locator('#starPanel .ux-stage-toggle').click();
      await page.locator(start).fill('0');
      for (const [lv, max] of [[94,5],[95,8],[108,10],[118,15],[128,20],[138,30]]) {
        await page.locator(level).fill(String(lv));
        await page.locator(goal).fill('30');
        assert.equal(await page.locator(goal).inputValue(), String(max), `${name}, level ${lv}`);
        assert.equal(await page.locator(goal).getAttribute('max'), String(max));
        if (!craft && name === 'starforce_calc') assert.equal(await page.locator('#rateTable tbody tr').count(), max);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name);
    }
    // Restore a 130-level item saved with an invalid 30-star goal.
    await page.evaluate(() => localStorage.setItem('itemCraftCalc', JSON.stringify({
      part:'모자', level:130, base:1000000000, star:{start:12,goal:30},
      on:{flame:true,star:true,pot:false,addi:false}, flameConds:[{kind:'opt',id:'STR',minTier:6}]
    })));
    await page.reload();
    await page.locator('#starPanel .ux-stage-toggle').click();
    assert.equal(await page.locator('#starGoal').inputValue(), '20');
    assert.match(await page.locator('#safeguardNote').innerText(), /추가옵션은 흔적에 보존/);
    assert.doesNotMatch(await page.locator('#safeguardNote').innerText(), /노작 \+ 추가옵션/);

    const craftState = {part:'모자',level:200,base:0,on:{flame:false,star:true,pot:false,addi:false},
      star:{start:18,goal:25,discount30:false,destroyDown30:false,lucky5:false}};
    await page.evaluate(saved => localStorage.setItem('itemCraftCalc', JSON.stringify(saved)), craftState);
    await page.reload();
    await page.locator('#starPanel .ux-stage-toggle').click();
    assert.match(await page.locator('#recoveryNote').innerText(), /21성 복구/);
    const before = await page.evaluate(() => {
      const opts = {level:200,start:18,goal:25,spare:0,recoveryMode:'auto',safeguard:{}};
      opts.safeguard = StarforceData.bestSafeguard(opts, o => StarforceCalc.calculate(o).total.meso);
      return {expected:StarforceCalc.calculate(opts).total.meso, actual:Number(document.querySelector('#resAvg').dataset.expectedUsage)};
    });
    assert.equal(before.actual, before.expected);
    await page.locator('[data-sf="recoveryDiscount20"]').click();
    const discounted = await page.evaluate(() => {
      const opts = {level:200,start:18,goal:25,spare:0,recoveryMode:'auto',recoveryDiscount20:true,safeguard:{}};
      opts.safeguard = StarforceData.bestSafeguard(opts, o => StarforceCalc.calculate(o).total.meso);
      return {expected:StarforceCalc.calculate(opts).total.meso, actual:Number(document.querySelector('#resAvg').dataset.expectedUsage)};
    });
    assert.equal(discounted.actual, discounted.expected);
    assert.ok(discounted.actual < before.actual);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(saved => localStorage.setItem('itemCraftCalc', JSON.stringify(saved)), {...craftState,base:1e11});
    await page.reload();
    await page.locator('#starPanel .ux-stage-toggle').click();
    assert.match(await page.locator('#recoveryNote').innerText(), /12성 복구/);

    await open('index');
    assert.equal(await page.locator('.tool-card[href="cube_calc.html"]').count(), 1);
    assert.equal(await page.locator('.tool-card[href="cube_option_calc.html"]').count(), 0);
    await open('cube_option_calc');
    await page.waitForURL('**/cube_calc.html#target-options');
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      await open('cube_calc');
      await verifyMiraclePlacement(page, '#miracleCheckbox');
      await page.locator('#resetGoals').click();
      await page.locator('#cube-rank-start').selectOption('0');
      const method = page.locator('[data-grade-method="potentialMeso"]');
      await method.press('Enter');
      assert.equal(await method.getAttribute('aria-pressed'), 'true');
      await page.locator('#cube-rank-target').selectOption('3');
      const gradeOnly = await page.locator('#potential-cost').innerText();
      assert.match(gradeOnly, /메소/);
      await page.locator('#primaryPicks [data-add="공격력|%"]').click();
      assert.deepEqual(await page.locator('.opt-presets small').allTextContents(), ['1줄', '2줄', '3줄']);
      const twoLines = page.locator('.opt-presets button').nth(1);
      await twoLines.press('Space');
      assert.equal(await twoLines.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.opt-val').inputValue(), await twoLines.getAttribute('data-val'));
      await page.locator('.opt-val').fill('21');
      const withOption = await page.locator('#potential-cost').innerText();
      assert.notEqual(withOption, gradeOnly);
      await page.reload();
      assert.equal(await page.locator('#potential-cost').innerText(), withOption);
      assert.equal(await page.locator('.potential-result > details[open]').count(), 0);
      assert.match(await page.locator('#cube-summary-option-count').innerText(), /회$/);
      await page.locator('#target-options #actualCount').fill('20');
      await page.waitForFunction(() => document.getElementById('actualPercentile').textContent.includes('상위'));
      await page.locator('.cube-grade-record #recordCount0').fill('999');
      assert.equal(await page.locator('#recordCount0').inputValue(), '10');
      await page.locator('#cube-grade-details > summary').press('Enter');
      await page.locator('#cube-progress-failures').fill('999');
      assert.equal(await page.locator('#cube-progress-failures').inputValue(), '9');
      await page.locator('#cube-rank-start').selectOption('3');
      assert.equal(await page.locator('#cube-rank-target').inputValue(), '3');
      await page.locator('#resetGoals').click();
      assert.equal(await page.locator('#potential-cost').innerText(), '0 메소');
      await verifyPotentialLayout(page, 1);
      if (width === 1280) await verifyPotentialZoom(page);

      await open('soul_calc');
      assert.equal(await page.locator('#potential-context').innerText(), '계산할 강화를 선택하세요.');
      assert.equal(await page.locator('#amp-start').isVisible(), false);
      assert.equal(await page.locator('#rank-start').isVisible(), false);
      await page.locator('#enable-option').check();
      assert.ok(await page.locator('#option-current-stage').isVisible());
      assert.ok(await page.locator('#option-current-rank').isVisible());
      await page.locator('#enable-option').uncheck();
      await page.locator('#enable-amp').check();
      await page.locator('#enable-rank').check();
      await verifyMiraclePlacement(page, '#soul-miracle');
      assert.equal(await page.locator('#rank-start').inputValue(), '1');
      assert.ok(await page.locator('#rank-start').isDisabled());
      const withoutOption = await page.locator('#potential-cost').innerText();
      const baselineBudget = await page.locator('#potential-50').innerText();
      assert.equal(await page.locator('#amp-details').evaluate(details => details.open), false);
      await page.locator('#amp-attempt-0').fill('1');
      assert.match(await page.locator('#amp-record').innerText(), /5억 메소/);
      assert.match(await page.locator('#total-record').innerText(), /5억 메소/);
      assert.equal(await page.locator('#total-record .actual-metric-percentile').count(), 0);
      assert.equal(await page.locator('#amp-ether-counts').isVisible(), false);
      await page.locator('#amp-price-panel > summary').press('Enter');
      const price = page.locator('#amp-price-1');
      await price.fill('50000003');
      assert.match(await page.locator('#amp-record').innerText(), /5억 5000만 3 메소/);
      assert.notEqual(await page.locator('#potential-cost').innerText(), withoutOption);
      assert.notEqual(await page.locator('#potential-50').innerText(), baselineBudget);
      await price.fill('-1');
      assert.equal(await price.getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#potential-cost').innerText(), '—');
      assert.equal(await page.locator('#amp-record').isVisible(), false);
      await price.fill('');
      assert.equal(await page.locator('#potential-cost').innerText(), withoutOption);
      assert.match(await page.locator('#amp-record').innerText(), /5억 메소/);
      await page.locator('#amp-price-panel > summary').press('Enter');
      await page.locator('#amp-details > summary').press('Enter');
      assert.match(await page.locator('#amp-ether-counts').innerText(), /평균/);
      await page.locator('#amp-details > summary').press('Enter');
      await page.locator('#enable-option').check();
      await page.locator('#goal-type').selectOption('공격력 %');
      assert.equal(await page.locator('#potential-cost').innerText(), '—');
      await page.locator('[data-goal-sum="14"]').press('Enter');
      assert.notEqual(await page.locator('#potential-cost').innerText(), withoutOption);
      assert.equal(await page.locator('#goal-total').inputValue(), '14');
      assert.equal(await page.locator('.potential-result > details[open]').count(), 0);
      assert.ok(await page.locator('#option-attempts').isVisible());
      await page.locator('#option-attempts').fill('100');
      assert.match(await page.locator('#option-record').innerText(), /88억/);
      await page.locator('#option-details > summary').press('Enter');
      assert.equal(await page.locator('#option-detail-record .actual-metric-percentile').count(), 2);
      await page.locator('#amp-start').selectOption('4');
      await page.locator('#rank-start').selectOption('4');
      assert.equal(await page.locator('#amp-target').inputValue(), '4');
      assert.equal(await page.locator('#rank-target').inputValue(), '4');
      const fixed = await page.evaluate(() => {
        const goal = {key:'공격력 %', lines:1, total:14};
        const stats = SoulCore.optionStats(SoulCore.optionTables(4, 4), goal, 1);
        return [stats.attempts50, stats.attempts90].map(attempts => MoneyInput.koreanAmount(attempts * 88_000_000));
      });
      assert.deepEqual(await page.locator('#potential-50, #potential-90').allTextContents(), fixed);
      await verifyPotentialLayout(page, 2);
      if (width === 1280) await verifyPotentialZoom(page);
      await page.locator('#amp-start').selectOption('0');
      await page.locator('#amp-target').selectOption('1');
      await page.locator('#rank-target').selectOption('2');
      await page.locator('#rank-attempt-1').fill('1');
      assert.match(await page.locator('#rank-record').innerText(), /2000만 메소/);
      await page.locator('#goal-total').fill('1');
      await page.locator('#option-attempts').fill('0');
      assert.equal(await page.locator('#option-attempts').getAttribute('aria-invalid'), 'false');
      const record = page.locator('#total-record');
      assert.deepEqual(await record.locator('dd > strong').allTextContents(), ['5억 2000만 메소', '2회']);
      assert.equal(await record.locator('.actual-metric-percentile').count(), 2);
      assert.equal(await record.locator('.actual-metric-change').count(), 2);
      await page.locator('#option-attempts').fill('2');
      await page.locator('#option-spent').fill('120000000');
      assert.deepEqual(await record.locator('dd > strong').allTextContents(), ['6억 4000만 메소', '4회']);
      await page.locator('#enable-amp').uncheck();
      await page.locator('#enable-rank').uncheck();
      assert.equal(await page.locator('#amp-record').isVisible(), false);
      assert.equal(await page.locator('#rank-record').isVisible(), false);
      assert.deepEqual(await record.locator('dd > strong').allTextContents(), ['1억 7600만 메소', '2회']);

      await open('soul_play');
      assert.deepEqual(await page.locator('#sim-totals dt, #sim-hunt .required-hunt-label').allTextContents(), ['가상 지출', '전체 시도', '필요 재획']);
      const huntCount = page.locator('#sim-hunt .required-hunt-count');
      const huntTime = page.locator('#sim-hunt .required-hunt-time');
      assert.equal(await huntCount.innerText(), '0재획');
      assert.equal(await huntTime.innerText(), '0분');
      assert.equal(await page.locator('#sim-resets').count(), 0);
      await page.waitForFunction(() => document.querySelector('#sim-hunt img').naturalWidth > 0);
      assert.deepEqual(await page.locator('#sim-fields h2').allTextContents(), ['증폭', '잠재능력 등급', '목표 옵션']);
      assert.equal(await page.locator('#sim-amp-settings, #sim-rank-settings, #sim-goal-fields').filter({ visible: true }).count(), 0);
      assert.ok(await page.locator('#sim-auto').isDisabled());
      assert.equal(await page.locator('#sim-amp-fail, #sim-rank-fail').count(), 0);
      await page.locator('#sim-want-amp').check();
      await page.locator('#sim-want-rank').check();
      await verifyMiraclePlacement(page, '#sim-miracle-field');
      await page.locator('#sim-want-rank').uncheck();
      await page.locator('#sim-stage').selectOption('1');
      assert.equal(await page.locator('#sim-spend-rank').innerText(), '');
      assert.equal(await page.locator('#sim-miracle-field').isVisible(), false);
      await page.evaluate(() => { Math.random = () => 0; });
      await page.locator('#sim-auto').press('Enter');
      await page.waitForFunction(() => document.getElementById('sim-spend-rank').textContent === '상위 5%');
      assert.equal(await page.locator('#sim-spend').innerText(), '5억 메소');
      assert.equal(await huntCount.innerText(), '5재획');
      assert.equal(await huntTime.innerText(), '2시간 30분');
      assert.equal(await page.locator('#sim-attempts-rank').innerText(), '상위 5%');
      assert.equal(await page.locator('#sim-ether .actual-metric-percentile').innerText(), '상위 5%');
      assert.equal(await page.locator('#sim-ether .soul-sim-pity').count(), 0);
      await page.evaluate(() => { Math.random = () => .99; });
      await page.locator('#sim-reset').press('Enter');
      await page.waitForFunction(() => document.getElementById('sim-spend-rank').textContent === '상위 100%');
      assert.equal(await page.locator('#sim-spend').innerText(), '130억 메소');
      assert.equal(await huntCount.innerText(), '105재획');
      assert.equal(await huntTime.innerText(), '2일 4시간 30분');
      assert.equal(await page.locator('#sim-attempts').innerText(), '26회');
      assert.equal(await page.locator('#sim-ether strong').innerText(), '26개');
      assert.equal(await page.locator('#sim-attempts-rank').innerText(), '상위 100%');
      assert.equal(await page.locator('#sim-ether .actual-metric-percentile').innerText(), '상위 100%');
      assert.equal(await page.locator('#sim-ether .soul-sim-pity').innerText(), '천장');
      assert.equal(await page.locator('dialog.ux-confirm').count(), 0);
      assert.equal(await page.locator('#sim-auto').isVisible(), false);
      assert.ok(await page.locator('#sim-reset.primary').isVisible());
      assert.ok(await page.locator('#sim-stage').isEnabled());
      assert.equal(await page.locator('#sim-step, #sim-edit').count(), 0);
      await page.locator('#sim-stage').selectOption('2');
      assert.equal(await page.locator('#sim-spend').innerText(), '0 메소');
      assert.equal(await page.locator('#sim-spend-rank').innerText(), '');
      assert.equal(await page.locator('#sim-attempts-rank').innerText(), '');
      assert.ok(await page.locator('#sim-auto').isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
      if (width === 1280) {
        await verifyPotentialZoom(page);
        await open('soul_play');
        await verifySimulationMiracle(page);
        await open('soul_play');
        await verifySimulationPause(page);
        await open('soul_play');
        await verifySimulationEtherIcons(page);
      }
      await open('soul_play');
      await verifySimulationGoalEditor(page);
    }
    await open('flame_calc');
    assert.deepEqual(errors, []);
    console.log('Calculator rules, integrated cube and soul calculators, keyboard details and responsive layouts passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

async function verifyPotentialLayout(page, routes) {
  const arrows = page.locator('.potential-route-arrow');
  assert.equal(await arrows.count(), routes);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  for (const arrow of await arrows.all()) {
    assert.equal(await arrow.innerText(), '→');
    assert.ok(await arrow.evaluate(el => {
      const fields = [...el.parentElement.querySelectorAll('select')];
      const [from, to] = fields.map(field => field.getBoundingClientRect());
      const middle = el.getBoundingClientRect();
      const context = document.createElement('canvas').getContext('2d');
      const labelsFit = fields.every(field => {
        const css = getComputedStyle(field);
        context.font = css.font;
        return context.measureText(field.selectedOptions[0].text).width <=
          field.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      });
      return from.right <= middle.left && middle.right <= to.left && from.top === to.top &&
        from.height >= 44 && to.height >= 44 && labelsFit;
    }));
  }
}

async function verifyPotentialZoom(page) {
  assert.ok(await page.evaluate(() => {
    const root = document.documentElement;
    root.style.zoom = '200%';
    const fits = root.scrollWidth <= root.clientWidth + 1;
    root.style.zoom = '';
    return fits;
  }));
}

async function verifyMiraclePlacement(page, selector) {
  assert.ok(await page.locator(selector).isVisible());
  assert.ok(await page.locator(selector).evaluate(button => {
    const title = button.closest('.potential-section-head').querySelector('h2').getBoundingClientRect();
    const toggle = button.getBoundingClientRect();
    return title.right <= toggle.left && Math.abs((title.top + title.bottom) - (toggle.top + toggle.bottom)) < 4;
  }), selector + ' stays next to the title');
}

async function verifySimulationGoalEditor(page) {
  await page.locator('#sim-want-option').check();
  assert.ok(await page.locator('#sim-option-stage').isVisible());
  assert.ok(await page.locator('#sim-option-rank').isVisible());
  await page.locator('#sim-option-stage').selectOption('4');
  await page.locator('#sim-option-rank').selectOption('4');
  const editor = page.locator('#option-editor');
  const groups = editor.locator('.soul-goal-group');
  const first = groups.nth(0);
  const auto = page.locator('#sim-auto');
  assert.deepEqual(await first.locator('.soul-goal-preset strong').allTextContents(), ['8%', '14%', '20%']);
  await first.locator('[data-goal-input="total"]').fill('100');
  assert.equal(await first.locator('[data-goal-input="total"]').inputValue(), '24');
  await first.locator('[data-goal-add]').press('Enter');
  assert.ok(await auto.isDisabled());
  await first.locator('[data-goal-input="type"]').nth(1).selectOption('마력 %');
  await first.locator('.soul-goal-row').nth(1).locator('[data-goal-sum="8"]').press('Enter');
  assert.match(await page.locator('#sim-status').innerText(), /이 조합을 뽑을 수 없습니다/);
  await editor.locator('#add-option-group').press('Enter');
  const alternative = groups.nth(1);
  await alternative.locator('[data-goal-input="type"]').selectOption('공격력 %');
  await alternative.locator('[data-goal-sum="8"]').press('Enter');
  assert.ok(await auto.isEnabled());
  assert.match(await page.locator('#sim-target').innerText(), /조건 2개 중 하나 이상 충족/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));

  await page.evaluate(() => {
    let before = 0;
    const attack = SoulCore.optionTables(4, 4)[0].find(option => {
      if (option.key === '공격력 %') return true;
      before += option.p;
      return false;
    });
    let roll = 0;
    Math.random = () => roll++ % 3 === 0 ? before + attack.p / 2 : 0;
  });
  await auto.press('Enter');
  await page.waitForFunction(() => document.getElementById('sim-status').dataset.tone === 'success');
  assert.equal(await page.locator('#sim-attempts').innerText(), '1회');
  assert.equal(await page.locator('#sim-spend').innerText(), '8800만 메소');
  assert.equal(await page.locator('#sim-hunt .required-hunt-count').innerText(), '1재획');
  assert.equal(await page.locator('#sim-hunt .required-hunt-time').innerText(), '30분');
  assert.match(await page.locator('#sim-spend-rank').innerText(), /상위/);
  assert.equal(await page.locator('#sim-option-attempts strong').innerText(), '1회');
  assert.equal(await page.locator('#sim-option-attempts .actual-metric-percentile').innerText(),
    await page.locator('#sim-attempts-rank').innerText());
  await page.locator('#sim-reset').press('Enter');
  await page.waitForFunction(() => document.getElementById('sim-status').dataset.tone === 'success');
  assert.equal(await page.locator('#sim-attempts').innerText(), '1회');
  assert.equal(await groups.count(), 2);
  assert.equal(await alternative.locator('[data-goal-input="total"]').inputValue(), '8');

  assert.ok(await page.locator('#sim-option-attempts li').evaluate(row => {
    row.querySelector('strong').textContent = '5,155회';
    row.querySelector('.actual-metric-percentile').textContent = '상위 43.6% ~ 43.61%';
    const label = document.createRange();
    label.selectNodeContents([...row.childNodes].find(node => node.nodeType === Node.TEXT_NODE));
    const lines = label.getClientRects();
    const values = row.querySelector('.soul-sim-count-value').getBoundingClientRect();
    return lines.length === 1 && lines[0].right <= values.left && row.scrollWidth <= row.clientWidth + 1;
  }));
}

async function verifySimulationMiracle(page) {
  await page.locator('#sim-want-rank').check();
  await page.locator('#sim-start-rank').selectOption('1');
  await page.locator('#sim-rank').selectOption('2');
  assert.match(await page.locator('#sim-next').innerText(), /1.5%/);
  await page.locator('#sim-miracle').check();
  assert.match(await page.locator('#sim-next').innerText(), /3%/);
  assert.match(await page.locator('#sim-target').innerText(), /미라클 타임/);
  await page.evaluate(() => { Math.random = () => .02; });
  await page.locator('#sim-auto').press('Enter');
  await page.waitForFunction(() => document.getElementById('sim-spend-rank').textContent === '상위 3%');
  assert.equal(await page.locator('#sim-attempts').innerText(), '1회');
  assert.equal(await page.locator('#sim-grade-attempts span[data-soul-tone]').innerText(), '에픽');
  assert.equal(await page.locator('#sim-grade-attempts strong').innerText(), '1회');
  assert.equal(await page.locator('#sim-grade-attempts .actual-metric-percentile').innerText(), '상위 3%');
  assert.ok(await page.locator('#sim-miracle').isEnabled());
  assert.ok(await page.locator('#sim-miracle').isChecked());
  await page.evaluate(() => {
    let seed = 42;
    Math.random = () => .5 + ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 33);
  });
  await page.locator('#sim-reset').press('Enter');
  await page.waitForFunction(() => document.querySelector('#sim-status').dataset.tone === 'success');
  assert.equal(await page.locator('#sim-grade-attempts strong').innerText(), '100회');
  assert.equal(await page.locator('#sim-grade-attempts .soul-sim-pity').innerText(), '천장');
  assert.equal(await page.locator('#sim-grade-attempts .actual-metric-percentile').innerText(), '상위 100%');
}

async function verifySimulationPause(page) {
  await page.locator('#sim-want-option').check();
  await page.locator('#sim-option-stage').selectOption('4');
  await page.locator('#sim-option-rank').selectOption('4');
  await page.locator('#goal-total').fill('24');
  await page.evaluate(() => {
    let roll = 0;
    Math.random = () => roll++ % 6 === 3 ? .75 : 0;
  });
  await page.locator('#sim-auto').press('Enter');
  await page.waitForFunction(() => document.getElementById('sim-attempts').textContent !== '0회');
  assert.ok(await page.locator('#goal-total').isDisabled());
  await page.locator('#sim-stop').press('Enter');
  assert.ok(await page.locator('#goal-total').isEnabled());
  assert.equal(await page.locator('#sim-auto').innerText(), '이어서 자동 진행');
  assert.notEqual(await page.locator('#sim-attempts').innerText(), '0회');
  assert.equal(await page.locator('#sim-option-attempts strong').innerText(), await page.locator('#sim-attempts').innerText());
  assert.equal(await page.locator('#sim-option-attempts .actual-metric-percentile').count(), 0);
  await page.locator('#goal-total').fill('8');
  assert.equal(await page.locator('#sim-attempts').innerText(), '0회');
  assert.equal(await page.locator('#sim-auto').innerText(), '목표까지 자동 진행');
}

async function verifySimulationEtherIcons(page) {
  await page.locator('#sim-want-amp').check();
  await page.locator('#sim-want-rank').check();
  await page.locator('#sim-want-option').check();
  assert.equal(await page.locator('#sim-option-stage').isVisible(), false);
  assert.equal(await page.locator('#sim-option-rank').isVisible(), false);
  await page.locator('#sim-want-rank').uncheck();
  await page.locator('#sim-want-option').uncheck();
  await page.evaluate(() => { Math.random = () => 0; });
  await page.locator('#sim-auto').press('Enter');
  await page.waitForFunction(() => document.getElementById('sim-status').dataset.tone === 'success');
  const rows = page.locator('#sim-ether li');
  assert.deepEqual(await rows.locator('span').allTextContents(), ['1단계', '2단계', '3단계', '4단계']);
  assert.deepEqual(await rows.locator('strong').allTextContents(), ['1개', '1개', '1개', '1개']);
  assert.deepEqual(await rows.locator('.actual-metric-percentile').allTextContents(), ['상위 5%', '상위 3%', '상위 2%', '상위 1.5%']);
  const images = page.locator('#sim-ether img');
  await page.waitForFunction(() => [...document.querySelectorAll('#sim-ether img')].every(img => img.complete && img.naturalWidth));
  assert.deepEqual(await images.evaluateAll(nodes => nodes.map(node => node.getAttribute('src'))),
    [1, 2, 3, 4].map(stage => `icons/craft/soul-ether-${stage}.webp`));
  assert.equal(await page.locator('#sim-latest, #sim-log').count(), 0);
}
