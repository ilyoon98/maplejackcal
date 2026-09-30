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
    await page.goto(pathToFileURL(path.resolve(__dirname, '../item_craft_calc.html')).href);
    await page.locator('#actualUsage').fill('1000000000');
    await page.waitForFunction(() => /^상위 .*\(추정\)$/.test(document.querySelector('#actualPercentile').textContent));
    assert.equal(await page.locator('#actualVerdict').isVisible(), true);
    assert.equal(await page.locator('.actual-input-modes, #actualCount, .actual-record #actualBaseline, .actual-record .actual-hint').count(), 0);
    await page.locator('.ux-help-open').click();
    assert.equal(await page.locator('#uxHelp #actualHint').isVisible(), true);
    await page.getByRole('button', { name: '도움말 닫기' }).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    // All stages disabled: only the known purchase price remains.
    await page.evaluate(() => localStorage.setItem('itemCraftCalc', JSON.stringify({
      base: 100000000, on: { flame: false, star: false, pot: false, addi: false }
    })));
    await page.reload();
    await page.locator('#actualUsage').fill('50000000');
    await page.waitForFunction(() => document.querySelector('#actualPercentile').textContent.includes('0.1% 미만'));
    assert.match(await page.locator('#actualVerdict').innerText(), /5,000만 메소 절약/);
    await page.locator('#actualUsage').fill('100000000');
    await page.waitForFunction(() => document.querySelector('#actualPercentile').textContent === '상위 100% (추정)');
    assert.match(await page.locator('#actualVerdict').innerText(), /같아요/);
    await page.locator('#actualUsage').fill('200000000');
    assert.match(await page.locator('#actualVerdict').innerText(), /1억 메소 초과/);
    await page.locator('#actualUsage').fill('');
    assert.equal(await page.locator('#actualPercentile').innerText(), '');
    assert.equal(await page.locator('#actualVerdict').innerText(), '');

    // A single grade-up stage has a known capped geometric distribution.
    await page.evaluate(() => localStorage.setItem('itemCraftCalc', JSON.stringify({
      base: 0, level: 200, miracle: false,
      on: { flame: false, star: false, pot: true, addi: false },
      pot: { from: 2, to: 3, rows: [] }
    })));
    await page.reload();
    const result = await page.evaluate(async () => {
      const provider = document.querySelector('#resAvg').actualPercentile;
      return { ten: await provider(38250000 * 10), cap: await provider(38250000 * 107) };
    });
    assert.ok(Math.abs(result.ten.percent - (1 - .986 ** 10) * 100) < 2);
    assert.equal(result.cap.percent, 100);
    assert.deepEqual(errors, []);
    console.log('Craft record: meso-only UI, help, fixed costs, grade-up distribution, cap and mobile checks passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
