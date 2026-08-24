const TIERS = [
  { key: 'pafnir', name: '파프니르', level: 150 },
  { key: 'absolab', name: '앱솔랩스', level: 160 },
  { key: 'arcaneshade', name: '아케인셰이드', level: 200 },
  { key: 'eternel', name: '에테르넬', level: 250 },
];

const ICON_BASE = 'https://maplestory.io/api/KMS/389/item';

// 서버 없이 동작하도록 티어별 부위 대표 아이템(아이콘/이름/레벨)을 하드코딩.
// maplestory.io 공개 아이콘을 직접 <img src>로 불러오므로 서버가 필요 없음.
const PART_LABELS = { weapon: '무기', hat: '모자', armor: '방어구', glove: '장갑' };
const BUCKET_ORDER = ['weapon', 'hat', 'armor', 'glove'];
const TIER_ITEMS = {
  pafnir: {
    weapon: { id: 1214016, name: '파프니르 나이트체이서', requiredLevel: 150 },
    armor: { id: 1052882, name: '파프니르 방어구', requiredLevel: 150, approxIcon: true },
  },
  absolab: {
    weapon: { id: 1212115, name: '앱솔랩스 샤이닝로드', requiredLevel: 160 },
    hat: { id: 1004422, name: '앱솔랩스 나이트헬름', requiredLevel: 160 },
    armor: { id: 1052882, name: '앱솔랩스 나이트슈트', requiredLevel: 160 },
    glove: { id: 1082636, name: '앱솔랩스 나이트글러브', requiredLevel: 160 },
  },
  arcaneshade: {
    weapon: { id: 1212120, name: '아케인셰이드 샤이닝로드', requiredLevel: 200 },
    hat: { id: 1004808, name: '아케인셰이드 나이트햇', requiredLevel: 200 },
    armor: { id: 1053063, name: '아케인셰이드 나이트슈트', requiredLevel: 200 },
    glove: { id: 1082695, name: '아케인셰이드 나이트글러브', requiredLevel: 200 },
  },
  eternel: {
    hat: { id: 1005980, name: '에테르넬 나이트헬름', requiredLevel: 250 },
    armor: { id: 1042433, name: '에테르넬 나이트아머', requiredLevel: 250 },
    glove: { id: 1082695, name: '에테르넬 장갑', requiredLevel: 250, approxIcon: true },
  },
};

// 레벨 -> [100%, 70%, 30%, 15%] 구간별 1회 시도 주흔 소모량 (실측 수치)
const WEAPON_COST = {
  100: [22, 28, 30, 40], 110: [26, 34, 40, 48], 120: [93, 120, 144, 174], 130: [120, 156, 186, 222],
  140: [144, 192, 228, 276], 150: [300, 390, 470, 570], 160: [370, 480, 575, 690], 200: [725, 940, 1125, 1350],
};
const ARMOR_COST = {
  100: [13, 17, 20, 24], 110: [16, 20, 24, 29], 120: [57, 72, 87, 104], 130: [72, 93, 114, 133],
  140: [90, 117, 138, 166], 150: [185, 240, 290, 342], 160: [220, 285, 345, 414], 200: [435, 565, 675, 910], 250: [850, 1100, 1325, 1560],
};
const GLOVE_COST = {
  100: [17, 23, 27, 32], 110: [20, 27, 33, 38], 120: [75, 96, 117, 139], 130: [96, 123, 150, 178],
  140: [120, 156, 186, 221], 150: [245, 320, 380, 456], 160: [295, 385, 460, 550], 200: [580, 750, 900, 1080], 250: [1135, 1475, 1770, 2080],
};

// 부위 버킷 -> 작수 모델 (총 몇 작을 해야 완성인지 + 비용 테이블)
const JAK_DEFS = {
  weapon: { label: '무기', totalJak: 9, table: WEAPON_COST },
  hat: { label: '모자', totalJak: 12, table: ARMOR_COST },
  armor: { label: '방어구', totalJak: 8, table: ARMOR_COST },
  glove: { label: '장갑', totalJak: 8, table: GLOVE_COST },
};

