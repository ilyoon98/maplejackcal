const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function app(saved = {}) {
  const nodes = new Map(), handlers = {};
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { dataset: {}, classList: { toggle() {} } });
    return nodes.get(id);
  };
  const context = vm.createContext({
    window: {},
    localStorage: { getItem: () => JSON.stringify(saved), setItem() {} },
    document: { getElementById: get, querySelectorAll: () => [], addEventListener: (name, fn) => { handlers[name] = fn; } }
  });
  for (const file of ['cube_option_data.js', 'cube_core.js', 'flame_core.js', 'starforce_data.js', 'starforce_calc.js', 'item_craft_calc.js']) {
    let source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    if (file === 'item_craft_calc.js') source = source.replace(/\}\)\(\);\s*$/, 'window.test = { state, compute, refresh };})();');
    vm.runInContext(source, context);
  }
  const api = context.window.test;
  api.refresh();
  return { ...api, context, get,
    click: dataset => handlers.click({ target: { closest: () => ({ dataset }) } }),
    input: (dataset, value) => handlers.input({ target: { dataset, value } }),
    change: part => handlers.change({ target: { id: 'part', value: part } }) };
}

test('무기 기본 공·마 목표와 단일 확률, 부위 전환 기본값', () => {
  const a = app();
  assert.equal(a.state.flameConds[0].id, 'ATT');
  assert.equal(a.state.flameConds[0].minTier, 6);
  assert.match(a.get('flameBody').innerHTML, /공격력·마력/);
  assert.doesNotMatch(a.get('flameBody').innerHTML, /data-addflame="MATT"/);
  const expected = a.context.window.FlameCore.probability({ level: 200, weapon: true, boss: true,
    flame: 'mesoReset', conds: [{ kind: 'opt', id: 'ATT', minTier: 6 }] });
  assert.equal(a.compute().flame.p, expected);
  a.change('모자');
  assert.equal(a.state.flameConds.length, 0);
  a.change('무기');
  assert.equal(a.state.flameConds[0].id, 'ATT');
});

test('엠블렘 저장값의 레벨을 보정하고 불가능한 강화 비용을 제외한다', () => {
  const a = app({ part: '엠블렘', level: 250,
    flameConds: [{ kind: 'opt', id: 'ATT', minTier: 6 }],
    pot: { from: 3, to: 3, rows: [{ key: '공격력|%', min: 12 }] } });
  assert.equal(a.state.level, 200);
  assert.equal(a.get('flamePanel').hidden, true);
  assert.equal(a.get('starPanel').hidden, true);
  assert.equal(a.get('on-star').disabled, true);
  const r = a.compute();
  assert.equal(r.flame, null);
  assert.equal(r.star, null);
  assert.equal(r.pot.opt.missing, false);
  assert.ok(Number.isFinite(r.avg));
  assert.doesNotMatch(a.get('potBody').innerHTML, /확률표에 없어/);
  a.change('무기');
  assert.equal(a.get('starPanel').hidden, false);
  assert.ok(a.compute().star.avg > 0);
});

test('보조무기 스타포스 선택과 방패·반지 스타포스 유지', () => {
  const a = app();
  a.change('보조무기(포스실드, 소울링 제외)');
  assert.equal(a.compute().flame, null);
  assert.equal(a.get('starPanel').hidden, false);
  assert.equal(a.get('on-star').disabled, false);
  assert.ok(a.compute().star.avg > 0);
  a.state.on.star = false;
  a.refresh();
  assert.equal(a.compute().star, null);
  a.state.on.star = true;
  for (const part of ['포스실드, 소울링']) {
    a.change(part);
    assert.equal(a.compute().flame, null);
    assert.equal(a.compute().star, null);
    assert.equal(a.get('starPanel').hidden, true);
  }
  for (const part of ['방패', '반지', '어깨장식', '기계심장']) {
    a.change(part);
    assert.equal(a.get('flamePanel').hidden, true);
    assert.ok(a.compute().star.avg > 0);
  }
});

test('기존 마력 목표를 공·마 한 항목으로 복원한다', () => {
  const a = app({ flameConds: [{ kind: 'opt', id: 'MATT', minTier: 7 }, { kind: 'opt', id: 'ATT', minTier: 6 }] });
  assert.equal(a.state.flameConds.length, 1);
  assert.equal(a.state.flameConds[0].id, 'ATT');
  assert.equal(a.state.flameConds[0].minTier, 7);
});

