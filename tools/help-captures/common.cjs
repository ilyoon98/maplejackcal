'use strict';
const { run } = require('../help-capture-lib.cjs');
const recipes = {
  'index.html': {
    capture: async (page, shot) => {
      await page.setViewportSize({ width: 760, height: 1000 });
      await page.locator('#apiKey').evaluate(node => node.open = true);
      await page.locator('#apiKeyForm details').evaluate(node => node.open = true);
      await shot('connect', '#apiKey');
      await page.locator('#apiKeyInput').fill('example-only-not-a-real-api-key');
      await shot('enter-key', '.api-key-row');
      await page.locator('#apiKeySaveBtn').click();
      await shot('registered', '#apiKey');
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
      await page.setViewportSize({ width: 850, height: 1100 });
      await page.evaluate(() => NexonKey.set('illustrated-help-example-key'));
      await page.locator('#historyCancel').waitFor({ state:'visible' });
      await page.locator('#historyCancel').click();
      await page.waitForFunction(() => !document.querySelector('#historyFetch').disabled);
      await page.locator('#historyFrom').evaluate(el => el._flatpickr.setDate('2026-11-08', true));
      await page.locator('#historyTo').evaluate(el => el._flatpickr.setDate('2026-11-08', true));
      await page.locator('#historyFetch').click();
      await page.waitForFunction(() => document.querySelector('#historyStatus').textContent.includes('조회 완료'));
      await shot('conditions', '.history-page > .history-panel');
      await shot('result', '.history-finance');
      await page.locator('#historyItems button').first().click();
      await page.locator('#analysisSettings').evaluate(node => node.open = true);
      await page.locator('#itemGoal').fill('17');
      await page.locator('#analysisConfirmed').check();
      await page.locator('#analysisForm button[type="submit"]').click();
      await shot('analysis', '#analysisSettings');
    }
  }
};
module.exports = recipes;
if (require.main === module) run('common', recipes).catch(error => { console.error(error); process.exitCode = 1; });
