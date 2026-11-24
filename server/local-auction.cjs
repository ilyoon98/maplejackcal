'use strict';

const { createHmac, randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { summarize } = require('../api/accessory-market.js');
const { normalizeSnapshot, slotTypes, validWorld } = require('./accessory-market-store.cjs');
const bridgePath = '/api/local-auction/bridge';
const pageOrigin = 'http://127.0.0.1:8765';
const errors = new Set(['LOCAL_AUCTION_LOGIN', 'LOCAL_AUCTION_WORLD', 'LOCAL_AUCTION_LIMIT', 'LOCAL_AUCTION_UPSTREAM']);
const diagnostic = /^(계정 조회|월드 캐릭터 조회|판매완료 검색|판매완료 다음 페이지) · (HTTP [1-5]\d{2}|시간 초과|네트워크 요청 실패|응답 형식 오류|거래 목록 형식 오류|검색 키 형식 오류|옥션 서버가 다른 주소로 응답함|Chrome에서 옥션 API 사이트 접근이 허용되지 않음)$/;
const lifetime = 30000;

function createPublisher(env = process.env, fetchImpl = fetch) {
  const { ACCESSORY_MARKET_PUBLISH_URL: origin, ACCESSORY_MARKET_PUBLISH_TOKEN: token } = env;
  if (!origin && !token) return null;
  if (!origin || !token || token.length < 32) throw new Error('Configure the market publish URL and token together');
  const target = new URL(origin);
  if (target.protocol !== 'https:' || target.username || target.password || target.origin !== origin.replace(/\/$/, '')) {
    throw new Error('Set the market publish URL to the HTTPS site origin');
  }
  return async snapshot => {
    const response = await fetchImpl(new URL('/api/accessory-market', target), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(snapshot)
    });
    if (!response.ok || (await response.json()).published !== true) throw new Error('MARKET_PUBLISH_FAILED');
  };
}

