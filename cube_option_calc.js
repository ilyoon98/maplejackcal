// 큐브 옵션 확률 계산기. 옵션 표는 cube_option_data.js(넥슨 공식 확률 검색에서 수집)를 쓴다.
// 조건 세트(옵션별 최소 합계를 모두 만족 = AND) 중 하나라도(OR) 만족하는 결과가 큐브 한 번에 나올 확률을
// 세 줄 전부 펼쳐서 정확히 계산한다.
const DATA = CUBE_OPTION_DATA;
const MAIN_STATS = ['STR|%', 'DEX|%', 'INT|%', 'LUK|%'];
const ALL_STAT = '올스탯|%';
const TABS = [['potential','잠재능력'],['additional','에디셔널 잠재능력']];
// data: cube_option_data.js의 큐브 키(생략하면 자기 키). 옵션 확률은 같아도 비용 기준이 달라 항목을 나눈다.
// official: 큐브 없이 메소로만 재설정하는 모드. 등급·레벨 구간별 비용표를 쓴다.
// 나머지(큐브)는 아이템 레벨로만 정해지는 재설정 비용을 쓴다.
const CUBES = {
  potentialMeso:{ name:'잠재능력 재설정 (메소)', icon:['잠재.png'], tab:'potential', data:'black', official:'potential' },
  black:{ name:'블랙 큐브', icon:['블랙.webp'], tab:'potential', data:'black' },
  red:{ name:'레드 큐브', icon:['레드.webp'], tab:'potential' },
  artisan:{ name:'명장의 큐브 / 골드 큐브', icon:['명장.webp','골드.webp'], tab:'potential' },
  addiMeso:{ name:'에디셔널 잠재능력 재설정 (메소)', icon:['에디잠재.png'], tab:'additional', data:'addi', official:'additional' },
  addi:{ name:'에디셔널 큐브 / 화이트 에디셔널 큐브', icon:['에디큐브.webp','화이트에디.webp'], tab:'additional' }
};
const dataKey = cube => CUBES[cube].data || cube;
// 비용 기준은 cube_calc.js(등급업 계산기)와 같은 표. 레벨구간 → [레어,에픽,유니크,레전드리] 재설정 메소
const LEVEL_BRACKETS = [[1,'1~159'],[160,'160~199'],[200,'200~249'],[250,'250~300']];
const POTENTIAL_COST = { 1:[4000000,16000000,34000000,40000000], 160:[4250000,17000000,36125000,42500000], 200:[4500000,18000000,38250000,45000000], 250:[5000000,20000000,42500000,50000000] };
const ADDITIONAL_COST = { 1:[9750000,27300000,66300000,78000000], 160:[10375000,29050000,70550000,83000000], 200:[11000000,30800000,74800000,88000000], 250:[12250000,34300000,83300000,98000000] };
const PRICE_TABLES = { potential:POTENTIAL_COST, additional:ADDITIONAL_COST };
const LEGENDARY = 3;
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
// 공식 확률 페이지의 "세 개의 옵션 중 최대 N개" 규칙. 앞 줄에서 한도를 채운 계열은 다음 줄 후보에서 빠지고,
// 남은 옵션 확률은 표기확률 / (100% - 빠진 옵션 표기확률 합)이 된다.
const GROUP_MAX = { useful:1, invAfter:1, ignore:2, invChance:2 };
const QUANTILES = [.5, .8, .9, .95, .99];
const MAX_ROWS = 3;
const MAX_SETS = 4;
const SET_NAMES = ['A', 'B', 'C', 'D'];
// 따로 모아 보여줄 주요 옵션과 짧은 이름
const PRIMARY_KEYS = ['보스 몬스터 데미지|%', '몬스터 방어율 무시|%', '공격력|%', '마력|%', '크리티컬 확률|%', '크리티컬 데미지|%', '데미지|%',
  '올스탯|%', 'STR|%', 'DEX|%', 'INT|%', 'LUK|%', '최대 HP|%', '스킬 재사용 대기시간|초', '메소 획득량|%', '아이템 드롭률|%', '공격력|', '마력|'];
