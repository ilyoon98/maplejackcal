'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHmac, randomUUID } = require('node:crypto');
const { createLocalAuction, bridgePath, pageOrigin } = require('../server/local-auction.cjs');

test('authenticated bridge carries a same-world sold sample into the planner and rejects unauthenticated requests', async () => {
  const { readSold } = await import('../tools/auction-browser/sales.mjs');
  const secret = Buffer.alloc(32, 7);
  const publications = [];
  const local = createLocalAuction(secret, async snapshot => {
    publications.push(snapshot);
    if (publications.length === 1) throw new Error('Simulated publication failure');
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    void (url.pathname === bridgePath ? local.bridge(req, res) : local.lookup(req, res, url));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const endpoint = base + '/api/accessory-market?' + new URLSearchParams({ world: '베라', slot: 'ring' });
  const sign = value => createHmac('sha256', secret).update(value).digest('hex');
  const bridge = (raw, signature) => fetch(base + bridgePath, {
    method: 'POST', body: raw, headers: { 'X-Auction-Signature': signature }
  });
  const headers = { Origin: pageOrigin, 'Sec-Fetch-Site': 'same-origin', Authorization: 'Bearer ' + local.plannerKey };
  try {
    assert.equal((await fetch(endpoint)).status, 403);
    assert.equal((await fetch(endpoint, { headers })).status, 503);
    assert.equal((await fetch(endpoint, { method: 'POST' })).status, 403);
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...headers, Origin: 'https://example.test' } })).status, 403);
    assert.equal((await bridge('{}', '0'.repeat(64))).status, 401);
    assert.equal((await fetch(endpoint, { method: 'POST', headers })).status, 503);

    const nonce = randomUUID();
    const initial = JSON.stringify({ nonce, at: Date.now() });
    const polls = [0, 1].map(index => bridge(initial, sign('request\n' + initial)).then(response => ({ index, response })));
    // Whichever request arrives first waits for work; the other is rejected immediately.
    const duplicate = await Promise.race(polls);
    assert.equal(duplicate.response.status, 401);
    const lookup = fetch(endpoint, { method: 'POST', headers });
    const { response: command } = await polls[1 - duplicate.index];
    const raw = await command.text();
    assert.equal(command.headers.get('x-auction-signature'), sign(`response\n${nonce}\n${raw}`));
    const { job } = JSON.parse(raw);
    assert.equal(job.world, '베라');
    assert.deepEqual(job.slots, ['ring']);
    assert.equal((await fetch(endpoint, { method: 'POST', headers })).status, 409);

    const sale = (id, price, extra = {}) => ({
      _id: id, itemName: '가디언 엔젤 링', pricePerItem: price, status: 'SOLD', isMyWorld: true,
      tradeDate: new Date(Date.now() - 86400000).toISOString(),
      toolTip: { upgradeInfo: { potential: { entries: [{ text: '아이템 드롭률 +20%' }, { text: '아이템 드롭률 +20%' }] } } },
      ...extra
    });
    let searches = 0;
    let crossWorld;
    const feed = await readSold(job, { fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://api.mskr.nexon.com');
      assert.equal(options.redirect, 'manual');
      if (parsed.pathname === '/v1/accounts') return Response.json({ accounts: [{ accountId: 12 }] });
      if (parsed.pathname === '/v1/accounts/12/gameWorlds/1/characters') return Response.json({ characters: [{ level: 289, characterId: 42 }] });
      assert.match(parsed.pathname, /\/searches\/sold\//);
      if (options.method === 'POST') {
        searches++;
        const body = JSON.parse(options.body);
        assert.equal(body.filters.itemCategory.itemDetailCategory, 'ARMOR_ACCESSORY_RING');
        crossWorld = body.filters.myWorldOnly !== true;
        return Response.json({ hasNext: true, searchKey: 'example-key', items: [sale('a', '1')] });
      }
      if (parsed.searchParams.get('sortType') === 'REGISTER_DATE_DESC') return new Response(null, { status: 400 });
      assert.equal(parsed.searchParams.get('limit'), '20');
      if (crossWorld) return Response.json({ items: [sale('cross', '5800000000', { isMyWorld: false })] });
      return Response.json({
        hasNext: true, items: [
          sale('a', '6000000000'), sale('b', '6800000000'), sale('other', '1', { isMyWorld: false }),
          sale('live', '1', { status: 'ON_SALE' })
        ]
      });
    } });
    assert.equal(searches, 4);
    assert.equal(feed.partial, true);
    assert.equal((await readSold(job, { fetchImpl: async () => new Response(null, { status: 401 }) })
      .catch(error => error.message)), 'LOCAL_AUCTION_LOGIN');
    await assert.rejects(readSold(job, { fetchImpl: async () => ({ type: 'opaqueredirect', status: 0 }) }), {
      message: 'LOCAL_AUCTION_UPSTREAM', detail: '계정 조회 · 옥션 서버가 다른 주소로 응답함'
    });
    const result = JSON.stringify({ nonce: randomUUID(), at: Date.now(), result: { id: job.id, feed } });
    const sent = bridge(result, sign('request\n' + result));
    const response = await lookup;
    const snapshot = await response.json();
    assert.equal(response.status, 200);
    assert.equal(snapshot.partial, true);
    assert.deepEqual(snapshot.quotes, [
      { slot: 'ring', drop: 40, meso: 0, itemName: '가디언 엔젤 링', priceMeso: '6400000000', count: 2 },
      { slot: 'ring', drop: 40, meso: 0, itemName: '가디언 엔젤 링', priceMeso: '5800000000', count: 1, scope: 'cross' }
    ]);
    assert.equal(snapshot.publication, 'failed');
    const retry = await (await fetch(endpoint, { method: 'POST', headers })).json();
    assert.deepEqual(retry, { ...snapshot, publication: 'published' });
    assert.deepEqual(publications, Array.from({ length: 2 }, () => ({
      world: '베라', asOf: snapshot.asOf, slots: ['ring'], partial: true, quotes: snapshot.quotes
    })));
    assert.equal((await fetch(endpoint)).status, 403);
    assert.deepEqual(await (await fetch(endpoint, { headers })).json(), retry);
    server.closeAllConnections();
    await sent.catch(() => {});
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
