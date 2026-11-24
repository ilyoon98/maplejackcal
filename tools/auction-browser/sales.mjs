// Based on Maple Auction MCP's auction query mapping (oyc0401, MIT).
const api = 'https://api.mskr.nexon.com/v1';
const clientVersion = '1.0.2';
const sold = '/market/web/items/searches/sold';
const worlds = new Map(Object.entries({
  스카니아: 0, 베라: 1, 루나: 3, 제니스: 4, 크로아: 5, 유니온: 10, 엘리시움: 16,
  이노시스: 29, 레드: 43, 오로라: 44, 에오스: 45, 헬리오스: 46,
  챌린저스2: 48, 챌린저스: 49, 아케인: 50, 노바: 51, 챌린저스3: 52, 챌린저스4: 54
}));
const categories = new Map(Object.entries({ ring: 'RING', face: 'FACE', eye: 'EYE', pendant: 'PENDANT', earring: 'EAR' }));
const perPage = 60;
const maxPages = 3;
const deviceId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
const ratePattern = /^(아이템\s*(?:드[롭랍]\s*(?:률|확률)|획득\s*확률)|메소\s*획득량)\s*:?\s*\+?\s*(\d+)\s*%$/;

function auctionError(code, detail) {
  return Object.assign(new Error(code), { detail });
}

function saleRecord(item, world, slot, crossWorld) {
  if (item?.status !== 'SOLD' || (crossWorld ? item.isMyWorld !== false : item.isMyWorld === false)) return null;
  const priceMeso = String(item.pricePerItem ?? '');
  if (!/^[1-9]\d{0,23}$/.test(priceMeso)
      || (typeof item.pricePerItem === 'number' && !Number.isSafeInteger(item.pricePerItem))) return null;
  const rates = { drop: 0, meso: 0 };
  const upgrade = item.toolTip?.upgradeInfo;
  for (const options of [upgrade?.potential, upgrade?.additionalPotential]) {
    for (const entry of options?.entries || []) {
      const match = ratePattern.exec(String(entry.text || '').trim());
      if (match) rates[match[1].startsWith('메소') ? 'meso' : 'drop'] += Number(match[2]);
    }
  }
  return { id: item._id, itemName: item.itemName, world, slot, ...rates, priceMeso, soldAt: item.tradeDate,
    ...(crossWorld ? { scope: 'cross' } : {}) };
}

