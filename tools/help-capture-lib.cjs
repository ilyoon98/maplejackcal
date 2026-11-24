'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');

// Keep the marks inside the image so they are also visible in the enlarged view.
async function highlightedScreenshot(page, boxes, crop, { viewport = false, order = false } = {}) {
  const frame = await page.evaluate(({ boxes, crop, viewport, order }) => {
    const startX = viewport ? scrollX : 0;
    const startY = viewport ? scrollY : 0;
    const left = Math.max(startX, Math.floor(Math.min(...crop.map(box => box.x)) - 10));
    const top = Math.max(startY, Math.floor(Math.min(...crop.map(box => box.y)) - (order ? 16 : 10)));
    const right = Math.min(viewport ? scrollX + innerWidth : document.documentElement.scrollWidth, Math.ceil(Math.max(...crop.map(box => box.x + box.width)) + (order ? 16 : 10)));
    const bottom = Math.min(viewport ? scrollY + innerHeight : document.documentElement.scrollHeight, Math.ceil(Math.max(...crop.map(box => box.y + box.height)) + 10));
    const overlay = document.createElement('div');
    overlay.id = 'help-capture-marks';
    const container = document.querySelector('dialog[open]') || document.body;
    container.append(overlay);
    Object.assign(overlay.style, { position: 'absolute', top: '0', left: '0', width: '0', height: '0', zIndex: '2147483647', pointerEvents: 'none' });
    const origin = overlay.getBoundingClientRect();
    for (const [index, box] of boxes.entries()) {
      const mark = document.createElement('div');
      Object.assign(mark.style, {
        position: 'absolute', boxSizing: 'border-box', left: (box.x - origin.x - scrollX - 3) + 'px',
        top: (box.y - origin.y - scrollY - 3) + 'px', width: (box.width + 6) + 'px', height: (box.height + 6) + 'px',
        border: '3px solid #ffd866', borderRadius: '6px', boxShadow: '0 0 0 1px #111, inset 0 0 0 1px #111'
      });
      if (order) {
        const number = document.createElement('span');
        number.textContent = String(index + 1);
        Object.assign(number.style, {
          position: 'absolute', right: '-10px', top: '-10px', width: '21px', height: '21px', borderRadius: '50%',
          background: '#ffd866', color: '#111', font: '700 14px/21px system-ui', textAlign: 'center', boxShadow: '0 0 0 1px #111'
        });
        mark.append(number);
      }
      overlay.append(mark);
    }
    return { x: left - startX, y: top - startY, width: right - left, height: bottom - top };
  }, { boxes, crop, viewport, order });
  try {
    return await page.screenshot({
      clip: frame, fullPage: !viewport, animations: 'disabled', caret: 'hide',
      style: '.ux-result-dock, .coin-mobile-bar, #toast { visibility:hidden !important; }'
    });
  } finally {
    await page.locator('#help-capture-marks').evaluate(node => node.remove());
  }
}

async function captureBoxes(page, targets) {
  const boxes = [];
  for (const target of targets) {
    const locator = typeof target === 'string' ? page.locator(target) : target;
    await locator.waitFor({ state: 'visible' });
    boxes.push(await locator.evaluate(node => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x: x + scrollX, y: y + scrollY, width, height };
    }));
  }
  return boxes;
}

async function startServer() {
  const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml' };
  const server = http.createServer((req, res) => {
    let target;
    try { target = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
    catch { res.writeHead(400).end(); return; }
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(target, (error, bytes) => {
      if (error) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
      res.end(bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { base: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}

// Every recipe runs in an isolated, empty browser. No real accounts or remote writes.
async function run(group, recipes) {
  const server = process.env.HELP_BASE_URL ? null : await startServer();
  const base = process.env.HELP_BASE_URL || server.base;
  let browser;
  const manifest = [];
  const only = process.env.HELP_PAGE;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    for (const [file, recipe] of Object.entries(recipes)) {
      if (only && file !== only && file !== only + '.html') continue;
      const context = await browser.newContext({ viewport: { width: 500, height: 900 }, deviceScaleFactor: 1.5, locale: 'ko-KR', timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' });
      try {
        await context.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== new URL(base).origin) return route.abort();
          if (url.pathname.startsWith('/api/')) {
            // Recipes can override this route with their own explicitly synthetic fixtures.
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schemaVersion: 1, persistent: false, snapshots: [], accounts: [], parties: [] }) });
          }
          return route.continue();
        });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        if (recipe.prepare) await recipe.prepare(page);
        await page.goto(base + '/' + file, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        const save = (name, buffer, metadata) => {
          if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid capture name: ' + name);
          const output = 'capture-guide/' + file.replace('.html', '') + '/' + name + '.png';
          fs.mkdirSync(path.dirname(path.join(root, output)), { recursive: true });
          fs.writeFileSync(path.join(root, output), buffer);
          const record = { page: file, image: output, ...metadata, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), viewport: page.viewportSize(), example: true };
          manifest.push(record);
          console.log(output + ' ' + record.width + 'x' + record.height);
          return record;
        };
        const shot = async (name, highlights, { crop = highlights, viewport = false, order = false } = {}) => {
          console.log(file + ' → ' + name);
          if (viewport) {
            const first = typeof highlights[0] === 'string' ? page.locator(highlights[0]) : highlights[0];
            await first.scrollIntoViewIfNeeded();
          }
          const boxes = await captureBoxes(page, highlights);
          const frame = crop === highlights ? boxes : [...boxes, ...await captureBoxes(page, crop)];
          const buffer = await highlightedScreenshot(page, boxes, frame, { viewport, order });
          return save(name, buffer, { highlights: highlights.map(String) });
        };
        shot.reference = async (name, source, highlights, crop = highlights) => {
          const reference = await context.newPage();
          try {
            await reference.goto(base + '/' + source);
            const imageWidth = await reference.locator('img').evaluate(async img => {
              await img.decode();
              document.body.style.cssText = 'margin:0;display:block;background:#171a21';
              img.style.cssText = 'display:block;margin:10px;max-width:none;cursor:auto';
              return img.naturalWidth;
            });
            const size = reference.viewportSize();
            if (imageWidth + 20 > size.width) await reference.setViewportSize({ ...size, width: imageWidth + 20 });
            const [origin] = await captureBoxes(reference, ['img']);
            const place = ([x, y, width, height]) => ({ x: origin.x + x, y: origin.y + y, width, height });
            const buffer = await highlightedScreenshot(reference, highlights.map(place), crop.map(place));
            return save(name, buffer, { source, highlights });
          } finally {
            await reference.close();
          }
        };
        await recipe.capture(page, shot);
      } finally { await context.close(); }
    }
    const manifestFile = path.join(root, 'capture-guide', 'manifest-' + group + '.json');
    let entries = manifest;
    if (only && fs.existsSync(manifestFile)) {
      const changed = new Set(manifest.map(row => row.page));
      entries = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).filter(row => !changed.has(row.page)).concat(manifest);
    }
    fs.writeFileSync(manifestFile, JSON.stringify(entries, null, 2) + '\n');
  } finally { if (browser) await browser.close(); if (server) await server.close(); }
}
module.exports = { run, startServer };