test('엠블렘 레전드리 확률은 공식 블랙 큐브 표와 일치한다', () => {
  const a = app({ part: '엠블렘' });
  const result = vm.runInContext(`bracketOf('black', '엠블렘', 200, '레전드리').lines.map(rows =>
    rows.find(([i]) => DATA.options[i] === '공격력 +12%')[1])`, a.context);
  assert.deepEqual(Array.from(result), [5.7143, 1.1429, 0.2857]);
});

test('기존 목표를 보존하고 세 줄 합계와 직접 입력 성공 기준을 보여준다', () => {
  const a = app({ pot: { from: 3, to: 3, rows: [{ key: '공격력|%', min: 21 }] } });
  assert.equal(a.state.pot.sets[0].rows[0].min, 21);
  assert.match(a.get('potBody').innerHTML, /data-val="33"/);
  a.input({ pot: 'pot', set: '0', row: '0' }, '20');
  assert.match(a.get('hit-pot-0-0').innerHTML, /21%/);
  a.input({ pot: 'pot', set: '0', row: '0' }, '100');
  assert.match(a.get('hit-pot-0-0').innerHTML, /만들 수 없는/);
  assert.equal(a.compute().pot.opt.p, 0);
});

test('잠재·에디 OR 조건은 중복 확률을 더하지 않고 빈 조건을 무시한다', () => {
  const a = app({ pot: { from: 3, to: 3, rows: [{ key: '공격력|%', min: 21 }] },
    addi: { from: 3, to: 3, rows: [{ key: '공격력|%', min: 21 }] } });
  for (const short of ['pot', 'addi']) {
    const p = a.compute()[short].opt.p;
    a.click({ addSet: short });
    assert.equal(a.compute()[short].opt.p, p);
    a.click({ addpot: short, key: '공격력|%' });
    a.click({ pot: short, set: '1', row: '0', val: '21' });
    assert.equal(a.compute()[short].opt.p, p);
    a.click({ pot: short, set: '0', row: '0', val: '30' });
    assert.equal(a.state[short].sets[0].rows[0].min, '30');
    assert.equal(a.state[short].sets[1].rows[0].min, '21');
    assert.equal(a.compute()[short].opt.p, p);
    a.click({ removeSet: short, set: '0' });
    assert.equal(a.state[short].active, 0);
    assert.equal(a.state[short].sets.length, 1);
    assert.equal(a.compute()[short].opt.p, p);
  }
});

test('아무 스탯이나는 큐브 엔진의 네 스탯 OR 확률과 일치하고 저장 복원이 된다', () => {
  const a = app({ part: '모자', pot: { from: 3, to: 3, rows: [{ key: 'INT|%', min: 21 }] } });
  assert.equal(a.state.pot.rows[0].key, 'STR|%');
  const single = a.compute().pot.opt.p;
  a.click({ pot: 'pot', set: '0', row: '0', any: '1' });
  const expected = vm.runInContext(`successProb(bracketOf('black', '모자', 200, '레전드리').lines,
    MAIN_STATS.map(key => [[key, 21]]))`, a.context);
  assert.equal(a.compute().pot.opt.p, expected);
  assert.ok(expected > single);
  const restored = app(JSON.parse(JSON.stringify(a.state)));
  assert.equal(restored.state.pot.rows[0].any, true);
  assert.equal(restored.compute().pot.opt.p, expected);
});

test('비용 제외 옵션도 배지와 최종 목표 아이템에 유지한다', () => {
  const a = app({ on: { flame: false, star: false, pot: false },
    pot: { from: 3, to: 3, rows: [{ key: '공격력|%', min: 21 }] } });
  assert.match(a.get('flamePanel').dataset.optionSummary, /공격력·마력 2추 이상/);
  assert.match(a.get('starPanel').dataset.optionSummary, /22성/);
  assert.match(a.get('potPanel').dataset.optionSummary, /공격력 % 21% 이상/);
  assert.match(a.get('potPanel').dataset.optionSummary, /ic-option-badge excluded/);
  assert.match(a.get('itemPreview').innerHTML, /공격력 % 21% 이상/);
  assert.equal(a.compute().pot.avg, 0);
  assert.equal(a.compute().star, null);
  assert.equal(a.compute().flame, null);
  a.change('엠블렘');
  assert.doesNotMatch(a.get('itemPreview').innerHTML, /<strong>스타포스/);
  assert.doesNotMatch(a.get('itemPreview').innerHTML, /<strong>추가옵션/);
});
