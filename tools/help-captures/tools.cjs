// Reproducible help illustrations. Every account, character and price is fictional.
const { run } = require('../help-capture-lib.cjs');
const scouter = require('../../scouter_data.js');

async function seed(page, values) {
  await page.addInitScript(values => {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
  }, values);
}
async function fill(page, entries) {
  for (const [selector, value] of entries) await page.locator(selector).fill(String(value));
  await page.locator('h1').click();
}
const recipes = {
  'boss_income_calc.html': {
    async prepare(page) {
      await seed(page, {boss_income_state:{characters:[
        {name:'예시용사',worldName:'스카니아',characterClass:'히어로',characterLevel:280,bosses:{'스우':{diffIdx:1,party:1,complete:true},'데미안':{diffIdx:0,party:1,complete:true},'루시드':{diffIdx:0,party:2,complete:false},'윌':{diffIdx:0,party:2,complete:false}}},
        {name:'예시마법사',worldName:'스카니아',characterClass:'비숍',characterLevel:275,bosses:{'스우':{diffIdx:1,party:2,complete:false},'데미안':{diffIdx:0,party:2,complete:false}}}
      ]}});
    },
    async capture(page, shot) {
      await page.locator('#charChipList .char-chip').first().waitFor();
      const direct = page.getByRole('button', { name: '직접 검색' });
      if (await direct.isVisible()) await direct.click();
      await page.locator('#schedulerCharacterName').fill('예시용사');
      await shot('settings', ['#schedulerCharacterName', '#schedulerFetchBtn']);
      const boss = page.locator('#bossList .boss-row').filter({ has: page.getByRole('button', { name: '루시드 완료 처리' }).first() });
      await shot('boss', [boss.locator('.diff-option[aria-pressed="true"]'), boss.locator('select')]);
      await shot('character', [boss.locator('.ux-complete-toggle')], { crop: [boss.locator('.row-preview')] });
      await boss.locator('.ux-complete-toggle').click();
      await shot('result', ['#weeklyIncomeLabel', '#sumEarned'], { crop: ['.weekly-summary'] });
    }
  },
  'boss_buff_planner.html': {
    async prepare(page) {
      await seed(page, {'bossBuffPlanner.v1':{moveMin:1,slackPct:10,showAllBosses:false,excludeCompleted:false,bosses:[
        {name:'듄켈',diff:'하드',mult:300,on:true},
        {name:'진 힐라',diff:'하드',mult:250,on:true},
        {name:'루시드',diff:'하드',mult:400,on:true},
        {name:'윌',diff:'하드',mult:350,on:true}
      ]}});
    },
    async capture(page, shot) {
      await page.locator('#bossList .boss-row').first().waitFor();
      const boss = page.locator('#bossList .boss-row').first();
      await shot('settings', [boss.locator('.row-include'), boss.locator('.row-diff'), boss.locator('.row-mult'), boss.locator('.row-time')]);
      await shot('timing', ['.route-item:has(#moveMin)', '.route-item:has(#slackPct)']);
      const pack = page.locator('.pack-bin').first();
      await shot('result', [pack.locator('.bin-time'), pack.locator('.route')], { crop: [pack.locator('.bin-head')] });
    }
  },
  'party_boss_scheduler.html': {
    async prepare(page) {
      const now = Date.now();
      const snapshots = [['예시용사',80,'히어로'],['예시마법사',65,'비숍']].map(([name,percent,job])=>({
        schemaVersion:1,characterName:name,preset:'00000',sourceUrl:scouter.resultUrl(name,'00000'),fetchedAt:new Date(now).toISOString(),
        conditions:{view:'all',bossTimeMinutes:20,destinyChampion:false,simulation:false},
        character:{name,world:'스카니아',job,level:280,image:'',updatedAt:now},rates:[{bossId:'Lucid|Hard',percent,eligibility:''}]
      }));
      await page.route('**/api/**', route=>{
        if (route.request().method() !== 'GET') throw new Error('Capture must not write to APIs');
        const url = new URL(route.request().url());
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(url.pathname==='/api/boss-rates'?{schemaVersion:1,snapshots,accounts:[{id:'example-a',label:'예시 계정 A',characters:[{name:'예시용사'}]},{id:'example-b',label:'예시 계정 B',characters:[{name:'예시마법사'}]}],persistent:false}:{parties:[]})});
      });
    },
    async capture(page, shot) {
      await shot('create', ['#party-create-toggle']);
      await page.locator('#party-create-toggle').click();
      await page.locator('#party-name').fill('도움말 예시 파티');
      await shot('open-boss', ['#party-open-boss']);
      await page.locator('#party-open-boss').click();
      await page.locator('#party-boss-query').fill('루시드');
      await shot('boss', ['#party-boss-search', page.locator('#party-boss-results button').first()], { viewport: true, order: true });
      await page.locator('#party-boss-results button').first().click();
      await shot('difficulty', [page.locator('#party-difficulty-options button').filter({hasText:'하드'})], { crop: ['#party-difficulty-options'], viewport: true });
      await page.locator('#party-difficulty-options button').filter({hasText:'하드'}).click();
      for (const name of ['예시용사','예시마법사']) {
        await page.locator('#party-draft-character').selectOption(name);
        await page.locator('#party-draft-add').click();
      }
      await shot('settings', ['label:has(#party-draft-account)', 'label:has(#party-draft-character)', '#party-draft-add'], { order: true });
      await shot('members', ['#party-save']);
      await page.locator('#party-save').click();
      await shot('result', [page.locator('#party-detail-content .party-summary-grid > *').filter({ hasText: '환산 합계' })]);
    }
  },
  'trade_margin_calc.html': {
    async capture(page, shot) {
      await fill(page, [['#buyPrice','7000000'],['#qty','10'],['#extraCost','2000000'],['#sellPrice','8500000'],['#feePct','5']]);
      await shot('settings', ['.tm-field:has(#buyPrice)', '.tm-field:has(#qty)']);
      await shot('sale', ['.tm-field:has(#sellPrice)', '.tm-field:has(#feePct)']);
      await shot('result', ['#breakEvenBox', '#verdictBox .tm-verdict-head']);
    }
  },
  'meso_market_calc.html': {
    async capture(page, shot) {
      await fill(page, [['#baseRate','2304'],['#amount','10'],['#sellRate','2350'],['#buyFee','1'],['#sellFee','0']]);
      await shot('settings', ['.mm-field:has(#baseRate)', '.mm-field:has(#amount)']);
      await shot('sale', ['.mm-field:has(#sellRate)']);
      await shot('result', ['.mm-even', '#verdictBox .mm-verdict-head']);
    }
  },
  'hunting_calc.html': {
    async capture(page, shot) {
      await fill(page, [['[name="drop"]','200'],['[name="meso"]','100'],['[name="monster"]','280'],['[name="mobs"]','38'],['[name="sixMinuteKills"]','1800'],['#actualFragments','10'],['#huntingTarget','1,000,000,000']]);
      await shot('settings', ['label:has([name="drop"])', 'label:has([name="meso"])', 'label:has([name="monster"])']);
      await shot('kills', ['label:has([name="mobs"])', 'label:has([name="sixMinuteKills"])']);
      await shot('buffs', ['#fragmentPrice', '.hunt-buffs'], { crop: ['label[for="fragmentPrice"]'] });
      await shot('fragments', ['.hunt-reward.fragment']);
      await shot('result', ['#huntingTarget', '.hunt-session-count'], { crop: ['.hunt-session'] });
    }
  },
  'accessory_planner.html': {
    async prepare(page) {
      const prices = Array.from({length:9},(_,i)=>[10,11,35,40,38].map((price,j)=>({value:String(price+i),owned:i===0&&j===3})));
      const preferences=Array(18).fill('');preferences[0]='drop';preferences[1]='meso';
      await seed(page, {'accessoryPlanner.prices.v3':prices,'accessoryPlanner.preferences.v1':preferences});
    },
    async capture(page, shot) {
      await page.locator('#accessory-prices input').first().waitFor();
      await shot('settings', ['.accessory-target:has(input[type="range"]) >> nth=0', '.accessory-target:has(input[type="range"]) >> nth=1']);
      await shot('equipment', ['#accessory-slots [data-slot="0"]'], { crop: ['#accessory-slots'] });
      await shot('prices', ['#accessory-prices .accessory-owned[aria-checked="true"]', '#accessory-prices .accessory-price >> nth=3'], { crop: ['#accessory-price-hint'] });
      await shot('result', ['#accessory-result-status'], { crop: ['#accessory-result-title'] });
    }
  },
  'wealth_elixir_calc.html': {
    async prepare(page) {
      await seed(page, {wealthElixirCalc:{p:{seed:700000,oil:5000000,crystal:300000,stone:300000,recipe:10000000},on:{seed:true,oil:true,crystal:true,stone:true,recipe:true},elixir:5000000,crafts:10,discount:false}});
    },
    async capture(page, shot) {
      await page.locator('#recoBox:not(.hidden)').waitFor();
      await shot('settings', ['#matRows input:not([type="checkbox"]) >> nth=0', '#matRows input:not([type="checkbox"]) >> nth=1'], { crop: ['#matRows > :first-child'] });
      await shot('elixir', ['.mm-field:has(#p_elixir)']);
      await shot('crafts', ['#crafts', '[data-discount="0"]'], { crop: ['#craftChips'] });
      await shot('routes', ['#recoTitle'], { crop: ['#recoBox'] });
      await shot('result', ['#verdictBox .mm-verdict-head'], { crop: ['#verdictCrafts'] });
    }
  },
  'coin_shop_calc.html': {
    async capture(page, shot) {
      await page.locator('#weekPills button').nth(3).click();
      await page.locator('.item-row:visible .qty-input:not(.own-input)').nth(0).fill('10');
      await page.locator('.item-row:visible .qty-input:not(.own-input)').nth(1).fill('5');
      await page.locator('h1').click();
      await shot('settings', [page.locator('#weekPills button').nth(3)], { crop: ['#weekPills'] });
      const item = page.locator('.item-row:visible').first();
      await shot('item', [item.locator('.plus')], { crop: [item] });
      await shot('result', ['#summaryCard .big-grid > div:has(#nowLeftBig)']);
      await shot('cart', ['#buyAllBtn']);
    }
  }
};
module.exports = recipes;
if (require.main === module) run('tools',recipes).catch(error=>{console.error(error);process.exitCode=1;});
