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
  const SF = window.StarforceCalc;
  const SFD = window.StarforceData;

  // ---------------------------------------------------------------- 부위

  // cube_option_data.js의 장비 분류 = 잠재능력 확률표의 키. 추가옵션은 여기에 자기 규칙이 따로 있다.
  //   flame: 'weapon' 무기 옵션표 · 'armor' 그 외 장비 옵션표 · null 추가옵션이 안 붙는 부위
  const PARTS = [
    { key: '무기', flame: 'weapon' },
    { key: '엠블렘', flame: 'weapon' },
    { key: '보조무기(포스실드, 소울링 제외)', short: '보조무기', flame: null },
    { key: '포스실드, 소울링', short: '포스실드·소울링', flame: null },
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
    { key: '기계심장', flame: 'armor' }
  ];
  const partOf = key => PARTS.find(p => p.key === key);

  const RANKS = ['레어', '에픽', '유니크', '레전드리'];
  const RANK_COLORS = ['#7cd4ff', '#b58cff', '#ffa94d', '#6bd98a'];
  const MVP_OPTIONS = [[0, '없음'], [0.03, '실버'], [0.05, '골드'], [0.10, '다이아']];
  const MAX_GOALS = 3;
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
    level: 200, part: '무기', boss: true, base: 0,
    flame: 'mesoReset', flameConds: [],
    // 기본값은 샤이닝 스타포스가 열린 때 기준. 파괴방지는 노작값을 보고 자동으로 정한다.
    star: { start: 0, goal: 22, mvp: 0, pcRoom: false, discount30: true, destroyDown30: true, lucky5: true },
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
      if (state[k] && typeof state[k] === 'object' && !Array.isArray(state[k])) Object.assign(state[k], saved[k]);
      else state[k] = saved[k];
    }
  } catch (e) {}
  if (!partOf(state.part)) state.part = '무기';
  if (!Array.isArray(state.flameConds)) state.flameConds = [];
  if (!F.FLAMES[state.flame]) state.flame = 'mesoReset';
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
    if (!state.on.flame || !part.flame || !state.flameConds.length) return null;
    const p = F.probability({
      level: state.level, weapon: part.flame === 'weapon', boss: state.boss,
      flame: state.flame, conds: state.flameConds
    });
    return stage(p, F.FLAMES[state.flame].meso, 1);
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
      const tries = cubeExpected(grade.p[i], grade.cap[i]);
      steps.push({ label: RANKS[i] + ' → ' + RANKS[i + 1], p: grade.p[i], cap: grade.cap[i], tries, price: prices[i] });
      min += prices[i];
      avg += tries * prices[i];
    }
    const need = cur.rows.map(r => [r.key, Number(r.min)]).filter(g => g[0] && g[1] > 0);
    let opt = null;
    if (need.length) {
      const b = bracketOf(cfg.dataKey, state.part, state.level, RANKS[cur.to]);
      const p = b ? successProb(b.lines, [need]) : 0;
      opt = stage(p, prices[cur.to], cur.from < cur.to ? 0 : 1);
      opt.missing = !b;
      min += opt.min;
      avg += opt.avg;
    }
    return { label: cfg.label, icon: cfg.icon, min, avg, steps, opt };
  }

  function compute() {
    const flame = flameResult();
    // 파괴되면 노작을 다시 사고 추가옵션도 다시 띄워야 한다
    const flameAvg = flame && Number.isFinite(flame.avg) ? flame.avg : 0;
    const spare = state.base + flameAvg;
    const star = (state.on.star && state.star.goal > state.star.start) ? starResult(spare) : null;
    const pot = potentialResult({ state: state.pot, short: 'pot', official: 'potential', gradeCube: 'potentialMeso', dataKey: 'black', label: '잠재능력', icon: '🎲' });
    const addi = potentialResult({ state: state.addi, short: 'addi', official: 'additional', gradeCube: 'addReset', dataKey: 'addi', label: '에디셔널 잠재능력', icon: '✨' });

    const parts = [
      { label: '노작 (베이스 아이템)', kind: 'base', min: state.base, avg: state.base },
      // 불꽃은 메소가 0이어도 몇 개 쓰는지는 보여줘야 하므로 비용이 0이라도 남긴다
      flame && { label: '추가옵션', kind: 'flame', min: flame.min, avg: flame.avg, data: flame, keep: true },
      star && { label: '스타포스', kind: 'star', min: star.min, avg: star.avg, data: star },
      { label: '잠재능력', kind: 'pot', min: pot.min, avg: pot.avg, data: pot },
      { label: '에디셔널 잠재능력', kind: 'addi', min: addi.min, avg: addi.avg, data: addi }
    ].filter(Boolean).filter(x => x.keep || x.min > 0 || x.avg > 0);

    return {
      parts, flame, star, pot, addi, spare,
      min: parts.reduce((s, x) => s + x.min, 0),
      avg: parts.reduce((s, x) => s + x.avg, 0)
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
    $('bossGear').checked = state.boss;
    const br = costBracket(state.level);
    $('itemNote').innerHTML = '재설정 비용 구간 ' + LEVEL_BRACKETS.find(([lv]) => lv === br)[1] +
      ' · 레전드리 잠재 재설정 1회 ' + fmt(PRICE_TABLES.potential[br][LEGENDARY]) + ' 메소';
    // 보스 장비 여부로 추가옵션 확률이 수백 배 갈리는데 체크박스 하나라 놓치기 쉽다.
    // 종결급을 쓰는 레벨대에서 꺼져 있으면 경고한다.
    $('bossWarn').classList.toggle('hidden', state.boss || state.level < BOSS_GEAR_LEVEL);
  }
  // 이 레벨대 장비는 사실상 전부 보스 드롭이거나 보스 재료로 만든다
  const BOSS_GEAR_LEVEL = 160;

  function renderFlame() {
    const part = partOf(state.part);
    if (!part.flame) {
      $('flameBody').innerHTML = '<p class="ic-empty">' + esc(part.short || part.key) + '에는 추가옵션이 붙지 않습니다.</p>';
      return;
    }
    const weapon = part.flame === 'weapon';
    const list = F.candidates(state.level, weapon);
    const tiers = F.tiers(state.boss);
    const used = state.flameConds;
    const full = used.length >= MAX_GOALS;

    const condHtml = used.map((c, i) => {
      if (c.kind === 'grade') {
        return '<div class="ic-row">' +
          '<span class="ic-row-name">주스탯 환산 급수<small>' + esc(GRADE_HINT(weapon)) + '</small></span>' +
          '<span class="ic-row-val"><input type="number" min="0" step="1" class="ic-num" data-cond="' + i + '" value="' + esc(c.min) + '"> 급 이상</span>' +
          '<button type="button" class="ic-x" data-delcond="' + i + '">×</button></div>';
      }
      const o = F.BY_ID[c.id];
      const tierChips = tiers.map((t, k) =>
        '<button type="button" class="ic-tier' + (Number(c.minTier) === t ? ' active' : '') + '" data-cond="' + i + '" data-tier="' + t + '">' +
        (5 - k) + '추<small>' + t + '단계</small></button>').join('');
      return '<div class="ic-row">' +
        '<span class="ic-row-name">' + esc(o.label) + (o.unit || '') + '</span>' +
        '<span class="ic-row-val">' + c.minTier + '단계 이상</span>' +
        '<button type="button" class="ic-x" data-delcond="' + i + '">×</button>' +
        '<span class="ic-tiers">' + tierChips + '</span></div>';
    }).join('');

    const gradePick = used.some(c => c.kind === 'grade') ? ''
      : '<button type="button" class="ic-pick" data-addgrade="1"' + (full ? ' disabled' : '') + '>주스탯 급수</button>';
    // 주스탯·올스탯·HP 같은 건 급수 하나로 다 들어가므로, 따로 걸 만한 것만 앞에 둔다
    const pick = o => '<button type="button" class="ic-pick" data-addflame="' + o.id + '"' + (full ? ' disabled' : '') + '>' + esc(o.label) + (o.unit || '') + '</button>';
    const free = list.filter(o => !used.some(c => c.kind === 'opt' && c.id === o.id));
    const primary = free.filter(o => FLAME_PRIMARY.includes(o.id));
    const others = free.filter(o => !FLAME_PRIMARY.includes(o.id));
    const price = F.FLAMES[state.flame].meso;

    $('flameBody').innerHTML =
      '<div class="ic-sub">무엇으로 돌리나요</div>' +
      '<div class="ic-chips">' + Object.keys(F.FLAMES).map(k => chip(F.FLAMES[k].name, state.flame === k, 'data-flame="' + k + '"')).join('') + '</div>' +
      '<p class="ic-note">' + (price
        ? '1회 <b>' + fmt(price) + '</b> 메소. 확률은 검은 · 영원한 환생의 불꽃과 같습니다.'
        : '불꽃은 아이템이라 메소가 들지 않습니다. 메소로 돌리려면 <b>추가옵션 재설정 (메소)</b>을 고르세요.') + '</p>' +
      '<div class="ic-sub">목표 추가옵션 <span class="ic-count">' + used.length + '/' + MAX_GOALS + '</span></div>' +
      (condHtml || '<p class="ic-empty">아래에서 원하는 추가옵션을 눌러 조건을 넣으세요. 넣지 않으면 추가옵션 단계는 빼고 계산합니다.</p>') +
      '<div class="ic-picks">' + gradePick + primary.map(pick).join('') + '</div>' +
      (others.length ? '<button type="button" class="ic-more" data-more="flame">' +
        (state.showAll.flame ? '다른 옵션 접기 ▴' : '다른 옵션 펼치기 (' + others.length + ') ▾') + '</button>' +
        '<div class="ic-picks' + (state.showAll.flame ? '' : ' hidden') + '">' + others.map(pick).join('') + '</div>' : '') +
      '<details class="ic-assume"><summary>단계별로 붙는 수치 보기 (Lv.' + state.level + ' · ' +
        (state.boss ? '보스 장비 3~7단계' : '일반 1~5단계') + ')</summary>' +
      '<div class="ic-scroll">' + tierTable(list, tiers, weapon) + '</div></details>';
  }

  // 주스탯 환산 급수: 주스탯 1 = 1, 올스탯 1% = 10, 공격력(마력) 1 = 4.
  // 어느 스탯을 주스탯으로 잡든 확률이 같아서 스탯을 따로 고를 필요가 없다.
  const GRADE_HINT = weapon => '주스탯 1 · 올스탯 1% = 10' +
    (weapon ? ' · 무기는 공·마 수치를 몰라 제외' : ' · 공격력(마력) 1 = 4');
  // 스탯·HP·이속 같은 건 급수 하나에 다 녹아 있어서, 따로 걸 만한 것만 앞줄에 둔다
  const FLAME_PRIMARY = ['ATT', 'MATT', 'BOSS_DMG', 'DMG'];

  function tierTable(list, tiers, weapon) {
    const head = tiers.map((t, k) => '<th>' + (5 - k) + '추<small>' + t + '단계</small></th>').join('');
    const rows = list.map(o => {
      const cells = tiers.map(t => {
        if (weapon && o.weaponTierOnly) return '<td class="dim">무기마다 다름</td>';
        const v = o.value(state.level, t);
        return '<td>' + (v > 0 ? '+' : '') + fmt(v) + (o.unit || '') + '</td>';
      }).join('');
      return '<tr><td class="ic-optname">' + esc(o.label) + '</td>' + cells + '</tr>';
    }).join('');
    return '<table class="data-table"><thead><tr><th>옵션</th>' + head + '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // 단계마다 "계산에 포함" 스위치. 이미 되어 있는 아이템을 사서 나머지만 작할 때 끈다.
  const STAGES = [['flame', 'flamePanel'], ['star', 'starPanel'], ['pot', 'potPanel'], ['addi', 'addiPanel']];
  function renderToggles() {
    STAGES.forEach(([key, panel]) => {
      $('on-' + key).checked = state.on[key];
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

    const rows = cur.rows.map((r, i) => {
      const info = keys.get(r.key);
      const values = info ? [...info.values].sort((a, x) => a - x) : [];
      const isCount = !r.key.includes('|');
      return '<div class="ic-row' + (info ? '' : ' missing') + '">' +
        '<span class="ic-row-name">' + esc(potLabel(r.key)) +
          (info ? '<small>' + (MAIN_STATS.includes(r.key) ? '올스탯 포함 · ' : '') +
            '세 줄 합산 · 최대 ' + fmt(maxTotal(b, r.key)) + esc(keyUnit(r.key)) + '</small>' : '') +
          (info ? '' : '<small class="bad">이 부위·레벨에는 없는 옵션</small>') + '</span>' +
        (isCount ? '<span class="ic-row-val">1줄 이상</span>'
          : '<span class="ic-row-val"><input type="number" min="0" step="any" class="ic-num" data-pot="' + cfg.short + '" data-row="' + i + '" value="' + esc(r.min) + '"> ' + esc(keyUnit(r.key)) + ' 이상</span>') +
        '<button type="button" class="ic-x" data-delpot="' + cfg.short + '" data-row="' + i + '">×</button>' +
        (isCount ? '' : '<span class="ic-tiers">' + values.map(v =>
          '<button type="button" class="ic-tier' + (Number(r.min) === v ? ' active' : '') + '" data-pot="' + cfg.short + '" data-row="' + i + '" data-val="' + v + '">' + v + '</button>').join('') + '</span>') +
        '</div>';
    }).join('');

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
      '<div class="ic-sub">목표 옵션 <small>' + RANKS[cur.to] + ' 옵션표 기준</small> <span class="ic-count">' + cur.rows.length + '/' + MAX_GOALS + '</span></div>' +
      (b ? '' : '<p class="ic-empty bad">' + esc(state.part) + '은(는) ' + RANKS[cur.to] + ' 확률표에 없어 옵션 계산을 할 수 없습니다.</p>') +
      (rows || '<p class="ic-empty">옵션을 고르지 않으면 등급업 비용만 계산합니다.</p>') +
      '<div class="ic-picks">' + primary.map(pick).join('') + '</div>' +
      (others.length ? '<button type="button" class="ic-more" data-more="' + cfg.short + '">' +
        (open ? '다른 옵션 접기 ▴' : '다른 옵션 펼치기 (' + others.length + ') ▾') + '</button>' +
        '<div class="ic-picks' + (open ? '' : ' hidden') + '">' + others.map(pick).join('') + '</div>' : '');
  }

  function renderResult(r) {
    $('resMin').textContent = mesoText(r.min);
    $('resAvg').textContent = mesoText(r.avg);
    $('resMinSub').textContent = fmt(r.min) + ' 메소';
    $('resAvgSub').textContent = Number.isFinite(r.avg) ? fmt(r.avg) + ' 메소' : '지금 조건은 나올 수 없습니다';
    $('resRatio').textContent = (r.min > 0 && Number.isFinite(r.avg))
      ? '평균은 대박의 ' + (r.avg / r.min).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '배'
      : '';

    const body = r.parts.map(p =>
      '<tr><td>' + esc(p.label) + '</td>' +
      '<td class="strong">' + mesoText(p.min) + '</td>' +
      '<td class="strong">' + mesoText(p.avg) + '</td>' +
      '<td class="ic-note">' + esc(detailOf(p)) + '</td></tr>').join('');
    $('breakdown').innerHTML = '<table class="data-table">' +
      '<thead><tr><th>단계</th><th>대박</th><th>평균</th><th>내용</th></tr></thead>' +
      '<tbody>' + (body || '<tr><td colspan="4">값을 넣으면 계산합니다.</td></tr>') + '</tbody></table>';

    $('stageDetail').innerHTML = [flameDetail(r.flame), starDetail(r.star), potDetail(r.pot), potDetail(r.addi)]
      .filter(Boolean).join('');
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
      : F.BY_ID[c.id].label + (F.BY_ID[c.id].unit || '') + ' ' + c.minTier + '단계 이상').join(' + ');
    return '<div class="ic-card"><h3>🔥 추가옵션</h3>' +
      '<p class="ic-note">' + esc(F.FLAMES[state.flame].name) + ' · ' + esc(conds) + '</p>' +
      '<p class="ic-big">' + pctText(f.p) + '<small>한 번에 성공할 확률</small></p>' +
      '<p class="ic-note">평균 ' + fmt(f.tries) + '개 · ' +
      (f.price ? mesoText(f.avg) + ' 메소 (1회 ' + fmt(f.price) + ')' : '불꽃은 메소가 들지 않습니다') + '</p></div>';
  }
  function starDetail(s) {
    if (!s) return '';
    return '<div class="ic-card"><h3>⭐ 스타포스</h3>' +
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
    state.level = Math.min(300, Math.max(1, Math.round(Number(state.level) || 1)));
    state.star.start = Math.min(SFD.MAX_STAR - 1, Math.max(0, state.star.start));
    state.star.goal = Math.min(SFD.MAX_STAR, Math.max(0, state.star.goal));
    state.flameConds = state.flameConds.slice(0, MAX_GOALS);
    [['pot', state.pot], ['addi', state.addi]].forEach(([short, c]) => {
      if (!goalsFor(short).includes(c.to)) c.to = 3;
      const froms = fromsFor(short);
      if (!froms.includes(c.from)) c.from = froms[0];
      c.from = Math.min(c.from, c.to);
    });
    state.pot.rows = state.pot.rows.slice(0, MAX_GOALS);
    state.addi.rows = state.addi.rows.slice(0, MAX_GOALS);
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
    const r = compute();
    renderResult(r);
    renderSafeguard(r.star);
    save();
  }

  // ---------------------------------------------------------------- 이벤트

  const cfgOf = short => short === 'pot' ? state.pot : state.addi;

  document.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'bossFix') { state.boss = true; retierConds(); refresh(); return; }
    if (t.id === 'resetAll') {
      try { localStorage.removeItem(STORE_KEY); } catch (err) {}
      location.reload();
      return;
    }
    const d = t.dataset;
    if (d.flame) state.flame = d.flame;
    else if (d.addflame) { if (state.flameConds.length < MAX_GOALS) state.flameConds.push({ kind: 'opt', id: d.addflame, minTier: state.boss ? 6 : 4 }); }
    else if (d.addgrade) { if (state.flameConds.length < MAX_GOALS) state.flameConds.push({ kind: 'grade', min: 0 }); }
    else if (d.delcond !== undefined) state.flameConds.splice(Number(d.delcond), 1);
    else if (d.tier !== undefined) state.flameConds[Number(d.cond)].minTier = Number(d.tier);
    else if (d.mvp !== undefined) state.star.mvp = Number(d.mvp);
    else if (d.sf) state.star[d.sf] = !state.star[d.sf];
    else if (d.shining) { const on = !SHINING.every(k => state.star[k]); SHINING.forEach(k => { state.star[k] = on; }); }
    else if (d.grade) { const c = cfgOf(d.grade); c.from = Number(d.i); if (c.to < c.from) c.to = 3; }
    else if (d.goal) { const c = cfgOf(d.goal); c.to = Number(d.i); if (c.from > c.to) c.from = c.to; }
    else if (d.addpot) {
      const cur = cfgOf(d.addpot);
      if (cur.rows.length >= MAX_GOALS) return;
      if (cur.rows.some(r => r.key === d.key)) return;
      const b = bracketOf(d.addpot === 'pot' ? 'black' : 'addi', state.part, state.level, RANKS[cur.to]);
      const info = b && keysOf(b).get(d.key);
      cur.rows.push({ key: d.key, min: (d.key.includes('|') && info) ? Math.min(...info.values) : 1 });
    }
    else if (d.delpot) cfgOf(d.delpot).rows.splice(Number(d.row), 1);
    else if (d.val !== undefined) cfgOf(d.pot).rows[Number(d.row)].min = d.val;
    else if (d.more) state.showAll[d.more] = !state.showAll[d.more];
    else return;
    refresh();
  });

  // 입력 중에도 바로 다시 계산하되, 커서가 날아가지 않도록 렌더 뒤 포커스를 돌려준다.
  document.addEventListener('input', e => {
    const el = e.target, d = el.dataset;
    if (el.id === 'level') { if (el.value === '') return; state.level = Number(el.value); }
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
      cfgOf(d.pot).rows[Number(d.row)].min = el.value;
      document.querySelectorAll('.ic-tier[data-pot="' + d.pot + '"][data-row="' + d.row + '"]')
        .forEach(c => c.classList.toggle('active', Number(c.dataset.val) === Number(el.value)));
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
    else if (e.target.id === 'part') { state.part = e.target.value; state.flameConds = []; refresh(); }
    else if (e.target.id === 'bossGear') { state.boss = e.target.checked; retierConds(); refresh(); }
  });

  // 보스 장비는 3~7단계, 일반은 1~5단계라 조건에 걸어둔 단계가 범위를 벗어난다
  function retierConds() {
    const range = F.tiers(state.boss);
    state.flameConds.forEach(c => {
      if (c.kind === 'opt') c.minTier = Math.min(range[4], Math.max(range[0], c.minTier + (state.boss ? 2 : -2)));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('dataSource').textContent = '잠재 옵션표 ' + DATA.fetchedAt + ' 수집 · 추가옵션 · 스타포스는 공식 확률 공개 기준';
    refresh();
  });
})();
