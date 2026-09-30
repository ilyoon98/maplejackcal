const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const p=await browser.newPage();await p.goto(pathToFileURL(path.resolve(__dirname,'../flame_calc.html')).href);
  await p.locator('#resetAll').click();
  for(const level of [160,150]){
   await p.locator('[data-level-step="-10"]').click();assert.equal(await p.locator('#level').inputValue(),String(level));
  }
  assert.equal(await p.locator('[data-level-step="-10"]').isDisabled(),true);
  for(const [level,value] of [[160,82],[200,142],[250,209]]){
   await p.locator('[data-level-step="10"]').click();assert.equal(await p.locator('#level').inputValue(),String(level));
   assert.equal(await p.locator('[data-total="ATT"]').innerText(),'+'+value);
  }
  assert.equal(await p.locator('[data-level-step="10"]').isDisabled(),true);
  await p.locator('[data-level-step="-10"]').click();
  await p.locator('[data-series="genesis"]').click();
  assert.equal(await p.locator('[data-total="ATT"]').innerText(),'+163');
  await p.locator('#weapon').selectOption('staff');
  assert.equal(await p.locator('[data-total="ATT"]').innerText(),'+195');
  await p.locator('#level').fill('250');await p.locator('#level').press('Tab');
  assert.equal(await p.locator('[data-total="ATT"]').innerText(),'+249');
  await p.locator('#weapon').selectOption('lazuli');
  await p.locator('#weaponReference > summary').click();
  assert.match(await p.locator('#weaponTable').innerText(),/資料|자료 미확인/);
  assert.doesNotMatch(await p.locator('#flameResult').innerText(),/평균 사용량/);
  await p.evaluate(()=>localStorage.setItem('flameCraftCalc',JSON.stringify({level:160,part:'펜던트',mainStat:'INT',flame:'black',flameConds:[{kind:'grade',min:130},{kind:'opt',id:'INT',minTier:6}]})));
  await p.reload();
  const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('flameCraftCalc')));
  assert.equal(saved.part,'장비');assert.equal(saved.mainStat,'STR');assert.equal(saved.level,200);
  assert.equal(saved.flameConds[1].id,'STR');assert.equal(saved.flameConds[0].min,130);
  console.log('Weapon UI: level stepping, tables, 200-level variants, unknown values and migration passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