// 진행할 작의 종류(확률 구간). 인덱스는 비용 테이블의 [100%,70%,30%,15%] 순서와 대응.
const BRACKETS = [100, 70, 30, 15];
const PROB_PRESET = {
  base: { 100: 100, 70: 70, 30: 30, 15: 15 },
  fever: { 100: 100, 70: 95, 30: 45, 15: 25 },
};

// 이노센트/아크이노센트/순백은 부위·레벨과 무관하게 항상 고정된 값
const INNOCENT_COST = 12000;
const ARC_INNOCENT_COST = 24000;
const PROTECT_COST = 20000;

let state = {
  tier: null,
  selectedPart: null, // {bucket, item}
  selectedBracket: null, // 100 | 70 | 30 | 15
};

let probMode = 'fever';
let bonusKeys = ['dex', 'guild'];
let resetMode = 'innocent'; // 'none' | 'innocent' | 'arc' — 선택 해제하면 이노센트/아크이노센트 자체를 안 쓰는 것
let resetFunded = true; // 이노센트/아크이노센트를 주흔으로 조달했는지 (해제하면 0비용, 그래도 여전히 전략 후보)
let protectFunded = true; // 순백을 주흔으로 조달했는지 (해제하면 0비용, 그래도 여전히 전략 후보)
let halfPriceOn = false;
let lastBracketKey = '15'; // 아이템을 바꿔도 마지막에 고른 구간을 기억해서 기본 선택
let slotStates = []; // '지금 상태 확인하기' 슬롯 클릭 상태: 'none' | 'success' | 'fail'

// ---------- 카드형 토글(라디오/체크박스 대체) ----------
// multi: 여러 개 동시 선택 가능(체크박스형)
// !multi: 단일 선택(라디오형). deselectable이면 선택된 걸 다시 클릭해서 없음(빈 선택) 상태로 만들 수 있음.

function renderCardGroup(container, items, { multi, deselectable, defaultActive, onChange, renderExtra }) {
  container.innerHTML = '';
  const active = new Set(defaultActive || []);

  function refresh() {
    [...container.children].forEach((el) => {
      el.classList.toggle('active', active.has(el.dataset.key));
    });
  }

  for (const item of items) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'toggle-card';
    el.dataset.key = item.key;
    el.innerHTML = `
      ${item.icon ? `<img alt="" data-icon />` : ''}
      <span>
        <div class="title">${item.title}</div>
        ${item.subtitle ? `<div class="subtitle">${item.subtitle}</div>` : ''}
      </span>
      <span class="check">✓</span>
    `;
    if (renderExtra) renderExtra(el, item);
    el.addEventListener('click', () => {
      if (multi) {
        if (active.has(item.key)) active.delete(item.key);
        else active.add(item.key);
      } else if (deselectable && active.has(item.key)) {
        active.clear();
      } else {
        active.clear();
        active.add(item.key);
      }
      refresh();
      onChange([...active]);
    });
    container.appendChild(el);
  }
  refresh();
  return {
    getActive: () => [...active],
    setActive: (keys) => { active.clear(); keys.forEach((k) => active.add(k)); refresh(); },
  };
}

// 독립적인 온오프 항목(순백 조달, 보너스, 이벤트)은 박스형 카드 대신 얇은 스위치 목록으로 그린다.
// 항목이 하나뿐인 그룹도 "카드 안에 카드 하나만" 있는 어색한 모양이 안 나오게 하기 위함.
function renderSwitchGroup(container, items, { defaultActive, onChange }) {
  container.innerHTML = '';
  const active = new Set(defaultActive || []);

  function refresh() {
    [...container.children].forEach((el) => {
      const isActive = active.has(el.dataset.key);
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-checked', String(isActive));
    });
  }

  for (const item of items) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'switch-item';
    el.dataset.key = item.key;
    el.setAttribute('role', 'switch');
    el.innerHTML = `
      <span class="switch-track"><span class="switch-thumb"></span></span>
      <span class="switch-text">${item.title}${item.subtitle ? `<span class="switch-sub">${item.subtitle}</span>` : ''}</span>
    `;
    el.addEventListener('click', () => {
      if (active.has(item.key)) active.delete(item.key);
      else active.add(item.key);
      refresh();
      onChange([...active]);
    });
    container.appendChild(el);
  }
  refresh();
  return {
    getActive: () => [...active],
    setActive: (keys) => { active.clear(); keys.forEach((k) => active.add(k)); refresh(); },
  };
}

