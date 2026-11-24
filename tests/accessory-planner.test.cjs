'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { startServer } = require('../tools/help-capture-lib.cjs');
const { createHandler } = require('../api/accessory-market.js');
const { createMarketStore } = require('../server/accessory-market-store.cjs');
const { createPublisher } = require('../server/local-auction.cjs');

const world = '베라';
const query = '/api/accessory-market?' + new URLSearchParams({ world });

function marketFeed() {
  const now = Date.now();
  const sale = (id, priceMeso, overrides = {}) => ({
    id, world, slot: 'ring', itemName: '가디언 엔젤 링', drop: 40, meso: 0, priceMeso,
    soldAt: new Date(now - 86400000).toISOString(), ...overrides
  });
  return {
    source: '테스트 시세', asOf: new Date(now).toISOString(),
    sales: [
      sale('a', '6200000000'), sale('b', '6600000000'), sale('b', '1'),
      sale('c', '6822220000', { itemName: '고귀한 이피아의 반지' }),
      sale('d', '6888880000', { itemName: '실버블라썸 링' }),
      sale('other-world', '1', { world: '루나' }),
      sale('older', '1', { soldAt: new Date(now - 31 * 86400000).toISOString() }),
      sale('future', '1', { soldAt: new Date(now + 10000).toISOString() }),
      sale('face', '4100000000', { slot: 'face', itemName: '샤이니 레드 매지션 마이스터 심볼', drop: 20, meso: 20 })
    ]
  };
}

async function callMarket(handler, url = query, request = {}) {
  let body;
  const res = { setHeader() {}, end(value) { body = JSON.parse(value); } };
  await handler({ method: 'GET', url, ...request }, res);
  return { status: res.statusCode, body };
}

const configuredMarket = (feed = marketFeed()) => createHandler({ ACCESSORY_MARKET_FEED_URL: 'https://example.com/sales' },
  async () => Response.json(feed));

function sharedMarket() {
  const env = { ACCESSORY_MARKET_PUBLISH_URL: 'https://example.test', ACCESSORY_MARKET_PUBLISH_TOKEN: 'x'.repeat(32) };
  const records = new Map();
  const store = createMarketStore(env, async ([command, ...args]) => {
    if (command === 'HMGET') {
      const [key, ...slots] = args;
      return slots.map(slot => records.get(key)?.get(slot) ?? null);
    }
    assert.equal(command, 'EVAL');
    const [, keyCount, key, asOf, ...fields] = args;
    assert.equal(keyCount, 1);
    if (!records.has(key)) records.set(key, new Map());
    const worldRecords = records.get(key);
    for (let index = 0; index < fields.length; index += 2) {
      const [slot, value] = fields.slice(index, index + 2);
      const previous = worldRecords.get(slot);
      if (!previous || JSON.parse(previous).asOf < asOf) worldRecords.set(slot, value);
    }
    return 1;
  });
  const handler = createHandler(env, fetch, () => store);
  const publish = createPublisher(env, async (url, { headers, method, body, redirect }) => {
    assert.equal(url.href, 'https://example.test/api/accessory-market');
    assert.equal(redirect, 'error');
    const result = await callMarket(handler, url.href, { method, headers: { authorization: headers.Authorization }, body });
    return Response.json(result.body, { status: result.status });
  });
  return { handler, publish, records };
}

test('only authenticated publication updates the shared world and slot summaries', async () => {
  const { handler, publish, records } = sharedMarket();
  const feed = { ...marketFeed(), asOf: new Date(Date.now() - 1000).toISOString() };
  const { body: original } = await callMarket(configuredMarket(feed));
  assert.equal((await callMarket(handler, query, { method: 'POST', body: original })).status, 403);
  await publish({ ...original, slots: ['ring', 'face'], partial: true, sales: ['private sample'], session: 'private session' });
  const ringQuotes = original.quotes.filter(row => row.slot === 'ring');
  const newer = { ...original, asOf: new Date().toISOString(), slots: ['ring'], quotes: ringQuotes.slice(0, 1), partial: false };
  await publish(newer);
  await publish({ ...newer, asOf: new Date(Date.parse(original.asOf) - 1000).toISOString(), quotes: [] });
  const { status, body } = await callMarket(handler);
  assert.equal(status, 200);
  assert.deepEqual(body.slots, ['ring', 'face']);
  assert.deepEqual(body.quotes, [ringQuotes[0], original.quotes.at(-1)]);
  assert.equal(body.asOf, original.asOf);
  assert.equal(body.partial, true);
  assert.doesNotMatch(JSON.stringify([...records.values()].flatMap(fields => [...fields.values()])), /private|sales|session/);
  const { body: empty } = await callMarket(handler, '/api/accessory-market?' + new URLSearchParams({ world: '루나' }));
  assert.equal(empty.asOf, null);
  assert.deepEqual(empty.quotes, []);
});

