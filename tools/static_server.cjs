// 로컬 미리보기용 정적 서버. 외부 패키지 없이 저장소 루트를 그대로 띄운다.
// node tools/static_server.cjs  (포트는 PORT 환경 변수, 없으면 8765)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const useLocalAuction = process.argv.includes('--auction');
const port = useLocalAuction ? 8765 : Number(process.env.PORT) || 8765;
const connectionKey = useLocalAuction ? process.env.ACCESSORY_AUCTION_CONNECTION_KEY : undefined;
if (connectionKey && !/^[a-f0-9]{64}$/.test(connectionKey)) throw new Error('Invalid auction connection key');
const localAuction = useLocalAuction
  ? require('../server/local-auction.cjs').createLocalAuction(connectionKey ? Buffer.from(connectionKey, 'hex') : undefined)
  : null;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  if (localAuction && req.headers.host !== '127.0.0.1:8765') {
    res.writeHead(403).end();
    return;
  }
  let rel;
  let url;
  try { url = new URL(req.url, 'http://x'); rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400).end(); return; }
  if (localAuction && ['/api/local-auction/bridge', '/api/accessory-market'].includes(rel)) {
    const task = rel === '/api/accessory-market' ? localAuction.lookup(req, res, url) : localAuction.bridge(req, res);
    task.catch(() => {
      if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      if (!res.writableEnded) res.end(JSON.stringify({ error: 'LOCAL_AUCTION_UPSTREAM' }));
    });
    return;
  }
  if (['/api/scouter','/api/boss-rates','/api/boss-parties','/api/accessory-market'].includes(rel)) {
    Promise.resolve(require('..' + rel + '.js')(req, res)).catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      if (!res.writableEnded) res.end(JSON.stringify({ error: { code: 'SCOUTER_UNAVAILABLE' } }));
    });
    return;
  }
  const segments = rel.split('/');
  if (segments.some(segment => segment.startsWith('.')) || ['node_modules', 'server', 'api', 'tests', 'tools'].includes(segments[1])) { res.writeHead(404).end(); return; }
  const file = path.join(root, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

if (localAuction) {
  server.listen(port, '127.0.0.1', () => {
    const { pageOrigin } = require('../server/local-auction.cjs');
    console.log('장신구 맞추기: ' + pageOrigin + '/accessory_planner.html#auction=' + localAuction.plannerKey);
    console.log('확장 프로그램 연결 키: ' + localAuction.extensionKey);
  });
} else {
  server.listen(port, () => console.log('http://localhost:' + port));
}
