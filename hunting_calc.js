(function (root) {
  'use strict';
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
  if (typeof module !== 'undefined' && module.exports) module.exports = {calculate};
  root.HuntingCalc = {calculate};
  if (typeof document === 'undefined') return;
  const form = document.getElementById('huntingForm');
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
  }
  form.addEventListener('input',update); form.addEventListener('change',update);
  form.addEventListener('submit',e => e.preventDefault());
  update();
})(typeof globalThis !== 'undefined' ? globalThis : this);
