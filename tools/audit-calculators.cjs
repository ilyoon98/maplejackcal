#!/usr/bin/env node
'use strict';

// Read-only audit. Does not update calculator sources or probability data.
// node tools/audit-calculators.cjs [--live]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: {}, document: { addEventListener() {} } });
for (const file of ['cube_option_data.js', 'cube_core.js', 'flame_core.js', 'starforce_data.js', 'starforce_calc.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const get = expression => vm.runInContext(expression, context);
const data = get('CUBE_OPTION_DATA');
const F = context.window.FlameCore;
const S = context.window.StarforceCalc;
const report = { date: '2026-10-12', dataFetchedAt: data.fetchedAt, checks: {}, findings: [], resolved: [] };
report.limitations = [
  { calculator: 'flame', issue: 'all_flames_valued_at_3000000', detail: 'The standalone UI values every flame attempt at 3,000,000 meso. This is an assumption for item flames; 3,000,000 is the official meso-reset fee.', source: 'https://maplestory.nexon.com/news/update/799' },
  { calculator: 'flame', issue: 'weapon_values_not_exhaustively_verified_against_primary_data', detail: 'Weapon attack tables originate from a community reference. Existing consistency tests pass; this audit does not certify every weapon value from primary game data.' },
  { calculator: 'grade', issue: 'fresh_pity_counter_assumed', detail: 'Expected attempts assume no existing failures in the world-wide counter for that reset method and grade.' },
  { calculator: 'starforce', issue: 'cost_and_fixed_recovery_are_not_primary_verified', detail: 'Base enhancement fees are reverse-engineered from other calculators. Fixed recovery fees are estimates computed from a discounted, safeguarded enhancement expectation; the default automatic policy uses these estimates. Markov validation proves consistency with these inputs, not exact in-game prices.' }
];
report.assumptions = [
  { calculator: 'flame_and_options', assumption: 'unconditional_probability', detail: 'At the user\'s request, previous-option input and identical-previous-result exclusion remain outside scope. Use the published unconditional probability model.' }
];
function near(actual, expected, label, tolerance = 1e-9) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance * Math.max(1, Math.abs(expected))) {
    throw new Error(`${label}: actual=${actual}, expected=${expected}`);
  }
}
function choose(n, k) { let x = 1; for (let i = 0; i < k; i++) x *= (n - i) / (i + 1); return x; }

// Independent closed-form probability of including m distinct required flame options.
let flameChecks = 0;
for (const level of [50, 60, 70, 80, 90, 140, 160, 200, 250]) {
  for (const weapon of [false, true]) for (const boss of [false, true]) for (const flame of Object.keys(F.FLAMES)) {
    const candidates = F.candidates(level, weapon);
    for (let m = 1; m <= 4; m++) {
      const minTier = boss ? 6 : 4;
      const ids = candidates.slice(0, m).map(o => o.id);
      const tail = F.FLAMES[flame].tiers.reduce((sum, p, i) => sum + (i + 1 + (boss ? 2 : 0) >= minTier ? p / 100 : 0), 0);
      const countP = boss ? [0, 0, 0, 1] : [.4, .4, .16, .04];
      const inclusion = countP.reduce((sum, p, i) => sum + (i + 1 >= m ? p * choose(i + 1, m) / choose(candidates.length, m) : 0), 0);
      near(F.probability({ level, weapon, boss, flame, conds: ids.map(id => ({ kind: 'opt', id, minTier })) }), inclusion * tail ** m, 'flame');
      flameChecks++;
    }
  }
}
report.checks.flameClosedForm = flameChecks;

// Finite geometric expectation is also the sum of survival probabilities.
let gradeChecks = 0;
const grades = get('CUBE_GRADE');
for (const cube of Object.values(grades)) for (let i = 0; i < cube.p.length; i++) {
  for (const multiplier of [1, 2]) {
    const p = cube.p[i] * multiplier, cap = cube.cap[i];
    if (cap) {
      let expected = 0;
      for (let k = 0; k < cap; k++) expected += (1 - p) ** k;
      near(context.cubeExpected(p, cap), expected, 'grade expectation');
      near(context.successCdf(cap, p, cap), 1, 'grade ceiling');
    } else near(context.cubeExpected(p, cap), 1 / p, 'uncapped grade');
    gradeChecks++;
  }
}
report.checks.gradeFormulas = gradeChecks;
const officialWhiteCaps = [31, 76, 214];
if (JSON.stringify(grades.addWhite.cap) !== JSON.stringify(officialWhiteCaps)) {
  report.findings.push({ calculator: 'grade', issue: 'additional_cube_ceiling', actual: Array.from(grades.addWhite.cap), expected: officialWhiteCaps,
    source: 'https://maplestory.nexon.com/Guide/OtherProbability/cube/addi',
    expectations: grades.addWhite.p.map((p, i) => ({ actual: context.cubeExpected(p, grades.addWhite.cap[i]), expected: context.cubeExpected(p, officialWhiteCaps[i]) })) });
} else report.resolved.push({ calculator: 'grade', issue: 'additional_cube_ceiling', caps: officialWhiteCaps,
  source: 'https://maplestory.nexon.com/Guide/OtherProbability/cube/addi' });

