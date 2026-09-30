// Numeric reference: https://matsu1207.tistory.com/402 (updated 2026-06-14).
// Arrays are ordered 1추 -> 5추. These are additional values, not base weapon stats.
(function (root) {
  'use strict';
  const groups = {
    onehand: [201, 157, 119, 87, 59], twohand: [210, 163, 124, 90, 62],
    polearm: [187, 146, 111, 81, 55], zero: [151, 110, 75, 46, 21],
    knuckle: [157, 123, 93, 68, 46], magic: [246, 192, 146, 106, 72],
    staff: [250, 195, 148, 108, 74], bow: [196, 153, 116, 84, 58],
    claw: [106, 83, 63, 46, 31], gun: [154, 120, 91, 66, 45], cannon: [214, 167, 127, 92, 63]
  };
  const rows = [
    ['saber','세이버','한손검','onehand','전사','STR'],
    ['axe','엑스','한손도끼','onehand','전사','STR'],
    ['hammer','해머','한손둔기','onehand','전사','STR'],
    ['twohand_sword','투핸드소드','두손검','twohand','전사','STR'],
    ['twohand_axe','투핸드엑스','두손도끼','twohand','전사','STR'],
    ['twohand_hammer','투핸드 해머','두손둔기','twohand','전사','STR'],
    ['spear','스피어','창','twohand','전사','STR'],
    ['polearm','폴암','폴암','polearm','전사','STR'],
    ['lazuli','라즐리','제로','zero','전사','STR'],
    ['lapis','라피스','제로','zero','전사','STR'],
    ['desperado','데스페라도','데스페라도','twohand','전사','STR'],
    ['ellaha','엘라하','건틀렛 리볼버','knuckle','전사','STR'],
    ['tuner','튜너','튜너','twohand','전사','STR'],
    ['changse','창세검','장검','twohand','전사','STR'],
    ['wand','완드','완드','magic','마법사','INT'],
    ['staff','스태프','스태프','staff','마법사','INT'],
    ['shining','샤이닝 로드','샤이닝 로드','magic','마법사','INT'],
    ['esp','ESP리미터','ESP리미터','magic','마법사','INT'],
    ['magic_gauntlet','매직 건틀렛','매직 건틀렛','magic','마법사','INT'],
    ['carta','카르타','카르타','magic','마법사','INT'],
    ['bow','보우','활','bow','궁수','DEX'],
    ['crossbow','크로스보우','석궁','onehand','궁수','DEX'],
    ['dualbow','듀얼보우건','듀얼보우건','bow','궁수','DEX'],
    ['ancient','에인션트 보우','에인션트 보우','bow','궁수','DEX'],
    ['breath','브레스 슈터','브레스 슈터','bow','궁수','DEX'],
    ['claw','가즈','아대','claw','도적','LUK'],
    ['dagger','대거','단검','bow','도적','LUK'],
    ['cane','케인','케인','onehand','도적','LUK'],
    ['energy','에너지체인','에너지소드','knuckle','도적','STR'],
    ['chain','체인','체인','bow','도적','LUK'],
    ['fan','창세선','부채','bow','도적','LUK'],
    ['chakram','이클립스','차크람','bow','도적','LUK'],
    ['knuckle','클로','너클','knuckle','해적','STR'],
    ['gun','피스톨','건','gun','해적','DEX'],
    ['cannon','시즈건','핸드캐논','cannon','해적','STR'],
    ['soul','소울슈터','소울슈터','knuckle','해적','DEX']
  ];
  const items = rows.map(([id, name, type, group, job, mainStat]) => ({
    id, name: '제네시스 ' + name, type, group, job, mainStat, level: 200,
    stat: job === '마법사' ? 'MATT' : 'ATT', values: groups[group], special: group === 'zero'
  }));
  // Reference tables are retained exactly, including unknown Zero ranks (null).
  const tables = {
    genesis: groups,
    fafnir: {
      onehand:[68,53,40,29,20], twohand:[71,55,42,31,21], polearm:[63,49,38,27,19], zero:[64,47,32,20,9],
      knuckle:[53,41,31,23,16], magic:[83,65,49,36,25], staff:[84,66,50,36,25], bow:[66,52,39,29,20],
      claw:[36,28,21,16,11], gun:[52,40,31,22,15], cannon:[72,56,43,31,21]
    },
    absolab: {
      onehand:[101,79,60,44,30], twohand:[106,82,63,46,31], polearm:[95,74,56,41,28], zero:[76,56,38,23,11],
      knuckle:[79,62,47,34,24], magic:[124,97,73,54,37], staff:[126,98,75,54,37], bow:[99,77,59,43,29],
      claw:[53,42,32,23,16], gun:[77,60,46,33,23], cannon:[108,84,64,47,32]
    },
    arcane: {
      onehand:[175,136,103,75,51], twohand:[182,142,108,78,54], polearm:[163,127,96,70,48], zero:[131,95,65,40,18],
      knuckle:[136,106,81,59,40], magic:[214,167,126,92,63], staff:[218,170,129,94,64], bow:[170,133,101,73,50],
      claw:[92,72,55,40,27], gun:[133,104,79,58,39], cannon:[186,145,110,80,55]
    },
    destiny: {
      onehand:[257,201,152,111,76], twohand:[268,209,158,115,79], polearm:[240,187,142,103,71], zero:[193,140,null,null,null],
      knuckle:[201,157,119,87,59], magic:[315,246,186,136,93], staff:[320,249,189,139,94], bow:[251,196,148,108,74],
      claw:[136,106,81,59,40], gun:[196,153,116,85,58], cannon:[275,214,162,118,81]
    }
  };
  const series = [
    { id:'fafnir', name:'파프니르', level:150, source:'https://matsu1207.tistory.com/399' },
    { id:'absolab', name:'앱솔랩스', level:160, source:'https://matsu1207.tistory.com/400' },
    { id:'arcane', name:'아케인셰이드', level:200, source:'https://matsu1207.tistory.com/401' },
    { id:'genesis', name:'제네시스', level:200, source:'https://matsu1207.tistory.com/402' },
    { id:'destiny', name:'데스티니', level:250, source:'https://matsu1207.tistory.com/587' }
  ];
  function resolve(id, seriesId) {
    const weapon = items.find(w => w.id === id), set = series.find(s => s.id === seriesId);
    if (!weapon || !set) return null;
    return { ...weapon, level:set.level, series:set.id, source:set.source,
      name:set.id === 'genesis' ? weapon.name : set.name + ' · ' + (weapon.special ? (id === 'lazuli' ? '라즐리' : '라피스') : weapon.type),
      values:tables[set.id][weapon.group] };
  }
  function seriesForLevel(level, preferred) {
    return series.find(s => s.id === preferred && s.level === level)?.id || series.find(s => s.level === level)?.id || '';
  }
  const data = { items, series, resolve, seriesForLevel, source: 'https://matsu1207.tistory.com/402', updatedAt: '2026-06-14' };
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.FlameWeapons = data;
})(typeof window !== 'undefined' ? window : globalThis);
