const TABS = [['potential','잠재능력'],['additional','에디셔널 잠재능력']];
const RANKS = ['레어', '에픽', '유니크', '레전드리'];
const CUBES = CUBE_METHODS;
const legacyMethods = { artisan:'meisterMax', addiMeso:'addReset', addi:'addWhite' };
const PART_GROUPS = [
  ['무보엠', ['무기', '보조무기(포스실드, 소울링 제외)', '포스실드, 소울링', '방패', '엠블렘']],
  ['장비', ['모자', '상의', '한벌옷', '하의', '신발', '장갑', '망토']],
  ['장신구', ['벨트', '어깨장식', '얼굴장식', '눈장식', '귀고리', '반지', '펜던트', '기계심장']]
];
const PART_SHORT = { '보조무기(포스실드, 소울링 제외)':'보조무기', '포스실드, 소울링':'포스실드·소울링' };
// 이 레벨 이상이 걸친 구간만 기본으로 보여주고, 나머지는 펼쳐서 고른다
const COMMON_LEVEL = 120;
// 해당하는 장비가 없는 레벨대. 계산은 그대로 되지만 기본 목록에서는 빼서 펼치기 안으로 넣는다
const NO_GEAR_RANGES = [[201, 249]];
const QUANTILES = [.5, .8, .9, .95, .99];
const MAX_ROWS = 3;
const MAX_SETS = 4;
const SET_NAMES = ['A', 'B', 'C', 'D'];

// 항목 키(potentialMeso 등) → cube_option_data.js의 큐브 키로 바꿔서 확률 구간을 찾는다
function findBracket(cube, part, level, rank = state.to){
  return CUBES[cube].data ? bracketOf(CUBES[cube].data, part, level, RANKS[rank]) : null;
}

// ---------- 상태 ----------
const STORE_KEY = 'cubeOptionCalc';
// sets: OR로 묶인 조건 세트들, 세트마다 rows(AND). active: 옵션 칩을 누르면 추가될 세트
let state = { tab:'potential', cube:'black', part:'무기', level:200, costLevel:200, from:0, to:3, gradeCube:null, miracle:false, actual:{}, sets:[{ rows:[] }], active:0 };
{
  const saved = JsonStorage.local.read(STORE_KEY) ?? {};
  if(Array.isArray(saved.rows) && !saved.sets) saved.sets = [{ rows:saved.rows }]; // 세트 생기기 전 저장값
  for(const k of Object.keys(state)) if(saved[k] !== undefined) state[k] = saved[k];
}
state.cube = legacyMethods[state.cube] ?? state.cube;
if (!CUBES[state.cube]?.data) state.cube = 'black';
state.gradeCube = CUBES[state.gradeCube]?.tab === CUBES[state.cube].tab ? state.gradeCube : state.cube;
state.from = Number.isInteger(state.from) && state.from >= 0 && state.from < RANKS.length ? state.from : 0;
state.to = Number.isInteger(state.to) && state.to >= state.from && state.to < RANKS.length ? state.to : 3;
state.actual = {};
setLevel(state.level);
state.tab = CUBES[state.cube].tab;
state.sets = (Array.isArray(state.sets) ? state.sets : []).slice(0, MAX_SETS)
  .map(set => ({ rows:(Array.isArray(set && set.rows) ? set.rows : []).filter(r => r && r.key).slice(0, MAX_ROWS)
    .map(r => HIDDEN_STAT_KEYS.includes(r.key) ? { ...r, key:MAIN_STAT_KEY } : r) }));
if(!state.sets.length) state.sets = [{ rows:[] }];
if(!(state.active < state.sets.length)) state.active = 0;
let showAllLevels = false;
function save(){ JsonStorage.local.write(STORE_KEY, state); }

