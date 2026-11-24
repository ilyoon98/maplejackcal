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
      await shot('settings', ['#kindTabs', '#rankGoalRow', '#cubeChoices']);
      await shot('start', ['#autoBtn'], { crop: ['.sim-stage'] });
      await page.locator('#autoBtn').click();
      await page.waitForFunction(() => document.getElementById('uxScoreRank').textContent !== '상위 —%');
      await shot('decision', ['#retryBtn', '#nextBtn']);
    }
  },
  'soul_play.html': {
    prepare: seeded,
    async capture(page, shot) {
      await page.locator('#sim-want-amp').check();
      await page.locator('#sim-want-rank').check();
      await page.locator('#sim-want-option').check();
      await shot('settings', ['#sim-amp-title', '#sim-rank-title', '#sim-miracle-field', '#sim-option-title'],
        { crop: ['#sim-amp-settings', '#sim-rank-settings'] });
      await page.locator('[data-goal-sum="14"]').click();
      await shot('goals', ['.soul-goal-preset-row', '#goal-total', '#add-option-group'], { crop: ['[data-goal-add]'] });
      await shot('actions', ['#sim-auto'], { crop: ['#sim-next'] });
      await page.locator('#sim-auto').click();
      await page.waitForFunction(() => document.querySelector('#sim-status').dataset.tone === 'success');
      await shot('result', ['#sim-totals']);
      await shot('ether-log', ['.soul-sim-breakdown']);
      await shot('retry', ['#sim-reset']);
    }
  },
  'starforce_play.html': {
    prepare: seeded,
    async capture(page, shot) {
      await page.locator('#startInput').fill('15');
      await page.locator('#goalInput').fill('17');
      await page.locator('#spareInput').fill('100000000');
      await page.locator('#spareInput').blur();
      await shot('settings', ['.sf-field:has(#startInput)', '.sf-field:has(#goalInput)']);
      await shot('start', ['#autoBtn'], { crop: ['#starBox'] });
      await page.locator('#autoBtn').click();
      await page.waitForFunction(() => document.getElementById('stageStar').textContent === '17', null, { timeout: 20000 });
      await shot('decision', ['#clearedActions button']);
    }
  },
  'pet_gacha.html': {
    prepare: seeded,
    async capture(page, shot) {
      await shot('open', ['#pullOne', '#pullEleven']);
      for (let i = 0; i < 6; i++) await page.locator('#pullEleven').click();
      await shot('inventory', ['#inventory .material-wonder-black'], { crop: ['#inventory .material-luna-sweet'] });
      await shot('synthesis', ['#quickBlack']);
      await page.locator('#autoStart').click();
      await page.waitForFunction(() => document.getElementById('petitCount').textContent !== '0개');
      await shot('result', ['#resultName'], { crop: ['#resultMain'] });
    }
  },
  'boutique_gacha.html': {
    prepare: seeded,
    async capture(page, shot) {
      await shot('open', ['#pullOne', '#pullTen']);
      await shot('auto', ['[data-target="100"]', '#autoStart']);
      await page.locator('#pullOne').click();
      await shot('draw', ['#resultName'], { crop: ['#resultMain'] });
    }
  },
  'seedring_gacha.html': {
    prepare: seeded,
    async capture(page, shot) {
      await page.locator('#modeUnlimited').click();
      await shot('mode', ['#modeDaily', '#modeUnlimited']);
      await page.locator('[data-box="black"]').click();
      await shot('boxes', ['[data-box="black"]']);
      await shot('draw', ['#drawOne']);
      await page.locator('#drawOne').click();
      await page.waitForSelector('#result .result-card');
      await shot('result', ['#result .result-item', '#result .result-lv']);
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
      await shot('actions', ['[data-mode="gather"]', '[data-mode="oil"]'], { crop: ['.hi-actions'] });
      await page.locator('[data-mode="oil"]').click();
      await page.locator('[data-trade-input="sell-seed"]').fill('10');
      await page.locator('[data-trade-input="sell-seed"]').blur();
      await page.waitForFunction(() => !document.querySelector('[data-sell="seed"]').disabled);
      await shot('market', ['#marketTabSell', '[data-trade-input="sell-seed"]', '[data-sell="seed"]']);
      await page.locator('[data-sell="seed"]').click();
      await page.waitForFunction(() => document.getElementById('log').textContent.includes('판매'));
      await shot('result', ['.hi-meso']);
    }
  }
};

module.exports = recipes;
if (require.main === module) run('play', recipes).catch(error => { console.error(error); process.exitCode = 1; });