test('market estimates use the world, completed-trade period and unique sample IDs', async () => {
  const { status, body } = await callMarket(configuredMarket());
  assert.equal(status, 200);
  assert.equal(body.windowDays, 30);
  assert.deepEqual(body.quotes, [
    { slot: 'ring', itemName: '가디언 엔젤 링', drop: 40, meso: 0, priceMeso: '6400000000', count: 2 },
    { slot: 'ring', itemName: '고귀한 이피아의 반지', drop: 40, meso: 0, priceMeso: '6822220000', count: 1 },
    { slot: 'ring', itemName: '실버블라썸 링', drop: 40, meso: 0, priceMeso: '6888880000', count: 1 },
    { slot: 'face', itemName: '샤이니 레드 매지션 마이스터 심볼', drop: 20, meso: 20, priceMeso: '4100000000', count: 1 }
  ]);
  assert.deepEqual(await callMarket(createHandler({})), {
    status: 503, body: { error: 'MARKET_NOT_CONFIGURED' }
  });
});

// Public ItemPrice character lookup supplied the preset 2 slots and relevant option strings.
// Requests and market samples are simulated.
function presetTwo() {
  const drop = '아이템 드롭률 +20%';
  const meso = '메소 획득량 +20%';
  const item = (item_equipment_slot, item_name, potential_option_1, potential_option_2, potential_option_3) =>
    ({ item_equipment_slot, item_name, item_icon: 'https://open.api.nexon.com/static/maplestory/test.png',
      potential_option_1, potential_option_2, potential_option_3 });
  return [
    item('반지1', '글로리온 링 : 슈프림', drop), item('반지2', '이터널 플레임 링', drop),
    item('반지3', '어웨이크 링', drop), item('반지4', '테네브리스 원정대 반지', drop),
    item('얼굴장식', '레드 매지션 마이스터 심볼', meso, meso),
    item('눈장식', '미카엘라의 새 안경', meso, meso),
    item('펜던트', '그리드 펜던트', 'DEX +12%', 'STR +9%', drop), item('펜던트2', '혼테일의 목걸이', meso),
    item('귀고리', '하프 이어링', drop, drop)
  ];
}