// Use uncompressed, ordered option triples as an independent OR/AND oracle.
const infos = get('OPTION_INFO');
function optionOracle(lines, goals) {
  const max = { useful: 1, invAfter: 1, ignore: 2, invChance: 2 };
  const weights = lines.map(rows => { const total = rows.reduce((s, r) => s + r[1], 0); return rows.map(([id, p]) => ({ info: infos[id], p: p / total })); });
  const contribution = (info, key) => info.key === key || (info.key === '올스탯|%' && ['STR|%', 'DEX|%', 'INT|%', 'LUK|%'].includes(key)) ? info.value : 0;
  let result = 0;
  function walk(line, selected, probability, counts) {
    if (line === 3) {
      if (goals.some(goal => goal.every(([key, min]) => selected.reduce((sum, info) => sum + contribution(info, key), 0) >= min - 1e-9))) result += probability;
      return;
    }
    const allowed = weights[line].filter(x => !x.info.group || (counts[x.info.group] || 0) < max[x.info.group]);
    const mass = allowed.reduce((sum, x) => sum + x.p, 0);
    for (const x of allowed) walk(line + 1, [...selected, x.info], probability * x.p / mass, x.info.group ? { ...counts, [x.info.group]: (counts[x.info.group] || 0) + 1 } : counts);
  }
  walk(0, [], 1, {});
  return result;
}
let tables = 0, maximumRoundingDeviation = 0;
const jobs = [];
const cubeIds = { black: 5062010, red: 5062009, artisan: 2711004, addi: 5062500 };
const partIds = Object.keys(data.cubes.black.grades['레전드리']);
for (const [cubeKey, cube] of Object.entries(data.cubes)) for (const [grade, parts] of Object.entries(cube.grades)) {
  for (const [part, brackets] of Object.entries(parts)) for (const bracket of brackets) {
    if (bracket.lines.length !== 3 || bracket.min > bracket.max) throw new Error('Invalid option bracket');
    for (const rows of bracket.lines) {
      const total = rows.reduce((sum, [id, p]) => { if (!infos[id] || !(p > 0)) throw new Error('Invalid option row'); return sum + p; }, 0);
      maximumRoundingDeviation = Math.max(maximumRoundingDeviation, Math.abs(total - 100));
      if (Math.abs(total - 100) > .01) throw new Error(`Option total ${total}`);
    }
    near(context.successProb(bracket.lines, [[['STR|%', 0]]]), 1, 'all outcomes');
    jobs.push({ cubeKey, cubeId: cubeIds[cubeKey], grade, gradeId: { '에픽': 2, '유니크': 3, '레전드리': 4 }[grade], part, partId: partIds.indexOf(part) + 1, level: bracket.max, lines: bracket.lines });
    tables++;
  }
}
report.checks.optionTables = { tables, lines: tables * 3, maximumRoundingDeviation };
let optionChecks = 0;
for (const cubeKey of ['black', 'red', 'artisan', 'addi']) for (const part of ['무기', '모자', '장갑', '반지']) {
  const bracket = data.cubes[cubeKey].grades['레전드리'][part].find(b => b.min <= 200 && b.max >= 200);
  const goals = part === '무기' ? [[['공격력|%', 21]], [['보스 몬스터 데미지|%', 70], ['공격력|%', 9]]]
    : part === '모자' ? [[['스킬 재사용 대기시간|초', 4]], [['STR|%', 27]]]
    : part === '장갑' ? [[['크리티컬 데미지|%', 16]], [['STR|%', 27]]]
    : [[['메소 획득량|%', 40]], [['아이템 드롭률|%', 40]], [['STR|%', 27]]];
  near(context.successProb(bracket.lines, goals), optionOracle(bracket.lines, goals), 'option OR/AND');
  const one = context.successProb(bracket.lines, [goals[0]]);
  near(context.successProb(bracket.lines, [goals[0], goals[0]]), one, 'duplicate OR');
  near(context.successProb(bracket.lines, [[['STR|%', 1000]]]), 0, 'impossible stat');
  optionChecks += 3;
}
report.checks.optionEnumeration = optionChecks;

