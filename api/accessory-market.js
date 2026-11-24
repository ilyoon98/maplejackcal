'use strict';

const { timingSafeEqual } = require('node:crypto');
const { createMarketStore, normalizeSnapshot, slotTypes, supportedRates, validWorld, windowDays, windowMs } = require('../server/accessory-market-store.cjs');

function summarize(feed, world, now) {
  const asOf = Date.parse(feed?.asOf);
  if (typeof feed?.source !== 'string' || !feed.source.trim() || !Array.isArray(feed.sales)
      || !Number.isFinite(asOf) || asOf > now) throw new Error('Invalid market feed');

  const groups = new Map();
  const seen = new Set();
  for (const sale of feed.sales) {
    if (sale?.world !== world || typeof sale.id !== 'string' || !sale.id || seen.has(sale.id)) continue;
    const { slot, drop, meso, priceMeso } = sale;
    const itemName = typeof sale.itemName === 'string' ? sale.itemName.trim() : '';
    const soldAt = Date.parse(sale.soldAt);
    if (!itemName || itemName.length > 100 || !slotTypes.has(slot) || !supportedRates.has(drop) || !supportedRates.has(meso)
        || drop + meso === 0 || drop + meso > 40 || !Number.isFinite(soldAt)
        || soldAt < now - windowMs || soldAt > asOf
        || typeof priceMeso !== 'string' || !/^[1-9]\d{0,23}$/.test(priceMeso)) continue;

    seen.add(sale.id);
    const scope = sale.scope === 'cross' ? 'cross' : undefined;
    const key = JSON.stringify([slot, drop, meso, itemName, scope]);
    if (!groups.has(key)) groups.set(key, { slot, drop, meso, itemName, ...(scope ? { scope } : {}), prices: [] });
    groups.get(key).prices.push(BigInt(priceMeso));
  }
  const quotes = Array.from(groups.values(), ({ prices, ...option }) => {
    prices.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const middle = Math.floor(prices.length / 2);
    const median = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle] + 1n) / 2n;
    return { ...option, priceMeso: String(median), count: prices.length };
  });
  return { world, windowDays, asOf: new Date(asOf).toISOString(), source: feed.source.trim(), quotes };
}

function authorized(req, token) {
  if (!token || token.length < 32) return false;
  const expected = Buffer.from('Bearer ' + token);
  const supplied = Buffer.from(String(req.headers?.authorization || ''));
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function readSnapshot(req) {
  const maxBytes = 1024 * 1024;
  let raw = '';
  if (req.body !== undefined) {
    if (typeof req.body === 'string') raw = req.body;
    else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
    else raw = JSON.stringify(req.body);
  } else {
    req.setEncoding('utf8');
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > maxBytes) return null;
    }
  }
  if (Buffer.byteLength(raw) > maxBytes) return null;
  try { return normalizeSnapshot(JSON.parse(raw)); } catch { return null; }
}

function createHandler(env = process.env, fetchFeed = fetch, getStore = () => createMarketStore(env)) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET') res.setHeader('Access-Control-Allow-Origin', '*');
    const reply = (status, body) => {
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };

    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return reply(405, { error: 'METHOD_NOT_ALLOWED' });
    }
    if (req.method === 'POST' && !authorized(req, env.ACCESSORY_MARKET_PUBLISH_TOKEN)) {
      return reply(403, { error: 'MARKET_PUBLISH_FORBIDDEN' });
    }
    const world = new URL(req.url, 'http://localhost').searchParams.get('world')?.trim();
    if (req.method === 'GET' && !validWorld(world)) return reply(400, { error: 'WORLD_REQUIRED' });

    try {
      const store = getStore();
      if (req.method === 'POST') {
        if (!store) return reply(503, { error: 'MARKET_NOT_CONFIGURED' });
        const snapshot = await readSnapshot(req);
        if (!snapshot) return reply(400, { error: 'MARKET_INVALID_SNAPSHOT' });
        await store.save(snapshot);
        return reply(200, { published: true });
      }
      if (store) {
        const published = await store.read(world);
        if (published) {
          res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
          return reply(200, published);
        }
      }
      if (!env.ACCESSORY_MARKET_FEED_URL) {
        return store ? reply(200, { world, quotes: [], windowDays, asOf: null }) : reply(503, { error: 'MARKET_NOT_CONFIGURED' });
      }
      const upstream = new URL(env.ACCESSORY_MARKET_FEED_URL);
      if (upstream.protocol !== 'https:') throw new Error('HTTPS required');
      const headers = { Accept: 'application/json' };
      if (env.ACCESSORY_MARKET_FEED_TOKEN) headers.Authorization = 'Bearer ' + env.ACCESSORY_MARKET_FEED_TOKEN;
      const response = await fetchFeed(upstream, { headers, redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Market feed request failed');
      const result = summarize(await response.json(), world, Date.now());
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
      return reply(200, result);
    } catch {
      return reply(503, { error: 'MARKET_UNAVAILABLE' });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.summarize = summarize;