const SHORT_LABEL = { '보스 몬스터 데미지|%':'보스 데미지 %', '몬스터 방어율 무시|%':'방어율 무시 %', '스킬 재사용 대기시간|초':'쿨타임 감소 (초)' };

// "보스 몬스터 데미지 +35%" → key '보스 몬스터 데미지|%', value 35. 숫자로 끝나지 않는 옵션은 그 옵션 자체가 key이고 한 줄 = 1.
function parseOption(name){
  let group = null;
  if(name.includes('쓸만한')) group = 'useful';
  else if(name.startsWith('피격 후 무적시간')) group = 'invAfter';
  else if(/^피격 시 .*무시$/.test(name)) group = 'ignore';
  else if(/^피격 시 .*무적$/.test(name)) group = 'invChance';
  const m = name.match(/^(.+?) [+-](\d+(?:\.\d+)?)(%|초)?$/);
  if(!m) return { name, key:name, value:1, group };
  return { name, key:`${m[1]}|${m[3]||''}`, value:Number(m[2]), group };
}
const OPTION_INFO = DATA.options.map(parseOption);

function keyLabel(key){
  if(SHORT_LABEL[key]) return SHORT_LABEL[key];
  if(!key.includes('|')) return key;
  const [base, unit] = key.split('|');
  if(unit === '%') return `${base} %`;
  if(unit === '초') return `${base} (초)`;
  return `${base} +수치`;
}
function keyUnit(key){
  if(!key.includes('|')) return '줄';
  const unit = key.split('|')[1];
  return unit || '';
}
// STR·DEX·INT·LUK %는 올스탯 %를 같은 양으로 더해 센다
function contrib(info, key){
  if(info.key === key) return info.value;
  if(info.key === ALL_STAT && MAIN_STATS.includes(key)) return info.value;
  return 0;
}

function findBracket(cube, part, level){
  return (DATA.cubes[dataKey(cube)].parts[part] || []).find(b => b.min <= level && level <= b.max) || null;
}

// 조건에 필요한 값만 남겨서 같은 기여·같은 제한 계열인 옵션끼리 합친다
function compressLine(rows, keys){
  const total = rows.reduce((s, r) => s + r[1], 0);
  const map = new Map();
  for(const [i, p] of rows){
    const info = OPTION_INFO[i];
    const vec = keys.map(k => contrib(info, k));
    const id = vec.join(',') + '/' + (info.group || '');
    let e = map.get(id);
    if(!e){ e = { vec, group:info.group, p:0 }; map.set(id, e); }
    e.p += p / total;
  }
  return [...map.values()];
}
function addGroup(counts, group){
  if(!group) return counts;
  return { ...counts, [group]:(counts[group] || 0) + 1 };
}
function blocked(counts, group){ return !!group && (counts[group] || 0) >= GROUP_MAX[group]; }
function excludedMass(line, counts){ return line.reduce((s, e) => s + (blocked(counts, e.group) ? e.p : 0), 0); }