// Solve the absorbing Markov chain directly instead of using per-star recurrence.
function solve(matrix, rhs) {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i;
    [a[k], a[pivot]] = [a[pivot], a[k]];
    const v = a[k][k];
    if (Math.abs(v) < 1e-15) throw new Error('Singular Markov chain');
    for (let j = k; j <= n; j++) a[k][j] /= v;
    for (let i = 0; i < n; i++) if (i !== k) {
      const f = a[i][k];
      for (let j = k; j <= n; j++) a[i][j] -= f * a[k][j];
    }
  }
  return a.map(row => row[n]);
}
let starChecks = 0;
for (const level of [140, 200, 250]) for (const start of [0, 12, 18, 22]) for (const goal of [17, 22, 25, 30]) {
  if (start >= goal) continue;
  for (const variant of [0, 1, 2, 3]) {
    const opts = { level, start, goal, spare: 1e9, safeguard: variant === 1 ? {15: true, 16: true, 17: true} : {},
      discount30: variant === 2, destroyDown30: variant === 2, lucky5: variant === 3, recoveryMode: variant === 3 ? 'auto' : 'off', mvp: .1, pcRoom: true };
    const result = S.calculate(opts), lo = Math.min(start, 12), n = goal - lo;
    const matrix = Array.from({length: n}, () => Array(n).fill(0)), money = [], tries = [], destroys = [];
    for (let s = lo; s < goal; s++) {
      const step = result.steps[s], recovery = result.recovery.find(r => r.star === s);
      const fixed = recovery && recovery.useFixed, reset = fixed ? recovery.restoreStar : 12;
      const replacement = fixed ? recovery.fee + recovery.copies * opts.spare : opts.spare;
      const i = s - lo;
      matrix[i][i] += step.p + step.d;
      if (s + 1 < goal) matrix[i][i + 1] -= step.p;
      if (step.d) matrix[i][reset - lo] -= step.d;
      money.push(step.cost + step.d * replacement); tries.push(1); destroys.push(step.d);
    }
    for (const [key, rhs] of [['meso', money], ['tries', tries], ['destroys', destroys]]) {
      near(result.total[key], solve(matrix, rhs)[start - lo], `starforce ${start}->${goal} ${key}`, 1e-6);
      starChecks++;
    }
  }
}
report.checks.starforceMarkov = starChecks;
let maximumChecks = 0;
for (const [level, max] of [[94,5],[95,8],[107,8],[108,10],[117,10],[118,15],[127,15],[128,20],[137,20],[138,30]]) {
  near(context.window.StarforceData.maxStarForLevel(level), max, 'level maximum');
  try {
    S.calculate({level, start: 0, goal: max + 1, spare: 0});
    throw new Error('Out-of-range enhancement was accepted');
  } catch (error) {
    if (error.name !== 'RangeError') throw error;
  }
  maximumChecks++;
}
report.checks.starforceLevelMaximum = maximumChecks;
report.resolved.push({ calculator: 'starforce', issue: 'level_maximum_not_enforced', example: {level: 130, maxStar: 20},
  source: 'https://maplestory.nexon.com/Guide/N23GameInformation/Articles/412' });
report.resolved.push({ calculator: 'item_craft', issue: 'flame_cost_repeated_after_destruction', detail: 'Flame creation is charged once, in both expectations and percentile samples. Each destruction charges the selected restoration fee and required copies multiplied by the replacement item price, without recreating flames. Regression-tested in tests/item-craft.test.cjs.',
  source: 'https://maplestory.nexon.com/Guide/N23GameInformation/Articles/412' });
report.resolved.push({ calculator: 'item_craft', issue: 'automatic_recovery_not_passed_to_shared_engine', detail: 'Crafting now passes recoveryMode=auto and recoveryDiscount20 to both expectations and percentile sampling. Safeguard selection compares all 8 combinations with the same automatic recovery policy. The restoration table and required copies match StarforceCalc.calculate; tested against low/high replacement prices and restoration discounts in tests/item-craft.test.cjs.' });

async function liveAudit() {
  const mismatches = [], errors = [];
  let next = 0, done = 0;
  function parse(html) {
    const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    return html.split('<table class="cube_data').slice(1).map(t => t.slice(0, t.indexOf('</table>')).split('<tr>').slice(1)
      .map(tr => [...tr.matchAll(/<td>([^<]*)<\/td>/g)].map(m => decode(m[1].trim())))
      .filter(tds => tds.length >= 2).map(tds => [tds[0], Number(tds[1].replace('%', ''))]));
  }
  await Promise.all(Array.from({length: 4}, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const response = await fetch('https://maplestory.nexon.com/Guide/OtherProbability/cube/GetSearchProbList', { method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
          body: new URLSearchParams({nCubeItemID: job.cubeId, nGrade: job.gradeId, nPartsType: job.partId, nReqLev: job.level}), signal: AbortSignal.timeout(20000) });
        const html = await response.text();
        if (!response.ok || !html.includes('cube_data')) throw new Error(`HTTP ${response.status}; no probability tables`);
        const live = parse(html), stored = job.lines.map(rows => rows.map(([id, p]) => [data.options[id], p]));
        const canonical = lines => lines.map(rows => rows.slice().sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]));
        if (JSON.stringify(canonical(live)) !== JSON.stringify(canonical(stored))) mismatches.push({ cube: job.cubeKey, grade: job.grade, part: job.part, level: job.level, live, stored });
      } catch (error) { errors.push({ cube: job.cubeKey, grade: job.grade, part: job.part, level: job.level, error: error.message }); }
      if (++done % 100 === 0) console.error(`Official option tables: ${done}/${jobs.length}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }));
  report.checks.liveOptionTables = { requested: jobs.length, matched: jobs.length - mismatches.length - errors.length, mismatches, errors, source: 'https://maplestory.nexon.com/Guide/OtherProbability/cube' };
}
(async () => {
  if (process.argv.includes('--live')) await liveAudit();
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
