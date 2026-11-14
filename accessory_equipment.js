// 넥슨 Open API의 장착 장비 응답에서 장신구 9부위의 드랍과 메획 잠재옵션을 읽는다.
// 경매장 시세는 공개 API가 없으므로 다루지 않는다. 가격은 장신구 맞추기에서 직접 입력한다.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AccessoryEquipment = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var API_BASE = 'https://open.api.nexon.com/maplestory/v1';
  // 장신구 맞추기의 부위 순서와 같다.
  var SLOT_KEYS = ['반지1', '반지2', '반지3', '반지4', '얼굴장식', '눈장식', '펜던트', '펜던트2', '귀고리'];
  var LINE_VALUE = 20;
  var PATTERNS = { drop: /^아이템\s*드롭률\s*:\s*\+?(\d+(?:\.\d+)?)%$/, meso: /^메소\s*획득량\s*:\s*\+?(\d+(?:\.\d+)?)%$/ };

  function text(value) { return String(value == null ? '' : value).trim(); }

  function readLines(item) {
    var out = { drop: 0, meso: 0 };
    ['potential_option_1', 'potential_option_2', 'potential_option_3',
      'additional_potential_option_1', 'additional_potential_option_2', 'additional_potential_option_3'].forEach(function (key) {
      var line = text(item && item[key]);
      Object.keys(PATTERNS).forEach(function (kind) {
        var match = PATTERNS[kind].exec(line);
        if (match) out[kind] += Number(match[1]);
      });
    });
    return out;
  }

  function presetList(body, preset) {
    if (!body) return [];
    var key = preset ? 'item_equipment_preset_' + preset : 'item_equipment';
    return Array.isArray(body[key]) ? body[key] : [];
  }

  // preset: 0이면 현재 착용 장비, 1~3이면 해당 프리셋.
  function parse(body, preset) {
    var items = presetList(body, preset);
    return SLOT_KEYS.map(function (key) {
      var item = items.find(function (entry) { return text(entry && entry.item_equipment_slot) === key; });
      if (!item) return { name: '', icon: '', dropPct: 0, mesoPct: 0, drop: 0, meso: 0, partial: false, empty: true };
      var pct = readLines(item);
      var drop = Math.floor(pct.drop / LINE_VALUE), meso = Math.floor(pct.meso / LINE_VALUE);
      // 장신구 맞추기는 부위마다 20% 두 줄까지만 다룬다.
      var over = drop + meso > 2;
      if (over) { var keepDrop = Math.min(drop, 2); meso = Math.min(meso, 2 - keepDrop); drop = keepDrop; }
      return {
        name: text(item.item_name),
        icon: text(item.item_icon),
        dropPct: pct.drop,
        mesoPct: pct.meso,
        drop: drop,
        meso: meso,
        partial: over || pct.drop % LINE_VALUE !== 0 || pct.meso % LINE_VALUE !== 0,
        empty: false
      };
    });
  }

  function hasPreset(body, preset) { return presetList(body, preset).length > 0; }

  function client(fetchImpl, getKey) {
    async function get(path, params, signal) {
      var key = getKey();
      if (!key) throw new Error('API_KEY_REQUIRED');
      var response = await fetchImpl(API_BASE + path + '?' + new URLSearchParams(params), { headers: { 'x-nxopen-api-key': key }, signal: signal });
      var body = await response.json().catch(function () { return null; });
      if (!response.ok) {
        var error = new Error((body && body.error && body.error.message) || 'HTTP ' + response.status);
        error.code = (body && body.error && body.error.name) || '';
        throw error;
      }
      return body;
    }
    return {
      load: async function (name, ocid, signal) {
        if (!ocid) {
          var id = await get('/id', { character_name: name }, signal);
          ocid = id && id.ocid;
          if (!ocid) throw new Error('CHARACTER_NOT_FOUND');
        }
        return get('/character/item-equipment', { ocid: ocid }, signal);
      }
    };
  }

  function describeError(error) {
    if (!error) return '장비를 불러오지 못했습니다. 다시 시도하세요.';
    if (error.message === 'API_KEY_REQUIRED') return '넥슨 오픈 API 키를 등록하면 장비를 불러올 수 있습니다.';
    if (error.message === 'CHARACTER_NOT_FOUND' || error.code === 'OPENAPI00004') return '캐릭터를 찾지 못했습니다. 이름을 확인하세요.';
    if (error.code === 'OPENAPI00005') return 'API 키가 유효하지 않습니다. 홈에서 키를 다시 등록하세요.';
    if (error.code === 'OPENAPI00007') return '요청이 많아 잠시 제한되었습니다. 잠시 뒤 다시 시도하세요.';
    if (error.code === 'OPENAPI00009') return '아직 장비 데이터가 준비되지 않았습니다. 잠시 뒤 다시 시도하세요.';
    return '장비를 불러오지 못했습니다. 다시 시도하세요.';
  }

  return { SLOT_KEYS: SLOT_KEYS, parse: parse, readLines: readLines, hasPreset: hasPreset, client: client, describeError: describeError };
});
