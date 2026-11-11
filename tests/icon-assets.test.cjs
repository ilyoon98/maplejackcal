const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const iconRoot = path.join(root, 'icons');
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.md']);
// Scan authored source, not copies or escaped bundles produced by local/deployment builds.
const ignoredDirs = new Set([
  '.git', 'icons', 'references', 'vendor', 'node_modules',
  'public', 'dist', '.wrangler', '.vercel', 'test-results', '.publish-shared', '.reference-chat'
]);
// The upstream boss reward sheets and crystal icons intentionally retain their PNG originals.
// Keep this list explicit so new or accidentally reintroduced PNG icons still fail the audit.
const allowedPngIcons = new Set([
  ...[
    'Baldrix', 'Bellona', 'BlackMage', 'ChosenSeren', 'Damien', 'Dunkel', 'Dusk',
    'GuardianAngelSlime', 'Jupiter', 'Kaling', 'KalosTheGuardian', 'Limbo', 'Lotus',
    'Lucid', 'RadiantMalefic', 'TheFirstAdversary', 'VerusHilla', 'Will'
  ].map(name => 'icons/boss-rewards/' + name + '.png'),
  'icons/home/boss-crystal-monthly.png',
  'icons/home/boss-crystal-weekly.png'
]);

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

test('icons 폴더는 소문자 용도별 폴더와 WebP, 명시한 보스 PNG만 사용한다', () => {
  const expected = ['authentic', 'boss', 'boss-rewards', 'buff', 'coin-shop', 'craft', 'cube', 'home', 'pet', 'prototype', 'seedring', 'server', 'trace'];
  const actual = fs.readdirSync(iconRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  assert.deepEqual(actual, expected);

  const pngs = walk(iconRoot, file => path.extname(file).toLowerCase() === '.png')
    .map(file => path.relative(root, file).split(path.sep).join('/')).sort();
  assert.deepEqual(pngs, [...allowedPngIcons].sort(), '허용 목록의 PNG가 없거나 등록하지 않은 PNG가 있습니다.');
  for (const relative of allowedPngIcons) {
    const bytes = fs.readFileSync(path.join(root, relative));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', relative + ': 올바른 PNG 파일이 아닙니다.');
  }
});

test('코드와 문서에 예전 폴더명이나 허용하지 않은 PNG 아이콘 링크가 없다', () => {
  const files = walk(root, file => textExtensions.has(path.extname(file).toLowerCase()));
  const oldPrefix = /icons[\\/](?:Authentic|CoinShop|Cube|Trace)(?:[\\/]|\b)/;
  const pngIcon = /icons[\\/][^\s"'`()<>]+\.png\b/gi;
  const seedringPngKey = /"(?:Eqp|Use)_[^"]+\.png"/;
  const errors = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    if (oldPrefix.test(source)) errors.push(path.relative(root, file) + ': 예전 아이콘 폴더명');
    for (const match of source.matchAll(pngIcon)) {
      const relative = match[0].replaceAll('\\', '/');
      if (!allowedPngIcons.has(relative)) errors.push(path.relative(root, file) + ': 허용하지 않은 PNG 아이콘 링크 ' + relative);
      else if (!fs.existsSync(path.join(root, relative))) errors.push(path.relative(root, file) + ': 없는 PNG 아이콘 링크 ' + relative);
    }
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