// goals: [need, ...], need = [[key, 최소 합계], ...]. need 안은 전부 만족(AND), need끼리는 하나라도 만족(OR)
function successProb(lines, goals){
  goals = goals.filter(g => g.length);
  if(!goals.length) return 1;
  const keys = [...new Set(goals.flatMap(g => g.map(n => n[0])))];
  const checks = goals.map(g => g.map(([k, v]) => [keys.indexOf(k), v - 1e-9]));
  const [L1, L2, L3] = lines.map(rows => compressLine(rows, keys));
  let P = 0;
  for(const a of L1){
    const c1 = addGroup({}, a.group);
    const d2 = 1 - excludedMass(L2, c1);
    for(const b of L2){
      if(blocked(c1, b.group)) continue;
      const c2 = addGroup(c1, b.group);
      const d3 = 1 - excludedMass(L3, c2);
      const pab = a.p * b.p / d2;
      for(const c of L3){
        if(blocked(c2, c.group)) continue;
        if(checks.some(g => g.every(([k, m]) => a.vec[k] + b.vec[k] + c.vec[k] >= m))) P += pab * c.p / d3;
      }
    }
  }
  return Math.min(P, 1);
}
// q 확률로 성공하려면 필요한 큐브 수
function cubesFor(p, q){
  if(p >= 1) return 1;
  if(p <= 0) return Infinity;
  return Math.ceil(Math.log(1 - q) / Math.log1p(-p));
}

// ---------- 상태 ----------
const STORE_KEY = 'cubeOptionCalc';
// sets: OR로 묶인 조건 세트들, 세트마다 rows(AND). active: 옵션 칩을 누르면 추가될 세트
let state = { tab:'potential', cube:'black', part:'무기', level:200, costLevel:200, sets:[{ rows:[] }], active:0 };
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  if(Array.isArray(saved.rows) && !saved.sets) saved.sets = [{ rows:saved.rows }]; // 세트 생기기 전 저장값
  for(const k of Object.keys(state)) if(saved[k] !== undefined) state[k] = saved[k];
} catch(e) {}
if(!CUBES[state.cube]) state.cube = 'black';
state.tab = CUBES[state.cube].tab;
state.sets = (Array.isArray(state.sets) ? state.sets : []).slice(0, MAX_SETS)
  .map(set => ({ rows:(Array.isArray(set && set.rows) ? set.rows : []).filter(r => r && r.key).slice(0, MAX_ROWS) }));
if(!state.sets.length) state.sets = [{ rows:[] }];
if(!(state.active < state.sets.length)) state.active = 0;
let showAllLevels = false;
function save(){ try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch(e) {} }

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
function iconImg(files){ return files.map(f => `<img src="icons/Cube/${encodeURIComponent(f)}" alt="" onerror="this.remove()">`).join(''); }
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// 큐브를 쓸 때 같이 나가는 메소. 큐브 종류·등급과 무관하게 아이템 레벨 n으로만 정해진다.
// (인게임 재설정 창의 "재설정 비용". 200제면 200*200*20 = 800,000)
function cubeFee(level = state.level){
  const n = Number(level) || 0;
  const rate = n >= 121 ? 20 : n >= 71 ? 2.5 : n >= 31 ? .25 : 0;
  return Math.floor(n * n * rate);
}
// 큐브 없이 메소만으로 재설정할 때 값. 레벨 구간과 현재 등급(레전드리)으로 정해진다
function mesoResetPrice(cube){
  const d = CUBES[cube];
  return d.official ? (PRICE_TABLES[d.official][state.costLevel] || [])[LEGENDARY] || 0 : 0;
}
// 이 항목 1회에 나가는 메소. 메소 재설정이면 비용표, 큐브면 레벨 공식
function attemptPrice(cube = state.cube){
  return CUBES[cube].official ? mesoResetPrice(cube) : cubeFee();
}
function brackets(){ return DATA.cubes[dataKey(state.cube)].parts[state.part] || []; }
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
  if(currentBracket()) return;
  const list = brackets();
  if(list.length) setLevel(list[list.length - 1].max);
}

// 이 구간 옵션표에 있는 key와 한 줄에 뜰 수 있는 수치들
function keysOf(bracket){
  const seen = new Map();
  bracket.lines.forEach(rows => rows.forEach(([i]) => {
    const info = OPTION_INFO[i];
    if(!seen.has(info.key)) seen.set(info.key, { values:new Set() });
    seen.get(info.key).values.add(info.value);
  }));
  return seen;
}
function needOf(set){
  const sums = new Map();
  for(const r of set.rows){
    const v = Number(r.min);
    if(!r.key || !(v > 0)) continue;
    sums.set(r.key, (sums.get(r.key) || 0) + v);
  }
  return [...sums];
}
function goalsOf(){ return state.sets.map(needOf).filter(g => g.length); }
function resetGoals(){ state.sets = [{ rows:[] }]; state.active = 0; }