// ---------- 아이템 선택 ----------

const tierListEl = document.getElementById('tierList');
const partListEl = document.getElementById('partList');
const partListWrapEl = document.getElementById('partListWrap');
const partListPointerEl = document.getElementById('partListPointer');
const itemPreviewEl = document.getElementById('itemPreview');
const itemNoteEl = document.getElementById('itemNote');

// 부위 카드 박스 위쪽 화살표를 지금 선택된 티어 카드 바로 아래로 옮긴다.
// 티어 카드는 4개가 한 줄에 꽉 차 있어서 몇 번째를 골라도(맨 오른쪽이어도) 화살표가 따라간다.
function positionPartListPointer() {
  const activeTierBtn = tierListEl.querySelector('.toggle-card.active');
  if (!activeTierBtn) return;
  const btnRect = activeTierBtn.getBoundingClientRect();
  const wrapRect = partListWrapEl.getBoundingClientRect();
  const centerX = btnRect.left + btnRect.width / 2 - wrapRect.left;
  partListPointerEl.style.left = `${centerX}px`;
}

window.addEventListener('resize', () => {
  if (!partListWrapEl.classList.contains('hidden')) positionPartListPointer();
});

function renderTierCards() {
  renderCardGroup(
    tierListEl,
    TIERS.map((t) => ({ key: t.key, title: t.name, subtitle: `Lv.${t.level}`, icon: true })),
    {
      multi: false,
      defaultActive: [],
      onChange: (keys) => selectTier(TIERS.find((t) => t.key === keys[0])),
      renderExtra: (el, item) => {
        const firstBucket = BUCKET_ORDER.find((b) => TIER_ITEMS[item.key][b]);
        const img = el.querySelector('[data-icon]');
        if (img && firstBucket) img.src = `${ICON_BASE}/${TIER_ITEMS[item.key][firstBucket].id}/icon`;
      },
    }
  );
}

function selectTier(tier) {
  state.tier = tier;
  state.selectedPart = null;
  state.selectedBracket = null;
  partListWrapEl.classList.remove('hidden');
  itemPreviewEl.innerHTML = '';
  partListEl.innerHTML = '';

  const buckets = BUCKET_ORDER.filter((b) => TIER_ITEMS[tier.key][b]);
  itemNoteEl.textContent = '';
  renderCardGroup(
    partListEl,
    buckets.map((bucket) => ({
      key: bucket,
      title: PART_LABELS[bucket],
      subtitle: `Lv.${TIER_ITEMS[tier.key][bucket].requiredLevel}`,
      icon: true,
    })),
    {
      multi: false,
      defaultActive: [buckets[0]],
      onChange: (keys) => selectPart(keys[0]),
      renderExtra: (el, item) => {
        const img = el.querySelector('[data-icon]');
        if (img) img.src = `${ICON_BASE}/${TIER_ITEMS[tier.key][item.key].id}/icon`;
      },
    }
  );
  selectPart(buckets[0]);
  positionPartListPointer();
}

function selectPart(bucket) {
  const item = TIER_ITEMS[state.tier.key][bucket];
  if (!item) return;
  state.selectedPart = { bucket, item };
  state.selectedBracket = null;
  slotStates = []; // 아이템이 바뀌면 진행 상황 표시도 초기화

  renderBracketCards();
  recalcAll();
}

function updateItemPreview() {
  if (!state.selectedPart) { itemPreviewEl.innerHTML = ''; return; }
  const { item, bucket } = state.selectedPart;
  const jakDef = JAK_DEFS[bucket];
  let costText = '';
  if (state.selectedBracket) {
    const costRow = getCostRow();
    const bracketIndex = BRACKETS.indexOf(state.selectedBracket);
    if (costRow) costText = ` · 이번 시도 비용 ${costRow[bracketIndex].toLocaleString()}주흔`;
  }
  const approxText = item.approxIcon ? ' · 실제 아이템이 없어 아이콘은 유사 부위로 대체' : '';
  itemPreviewEl.innerHTML = `
    <img src="${ICON_BASE}/${item.id}/icon" alt="${item.name}" />
    <span>${item.name} <span class="note">(Lv.${item.requiredLevel}, ${jakDef.label} · 총 ${jakDef.totalJak}작${costText}${approxText})</span></span>
  `;
}

