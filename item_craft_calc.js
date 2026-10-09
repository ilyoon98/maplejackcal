// 아이템 제작 비용 계산기.
//
// "노작을 사서 → 추가옵션을 띄우고 → 스타포스를 올리고 → 잠재·에디셔널을 맞춘다"는
// 한 벌의 과정을 통째로 메소로 환산한다. 각 단계의 확률 엔진은 이미 있는 것을 그대로 쓴다.
//   추가옵션  flame_core.js
//   스타포스  starforce_data.js + starforce_calc.js (window.StarforceCalc)
//   잠재·에디 cube_core.js + cube_option_data.js
//
// 두 가지 숫자를 낸다.
//   대박  = 모든 단계가 첫 시도에 성공했을 때 들어가는 메소 (이보다 싸게는 못 만든다)
//   평균  = 각 단계 기대 비용의 합
//
// 파괴 모델: 스타포스에서 파괴되면 노작을 다시 사고 추가옵션도 다시 띄워야 하므로,
// 스타포스 계산의 "대체 장비값"에 노작 가격 + 추가옵션 기대 비용을 넣는다.
// 잠재는 스타포스를 끝낸 뒤에 돌리는 것으로 본다(파괴로 날아가지 않는다).
(function () {
  const F = window.FlameCore;
  const W = window.FlameWeapons;
  const SF = window.StarforceCalc;
  const SFD = window.StarforceData;

  // ---------------------------------------------------------------- 부위

  // cube_option_data.js의 장비 분류 = 잠재능력 확률표의 키. 추가옵션은 여기에 자기 규칙이 따로 있다.
  //   flame: 'weapon' 무기 옵션표 · 'armor' 그 외 장비 옵션표 · null 추가옵션이 안 붙는 부위
  const PARTS = [
    { key: '무기', flame: 'weapon' },
    { key: '엠블렘', flame: null, star: false },
    // 아스트라처럼 스타포스가 가능한 보조무기도 있어 포함 여부를 직접 선택한다.
    { key: '보조무기(포스실드, 소울링 제외)', short: '보조무기', flame: null },
    { key: '포스실드, 소울링', short: '포스실드·소울링', flame: null, star: false },
    { key: '방패', flame: null },
    { key: '모자', flame: 'armor' },
    { key: '상의', flame: 'armor' },
    { key: '한벌옷', flame: 'armor' },
    { key: '하의', flame: 'armor' },
    { key: '신발', flame: 'armor' },
    { key: '장갑', flame: 'armor' },
    { key: '망토', flame: 'armor' },
    { key: '벨트', flame: 'armor' },
    { key: '어깨장식', flame: null },
    { key: '얼굴장식', flame: 'armor' },
    { key: '눈장식', flame: 'armor' },
    { key: '귀고리', flame: 'armor' },
    { key: '반지', flame: null },
    { key: '펜던트', flame: 'armor' },
    { key: '기계심장', flame: null }
  ];
  const partOf = key => PARTS.find(p => p.key === key);
  const defaultFlameConds = part => partOf(part).flame === 'weapon'
    ? [{ kind: 'opt', id: 'ATT', minTier: 6 }] : [];
  const selectedWeapon = () => state.part === '무기' ? W.resolve(state.weapon, state.weaponSeries) : null;
  const attackId = () => selectedWeapon()?.stat || 'ATT';
  const flameLabel = o => o.id === 'ATT' ? (selectedWeapon() ? (attackId() === 'MATT' ? '마력' : '공격력') : '공격력·마력') : o.label;
  const availableFlameTiers = () => F.tiers(BOSS).filter((tier, i) => F.FLAMES.mesoReset.tiers[i] > 0);
  function flameValue(o, tier) {
    if (state.part === '무기' && o.weaponTierOnly) return selectedWeapon()?.values[7 - tier] ?? null;
    return o.value(state.level, tier);
  }
  function flameValueText(o, tier) {
    const value = flameValue(o, tier);
    return value === null ? '무기·계열 확인' : (value > 0 ? '+' : '') + fmt(value) + (o.unit || '');
  }

  const RANKS = ['레어', '에픽', '유니크', '레전드리'];
  const RANK_COLORS = ['#7cd4ff', '#b58cff', '#ffa94d', '#6bd98a'];
  const MVP_OPTIONS = [[0, '없음'], [0.03, '실버'], [0.05, '골드'], [0.10, '다이아']];
  const MAX_GOALS = 3;
  const MAX_FLAME_GOALS = 4;
  const FLAME_PRICE = 3000000;
  const MAX_SETS = 4;
  const SET_NAMES = ['A', 'B', 'C', 'D'];
  function potentialGoals(cur) {
    return cur.sets.flatMap(set => {
      const stats = set.rows.some(r => r.any && r.key === MAIN_STAT_KEY) ? MAIN_STATS : [MAIN_STAT_KEY];
      return stats.map(stat => {
        const sums = new Map();
        for (const r of set.rows) {
          if (!(Number(r.min) > 0)) continue;
          const key = r.any && r.key === MAIN_STAT_KEY ? stat : r.key;
          sums.set(key, (sums.get(key) || 0) + Number(r.min));
        }
        return [...sums];
      });
    }).filter(g => g.length);
  }
  function usablePotentialGoals(cur, bracket) {
    const excluded = [], goals = [];
    const keys = bracket ? keysOf(bracket) : new Map();
    cur.sets.forEach((set, index) => {
      const rows = set.rows.filter(row => {
        if (!(Number(row.min) > 0)) return false;
        const reason = !bracket ? '확률표 없음' : !keys.has(row.key) ? '해당 장비에 없는 옵션'
          : Number(row.min) > maxTotal(bracket, row.key) ? '최대 수치 초과' : '';
        if (reason) excluded.push('조건 ' + SET_NAMES[index] + ' · ' + potLabel(row.key) + ' ' + row.min + keyUnit(row.key) + ' (' + reason + ')');
        return !reason;
      });
      // 전부 제외된 빈 조건은 OR의 무조건 성공으로 취급하지 않는다.
      const variants = potentialGoals({ sets: [{ rows }] });
      const possible = variants.filter(goal => successProb(bracket.lines, [goal]) > 0);
      if (variants.length && !possible.length) excluded.push('조건 ' + SET_NAMES[index] + ' (동시에 달성할 수 없는 조합)');
      goals.push(...possible);
    });
    return { goals, excluded };
  }
  // 추가옵션을 띄울 만한 장비(파프니르·앱솔랩스·아케인셰이드·에테르넬, 여명·칠흑 악세 등)는
  // 사실상 전부 보스 드롭이라 언제나 보스 규칙(옵션 4개 고정 · 3~7단계)으로 계산한다.
  const BOSS = true;
  // 샤이닝 스타포스: 비용 30% 할인 + 파괴확률 30% 감소 + 5·10·15성 100% 성공
  const SHINING = ['discount30', 'destroyDown30', 'lucky5'];
  // 목표로 고를 수 있는 등급 = cube_option_data.js에 옵션표를 모아 둔 등급.
  // 에디셔널은 에픽에서 멈추는 것도 흔해서 에픽까지 연다.
  const GOAL_RANKS = { pot: [2, 3], addi: [1, 2, 3] };
  const goalsFor = short => GOAL_RANKS[short] || GOAL_RANKS.pot;
  // 잠재능력은 레어에서 시작할 일이 없어서(에픽 이상부터 돌린다) 후보에서 뺀다.
  const FROM_RANKS = { pot: [1, 2, 3], addi: [0, 1, 2, 3] };
  const fromsFor = short => FROM_RANKS[short] || FROM_RANKS.pot;
  // STR·DEX·INT·LUK %는 확률이 완전히 같아서 하나로 묶어 "주스탯 %"로 보여준다(대표는 STR).
  const MAIN_STAT_KEY = 'STR|%';
  const HIDDEN_STAT_KEYS = ['DEX|%', 'INT|%', 'LUK|%'];
  const potLabel = key => key === MAIN_STAT_KEY ? '주스탯 %' : keyLabel(key);

  // ---------------------------------------------------------------- 상태

  const STORE_KEY = 'itemCraftCalc';
  const state = {
    level: 200, part: '무기', base: 0,
    weapon: '', weaponSeries: 'genesis',
    flameConds: defaultFlameConds('무기'),
    // 기본값은 샤이닝 스타포스가 열린 때 기준. 파괴방지는 노작값을 보고 자동으로 정한다.
    star: { start: 0, goal: 22, mvp: 0, pcRoom: false, discount30: true, destroyDown30: true, lucky5: true },
    miracle: { pot: false, addi: false },
    pot: { from: 2, to: 3, rows: [] },
    addi: { from: 0, to: 3, rows: [] },
    // 이미 되어 있는 걸 사서 나머지만 작할 수도 있어서 단계마다 계산에서 뺄 수 있게 한다
    on: { flame: true, star: true, pot: true, addi: true },
    showAll: { flame: false, pot: false, addi: false }
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    for (const k of Object.keys(state)) {
      if (saved[k] === undefined) continue;
      if (k === 'miracle' && typeof saved[k] === 'boolean') {
        state.miracle = { pot: saved[k], addi: saved[k] };
        continue;
      }
      if (state[k] && typeof state[k] === 'object' && !Array.isArray(state[k])) Object.assign(state[k], saved[k]);
      else state[k] = saved[k];
    }
  } catch (e) {}
  if (!partOf(state.part)) state.part = '무기';
  if (!Array.isArray(state.flameConds)) state.flameConds = [];
  // 스탯을 하나씩 걸던 옛 저장값은 급수 조건으로 바뀌었다
  state.flameConds = state.flameConds.filter(c => c && (c.kind === 'opt' || c.kind === 'grade'));
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }

  // ---------------------------------------------------------------- 표기

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '∞';
  function mesoText(n) {
    if (!Number.isFinite(n)) return '∞';
    n = Math.round(n);
    if (n <= 0) return '0';
    const jo = Math.floor(n / 1e12), eok = Math.floor((n % 1e12) / 1e8), man = Math.floor((n % 1e8) / 1e4);
    if (jo) return fmt(jo) + '조 ' + fmt(eok) + '억';
    if (eok) return man ? fmt(eok) + '억 ' + fmt(man) + '만' : fmt(eok) + '억';
    return fmt(man) + '만';
  }
  function pctText(p) {
    if (!(p > 0)) return '0%';
    const v = p * 100;
    return (v >= 1 ? v.toFixed(3) : v.toPrecision(3)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + '%';
  }
  const parseMeso = s => { const raw = String(s).replace(/[^0-9]/g, ''); return raw ? parseInt(raw, 10) : 0; };
  const comma = n => n ? n.toLocaleString('ko-KR') : '';

  // ---------------------------------------------------------------- 계산

  // 한 단계 = 성공확률 p인 시도를 1회 price 메소에 반복하는 것.
  // minTries 가 0이면 "그 시도가 앞 단계에서 이미 굴려졌다"는 뜻이라 기대 횟수에서도 1회를 뺀다.
  function stage(p, price, minTries) {
    const tries = p > 0 ? Math.max(1 / p - (1 - minTries), 0) : Infinity;
    return { p, price, tries, min: minTries * price, avg: p > 0 ? tries * price : Infinity };
  }

  function flameResult() {
    const part = partOf(state.part);
    const conds = state.flameConds.filter(c => c.kind === 'opt' || c.min > 0);
    if (!state.on.flame || !part.flame || !conds.length) return null;
    if (selectedWeapon()?.special) return stage(0, FLAME_PRICE, 1);
    const p = F.probability({
      level: state.level, weapon: part.flame === 'weapon', boss: BOSS,
      flame: 'mesoReset', conds: conds.map(c => c.id === 'ATT' ? { ...c, id: attackId() } : c), mainStat: 'STR'
    });
    return stage(p, FLAME_PRICE, 1);
  }

  const starOpts = (spare, safeguard) => ({
    level: state.level, start: state.star.start, goal: state.star.goal, spare: spare,
    mvp: state.star.mvp, pcRoom: state.star.pcRoom, discount30: state.star.discount30,
    destroyDown30: state.star.destroyDown30, lucky5: state.star.lucky5, safeguard: safeguard
  });

  // 파괴방지는 노작값(= 파괴 1회 손실)이 손익분기를 넘는 성만 켠다.
  // 어느 성을 켜느냐가 다른 성의 손익분기도 바꾸므로 더 이상 안 바뀔 때까지 몇 번 돌린다.
  function autoSafeguard(spare) {
    const sg = {}, why = [];
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      for (const st of SFD.PROTECT_STARS) {
        const r = SF.breakEvenSpare(starOpts(0, sg), st);
        const want = r.kind === 'always' || (r.kind === 'value' && spare >= r.spare);
        if (!!sg[st] !== want) { sg[st] = want; changed = true; }
      }
      if (!changed) break;
    }
    for (const st of SFD.PROTECT_STARS) {
      const r = SF.breakEvenSpare(starOpts(0, sg), st);
      if (r.kind !== 'none') why.push({ star: st, on: !!sg[st], breakEven: r.kind === 'always' ? 0 : r.spare });
    }
    return { safeguard: sg, why };
  }

  function starResult(spare) {
    const auto = autoSafeguard(spare);
    const res = SF.calculate(starOpts(spare, auto.safeguard));
    let min = 0;
    for (let k = state.star.start; k < state.star.goal; k++) min += res.steps[k].cost;
    return {
      min, avg: res.total.meso, destroys: res.total.destroys, tries: res.total.tries,
      spare, safeguard: auto.safeguard, why: auto.why
    };
  }

  // 미라클 타임은 등급 상승 확률만 2배로 올린다. 원하는 옵션이 뜰 확률과 천장은 그대로다.
  // (잠재능력 큐브 연구소 cube_calc.js와 같은 규칙)
  const miracleP = (p, short) => state.miracle[short] ? Math.min(p * 2, 0.999) : p;

  // 잠재 / 에디셔널: 메소 재설정으로 레전드리까지 등급을 올린 뒤, 원하는 옵션이 뜰 때까지 다시 돌린다.
  // 등급업에 성공한 그 재설정이 이미 레전드리 옵션을 한 번 굴려준 셈이라 옵션 단계에서 1회를 뺀다.
  function potentialResult(cfg) {
    const cur = cfg.state;
    if (!state.on[cfg.short]) return { label: cfg.label, icon: cfg.icon, min: 0, avg: 0, steps: [], opt: null };
    const bracket = costBracket(state.level);
    const prices = PRICE_TABLES[cfg.official][bracket];
    const grade = CUBE_GRADE[cfg.gradeCube];
    const steps = [];
    let min = 0, avg = 0;
    for (let i = cur.from; i < cur.to; i++) {
      const p = miracleP(grade.p[i], cfg.short);
      const tries = cubeExpected(p, grade.cap[i]);
      steps.push({ label: RANKS[i] + ' → ' + RANKS[i + 1], p, cap: grade.cap[i], tries, price: prices[i] });
      min += prices[i];
      avg += tries * prices[i];
    }
    const b = bracketOf(cfg.dataKey, state.part, state.level, RANKS[cur.to]);
    const { goals, excluded } = usablePotentialGoals(cur, b);
    let opt = null;
    if (goals.length) {
      const p = successProb(b.lines, goals);
      opt = stage(p, prices[cur.to], cur.from < cur.to ? 0 : 1);
      opt.missing = !b;
      min += opt.min;
      avg += opt.avg;
    }
    return { label: cfg.label, icon: cfg.icon, min, avg, steps, opt, excluded };
  }

  function compute() {
    const rawFlame = flameResult();
    const flame = rawFlame && rawFlame.p > 0 ? rawFlame : null;
    const flameExcluded = rawFlame && !flame ? ['현재 목표는 달성 불가하거나 확률 계산 미지원'] : [];
    // 파괴되면 노작을 다시 사고 추가옵션도 다시 띄워야 한다
    const flameAvg = flame && Number.isFinite(flame.avg) ? flame.avg : 0;
    const spare = state.base + flameAvg;
    const star = (partOf(state.part).star !== false && state.on.star && state.star.goal > state.star.start) ? starResult(spare) : null;
    const pot = potentialResult({ state: state.pot, short: 'pot', official: 'potential', gradeCube: 'potentialMeso', dataKey: 'black', label: '잠재능력', icon: '<img class="ic-stage-icon" src="icons/cube/블랙.webp" alt="" width="24" height="24">' });
    const addi = potentialResult({ state: state.addi, short: 'addi', official: 'additional', gradeCube: 'addReset', dataKey: 'addi', label: '에디셔널 잠재능력', icon: '<img class="ic-stage-icon" src="icons/cube/에디큐브.webp" alt="" width="24" height="24">' });

    const parts = [
      { label: '노작 (베이스 아이템)', kind: 'base', min: state.base, avg: state.base },
      // 불꽃은 메소가 0이어도 몇 개 쓰는지는 보여줘야 하므로 비용이 0이라도 남긴다
      flame && { label: '추가옵션', kind: 'flame', min: flame.min, avg: flame.avg, data: flame, keep: true },
      star && { label: '스타포스', kind: 'star', min: star.min, avg: star.avg, data: star },
      { label: '잠재능력', kind: 'pot', min: pot.min, avg: pot.avg, data: pot },
      { label: '에디셔널 잠재능력', kind: 'addi', min: addi.min, avg: addi.avg, data: addi }
    ].filter(Boolean).filter(x => x.keep || x.min > 0 || x.avg > 0);

    return {
      parts, flame, star, pot, addi, spare, flameExcluded,
      min: parts.reduce((s, x) => s + x.min, 0),
      avg: parts.reduce((s, x) => s + x.avg, 0)
    };
  }

  // 현재 제작 조건을 고정해 표본을 한 번 생성하고 입력 메소만 바뀌면 재사용한다.
  function recordPercentile(r) {
    const base = state.base;
    const opts = r.star ? starOpts(r.spare, { ...r.star.safeguard }) : null;
    let pending;
    return async actual => {
      if (!pending) pending = (async () => {
        let seed = 123456789;
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        const geometric = p => p >= 1 ? 1 : Math.floor(Math.log1p(-random()) / Math.log1p(-p)) + 1;
        const sampleStage = s => !s || !s.price ? 0 : Math.max(0, geometric(s.p) - (s.min === 0 ? 1 : 0)) * s.price;
        const sampleBase = () => base + sampleStage(r.flame);
        const samplePotential = pot => pot.steps.reduce((sum, s) => sum + Math.min(geometric(s.p), s.cap || Infinity) * s.price, 0) + sampleStage(pot.opt);
        const count = 5000;
        let stars = Array(count).fill(0);
        if (opts) {
          const gen = SF.sampleCosts(opts, count, random, 5000000, sampleBase);
          let next;
          do {
            next = gen.next();
            if (!next.done) await new Promise(resolve => setTimeout(resolve, 0));
          } while (!next.done);
          if (!next.value) return null;
          stars = next.value;
        }
        return stars.map(cost => cost + sampleBase() + samplePotential(r.pot) + samplePotential(r.addi)).sort((a, b) => a - b);
      })();
      const samples = await pending;
      if (!samples) return null;
      let lo = 0, hi = samples.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (samples[mid] <= actual) lo = mid + 1; else hi = mid;
      }
      return { percent: lo / samples.length * 100, samples: samples.length };
    };
  }

  // ---------------------------------------------------------------- 그리기

  const chip = (label, active, attrs) =>
    '<button type="button" class="ic-chip' + (active ? ' active' : '') + '" ' + attrs + '>' + esc(label) + '</button>';

  function renderItem() {
    if (document.activeElement !== $('level')) $('level').value = state.level;
    if (document.activeElement !== $('basePrice')) $('basePrice').value = comma(state.base);
    $('part').innerHTML = PARTS.map(p =>
      '<option value="' + esc(p.key) + '"' + (p.key === state.part ? ' selected' : '') + '>' + esc(p.short || p.key) + '</option>').join('');
    const br = costBracket(state.level);
    $('itemNote').innerHTML = '재설정 비용 구간 ' + LEVEL_BRACKETS.find(([lv]) => lv === br)[1] +
      ' · 레전드리 잠재 재설정 1회 ' + fmt(PRICE_TABLES.potential[br][LEGENDARY]) + ' 메소' +
      (state.part === '엠블렘' ? ' · 엠블렘은 공식 표가 있는 장비 레벨로 맞춥니다 (최대 200).' : '') +
      (state.part === '보조무기(포스실드, 소울링 제외)' ? ' · 아스트라 등 스타포스가 가능한 보조무기는 스타포스를 포함하세요. 강화 불가 장비는 계산에 포함을 꺼 주세요.' : '');
  }

  function renderFlameWeapon() {
    return '<div class="ic-field"><label for="flameWeapon">무기 종류</label><select id="flameWeapon"><option value="">무기 종류 선택</option>' +
      ['전사', '마법사', '궁수', '도적', '해적'].map(job => '<optgroup label="' + job + '">' + W.items.filter(w => w.job === job).map(w =>
        '<option value="' + w.id + '"' + (state.weapon === w.id ? ' selected' : '') + '>' + esc(w.special ? w.name : w.type) + '</option>').join('') + '</optgroup>').join('') +
      '</select></div><div class="ic-sub">무기 계열</div><div class="ic-chips">' + W.series.map(s =>
        chip(s.name + ' · Lv.' + s.level, state.weaponSeries === s.id, 'data-flame-series="' + s.id + '"')).join('') + '</div>' +
      '<p class="ic-note">계열을 선택하면 아이템 레벨도 함께 변경됩니다. ' +
      (selectedWeapon() ? esc(selectedWeapon().name) : '무기 종류·계열을 고르면 실제 공·마 수치를 보여줍니다.') + '</p>';
  }

  function renderFlameTotal() {
    const box = $('flameTotal');
    if (!partOf(state.part).flame) { box.innerHTML = ''; return; }
    if (selectedWeapon()?.special) { box.innerHTML = '<p class="ic-note">제로 무기는 수치표만 제공합니다.</p>'; return; }
    const totals = new Map();
    let included = 0;
    for (const c of state.flameConds.filter(c => c.kind === 'opt')) {
      const option = F.BY_ID[c.id], value = flameValue(option, c.minTier);
      for (const id of option.stats || [c.id]) {
        const prior = totals.get(id) || 0;
        totals.set(id, value === null || prior === null ? null : prior + value);
      }
      included += F.gradeWeight(option, state.part === '무기', 'STR') * (value || 0);
    }
    const grade = state.flameConds.find(c => c.kind === 'grade' && c.min > 0);
    box.innerHTML = '<div class="ic-sub">목표 추가옵션 최소 합계</div><div class="ic-option-badges">' + [...totals].map(([id, value]) =>
      '<span class="ic-option-badge" data-flame-total="' + id + '">' + esc(flameLabel(F.BY_ID[id])) + ' ' +
      (value === null ? '무기·계열 확인' : (value > 0 ? '+' : '') + fmt(value) + (F.BY_ID[id].unit || '')) + '</span>').join('') +
      (grade ? '<span class="ic-option-badge">나머지 주스탯 환산 ' + fmt(Math.max(0, grade.min - included)) + '급 이상</span>' : '') + '</div>' +
      (grade && included ? '<p class="ic-note">필수 옵션 최소 수치 기준: ' + grade.min + ' − ' + included + ' = ' + Math.max(0, grade.min - included) + '급</p>' : '');
  }

  function renderFlame() {
    const part = partOf(state.part);
    if (!part.flame) {
      $('flameBody').innerHTML = '<p class="ic-empty">' + esc(part.short || part.key) + '에는 추가옵션이 붙지 않습니다.</p>';
      return;
    }
    const weapon = part.flame === 'weapon';
    // 공·마 중 자신의 직업에 필요한 하나를 대표한다. 두 확률을 더하지 않는다.
    const list = F.candidates(state.level, weapon).filter(o => o.id !== 'MATT');
    const tiers = F.tiers(BOSS).slice().reverse();
    const allowed = availableFlameTiers();
    const used = state.flameConds;
    const full = used.length >= MAX_FLAME_GOALS;

    const condHtml = used.map((c, i) => {
      if (c.kind === 'grade') {
        return '<div class="ic-row">' +
          '<span class="ic-row-name">주스탯 환산 급수<small>' + esc(GRADE_HINT(weapon)) + '</small></span>' +
          '<span class="ic-row-val"><input type="number" min="0" step="1" class="ic-num" data-cond="' + i + '" value="' + esc(c.min) + '"> 급 이상</span>' +
          '<button type="button" class="ic-x" data-delcond="' + i + '">×</button></div>';
      }
      const o = F.BY_ID[c.id];
      const tierChips = tiers.map((t, k) =>
        '<button type="button" class="ic-tier' + (Number(c.minTier) === t ? ' active' : '') + '" data-cond="' + i + '" data-tier="' + t + '"' + (allowed.includes(t) ? '' : ' disabled title="이 불꽃에서 나오지 않는 단계입니다"') + '>' +
        (8 - t) + '추<small>' + flameValueText(o, t) + '</small></button>').join('');
      return '<div class="ic-row">' +
        '<span class="ic-row-name">' + esc(flameLabel(o)) + (o.unit || '') + '</span>' +
        '<span class="ic-row-val">' + (!weapon && ['ATT', 'ALL_PCT'].includes(c.id)
          ? '<input type="number" class="ic-num" min="' + Math.min(...allowed) + '" max="' + Math.max(...allowed) + '" data-required="' + i + '" value="' + c.minTier + '" aria-label="필수 옵션 최소 수치">' + (o.unit || '') + ' 이상'
          : flameValueText(o, c.minTier) + ' 이상') + '</span>' +
        '<button type="button" class="ic-x" data-delcond="' + i + '">×</button>' +
        '<span class="ic-tiers">' + tierChips + '</span></div>';
    }).join('');

    const gradePick = used.some(c => c.kind === 'grade') ? ''
      : '<button type="button" class="ic-pick" data-addgrade="1"' + (full ? ' disabled' : '') + '>주스탯 급수</button>';
    // 주스탯·올스탯·HP 같은 건 급수 하나로 다 들어가므로, 따로 걸 만한 것만 앞에 둔다
    const pick = o => '<button type="button" class="ic-pick" data-addflame="' + o.id + '"' + (full ? ' disabled' : '') + '>' + esc(flameLabel(o)) + (o.unit || '') + '</button>';
    const free = list.filter(o => !used.some(c => c.kind === 'opt' && c.id === o.id));
    const primaryIds = weapon ? FLAME_PRIMARY : ['ATT', 'ALL_PCT'];
    const primary = free.filter(o => primaryIds.includes(o.id));
    const others = free.filter(o => !primaryIds.includes(o.id));

    $('flameBody').innerHTML =
      (weapon ? renderFlameWeapon() : '') +
      '<p class="ic-note">계산에 포함하면 <b>메소 재설정 1회 300만 메소</b> 기준입니다. 심연·타오르는 불꽃으로 작업할 때는 계산에 포함을 꺼 주세요.</p>' +
      (selectedWeapon()?.special ? '<p class="ic-empty bad">제로 무기는 별도 규칙으로 확률 계산을 지원하지 않습니다. 수치표만 참고하세요. 비용을 계산하려면 다른 무기를 선택하거나 추가옵션 비용을 제외하세요.</p>' : '') +
      '<div class="ic-sub">목표 추가옵션 <span class="ic-count">' + used.length + '/' + MAX_FLAME_GOALS + '</span></div>' +
      (condHtml || '<p class="ic-empty">아래에서 원하는 추가옵션을 눌러 조건을 넣으세요. 넣지 않으면 추가옵션 단계는 빼고 계산합니다.</p>') +
      '<p class="ic-note">공·마와 올스탯을 고르면 해당 옵션을 반드시 포함하며 목표 급수도 만족해야 합니다. 공·마는 직업에 맞는 한 종류 기준입니다.</p>' +
      '<div class="ic-picks">' + (weapon ? primary.map(pick).join('') + gradePick : gradePick + primary.map(pick).join('')) + '</div>' +
      (others.length ? '<button type="button" class="ic-more" data-more="flame">' +
        (state.showAll.flame ? '세부 조건 접기 ▴' : '세부 조건 추가 ▾') + '</button>' +
        '<div class="ic-picks' + (state.showAll.flame ? '' : ' hidden') + '">' + others.map(pick).join('') + '</div>' : '') +
      (state.showAll.flame ? '<p class="ic-note">STR을 주스탯으로 대표 계산합니다. 복합 추옵은 급수에 STR 수치만 반영합니다.</p>' : '') +
      '<details class="ic-assume"><summary>단계별로 붙는 수치 보기 (Lv.' + state.level + ' · 1~5추)</summary>' +
      '<div class="ic-scroll">' + tierTable(list, tiers, weapon) + '</div></details>';
  }

  // 주스탯 환산 급수: 주스탯 1 = 1, 올스탯 1% = 10, 공격력(마력) 1 = 4.
  // 어느 스탯을 주스탯으로 잡든 확률이 같아서 스탯을 따로 고를 필요가 없다.
  const GRADE_HINT = weapon => '주스탯 1 · 올스탯 1% = 10' +
    (weapon ? ' · 무기는 공·마 수치를 몰라 제외' : ' · 공격력(마력) 1 = 4');
  // 스탯·HP·이속 같은 건 급수 하나에 다 녹아 있어서, 따로 걸 만한 것만 앞줄에 둔다
  const FLAME_PRIMARY = ['ATT', 'ALL_PCT', 'BOSS_DMG', 'DMG'];

  function tierTable(list, tiers, weapon) {
    const head = tiers.map(t => '<th>' + (8 - t) + '추<small>' + t + '단계</small></th>').join('');
    const rows = list.map(o => {
      const cells = tiers.map(t => {
        return '<td>' + flameValueText(o, t) + '</td>';
      }).join('');
      return '<tr><td class="ic-optname">' + esc(flameLabel(o)) + '</td>' + cells + '</tr>';
    }).join('');
    return '<table class="data-table"><thead><tr><th>옵션</th>' + head + '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // 단계마다 "계산에 포함" 스위치. 이미 되어 있는 아이템을 사서 나머지만 작할 때 끈다.
  const STAGES = [['flame', 'flamePanel'], ['star', 'starPanel'], ['pot', 'potPanel'], ['addi', 'addiPanel']];
  function renderToggles() {
    STAGES.forEach(([key, panel]) => {
      const part = partOf(state.part);
      const available = key === 'flame' ? !!part.flame : key === 'star' ? part.star !== false : true;
      $(panel).hidden = !available;
      $('on-' + key).disabled = !available;
      $('on-' + key).checked = available && state.on[key];
      $(panel).classList.toggle('off', !state.on[key]);
    });
  }

  function renderStar() {
    const s = state.star;
    if (document.activeElement !== $('starStart')) $('starStart').value = s.start;
    if (document.activeElement !== $('starGoal')) $('starGoal').value = s.goal;
    $('mvpChips').innerHTML = MVP_OPTIONS.map(([v, l]) => chip(l, s.mvp === v, 'data-mvp="' + v + '"')).join('');
    $('starEvents').innerHTML = [
      chip('PC방 5%', s.pcRoom, 'data-sf="pcRoom"'),
      chip('비용 30% 할인', s.discount30, 'data-sf="discount30"'),
      chip('파괴확률 30% 감소', s.destroyDown30, 'data-sf="destroyDown30"'),
      chip('5·10·15성 100%', s.lucky5, 'data-sf="lucky5"'),
      chip('✨ 샤이닝 스타포스', SHINING.every(k => s[k]), 'data-shining="1"')
    ].join('');
  }

  // 파괴방지는 손으로 켜는 게 아니라 노작값을 보고 정해진다. 무엇이 왜 켜졌는지만 보여준다.
  function renderSafeguard(star) {
    const box = $('safeguardNote');
    if (!star || !star.why.length) {
      box.innerHTML = '<p class="ic-empty">지금 구간에서는 15~17성을 지나지 않아 파괴방지를 쓸 일이 없습니다.</p>';
      return;
    }
    box.innerHTML = '<div class="ic-chips">' + star.why.map(w =>
      '<span class="ic-verdict' + (w.on ? ' on' : '') + '">' + w.star + '성 ' + (w.on ? 'ON' : 'OFF') +
      '<small>' + (w.breakEven ? '노작 ' + mesoText(w.breakEven) + ' 넘으면 ON' : '항상 이득') + '</small></span>').join('') + '</div>' +
      '<p class="ic-note">파괴 1회 손실 <b>' + mesoText(star.spare) + '</b> 메소(노작 + 추가옵션)를 기준으로 자동 판정했습니다.</p>';
  }

  // 세 줄이 전부 최고 수치로 떴을 때의 합계. 목표를 얼마까지 적을 수 있는지 보여준다.
  // (STR %에는 올스탯 %가 같은 양으로 더해지므로 contrib 로 센다)
  function maxTotal(bracket, key) {
    return bracket.lines.reduce((sum, rows) =>
      sum + Math.max(...rows.map(([i]) => contrib(OPTION_INFO[i], key))), 0);
  }

  function renderPotential(id, cfg) {
    const cur = cfg.state;
    const b = bracketOf(cfg.dataKey, state.part, state.level, RANKS[cur.to]);
    const keys = b ? keysOf(b) : new Map();
    const primary = PRIMARY_KEYS.filter(k => keys.has(k) && !HIDDEN_STAT_KEYS.includes(k));
    const others = [...keys.keys()].filter(k => !PRIMARY_KEYS.includes(k) && !HIDDEN_STAT_KEYS.includes(k));
    const open = state.showAll[cfg.short];
    const full = cur.rows.length >= MAX_GOALS;

    const rowHtml = (r, si, i) => {
      const info = keys.get(r.key);
      const isCount = !r.key.includes('|');
      const values = info && !isCount ? reachableSums(b, r.key).flatMap(g => g.sums).sort((a, x) => a - x) : [];
      const hit = values.find(v => v >= Number(r.min) - 1e-9);
      const attrs = ' data-pot="' + cfg.short + '" data-set="' + si + '" data-row="' + i + '"';
      return '<div class="ic-row' + (info ? '' : ' missing') + '">' +
        '<span class="ic-row-name">' + esc(potLabel(r.key)) +
          (info ? '<small>' + (MAIN_STATS.includes(r.key) ? '올스탯 포함 · ' : '') +
            '세 줄 합산 · 최대 ' + fmt(maxTotal(b, r.key)) + esc(keyUnit(r.key)) + '</small>' : '') +
          (info ? '' : '<small class="bad">이 부위·레벨에는 없는 옵션 · 확률 계산에서 제외</small>') + '</span>' +
        (r.key === MAIN_STAT_KEY ? '<button type="button" class="ic-chip' + (r.any ? ' active' : '') + '"' + attrs + ' data-any="1">' +
          (r.any ? '아무 스탯이나' : '한 스탯으로') + '</button>' : '') +
        (isCount ? '<span class="ic-row-val">1줄 이상</span>'
          : '<span class="ic-row-val"><input type="number" min="0" step="any" class="ic-num"' + attrs + ' value="' + esc(r.min) + '"> ' + esc(keyUnit(r.key)) + ' 이상</span>') +
        '<button type="button" class="ic-x" data-delpot="' + cfg.short + '"' + attrs + ' aria-label="옵션 삭제">×</button>' +
        (isCount ? '' : '<span class="ic-tiers">' + values.map(v =>
          '<button type="button" class="ic-tier' + (hit === v ? ' active' : '') + '"' + attrs + ' data-val="' + v + '">' + v + '</button>').join('') +
          '<span class="ic-note ic-hit-note" id="hit-' + cfg.short + '-' + si + '-' + i + '">' + potentialHitNote(r, values) + '</span></span>') +
        '</div>';
    };
    const rows = cur.sets.map((set, si) =>
      (si ? '<div class="ic-or">또는 (OR)</div>' : '') +
      '<div class="ic-goal-set' + (cur.sets.length > 1 && cur.active === si ? ' active' : '') + '">' +
      (cur.sets.length > 1 ? '<div class="ic-set-head"><b>조건 ' + SET_NAMES[si] + '</b>' +
        (cur.active === si ? '<span class="ic-note">옵션 추가 중</span>' : '<button type="button" class="ic-chip" data-activate-set="' + cfg.short + '" data-set="' + si + '">여기에 추가</button>') +
        '<button type="button" class="ic-x" data-remove-set="' + cfg.short + '" data-set="' + si + '" aria-label="조건 삭제">×</button></div>' : '') +
      (set.rows.map((r, i) => rowHtml(r, si, i)).join('') || '<p class="ic-empty">위에서 옵션을 골라 목표에 추가하세요. 비어 있는 조건은 계산에서 제외됩니다.</p>') +
      '<p class="ic-note" id="summary-' + cfg.short + '-' + si + '">' + potentialSummary(set) + '</p></div>').join('');

    const pick = k => '<button type="button" class="ic-pick" data-addpot="' + cfg.short + '" data-key="' + esc(k) + '"' + (full ? ' disabled' : '') + '>' + esc(potLabel(k)) + '</button>';
    $(id).innerHTML =
      '<div class="ic-sub">현재 등급 → 목표 등급</div>' +
      '<div class="ic-grades">' +
      '<div class="ic-chips">' + fromsFor(cfg.short).map(i =>
        '<button type="button" class="ic-chip grade' + (cur.from === i ? ' active' : '') + '" style="--chip:' + RANK_COLORS[i] + '" data-grade="' + cfg.short + '" data-i="' + i + '">' + RANKS[i] + '</button>').join('') + '</div>' +
      '<span class="ic-arrow">➔</span>' +
      // 옵션표를 모아 둔 등급까지만 목표로 고를 수 있다(유니크·레전드리)
      '<div class="ic-chips">' + goalsFor(cfg.short).map(i =>
        '<button type="button" class="ic-chip grade' + (cur.to === i ? ' active' : '') + (i < cur.from ? ' dim' : '') +
        '" style="--chip:' + RANK_COLORS[i] + '" data-goal="' + cfg.short + '" data-i="' + i + '">' + RANKS[i] + '</button>').join('') + '</div></div>' +
      '<div class="ic-sub">작업 시점</div>' +
      '<div class="ic-chips">' + chip('✨ 미라클 타임에 작업', state.miracle[cfg.short], 'data-miracle="' + cfg.short + '" aria-pressed="' + !!state.miracle[cfg.short] + '"') + '</div>' +
      '<p class="ic-note">이 파트의 등급 상승 확률만 2배로 계산합니다. 잠재와 에디를 모두 미라클 때 작업하면 각각 켜 주세요. 옵션 확률과 천장은 그대로입니다.</p>' +
      '<div class="ic-sub">목표 옵션 <small>' + RANKS[cur.to] + ' 옵션표 기준</small> <span class="ic-count">' + cur.rows.length + '/' + MAX_GOALS + '</span></div>' +
      (b ? '' : '<p class="ic-empty bad">' + esc(state.part) + '은(는) ' + RANKS[cur.to] + ' 확률표에 없어 옵션 목표를 제외하고 등급업만 계산합니다.</p>') +
      '<p class="ic-note">한 조건 안의 옵션은 모두 만족해야 하며, 조건 A·B 중 하나만 만족해도 성공입니다. 옵션이 없으면 등급업 비용만 계산합니다.</p>' +
      '<div class="ic-sub">' + (cur.sets.length > 1 ? '조건 ' + SET_NAMES[cur.active] + '에 추가' : '목표에 추가') + '</div>' +
      '<div class="ic-picks">' + primary.map(pick).join('') + '</div>' +
      (others.length ? '<button type="button" class="ic-more" data-more="' + cfg.short + '">' +
        (open ? '다른 옵션 접기 ▴' : '다른 옵션 펼치기 (' + others.length + ') ▾') + '</button>' +
        '<div class="ic-picks' + (open ? '' : ' hidden') + '">' + others.map(pick).join('') + '</div>' : '') +
      rows + '<button type="button" class="ic-chip" data-add-set="' + cfg.short + '"' + (!b || cur.sets.length >= MAX_SETS ? ' disabled' : '') + '>+ 다른 조건 추가 (OR)</button>';
  }

  function potentialHitNote(row, values) {
    const min = Number(row.min), hit = values.find(v => v >= min - 1e-9), unit = esc(keyUnit(row.key));
    if (!(min > 0) || !values.length) return '';
    if (hit === undefined) return '세 줄로 만들 수 없는 값이에요 (최대 ' + values[values.length - 1] + unit + ')';
    return Math.abs(hit - min) > 1e-9 ? min + unit + ' 이상 = 실제로는 <b>' + hit + unit + '</b>부터 성공' : '';
  }

  function potentialSummary(set) {
    return set.rows.filter(r => Number(r.min) > 0).map(r => esc(potLabel(r.key)) +
      (r.key === MAIN_STAT_KEY ? (r.any ? ' (넷 중 아무거나 · 올스탯 포함)' : ' (올스탯 포함)') : '') +
      ' 합계 ' + esc(r.min) + esc(keyUnit(r.key)) + ' 이상').join(' · 그리고 · ');
  }

  function renderResult(r) {
    renderItemPreview(r);
    const excluded = [
      ...r.flameExcluded.map(text => '추가옵션: ' + text),
      ...(r.pot.excluded || []).map(text => '잠재: ' + text),
      ...(r.addi.excluded || []).map(text => '에디: ' + text)
    ];
    $('excludedGoals').innerHTML = excluded.length ? '<strong>달성 불가 목표를 제외한 계산입니다</strong><ul>' +
      excluded.map(text => '<li>' + esc(text) + '</li>').join('') + '</ul><p>남은 목표만 만족하는 확률과 비용입니다. 옵션 목표가 모두 제외되면 등급업 비용만 반영합니다.</p>' : '';
    $('excludedGoals').hidden = !excluded.length;
    $('resAvg').actualPercentile = Number.isFinite(r.avg) ? recordPercentile(r) : null;
    $('resAvg').dataset.expectedUsage = r.avg;
    $('resMin').textContent = mesoText(r.min);
    $('resAvg').textContent = mesoText(r.avg);
    $('resMinSub').textContent = fmt(r.min) + ' 메소';
    $('resAvgSub').textContent = Number.isFinite(r.avg) ? fmt(r.avg) + ' 메소' : '지금 조건은 나올 수 없습니다';
    $('resRatio').textContent = (r.min > 0 && Number.isFinite(r.avg))
      ? '평균은 대박의 ' + (r.avg / r.min).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '배'
      : '';

    const icon = src => '<img class="ic-stage-icon" src="' + src + '" alt="" width="24" height="24">';
    const icons = { base: icon('icons/home/메소주머니.webp'), flame: icon('icons/coin-shop/영환불.webp'), star: icon('icons/home/스타포스강화권.webp'), pot: icon('icons/cube/블랙.webp'), addi: icon('icons/cube/에디큐브.webp') };
    $('breakdown').innerHTML = r.parts.length ? '<div class="ic-cost-cards">' + r.parts.map(p => {
      const facts = p.kind === 'base' ? ['장비 구입 비용']
        : p.kind === 'flame' ? ['성공 확률 ' + pctText(p.data.p), '평균 ' + fmt(p.data.tries) + '회']
        : p.kind === 'star' ? [state.star.start + '성 → ' + state.star.goal + '성', '평균 파괴 ' + p.data.destroys.toFixed(2) + '회', '평균 ' + fmt(p.data.tries) + '회']
        : [...p.data.steps.map(s => s.label + ' · 평균 ' + fmt(s.tries) + '회'),
          ...(p.data.opt ? ['옵션 확률 ' + pctText(p.data.opt.p), '옵션 평균 ' + fmt(p.data.opt.tries) + '회'] : [])];
      return '<article class="ic-cost-card" data-cost-stage="' + p.kind + '">' +
        '<h4><span aria-hidden="true">' + icons[p.kind] + '</span> ' + esc(p.label) + '</h4>' +
        '<dl class="ic-cost-values"><div class="ic-cost-average"><dt>평균 비용</dt><dd>' +
        (Number.isFinite(p.avg) ? mesoText(p.avg) + '<small> 메소</small>' : '달성 불가') + '</dd></div>' +
        '<div class="ic-cost-minimum"><dt>최소 비용</dt><dd>' + mesoText(p.min) + ' 메소</dd></div></dl>' +
        '<div class="ic-option-badges">' + facts.map(f => '<span class="ic-option-badge">' + esc(f) + '</span>').join('') + '</div></article>';
    }).join('') + '</div>' : '<p class="ic-empty">계산에 포함할 단계와 목표를 설정해 주세요.</p>';

    $('stageDetail').innerHTML = [flameDetail(r.flame), starDetail(r.star), potDetail(r.pot), potDetail(r.addi)]
      .filter(Boolean).join('');
  }

  function renderItemPreview(result) {
    const badge = (text, kind = '') => '<span class="ic-option-badge ' + kind + '">' + esc(text) + '</span>';
    const part = partOf(state.part);
    const descriptions = {
      flame: state.flameConds.map(c => c.kind === 'grade' ? '주스탯 ' + c.min + '급 이상'
        : flameLabel(F.BY_ID[c.id]) + ' ' + (8 - Number(c.minTier)) + '추 이상' + (flameValue(F.BY_ID[c.id], c.minTier) !== null ? ' (' + flameValueText(F.BY_ID[c.id], c.minTier) + ')' : '')),
      star: [state.star.start + '성 → ' + state.star.goal + '성']
    };
    for (const key of ['pot', 'addi']) {
      const cur = state[key];
      const groups = cur.sets.map(set => set.rows.filter(r => Number(r.min) > 0).map(r =>
        potLabel(r.key) + (r.any && r.key === MAIN_STAT_KEY ? ' (아무 스탯)' : '') + ' ' + r.min + keyUnit(r.key) + ' 이상'))
        .filter(group => group.length);
      descriptions[key] = [RANKS[cur.from] + ' → ' + RANKS[cur.to]];
      if (state.miracle[key]) descriptions[key].push('미라클 타임에 작업');
      groups.forEach((group, i) => {
        if (i) descriptions[key].push('또는');
        group.forEach((text, j) => { if (j) descriptions[key].push('그리고'); descriptions[key].push(text); });
      });
      if (!groups.length) descriptions[key].push('옵션 목표 미설정');
    }
    const titles = { flame: '추가옵션', star: '스타포스', pot: '잠재능력', addi: '에디셔널' };
    const cards = [];
    for (const key of Object.keys(titles)) {
      const available = key === 'flame' ? !!part.flame : key === 'star' ? part.star !== false : true;
      const items = descriptions[key].length ? descriptions[key] : ['목표 미설정'];
      const excluded = key === 'flame' ? result.flameExcluded : (result[key]?.excluded || []);
      const markup = (state.on[key] ? '' : badge('비용 제외', 'excluded')) +
        (excluded.length ? badge('달성 불가 목표 ' + excluded.length + '개 제외', 'excluded') : '') + items.map(text =>
        badge(text, text === '또는' || text === '그리고' ? 'connector' : '')).join('');
      $(key + 'Panel').dataset.optionSummary = markup;
      if (available) cards.push('<div class="ic-preview-stage"><strong>' + titles[key] + '</strong><div class="ic-option-badges">' + markup + '</div></div>');
    }
    $('itemPreview').innerHTML = '<p class="ic-preview-name">Lv.' + state.level + ' · ' + esc(selectedWeapon()?.name || part.short || part.key) + '</p>' + cards.join('');
    if (document.dispatchEvent) document.dispatchEvent(new Event('item-craft-updated'));
  }

  function detailOf(p) {
    if (p.kind === 'base') return '아이템 구입가 그대로';
    if (p.kind === 'flame') return '한 번에 뜰 확률 ' + pctText(p.data.p) + ' · 평균 ' + fmt(p.data.tries) + '개';
    if (p.kind === 'star') return state.star.start + '성 → ' + state.star.goal + '성 · 평균 파괴 ' + p.data.destroys.toFixed(2) + '회';
    const bits = p.data.steps.map(s => s.label.replace(/ → /, '→') + ' ' + fmt(s.tries) + '회');
    if (p.data.opt) bits.push('옵션 ' + pctText(p.data.opt.p) + ' · ' + fmt(p.data.opt.tries) + '회');
    return bits.join(' / ') || '-';
  }

  function flameDetail(f) {
    if (!f) return '';
    const conds = state.flameConds.map(c => c.kind === 'grade'
      ? '주스탯 환산 ' + c.min + '급 이상'
      : flameLabel(F.BY_ID[c.id]) + (F.BY_ID[c.id].unit || '') + ' ' + c.minTier + '단계 이상').join(' + ');
    return '<div class="ic-card"><h3><img class="ic-stage-icon" src="icons/coin-shop/영환불.webp" alt="" width="24" height="24"> 추가옵션</h3>' +
      '<p class="ic-note">' + esc(F.FLAMES.mesoReset.name) + ' · ' + esc(conds) + '</p>' +
      '<p class="ic-big">' + pctText(f.p) + '<small>한 번에 성공할 확률</small></p>' +
      '<p class="ic-note">평균 ' + fmt(f.tries) + '개 · ' +
      (f.price ? mesoText(f.avg) + ' 메소 (1회 ' + fmt(f.price) + ')' : '불꽃은 메소가 들지 않습니다') + '</p></div>';
  }
  function starDetail(s) {
    if (!s) return '';
    return '<div class="ic-card"><h3><img class="ic-stage-icon" src="icons/home/스타포스강화권.webp" alt="" width="24" height="24"> 스타포스</h3>' +
      '<p class="ic-note">' + state.star.start + '성 → ' + state.star.goal + '성 · Lv.' + state.level + '</p>' +
      '<p class="ic-big">' + s.destroys.toFixed(2) + '회<small>평균 파괴 횟수</small></p>' +
      '<p class="ic-note">평균 시도 ' + s.tries.toFixed(1) + '회 · 파괴 한 번마다 ' + mesoText(s.spare) +
      ' 메소(노작 + 추가옵션)가 다시 들어갑니다.</p></div>';
  }
  function potDetail(d) {
    if (!d.steps.length && !d.opt) return '';
    const rows = d.steps.map(s =>
      '<tr><td>' + s.label + '</td><td>' + pctText(s.p) + '</td><td>' + (s.cap ? s.cap + '회' : '-') + '</td><td>' +
      fmt(s.tries) + '회</td><td>' + mesoText(s.tries * s.price) + '</td></tr>').join('');
    const optRow = d.opt
      ? '<tr><td>옵션 맞추기</td><td>' + pctText(d.opt.p) + '</td><td>-</td><td>' + fmt(d.opt.tries) + '회</td><td>' + mesoText(d.opt.avg) + '</td></tr>'
      : '';
    return '<div class="ic-card"><h3>' + d.icon + ' ' + esc(d.label) + '</h3>' +
      '<table class="data-table"><thead><tr><th>구간</th><th>1회 확률</th><th>천장</th><th>평균 횟수</th><th>평균 메소</th></tr></thead>' +
      '<tbody>' + rows + optRow + '</tbody></table></div>';
  }

  // ---------------------------------------------------------------- 묶기

  function clampState() {
    state.level = Math.min(250, Math.max(1, Math.round(Number(state.level) || 1)));
    if (!W.items.some(w => w.id === state.weapon)) state.weapon = '';
    state.weaponSeries = W.seriesForLevel(state.level, state.weaponSeries);
    if (state.part === '엠블렘') {
      const levels = Array.from({ length: 250 }, (_, i) => i + 1).filter(lv =>
        Object.entries(GOAL_RANKS).every(([short, ranks]) => ranks.every(rank =>
          bracketOf(short === 'pot' ? 'black' : 'addi', state.part, lv, RANKS[rank]))));
      if (levels.length) state.level = levels.reduce((best, lv) =>
        Math.abs(lv - state.level) < Math.abs(best - state.level) ? lv : best);
    }
    state.star.start = Math.min(SFD.MAX_STAR - 1, Math.max(0, state.star.start));
    state.star.goal = Math.min(SFD.MAX_STAR, Math.max(0, state.star.goal));
    const normalized = [];
    for (const cond of state.flameConds) {
      const c = cond.kind === 'opt' && cond.id === 'MATT' ? { ...cond, id: 'ATT' } : cond;
      const previous = normalized.find(p => c.kind === 'opt' && p.kind === 'opt' && p.id === c.id);
      if (previous) previous.minTier = Math.max(previous.minTier, c.minTier);
      else normalized.push(c);
    }
    state.flameConds = normalized.filter(c => c.kind === 'grade' || F.BY_ID[c.id]).slice(0, MAX_FLAME_GOALS);
    [['pot', state.pot], ['addi', state.addi]].forEach(([short, c]) => {
      if (!goalsFor(short).includes(c.to)) c.to = 3;
      const froms = fromsFor(short);
      if (!froms.includes(c.from)) c.from = froms[0];
      c.from = Math.min(c.from, c.to);
      if (!Array.isArray(c.sets)) c.sets = [{ rows: c.rows || [] }];
      c.sets = c.sets.slice(0, MAX_SETS).map(set => ({ rows:
        (Array.isArray(set && set.rows) ? set.rows : []).filter(r => r && r.key).slice(0, MAX_GOALS)
          .map(r => HIDDEN_STAT_KEYS.includes(r.key) ? { ...r, key: MAIN_STAT_KEY } : r) }));
      if (!c.sets.length) c.sets = [{ rows: [] }];
      if (!Number.isInteger(c.active) || c.active < 0 || c.active >= c.sets.length) c.active = 0;
      c.rows = c.sets[c.active].rows;
    });
  }

  function refresh() {
    clampState();
    renderItem();
    renderFlame();
    renderStar();
    renderToggles();
    renderPotential('potBody', { state: state.pot, dataKey: 'black', short: 'pot' });
    renderPotential('addiBody', { state: state.addi, dataKey: 'addi', short: 'addi' });
    refreshOutputs();
  }

  // 목표 수치를 고칠 때는 입력칸이 포커스를 잃지 않도록 결과만 다시 그린다.
  // 대신 그 줄의 수치 칩만 손으로 켜고 끈다.
  function refreshOutputs() {
    renderFlameTotal();
    const r = compute();
    renderResult(r);
    renderSafeguard(r.star);
    save();
  }

  // ---------------------------------------------------------------- 이벤트

  const cfgOf = short => short === 'pot' ? state.pot : state.addi;
  const rowsOf = (short, si) => cfgOf(short).sets[Number(si)].rows;

  document.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    if (t.id === 'resetAll') {
      try { localStorage.removeItem(STORE_KEY); } catch (err) {}
      location.reload();
      return;
    }
    const d = t.dataset;
    if (d.levelStep) state.level += Number(d.levelStep);
    else if (d.flameSeries) {
      const series = W.series.find(s => s.id === d.flameSeries);
      if (!series) return;
      state.weaponSeries = series.id; state.level = series.level;
    }
    else if (d.addflame) { if (state.flameConds.length < MAX_FLAME_GOALS && !state.flameConds.some(c => c.id === d.addflame)) state.flameConds.push({ kind: 'opt', id: d.addflame, minTier: 6 }); }
    else if (d.addgrade) { if (state.flameConds.length < MAX_FLAME_GOALS && !state.flameConds.some(c => c.kind === 'grade')) state.flameConds.push({ kind: 'grade', min: 100 }); }
    else if (d.delcond !== undefined) state.flameConds.splice(Number(d.delcond), 1);
    else if (d.tier !== undefined) state.flameConds[Number(d.cond)].minTier = Number(d.tier);
    else if (d.mvp !== undefined) state.star.mvp = Number(d.mvp);
    else if (d.sf) state.star[d.sf] = !state.star[d.sf];
    else if (d.shining) { const on = !SHINING.every(k => state.star[k]); SHINING.forEach(k => { state.star[k] = on; }); }
    else if (d.miracle === 'pot' || d.miracle === 'addi') state.miracle[d.miracle] = !state.miracle[d.miracle];
    else if (d.grade) { const c = cfgOf(d.grade); c.from = Number(d.i); if (c.to < c.from) c.to = 3; }
    else if (d.goal) { const c = cfgOf(d.goal); c.to = Number(d.i); if (c.from > c.to) c.from = c.to; }
    else if (d.addSet) {
      const c = cfgOf(d.addSet);
      if (c.sets.length >= MAX_SETS) return;
      c.sets.push({ rows: [] }); c.active = c.sets.length - 1;
    }
    else if (d.activateSet) cfgOf(d.activateSet).active = Number(d.set);
    else if (d.removeSet) {
      const c = cfgOf(d.removeSet), index = Number(d.set);
      c.sets.splice(index, 1);
      if (c.active > index) c.active--;
      else if (c.active === index) c.active = Math.min(index, c.sets.length - 1);
    }
    else if (d.any) { const r = rowsOf(d.pot, d.set)[Number(d.row)]; r.any = !r.any; }
    else if (d.addpot) {
      const cur = cfgOf(d.addpot);
      if (cur.rows.length >= MAX_GOALS) return;
      if (cur.rows.some(r => r.key === d.key)) return;
      const b = bracketOf(d.addpot === 'pot' ? 'black' : 'addi', state.part, state.level, RANKS[cur.to]);
      const info = b && keysOf(b).get(d.key);
      cur.rows.push({ key: d.key, min: (d.key.includes('|') && info) ? Math.min(...info.values) : 1 });
    }
    else if (d.delpot) rowsOf(d.delpot, d.set).splice(Number(d.row), 1);
    else if (d.val !== undefined) rowsOf(d.pot, d.set)[Number(d.row)].min = d.val;
    else if (d.more) state.showAll[d.more] = !state.showAll[d.more];
    else return;
    refresh();
  });

  // 입력 중에도 바로 다시 계산하되, 커서가 날아가지 않도록 렌더 뒤 포커스를 돌려준다.
  document.addEventListener('input', e => {
    const el = e.target, d = el.dataset;
    if (el.id === 'level') {
      if (el.value === '') return;
      state.level = Math.min(250, Number(el.value));
      if (Number(el.value) > 250) el.value = 250;
    }
    else if (el.id === 'basePrice') { state.base = parseMeso(el.value); el.value = comma(state.base); }
    else if (el.id === 'starStart') { if (el.value === '') return; state.star.start = Number(el.value); }
    else if (el.id === 'starGoal') { if (el.value === '') return; state.star.goal = Number(el.value); }
    // 조건 줄 안의 입력칸은 다시 그리면 커서가 날아가므로 결과만 갱신하고, 수치 칩만 손으로 맞춘다
    else if (d.cond !== undefined) {
      state.flameConds[Number(d.cond)].min = Number(el.value);
      refreshOutputs();
      return;
    }
    else if (d.pot !== undefined && d.row !== undefined) {
      const cur = cfgOf(d.pot), row = rowsOf(d.pot, d.set)[Number(d.row)];
      row.min = el.value;
      const b = bracketOf(d.pot === 'pot' ? 'black' : 'addi', state.part, state.level, RANKS[cur.to]);
      const values = b ? reachableSums(b, row.key).flatMap(g => g.sums).sort((a, x) => a - x) : [];
      const hit = values.find(v => v >= Number(el.value) - 1e-9);
      document.querySelectorAll('.ic-tier[data-pot="' + d.pot + '"][data-set="' + d.set + '"][data-row="' + d.row + '"]')
        .forEach(c => c.classList.toggle('active', Number(c.dataset.val) === hit));
      $('hit-' + d.pot + '-' + d.set + '-' + d.row).innerHTML = potentialHitNote(row, values);
      $('summary-' + d.pot + '-' + d.set).innerHTML = potentialSummary(cur.sets[Number(d.set)]);
      refreshOutputs();
      return;
    }
    else return;
    const id = el.id;
    refresh();
    if (id && $(id)) $(id).focus();
  });

  document.addEventListener('change', e => {
    if (e.target.id && e.target.id.startsWith('on-')) {
      state.on[e.target.id.slice(3)] = e.target.checked;
      refresh();
    }
    else if (e.target.id === 'flameWeapon') { state.weapon = e.target.value; refresh(); }
    else if (e.target.dataset?.required !== undefined) {
      const allowed = availableFlameTiers();
      state.flameConds[Number(e.target.dataset.required)].minTier = Math.max(Math.min(...allowed), Math.min(Math.max(...allowed), Math.ceil(Number(e.target.value) || Math.min(...allowed))));
      refresh();
    }
    else if (e.target.id === 'part') { state.part = e.target.value; state.flameConds = defaultFlameConds(state.part); refresh(); }
  });


  document.addEventListener('DOMContentLoaded', () => {
    $('dataSource').textContent = '잠재 옵션표 ' + DATA.fetchedAt + ' 수집 · 추가옵션 · 스타포스는 공식 확률 공개 기준';
    refresh();
  });
})();
