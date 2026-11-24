'use strict';
const { run } = require('../help-capture-lib.cjs');

// Only synthetic examples in fresh browser contexts. The calculator itself renders every result.
const recipes = {
  'trace_calc.html': {
    async capture(page, shot) {
      await page.locator('#tierList button').filter({ hasText: '아케인셰이드' }).click();
      await page.locator('#partList button').filter({ hasText: '모자' }).click();
      await page.locator('#bracketCards button').filter({ hasText: '30%' }).click();
      await shot('settings', [
        page.locator('#tierList button').filter({ hasText: '아케인셰이드' }),
        page.locator('#partList button').filter({ hasText: '모자' }),
        page.locator('#bracketCards button').filter({ hasText: '30%' })
      ], { crop: ['#tierList', '#bracketCards'] });
      await shot('materials', ['#probModeCards', '.field:has(#jujeonPrice)']);
      await shot('result', ['#summary'], { crop: ['.card-ref > h2'] });
      const slots = page.locator('#slotPicker button');
      await slots.nth(0).click();
      await slots.nth(1).click();
      await slots.nth(1).click();
      await shot('progress', [slots.first(), '.action-hero'], { crop: ['#slotPicker'] });
    }
  },
  'starforce_calc.html': {
    async capture(page, shot) {
      await page.locator('#startInput').fill('17');
      await page.locator('#goalInput').fill('22');
      await page.locator('#spareInput').fill('3000000000');
      await page.locator('#spareInput').blur();
      await shot('settings', ['.sf-field:has(#levelInput)', '.sf-field:has(#startInput)', '.sf-field:has(#goalInput)'], { crop: ['#levelChips'] });
      await shot('replacement', ['.sf-field:has(#spareInput)']);
      await shot('events', ['#mvpChips', '.sf-setting:has(#shiningSwitch)', '#eventChips']);
      await shot('protection', ['.sf-setting:has(#safeguardSwitch)', '.sf-setting:has(#recoverySwitch)']);
      await shot('result', ['.sf-result-value', '.sf-metric:has(#resDestroy)'], { crop: ['#expectedResultTitle'] });
    }
  },
  'cube_calc.html': {
    async capture(page, shot) {
      await shot('cost', ['.cube-equipment']);
      await page.locator('#cube-rank-start').selectOption('2');
      await shot('settings', ['#rankGoalRow']);
      await page.locator('[data-grade-method="potentialMeso"]').click();
      await shot('method', ['.cube-method:has(#gradeCube)', '#miracleCheckbox']);
      await page.locator('#primaryPicks [data-add="공격력|%"]').click();
      await page.locator('.opt-presets button').nth(1).click();
      await shot('goal', ['.opt-presets'], { crop: ['#primaryPicks', '#optionRows'] });
      await shot('result', ['#potential-cost', '.potential-budgets:has(#potential-50)', '.cube-stage-summary'], { crop: ['#potential-title', '#potential-context'] });
      await page.locator('#recordCount2').fill('20');
      await shot('record', ['#recordCount2'], { crop: ['.record-stage-head', '.record-stats'] });
    }
  },
  'soul_calc.html': {
    async capture(page, shot) {
      await page.locator('#enable-amp').check();
      await page.locator('#amp-target').selectOption('2');
      await shot('amplification', ['#amp-route']);
      await page.locator('#amp-attempt-0').fill('12');
      await page.locator('#amp-attempt-1').fill('8');
      await shot('progress-record', ['#amp-attempts']);
      await page.locator('#amp-price-panel > summary').click();
      await page.locator('#amp-price-1').fill('50000000');
      await shot('ether-price', ['#amp-prices'], { crop: ['#amp-price-hint'] });
      await shot('amplification-result', ['#potential-cost', '.potential-budgets:has(#potential-50)'], { crop: ['#potential-title'] });
      await page.locator('#amp-price-panel > summary').click();
      await page.locator('#amp-target').selectOption('4');
      await page.locator('#amp-start').selectOption('4');
      await page.locator('#enable-rank').check();
      await page.locator('#rank-start').selectOption('2');
      await page.locator('#rank-target').selectOption('3');
      await shot('rank-settings', ['#rank-route']);
      await page.locator('#soul-miracle').click();
      await shot('rank-miracle', ['#soul-miracle']);
      await page.locator('#rank-attempt-2').fill('48');
      await shot('rank-attempts', ['#rank-attempts']);
      await shot('rank-details', ['#rank-details > summary']);
      await page.locator('#rank-details > summary').click();
      await shot('rank-result', ['#rank-detail-record']);
      await page.locator('#rank-details > summary').click();
      await page.locator('#rank-target').selectOption('4');
      await page.locator('#enable-option').check();
      await page.locator('#goal-type').selectOption('공격력 %');
      await page.locator('#option-goals [data-goal-sum="14"]').click();
      await shot('goal', ['.field:has(#goal-type)', '[data-goal-picks]'], { crop: ['#goal-total'] });
      await page.locator('#option-attempts').fill('100');
      await shot('option-attempts', ['#option-attempts'], { crop: ['fieldset:has(#option-attempts)'] });
      await shot('option-details', ['#option-details > summary']);
      await page.locator('#option-details > summary').click();
      await shot('result', ['.soul-option-chance']);
      await shot('option-cost', ['#option-route-metrics > div:first-child']);
      await shot('record', ['#option-detail-record']);
      await page.locator('#amp-start').selectOption('3');
      await page.locator('#amp-attempt-3').fill('14');
      await page.locator('#rank-attempt-3').fill('75');
      await shot('total-record', ['#total-record']);
    }
  },
  'flame_calc.html': {
    async capture(page, shot) {
      await page.locator('#part').selectOption('장비');
      await page.locator('#applyArmorGrade').click();
      await shot('settings', ['.ic-field:has(#level)', '.ic-field:has(#part)']);
      await shot('goal', ['#applyArmorGrade', '#flameBody input[data-cond]']);
      await shot('flame', ['#flameBody [data-flame].active'], { crop: ['#flameBody [data-flame]:first-child'] });
      await shot('result', ['.fc-prob', '.fc-metrics > div:first-child'], { crop: ['#resultTitle'] });
      await page.locator('#part').selectOption('무기');
      const attack = page.locator('#flameBody [data-addflame="ATT"]');
      if (await attack.isVisible()) await attack.click();
      await shot('weapon', ['#flameBody .ic-tiers']);
    }
  },
  'item_craft_calc.html': {
    async capture(page, shot) {
      await page.locator('#part').selectOption('모자');
      await page.locator('#basePrice').fill('3000000000');
      await page.locator('#basePrice').blur();
      await shot('settings', ['.ic-field:has(#level)', '.ic-field:has(#part)', '.ic-field:has(#basePrice)']);
      await page.locator('#flamePanel .ux-stage-toggle').click();
      await page.locator('#flameBody [data-addgrade]').click();
      await page.locator('#flameBody input[data-cond]').fill('150');
      await page.locator('#flameBody input[data-cond]').blur();
      await page.locator('#flamePanel .ux-stage-toggle').click();
      await page.locator('#starPanel .ux-stage-toggle').click();
      await page.locator('#starStart').fill('17');
      await page.locator('#starGoal').fill('22');
      await page.locator('#starGoal').blur();
      await shot('stage', ['#starPanel .ic-toggle', '.ic-field:has(#starStart)', '.ic-field:has(#starGoal)']);
      await page.locator('#potPanel .ux-stage-toggle').click();
      await page.locator('#potBody [data-addpot="pot"]').filter({ hasText: '주스탯 %' }).click();
      await page.locator('#potBody input[data-pot]').fill('24');
      await page.locator('#potBody input[data-pot]').blur();
      await shot('goal', [page.locator('#potBody [data-addpot="pot"]').filter({ hasText: '주스탯 %' }), '#potBody input[data-pot]'], { order: true });
      await shot('result', ['.ic-totals > :first-child'], { crop: ['.ic-totals'] });
    }
  },
  'authentic_symbol_calc.html': {
    async capture(page, shot) {
      await page.setViewportSize({ width: 640, height: 1000 });
      for (let i = 0; i < 8; i++) {
        if (i < 5) {
          await page.locator('#levelGrid input[data-idx="' + i + '"]').fill('5');
          await page.locator('#levelGrid input[data-idx="' + i + '"]').dispatchEvent('change');
        } else await page.locator('#levelGrid .reach-toggle[data-idx="' + i + '"]').click();
      }
      await shot('levels', ['#levelGrid input[data-idx="0"]', '#levelGrid input[data-idx="1"]'], { crop: ['#levelCard > summary'] });
      await page.locator('#targetForce').fill('300');
      await page.locator('#targetForce').dispatchEvent('change');
      await shot('target', ['.hero-force:has(#targetForce)']);
      await shot('route', ['#orderList .step-tile.first'], { crop: ['.order-head > h3'] });
      await shot('result', ['.summary-stat:has(#sumMeso)'], { viewport: true });
    }
  }
};

module.exports = recipes;
if (require.main === module) run('equipment', recipes).catch(error => { console.error(error); process.exitCode = 1; });
