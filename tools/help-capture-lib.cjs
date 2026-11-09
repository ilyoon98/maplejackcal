'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');

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
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  const manifest = [];
  const only = process.env.HELP_PAGE;
  try {
    for (const [file, recipe] of Object.entries(recipes)) {
      if (only && file !== only && file !== only + '.html') continue;
      const context = await browser.newContext({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1.5, locale: 'ko-KR', timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' });
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
        const shot = async (name, selector, options = {}) => {
          if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid capture name: ' + name);
          const target = page.locator(selector);
          await target.waitFor({ state: 'visible' });
          await target.scrollIntoViewIfNeeded();
          await page.evaluate(() => Promise.all(Array.from(document.images).filter(i => i.complete).map(i => i.decode().catch(() => {}))));
          const output = 'capture-guide/' + file.replace('.html', '') + '/' + name + '.png';
          fs.mkdirSync(path.dirname(path.join(root, output)), { recursive: true });
          const buffer = await target.screenshot({ path: path.join(root, output), animations: 'disabled', caret: 'hide', ...options });
          const record = { page: file, image: output, selector, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), viewport: page.viewportSize(), example: true };
          manifest.push(record);
          console.log(output + ' ' + record.width + 'x' + record.height);
          return record;
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
  } finally { await browser.close(); if (server) await server.close(); }
}
module.exports = { run, startServer };