const $ = id => document.getElementById(id);
function fmt(n){ return Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '∞'; }
function pctText(p){
  if(p <= 0) return '0%';
  const v = p * 100;
  return (v >= 1 ? v.toFixed(4) : v.toPrecision(4)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + '%';
}
function mesoText(n){
  if(!Number.isFinite(n)) return '∞';
  n = Math.round(n);
  const eok = Math.floor(n / 1e8), man = Math.round((n % 1e8) / 1e4);
  if(eok >= 10000) return `${fmt(Math.floor(eok / 10000))}조 ${fmt(eok % 10000)}억`;
  if(eok) return man ? `${fmt(eok)}억 ${fmt(man)}만` : `${fmt(eok)}억`;
  return `${fmt(man)}만`;
}
function iconImg(files){ return files.map(f => `<img src="icons/cube/${encodeURIComponent(f)}" alt="" onerror="this.remove()">`).join(''); }
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function attemptPrice(cube = state.cube, rank = state.to){
  return cubeMethodPrice(cube, state.level, rank);
}
function brackets(){
  const data = CUBES[state.cube].data;
  return partsOf(data, RANKS[state.to])[state.part] || partsOf(data)[state.part] || [];
}
// 확률 구간(201~250)과 재설정 비용 구간(200~249, 250~300)이 서로 다르게 끊긴다.
// 둘을 겹쳐서 잘라야 고른 레벨의 확률과 비용이 같이 맞는다.
function costRanges(){
  return LEVEL_BRACKETS.map(([min], i) => ({ min, max: i + 1 < LEVEL_BRACKETS.length ? LEVEL_BRACKETS[i + 1][0] - 1 : Infinity }));
}
function levelSegments(){
  const costs = costRanges();
  const segs = [];
  for(const b of brackets()){
    for(const c of costs){
      const min = Math.max(b.min, c.min), max = Math.min(b.max, c.max);
      if(min <= max) segs.push({ min, max });
    }
  }
  return segs;
}
function currentBracket(){ return findBracket(state.cube, state.part, state.level); }
// 아이템 레벨 하나로 확률 구간과 메소 재설정 비용 구간을 함께 정한다
function setLevel(level){
  state.level = Math.min(Math.max(Math.round(Number(level) || 0), 1), 300);
  state.costLevel = [...LEVEL_BRACKETS].reverse().find(([lv]) => state.level >= lv)[0];
}
// 고른 레벨이 이 부위·큐브 표에 없으면 가장 높은 구간으로 옮긴다
function ensureBracket(){
  if(brackets().some(bracket => bracket.min <= state.level && state.level <= bracket.max)) return;
  const list = brackets();
  if(list.length) setLevel(list[list.length - 1].max);
}


// STR·DEX·INT·LUK는 확률이 같아 "주스탯 %" 하나로 묶어 보여준다
const optLabel = key => key === MAIN_STAT_KEY ? '주스탯 %' : keyLabel(key);

function needOf(set){
  const sums = new Map();
  for(const r of set.rows){
    const v = Number(r.min);
    if(!r.key || !(v > 0)) continue;
    sums.set(r.key, (sums.get(r.key) || 0) + v);
  }
  return [...sums];
}
// "아무 스탯이나" 행은 STR·DEX·INT·LUK 각각으로 갈라서 OR 조건을 늘린다.
// 나머지 행은 그대로 따라붙으므로 "보스뎀 30 AND (주스탯 21 중 아무거나)"가 정확히 계산된다.
function setVariants(set){
  if(!set.rows.some(r => r.any && r.key === MAIN_STAT_KEY)) return [needOf(set)];
  return MAIN_STATS.map(stat => needOf({ rows:set.rows.map(r => r.any && r.key === MAIN_STAT_KEY ? { ...r, key:stat } : r) }));
}
function goalsOf(){ return state.sets.flatMap(setVariants).filter(g => g.length); }
function resetGoals(){ state.sets = [{ rows:[] }]; state.active = 0; }

// ---------- 그리기 ----------
function renderTabs(){
  $('kindTabs').innerHTML = TABS.map(([key, label]) => {
    const icon = CUBES[Object.keys(CUBES).find(k => CUBES[k].tab === key)].icons.slice(0, 1);
    return `<button type="button" class="rank-chip tab-chip ux-choice ${state.tab === key ? 'active' : ''}" aria-pressed="${state.tab === key}" data-tab="${key}">${iconImg(icon)}<span>${label}</span></button>`;
  }).join('');
}

function renderParts(){
  $('partGroups').innerHTML = PART_GROUPS.map(([title, parts]) => `
    <div class="part-group">
      <div class="part-group-title">${title}</div>
      <div class="part-chips">${parts.map(p => `<button type="button" class="part-chip ux-choice ${p === state.part ? 'active' : ''}" aria-pressed="${p === state.part}" data-part="${esc(p)}" title="${esc(p)}">${esc(PART_SHORT[p] || p)}</button>`).join('')}</div>
    </div>`).join('');
}

function renderLevels(){
  const list = levelSegments();
  const cur = list.find(s => s.min <= state.level && state.level <= s.max);
  const hidden = s => s.max < COMMON_LEVEL || NO_GEAR_RANGES.some(([min, max]) => s.min >= min && s.max <= max);
  const common = list.filter(s => !hidden(s));
  const rest = list.filter(hidden);
  // 펼치지 않았어도 지금 고른 구간이 숨은 쪽이면 보여준다
  const open = showAllLevels || (cur && hidden(cur));
  const card = b => `<button type="button" class="level-card ${b === cur ? 'active' : ''}" aria-pressed="${b === cur}" data-level="${b.min}">${b.min === b.max ? b.min : `${b.min}~${b.max}`}<small>레벨</small></button>`;
  $('levelCards').innerHTML = `
    <div class="level-row">${common.map(card).join('') || '<span class="tiny">120레벨 이상 구간이 없는 부위예요. 아래에서 골라주세요.</span>'}</div>
    ${rest.length ? `<button type="button" class="more-toggle" id="levelMore">${open ? '다른 레벨 구간 접기 ▴' : `다른 레벨 구간 펼치기 (${rest.length}) ▾`}</button>
    <div class="level-row ${open ? '' : 'hidden'}">${rest.map(card).join('')}</div>` : ''}`;
}

function renderCost(){
  const input = $('itemLevel');
  if(document.activeElement !== input) input.value = state.level;
  const price = attemptPrice();
  $('costInfo').textContent = RANKS[state.to] + ' · 1회 ' + money(price);
}

function goalChips(need, set){
  const anyStat = set && set.rows.some(r => r.any && r.key === MAIN_STAT_KEY);
  return need.map(([k, v]) => {
    const unit = keyUnit(k);
    const name = optLabel(k) + (MAIN_STATS.includes(k) ? (anyStat ? ' (넷 중 아무거나 · 올스탯 포함)' : ' (올스탯 포함)') : '');
    const text = unit === '줄' ? `${esc(k)} ${v}줄 이상` : `${esc(name)} 합계 ${v}${esc(unit)} 이상`;
    return `<span class="goal-chip">${text}</span>`;
  }).join('<span class="goal-and">그리고</span>');
}

function optionGoalSums(bracket, key) {
  const [first, second, third] = bracket.lines.map(line => compressLine(line, [key]));
  const sumsByCount = [new Set(), new Set(), new Set()];
  for (const a of first) {
    const firstGroups = addGroup({}, a.group);
    for (const b of second) {
      if (blocked(firstGroups, b.group)) continue;
      const secondGroups = addGroup(firstGroups, b.group);
      for (const c of third) {
        if (blocked(secondGroups, c.group) || !(a.p * b.p * c.p > 0)) continue;
        const values = [a.vec[0], b.vec[0], c.vec[0]];
        const count = values.filter(value => value > 0).length;
        if (count) sumsByCount[count - 1].add(Number((values[0] + values[1] + values[2]).toFixed(4)));
      }
    }
  }
  const commonValues = bracket.lines.map(line => {
    const common = line.reduce((best, [index, probability]) =>
      OPTION_INFO[index].key === key && probability > (best?.[1] ?? 0) ? [index, probability] : best, null);
    return common ? OPTION_INFO[common[0]].value : 0;
  });
  let typical = 0;
  const presets = sumsByCount.flatMap((sums, index) => {
    typical = Number((typical + commonValues[index]).toFixed(4));
    return sums.size ? [{ lines:index + 1, value:sums.has(typical) ? typical : Math.max(...sums) }] : [];
  });
  const featured = new Set(presets.map(preset => preset.value));
  const others = [...new Set(sumsByCount.flatMap(sums => [...sums]))]
    .filter(value => !featured.has(value)).sort((a, b) => a - b);
  return { presets, others };
}

function updateGoalChoice(field) {
  const row = field.closest('.opt-row');
  const chips = [...row.querySelectorAll('.val-chip')];
  const min = Number(field.value);
  const ordered = chips.map(chip => Number(chip.dataset.val)).sort((a, b) => a - b);
  const hit = min > 0 ? ordered.find(value => value >= min - 1e-9) : undefined;
  const selected = chips.find(chip => Number(chip.dataset.val) === hit);
  for (const chip of chips) chip.setAttribute('aria-pressed', String(chip === selected));
  const note = row.querySelector('.chip-note');
  const unit = field.dataset.unit;
  if (!note || field.type === 'hidden') return;
  const invalid = field.validity.badInput || !(min > 0) || hit === undefined;
  field.setAttribute('aria-invalid', String(invalid));
  note.textContent = field.validity.badInput || !(min > 0) ? '0보다 큰 합계를 입력하세요.'
    : hit === undefined ? `가능한 최대 합계는 ${ordered.at(-1)}${unit}입니다.`
    : hit === min ? '' : `실제로 나오는 합계 중 ${hit}${unit} 이상이면 성공입니다.`;
}

function renderSets(bracket){
  const keys = bracket ? keysOf(bracket) : new Map();
  // 입력한 목표는 부위·레벨을 바꿔도 지우거나 고치지 않는다. 지금 표에 없는 옵션은 흐리게 두고,
  // 계산에서는 그 조건이 나올 수 없는 것(0%)으로 친다.
  const multi = state.sets.length > 1;
  const rowHtml = (r, si, i) => {
    const info = keys.get(r.key);
    const isCount = !r.key.includes('|');
    const unit = keyUnit(r.key);
    const { presets, others } = info ? optionGoalSums(bracket, r.key) : { presets:[], others:[] };
    const chip = (value, lines) => `<button type="button" aria-pressed="false" class="ux-button ux-choice val-chip" data-val="${value}">${lines && !isCount
      ? `<small>${lines}줄</small><strong>${value}${esc(unit)}</strong>` : `${value}${esc(unit)}`}</button>`;
    return `<div class="opt-row ${info ? '' : 'missing'}">
      <span class="opt-name">${esc(optLabel(r.key))}${MAIN_STATS.includes(r.key) ? '<small>올스탯 포함</small>' : ''}${info ? '' : '<small class="missing-note">이 부위·레벨에는 없는 옵션</small>'}</span>
      ${r.key === MAIN_STAT_KEY ? `<button type="button" class="stat-any ${r.any ? 'on' : ''}" data-set="${si}" data-any="${i}" title="STR·DEX·INT·LUK 중 아무거나 하나만 맞으면 성공으로 칩니다">${r.any ? '아무 스탯이나' : '한 스탯으로'}</button>` : ''}
      <button type="button" class="ux-button opt-remove" data-set="${si}" data-remove="${i}" aria-label="${esc(optLabel(r.key))} 지우기">×</button>
      <div class="opt-goal-controls">
        ${presets.length ? `<div class="opt-chips opt-presets" role="group" aria-label="${esc(optLabel(r.key))} 줄 수별 대표 합계">${presets.map(({ value, lines }) => chip(value, lines)).join('')}</div>` : ''}
        ${isCount ? `<input type="hidden" class="opt-val" data-set="${si}" data-row="${i}" data-unit="줄" value="${esc(r.min)}">` : `
          <label class="opt-min"><span>최소 합계</span><input type="number" min="0" step="any" inputmode="decimal" data-set="${si}" data-row="${i}" data-unit="${esc(unit)}" class="opt-val" value="${esc(r.min)}" placeholder="직접 입력" aria-label="${esc(optLabel(r.key))} 최소 합계"${presets.length ? ` aria-describedby="cube-goal-note-${si}-${i}"` : ''}>
            <span class="opt-unit">${esc(unit)} 이상</span></label>
          ${others.length ? `<details class="ux-details opt-more-sums">
            <summary>다른 합계 보기</summary>
            <div class="opt-chips">${others.map(value => chip(value)).join('')}</div>
          </details>` : ''}`}
        ${presets.length && !isCount ? `<p class="chip-note" id="cube-goal-note-${si}-${i}" role="status"></p>` : ''}
      </div>
    </div>`;
  };
  $('optionRows').innerHTML = state.sets.map((set, si) => {
    const active = si === state.active;
    const need = needOf(set);
    return `${si ? '<div class="or-divider"><span>또는 (OR)</span></div>' : ''}
    <div class="set-card ${multi ? 'multi' : ''} ${multi && active ? 'active' : ''}" data-set-card="${si}">
      ${multi ? `<div class="set-head">
        <span class="set-name">조건 ${SET_NAMES[si]}</span>
        ${active ? '<span class="set-state">옵션 추가 중</span>' : `<button type="button" class="set-pick" data-activate="${si}">여기에 추가</button>`}
        <button type="button" class="ux-button opt-remove" data-remove-set="${si}" aria-label="조건 ${SET_NAMES[si]} 지우기">×</button>
      </div>` : ''}
      ${set.rows.length ? set.rows.map((r, i) => rowHtml(r, si, i)).join('') : '<div class="opt-empty">위에서 옵션을 눌러 목표에 추가하세요.</div>'}
      ${need.length ? `<div class="goal-summary">${goalChips(need, set)}</div>` : ''}
    </div>`;
  }).join('');
  $('optionRows').querySelectorAll('.opt-val').forEach(updateGoalChoice);
  $('addSet').disabled = !bracket || state.sets.length >= MAX_SETS;

  const target = state.sets[state.active];
  const full = target.rows.length >= MAX_ROWS;
  const primary = PRIMARY_KEYS.filter(k => keys.has(k) && !HIDDEN_STAT_KEYS.includes(k));
  const others = [...keys.keys()].filter(k => !PRIMARY_KEYS.includes(k) && !HIDDEN_STAT_KEYS.includes(k));
  const chip = k => `<button type="button" class="ux-button pick-chip" data-add="${esc(k)}" ${full ? 'disabled' : ''}>${esc(optLabel(k))}</button>`;
  $('pickTarget').textContent = multi ? `조건 ${SET_NAMES[state.active]}에 추가` : '목표에 추가';
  $('pickCount').textContent = `${target.rows.length}/${MAX_ROWS}`;
  $('primaryPicks').innerHTML = primary.map(chip).join('');
  $('otherPicks').innerHTML = others.map(chip).join('');
  $('otherPanel').classList.toggle('hidden', !others.length);
}

function renderResult(bracket, goals){
  const cube = state.cube;
  const p = bracket && goals.length ? successProb(bracket.lines, goals) : null;
  const price = attemptPrice();
  $('quantileTable').hidden = !(p > 0);
  $('resMeso').dataset.attemptPrice = price;
  $('resMeso').actualPercentile = p > 0
    ? async (actual, count) => count === undefined ? cubeOptionRecord(actual, price, p)
      : { ...cubeOptionRecord(count, 1, p), price } : null;
  if(p === null){
    $('resMeso').dataset.expectedUsage = '';
    ['resProb','resTries','resMeso','resMedian'].forEach(id => $(id).textContent = '—');
    $('resProbSub').textContent = goals.length ? '' : '목표 옵션을 고르면 계산합니다.';
    $('quantileTable').innerHTML = '';
    $('compareTable').innerHTML = '';
    $('comparePanel').classList.add('hidden');
    return;
  }
  const tries = p > 0 ? 1 / p : Infinity;
  $('resMeso').dataset.expectedUsage = p > 0 ? tries * price : Infinity;
  $('resProb').textContent = pctText(p);
  $('resProbSub').textContent = p > 0 ? `약 ${fmt(tries)}번에 1번 · 목표 등급 유지 기준` : '이 구간에서는 나올 수 없는 조합';
  $('resTries').textContent = p > 0 ? `${fmt(tries)}회` : '불가능';
  $('resMedian').textContent = p > 0 ? `${fmt(cubesFor(p, .5))}개` : '-';
  $('resMeso').textContent = !price ? '비용 없음' : p > 0 ? `${mesoText(tries * price)} 메소` : '불가능';

  $('quantileTable').innerHTML = p > 0 ? `<table class="data-table">
    <thead><tr><th>이 확률로 성공하려면</th><th>큐브 사용량</th>${price ? '<th>메소</th>' : ''}</tr></thead>
    <tbody>${QUANTILES.map(q => { const n = cubesFor(p, q); return `<tr><td>${Math.round(q * 100)}%</td><td>${fmt(n)}개</td>${price ? `<td>${mesoText(n * price)}</td>` : ''}</tr>`; }).join('')}</tbody>
  </table>` : '';

  // 같은 탭 큐브끼리 비교
  const rows = availableOptionMethods().map(k => {
    const b = findBracket(k, state.part, state.level);
    const pk = b ? successProb(b.lines, goals) : 0;
    return `<tr class="${k === cube ? 'current' : ''}"><td>${esc(CUBES[k].name)}</td><td>${pctText(pk)}</td><td>${pk > 0 ? fmt(1 / pk) + '회' : '-'}</td><td>${pk > 0 && attemptPrice(k) ? mesoText(attemptPrice(k) / pk) : '-'}</td></tr>`;
  });
  $('comparePanel').classList.toggle('hidden', rows.length < 2);
  $('compareTable').innerHTML = rows.length > 1 ? `<table class="data-table">
    <thead><tr><th>큐브</th><th>확률</th><th>기대 횟수</th><th>기대 메소</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '';
}

function renderOptionTable(bracket, goals){
  if(!bracket){ $('optionTable').innerHTML = ''; return; }
  const keys = goals.flat().map(n => n[0]);
  const names = ['첫 번째 옵션', '두 번째 옵션', '세 번째 옵션'];
  $('optionTable').innerHTML = `<div class="line-tables">${bracket.lines.map((rows, li) => `
    <table class="data-table"><thead><tr><th>${names[li]}</th><th>확률</th></tr></thead><tbody>
    ${rows.map(([i, p]) => { const hit = keys.some(k => contrib(OPTION_INFO[i], k) > 0); return `<tr class="${hit ? 'hit' : ''}"><td>${esc(DATA.options[i])}</td><td>${p}%</td></tr>`; }).join('')}
    </tbody></table>`).join('')}</div>`;
}

// 목표 수치를 고칠 때는 입력칸이 포커스를 잃지 않도록 결과만 다시 그린다
function renderOutputs(){
  const bracket = currentBracket();
  const goals = goalsOf();
  // 세트마다 조건 요약만 새로 쓴다
  state.sets.forEach((set, si) => {
    const card = document.querySelector(`[data-set-card="${si}"]`);
    if(!card) return;
    const need = needOf(set);
    let box = card.querySelector('.goal-summary');
    if(!need.length){ if(box) box.remove(); return; }
    if(!box){ box = document.createElement('div'); box.className = 'goal-summary'; card.appendChild(box); }
    box.innerHTML = goalChips(need, set);
  });
  renderResult(bracket, goals);
  renderCombined(goals, bracket);
  renderOptionTable(bracket, goals);
  save();
}
function render(){
  renderRanks();
  ensureBracket();
  renderTabs(); renderParts(); renderLevels(); renderCost();
  renderData();
  const bracket = currentBracket();
  $('bracketInfo').innerHTML = bracket ? '' : `<span class="warn">${esc(state.part)}은(는) 이 큐브 확률표에 없어요.</span>`;
  renderSets(bracket);
  renderOutputs();
}

function restoreChoiceFocus(button) {
  const attribute = Object.keys(button.dataset).find(key =>
    ['tab', 'part', 'level', 'add', 'val', 'any', 'activate'].includes(key));
  if (!attribute) return;
  const name = 'data-' + attribute;
  const candidates = [...document.querySelectorAll('button[' + name + ']')];
  const selected = candidates.find(candidate => !candidate.disabled && candidate.getAttribute(name) === button.getAttribute(name) &&
    candidate.dataset.set === button.dataset.set && candidate.dataset.row === button.dataset.row);
  if (selected) selected.focus();
}

// ---------- 이벤트 ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if(!t){
    // 세트 카드의 빈 곳을 누르면 그 세트에 옵션을 추가하게 한다
    const card = e.target.closest('[data-set-card]');
    if(card && !e.target.closest('input') && state.sets.length > 1 && Number(card.dataset.setCard) !== state.active){
      state.active = Number(card.dataset.setCard); render();
    }
    return;
  }
  if(t.dataset.tab){
    if(state.tab === t.dataset.tab) return;
    state.tab = t.dataset.tab;
    state.cube = state.gradeCube = Object.keys(CUBES).find(k => CUBES[k].tab === state.tab);
    resetRankInputs();
    resetGoals(); // 잠재·에디셔널은 옵션 목록이 달라 목표를 비운다
  } else if(t.dataset.part){
    state.part = t.dataset.part;
    setLevel(state.level >= COMMON_LEVEL ? state.level : 200); // 부위를 바꾸면 자주 쓰는 구간부터
  } else if(t.dataset.level){
    setLevel(Number(t.dataset.level));
  } else if(t.dataset.gradeMethod){
    if(state.gradeCube === t.dataset.gradeMethod) return;
    state.gradeCube = t.dataset.gradeMethod;
    resetRankInputs();
  } else if(t.id === 'levelMore'){
    showAllLevels = !showAllLevels;
    renderLevels();
    $('levelMore').focus();
    return;
  } else if(t.dataset.add){
    const rows = state.sets[state.active].rows;
    if(rows.length >= MAX_ROWS) return;
    const info = keysOf(currentBracket()).get(t.dataset.add);
    // 새 옵션은 대표 1줄 합계부터 시작한다.
    const firstPreset = optionGoalSums(currentBracket(), t.dataset.add).presets[0];
    rows.push({ key:t.dataset.add, min:firstPreset?.value ?? Math.min(...info.values) });
  } else if(t.dataset.any){
    const row = state.sets[t.dataset.set].rows[Number(t.dataset.any)];
    row.any = !row.any;
  } else if(t.dataset.remove){
    state.sets[t.dataset.set].rows.splice(Number(t.dataset.remove), 1);
  } else if(t.classList.contains('val-chip')){
    const field = t.closest('.opt-row').querySelector('.opt-val');
    field.value = t.dataset.val;
    field.dispatchEvent(new Event('input', { bubbles:true }));
    return;
  } else if(t.dataset.activate){
    state.active = Number(t.dataset.activate);
  } else if(t.dataset.removeSet){
    state.sets.splice(Number(t.dataset.removeSet), 1);
    if(!state.sets.length) state.sets.push({ rows:[] });
    state.active = Math.min(state.active, state.sets.length - 1);
  } else if(t.id === 'resetGoals'){
    resetGoals();
  } else if(t.id === 'addSet'){
    if(state.sets.length >= MAX_SETS) return;
    state.sets.push({ rows:[] });
    state.active = state.sets.length - 1;
  } else return;
  render();
  if (!t.isConnected) restoreChoiceFocus(t);
});
$('optionRows').addEventListener('input', e => {
  if(!e.target.classList.contains('opt-val')) return;
  const { set, row } = e.target.dataset;
  state.sets[set].rows[row].min = e.target.value;
  updateGoalChoice(e.target);
  renderOutputs();
});

// 아이템 레벨은 확률 구간과 재설정 비용을 한꺼번에 정한다. 입력 중에는 칸을 되돌려 쓰지 않는다
$('itemLevel').addEventListener('input', e => {
  if(e.target.value === '') return;
  setLevel(e.target.value);
  render();
});
$('itemLevel').addEventListener('blur', () => render());


function money(value, showUnavailable = false) {
  if (!Number.isFinite(value)) return showUnavailable ? '달성 불가' : '—';
  return MoneyInput.koreanAmount(BigInt(Math.round(value)));
}

function pct(value) {
  return pctText(value);
}

function rankSpan(rank) {
  return '<span class="potential-rank-' + rank + '">' + RANKS[rank] + '</span>';
}

function stageNameHtml(rank) {
  return rankSpan(rank) + ' → ' + rankSpan(rank + 1);
}

function gradeStep(key, rank) {
  return cubeGradeStep(key, state.level, rank, state.miracle);
}

function gradePlan(failures = 0) {
  const steps = [];
  for (let rank = state.from; rank < state.to; rank++) {
    const step = gradeStep(state.gradeCube, rank);
    const remaining = new UpgradeStep(step).remaining(rank === state.from ? failures : 0);
    steps.push({ i: rank, name: stageNameHtml(rank), p: remaining.chance, cap: remaining.cap,
      e: remaining.expectedAttempts(), price: step.cost });
  }
  return { steps };
}

function setChoices(id, choices, value) {
  const field = $(id);
  const encoded = JSON.stringify(choices);
  if (encoded !== field.dataset.choices) {
    field.replaceChildren(...choices.map(([key, label]) => new Option(label, key)));
    field.dataset.choices = encoded;
  }
  field.value = value;
}

function availableOptionMethods() {
  return Object.keys(CUBES).filter(key => CUBES[key].tab === state.tab &&
    CUBES[key].data && Object.keys(partsOf(CUBES[key].data, RANKS[state.to])).length);
}

function renderGradeMethods(methods) {
  const group = $('gradeCube');
  if (group.dataset.tab !== state.tab) {
    group.innerHTML = methods.map(key => {
      const method = CUBES[key];
      return `<button type="button" class="ux-button ux-choice cube-method-choice" data-grade-method="${key}" aria-pressed="false">
        <span class="cube-method-icons">${iconImg(method.icons)}</span>
        <span>${esc(method.name)}<small>${rankSpan(method.p.length)}까지</small></span>
      </button>`;
    }).join('');
    group.dataset.tab = state.tab;
  }
  for (const button of group.children) {
    button.setAttribute('aria-pressed', String(button.dataset.gradeMethod === state.gradeCube));
  }
}

function renderRanks() {
  const limit = CUBES[state.gradeCube].p.length;
  state.to = Math.max(state.from, Math.min(state.to, limit));
  setChoices('cube-rank-start', RANKS.map((name, i) => [i, name]), state.from);
  setChoices('cube-rank-target', RANKS.map((name, i) => [i, name]).slice(state.from, Math.max(state.from, limit) + 1), state.to);
  for (const [id, rank] of [['cube-rank-start', state.from], ['cube-rank-target', state.to]]) {
    $(id).className = 'potential-rank-' + rank;
  }
  const methods = Object.keys(CUBES).filter(key => CUBES[key].tab === state.tab);
  renderGradeMethods(methods);
  $('cube-rank-note').textContent = state.from === state.to ? '시작 등급과 목표 등급이 같아 등급 상승을 건너뜁니다.' : '';
  const options = availableOptionMethods();
  if (options.length && !options.includes(state.cube)) state.cube = options.includes(state.gradeCube) ? state.gradeCube : options[0];
  setChoices('optionCube', options.map(key => [key, CUBES[key].name]), state.cube);
  $('optionCube').disabled = !options.length;
  $('option-method-note').textContent = options.length ? '' : '이 등급의 옵션 확률표가 없습니다. 옵션까지 계산하려면 목표 등급을 올리세요.';
  $('miracleCheckbox').setAttribute('aria-checked', String(state.miracle));
  $('miracleCheckbox').querySelector('.switch-state').textContent = state.miracle ? '켜짐' : '꺼짐';
  $('cube-grade-methods').innerHTML = methods.map(key => {
    const cells = [0, 1, 2].map(rank => {
      const step = gradeStep(key, rank);
      return step ? pct(step.chance) + ' / ' + (step.cap ? fmt(step.cap) + '회' : '보장 없음') : '—';
    });
    return '<tr><th scope="row">' + esc(CUBES[key].name) + '</th>' + cells.map(cell => '<td>' + cell + '</td>').join('') + '</tr>';
  }).join('');
}

function resetRankInputs() {
  $('cube-progress-failures').value = '0';
  state.actual = {};
}

function renderCombined(goals, bracket) {
  const input = $('cube-progress-failures');
  const cap = state.from < state.to ? gradeStep(state.gradeCube, state.from).cap : null;
  input.disabled = !cap;
  input.max = cap ? cap - 1 : 0;
  if (cap && input.valueAsNumber > cap - 1) input.value = cap - 1;
  const failures = cap ? input.valueAsNumber : 0;
  const valid = !cap || (Number.isInteger(failures) && failures >= 0);
  input.setAttribute('aria-invalid', String(!valid));
  $('cube-progress-failures-hint').textContent = cap ? '보장까지 남은 횟수에 반영합니다.' : '적용할 등급 상승 보장이 없습니다.';
  if (!valid) $('cube-progress-failures-hint').textContent = '0회 이상의 정수를 입력하세요.';
  const { steps } = gradePlan(valid ? failures : 0);
  const count = $('cube-progress-budget');
  const attempts = count.valueAsNumber;
  const validCount = Number.isInteger(attempts) && attempts >= 1 && attempts <= Number(count.max);
  count.disabled = !steps.length;
  count.setAttribute('aria-invalid', String(!validCount && steps.length > 0));
  $('cube-progress-budget-hint').textContent = validCount || !steps.length ? '' : '1회부터 100,000회까지 입력하세요.';
  const hardCap = steps.every(step => step.cap) ? steps.reduce((sum, step) => sum + step.cap, 0) : null;
  const expectedCubes = steps.reduce((sum, step) => sum + step.e, 0);
  const gradeCost = steps.reduce((sum, step) => sum + step.e * step.price, 0);
  const expectedCount = value => value.toLocaleString('ko-KR', { maximumFractionDigits:2 }) + '회';
  $('expectedCubes').textContent = valid ? expectedCount(expectedCubes) : '—';
  $('expectedCost').textContent = valid ? money(gradeCost) : '—';
  $('cube-summary-grade-method').textContent = steps.length ? CUBES[state.gradeCube].name : '건너뜀';
  $('ceilingCount').textContent = valid && hardCap !== null ? fmt(hardCap) + '회' : '—';
  $('ceilingCost').textContent = valid && hardCap !== null ? money(steps.reduce((sum, step) => sum + step.cap * step.price, 0)) : '—';
  $('cube-progress-next').textContent = valid && steps.length ? pct(successCdf(1, steps[0].p, steps[0].cap)) : '—';
  $('cube-progress-within-label').textContent = validCount && steps.length ? fmt(attempts) + '회 내 목표 등급 도달' : '목표 등급 도달 확률';
  $('cube-progress-within').textContent = valid && validCount && steps.length ? pct(cubeProgressWithin(steps, attempts)) : '—';
  $('cube-progress-context').innerHTML = rankSpan(state.from) + ' → ' + rankSpan(state.to);
  $('cube-progress-steps').innerHTML = steps.map(step => '<tr><th scope="row">' + step.name + '</th><td>' +
    pct(successCdf(1, step.p, step.cap)) + '</td><td>' + expectedCount(step.e) + '</td><td>' +
    (step.cap ? fmt(step.cap) + '회' : '없음') + '</td><td>' + money(step.price) + '</td></tr>').join('');

  const hasOptions = state.sets.some(set => set.rows.length);
  const filledOptions = state.sets.every(set => set.rows.every(row => Number(row.min) > 0));
  const eligibleOptions = !hasOptions || (bracket && goals.length && filledOptions);
  const upgradeRoll = steps.length && bracket && findBracket(state.gradeCube, state.part, state.level);
  const phases = [];
  if (hasOptions && eligibleOptions) {
    const highest = Math.max(state.to, CUBES[state.cube].p.length);
    for (let rank = state.to; rank <= highest; rank++) {
      const table = findBracket(state.cube, state.part, state.level, rank);
      const chance = table ? successProb(table.lines, goals) : 0;
      const arrivalChance = rank > state.to ? chance : upgradeRoll ? successProb(upgradeRoll.lines, goals) : 0;
      phases.push({ chance, arrivalChance, cost: attemptPrice(state.cube, rank),
        upgrade: rank < highest ? gradeStep(state.cube, rank) : undefined });
    }
  }
  const result = valid && eligibleOptions ? PotentialPlan.calculate(
    steps.map(step => ({ chance:step.p, cap:step.cap, cost:step.price })), phases) : null;
  $('potential-cost').textContent = !result ? '—' : Number.isFinite(result.expected) ? money(result.expected) : '기댓값 없음';
  $('cube-hunt')?.setAttribute('meso', result?.expected ?? '');
  $('potential-50').textContent = result ? money(result.budget50, true) : '—';
  $('potential-90').textContent = result ? money(result.budget90, true) : '—';
  $('potential-context').textContent = !valid ? '이미 실패한 횟수를 확인하세요.' : hasOptions && !eligibleOptions
    ? bracket ? '목표 옵션의 합계를 입력하세요.' : '옵션 확률표가 있는 등급과 장비를 선택하세요.'
    : RANKS[state.to] + (hasOptions ? (state.to < 3 ? ' 이상에서 ' : '에서 ') + '목표 옵션 달성까지' : '까지');
  $('cube-summary-option').hidden = !hasOptions;
  $('cube-summary-option-method').textContent = CUBES[state.cube].name;
  $('cube-summary-option-count').textContent = !result ? '—'
    : Number.isFinite(result.optionAttempts) ? expectedCount(result.optionAttempts) : '달성 불가';
  $('cube-summary-option-cost').textContent = result ? money(result.optionCost, true) : '—';
  const fees = (steps.length && !CUBES[state.gradeCube].official) || (hasOptions && !CUBES[state.cube].official)
    ? '큐브 구입비는 별도입니다. ' : '';
  const missing = hasOptions && steps.length && !upgradeRoll ? '확률표가 없는 등급 상승 방법은 도달 직후 옵션을 제외합니다.' : '';
  $('potential-note').textContent = result ? (fees + missing).trim() : '';
}

function resultCellHtml(step, actual){
  if(!actual) return '';
  const { gap, meso, gain, flat }=stageDiff(step, actual);
  const percentile=(successCdf(actual,step.p,step.cap)*100).toFixed(2);
  // 자연 등업에 계속 실패할 확률은 천장 보장과 별도로 계산한다.
  const failureProbability=(Math.pow(1-step.p,actual)*100).toFixed(2);
  const verdict=flat ? '기대 횟수와 같아요' : `기대보다 ${Math.abs(gap).toFixed(1)}회 ${gain?'덜 사용':'더 사용'}`;
  const money=!flat && step.price>0 ? `<span class="luck-meso">${mesoText(Math.abs(meso))} 메소 ${gain?'절약':'초과'}</span>` : '';
  return `<div class="record-verdict"><strong class="luck-main ${flat?'luck-even':gain?'luck-good':'luck-bad'}">${verdict}</strong>${money}</div>
    <div class="record-stats"><div class="record-stat"><span>상위</span><strong>${percentile}%</strong></div><div class="record-stat luck-probability"><span>${fmt(actual)}회 연속 실패</span><strong>${failureProbability}%</strong><small>천장 제외</small></div></div>`;
}
// 여러 구간을 입력했을 때만 합계를 보여준다.
function summaryHtml(plan){
  const filled=plan.steps.filter(s=>state.actual[s.i]>0);
  if(filled.length<2) return '<div class="luck-summary" hidden></div>';
  const expected=filled.reduce((sum,s)=>sum+s.e,0);
  const used=filled.reduce((sum,s)=>sum+state.actual[s.i],0);
  const meso=filled.reduce((sum,s)=>sum+(s.e-state.actual[s.i])*s.price,0);
  const gap=expected-used, gain=gap>0;
  const verdict = Math.abs(gap)<.05
    ? '<b class="luck-even">기대치와 같음</b>'
    : `<b class="${gain?'luck-good':'luck-bad'}">${Math.abs(gap).toFixed(1)}회 ${gain?'이득':'손해'}${Math.abs(meso)>=1?` · 메소 ${mesoText(Math.abs(meso))} ${gain?'아낀 셈':'더 쓴 셈'}`:''}</b>`;
  return `<div class="luck-summary"><span>입력한 ${filled.length}개 구간 · 총 ${fmt(used)}회</span>${verdict}</div>`;
}
function renderData(){
  const plan=gradePlan();
  const rows=plan.steps.map(s=>{
    const actual=state.actual[s.i];
    return `<article class="record-stage" data-i="${s.i}" aria-labelledby="recordStage${s.i}">
      <div class="record-stage-head"><div><h3 id="recordStage${s.i}">${s.name}</h3><p class="record-expected">기대 ${s.e.toFixed(1)}회</p></div>
        <div class="record-input"><label for="recordCount${s.i}">내 횟수</label><div class="record-input-field"><input id="recordCount${s.i}" class="actual-input" type="number" min="1" step="1" ${s.cap?`max="${s.cap}"`:''} inputmode="numeric" data-i="${s.i}" value="${actual||''}" placeholder="입력"><span>회</span></div></div>
      </div><div class="pct-cell" ${actual?'':'hidden'} role="status" aria-live="polite">${resultCellHtml(s, actual)}</div>
    </article>`;
  }).join('');
  const basis=plan.steps.map(s=>`<tr><td>${s.name}</td><td>${pct(s.p)}</td><td>${s.cap?`${fmt(s.cap)}회`:'없음'}</td></tr>`).join('');
  const cashNote=CUBES[state.gradeCube].official?'메소 재설정 비용 기준입니다.':'메소는 큐브 사용 수수료만 반영하며, 큐브 구입비는 제외합니다.';
  $('dataTable').innerHTML=`<div class="record-stages">${rows||'<p class="record-intro">등급 상승을 건너뜁니다.</p>'}</div>`
    + (plan.steps.length ? summaryHtml(plan)+`<details class="ux-details record-details"><summary>기록 계산 기준</summary><div class="record-basis-table"><table class="data-table"><thead><tr><th>구간</th><th>1회 확률</th><th>천장</th></tr></thead><tbody>${basis}</tbody></table></div><p>상위 비율은 천장 보장을 포함해 입력한 횟수 이내에 등업할 확률입니다. 낮을수록 운이 좋은 기록이며, 실제 유저 순위는 아닙니다.</p><p>연속 실패 확률은 천장 보장을 제외하고 계산합니다. 예: 성공률 15%로 10회 모두 실패할 확률은 19.69%입니다.</p><p>${cashNote}</p></details>` : '');
  // 입력 중에는 결과와 합계만 갱신해 입력 포커스를 유지한다.
  $('dataTable').querySelectorAll('.actual-input').forEach(inp=>{
    inp.oninput=e=>{
      const i=Number(e.target.dataset.i);
      const step=plan.steps.find(s=>s.i===i);
      let v=Number(e.target.value);
      // 천장을 넘는 횟수는 나올 수 없으므로 천장으로 잘라 준다
      if(step.cap && v>step.cap){ v=step.cap; e.target.value=v; }
      if (!Number.isSafeInteger(v) || v < 1) v = 0;
      if(v>0) state.actual[i]=v; else delete state.actual[i];
      const result=e.target.closest('.record-stage').querySelector('.pct-cell');
      result.hidden=!(v>0);
      result.innerHTML=resultCellHtml(step, v>0?v:0);
      const box=$('dataTable').querySelector('.luck-summary');
      if(box) box.outerHTML = summaryHtml(plan);
    };
  });
}

function stageDiff(step, actual) {
  const gap = step.e - actual;
  return { gap, meso:gap * step.price, gain:gap > 0, flat:Math.abs(gap) < .05 };
}

$('cube-rank-start').addEventListener('change', event => {
  state.from = Number(event.target.value);
  resetRankInputs();
  render();
});
$('cube-rank-target').addEventListener('change', event => {
  state.to = Number(event.target.value);
  render();
});
$('optionCube').addEventListener('change', event => {
  state.cube = event.target.value;
  render();
});
$('miracleCheckbox').addEventListener('click', () => {
  state.miracle = !state.miracle;
  render();
});
for (const id of ['cube-progress-failures', 'cube-progress-budget']) {
  $(id).addEventListener('input', () => renderCombined(goalsOf(), currentBracket()));
}
$('dataSource').textContent = '넥슨 공식 확률 검색 기준 · ' + DATA.fetchedAt + ' 수집';
render();