// ---------- 진행할 작(확률 구간) 선택 ----------

const bracketCardsEl = document.getElementById('bracketCards');
const bracketNoteEl = document.getElementById('bracketNote');

function currentBonusPct() {
  let bonus = 0;
  if (bonusKeys.includes('dex')) bonus += 10;
  if (bonusKeys.includes('guild')) bonus += 4;
  return bonus;
}

function baseProb(bracket) {
  return PROB_PRESET[probMode][bracket];
}

function computedProb(bracket) {
  if (bracket === 100) return 100;
  return Math.min(100, baseProb(bracket) + currentBonusPct());
}

function getCostRow() {
  if (!state.selectedPart) return null;
  const jakDef = JAK_DEFS[state.selectedPart.bucket];
  const level = state.selectedPart.item.requiredLevel;
  const row = jakDef.table[level];
  if (!row) return null;
  return halfPriceOn ? row.map((c) => Math.round(c / 2)) : row;
}

// 진행할 작 카드는 전용 마크업(기존확률/실제확률 크게)이라 renderCardGroup을 안 쓰고 직접 그린다.
function renderBracketCards() {
  bracketCardsEl.innerHTML = '';
  if (!state.selectedPart) {
    bracketNoteEl.textContent = '먼저 아이템(부위)을 선택하세요.';
    updateItemPreview();
    return;
  }
  const costRow = getCostRow();
  if (!costRow) {
    bracketNoteEl.textContent = `Lv.${state.selectedPart.item.requiredLevel}의 비용 데이터를 찾지 못했어요.`;
    updateItemPreview();
    return;
  }
  bracketNoteEl.textContent = '';

  const defaultKey = BRACKETS.includes(Number(lastBracketKey)) ? lastBracketKey : '15';

  for (const bracket of BRACKETS) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'toggle-card';
    el.dataset.key = String(bracket);
    const actual = computedProb(bracket);
    el.innerHTML = `
      <div class="title">${bracket}%작</div>
      <div class="prob-row">
        <span class="prob-actual">${actual}%</span>
      </div>
    `;
    el.addEventListener('click', () => {
      [...bracketCardsEl.children].forEach((c) => c.classList.remove('active'));
      el.classList.add('active');
      state.selectedBracket = bracket;
      lastBracketKey = String(bracket);
      updateItemPreview();
      recalcAll();
    });
    bracketCardsEl.appendChild(el);
  }

  // 5. 기본으로 하나 선택해서 클릭 없이도 바로 결과가 나오게
  const toSelect = bracketCardsEl.querySelector(`[data-key="${defaultKey}"]`);
  if (toSelect) toSelect.click();
}

renderCardGroup(
  document.getElementById('probModeCards'),
  [
    { key: 'base', title: '기본 확률' },
    { key: 'fever', title: 'FEVER(이벤트)', subtitle: '금·토·일' },
  ],
  {
    multi: false,
    defaultActive: ['fever'],
    onChange: (keys) => {
      probMode = keys[0];
      renderBracketCards();
      recalcAll();
    },
  }
);

renderSwitchGroup(
  document.getElementById('bonusCards'),
  [
    { key: 'dex', title: '손재주 성향 MAX', subtitle: '+10%p' },
    { key: 'guild', title: '길드 스킬 MAX', subtitle: '+4%p' },
  ],
  {
    defaultActive: ['dex', 'guild'],
    onChange: (keys) => {
      bonusKeys = keys;
      renderBracketCards();
      recalcAll();
    },
  }
);

// ---------- 초기화 방식 / 순백 / 이벤트 카드 ----------

// 주흔 반값 이벤트는 아케인셰이드 시도 비용뿐 아니라 이노센트/아크이노센트/순백에도 똑같이 적용된다.
function halvedCost(v) {
  return halfPriceOn ? Math.round(v / 2) : v;
}

