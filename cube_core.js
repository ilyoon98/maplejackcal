// 큐브 공통 엔진. 큐브 옵션 확률 계산기(cube_option_calc.js)와 잠재능력 큐브 연구소(cube_calc.js),
// 아이템 제작 비용 계산기(item_craft_calc.js)가 같이 쓴다.
//
// 여기에는 DOM을 건드리지 않는 것만 둔다: 재설정 비용표, 옵션 이름 파싱, 한 줄씩 펼쳐서
// "원하는 옵션이 한 번에 뜰 확률"을 구하는 계산.
// 옵션 확률표(554KB)는 필요한 페이지만 불러온다. 재설정 비용·등급업 확률만 쓰는 페이지는 이 파일만 읽으면 된다.
const DATA = typeof CUBE_OPTION_DATA === 'undefined' ? null : CUBE_OPTION_DATA;
const MAIN_STATS = ['STR|%', 'DEX|%', 'INT|%', 'LUK|%'];
const ALL_STAT = '올스탯|%';

// 레벨구간 → [레어,에픽,유니크,레전드리] 재설정 메소
const LEVEL_BRACKETS = [[1,'1~159'],[160,'160~199'],[200,'200~249'],[250,'250~300']];
const POTENTIAL_COST = { 1:[4000000,16000000,34000000,40000000], 160:[4250000,17000000,36125000,42500000], 200:[4500000,18000000,38250000,45000000], 250:[5000000,20000000,42500000,50000000] };
const ADDITIONAL_COST = { 1:[9750000,27300000,66300000,78000000], 160:[10375000,29050000,70550000,83000000], 200:[11000000,30800000,74800000,88000000], 250:[12250000,34300000,83300000,98000000] };
const PRICE_TABLES = { potential:POTENTIAL_COST, additional:ADDITIONAL_COST };
const LEGENDARY = 3;

// 메소 재설정 비용표의 레벨 구간 키
function costBracket(level){ return [...LEVEL_BRACKETS].reverse().find(([lv]) => level >= lv)[0]; }
// 큐브를 쓸 때 같이 나가는 메소. 큐브 종류·등급과 무관하게 아이템 레벨 n으로만 정해진다.
// (인게임 재설정 창의 "재설정 비용". 200제면 200*200*20 = 800,000)
function cubeFee(level){
  const n = Number(level) || 0;
  const rate = n >= 121 ? 20 : n >= 71 ? 2.5 : n >= 31 ? .25 : 0;
  return Math.floor(n * n * rate);
}

// 등급업 확률(1회 성공 확률)과 천장(그 횟수째에는 반드시 등급업). 넥슨 공식 확률 공개 기준.
const CUBE_GRADE = {
  potentialMeso:{ p:[.15,.035,.014], cap:[10,42,107] },
  black:{ p:[.15,.035,.014], cap:[10,42,107] },
  red:{ p:[.06,.018,.003], cap:[25,83,500] },
  meisterMax:{ p:[.079994,.016959,.001996], cap:[null,null,null] },
  meister:{ p:[.047619,.011858], cap:[null,null] },
  suspicious:{ p:[.009901], cap:[null] },
  addReset:{ p:[.02381,.009804,.007], cap:[62,152,214] },
  addWhite:{ p:[.047619,.019608,.007], cap:[62,152,214] },
  addSuspicious:{ p:[.004], cap:[null] }
};
// 천장이 있으면 그 횟수째에 반드시 성공하므로 기대 횟수가 1/p보다 짧아진다
function cubeExpected(p, cap){ return cap ? (1 - Math.pow(1 - p, cap)) / p : 1 / p; }
// k번 안에 성공할 확률. 천장에 닿으면 100%
function successCdf(k, p, cap){
  if(cap && k >= cap) return 1;
  return 1 - Math.pow(1 - p, k);
}

// 공식 확률 페이지의 "세 개의 옵션 중 최대 N개" 규칙. 앞 줄에서 한도를 채운 계열은 다음 줄 후보에서 빠지고,
// 남은 옵션 확률은 표기확률 / (100% - 빠진 옵션 표기확률 합)이 된다.
const GROUP_MAX = { useful:1, invAfter:1, ignore:2, invChance:2 };
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
const OPTION_INFO = DATA ? DATA.options.map(parseOption) : [];

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
  return key.split('|')[1] || '';
}
// STR·DEX·INT·LUK %는 올스탯 %를 같은 양으로 더해 센다
function contrib(info, key){
  if(info.key === key) return info.value;
  if(info.key === ALL_STAT && MAIN_STATS.includes(key)) return info.value;
  return 0;
}

// cube_option_data.js의 큐브 키로 확률 구간을 찾는다
function bracketOf(dataName, part, level, grade){
  return (partsOf(dataName, grade)[part] || []).find(b => b.min <= level && level <= b.max) || null;
}
// 등급별 옵션표. 레드·명장 큐브는 레전드리만 모아 뒀다(유니크 목표로 쓰이지 않아서).
function partsOf(dataName, grade){
  return (DATA.cubes[dataName].grades || {})[grade || '레전드리'] || {};
}
// STR·DEX·INT·LUK %는 확률이 완전히 같아서 하나로 묶어 "주스탯 %"로 보여준다(대표는 STR).
const MAIN_STAT_KEY = 'STR|%';
const HIDDEN_STAT_KEYS = ['DEX|%', 'INT|%', 'LUK|%'];

// 목표 수치는 "이상" 조건이라, 실제로 구분되는 값은 세 줄로 만들 수 있는 합계들뿐이다.
// (9%와 1%는 결과가 같다. 둘 다 9 이상이면 성공이므로.)
// 그 합계를 줄 수별로 모아 돌려준다. 같은 합계는 더 적은 줄 수 쪽에만 넣는다.
function reachableSums(bracket, key){
  const keys = keysOf(bracket);
  const info = keys.get(key);
  if(!info || !key.includes('|')) return [];
  const set = new Set(info.values);
  // 주스탯 %에는 올스탯 %가 같은 양으로 더해지므로 올스탯 수치도 후보에 넣는다
  if(MAIN_STATS.includes(key) && keys.has(ALL_STAT)) for(const v of keys.get(ALL_STAT).values) set.add(v);
  const vals = [...set].sort((a, b) => a - b);
  const groups = [];
  const seen = new Set();
  let cur = [0];
  for(let n = 1; n <= 3; n++){
    const next = new Set();
    for(const s of cur) for(const v of vals) next.add(Number((s + v).toFixed(4)));
    cur = [...next].sort((a, b) => a - b);
    const sums = cur.filter(v => !seen.has(v));
    sums.forEach(v => seen.add(v));
    if(sums.length) groups.push({ n, sums });
  }
  return groups;
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
