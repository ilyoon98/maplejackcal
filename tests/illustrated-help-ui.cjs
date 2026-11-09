'use strict';
// Browser smoke/interaction checks for every walkthrough; no real API or account data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright-core');
const { startServer } = require('../tools/help-capture-lib.cjs');
const root = path.resolve(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'site_help_data.js'), 'utf8'), sandbox);
const data = sandbox.window.SiteHelpData;
const output = path.join(root, 'test-results', 'illustrated-help');

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const server = await startServer();
  let browser;
  const checks = [];
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    for (const width of [1280, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 960 }, locale:'ko-KR', reducedMotion:'reduce' });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== server.base) return route.abort();
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json:{schemaVersion:1,persistent:false,snapshots:[],accounts:[],parties:[]} });
        return route.continue();
      });
      for (const file of [...Object.keys(data), 'shared_boss_rates.html']) {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.setDefaultTimeout(8000);
        try {
          await page.goto(server.base + '/' + file);
          const opener = page.locator('.ux-help-open');
          await opener.focus();
          await page.keyboard.press('Enter');
          const help = page.locator('#uxHelp');
          assert.equal(await help.evaluate(node => node.open), true, file + ' opens');
          if (data[file]) {
            assert.equal(await help.locator('.ux-guide-step').count(), data[file].steps.length, file + ' complete steps');
            assert.equal(await help.locator('.ux-guide-result').count(), 1);
            assert.equal(await help.locator('.ux-guide-details').evaluate(node => node.open), false);
          } else {
            assert.equal(await help.locator('.shared-capture-steps li').count(), 4);
          }
          await help.locator('img').evaluateAll(images => images.forEach(image => image.loading = 'eager'));
          await page.waitForFunction(() => Array.from(document.querySelectorAll('#uxHelp img')).every(image => image.complete && image.naturalWidth > 0));
          const metrics = await help.evaluate(node => ({ width:node.clientWidth, scroll:node.scrollWidth, left:node.getBoundingClientRect().left, right:node.getBoundingClientRect().right }));
          assert(metrics.scroll <= metrics.width + 2, file + ' help horizontal overflow at ' + width + ': ' + JSON.stringify(metrics));
          assert(metrics.left >= -1 && metrics.right <= width + 1, file + ' panel within screen');
          const imageButton = help.locator('.ux-guide-image-button').first();
          await imageButton.click();
          const viewer = page.locator('#uxHelpImage');
          assert.equal(await viewer.evaluate(node => node.open), true);
          await page.waitForFunction(() => document.querySelector('#uxHelpImage img').complete);
          await viewer.locator('button').filter({hasText:'원본 크기'}).click();
          assert.equal(await viewer.locator('[aria-pressed]').getAttribute('aria-pressed'), 'true');
          await page.keyboard.press('Escape');
          assert.equal(await viewer.evaluate(node => node.open), false);
          assert.equal(await help.evaluate(node => node.open), true, 'closing image preserves help');
          assert.equal(await imageButton.evaluate(node => node === document.activeElement), true, 'focus returns to image');
          if (data[file]) {
            await help.locator('.ux-guide-details > summary').click();
            assert.equal(await help.locator('.ux-guide-details').evaluate(node => node.open), true);
          }
          if (['item_craft_calc.html','trade_margin_calc.html','party_boss_scheduler.html','herb_idle.html','shared_boss_rates.html'].includes(file)) {
            await help.evaluate(node => node.scrollTop = 0);
            await page.screenshot({path:path.join(output, file.replace('.html','')+'-'+width+'.png')});
          }
          await page.keyboard.press('Escape');
          assert.equal(await help.evaluate(node => node.open), false);
          assert.equal(await opener.evaluate(node => node === document.activeElement), true, 'focus returns to help opener');
          if (file === 'shared_boss_rates.html') {
            const contextOpener = page.locator('[data-ux-help-trigger]');
            await contextOpener.click();
            assert.equal(await help.evaluate(node => node.open), true);
            const target = page.locator('#shared-capture-guide-section');
            assert.equal(await target.count(), 1, 'original section id is retained');
            await page.keyboard.press('Escape');
            assert.equal(await contextOpener.evaluate(node => node === document.activeElement), true);
          }
          assert.deepEqual(errors, [], file + ' runtime errors');
          checks.push({page:file,width,passed:true});
          console.log('PASS '+width+' '+file);
        } finally { await page.close(); }
      }
      await context.close();
    }
    // Missing image keeps the textual walkthrough usable and prevents an empty viewer.
    const failure = await browser.newPage({viewport:{width:390,height:844}});
    const broken = data['trade_margin_calc.html'].steps.find(step => step.image).image;
    await failure.route('**/'+broken, route => route.abort());
    await failure.goto(server.base+'/trade_margin_calc.html');
    await failure.locator('.ux-help-open').click();
    await failure.waitForFunction(() => !!document.querySelector('.ux-guide-image-error'));
    assert(await failure.locator('.ux-guide-image-error').isDisabled());
    assert(await failure.locator('.ux-guide-step').first().innerText());
    await failure.close();
    // At 200% text zoom, the drawer and enlarged image controls still fit.
    const zoom = await browser.newPage({viewport:{width:390,height:844}});
    await zoom.goto(server.base+'/trade_margin_calc.html');
    await zoom.evaluate(() => document.documentElement.style.fontSize = '200%');
    await zoom.locator('.ux-help-open').click();
    assert(await zoom.locator('#uxHelp').evaluate(node => node.scrollWidth <= node.clientWidth + 2));
    await zoom.locator('.ux-guide-image-button').first().click();
    assert(await zoom.locator('#uxHelpImage').evaluate(node => node.scrollWidth <= node.clientWidth + 2));
    await zoom.screenshot({path:path.join(output,'text-zoom-200.png')});
    await zoom.locator('#uxHelpImage img').evaluate(image => image.src = '/missing-help-image.png');
    await zoom.waitForFunction(() => document.querySelector('.ux-help-image-status').textContent.includes('불러오지 못했습니다'));
    assert(await zoom.locator('#uxHelpImage [aria-pressed]').isDisabled());
    await zoom.keyboard.press('Escape');
    assert(await zoom.locator('#uxHelp').evaluate(node => node.open));
    await zoom.close();
    fs.writeFileSync(path.join(output,'results.json'), JSON.stringify({checks,missingImage:true,viewerImageError:true,textZoom:true},null,2)+'\n');
    console.log('PASS '+checks.length+' page/viewport checks, image-error fallbacks, 200% text zoom');
  } finally { if (browser) await browser.close(); await server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
