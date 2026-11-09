'use strict';
const { run } = require('../help-capture-lib.cjs');

// Only synthetic examples in fresh browser contexts. The calculator itself renders every result.
const recipes = {
  'trace_calc.html': {
    async capture(page, shot) {
      await page.locator('#tierList button').filter({ hasText: '아케인셰이드' }).click();
      await page.locator('#partList button').filter({ hasText: '모자' }).click();
      await page.locator('#bracketCards button').filter({ hasText: '30%' }).click();
      await shot('settings', '.layout-left > .card:nth-child(2)');
      await shot('materials', '.layout-left > .card:nth-child(3)');
      const slots = page.locator('#slotPicker button');
      await slots.nth(0).click();
      await slots.nth(1).click();
      await slots.nth(1).click();
      await shot('progress', '#resultBody .card-primary');
      await shot('result', '#expectedResultCard');
    }
  },
  'starforce_calc.html': {
    async capture(page, shot) {
      await page.locator('#startInput').fill('17');
      await page.locator('#goalInput').fill('22');
      await page.locator('#spareInput').fill('3000000000');
      await page.locator('#spareInput').blur();
      await shot('settings', '.sf-settings > .sf-panel:first-child');
      await shot('events', '.sf-settings > .sf-panel:nth-child(2)');
      await shot('protection', '.sf-settings > .sf-panel:nth-child(3)');
      await shot('result', '#expectedResultCard');
    }
  },
  'cube_calc.html': {
    async capture(page, shot) {
      await page.locator('#cubeChoices button').filter({ hasText: '잠재능력 재설정 (메소)' }).click();
      await page.locator('#rankGoalRow .rank-group').first().getByRole('button', { name: '유니크', exact: true }).click();
      await shot('settings', '.cube-layout > section > .cube-panel:first-child');
      await shot('cost', '.cube-layout > section > .cube-panel:nth-child(2)');
      await page.locator('#recordCount2').fill('50');
      await shot('record', '.record-panel');
      await shot('result', '.cube-panel.card-primary');
    }
  },
  'cube_option_calc.html': {
    async capture(page, shot) {
      await page.locator('[data-cube="potentialMeso"]').click();
      await shot('settings', '.cube-layout > section > .cube-panel:first-child');
      await page.locator('#primaryPicks button').filter({ hasText: '공격력 %' }).click();
      await page.locator('#optionRows input.opt-val').fill('21');
      await page.locator('#optionRows input.opt-val').blur();
      await shot('goal', '.cube-layout > section > .cube-panel:nth-child(3)');
      await page.locator('#addSet').click();
      await page.locator('#primaryPicks button').filter({ hasText: '보스 데미지 %' }).click();
      await page.locator('#optionRows input.opt-val').last().fill('60');
      await page.locator('#optionRows input.opt-val').last().blur();
      await shot('alternatives', '#optionRows');
      await shot('result', '#expectedResultCard');
    }
  },
  'flame_calc.html': {
    async capture(page, shot) {
      await page.locator('#part').selectOption('장비');
      await page.locator('#applyArmorGrade').click();
      await shot('settings', '.fc-layout > section > .ic-panel:first-child');
      await shot('goal', '.fc-layout > section > .ic-panel:nth-child(2)');
      await shot('result', '.fc-result');
    }
  },
  'item_craft_calc.html': {
    async capture(page, shot) {
      await page.locator('#part').selectOption('모자');
      await page.locator('#basePrice').fill('3000000000');
      await page.locator('#basePrice').blur();
      await shot('settings', '.ic-layout > section:first-child > .ic-panel:first-child');
      await page.locator('#flamePanel .ux-stage-toggle').click();
      await page.locator('#flameBody [data-addgrade]').click();
      await page.locator('#flameBody input[data-cond]').fill('150');
      await page.locator('#flameBody input[data-cond]').blur();
      await page.locator('#flamePanel .ux-stage-toggle').click();
      await page.locator('#starPanel .ux-stage-toggle').click();
      await page.locator('#starStart').fill('17');
      await page.locator('#starGoal').fill('22');
      await page.locator('#starGoal').blur();
      await shot('stage', '#starPanel');
      await page.locator('#potPanel .ux-stage-toggle').click();
      await page.locator('#potBody [data-addpot="pot"]').filter({ hasText: '주스탯 %' }).click();
      await page.locator('#potBody input[data-pot]').fill('24');
      await page.locator('#potBody input[data-pot]').blur();
      await shot('goal', '#potPanel');
      await shot('result', '.ic-totals');
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
      await shot('levels', '#levelCard');
      await page.locator('#targetForce').fill('300');
      await page.locator('#targetForce').dispatchEvent('change');
      await shot('target', '.hero-force');
      await shot('route', '#panelOpt');
      await page.evaluate(() => window.scrollTo(0, window.scrollY));
      await shot('result', '.summary-bar');
    }
  }
};

module.exports = recipes;
if (require.main === module) run('equipment', recipes).catch(error => { console.error(error); process.exitCode = 1; });
