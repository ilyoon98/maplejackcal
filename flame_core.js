// 추가옵션(환생의 불꽃) 확률 엔진.
//
// 확률 출처: maplestory.nexon.com/Guide/OtherProbability/game/gameAddOption
//   · 단계 설정 확률은 옵션 한 줄마다 따로 굴린다.
//   · 옵션 개수는 환생의 불꽃류 공통 표(1~4개), 보스 장비는 4개 고정.
//   · 옵션 종류는 장비분류별 목록에서 균등 확률. 한 장비에 같은 종류가 두 번 붙지는 않는다.
//   · 보스 장비는 정해진 단계에서 +2단계(3~7단계)로 취급한다.
//
// 단계별 수치 공식은 공식 페이지에 없어서 커뮤니티에서 역산해 정리된 표(mitemprice.kr 추가옵션표)를 따른다.
// 무기의 공격력·마력만은 무기 종류마다 수치가 달라, 여기서는 단계(추)로만 다룬다.
(function (global) {
  // 1~5단계 설정 확률(%).
  // meso = 1회에 나가는 메소. 불꽃은 아이템이라 메소가 안 들고, 추가옵션 재설정만 메소를 쓴다.
  // 추가옵션 재설정은 공식 확률표에서 검은/영원한 환생의 불꽃과 같은 줄에 묶여 있다(확률 동일).
  var MESO_RESET_PRICE = 3000000;
  var FLAMES = {
    black:   { name: '검은 · 영원한 환생의 불꽃', short: '검은 불꽃', tiers: [0, 29, 45, 25, 1], meso: 0 },
    abyss:   { name: '심연의 환생의 불꽃', short: '심연 불꽃', tiers: [0, 0, 63, 34, 3], meso: 0 },
    burning: { name: '타오르는 · 강력한 환생의 불꽃', short: '타오르는 불꽃', tiers: [20, 30, 36, 14, 0], meso: 0 },
    mesoReset: { name: '추가옵션 재설정 (메소)', short: '메소 재설정', tiers: [0, 29, 45, 25, 1], meso: MESO_RESET_PRICE }
  };
  var COUNT_DIST = [40, 40, 16, 4]; // 환생의 불꽃류: 옵션 1개 / 2개 / 3개 / 4개

  function coefSingle(lv) { return lv < 250 ? Math.floor(lv / 20) + 1 : 12; }
  function coefDual(lv) { return Math.floor(lv / 40) + 1; }
  function coefHp(lv) { return lv < 250 ? Math.floor(lv / 10) * 30 : 700; }

  // stats: 이 옵션이 올려주는 주스탯. value(lv, tier): 표시 수치.
  var OPTIONS = [
    { id: 'STR', label: 'STR', stats: ['STR'], value: function (lv, t) { return coefSingle(lv) * t; } },
    { id: 'DEX', label: 'DEX', stats: ['DEX'], value: function (lv, t) { return coefSingle(lv) * t; } },
    { id: 'INT', label: 'INT', stats: ['INT'], value: function (lv, t) { return coefSingle(lv) * t; } },
    { id: 'LUK', label: 'LUK', stats: ['LUK'], value: function (lv, t) { return coefSingle(lv) * t; } },
    { id: 'STR_DEX', label: 'STR + DEX', stats: ['STR', 'DEX'], value: function (lv, t) { return coefDual(lv) * t; } },
    { id: 'STR_INT', label: 'STR + INT', stats: ['STR', 'INT'], value: function (lv, t) { return coefDual(lv) * t; } },
    { id: 'STR_LUK', label: 'STR + LUK', stats: ['STR', 'LUK'], value: function (lv, t) { return coefDual(lv) * t; } },
    { id: 'DEX_INT', label: 'DEX + INT', stats: ['DEX', 'INT'], value: function (lv, t) { return coefDual(lv) * t; } },
    { id: 'DEX_LUK', label: 'DEX + LUK', stats: ['DEX', 'LUK'], value: function (lv, t) { return coefDual(lv) * t; } },
    { id: 'INT_LUK', label: 'INT + LUK', stats: ['INT', 'LUK'], value: function (lv, t) { return coefDual(lv) * t; } },
    { id: 'HP', label: '최대 HP', value: function (lv, t) { return coefHp(lv) * t; } },
    { id: 'MP', label: '최대 MP', value: function (lv, t) { return coefHp(lv) * t; } },
    { id: 'REQ_LV', label: '착용 레벨 감소', value: function (lv, t) { return -5 * t; } },
    { id: 'DEF', label: '방어력', value: function (lv, t) { return (lv < 140 ? 1 : coefSingle(lv)) * t; } },
    { id: 'ATT', label: '공격력', minLevelArmor: 60, value: function (lv, t) { return t; }, weaponTierOnly: true },
    { id: 'MATT', label: '마력', minLevelArmor: 60, value: function (lv, t) { return t; }, weaponTierOnly: true },
    { id: 'BOSS_DMG', label: '보스 몬스터 데미지', unit: '%', weaponOnly: true, minLevel: 90, value: function (lv, t) { return t; } },
    { id: 'DMG', label: '데미지', unit: '%', weaponOnly: true, value: function (lv, t) { return t; } },
    { id: 'SPEED', label: '이동속도', unit: '%', armorOnly: true, value: function (lv, t) { return t; } },
    { id: 'JUMP', label: '점프력', unit: '%', armorOnly: true, value: function (lv, t) { return t; } },
    { id: 'ALL_PCT', label: '올스탯', unit: '%', minLevelArmor: 70, value: function (lv, t) { return t; } }
  ];
  var BY_ID = {};
  OPTIONS.forEach(function (o) { BY_ID[o.id] = o; });

  // 이 부위·레벨에 실제로 붙을 수 있는 옵션 목록. 균등 확률이라 목록 길이가 곧 한 칸의 분모가 된다.
  function candidates(level, weapon) {
    return OPTIONS.filter(function (o) {
      if (o.weaponOnly && !weapon) return false;
      if (o.armorOnly && weapon) return false;
      if (o.minLevel && level < o.minLevel) return false;                 // 무기 보스 데미지 90제 이상
      if (!weapon && o.minLevelArmor && level < o.minLevelArmor) return false; // 비무기 공·마 60제, 올스탯% 70제
      return true;
    });
  }

  // 주스탯 환산 급수. 주스탯 1 = 1, 올스탯 1% = 10, 공격력(마력) 1 = 4.
  //
  // 어느 스탯을 주스탯으로 잡든 확률은 똑같으므로(옵션 목록이 STR·DEX·INT·LUK 대칭) STR을 대표로 쓴다.
  // 복합 스탯은 주스탯 쪽 수치만 센다. 공격력·마력은 둘 중 하나만 쓰는 옵션이라 공격력 하나만 센다.
  // 무기는 공격력·마력 수치가 무기 종류마다 달라 급수에서 빼고, 주스탯 계열만 센다.
  var GRADE_WEIGHT = { STR: 1, STR_DEX: 1, STR_INT: 1, STR_LUK: 1, ALL_PCT: 10, ATT: 4 };
  function gradeWeight(option, weapon) {
    if (weapon && (option.id === 'ATT' || option.id === 'MATT')) return 0;
    return GRADE_WEIGHT[option.id] || 0;
  }

  // conds: [{ kind:'opt', id, minTier }] 또는 [{ kind:'grade', min }]
  function probability(opts) {
    var level = opts.level, weapon = !!opts.weapon, boss = !!opts.boss;
    var conds = (opts.conds || []).filter(function (c) {
      return c.kind === 'opt' ? c.minTier > 0 : c.min > 0;
    });
    if (!conds.length) return 1;

    var list = candidates(level, weapon);
    var n = list.length;
    var tierP = (FLAMES[opts.flame] || FLAMES.black).tiers.map(function (x) { return x / 100; });
    var shift = boss ? 2 : 0;
    var counts = boss ? [0, 0, 0, 1] : COUNT_DIST.map(function (x) { return x / 100; });

    var gradeConds = conds.filter(function (c) { return c.kind === 'grade'; });
    var optConds = conds.filter(function (c) { return c.kind === 'opt'; });
    // 조건이 가리키는 옵션이 이 부위·레벨에 아예 없으면 성공할 수 없다
    var optIndex = optConds.map(function (c) {
      return list.findIndex(function (o) { return o.id === c.id; });
    });
    if (optIndex.some(function (i) { return i < 0; })) return 0;

    // 옵션 i가 1단계일 때 급수에 얼마나 보태는지 미리 뽑아둔다 (수치는 단계에 정비례한다)
    var give = list.map(function (o) {
      var w = gradeWeight(o, weapon) * o.value(level, 1);
      return gradeConds.map(function () { return w; });
    });

    var sums = new Float64Array(gradeConds.length);
    var got = new Int8Array(optConds.length);

    function rec(start, left) {
      if (left === 0) {
        for (var a = 0; a < gradeConds.length; a++) if (sums[a] < gradeConds[a].min - 1e-9) return 0;
        for (var b = 0; b < optConds.length; b++) if (!got[b]) return 0;
        return 1;
      }
      var total = 0;
      for (var i = start; i <= n - left; i++) {
        // 아직 못 잡은 옵션 조건의 후보 자리를 지나쳐 버렸으면 더 볼 것이 없다
        var dead = false;
        for (var b = 0; b < optConds.length; b++) if (!got[b] && optIndex[b] < i) dead = true;
        if (dead) break;
        for (var t = 0; t < 5; t++) {
          if (!tierP[t]) continue;
          var tier = t + 1 + shift;
          for (var a = 0; a < gradeConds.length; a++) sums[a] += give[i][a] * tier;
          var marked = [];
          for (var b2 = 0; b2 < optConds.length; b2++) {
            if (!got[b2] && optIndex[b2] === i && tier >= optConds[b2].minTier) { got[b2] = 1; marked.push(b2); }
          }
          total += tierP[t] * rec(i + 1, left - 1);
          marked.forEach(function (b3) { got[b3] = 0; });
          for (var a2 = 0; a2 < gradeConds.length; a2++) sums[a2] -= give[i][a2] * tier;
        }
      }
      return total;
    }

    var P = 0;
    for (var k = 1; k <= 4; k++) {
      if (!counts[k - 1] || k > n) continue;
      P += counts[k - 1] * rec(0, k) / choose(n, k);
    }
    return Math.min(P, 1);
  }

  function choose(n, k) {
    var r = 1;
    for (var i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return r;
  }

  global.FlameCore = {
    FLAMES: FLAMES,
    COUNT_DIST: COUNT_DIST,
    OPTIONS: OPTIONS,
    BY_ID: BY_ID,
    candidates: candidates,
    probability: probability,
    // 보스 장비는 3~7단계, 그 외는 1~5단계
    tiers: function (boss) { return boss ? [3, 4, 5, 6, 7] : [1, 2, 3, 4, 5]; },
    gradeWeight: gradeWeight,
    MESO_RESET_PRICE: MESO_RESET_PRICE
  };
})(window);
