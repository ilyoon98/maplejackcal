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
      await page.locator('#schedulerCharacterName').fill('예시용사');
      await shot('settings', '.scheduler-import');
      await shot('character', '#charChipList .char-chip >> nth=0');
      await shot('boss', '#bossList .boss-row:has([data-boss="스우"])');
      await shot('result', '.overall-card');
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
      await shot('settings', '#bossList');
      await shot('timing', '.route-settings');
      await shot('result', '.layout-right .card-primary');
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
      await page.locator('#party-create-toggle').click();
      await page.locator('#party-name').fill('도움말 예시 파티');
      await page.locator('#party-open-boss').click();
      await page.locator('#party-boss-query').fill('루시드');
      await page.locator('#party-boss-results button').first().click();
      await shot('boss', '#party-boss-dialog');
      await page.locator('#party-difficulty-options button').filter({hasText:'하드'}).click();
      for (const name of ['예시용사','예시마법사']) {
        await page.locator('#party-draft-character').selectOption(name);
        await page.locator('#party-draft-add').click();
      }
      await shot('settings', '.party-draft-picker');
      await shot('members', '#party-draft-members');
      await page.locator('#party-save').click();
      await shot('result', '#party-detail-content .party-summary-grid');
    }
  },
  'trade_margin_calc.html': {
    async capture(page, shot) {
      await fill(page, [['#buyPrice','7000000'],['#qty','10'],['#extraCost','2000000'],['#sellPrice','8500000'],['#feePct','5']]);
      await shot('settings', '.tm-layout > div:first-child > section:first-child');
      await shot('sale', '.tm-layout > div:first-child > section:nth-child(2)');
      await shot('result', '.tm-result > section:first-child');
    }
  },
  'meso_market_calc.html': {
    async capture(page, shot) {
      await fill(page, [['#baseRate','2304'],['#amount','10'],['#sellRate','2350'],['#buyFee','1'],['#sellFee','0']]);
      await shot('settings', '.mm-layout > div:first-child > section:first-child');
      await shot('fees', '.mm-layout > div:first-child > section:nth-child(3)');
      await shot('result', '.mm-result > section:first-child');
    }
  },
  'hunting_calc.html': {
    async capture(page, shot) {
      await fill(page, [['[name="drop"]','200'],['[name="meso"]','100'],['[name="monster"]','280'],['[name="mobs"]','38'],['[name="sixMinuteKills"]','1800'],['#actualFragments','10']]);
      await shot('settings', '#huntingForm');
      await shot('fragments', '.hunt-overview');
      await shot('result', '.hunt-money:not(.pure)');
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
      await shot('settings', '.accessory-summary');
      await shot('equipment', '.accessory-workspace');
      await page.locator('#accessory-result-details summary').click();
      await shot('result', '.accessory-result');
    }
  },
  'wealth_elixir_calc.html': {
    async prepare(page) {
      await seed(page, {wealthElixirCalc:{p:{seed:700000,oil:5000000,crystal:300000,stone:300000,recipe:10000000},on:{seed:true,oil:true,crystal:true,stone:true,recipe:true},elixir:5000000,crafts:10,discount:false}});
    },
    async capture(page, shot) {
      await page.locator('#recoBox:not(.hidden)').waitFor();
      await shot('settings', '.mm-layout > div:first-child > section:first-child');
      await shot('crafts', '.mm-layout > div:first-child > section:nth-child(3)');
      await shot('routes', '.mm-result > .mm-panel:nth-child(2)');
      await shot('result', '#verdictBox');
    }
  },
  'coin_shop_calc.html': {
    async capture(page, shot) {
      await page.locator('#weekPills button').nth(3).click();
      await page.locator('.item-row:visible .qty-input:not(.own-input)').nth(0).fill('10');
      await page.locator('.item-row:visible .qty-input:not(.own-input)').nth(1).fill('5');
      await page.locator('h1').click();
      await shot('settings', '.layout-left > section:first-child');
      await shot('item', '.item-row:visible >> nth=0');
      await shot('result', '#summaryCard');
      await shot('cart', '#cartList');
    }
  }
};
module.exports = recipes;
if (require.main === module) run('tools',recipes).catch(error=>{console.error(error);process.exitCode=1;});
