(function (root) {
  'use strict';
  // Sum binomial weights outward from the mode to avoid underflow at P(X=0)
  // and cancellation when the upper tail is very small.
  function upperTail(n, p, k) {
    if (!Number.isSafeInteger(n) || n < 0 || !Number.isFinite(p) || p < 0 || p > 1 || !Number.isSafeInteger(k) || k < 0) throw new RangeError('binomial');
    if (k === 0) return 1;
    if (k > n || p === 0) return 0;
    if (p === 1) return 1;
    const mode = Math.floor((n + 1) * p);
    let total = 1, tail = mode >= k ? 1 : 0, weight = 1;
    for (let i = mode; i > 0; i--) {
      weight *= i / (n - i + 1) * (1 - p) / p;
      if (weight === 0) break;
      total += weight;
      if (i - 1 >= k) tail += weight;
    }
    weight = 1;
    for (let i = mode; i < n; i++) {
      weight *= (n - i) / (i + 1) * p / (1 - p);
      if (weight === 0) break;
      total += weight;
      if (i + 1 >= k) tail += weight;
    }
    return Math.min(1, Math.max(0, tail / total));
  }
  function calculate(v) {
    for (const [key,min,max] of [['drop',0,10000],['meso',0,10000],['monster',1,300]]) {
      if (!Number.isFinite(v[key]) || v[key] < min || v[key] > max) throw new RangeError(key);
    }
    if (!Number.isInteger(v.monster)) throw new RangeError('monster');
    const measured = v.sixMinuteKills !== undefined && v.sixMinuteKills !== null && v.sixMinuteKills !== '';
    const count = measured ? v.sixMinuteKills : v.mobs;
    if (!Number.isInteger(count) || count < 0 || count > (measured ? 480000 : 10000)) throw new RangeError('kills');
    const kills = measured ? count * 5 : count * 240;
    const bag = Math.min(1, 0.6 * (1 + v.drop / 100));
    const multiplier = 1 + v.meso / 100;
    const pureLow = kills * bag * v.monster * 6;
    const pure = kills * bag * v.monster * 7.5;
    const pureHigh = kills * bag * v.monster * 9;
    return {kills, measured, bag, pureLow, pure, pureHigh,
      low:pureLow*multiplier, meso:pure*multiplier, high:pureHigh*multiplier,
      fragments:v.monster >= 260 ? kills * 0.000425 * (1 + Math.log1p(v.drop / 100)) : 0};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {calculate, upperTail};
  root.HuntingCalc = {calculate, upperTail};
  if (typeof document === 'undefined') return;
  const form = document.getElementById('huntingForm');
  const actual = document.getElementById('actualFragments');
  const number = n => n.toLocaleString('ko-KR', {maximumFractionDigits:0});
  const amount = n => {
    const rounded = Math.round(n), eok = Math.floor(rounded / 100000000), man = Math.floor(rounded % 100000000 / 10000), rest = rounded % 10000;
    return [eok ? number(eok)+'억' : '', man ? number(man)+'만' : '', rest || !rounded ? number(rest) : ''].filter(Boolean).join(' ');
  };
  function update() {
    const measured = form.elements.sixMinuteKills.value !== '';
    form.elements.mobs.disabled = measured;
    const valid = form.checkValidity();
    document.getElementById('inputError').hidden = valid;
    document.getElementById('results').hidden = !valid;
    if (!valid) return;
    const v = Object.fromEntries(new FormData(form));
    Object.keys(v).forEach(k => {if (v[k] !== '') v[k] = Number(v[k]);});
    const r = calculate(v);
    const put = (id,value) => {document.getElementById(id).textContent = value;};
    put('fragments',r.fragments.toFixed(2));
    for (const key of ['low','meso','high','pureLow','pure','pureHigh']) put(key,amount(r[key]));
    put('kills',number(r.kills)+'마리');
    put('killBasis',r.measured ? '6분 실측 × 5' : '240회 젠 · 전부 처치');
    put('bagRate',(r.bag*100).toLocaleString('ko-KR',{maximumFractionDigits:2})+'%');
    const rank = document.getElementById('fragmentRank');
    const note = document.getElementById('rankNote');
    if (!actual.checkValidity()) {
      rank.textContent = '입력 확인';
      note.textContent = '획득한 조각 수를 0 이상의 정수로 입력하세요.';
    } else if (actual.value === '') {
      rank.textContent = '—';
      note.textContent = '30분 동안 얻은 조각 수를 입력하세요.';
    } else if (Number(actual.value) > r.kills || (r.fragments === 0 && Number(actual.value) > 0)) {
      rank.textContent = '조건 확인';
      note.textContent = '현재 처치 수·몬스터 레벨로는 이 획득량을 계산할 수 없습니다.';
    } else {
      const k = Number(actual.value);
      const percent = upperTail(r.kills, r.kills ? r.fragments / r.kills : 0, k) * 100;
      rank.textContent = percent < 0.01 ? '상위 0.01% 미만' : '상위 '+percent.toLocaleString('ko-KR',{maximumFractionDigits:2})+'%';
      note.textContent = '같은 조건에서 '+number(k)+'개 이상 얻을 확률 · 추정 모델 기준';
    }
  }
  form.addEventListener('input',update); form.addEventListener('change',update);
  form.addEventListener('submit',e => e.preventDefault());
  actual.addEventListener('input',update);
  update();
})(typeof globalThis !== 'undefined' ? globalThis : this);
