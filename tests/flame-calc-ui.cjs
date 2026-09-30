// Run with Playwright on NODE_PATH and installed Edge.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1280,height:1000}}), errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(pathToFileURL(path.resolve(__dirname,'../flame_calc.html')).href);
  await p.locator('#resetAll').click();
  assert.match(await p.locator('#flameResult').innerText(),/54,807,692/);
  assert.equal(await p.locator('#mesoCost,[data-payment],#weaponSeries,#ruleNote,#weaponNote,#mainStat').count(),0);
  assert.equal(await p.locator('#part option').count(),2);
  assert.equal(await p.locator('.fc-chance').count(),4);
  assert.deepEqual(await p.locator('.fc-flame').evaluateAll(xs=>xs.map(x=>x.dataset.flame)),['abyss','black','burning']);
  assert.ok(await p.locator('.fc-flame img').evaluateAll(xs=>xs.every(x=>x.complete&&x.naturalWidth>0)));
  assert.equal(await p.locator('#weaponTable').isVisible(),false);
  await p.locator('#weaponReference > summary').click();
  assert.equal(await p.locator('#weaponTable').isVisible(),true);
  await p.locator('#weaponReference > summary').click();
  await p.locator('[data-tier="7"]').click();
  await p.locator('[data-flame="burning"]').click();
  assert.match(await p.locator('#flameResult').innerText(),/달성할 수 없는/);
  await p.locator('#resetAll').click();
  await p.locator('#part').selectOption('장비');
  await p.locator('input[data-cond]').fill('130');
  await p.locator('input[data-cond]').press('Tab');
  await p.locator('[data-addflame="ATT"]').click();
  assert.equal(await p.locator('#remainingGrade').innerText(),'106급 이상');
  await p.locator('[data-addflame="ALL_PCT"]').click();
  assert.equal(await p.locator('#remainingGrade').innerText(),'46급 이상');
  for(const flame of ['abyss','burning','black']){
   await p.locator('[data-flame="'+flame+'"]').click();
   assert.equal(await p.locator('input[data-cond]').inputValue(),'130');
  }
  await p.locator('#level').fill('160');await p.locator('#level').press('Tab');
  assert.equal(await p.locator('input[data-cond]').inputValue(),'130');
  assert.deepEqual(await p.locator('input[data-required]').evaluateAll(xs=>xs.map(x=>x.value)),['6','6']);
  await p.reload();
  assert.equal(await p.locator('#level').inputValue(),'200');
  assert.equal(await p.locator('input[data-cond]').inputValue(),'130');
  for(const width of [390,320]){
   await p.setViewportSize({width,height:844});
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.equal(await p.locator('.fc-flame').evaluateAll(xs=>new Set(xs.map(x=>Math.round(x.getBoundingClientRect().top))).size),1);
  }
  await p.locator('#part').selectOption('무기');
  assert.equal(await p.locator('input[data-cond]').count(),0);
  await p.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await p.locator('a.tool-card[href="flame_calc.html"]').click();
  await p.locator('.site-tab[data-group="calc"]').click();
  assert.equal(await p.locator('.site-menu-item[href="flame_calc.html"]').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log('Flame UI: fixed cost, required options, persistence, collapsed table, mobile and navigation passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
