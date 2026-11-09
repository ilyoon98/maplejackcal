'use strict';
const { run } = require('../help-capture-lib.cjs');
const Core = require('../../herb_idle_core.js');

// Reproducible examples in a new browser context; no real account or game data.
async function seeded(page) {
  await page.addInitScript(() => {
    let seed = 20261109;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  });
}

const recipes = {
  'cube_play.html': {
    prepare: seeded,
    async capture(page, shot) {
      await shot('settings', '.cube-layout > section > .cube-panel');
      await shot('start', '.sim-action-stack');
      await page.locator('#autoBtn').click();
      await page.waitForFunction(() => document.getElementById('uxScoreRank').textContent !== '상위 —%');
      await shot('decision', '#decisionRow');
      await shot('result', '#simPercentiles');
    }
  },
  'starforce_play.html': {
    prepare: seeded,
    async capture(page, shot) {
      await page.locator('#startInput').fill('15');
      await page.locator('#goalInput').fill('17');
      await page.locator('#spareInput').fill('100000000');
      await page.locator('#spareInput').blur();
      await shot('settings', '.sf-layout > section > .sf-panel');
      await shot('start', '#starBox');
      await page.locator('#autoBtn').click();
      await page.waitForFunction(() => document.getElementById('stageStar').textContent === '17', null, { timeout: 20000 });
      await shot('decision', '#clearedActions');
      await shot('result', '#simStats');
    }
  },
  'pet_gacha.html': {
    prepare: seeded,
    async capture(page, shot) {
      await shot('open', '.pet-actions');
      for (let i = 0; i < 6; i++) await page.locator('#pullEleven').click();
      await shot('inventory', '.pet-card:has(#inventory)');
      await shot('synthesis', '.pet-card:has(#synthBox)');
      await page.locator('#quickBlack').click();
      await page.waitForFunction(() => document.getElementById('synthCount').textContent !== '0회');
      await shot('result', '.pet-card:has(#spent)');
    }
  },
  'boutique_gacha.html': {
    prepare: seeded,
    async capture(page, shot) {
      await shot('open', '.bt-card:has(#pullTen)');
      await shot('auto', '#autoCard');
      await page.locator('#pullTen').click();
      await shot('draw', '#resultCard');
      await shot('result', '.bt-card:has(#tickets)');
    }
  },
  'seedring_gacha.html': {
    prepare: seeded,
    async capture(page, shot) {
      await page.locator('#modeUnlimited').click();
      await shot('mode', '.sr-card:has(#modeDaily)');
      await page.locator('[data-box="black"]').click();
      await shot('boxes', '[data-box="black"]');
      await page.locator('#drawOne').click();
      await page.waitForSelector('#result .result-card');
      await shot('result', '#vaultPanel');
    }
  },
  'herb_idle.html': {
    async prepare(page) {
      const game = Core.create(20261109);
      game.meso = 600000000;
      Object.assign(game.inv, { seed: 120, oil: 12, elixir: 18, crystal: 30, stone: 15 });
      await page.addInitScript(game => {
        localStorage.setItem('herbIdleGame', JSON.stringify({ v: 1, game, wall: Date.now(), log: [] }));
      }, game);
    },
    async capture(page, shot) {
      await page.waitForFunction(() => document.getElementById('inv_seed').textContent !== '0');
      await shot('field', '#stage');
      await shot('actions', '.hi-actions');
      await page.locator('[data-mode="oil"]').click();
      await page.locator('[data-trade-input="sell-seed"]').fill('10');
      await page.locator('[data-trade-input="sell-seed"]').blur();
      await page.waitForFunction(() => !document.querySelector('[data-sell="seed"]').disabled);
      await shot('market', '.hi-market');
      await page.locator('[data-sell="seed"]').click();
      await page.waitForFunction(() => document.getElementById('log').textContent.includes('판매'));
      await shot('result', '#worth');
      const toastClose = page.locator('#toast .ux-toast-close');
      if (await toastClose.isVisible()) await toastClose.click();
      await page.locator('#marketTabBuy').click();
      await page.locator('#facility summary').click();
      await shot('facility', '#facility');
    }
  }
};

module.exports = recipes;
if (require.main === module) run('play', recipes).catch(error => { console.error(error); process.exitCode = 1; });