function renderResetModeCards() {
  const prevActive = resetMode === 'none' ? [] : [resetMode];
  renderCardGroup(
    document.getElementById('resetModeCards'),
    [
      { key: 'innocent', title: '이노센트', subtitle: `${halvedCost(INNOCENT_COST).toLocaleString()}` },
      { key: 'arc', title: '아크 이노센트', subtitle: `${halvedCost(ARC_INNOCENT_COST).toLocaleString()}` },
    ],
    {
      multi: false,
      deselectable: true,
      defaultActive: prevActive,
      onChange: (keys) => {
        resetMode = keys[0] || 'none';
        renderResetFundedSwitch();
        recalcAll();
      },
    }
  );
}

// 순백과 마찬가지로 "어떤 초기화 도구를 쓸지"(resetMode)와 "그걸 주흔으로 조달했는지"(resetFunded)를
// 분리한다. 초기화 방식 자체를 안 골랐으면(resetMode==='none') 조달할 대상이 없어서 숨긴다.
function renderResetFundedSwitch() {
  const container = document.getElementById('resetFundedCards');
  const noteEl = document.getElementById('resetFundedNote');
  if (resetMode === 'none') {
    container.innerHTML = '';
    container.classList.add('hidden');
    noteEl.classList.remove('hidden');
    return;
  }
  container.classList.remove('hidden');
  noteEl.classList.add('hidden');

  const label = resetMode === 'arc' ? '아크 이노센트' : '이노센트';
  const cost = resetMode === 'arc' ? ARC_INNOCENT_COST : INNOCENT_COST;
  const prevActive = resetFunded ? ['resetFunded'] : [];
  renderSwitchGroup(
    container,
    [{ key: 'resetFunded', title: `${label} 주흔으로 조달`, subtitle: `${halvedCost(cost).toLocaleString()}` }],
    {
      defaultActive: prevActive,
      onChange: (keys) => {
        resetFunded = keys.includes('resetFunded');
        recalcAll();
      },
    }
  );
}

function renderProtectCards() {
  const prevActive = protectFunded ? ['protect'] : [];
  renderSwitchGroup(
    document.getElementById('protectCards'),
    [{ key: 'protect', title: '순백 주흔으로 조달', subtitle: `${halvedCost(PROTECT_COST).toLocaleString()}` }],
    {
      defaultActive: prevActive,
      onChange: (keys) => {
        protectFunded = keys.includes('protect');
        recalcAll();
      },
    }
  );
}

renderResetModeCards();
renderResetFundedSwitch();
renderProtectCards();

renderSwitchGroup(
  document.getElementById('halfPriceCards'),
  [{ key: 'halfPrice', title: '주흔 반값', subtitle: '이노/아크이노/순백도 절반' }],
  {
    defaultActive: [],
    onChange: (keys) => {
      halfPriceOn = keys.includes('halfPrice');
      renderBracketCards();
      renderResetModeCards();
      renderResetFundedSwitch();
      renderProtectCards();
      recalcAll();
    },
  }
);

document.getElementById('jujeonPrice').addEventListener('input', recalcAll);

// ---------- 계산 (자동) ----------

// 결과에는 정책(policy) 세 벌이 따로 존재한다.
//   lastResult/lastParams       = "손절 기준표" 위쪽 — 이노센트(12,000) 표준가로 고정한 일반 참고표.
//   lastArcResult/lastArcParams = "손절 기준표" 아래쪽 — 아크 이노센트(24,000) 표준가로 고정한 참고표.
//   lastLiveResult/lastLiveParams
//     = "전체 기댓값"(상단 요약)과 "지금 상태 확인하기"가 함께 따르는 "전략" — 지금 고른 초기화
//       방식(이노센트/아크이노센트/없음)의 표준 비용만으로 정해진다. 이노센트든 아크이노든 순백이든
//       "조달" 여부는 전략에 전혀 관여하지 않는다 — 주흔을 안 써도 결국 그 도구를 실제로 써서 작을
//       진행해야 하니, 언제 초기화/순백을 쓸지는 조달 수단과 무관하게 선택한 도구의 표준가로 정해지고
//       ("총 기대 시도 횟수"도 마찬가지), 조달은 그 표준가를 내 주흔으로 냈는지만 나타내는 회계
//       항목이라서다. 그래서 조달 OFF일 때 이노센트와 아크이노센트가 서로 다르게 나오는 건 버그가
//       아니라 "애초에 가격이 다른 도구를 선택했다"는 사실이 그대로 반영된 것이다.
//   lastLiveCostResult
//     = 위 전략(lastLiveResult.ACT)을 그대로 둔 채, 조달 안 한 항목(이노센트·아크이노센트·순백 각각)만
//       "내 주흔에서 안 나간다"는 실제 지출 기준으로 "기대 주흔" 숫자를 다시 매긴 결과.
let lastResult = null;
let lastParams = null;
let lastArcResult = null;
let lastArcParams = null;
let lastLiveResult = null;
let lastLiveParams = null;
let lastLiveCostResult = null;