// ---------- 그리기 ----------
function renderTabs(){
  $('kindTabs').innerHTML = TABS.map(([key, label]) => {
    const icon = CUBES[Object.keys(CUBES).find(k => CUBES[k].tab === key)].icon.slice(0, 1);
    return `<button type="button" class="rank-chip tab-chip ${state.tab === key ? 'active' : ''}" data-tab="${key}">${iconImg(icon)}<span>${label}</span></button>`;
  }).join('');
}

function renderParts(){
  $('partGroups').innerHTML = PART_GROUPS.map(([title, parts]) => `
    <div class="part-group">
      <div class="part-group-title">${title}</div>
      <div class="part-chips">${parts.map(p => `<button type="button" class="part-chip ${p === state.part ? 'active' : ''}" data-part="${esc(p)}" title="${esc(p)}">${esc(PART_SHORT[p] || p)}</button>`).join('')}</div>
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
  const card = b => `<button type="button" class="level-card ${b === cur ? 'active' : ''}" data-level="${b.min}">${b.min === b.max ? b.min : `${b.min}~${b.max}`}<small>레벨</small></button>`;
  $('levelCards').innerHTML = `
    <div class="level-row">${common.map(card).join('') || '<span class="tiny">120레벨 이상 구간이 없는 부위예요. 아래에서 골라주세요.</span>'}</div>
    ${rest.length ? `<button type="button" class="more-toggle" id="levelMore">${open ? '다른 레벨 구간 접기 ▴' : `다른 레벨 구간 펼치기 (${rest.length}) ▾`}</button>
    <div class="level-row ${open ? '' : 'hidden'}">${rest.map(card).join('')}</div>` : ''}`;
}

function renderCubes(){
  $('cubeChoices').innerHTML = Object.entries(CUBES).filter(([, c]) => c.tab === state.tab).map(([k, c]) => `
    <button type="button" class="cube-choice ${k === state.cube ? 'active' : ''} ${c.icon.length > 1 ? 'pair-icon' : ''}" data-cube="${k}">
      <span class="cube-choice-head">${iconImg(c.icon)}<strong>${esc(c.name)}</strong></span>
    </button>`).join('');
}

function renderCost(){
  const input = $('itemLevel');
  // 타이핑 중에는 입력칸을 건드리지 않는다
  if(document.activeElement !== input) input.value = state.level;
  const meso = CUBES[state.cube].official;
  const bracket = LEVEL_BRACKETS.find(([lv]) => lv === state.costLevel)[1];
  $('costInfo').innerHTML = meso
    ? `메소 재설정 1회 <strong>${fmt(mesoResetPrice(state.cube))}</strong> 메소 <span class="tiny">(레전드리 · ${bracket} 구간)</span>`
      + `<br><span class="tiny">큐브를 쓰면 1회 ${fmt(cubeFee())} 메소</span>`
    : `큐브 1회 <strong>${fmt(cubeFee())}</strong> 메소 <span class="tiny">(${state.level} × ${state.level} × ${state.level >= 121 ? 20 : state.level >= 71 ? 2.5 : '0.25'})</span>`;
}

function goalChips(need){
  return need.map(([k, v]) => {
    const unit = keyUnit(k);
    const name = keyLabel(k) + (MAIN_STATS.includes(k) ? ' (올스탯 포함)' : '');
    const text = unit === '줄' ? `${esc(k)} ${v}줄 이상` : `${esc(name)} 합계 ${v}${esc(unit)} 이상`;
    return `<span class="goal-chip">${text}</span>`;
  }).join('<span class="goal-and">AND</span>');
}

function renderSets(bracket){
  const keys = bracket ? keysOf(bracket) : new Map();
  // 입력한 목표는 부위·레벨을 바꿔도 지우거나 고치지 않는다. 지금 표에 없는 옵션은 흐리게 두고,
  // 계산에서는 그 조건이 나올 수 없는 것(0%)으로 친다.
  const multi = state.sets.length > 1;
  const rowHtml = (r, si, i) => {
    const info = keys.get(r.key);
    const values = info ? [...info.values].sort((a, b) => a - b) : [];
    const isCount = !r.key.includes('|');
    return `<div class="opt-row ${info ? '' : 'missing'}">
      <span class="opt-name">${esc(keyLabel(r.key))}${MAIN_STATS.includes(r.key) ? '<small>올스탯 포함</small>' : ''}${info ? '' : '<small class="missing-note">이 부위·레벨에는 없는 옵션</small>'}</span>
      ${isCount ? '<span class="opt-unit">1줄 이상</span>' : `<span class="opt-min">
        <input type="number" min="0" step="any" data-set="${si}" data-row="${i}" class="opt-val" value="${esc(r.min)}" placeholder="최소값">
        <span class="opt-unit">${esc(keyUnit(r.key))} 이상</span>
      </span>`}
      <button type="button" class="opt-remove" data-set="${si}" data-remove="${i}" aria-label="${esc(keyLabel(r.key))} 지우기">×</button>
      ${isCount ? '' : `<span class="opt-chips">${values.map(v => `<button type="button" class="val-chip ${Number(r.min) === v ? 'active' : ''}" data-set="${si}" data-row="${i}" data-val="${v}">${v}</button>`).join('')}</span>`}
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
        <button type="button" class="opt-remove" data-remove-set="${si}" aria-label="조건 ${SET_NAMES[si]} 지우기">×</button>
      </div>` : ''}
      ${set.rows.length ? set.rows.map((r, i) => rowHtml(r, si, i)).join('') : '<div class="opt-empty">위에서 옵션을 눌러 목표에 추가하세요.</div>'}
      ${need.length ? `<div class="goal-summary">${goalChips(need)}</div>` : ''}
    </div>`;
  }).join('');
  $('addSet').disabled = !bracket || state.sets.length >= MAX_SETS;

  const target = state.sets[state.active];
  const full = target.rows.length >= MAX_ROWS;
  const primary = PRIMARY_KEYS.filter(k => keys.has(k));
  const others = [...keys.keys()].filter(k => !PRIMARY_KEYS.includes(k));
  const chip = k => `<button type="button" class="pick-chip" data-add="${esc(k)}" ${full ? 'disabled' : ''}>${esc(keyLabel(k))}</button>`;
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
  if(p === null){
    ['resProb','resTries','resMeso','resMedian'].forEach(id => $(id).textContent = '-');
    $('resProbSub').textContent = goals.length ? '' : '목표 옵션을 고르면 계산합니다.';
    $('quantileTable').innerHTML = '';
    $('compareTable').innerHTML = '';
    $('comparePanel').classList.add('hidden');
    return;
  }
  const tries = p > 0 ? 1 / p : Infinity;
  $('resProb').textContent = pctText(p);
  $('resProbSub').textContent = p > 0 ? `약 ${fmt(tries)}번에 1번` : '이 구간에서는 나올 수 없는 조합';
  $('resTries').textContent = p > 0 ? `${fmt(tries)}회` : '불가능';
  $('resMedian').textContent = p > 0 ? `${fmt(cubesFor(p, .5))}개` : '-';
  $('resMeso').textContent = !price ? '비용 없음' : p > 0 ? `${mesoText(tries * price)} 메소` : '불가능';

  $('quantileTable').innerHTML = p > 0 ? `<table class="data-table">
    <thead><tr><th>이 확률로 성공하려면</th><th>큐브 사용량</th>${price ? '<th>메소</th>' : ''}</tr></thead>
    <tbody>${QUANTILES.map(q => { const n = cubesFor(p, q); return `<tr><td>${Math.round(q * 100)}%</td><td>${fmt(n)}개</td>${price ? `<td>${mesoText(n * price)}</td>` : ''}</tr>`; }).join('')}</tbody>
  </table>` : '';

  // 같은 탭 큐브끼리 비교
  const rows = Object.keys(CUBES).filter(k => CUBES[k].tab === state.tab).map(k => {
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
  const goals = bracket ? goalsOf() : [];
  // 세트마다 조건 요약만 새로 쓴다
  state.sets.forEach((set, si) => {
    const card = document.querySelector(`[data-set-card="${si}"]`);
    if(!card) return;
    const need = needOf(set);
    let box = card.querySelector('.goal-summary');
    if(!need.length){ if(box) box.remove(); return; }
    if(!box){ box = document.createElement('div'); box.className = 'goal-summary'; card.appendChild(box); }
    box.innerHTML = goalChips(need);
  });
  renderResult(bracket, goals);
  renderOptionTable(bracket, goals);
  save();
}
function render(){
  ensureBracket();
  renderTabs(); renderParts(); renderLevels(); renderCubes(); renderCost();
  const bracket = currentBracket();
  $('bracketInfo').innerHTML = bracket ? '' : `<span class="warn">${esc(state.part)}은(는) 이 큐브 확률표에 없어요.</span>`;
  renderSets(bracket);
  renderOutputs();
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
    state.cube = Object.keys(CUBES).find(k => CUBES[k].tab === state.tab);
    resetGoals(); // 잠재·에디셔널은 옵션 목록이 달라 목표를 비운다
  } else if(t.dataset.part){
    state.part = t.dataset.part;
    setLevel(state.level >= COMMON_LEVEL ? state.level : 200); // 부위를 바꾸면 자주 쓰는 구간부터
  } else if(t.dataset.level){
    setLevel(Number(t.dataset.level));
  } else if(t.id === 'levelMore'){
    showAllLevels = !showAllLevels; renderLevels(); return;
  } else if(t.dataset.cube){
    state.cube = t.dataset.cube;
  } else if(t.dataset.add){
    const rows = state.sets[state.active].rows;
    if(rows.length >= MAX_ROWS) return;
    const info = keysOf(currentBracket()).get(t.dataset.add);
    // 기본값: 이 옵션의 가장 낮은 수치 (최소값 조건이라 그 위 수치도 모두 성공)
    rows.push({ key:t.dataset.add, min:t.dataset.add.includes('|') ? Math.min(...info.values) : 1 });
  } else if(t.dataset.remove){
    state.sets[t.dataset.set].rows.splice(Number(t.dataset.remove), 1);
  } else if(t.classList.contains('val-chip')){
    state.sets[t.dataset.set].rows[t.dataset.row].min = t.dataset.val;
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
});
$('optionRows').addEventListener('input', e => {
  if(!e.target.classList.contains('opt-val')) return;
  const { set, row } = e.target.dataset;
  state.sets[set].rows[row].min = e.target.value;
  document.querySelectorAll(`.val-chip[data-set="${set}"][data-row="${row}"]`).forEach(c => c.classList.toggle('active', Number(c.dataset.val) === Number(e.target.value)));
  renderOutputs();
});

// 아이템 레벨은 확률 구간과 재설정 비용을 한꺼번에 정한다. 입력 중에는 칸을 되돌려 쓰지 않는다
$('itemLevel').addEventListener('input', e => {
  if(e.target.value === '') return;
  setLevel(e.target.value);
  render();
});
$('itemLevel').addEventListener('blur', () => render());

$('dataSource').textContent = `넥슨 공식 확률 검색 기준 · ${DATA.fetchedAt} 수집`;
render();
