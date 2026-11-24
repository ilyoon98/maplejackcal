'use strict';
const { run } = require('../help-capture-lib.cjs');
const path = require('node:path');
const scouter = require('../../scouter_data.js');
const recipes = {
  'index.html': {
    capture: async (page, shot) => {
      await page.setViewportSize({ width: 490, height: 1000 });
      await shot('connect', ['#apiKey > summary']);
      await page.locator('#apiKey > summary').click();
      await page.locator('#apiKeyInput').fill('example-only-not-a-real-api-key');
      await shot('enter-key', ['#apiKeyInput', '#apiKeySaveBtn'], { order: true });
      await page.locator('#apiKeySaveBtn').click();
      await shot('registered', ['#apiKeyRegistered .key-hero-title'], { crop: ['#apiKeyRegistered'] });
    }
  },
  'access_log.html': {
    capture: async (page, shot) => {
      await page.goto(page.url() + '?demo');
      await page.setViewportSize({ width: 490, height: 1000 });
      await page.locator('#accessChars').waitFor({ state: 'visible' });
      await page.locator('#accessFrom').fill('2026-10-19');
      await page.locator('#accessTo').fill('2026-11-08');
      await shot('conditions', ['.access-dates']);
      await page.locator('#accessChars > summary').click();
      await page.locator('#accessCharNone').click();
      await page.locator('#accessCharList input[value="demo-main"]').check();
      await shot('characters', ['#accessCharList label:has(input[value="demo-main"])'], { crop: ['#accessChars > summary'] });
      await page.locator('#accessChars').evaluate(node => node.open = false);
      await shot('lookup', ['#accessSubmit']);
      await page.locator('#accessSubmit').click();
      await page.waitForFunction(() => !document.querySelector('#accessResult').hidden && !document.querySelector('#accessSubmit').disabled, { timeout: 30000 });
      await shot('result', ['#accessLine', '.access-legend']);
    }
  },
  'starforce_history.html': {
    prepare: async page => {
      await page.route('https://open.api.nexon.com/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/character/list')) return route.fulfill({ json: { account_list: [{ account_id:'example', character_list:[{ocid:'help-character', character_name:'예시용사',world_name:'스카니아',character_level:285}] }] } });
        if (url.pathname.endsWith('/notice-event')) return route.fulfill({ json: { event_notice: [] } });
        const rows = Array.from({ length: 5 }, (_, i) => ({ id:'help-'+i,character_name:'예시용사',world_name:'스카니아',target_item:'아케인셰이드 나이트헬름',date_create:'2026-11-08T12:0'+i+':00+09:00',before_starforce_count:12+i,after_starforce_count:13+i,item_upgrade_result:'성공',starcatch_result:null,starforce_event_list:[] }));
        return route.fulfill({ json:{ starforce_history:url.searchParams.get('date') === '2026-11-08' ? rows : [], next_cursor:null } });
      });
    },
    capture: async (page, shot) => {
      await page.setViewportSize({ width: 530, height: 1050 });
      await page.evaluate(() => NexonKey.set('illustrated-help-example-key'));
      await page.locator('#historyCancel').waitFor({ state:'visible' });
      await page.locator('#historyCancel').click();
      await page.waitForFunction(() => !document.querySelector('#historyFetch').disabled);
      await page.locator('#historyFrom').evaluate(el => el._flatpickr.setDate('2026-11-08', true));
      await page.locator('#historyTo').evaluate(el => el._flatpickr.setDate('2026-11-08', true));
      await page.locator('#historyFetch').click();
      await page.waitForFunction(() => document.querySelector('#historyStatus').textContent.includes('조회 완료'));
      await shot('conditions', ['#historyCharacterSummary', 'label:has(#historyFrom)', 'label:has(#historyTo)', '#historyFetch']);
      await shot('item', [page.locator('#historyItems button').first()], { crop: ['#itemsTitle'] });
      await page.locator('#historyItems button').first().click();
      await shot('segment', ['.history-session > label', '#sessionSelect', '#analysisSettings > summary'], { viewport: true });
      await page.locator('#analysisSettings').evaluate(node => node.open = true);
      await page.locator('#itemGoal').fill('17');
      await page.locator('#analysisConfirmed').check();
      await shot('analysis', ['#analysisForm button[type="submit"]', 'label:has(#analysisConfirmed)'], { viewport: true });
      await page.locator('#analysisForm button[type="submit"]').click();
      await shot('result', ['#itemComparison'], { viewport: true });
    }
  },
  'shared_boss_rates.html': {
    async prepare(page) {
      const name = '예시용사';
      const snapshot = {
        schemaVersion: 1, characterName: name, preset: '00000', revision: 'example',
        sourceUrl: scouter.resultUrl(name, '00000'), fetchedAt: '2026-11-08T03:00:00Z',
        conditions: { view: 'all', bossTimeMinutes: 20, destinyChampion: false, simulation: false },
        character: { name, world: '스카니아', job: '히어로', level: 280 },
        rates: [{ bossId: 'Will|Hard', percent: 77 }]
      };
      await page.route('**/api/boss-rates', route => route.request().method() === 'GET'
        ? route.fulfill({ json: { schemaVersion: 1, persistent: true, snapshots: [snapshot], accounts: [] } })
        : route.abort());
    },
    async capture(page, shot) {
      await shot.reference('settings', 'capture-guide/scouter-settings.png', [[130, 110, 74, 33], [42, 171, 143, 22]], [[32, 51, 179, 149]]);
      await shot.reference('cards', 'capture-guide/boss-cards.png', [[17, 12, 607, 276]]);
      await page.locator('#shared-image').waitFor({ state: 'attached' });
      await page.waitForFunction(() => !document.querySelector('#shared-image').disabled);
      await shot('character', ['label:has(#shared-character)']);
      await shot('upload', ['#shared-drop', '#shared-drop label']);
      await page.locator('#shared-image').setInputFiles(path.resolve(__dirname, '../../capture-guide/boss-cards.png'));
      await page.waitForFunction(() => !document.querySelector('#shared-image').disabled);
      await shot('save', [page.locator('#shared-rows .shared-rate-amount').first(), '#shared-save'], { order: true });
    }
  }
};
module.exports = recipes;
if (require.main === module) run('common', recipes).catch(error => { console.error(error); process.exitCode = 1; });