function recalcAll() {
  const placeholderEl = document.getElementById('resultPlaceholder');
  const bodyEl = document.getElementById('resultBody');

  if (!state.selectedPart) {
    placeholderEl.textContent = '아이템(부위)을 선택하면 자동으로 계산돼요.';
    placeholderEl.classList.remove('hidden');
    bodyEl.classList.add('hidden');
    lastLiveParams = null;
    return;
  }
  if (!state.selectedBracket) {
    placeholderEl.textContent = '진행할 작(확률 구간)을 선택하면 자동으로 계산돼요.';
    placeholderEl.classList.remove('hidden');
    bodyEl.classList.add('hidden');
    lastLiveParams = null;
    return;
  }

  const jakDef = JAK_DEFS[state.selectedPart.bucket];
  const costRow = getCostRow();
  const bracketIndex = BRACKETS.indexOf(state.selectedBracket);
  const prob = computedProb(state.selectedBracket) / 100;
  const cost = costRow[bracketIndex];

  placeholderEl.classList.add('hidden');
  bodyEl.classList.remove('hidden');

  const base = { totalJak: jakDef.totalJak, prob, cost };
  const price = Number(document.getElementById('jujeonPrice').value) || 0;

  // 참고용: 이노센트(12,000) 표준가로 고정한 손절 기준표.
  const refParams = { ...base, protectCost: halvedCost(PROTECT_COST), resetCost: halvedCost(INNOCENT_COST), useReset: true };
  lastResult = solve(refParams);
  lastParams = refParams;

  // 참고용: 아크 이노센트(24,000) 표준가로 고정한 손절 기준표.
  const arcParams = { ...base, protectCost: halvedCost(PROTECT_COST), resetCost: halvedCost(ARC_INNOCENT_COST), useReset: true };
  lastArcResult = solve(arcParams);
  lastArcParams = arcParams;

  // 전략: 지금 고른 초기화 방식(이노센트/아크이노센트/없음)의 표준 비용만으로 정해진다.
  // 조달 여부는 여기 반영하지 않는다 — 위 설명대로 주문서 자체의 가치는 조달 수단과 무관해서다.
  const liveResetItemCost = resetMode === 'arc' ? ARC_INNOCENT_COST : INNOCENT_COST;
  const liveParams = {
    ...base,
    protectCost: halvedCost(PROTECT_COST),
    resetCost: halvedCost(liveResetItemCost),
    useReset: resetMode !== 'none',
  };
  lastLiveResult = solve(liveParams);
  lastLiveParams = liveParams;

  // 실제 지출: 같은 전략(lastLiveResult.ACT)을 그대로 둔 채, 조달 안 한 항목만 0원으로 재평가한다.
  const actualResetCost = resetMode !== 'none' && resetFunded ? halvedCost(liveResetItemCost) : 0;
  const actualProtectCost = protectFunded ? halvedCost(PROTECT_COST) : 0;
  lastLiveCostResult = evaluate(
    { ...base, protectCost: actualProtectCost, resetCost: actualResetCost },
    lastLiveResult.ACT
  );

  renderResult(lastLiveResult, lastLiveCostResult, lastLiveParams, price);
}