function createLocalAuction(secret = randomBytes(32), publish = createPublisher()) {
  const sign = message => createHmac('sha256', secret).update(message).digest('hex');
  const plannerKey = sign('planner');
  const replay = new Map();
  const cache = new Map();
  let connectedAt = 0;
  let pending;
  let poll;

  function matches(actual, expected) {
    return typeof actual === 'string' && /^[a-f0-9]{64}$/.test(actual)
      && timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  }

  function reply(res, code, body) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  async function bridge(req, res) {
    if (req.method !== 'POST') return reply(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    let body;
    try {
      const parts = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) return reply(res, 413, { error: 'BODY_TOO_LARGE' });
        parts.push(chunk);
      }
      const raw = Buffer.concat(parts).toString('utf8');
      if (!matches(req.headers['x-auction-signature'], sign('request\n' + raw))) return reply(res, 401, { error: 'AUTH_REQUIRED' });
      body = JSON.parse(raw);
      if (!Number.isSafeInteger(body.at) || Math.abs(Date.now() - body.at) >= lifetime
          || typeof body.nonce !== 'string' || !/^[a-f0-9-]{36}$/.test(body.nonce)) return reply(res, 401, { error: 'AUTH_EXPIRED' });
      for (const [nonce, expiry] of replay) if (expiry <= Date.now()) replay.delete(nonce);
      if (replay.has(body.nonce)) return reply(res, 401, { error: 'REPLAY' });
      replay.set(body.nonce, Date.now() + lifetime * 2);
    } catch {
      return reply(res, 400, { error: 'INVALID_REQUEST' });
    }
    connectedAt = Date.now();
    if (pending && pending.id === body.result?.id && pending.sent) {
      pending.finish(body.result);
    }
    if (poll) poll(null);
    function send(job) {
      const text = JSON.stringify({ job });
      res.writeHead(200, {
        'Content-Type': 'application/json', 'Cache-Control': 'no-store',
        'X-Auction-Signature': sign(`response\n${body.nonce}\n${text}`)
      });
      res.end(text);
    }
    if (pending && !pending.sent) {
      pending.sent = true;
      send(pending.job);
      return;
    }
    const done = job => {
      clearTimeout(timer);
      if (poll === done) poll = null;
      if (!res.destroyed) send(job);
    };
    const timer = setTimeout(() => done(null), 10000);
    poll = done;
    res.on('close', () => {
      clearTimeout(timer);
      if (poll === done) poll = null;
    });
  }

  async function lookup(req, res, url) {
    const world = url.searchParams.get('world')?.trim();
    if (!validWorld(world)) return reply(res, 400, { error: 'WORLD_REQUIRED' });
    if (!['GET', 'POST'].includes(req.method)) return reply(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (req.headers['sec-fetch-site'] !== 'same-origin' || !matches(token, plannerKey)
        || (req.method === 'POST' && req.headers.origin !== pageOrigin)) {
      return reply(res, 403, { error: 'LOCAL_AUCTION_KEY' });
    }
    if (req.method === 'GET') {
      const existing = cache.get(world);
      return existing ? reply(res, 200, existing) : reply(res, 503, { error: 'LOCAL_AUCTION_REFRESH' });
    }
    const slots = [...new Set(url.searchParams.getAll('slot'))];
    if (!slots.length || slots.some(slot => !slotTypes.has(slot))) return reply(res, 400, { error: 'LOCAL_AUCTION_SCOPE' });
    if (pending) return reply(res, 409, { error: 'LOCAL_AUCTION_BUSY' });
    const previous = cache.get(world);
    if (publish && previous?.publication === 'failed' && normalizeSnapshot(previous)
        && slots.length === previous.slots.length && slots.every(slot => previous.slots.includes(slot))) {
      return reply(res, 200, await publishSnapshot(previous));
    }
    if (Date.now() - connectedAt > 20000) return reply(res, 503, { error: 'LOCAL_AUCTION_DISCONNECTED' });
    const id = randomUUID();
    const result = await new Promise(resolve => {
      const timer = setTimeout(() => pending?.finish({ error: 'LOCAL_AUCTION_TIMEOUT' }), 110000);
      const job = { id, world, slots };
      pending = {
        id, job, sent: Boolean(poll),
        finish(value) { clearTimeout(timer); pending = null; resolve(value); }
      };
      if (poll) poll(job);
    });
    if (result.error) {
      const error = errors.has(result.error) || result.error === 'LOCAL_AUCTION_TIMEOUT' ? result.error : 'LOCAL_AUCTION_UPSTREAM';
      const detail = typeof result.detail === 'string' && diagnostic.test(result.detail) ? result.detail : undefined;
      return reply(res, 503, { error, detail });
    }
    if (result.feed?.world !== world || !Array.isArray(result.feed.sales)) return reply(res, 503, { error: 'LOCAL_AUCTION_UPSTREAM' });
    const now = Date.now();
    const data = summarize({
      source: '내 브라우저의 메이플 옥션', asOf: new Date(now).toISOString(),
      sales: result.feed.sales.filter(sale => slots.includes(sale?.slot))
    }, world, now);
    const returned = Number.isSafeInteger(result.feed.returned) ? result.feed.returned : undefined;
    const snapshot = { ...data, slots, partial: result.feed.partial === true, returned };
    return reply(res, 200, await publishSnapshot(snapshot));
  }

  async function publishSnapshot(snapshot) {
    if (publish) {
      const payload = normalizeSnapshot(snapshot);
      snapshot.publication = 'failed';
      if (payload) {
        try {
          await publish(payload);
          snapshot.publication = 'published';
        } catch {
          // Keep the local result for a publishing retry without another auction search.
        }
      }
    }
    const previous = cache.get(snapshot.world);
    if (!previous || previous.asOf <= snapshot.asOf) cache.set(snapshot.world, snapshot);
    return snapshot;
  }

  return { bridge, lookup, extensionKey: secret.toString('hex'), plannerKey };
}

module.exports = { createLocalAuction, createPublisher, bridgePath, pageOrigin };
