(() => {
  'use strict';

  const slotIndex = new Map([
    ['반지', 0], ['반지1', 0], ['반지2', 1], ['반지3', 2], ['반지4', 3],
    ['얼굴장식', 4], ['눈장식', 5], ['펜던트', 6], ['펜던트1', 6], ['펜던트2', 7],
    ['귀고리', 8], ['귀걸이', 8]
  ]);
  const ratePattern = /^(아이템\s*드[롭랍]률|메소\s*획득량)\s*:?\s*\+?\s*(\d+)\s*%$/;

  function readPreset(equipment) {
    if (!Array.isArray(equipment) || !equipment.length) return null;
    const slots = Array(9).fill(null);
    for (const item of equipment) {
      const slot = slotIndex.get(String(item?.item_equipment_slot || '').replace(/\s/g, ''));
      if (slot === undefined || typeof item.item_name !== 'string' || !item.item_name) continue;
      const rates = { drop: 0, meso: 0 };
      for (const prefix of ['potential_option_', 'additional_potential_option_']) {
        for (let line = 1; line <= 3; line++) {
          const match = ratePattern.exec(String(item[prefix + line] || '').trim());
          if (match) rates[match[1].startsWith('메소') ? 'meso' : 'drop'] += Number(match[2]);
        }
      }
      const icon = typeof item.item_icon === 'string' && /^https:\/\//i.test(item.item_icon) ? item.item_icon : '';
      slots[slot] = { name: item.item_name, icon, ...rates, grid: item.item_name === '그리드 펜던트' };
    }
    return slots;
  }

  async function load(name, key) {
    const client = new NexonApi((...args) => fetch(...args), () => key);
    const get = (path, params) => client.get(path, params, {
      signal: AbortSignal.timeout(10000), strictJson: true
    });
    const { ocid } = await get('/id', { character_name: name });
    if (!ocid) throw new Error('OPENAPI00004');
    const [basic, equipment] = await Promise.all([
      get('/character/basic', { ocid }), get('/character/item-equipment', { ocid })
    ]);
    const presets = [1, 2, 3].map(number => readPreset(equipment['item_equipment_preset_' + number]));
    const active = equipment.preset_no - 1;
    if (active >= 0 && active < presets.length && !presets[active]) {
      presets[active] = readPreset(equipment.item_equipment);
    }
    return { name: basic.character_name || name, world: basic.world_name || '', presets, active };
  }

  window.AccessoryEquipment = { load };
})();
