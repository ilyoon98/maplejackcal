const RANKS = ['레어', '에픽', '유니크', '레전드리'];
const RANK_COLORS = ['#7cd4ff', '#b58cff', '#ffa94d', '#6bd98a'];
const LEVEL_BRACKETS = [[1,'1~159'],[160,'160~199'],[200,'200~249'],[250,'250~300']];
// 잠재능력 재설정(=블랙 큐브와 동일 기능) 메소 가격. 레벨구간 → [레어,에픽,유니크,레전드리]
const POTENTIAL_COST = { 1:[4000000,16000000,34000000,40000000], 160:[4250000,17000000,36125000,42500000], 200:[4500000,18000000,38250000,45000000], 250:[5000000,20000000,42500000,50000000] };
// 에디셔널 잠재능력 재설정(=화이트 에디셔널 큐브와 동일 기능) 메소 가격
const ADDITIONAL_COST = { 1:[9750000,27300000,66300000,78000000], 160:[10375000,29050000,70550000,83000000], 200:[11000000,30800000,74800000,88000000], 250:[12250000,34300000,83300000,98000000] };
const PRICE_TABLES = { potential:POTENTIAL_COST, additional:ADDITIONAL_COST };
const CUBE_ICON = {
  potentialReset:['잠재.png','블랙.webp'], red:['레드.webp'], meisterMax:['명장.webp','골드.webp'], meister:['장인.webp','실버.webp'], suspicious:['수상한.png'],
  addReset:['에디잠재.png'], addWhite:['에디큐브.webp','화이트에디.webp'], addSuspicious:['수상한에디.webp','브론즈.webp']
};
function iconImg(files){ return files.map(f=>`<img src="icons/Cube/${encodeURIComponent(f)}" alt="" onerror="this.remove()">`).join(''); }
const CUBES = {
  potentialReset:{name:'잠재능력 재설정 / 블랙 큐브', kind:'normal', p:[.15,.035,.014], cap:[10,42,107], official:'potential'},
  red:{name:'레드 큐브', kind:'normal', p:[.06,.018,.003], cap:[25,83,500]},
  meisterMax:{name:'명장의 큐브 / 골드 큐브', kind:'normal', p:[.079994,.016959,.001996], cap:[null,null,null]},
  meister:{name:'장인의 큐브 / 실버 큐브', kind:'normal', p:[.047619,.011858], cap:[null,null]},
  suspicious:{name:'수상한 큐브', kind:'normal', p:[.009901], cap:[null]},
  addReset:{name:'에디셔널 잠재 재설정', kind:'additional', p:[.02381,.009804,.007], cap:[62,152,214], official:'additional'},
  addWhite:{name:'에디셔널 큐브 / 화이트 에디셔널 큐브', kind:'additional', p:[.047619,.019608,.007], cap:[62,152,214], official:'additional'},
  addSuspicious:{name:'수상한 에디셔널 큐브 / 브론즈 에디셔널 큐브', kind:'additional', p:[.004], cap:[null]}
};
let state = { tab:'normal', cube:'potentialReset', from:0, to:3, level:1, actual:{}, miracle:false };
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
function cubeExpected(p, cap){ return cap ? (1-Math.pow(1-p,cap))/p : 1/p; }
// 천장(cap)에 도달하면 그 시도에서 반드시 성공하므로, k가 cap 이상이면 성공 확률은 100%다.
function successCdf(k, p, cap){
  if(cap && k>=cap) return 1;
  return 1-Math.pow(1-p, k);
}
function rankSpan(i){ return `<span style="color:${RANK_COLORS[i]}">${RANKS[i]}</span>`; }
function stageNameHtml(i){ return `${rankSpan(i)} → ${rankSpan(i+1)}`; }
function attemptPrice(cube, stage){
  const d = CUBES[cube];
  if(d.official) return (PRICE_TABLES[d.official][state.level] || [0,0,0,0])[stage] || 0;
  return 0;
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
    const b=document.createElement('button'); b.className='rank-chip tab-chip'+(state.tab===key?' active':''); b.innerHTML=`${iconImg(CUBE_ICON[key==='normal'?'potentialReset':'addReset'])}<span>${label}</span>`;
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
  const row=$('levelRow'); if(!row) return; row.innerHTML='';
  LEVEL_BRACKETS.forEach(([level,label])=>{
    const b=document.createElement('button'); b.className='rank-chip'+(state.level===level?' active':'');
    b.textContent=label;
    b.onclick=()=>{ state.level=level; renderAll(); };
    row.appendChild(b);
  });
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
  const d=CUBES[state.cube];
  if(d.official){
    const table=PRICE_TABLES[d.official][state.level];
    box.innerHTML=RANKS.map((name,i)=>`<div class="price-chip"><div class="price-chip-label" style="color:${RANK_COLORS[i]}">${name}</div><div class="price-chip-value">${fmt(table[i])}</div></div>`).join('');
  } else {
    box.innerHTML=`<div class="field-note">공식 가격 없음</div>`;
  }
}
function renderData(){
  const plan=expectedPlan(state.cube);
  const rows=plan.steps.map(s=>{
    const actual=state.actual[s.i];
    const pctLabel = actual ? `상위 ${(successCdf(actual,s.p,s.cap)*100).toFixed(2)}%` : '-';
    return `<tr data-i="${s.i}">
      <td>${s.name}</td>
      <td>${pct(s.p)}</td>
      <td>${s.cap?`${s.cap}회`:'-'}</td>
      <td>${fmt(s.e)}회</td>
      <td><input class="actual-input" type="number" min="1" data-i="${s.i}" value="${actual||''}" placeholder="내 횟수"></td>
      <td class="pct-cell">${pctLabel}</td>
    </tr>`;
  }).join('');
  $('dataTable').innerHTML=`<table class="data-table"><thead><tr><th>구간</th><th>1회 확률</th><th>천장</th><th>기대 횟수</th><th>내 실제 횟수</th><th>내 운 순위</th></tr></thead><tbody>${rows||'<tr><td colspan="6">목표 등급을 선택하세요.</td></tr>'}</tbody></table>`;
  // 입력할 때마다 표 전체를 다시 그리면 입력창이 리셋되며 포커스가 빠지므로, 해당 칸만 갱신한다.
  $('dataTable').querySelectorAll('.actual-input').forEach(inp=>{
    inp.oninput=e=>{
      const i=Number(e.target.dataset.i), v=Number(e.target.value);
      if(v>0) state.actual[i]=v; else delete state.actual[i];
      const step=plan.steps.find(s=>s.i===i);
      const label = v>0 ? `상위 ${(successCdf(v,step.p,step.cap)*100).toFixed(2)}%` : '-';
      e.target.closest('tr').querySelector('.pct-cell').textContent = label;
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
renderAll();
