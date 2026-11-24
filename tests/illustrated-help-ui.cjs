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
      for (const file of Object.keys(data)) {
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
          const guide = data[file];
          await page.evaluate(() => document.fonts.ready);
          const details = help.locator('.ux-guide-details');
          if (await details.count()) assert.equal(await details.evaluate(node => node.open), false);
          const tabs = help.getByRole('tab');
          if (guide.tabs) {
            assert.deepEqual(await tabs.allTextContents(), Array.from(guide.tabs, tab => tab.label));
            assert.equal(await tabs.first().getAttribute('aria-selected'), 'true');
            await tabs.first().focus();
            await page.keyboard.press('ArrowRight');
            assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
            await page.keyboard.press('End');
            assert.equal(await tabs.last().getAttribute('aria-selected'), 'true');
            await page.keyboard.press('Home');
            assert.equal(await tabs.first().getAttribute('aria-selected'), 'true');
          }
          for (const [index, group] of (guide.tabs || [guide]).entries()) {
            if (guide.tabs) {
              await tabs.nth(index).click();
              assert.equal(await tabs.nth(index).getAttribute('aria-selected'), 'true');
              assert.equal(await help.getByRole('tabpanel').count(), 1);
            }
            const steps = help.locator('.ux-guide-step:visible');
            assert.equal(await steps.count(), group.steps.length, file + ' complete steps');
            assert.deepEqual(await steps.evaluateAll(rows => rows.map(row => ({
              order: Array.from(row.children, node => node.tagName),
              title: row.querySelector('h3')?.innerText,
              images: row.querySelectorAll('img').length,
              captions: row.querySelectorAll('figcaption').length,
              text: row.querySelector('figcaption')?.innerText
            }))), Array.from(group.steps, (step, stepIndex) => ({
              order: ['H3', 'FIGURE'], title: (stepIndex + 1) + '단계 ' + step.title, images: 1, captions: 1, text: step.text
            })));
            const wrapped = await steps.locator('h3, figcaption').evaluateAll(lines => lines.filter(line => {
              const range = document.createRange();
              range.selectNodeContents(line);
              return range.getClientRects().length > 1;
            }).map(line => line.textContent));
            assert.deepEqual(wrapped, [], file + ' titles and captions fit on one line at ' + width);
            const images = steps.locator('img');
            await images.evaluateAll(nodes => Promise.all(nodes.map(image => {
              image.loading = 'eager';
              return image.decode();
            })));
            if (width === 1280) {
              const missing = await images.evaluateAll(nodes => {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d', { willReadFrequently: true });
                return nodes.filter(image => {
                  canvas.width = image.naturalWidth;
                  canvas.height = image.naturalHeight;
                  context.drawImage(image, 0, 0);
                  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
                  let goldPixels = 0;
                  for (let i = 0; i < data.length; i += 4) {
                    if (data[i] === 255 && data[i + 1] === 216 && data[i + 2] === 102) goldPixels++;
                  }
                  return goldPixels < 60;
                }).map(image => image.getAttribute('src'));
              });
              assert.deepEqual(missing, [], file + ' visible highlight pixels');
            }
            if (guide.tabs && width === 390) {
              await help.evaluate(node => node.scrollTop = 0);
              await page.screenshot({path:path.join(output, file.replace('.html', '') + '-tab-' + (index + 1) + '-390.png')});
            }
          }
          const metrics = await help.evaluate(node => ({ width:node.clientWidth, scroll:node.scrollWidth, left:node.getBoundingClientRect().left, right:node.getBoundingClientRect().right }));
          assert(metrics.scroll <= metrics.width + 2, file + ' help horizontal overflow at ' + width + ': ' + JSON.stringify(metrics));
          assert(metrics.left >= -1 && metrics.right <= width + 1, file + ' panel within screen');
          const imageButton = help.locator('.ux-guide-image-button:visible').first();
          await imageButton.focus();
          await page.keyboard.press('Enter');
          const viewer = page.locator('#uxHelpImage');
          assert.equal(await viewer.evaluate(node => node.open), true);
          await page.waitForFunction(() => document.querySelector('#uxHelpImage img').complete);
          await viewer.locator('button').filter({hasText:'원본 크기'}).click();
          assert.equal(await viewer.locator('[aria-pressed]').getAttribute('aria-pressed'), 'true');
          await page.keyboard.press('Escape');
          assert.equal(await viewer.evaluate(node => node.open), false);
          assert.equal(await help.evaluate(node => node.open), true, 'closing image preserves help');
          assert.equal(await imageButton.evaluate(node => node === document.activeElement), true, 'focus returns to image');
          if (await details.count()) {
            await details.locator(':scope > summary').click();
            assert.equal(await details.evaluate(node => node.open), true);
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
            const target = help.locator('#shared-capture-guide-section');
            assert.equal(await target.count(), 1, 'original section id is retained');
            assert.equal(await target.locator('img').count(), guide.steps.length);
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
    assert.equal(await failure.locator('.ux-guide-step figcaption').first().innerText(), data['trade_margin_calc.html'].steps[0].text);
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