// 시도 횟수(a)별로 "몇 작 이하면 초기화가 유리한지" 경계를 뽑아낸다.
// ACT[S][R]는 R=totalJak-a 이고, 낮은 S일수록 초기화 쪽이라 S=0부터 위로 훑으며 경계를 찾는다.
function buildCutoffRows(result, totalJak) {
  const rows = [];
  for (let a = 1; a <= totalJak; a++) {
    const R = totalJak - a;
    let cutoff = -1;
    for (let S = 0; S <= Math.min(a, totalJak - 1); S++) {
      const act = result.ACT[S][R];
      if (act && act.type === 'reset') cutoff = S;
      else break;
    }
    if (cutoff >= 0) rows.push({ attempts: a, cutoff });
  }
  return rows;
}

function renderResult(policyResult, costResult, params, price) {
  const summaryEl = document.getElementById('summary');
  const totalMeso = costResult.totalTraces * price;
  const totalJak = params.totalJak;

  summaryEl.innerHTML = `
    ${summaryItem('총 기대 주흔', Math.round(costResult.totalTraces).toLocaleString() + ' 개')}
    ${price ? summaryItem('총 기대 메소', Math.round(totalMeso).toLocaleString() + ' 메소') : ''}
    ${summaryItem('총 기대 시도 횟수', Math.round(policyResult.totalAttempts * 10) / 10 + ' 회')}
  `;

  if (slotStates.length !== totalJak) slotStates = new Array(totalJak).fill('none');
  renderSlotPicker(totalJak);
  renderCurrentStateNote(price);
  renderCutoffTable();
}

function summaryItem(label, value) {
  return `<div class="summary-item"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

// ---------- 손절 기준표 (항상 이노센트 12,000 표준가 전략 기준 — "지금 할 일"과 동일한 전략) ----------

// 손절 기준표는 이노센트(12,000) 고정 기준표 하나와 아크 이노센트(24,000) 고정 기준표 하나,
// 이렇게 둘 다 항상 보여준다(체크박스 선택과 무관 — 순수 참고 자료). "지금 할 일" 추천은 지금
// 골라둔 초기화 방식을 따르므로, 둘 중 지금 선택과 일치하는 표에 표시를 달아 헷갈리지 않게 한다.
function renderCutoffTable() {
  const tbody = document.querySelector('#cutoffTable tbody');
  const basisEl = document.getElementById('cutoffBasisNote');
  const arcTbody = document.querySelector('#cutoffTableArc tbody');
  const arcBasisEl = document.getElementById('cutoffArcBasisNote');
  tbody.innerHTML = '';
  arcTbody.innerHTML = '';

  if (!lastResult || !lastParams) {
    tbody.innerHTML = '<tr><td colspan="2">아이템과 진행할 작을 먼저 선택하세요.</td></tr>';
    basisEl.textContent = '';
    arcBasisEl.textContent = '';
    return;
  }

  const innocentSuffix = resetMode === 'innocent' ? ' — 지금 선택과 같아서 "지금 할 일"이 이 표를 따라요.' : '.';
  const arcSuffix = resetMode === 'arc' ? ' — 지금 선택과 같아서 "지금 할 일"이 이 표를 따라요.' : '.';
  basisEl.textContent = `이노센트(${halvedCost(INNOCENT_COST).toLocaleString()}) 기준표예요${innocentSuffix} 표에 없는 시도 횟수는 초기화보다 순백/주흔 시도가 더 유리해요.`;
  fillCutoffRows(tbody, lastResult, lastParams.totalJak);

  arcBasisEl.textContent = `아크 이노센트(${halvedCost(ARC_INNOCENT_COST).toLocaleString()}) 기준표예요${arcSuffix} 이노센트보다 비싸서 초기화 추천이 뒤로 밀려요.`;
  if (lastArcResult && lastArcParams) fillCutoffRows(arcTbody, lastArcResult, lastArcParams.totalJak);
}

function fillCutoffRows(tbody, result, totalJak) {
  const rows = buildCutoffRows(result, totalJak);
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2">이 조건에서는 초기화가 유리한 경우가 없어요 — 항상 순백/주흔 시도로 진행하세요.</td></tr>';
  } else {
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${row.attempts}회</td><td>${row.cutoff}작 이하 → <span class="tag reset">초기화 추천</span></td>`;
      tbody.appendChild(tr);
    }
  }
}

