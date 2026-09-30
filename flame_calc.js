// Standalone additional-option planner. Uses the same probability engine as item crafting.
(function () {
  'use strict';
  const F = window.FlameCore;
  const W = window.FlameWeapons;
  const $ = id => document.getElementById(id);
  const STORE = 'flameCraftCalc';
  const defaults = () => ({ level: 200, part: '무기', weapon: 'twohand_sword', weaponSeries: 'genesis', mainStat: 'STR', flame: 'mesoReset', blackMode: 'mesoReset', flameConds: [{ kind: 'opt', id: 'ATT', minTier: 6 }], showAll: { flame: false } });
  const PARTS = ['무기', '장비'];
  const LEGACY_ARMOR_PARTS = ['모자', '상의', '한벌옷', '하의', '신발', '장갑', '망토', '벨트', '얼굴장식', '눈장식', '귀고리', '펜던트'];
  const partOf = key => ({ key, flame: key === '무기' ? 'weapon' : 'armor' });
  const BOSS = true, MAX_GOALS = 4;
  const WEAPON_LEVELS = [150, 160, 200, 250];
  const selectedWeapon = () => state.part === '무기' ? W.resolve(state.weapon, state.weaponSeries) : null;
  const attackId = () => selectedWeapon()?.stat || (state.mainStat === 'INT' ? 'MATT' : 'ATT');
  let state = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (saved && typeof saved === 'object') {
      for (const key of ['part', 'weapon', 'weaponSeries', 'mainStat', 'flame', 'blackMode', 'flameConds']) if (saved[key] !== undefined) state[key] = saved[key];
      if (['black', 'mesoReset'].includes(state.flame)) state.blackMode = state.flame;
      if (saved.weapon === undefined) state.weapon = '';
    }
  } catch (_) {}
  // Open at Lv.200 even when an earlier session saved a different level.
  if (!W.series.some(s => s.id === state.weaponSeries && s.level === state.level)) state.weaponSeries = defaults().weaponSeries;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '∞';
  const statLabels = { STR: 'STR (주스탯 기준)', DEX: 'DEX', INT: 'INT', LUK: 'LUK' };
  const flameLabel = o => o.id === 'ATT' ? (selectedWeapon() ? (attackId() === 'MATT' ? '마력' : '공격력') : '공격력·마력') : o.stats ? o.stats.map(s => statLabels[s]).join(' + ') : o.label;
  function optionValue(o, tier) {
    if (state.part === '무기' && o.weaponTierOnly) return selectedWeapon()?.values[7 - tier] ?? null;
    return o.value(state.level, tier);
  }
  const valueText = (o, tier) => {
    const v = optionValue(o, tier);
    return v === null ? (selectedWeapon() ? '자료 미확인' : '무기·계열 확인') : (v > 0 ? '+' : '') + fmt(v) + (o.unit || '');
  };
  const chip = (label, active, attrs) => '<button type="button" class="ic-chip' + (active ? ' active' : '') + '" aria-pressed="' + active + '" ' + attrs + '>' + esc(label) + '</button>';
  function normalize() {
    state.level = Math.min(300, Math.max(1, Math.round(Number(state.level) || 200)));
    if (LEGACY_ARMOR_PARTS.includes(state.part)) state.part = '장비';
    if (!PARTS.includes(state.part)) state.part = '무기';
    if (!['STR', 'DEX', 'INT', 'LUK'].includes(state.mainStat)) state.mainStat = 'STR';
    // Preserve saved conditions by swapping the old main stat into the STR representative.
    if (state.mainStat !== 'STR' && Array.isArray(state.flameConds)) {
      const oldMain = state.mainStat;
      state.flameConds = state.flameConds.map(c => {
        const stats = c && F.BY_ID[c.id]?.stats;
        if (!stats) return c;
        const mapped = stats.map(s => s === oldMain ? 'STR' : s === 'STR' ? oldMain : s);
        const option = F.OPTIONS.find(o => o.stats && o.stats.length === mapped.length && o.stats.every(s => mapped.includes(s)));
        return { ...c, id: option.id };
      });
    }
    state.mainStat = 'STR';
    if (!['black', 'mesoReset'].includes(state.blackMode)) state.blackMode = 'mesoReset';
    if (!W.items.some(w => w.id === state.weapon)) state.weapon = '';
    state.weaponSeries = W.seriesForLevel(state.level, state.weaponSeries);
    if (!Object.hasOwn(F.FLAMES, state.flame)) state.flame = 'mesoReset';
    const valid = F.candidates(state.level, state.part === '무기').map(o => o.id);
    const seen = new Set();
    state.flameConds = (Array.isArray(state.flameConds) ? state.flameConds : []).filter(c => {
      if (!c || !['opt', 'grade'].includes(c.kind)) return false;
      const key = c.kind === 'grade' ? 'grade' : c.id;
      if (seen.has(key) || (c.kind === 'opt' && (!valid.includes(c.id) || c.id === 'MATT'))) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_GOALS).map(c => c.kind === 'grade'
      ? { kind: 'grade', min: Math.min(10000, Math.max(0, Math.round(Number(c.min) || 0))) }
      : { kind: 'opt', id: c.id, minTier: Math.min(7, Math.max(3, Math.round(Number(c.minTier) || 6))) });
  }

  function renderFlame() {
    if (selectedWeapon()?.special) {
      $('flameBody').innerHTML = '<p class="ic-note">제로 무기는 별도 규칙을 사용합니다. 아래 표에서 무기 공·마 1~5추 수치를 확인하세요. 목표 조합·확률 계산은 제로 이외의 무기를 선택하면 사용할 수 있습니다.</p>';
      return;
    }
    const part = partOf(state.part);
    if (!part.flame) {
      $('flameBody').innerHTML = '<p class="ic-empty">' + esc(part.short || part.key) + '에는 추가옵션이 붙지 않습니다.</p>';
      return;
    }
    const weapon = part.flame === 'weapon';
    // 공·마 중 자신의 직업에 필요한 하나를 대표한다. 두 확률을 더하지 않는다.
    const list = F.candidates(state.level, weapon).filter(o => o.id !== 'MATT');
    const tiers = F.tiers(BOSS).slice().reverse();
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
        (8 - t) + '추<small>' + valueText(o, t) + '</small></button>').join('');
      return '<div class="ic-row">' +
        '<span class="ic-row-name">' + esc(flameLabel(o)) + (o.unit || '') + '</span>' +
        '<span class="ic-row-val">' + (!weapon && ['ATT', 'ALL_PCT'].includes(c.id)
          ? '<input class="ic-num" type="number" min="3" max="7" step="1" data-required="' + i + '" aria-label="필수 ' + esc(flameLabel(o)) + ' 최소 수치" value="' + c.minTier + '">' + (o.unit || '') + ' 이상'
          : valueText(o, c.minTier) + ' 이상') + '</span>' +
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
    const price = 3000000;

    $('flameBody').innerHTML =
      '<div class="ic-sub">무엇으로 돌리나요</div>' +
      '<div class="fc-flames">' + [['abyss', '심연 불꽃', '심환불'], ['black', '검은 불꽃', '검환불'], ['burning', '타오르는 불꽃', '타환불']].map(([k, name, icon]) => {
        const active = state.flame === k || k === 'black' && state.flame === 'mesoReset';
        return '<button type="button" class="ic-chip fc-flame' + (active ? ' active' : '') + '" data-flame="' + k + '" aria-pressed="' + active + '" title="' + F.FLAMES[k].name + '"><img src="icons/CoinShop/' + icon + '.webp" alt="" width="28" height="32"><span>' + name + '</span></button>';
      }).join('') + '</div>' +
      '<p class=\"ic-note\">1회 <b>300만 메소</b> 고정</p>' +
      '<div class="ic-sub">목표 추가옵션 <span class="ic-count">' + used.length + '/' + MAX_GOALS + '</span></div>' +
      (condHtml || '<p class="ic-empty">아래에서 원하는 추가옵션을 눌러 조건을 넣으세요. 설정한 조건을 모두 만족하는 확률을 계산합니다.</p>') +
      '<p class="ic-note">공·마와 올스탯을 선택하면 해당 옵션을 반드시 포함하면서 목표 급수도 만족해야 합니다.</p>' +
      '<div class="ic-picks">' + (weapon ? primary.map(pick).join('') + gradePick : gradePick + primary.map(pick).join('')) + '</div>' +
      (others.length ? '<button type="button" class="ic-more" data-more="flame">' +
        (state.showAll.flame ? '세부 조건 접기 ▴' : '세부 조건 추가 ▾') + '</button>' +
        '<div class="ic-picks' + (state.showAll.flame ? '' : ' hidden') + '">' + others.map(pick).join('') + '</div>' : '') +
      (state.showAll.flame ? '<p class="ic-note">세부 스탯은 STR을 주스탯으로 대표 계산합니다. STR + DEX는 두 스탯이 함께 붙는 복합 추옵이며, 급수에는 STR 수치만 반영합니다.</p>' : '');
  }

  // 주스탯 환산 급수: 주스탯 1 = 1, 올스탯 1% = 10, 공격력(마력) 1 = 4.
  // 어느 스탯을 주스탯으로 잡든 확률이 같아서 스탯을 따로 고를 필요가 없다.
  const GRADE_HINT = weapon => '주스탯 1 · 올스탯 1% = 10' +
    (weapon ? ' · 무기 공·마는 급수 환산에서 제외' : ' · 공격력(마력) 1 = 4');
  // 스탯·HP·이속 같은 건 급수 하나에 다 녹아 있어서, 따로 걸 만한 것만 앞줄에 둔다
  const FLAME_PRIMARY = ['ATT', 'ALL_PCT', 'BOSS_DMG', 'DMG'];

  function tierTable(list, tiers, weapon) {
    const head = tiers.map(t => '<th>' + (8 - t) + '추</th>').join('');
    const rows = list.map(o => {
      const cells = tiers.map(t => {
        return '<td>' + valueText(o, t) + '</td>';
      }).join('');
      return '<tr><td class="ic-optname">' + esc(flameLabel(o)) + '</td>' + cells + '</tr>';
    }).join('');
    return '<table class="data-table"><thead><tr><th>옵션</th>' + head + '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function renderWeapon() {
    const weapon = selectedWeapon();
    $('weaponField').hidden = state.part !== '무기';
    $('weapon').value = state.weapon;
    $('weaponVariants').hidden = state.part !== '무기' || state.level !== 200;
    $('weaponVariants').innerHTML = W.series.filter(s => s.level === 200).map(s => chip(s.name, s.id === state.weaponSeries, 'data-series="' + s.id + '"')).join('');
    document.querySelectorAll('[data-level-step]').forEach(button => {
      const down = Number(button.dataset.levelStep) < 0;
      button.disabled = state.part === '무기' && (down ? state.level <= 150 : state.level >= 250);
      button.setAttribute('aria-label', state.part === '무기' ? (down ? '이전 무기 레벨' : '다음 무기 레벨') : (down ? '아이템 레벨 10 감소' : '아이템 레벨 10 증가'));
    });
    $('weaponSource').href = W.series.find(s => s.id === state.weaponSeries)?.source || W.source;
    const ids = weapon?.special ? ['ATT'] : (state.part === '무기' ? ['ATT', 'BOSS_DMG', 'DMG', 'ALL_PCT', state.mainStat] : ['ATT', 'ALL_PCT', state.mainStat]);
    const valid = F.candidates(state.level, state.part === '무기').map(o => o.id);
    $('weaponTable').innerHTML = '<div class="ic-scroll">' + tierTable(ids.filter(id => valid.includes(id)).map(id => F.BY_ID[id]), [7, 6, 5, 4, 3], state.part === '무기') + '</div>';
    $('allOptionTable').innerHTML = weapon?.special ? '' : '<details class="ic-assume"><summary>전체 옵션의 단계별 수치 보기</summary><div class="ic-scroll">' + tierTable(F.candidates(state.level, state.part === '무기').filter(o => o.id !== 'MATT'), [7, 6, 5, 4, 3], state.part === '무기') + '</div></details>';
  }

  function renderTotal() {
    if (selectedWeapon()?.special) {
      $('optionTotal').innerHTML = '<p class="ic-note">제로 무기는 공·마 참고표만 제공합니다.</p>';
      return;
    }
    const totals = { STR: 0, DEX: 0, INT: 0, LUK: 0, ATT: 0, BOSS_DMG: 0, DMG: 0, ALL_PCT: 0 };
    const unknown = new Set();
    const conds = state.flameConds.filter(c => c.kind === 'opt');
    for (const c of conds) {
      const o = F.BY_ID[c.id], value = optionValue(o, c.minTier);
      if (value === null) { unknown.add(c.id); continue; }
      if (o.stats) o.stats.forEach(stat => { totals[stat] += value; });
      else totals[c.id] = (totals[c.id] || 0) + value;
    }
    const gradeGoal = state.flameConds.find(c => c.kind === 'grade' && c.min > 0);
    const includedGrade = conds.reduce((sum, c) => {
      const option = F.BY_ID[c.id];
      const weight = F.gradeWeight(option, state.part === '무기', state.mainStat);
      return sum + (weight ? weight * optionValue(option, c.minTier) : 0);
    }, 0);
    const remainingGrade = gradeGoal ? Math.max(0, gradeGoal.min - includedGrade) : 0;
    const ids = [...new Set([...unknown, ...Object.keys(totals).filter(id => totals[id] !== 0)])];
    $('optionTotal').innerHTML = '<p class="fc-target">' + esc(selectedWeapon()?.name || ('Lv.' + state.level + ' ' + state.part)) + '</p>' +
      (conds.length ? '<dl class="fc-totals">' + ids.map(id => '<div><dt>' + esc(flameLabel(F.BY_ID[id])) + '</dt><dd data-total="' + id + '">' + (unknown.has(id) ? '무기·계열 확인' : (totals[id] > 0 ? '+' : '') + fmt(totals[id]) + (F.BY_ID[id].unit || '')) + '</dd></div>').join('') + '</dl>'
      : '') + (gradeGoal ? '<dl class="fc-totals"><div><dt>' + (includedGrade ? '나머지 주스탯 환산' : '주스탯 환산') + '</dt><dd id="remainingGrade">' + fmt(remainingGrade) + '급 이상</dd></div></dl>' +
        (includedGrade ? '<p class="ic-note">필수 옵션 최소 수치 기준 · ' + fmt(gradeGoal.min) + ' − ' + fmt(includedGrade) + ' = ' + fmt(remainingGrade) + '급</p>' : '') : '');
  }
  function renderResult() {
    if (selectedWeapon()?.special) {
      $('flameResult').innerHTML = '<p class="ic-note">제로 무기의 별도 생성 규칙은 확률 계산에 반영하지 않았습니다.</p>';
      return;
    }
    const conds = state.flameConds.filter(c => c.kind === 'opt' || c.min > 0);
    if (!conds.length) {
      $('flameResult').innerHTML = '<p class="fc-empty">목표 옵션을 추가해 주세요.<br><small>주스탯 급수는 1 이상을 입력하세요.</small></p>';
      return;
    }
    const probabilityConds = conds.map(c => c.id === 'ATT' ? { ...c, id: attackId() } : c);
    const p = F.probability({ level: state.level, weapon: state.part === '무기', boss: BOSS, flame: state.flame, conds: probabilityConds, mainStat: state.mainStat });
    if (!(p > 0)) {
      $('flameResult').innerHTML = '<p class="fc-empty">현재 불꽃으로는 달성할 수 없는 목표입니다.<br><small>불꽃 종류를 바꾸거나 목표 단계·급수를 낮춰 주세요.</small></p>';
      return;
    }
    const price = 3000000;
    const pct = (p * 100).toLocaleString('ko-KR', { maximumSignificantDigits: 4 });
    $('flameResult').innerHTML =
      '<div class="fc-prob"><span>한 번에 성공할 확률</span><strong>' + pct + '<small>%</small></strong></div>' +
      '<dl class="fc-metrics"><div><dt>평균 사용량</dt><dd>' + (1 / p).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '회</dd></div>' +
      '<div><dt>평균 메소 비용</dt><dd>' + fmt(price / p) + '<small>메소</small></dd></div></dl>' +
      '<h3>누적 성공 확률별 사용량</h3><div class="fc-chances">' +
      [0.5, 0.9, 0.95, 0.99].map(q => {
        const count = p >= 1 ? 1 : Math.ceil(Math.log1p(-q) / Math.log1p(-p));
        return '<article class="fc-chance"><span>성공 확률 ' + Math.round(q * 100) + '%</span><strong>' + fmt(count) + '회</strong><small>' + fmt(count * price) + ' 메소</small></article>';
      }).join('') + '</div>';
  }
  function refresh() {
    normalize();
    $('level').value = state.level;
    $('part').value = state.part;
    renderWeapon();
    renderFlame();
    renderTotal();
    renderResult();
    document.querySelectorAll('[data-delcond]').forEach(el => el.setAttribute('aria-label', '목표 옵션 삭제'));
    document.querySelectorAll('[data-tier]').forEach(el => el.setAttribute('aria-pressed', el.classList.contains('active')));
    document.querySelectorAll('input[data-cond]').forEach(el => el.setAttribute('aria-label', '목표 주스탯 환산 급수'));
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) {}
  }
  $('part').innerHTML = PARTS.map(p => '<option value="' + p + '">' + (p === '장비' ? '장비 (방어구·장신구)' : p) + '</option>').join('');
  $('weapon').innerHTML = '<option value="">무기 종류 선택</option>' + ['전사', '마법사', '궁수', '도적', '해적'].map(job => '<optgroup label="' + job + '">' + W.items.filter(w => w.job === job).map(w => '<option value="' + w.id + '">' + esc(w.special ? (w.id === 'lazuli' ? '제로 · 라즐리 (태도)' : '제로 · 라피스 (대검)') : w.type) + '</option>').join('') + '</optgroup>').join('');
  document.querySelector('main').addEventListener('click', e => {
    const el = e.target.closest('button');
    if (!el) return;
    const d = el.dataset;
    if (el.id === 'resetAll') state = defaults();
    else if (d.flame) state.flame = d.flame === 'black' ? 'mesoReset' : d.flame;
    else if (d.series) state.weaponSeries = d.series;
    else if (d.addflame && state.flameConds.length < MAX_GOALS) state.flameConds.push({ kind: 'opt', id: d.addflame, minTier: 6 });
    else if (d.addgrade && state.flameConds.length < MAX_GOALS) state.flameConds.push({ kind: 'grade', min: 100 });
    else if (d.delcond !== undefined) state.flameConds.splice(Number(d.delcond), 1);
    else if (d.tier) state.flameConds[Number(d.cond)].minTier = Number(d.tier);
    else if (d.more) state.showAll.flame = !state.showAll.flame;
    else if (d.levelStep) {
      const direction = Number(d.levelStep);
      state.level = state.part === '무기'
        ? (direction > 0 ? WEAPON_LEVELS.find(n => n > state.level) ?? 250 : [...WEAPON_LEVELS].reverse().find(n => n < state.level) ?? 150)
        : state.level + direction;
    }
    else return;
    refresh();
  });
  document.querySelector('main').addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'level') state.level = Number(el.value);
    else if (el.id === 'weapon') {
      state.weapon = el.value;
    }
    else if (el.id === 'part') {
      const wasWeapon = state.part === '무기';
      state.part = el.value;
      if (state.part === '무기') state.flameConds = defaults().flameConds;
      else if (wasWeapon) state.flameConds = [{ kind: 'grade', min: 100 }];
    } else if (el.dataset.required !== undefined) state.flameConds[Number(el.dataset.required)].minTier = Math.ceil(Number(el.value));
    else if (el.dataset.cond !== undefined) state.flameConds[Number(el.dataset.cond)].min = Number(el.value);
    else return;
    refresh();
  });
  refresh();
})();
