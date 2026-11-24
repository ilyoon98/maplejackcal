'use strict';

const { redisCommand } = require('./rate-store.cjs');

const slotTypes = new Set(['ring', 'face', 'eye', 'pendant', 'earring']);
const supportedRates = new Set([0, 20, 40]);
const windowDays = 30;
const windowMs = windowDays * 86400000;
const sharedSource = '메이플 옥션 판매완료';
const validWorld = world => typeof world === 'string' && /^[\p{L}\p{N} ]{1,24}$/u.test(world);

// One atomic compare-and-write for all the slots sampled together.
const write = `
for i = 2, #ARGV, 2 do
  local old = redis.call('HGET', KEYS[1], ARGV[i])
  if not old or cjson.decode(old).asOf < ARGV[1] then
    redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1])
  end
end
return 1`;

function normalizeSnapshot(raw, now = Date.now()) {
  if (!validWorld(raw?.world) || typeof raw.asOf !== 'string') return null;
  const asOf = Date.parse(raw.asOf);
  if (!Number.isFinite(asOf) || asOf > now || asOf <= now - windowMs
      || !Array.isArray(raw.slots) || !raw.slots.length || raw.slots.length > slotTypes.size
      || !raw.slots.every(slot => slotTypes.has(slot)) || new Set(raw.slots).size !== raw.slots.length
      || !Array.isArray(raw.quotes) || raw.quotes.length > 3600) return null;

  const seen = new Set();
  const quotes = [];
  for (const row of raw.quotes) {
    const { slot, itemName, drop, meso, priceMeso, count, scope } = row || {};
    if (!raw.slots.includes(slot) || typeof itemName !== 'string' || !itemName.trim() || itemName.length > 100
        || !supportedRates.has(drop) || !supportedRates.has(meso) || drop + meso === 0 || drop + meso > 40
        || typeof priceMeso !== 'string' || !/^[1-9]\d{0,23}$/.test(priceMeso)
        || !Number.isSafeInteger(count) || count < 1 || count > 360
        || (scope !== undefined && scope !== 'cross')) return null;
    const name = itemName.trim();
    const key = JSON.stringify([slot, name, drop, meso, scope]);
    if (seen.has(key)) return null;
    seen.add(key);
    quotes.push({ slot, itemName: name, drop, meso, priceMeso, count, ...(scope ? { scope } : {}) });
  }
  return { world: raw.world, asOf: new Date(asOf).toISOString(), slots: raw.slots, partial: raw.partial === true, quotes };
}

function createMarketStore(env, command = redisCommand(env)) {
  if (!command) return null;
  const prefix = 'maplejackcal:accessory-market:v1:' + (env.VERCEL_ENV === 'preview' ? 'preview:' : '');
  return {
    async read(world, now = Date.now()) {
      const records = await command(['HMGET', prefix + world, ...slotTypes]);
      const snapshots = records.filter(Boolean).map(record => JSON.parse(record))
        .filter(snapshot => Date.parse(snapshot.asOf) > now - windowMs);
      if (!snapshots.length) return null;
      return {
        world, windowDays, source: sharedSource,
        asOf: snapshots.map(snapshot => snapshot.asOf).sort()[0],
        slots: snapshots.map(snapshot => snapshot.slot),
        partial: snapshots.some(snapshot => snapshot.partial),
        quotes: snapshots.flatMap(snapshot => snapshot.quotes)
      };
    },
    async save(snapshot) {
      const fields = snapshot.slots.flatMap(slot => [
        slot, JSON.stringify({
          slot, asOf: snapshot.asOf, partial: snapshot.partial,
          quotes: snapshot.quotes.filter(quote => quote.slot === slot)
        })
      ]);
      await command(['EVAL', write, 1, prefix + snapshot.world, snapshot.asOf, ...fields]);
    }
  };
}

module.exports = { createMarketStore, normalizeSnapshot, slotTypes, supportedRates, validWorld, windowDays, windowMs };
