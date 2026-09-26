const RANKS = ['레어', '에픽', '유니크', '레전드리'];
const RANK_COLORS = ['#7cd4ff', '#b58cff', '#ffa94d', '#6bd98a'];
const CUBE_ICON = {
  potentialMeso:['잠재.png'], black:['블랙.webp'], red:['레드.webp'], meisterMax:['명장.webp','골드.webp'], meister:['장인.webp','실버.webp'], suspicious:['수상한.png'],
  addReset:['에디잠재.png'], addWhite:['에디큐브.webp','화이트에디.webp'], addSuspicious:['수상한에디.webp','브론즈.webp']
};
function iconImg(files){ return files.map(f=>`<img src="icons/Cube/${encodeURIComponent(f)}" alt="" onerror="this.remove()">`).join(''); }
// 화면에 쓰는 이름·분류. 확률과 천장은 cube_core.js의 CUBE_GRADE를 그대로 가져온다.
const CUBES = {
  potentialMeso:{name:'잠재능력 재설정 (메소)', kind:'normal', official:'potential', ...CUBE_GRADE.potentialMeso},
  black:{name:'블랙 큐브', kind:'normal', ...CUBE_GRADE.black},
  red:{name:'레드 큐브', kind:'normal', ...CUBE_GRADE.red},
  meisterMax:{name:'명장의 큐브 / 골드 큐브', kind:'normal', ...CUBE_GRADE.meisterMax},
  meister:{name:'장인의 큐브 / 실버 큐브', kind:'normal', ...CUBE_GRADE.meister},
  suspicious:{name:'수상한 큐브', kind:'normal', ...CUBE_GRADE.suspicious},
  addReset:{name:'에디셔널 잠재 재설정', kind:'additional', official:'additional', ...CUBE_GRADE.addReset},
  addWhite:{name:'에디셔널 큐브 / 화이트 에디셔널 큐브', kind:'additional', ...CUBE_GRADE.addWhite},
  addSuspicious:{name:'수상한 에디셔널 큐브 / 브론즈 에디셔널 큐브', kind:'additional', ...CUBE_GRADE.addSuspicious}
};
let state = { tab:'normal', cube:'black', from:0, to:3, level:200, actual:{}, miracle:false };
function effP(p){ return state.miracle ? Math.min(p*2, .999) : p; }
function maxTo(key){ return CUBES[key].p.length; }
function ensureValidCube(){
  if(maxTo(state.cube) < state.to){
    const alt = Object.keys(CUBES).find(k=>CUBES[k].kind===state.tab && maxTo(k)>=state.to);
    if(alt){ state.cube=alt; state.actual={}; }
  }
}
const $ = id => document.getElementById(id);
function fmt(n){ return Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '∞'; }
function pct(n){ return `${(n*100).toFixed(4).replace(/0+$/,'').replace(/\.$/,'')}%`; }
// 손익 메소는 값이 커서 억/만으로 줄여 쓴다
function mesoText(n){
  if(!Number.isFinite(n)) return '∞';
  n=Math.round(Math.abs(n));
  const eok=Math.floor(n/1e8), man=Math.round((n%1e8)/1e4);
  if(eok>=10000) return `${fmt(Math.floor(eok/10000))}조 ${fmt(eok%10000)}억`;
  if(eok) return man ? `${fmt(eok)}억 ${fmt(man)}만` : `${fmt(eok)}억`;
  return man ? `${fmt(man)}만` : `${fmt(n)}`;
}
// 기대 횟수보다 적게 썼으면 이득, 많이 썼으면 손해. 메소는 아낀(더 쓴) 횟수 × 1회 비용.
function stageDiff(step, actual){
  const gap=step.e-actual;
  return { gap, meso:gap*step.price, gain:gap>0, flat:Math.abs(gap)<.05 };
}
function rankSpan(i){ return `<span style="color:${RANK_COLORS[i]}">${RANKS[i]}</span>`; }
function stageNameHtml(i){ return `${rankSpan(i)} → ${rankSpan(i+1)}`; }
function attemptPrice(cube, stage){
  const d=CUBES[cube];
  if(d.official) return (PRICE_TABLES[d.official][costBracket(state.level)] || [0,0,0,0])[stage] || 0;
  return cubeFee(state.level);
}
function expectedPlan(cube){
  const d=CUBES[cube], steps=[]; let total=0;
  for(let i=state.from;i<state.to;i++){
    const idx=Math.min(i,d.p.length-1), p=effP(d.p[idx]), cap=d.cap[idx], e=cubeExpected(p,cap);
    total+=e;
    steps.push({ i, name:stageNameHtml(i), p, cap, e, price:attemptPrice(cube,i) });
  }
  return {total, steps, cost:steps.reduce((sum,s)=>sum+s.e*s.price,0)};
}
function renderTabs(){
  const row=$('kindTabs'); if(!row) return; row.innerHTML='';
  [['normal','잠재능력'],['additional','에디셔널 잠재능력']].forEach(([key,label])=>{
    const b=document.createElement('button'); b.className='rank-chip tab-chip'+(state.tab===key?' active':''); b.innerHTML=`${iconImg(CUBE_ICON[key==='normal'?'black':'addReset'])}<span>${label}</span>`;
    b.onclick=()=>{ if(state.tab===key) return; state.tab=key; const first=Object.keys(CUBES).find(k=>CUBES[k].kind===key); state.cube=first; state.actual={}; renderAll(); };
    row.appendChild(b);
  });
}
function renderRanks(){
  const row=$('rankGoalRow'); row.innerHTML='';
  const curGroup=document.createElement('div'); curGroup.className='rank-group';
  curGroup.innerHTML='<div class="rank-group-label">현재</div>';
  const curChips=document.createElement('div'); curChips.className='rank-row';
  RANKS.slice(0,3).forEach((name,i)=>{
    const b=document.createElement('button'); b.className='rank-chip'+(state.from===i?' active':'');
    b.style.setProperty('--chip-color', RANK_COLORS[i]); b.textContent=name;
    b.onclick=()=>{ state.from=i; if(state.to<=i) state.to=Math.min(i+1,3); state.actual={}; renderAll(); };
    curChips.appendChild(b);
  });
  curGroup.appendChild(curChips);
  row.appendChild(curGroup);

  const sep=document.createElement('span'); sep.className='row-sep'; sep.textContent='→'; row.appendChild(sep);

  const goalGroup=document.createElement('div'); goalGroup.className='rank-group';
  goalGroup.innerHTML='<div class="rank-group-label">목표</div>';
  const goalChips=document.createElement('div'); goalChips.className='rank-row';
  RANKS.slice(1).forEach((name,idx)=>{
    const i=idx+1, disabled=i<=state.from;
    const b=document.createElement('button'); b.className='rank-chip'+(state.to===i?' active':'')+(disabled?' disabled':'');
    b.style.setProperty('--chip-color', RANK_COLORS[i]); b.textContent=name;
    if(!disabled) b.onclick=()=>{ state.to=i; state.actual={}; renderAll(); };
    goalChips.appendChild(b);
  });
  goalGroup.appendChild(goalChips);
  row.appendChild(goalGroup);
}
function renderLevelRow(){
  const input=$('itemLevel'); if(!input) return;
  // 타이핑 중에는 입력칸을 건드리지 않는다
  if(document.activeElement!==input) input.value=state.level;
}
function renderChoices(){
  const box=$('cubeChoices'); box.innerHTML='';
  Object.entries(CUBES).filter(([,d])=>d.kind===state.tab).forEach(([key,d])=>{
    const b=document.createElement('button');
    b.className='cube-choice'+(key===state.cube?' active':'')+(CUBE_ICON[key].length>1?' pair-icon':'');
    b.innerHTML=`<div class="cube-choice-head">${iconImg(CUBE_ICON[key])}<strong>${d.name}</strong></div>`;
    b.onclick=()=>{
      state.cube=key;
      const cap=maxTo(key);
      if(state.to>cap){ state.to=cap; if(state.from>=state.to) state.from=0; }
      state.actual={};
      renderAll();
    };
    box.appendChild(b);
  });
}
function renderPriceBox(){
  const box=$('priceBox'); if(!box) return;
  const d=CUBES[state.cube], n=state.level;
  const rate = n>=121 ? 20 : n>=71 ? 2.5 : n>=31 ? 0.25 : 0;
  const meso = d.official ? PRICE_TABLES[d.official][costBracket(state.level)] : null;
  const bracketLabel = LEVEL_BRACKETS.find(([lv])=>lv===costBracket(state.level))[1];
  box.innerHTML = meso
    ? `<div class="field-note">메소 재설정 1회 · ${bracketLabel} 구간</div><div class="price-chip-row">`
      + RANKS.map((name,i)=>`<div class="price-chip"><div class="price-chip-label" style="color:${RANK_COLORS[i]}">${name}</div><div class="price-chip-value">${fmt(meso[i])}</div></div>`).join('') + '</div>'
    : `<div class="field-note">큐브 1회 <strong>${fmt(cubeFee(state.level))}</strong> 메소 (${n} × ${n} × ${rate})</div>`;
}
// 한 구간의 결과 칸. 기대치 대비 이득/손해를 횟수와 메소로 같이 보여준다.
function resultCellHtml(step, actual){
  if(!actual) return '-';
  const { gap, meso, gain, flat }=stageDiff(step, actual);
  const rank=`<div class="luck-sub">상위 ${(successCdf(actual,step.p,step.cap)*100).toFixed(2)}%</div>`;
  if(flat) return `<div class="luck-main luck-even">기대치와 같음</div>${rank}`;
  const money = step.price>0 ? `<div class="luck-meso">메소 ${mesoText(meso)} ${gain?'아낌':'더 씀'}</div>` : '';
  return `<div class="luck-main ${gain?'luck-good':'luck-bad'}">${Math.abs(gap).toFixed(1)}회 ${gain?'이득':'손해'}</div>${money}${rank}`;
}
// 입력한 구간만 모아 합산 손익을 한 줄로 알려준다.
function summaryHtml(plan){
  const filled=plan.steps.filter(s=>state.actual[s.i]>0);
  if(!filled.length) return '<div class="tiny luck-summary">실제로 쓴 횟수를 넣으면 기대치보다 이득인지 손해인지 계산해준다.</div>';
  const expected=filled.reduce((sum,s)=>sum+s.e,0);
  const used=filled.reduce((sum,s)=>sum+state.actual[s.i],0);
  const meso=filled.reduce((sum,s)=>sum+(s.e-state.actual[s.i])*s.price,0);
  const gap=expected-used, gain=gap>0;
  const verdict = Math.abs(gap)<.05
    ? '<b class="luck-even">기대치와 같음</b>'
    : `<b class="${gain?'luck-good':'luck-bad'}">${Math.abs(gap).toFixed(1)}회 ${gain?'이득':'손해'}${Math.abs(meso)>=1?` · 메소 ${mesoText(meso)} ${gain?'아낀 셈':'더 쓴 셈'}`:''}</b>`;
  const cashNote = CUBES[state.cube].official ? '' : '<div class="tiny">메소는 재설정 비용만 센다. 큐브 자체 값(캐시·현물)은 빠져 있다.</div>';
  return `<div class="luck-summary">입력한 구간 합계 · 기대 ${expected.toFixed(1)}회 → 실제 ${fmt(used)}회 : ${verdict}${cashNote}</div>`;
}
function renderData(){
  const plan=expectedPlan(state.cube);
  const rows=plan.steps.map(s=>{
    const actual=state.actual[s.i];
    return `<tr data-i="${s.i}">
      <td>${s.name}</td>
      <td>${pct(s.p)}</td>
      <td>${s.cap?`${s.cap}회`:'-'}</td>
      <td>${fmt(s.e)}회</td>
      <td><input class="actual-input" type="number" min="1" data-i="${s.i}" value="${actual||''}" placeholder="내 횟수"></td>
      <td class="pct-cell">${resultCellHtml(s, actual)}</td>
    </tr>`;
  }).join('');
  $('dataTable').innerHTML=`<table class="data-table"><thead><tr><th>구간</th><th>1회 확률</th><th>천장</th><th>기대 횟수</th><th>내 실제 횟수</th><th>내 결과</th></tr></thead><tbody>${rows||'<tr><td colspan="6">목표 등급을 선택하세요.</td></tr>'}</tbody></table>`
    + (plan.steps.length ? summaryHtml(plan) : '');
  // 입력할 때마다 표 전체를 다시 그리면 입력창이 리셋되며 포커스가 빠지므로, 해당 칸과 합계 줄만 갱신한다.
  $('dataTable').querySelectorAll('.actual-input').forEach(inp=>{
    inp.oninput=e=>{
      const i=Number(e.target.dataset.i);
      const step=plan.steps.find(s=>s.i===i);
      let v=Number(e.target.value);
      // 천장을 넘는 횟수는 나올 수 없으므로 천장으로 잘라 준다
      if(step.cap && v>step.cap){ v=step.cap; e.target.value=v; }
      if(v>0) state.actual[i]=v; else delete state.actual[i];
      e.target.closest('tr').querySelector('.pct-cell').innerHTML = resultCellHtml(step, v>0?v:0);
      const box=$('dataTable').querySelector('.luck-summary');
      if(box) box.outerHTML = summaryHtml(plan);
    };
  });
}
function renderStrategy(){
  const plan=expectedPlan(state.cube);
  $('expectedCubes').textContent=fmt(plan.total)+'회';
  const hard=plan.steps.reduce((s,x)=>s+(x.cap||0),0);
  $('ceilingCount').textContent=hard?fmt(hard)+'회':'미제공';
  const costBox=$('expectedCostBox');
  if(plan.cost>0){ costBox.style.display=''; $('expectedCost').textContent=fmt(plan.cost)+' 메소'; } else { costBox.style.display='none'; }
}
function renderCeilings(){
  const rows=Object.entries(CUBES).filter(([,d])=>d.kind===state.tab).map(([,d])=>`<tr><td>${d.name}</td>${[0,1,2].map(i=>`<td>${d.cap[i]?`${d.cap[i]}회`:'-'}</td>`).join('')}</tr>`).join('');
  $('ceilingTable').innerHTML=`<table class="data-table"><thead><tr><th>큐브</th><th>R→E</th><th>E→U</th><th>U→L</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function renderProbTable(){
  const box=$('probTable'); if(!box) return;
  const rows=Object.entries(CUBES).filter(([,d])=>d.kind===state.tab).map(([,d])=>`<tr><td>${d.name}</td>${[0,1,2].map(i=>`<td>${d.p[i]!=null?pct(effP(d.p[i])):'-'}</td>`).join('')}</tr>`).join('');
  box.innerHTML=`<table class="data-table"><thead><tr><th>큐브</th><th>R→E</th><th>E→U</th><th>U→L</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function renderAll(){ensureValidCube();renderTabs();renderRanks();renderLevelRow();renderChoices();renderPriceBox();renderData();renderStrategy();renderCeilings();renderProbTable();}
$('miracleCheckbox').onchange=e=>{state.miracle=e.target.checked;renderAll();};
// 아이템 레벨이 큐브 1회 메소와 메소 재설정 구간을 함께 정한다
$('itemLevel').addEventListener('input',e=>{
  if(e.target.value==='') return;
  state.level=Math.min(Math.max(Math.round(Number(e.target.value)||0),1),300);
  renderAll();
});
$('itemLevel').addEventListener('blur',renderAll);
renderAll();
