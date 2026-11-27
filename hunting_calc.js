(function (root) {
  'use strict';
  const HuntingIncome = typeof module !== 'undefined' && module.exports
    ? require('./hunting_income.js') : root.HuntingIncome;
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
    return new HuntingIncome(v).rewards;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {calculate, upperTail};
  root.HuntingCalc = {calculate, upperTail};
  if (typeof document === 'undefined') return;
  const form = document.getElementById('huntingForm');
  if (!form) return;
  const actual = document.getElementById('actualFragments');
  const target = document.getElementById('huntingTarget');
  const targetError = document.getElementById('targetError');
  const targetSessions = document.getElementById('targetSessions');
  const statFields = ['drop', 'meso', 'monster', 'mobs', 'fragmentPrice'];
  const buffNames = Object.keys(HuntingIncome.buffs);
  const put = (id, value) => { document.getElementById(id).textContent = value; };
  const number = n => n.toLocaleString('ko-KR', {maximumFractionDigits:0});
  const rate = n => n.toLocaleString('ko-KR', {maximumFractionDigits:2}) + '%';
  const amount = n => {
    const rounded = Math.round(n), eok = Math.floor(rounded / 100000000), man = Math.floor(rounded % 100000000 / 10000), rest = rounded % 10000;
    return [eok ? number(eok)+'억' : '', man ? number(man)+'만' : '', rest || !rounded ? number(rest) : ''].filter(Boolean).join(' ');
  };
  let income;
  function restoreSettings() {
    const settings = HuntingIncome.loadSettings();
    for (const key of statFields) form.elements[key].value = settings[key] ?? HuntingIncome.defaults[key];
    form.elements.sixMinuteKills.value = settings.sixMinuteKills ?? '';
    for (const name of buffNames) form.elements[name].checked = settings.buffs?.[name] === true;
    update();
  }
  function updateTarget() {
    const raw = target.value.trim();
    const valid = raw === '' || /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw);
    target.setAttribute('aria-invalid', String(!valid));
    targetError.hidden = valid;
    const sessions = valid && raw && income ? income.sessionsFor(BigInt(raw.replaceAll(',', ''))) : null;
    targetSessions.textContent = sessions !== null ? number(sessions) + '회'
      : valid && raw && income ? '사냥 수입 0메소로 환산할 수 없습니다.' : '—';
  }
  function update(persist = false) {
    const measured = form.elements.sixMinuteKills.value !== '';
    form.elements.mobs.disabled = measured;
    const valid = form.checkValidity();
    document.getElementById('inputError').hidden = valid;
    document.getElementById('results').hidden = !valid;
    if (!valid) return;
    const settings = Object.fromEntries(statFields.map(key => [key, form.elements[key].valueAsNumber]));
    if (!Number.isInteger(settings.mobs) || settings.mobs < 0 || settings.mobs > 10000) settings.mobs = HuntingIncome.defaults.mobs;
    settings.sixMinuteKills = measured ? form.elements.sixMinuteKills.valueAsNumber : '';
    settings.buffs = Object.fromEntries(buffNames.map(name => [name, form.elements[name].checked]));
    income = new HuntingIncome(settings);
    if (persist) HuntingIncome.saveSettings(settings);
    const r = income.rewards;
    put('fragments',r.fragments.toFixed(2));
    for (const key of ['low','meso','high','pureLow','pure','pureHigh']) put(key,amount(r[key]));
    put('kills',number(r.kills)+'마리');
    put('killBasis',r.measured ? '6분 실측 × 5' : '240회 젠 · 전부 처치');
    put('bagRate',rate(r.bag * 100));
    put('appliedRates', `적용 아획 +${rate(r.effectiveDrop)}, 최종 메획 +${rate((r.mesoMultiplier - 1) * 100)}`);
    put('sessionMeso', amount(income.sessionMeso));
    put('sessionBreakdown', income.fragmentPrice ? `사냥 ${amount(r.meso)} 메소와 조각 판매 ${amount(income.fragmentMeso)} 메소`
      : `사냥 ${amount(r.meso)} 메소`);
    updateTarget();
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
  form.addEventListener('input', () => update(true));
  form.addEventListener('change', () => update(true));
  form.addEventListener('submit',e => e.preventDefault());
  actual.addEventListener('input', () => update());
  target.addEventListener('input', updateTarget);
  put('sessionTitle', `1재획(${HuntingIncome.sessionMinutes}분) 기대 수입`);
  for (const name of buffNames) {
    const effect = HuntingIncome.buffs[name];
    const parts = [];
    if (effect.drop) parts.push(`아획 +${effect.drop}%p`);
    if (effect.meso) parts.push(`메획 +${effect.meso}%p`);
    if (effect.finalMeso) parts.push(`최종 메소 ×${1 + effect.finalMeso / 100}`);
    put(`${name}Effect`, parts.join(', '));
  }
  root.addEventListener('storage', event => {
    if (event.key === HuntingIncome.storageKey || event.key === null) restoreSettings();
  });
  root.addEventListener('pageshow', event => { if (event.persisted) restoreSettings(); });
  restoreSettings();
})(typeof globalThis !== 'undefined' ? globalThis : this);