export async function readSold({ world, slots }, { fetchImpl = fetch, signal } = {}) {
  const worldId = worlds.get(world);
  if (worldId === undefined || !Array.isArray(slots) || !slots.length
      || slots.length > categories.size || slots.some(slot => !categories.has(slot))) throw new Error('LOCAL_AUCTION_SCOPE');

  async function request(stage, path, body) {
    const headers = { Accept: 'application/json, text/plain, */*', 'x-platform': 'PC_WEB', 'x-device-id': deviceId, 'x-client-version': clientVersion };
    if (body) headers['Content-Type'] = 'application/json';
    const timeout = AbortSignal.timeout(8000);
    let response;
    try {
      response = await fetchImpl(api + path, {
        method: body ? 'POST' : 'GET', credentials: 'include', redirect: 'manual', headers,
        body: body ? JSON.stringify(body) : undefined, signal: signal ? AbortSignal.any([signal, timeout]) : timeout
      });
    } catch (error) {
      const reason = error.name === 'TimeoutError' ? '시간 초과' : '네트워크 요청 실패';
      throw auctionError('LOCAL_AUCTION_UPSTREAM', `${stage} · ${reason}`);
    }
    // A redirect can send a signed-in browser to a different service. Report
    // that the server redirected the request without following it.
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw auctionError('LOCAL_AUCTION_UPSTREAM', `${stage} · 옥션 서버가 다른 주소로 응답함`);
    }
    const detail = `${stage} · HTTP ${response.status}`;
    if ([401, 403].includes(response.status)) throw auctionError('LOCAL_AUCTION_LOGIN', detail);
    if (response.status === 429) throw auctionError('LOCAL_AUCTION_LIMIT', detail);
    if (!response.ok) throw Object.assign(auctionError('LOCAL_AUCTION_UPSTREAM', detail), { status: response.status });
    return response.json().catch(() => {
      throw auctionError('LOCAL_AUCTION_UPSTREAM', `${stage} · 응답 형식 오류`);
    });
  }

  // Account and character identifiers stay inside the extension and are used only
  // to establish the requested world's existing auction identity.
  const { accounts } = await request('계정 조회', '/accounts');
  let identity;
  let worldError;
  for (const { accountId } of accounts || []) {
    if (!Number.isSafeInteger(accountId) || accountId <= 0) continue;
    const result = await request('월드 캐릭터 조회', `/accounts/${accountId}/gameWorlds/${worldId}/characters`).catch(error => {
      if (error.message !== 'LOCAL_AUCTION_UPSTREAM') throw error;
      worldError = error.detail;
      return null; // The auction reports a server error for worlds without characters.
    });
    const character = result?.characters?.find(row => row.level >= 200 && Number.isSafeInteger(row.characterId) && row.characterId > 0);
    if (!character) continue;
    identity = { worldId, accountId, characterId: character.characterId };
    break;
  }
  if (!identity) throw auctionError('LOCAL_AUCTION_WORLD', worldError || '해당 월드의 캐릭터를 찾지 못했습니다.');

  const sales = [];
  let returned = 0;
  let partial = false;
  for (const slot of new Set(slots)) {
    for (const crossWorld of [false, true]) {
      for (const option of ['itemDropPercent', 'mesosObtainedPercent']) {
        await collect(slot, option, crossWorld);
      }
    }
  }
  return { world, sales, partial, returned };

  async function collect(slot, option, crossWorld) {
      const first = await request('판매완료 검색', sold + '/tool-tip', {
        ...identity, page: 1, limit: 10, sortType: 'PRICE_PER_ITEM_ASC', saveRecentKeyword: false,
        filters: {
          exactMatch: false, ...(!crossWorld ? { myWorldOnly: true } : {}),
          itemCategory: { itemDetailCategory: 'ARMOR_ACCESSORY_' + categories.get(slot) },
          enhancementOption: { potentialOptionSum: { [option]: 20 } }
        }
      });
      if (!Array.isArray(first?.items)) throw auctionError('LOCAL_AUCTION_UPSTREAM', '판매완료 검색 · 거래 목록 형식 오류');
      const append = items => {
        returned += items.length;
        sales.push(...items.map(item => saleRecord(item, world, slot, crossWorld)).filter(Boolean));
      };
      if (first.hasNext !== true && !(first.total > first.items.length)) {
        append(first.items);
        return;
      }
      if (typeof first.searchKey !== 'string' || !first.searchKey || first.searchKey.length > 1024 || /^\.{1,2}$/.test(first.searchKey)) {
        append(first.items);
        partial = true;
        return;
      }
      let paging = { limit: perPage, sortType: 'REGISTER_DATE_DESC' };
      function getPage(page) {
        const query = new URLSearchParams({ page, ...paging, accountId: identity.accountId, characterId: identity.characterId });
        return request('판매완료 다음 페이지', `${sold}/${encodeURIComponent(first.searchKey)}/tool-tip?${query}`);
      }
      for (let page = 1; page <= maxPages; page++) {
        const result = await getPage(page).catch(async error => {
          if (error.status !== 400) throw error;
          if (page !== 1) return null;
          paging = { limit: 20, sortType: 'PRICE_PER_ITEM_ASC' };
          return getPage(page).catch(retryError => {
            if (retryError.status !== 400) throw retryError;
            return null;
          });
        });
        if (!result) {
          if (page === 1) append(first.items);
          partial = true;
          break;
        }
        if (!Array.isArray(result?.items)) throw auctionError('LOCAL_AUCTION_UPSTREAM', '판매완료 다음 페이지 · 거래 목록 형식 오류');
        append(result.items);
        if (!result.hasNext) break;
        if (page === maxPages) partial = true;
      }
  }
}
