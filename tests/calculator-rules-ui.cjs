// Run with Playwright on NODE_PATH; uses the installed Edge browser.
const { chromium } = require('playwright');
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

    await open('cube_option_calc');
    await open('flame_calc');
    assert.deepEqual(errors, []);
    console.log('Calculator rules: official cube caps, forced upgrades, all level limits, saved craft settings, trace preservation and mobile checks passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