// ---------- 지금 상태로 바로 확인하기 (클릭형 슬롯) ----------
// 상태는 (성공작 S, 시도횟수 a)로 결정된다 — 실패해도 시도 횟수는 늘어나고 그만큼
// "무료 슬롯" R = totalJak - a 가 줄어들기 때문에, 몇 번 실패했었는지가 실제로 중요하다.
// 어떤 칸을 성공/실패로 눌렀는지는 상관없고 개수만 센다(성공/실패는 언제 어떤 순서로 눌러도 결과는 같음).

const slotPickerEl = document.getElementById('slotPicker');

document.getElementById('slotResetBtn').addEventListener('click', () => {
  slotStates = slotStates.map(() => 'none');
  [...slotPickerEl.children].forEach((btn, i) => updateSlotBtn(btn, i));
  const price = Number(document.getElementById('jujeonPrice').value) || 0;
  renderCurrentStateNote(price);
});

function renderSlotPicker(totalJak) {
  if (slotPickerEl.children.length === totalJak) {
    // 개수는 그대로면 기존 버튼 재사용(클릭 상태 유지), 라벨/스타일만 갱신
    [...slotPickerEl.children].forEach((btn, i) => updateSlotBtn(btn, i));
    return;
  }
  slotPickerEl.innerHTML = '';
  for (let i = 0; i < totalJak; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      const cur = slotStates[i];
      slotStates[i] = cur === 'none' ? 'success' : cur === 'success' ? 'fail' : 'none';
      updateSlotBtn(btn, i);
      const price = Number(document.getElementById('jujeonPrice').value) || 0;
      renderCurrentStateNote(price);
    });
    slotPickerEl.appendChild(btn);
    updateSlotBtn(btn, i);
  }
}

function updateSlotBtn(btn, i) {
  const st = slotStates[i];
  btn.className = 'slot-btn' + (st === 'success' ? ' success' : st === 'fail' ? ' fail' : '');
  btn.textContent = st === 'success' ? '✓' : st === 'fail' ? '✗' : i + 1;
  btn.title = `칸 ${i + 1}: ` + (st === 'success' ? '성공' : st === 'fail' ? '실패' : '아직 시도 안 함');
}

function renderCurrentStateNote(price) {
  const progressEl = document.getElementById('progressValue');
  const actionEl = document.getElementById('actionValue');
  const remainEl = document.getElementById('remainValue');
  if (!lastLiveResult || !lastLiveCostResult || !lastLiveParams) {
    progressEl.textContent = '-';
    actionEl.textContent = '-';
    remainEl.textContent = '-';
    return;
  }
  const totalJak = lastLiveParams.totalJak;
  const S = slotStates.filter((s) => s === 'success').length;
  const a = slotStates.filter((s) => s !== 'none').length;

  progressEl.textContent = `${a}작 시도 중 ${S}작 성공`;

  if (S >= totalJak) {
    actionEl.textContent = '완성!';
    actionEl.className = 'value is-complete';
    remainEl.textContent = '0개';
    return;
  }

  const R = totalJak - a;
  const act = lastLiveResult.ACT[S][R];
  const value = lastLiveCostResult.V[S][R];

  let actionText = '주흔 시도';
  let cls = '';
  if (act) {
    if (act.type === 'reset') { actionText = resetMode === 'arc' ? '아크 이노센트로 초기화' : '이노센트로 초기화'; cls = 'is-reset'; }
    else if (act.type === 'topup') { actionText = '순백으로 슬롯 복구'; cls = 'is-protect'; }
    else if (act.protectOnFail) { actionText = '주흔 시도 (실패 시 순백)'; cls = 'is-protect'; }
    else { actionText = '주흔 시도'; }
  }
  actionEl.textContent = actionText;
  actionEl.className = 'value' + (cls ? ' ' + cls : '');

  remainEl.textContent = Math.round(value).toLocaleString() + '개' + (price ? ` (${Math.round(value * price).toLocaleString()}메소)` : '');
}

// ---------- 초기화 ----------

renderTierCards();
renderBracketCards();
recalcAll();