test('형아의소환수 preset 2 preserves locks and uses manual prices after a saved market selection', async () => {
  const server = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error));
    await page.addInitScript(() => localStorage.setItem('nxopen_api_key', 'test-nexon-key'));
    const localOrigin = 'http://127.0.0.1:8765';
    await page.route(localOrigin + '/**', async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: server.base + url.pathname + url.search });
      await route.fulfill({ response });
    });
    await page.route('https://open.api.nexon.com/maplestory/v1/**', async route => {
      const url = new URL(route.request().url());
      assert.equal(route.request().headers()['x-nxopen-api-key'], 'test-nexon-key');
      let json;
      if (url.pathname.endsWith('/id')) {
        if (url.searchParams.get('character_name') !== '형아의소환수') {
          return route.fulfill({ status: 400, json: { error: { name: 'OPENAPI00004' } } });
        }
        json = { ocid: 'preset-test' };
      } else if (url.pathname.endsWith('/basic')) {
        json = { character_name: '형아의소환수', world_name: world };
      } else {
        json = { preset_no: 1, item_equipment_preset_1: presetTwo().slice(0, 1),
          item_equipment_preset_2: presetTwo(), item_equipment_preset_3: [] };
      }
      await route.fulfill({ json });
    });
    let marketRequests = 0;
    await page.route('**/api/accessory-market?*', route => {
      marketRequests++;
      return route.abort();
    });
    await page.goto(localOrigin + '/accessory_planner.html');
    const expectText = (selector, text) => page.locator(selector).filter({ hasText: text }).waitFor({ state: 'visible' });
    await page.getByLabel('캐릭터 닉네임').fill('형아의소환수');
    await page.getByLabel('캐릭터 닉네임').press('Enter');
    const presets = page.getByLabel('장비 프리셋');
    await presets.selectOption('1');
    assert.notEqual(await presets.evaluate(select => getComputedStyle(select).backgroundImage), 'none');
    await expectText('#accessory-preset-summary', '프리셋 드랍 140% · 메획 100%');
    const pendant = page.locator('#accessory-slots [data-slot="6"]');
    await pendant.press('Enter');
    assert.equal(await pendant.locator('img').isVisible(), true);
    await expectText('#accessory-equipped-name', '그리드 펜던트');
    await expectText('#accessory-equipped-stats', '드랍 20% · 메획 0%');
    await expectText('#accessory-equipped-grid', '장비 아이템 드랍 +20% 별도');
    const all = page.getByLabel('장비 모두 유지');
    await all.focus();
    await page.keyboard.press('Space');
    await expectText('#accessory-result-status', '현재 고정한 장비로는 목표를 달성할 수 없습니다');
    for (const slot of [0, 1, 2]) {
      await page.locator(`#accessory-slots [data-slot="${slot}"]`).click();
      await page.getByRole('checkbox', { name: '이 장비 유지' }).uncheck();
    }
    assert.equal(await all.evaluate(input => input.indeterminate), true);

    for (const [index, value] of ['62.2', '76.7', '78.9'].entries()) {
      await page.locator(`#accessory-slots [data-slot="${index}"]`).click();
      await page.locator('#accessory-prices input').nth(2).fill(value);
    }
    await expectText('#accessory-result-status', '217억 8000만 메소');
    await page.locator('#accessory-result-details summary').press('Enter');
    await expectText('#accessory-result-rows', '그리드 펜던트');
    await expectText('#accessory-goal-summary', '장비 아이템 드랍 +20% 별도');
    await page.reload();
    await expectText('#accessory-preset-summary', '유지 6부위');
    await expectText('#accessory-result-status', '217억 8000만 메소');

    await page.evaluate(() => localStorage.setItem('accessoryPlanner.pricing.v1', JSON.stringify(['market', true, '베라'])));
    await page.reload();
    await expectText('#accessory-result-status', '217억 8000만 메소');
    const prefer = page.getByLabel('가격보다 선호 옵션 우선');
    assert.equal(await prefer.isChecked(), true);
    await prefer.uncheck();
    assert.equal(await page.getByLabel('구매 가격 기준').count(), 0);
    assert.equal(await page.locator('#accessory-prices input').first().evaluate(input => !input.readOnly), true);

    await page.getByLabel('캐릭터 닉네임').fill('없는닉네임');
    await page.getByRole('button', { name: '장비 불러오기' }).click();
    await expectText('#accessory-character-status', '현재 적용 중인 장비는 형아의소환수');
    await expectText('#accessory-result-status', '217억 8000만 메소');
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `viewport ${width}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });

    await page.getByRole('button', { name: '캐릭터 해제' }).click();
    const dropTarget = page.getByRole('slider', { name: '목표 아이템 드랍률' });
    await dropTarget.press('Home');
    await dropTarget.press('ArrowRight');
    await page.getByRole('slider', { name: '목표 메소 획득량' }).press('Home');
    await page.locator('#accessory-slots [data-slot="0"]').click();
    await page.locator('#accessory-prices input').first().fill('3');
    for (const line of await page.locator('#accessory-lines button[value="drop"]').all()) await line.click();
    await expectText('#accessory-result-status', '최저 구매 합계 3억 메소');
    await page.getByLabel('가격보다 선호 옵션 우선').check();
    await expectText('#accessory-result-status', '62억 2000만 메소');
    assert.deepEqual(errors, []);

    assert.equal(marketRequests, 0);
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
});
