const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const iconRoot = path.join(root, 'icons');
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.md']);
const ignoredDirs = new Set(['.git', 'icons', 'references', 'vendor', 'node_modules']);

function walk(dir, filter) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) found.push(...walk(full, filter));
    } else if (filter(full)) {
      found.push(full);
    }
  }
  return found;
}

test('icons 폴더는 소문자 용도별 폴더와 WebP만 사용한다', () => {
  const expected = ['authentic', 'boss', 'coin-shop', 'craft', 'cube', 'prototype', 'seedring', 'server', 'trace'];
  const actual = fs.readdirSync(iconRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  assert.deepEqual(actual, expected);

  const pngs = walk(iconRoot, file => path.extname(file).toLowerCase() === '.png');
  assert.deepEqual(pngs, [], 'icons 아래 PNG가 남아 있습니다.');
});

test('코드와 문서에 남은 예전 폴더명이나 PNG 아이콘 링크가 없다', () => {
  const files = walk(root, file => textExtensions.has(path.extname(file).toLowerCase()));
  const oldPrefix = /icons[\\/](?:Authentic|CoinShop|Cube|Trace)(?:[\\/]|\b)/;
  const pngIcon = /icons[\\/][^\s"'`()<>]+\.png\b/i;
  const seedringPngKey = /"(?:Eqp|Use)_[^"]+\.png"/;
  const errors = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    if (oldPrefix.test(source)) errors.push(path.relative(root, file) + ': 예전 아이콘 폴더명');
    if (pngIcon.test(source)) errors.push(path.relative(root, file) + ': PNG 아이콘 링크');
    if (path.basename(file) === 'seedring_gacha.html' && seedringPngKey.test(source)) {
      errors.push(path.relative(root, file) + ': PNG 시드링 키');
    }
  }

  assert.deepEqual(errors, []);
});

test('소스에 적힌 정적 WebP 아이콘 링크가 모두 존재한다', () => {
  const files = walk(root, file => textExtensions.has(path.extname(file).toLowerCase()));
  const missing = [];
  const literalIcon = /icons\/[^\s"'`()<>]+\.webp\b/g;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(literalIcon)) {
      if (match[0].includes('${') || match[0].includes('+')) continue;
      let relative = match[0].replaceAll('/', path.sep);
      try { relative = decodeURIComponent(relative); } catch (_) {}
      if (!fs.existsSync(path.join(root, relative))) {
        missing.push(path.relative(root, file) + ': ' + match[0]);
      }
    }
  }

  assert.deepEqual(missing, []);
});
