const RANKS = ['레어', '에픽', '유니크', '레전드리'];
const LEVEL_COSTS = { 1:[4800000,19200000,40800000,48000000], 160:[5100000,20400000,43350000,51000000], 200:[5400000,21600000,45900000,54000000], 250:[6000000,24000000,51000000,60000000] };
const CUBES = {
  red:{name:'레드 큐브', kind:'normal', p:[.06,.018,.003], cap:[25,83,500]},
  black:{name:'블랙 큐브', kind:'normal', p:[.15,.035,.014], cap:[10,42,107]},
  suspicious:{name:'수상한 큐브', kind:'normal', p:[.009901], cap:[null]},
  meister:{name:'장인의 큐브 / 실버', kind:'normal', p:[.047619,.011858], cap:[null,null]},
  meisterMax:{name:'명장의 큐브 / 골드', kind:'normal', p:[.079994,.016959,.001996], cap:[null,null,null]},
  addReset:{name:'에디셔널 잠재 재설정', kind:'additional', p:[.02381,.009804,.007], cap:[62,152,214]},
  add:{name:'에디셔널 큐브', kind:'additional', p:[.047619,.019608,.007], cap:[31,76,214]},
  addWhite:{name:'화이트 에디셔널 큐브', kind:'additional', p:[.047619,.019608,.007], cap:[31,76,214]},
  addSuspicious:{name:'수상한 에디셔널 큐브', kind:'additional', p:[.004], cap:[null]},
  bronze:{name:'브론즈 에디셔널 큐브', kind:'additional', p:[.004], cap:[null]}
};
const CEILINGS = [['레드 큐브',[25,83,500]],['블랙 큐브',[10,42,107]],['에디셔널 잠재 재설정',[62,152,214]],['에디셔널 / 화이트 에디셔널',[31,76,214]]];
let state = { cube:'red', from:0, to:3, level:1, price:0, pity:0, log:[] };
const $ = id => document.getElementById(id);
function fmt(n){ return Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '∞'; }
function pct(n){ return `${(n*100).toFixed(4).replace(/0+$/,'').replace(/\.$/,'')}%`; }
function currentStep(){ return Math.min(state.from, CUBES[state.cube].p.length-1); }
function cubeExpected(p, cap){ return cap ? (1-Math.pow(1-p,cap))/p : 1/p; }
function stageName(i){ return `${RANKS[i]} → ${RANKS[i+1]}`; }
function attemptPrice(cube, stage){
  if(cube==='addReset') return LEVEL_COSTS[state.level][stage] || 0;
  return state.price;
}
function expectedPlan(cube){
  const d=CUBES[cube], steps=[]; let total=0;
  for(let i=state.from;i<state.to;i++){
    const idx=Math.min(i,d.p.length-1), p=d.p[idx], cap=d.cap[idx], e=cubeExpected(p,cap); total+=e; steps.push({name:stageName(i),p,cap,e,price:attemptPrice(cube,i)});
  }
  return {total, steps, cost:steps.reduce((sum,s)=>sum+s.e*s.price,0)};
}
function renderRanks(){
  const row=$('rankRow'); row.innerHTML='';
  RANKS.forEach((name,i)=>{ const b=document.createElement('button'); b.className='rank-chip'+(state.from===i?' active':''); b.textContent=name; b.onclick=()=>{if(i<state.to){state.from=i;state.pity=0;renderAll();}}; row.appendChild(b); if(i<3){const a=document.createElement('span');a.className='arrow';a.textContent='→';row.appendChild(a);}});
  const target=document.createElement('button'); target.className='rank-chip active'; target.textContent=`목표: ${RANKS[state.to]}`; target.onclick=()=>{state.to=state.to>=3?1:state.to+1;if(state.to<=state.from)state.from=0;state.pity=0;renderAll();}; row.appendChild(target);
}
function renderChoices(){
  const box=$('cubeChoices'); box.innerHTML='';
  Object.entries(CUBES).forEach(([key,d])=>{const b=document.createElement('button');b.className='cube-choice'+(key===state.cube?' active':'');b.innerHTML=`<strong>${d.name}</strong><small>${d.kind==='additional'?'에디셔널':'일반'} · ${d.p.slice(0,Math.min(d.p.length,state.to-state.from)).map(pct).join(' / ')}</small>`;b.onclick=()=>{state.cube=key;state.pity=0;renderAll();};box.appendChild(b);});
}
function renderData(){
  const d=CUBES[state.cube], rows=expectedPlan(state.cube).steps.map((s,i)=>`<tr><td>${s.name}</td><td>${pct(s.p)}</td><td>${s.cap?`${s.cap}회`:'-'}</td><td>${fmt(s.e)}회</td></tr>`).join('');
  $('dataTable').innerHTML=`<table class="data-table"><thead><tr><th>구간</th><th>1회 확률</th><th>천장</th><th>기대 횟수</th></tr></thead><tbody>${rows||'<tr><td colspan="4">목표 등급을 선택하세요.</td></tr>'}</tbody></table>`;
}
function renderStrategy(){
  const all=Object.entries(CUBES).map(([key,d])=>{const plan=expectedPlan(key);return {key,name:d.name,...plan};}).filter(x=>x.steps.length);
  const best=all.reduce((a,b)=> (state.price>0 ? (b.cost<a.cost?b:a) : (b.total<a.total?b:a)), all[0]);
  $('expectedCubes').textContent=fmt(expectedPlan(state.cube).total)+'회';
  $('chance').textContent=expectedPlan(state.cube).steps[0] ? pct(expectedPlan(state.cube).steps[0].p) : '-';
  const plan=expectedPlan(state.cube); const hard=plan.steps.reduce((s,x)=>s+(x.cap||0),0); $('worst').textContent=hard?fmt(hard)+'회':'미제공';
  const hasCost=state.price>0||state.cube==='addReset'; const basis=hasCost?'메소':'큐브 횟수'; $('recommend').innerHTML=`현재 선택: <b>${CUBES[state.cube].name}</b><br><span class="tiny">${basis} 기준 추천: <b>${best.name}</b> · 기대 ${fmt(best.total)}회${best.cost>0?` · ${fmt(best.cost)}메소`:''}</span>`;
  $('strategyTable')?.remove();
  const table=document.createElement('div'); table.id='strategyTable'; table.className='cube-panel'; table.innerHTML=`<h2>큐브별 비교</h2><table class="strategy-table"><thead><tr><th>큐브</th><th>기대 횟수</th><th>${hasCost?'기대 메소':'가격 입력'}</th></tr></thead><tbody>${all.map(x=>`<tr class="${x.key===best.key?'best':''}"><td>${x.name}</td><td>${fmt(x.total)}회</td><td>${x.cost>0?fmt(x.cost):'<span class="muted">-</span>'}</td></tr>`).join('')}</tbody></table>`;
  document.querySelector('section').appendChild(table);
}
function renderCeilings(){ $('ceilingTable').innerHTML=`<table class="data-table"><thead><tr><th>큐브</th><th>R→E</th><th>E→U</th><th>U→L</th></tr></thead><tbody>${CEILINGS.map(r=>`<tr><td>${r[0]}</td>${r[1].map(x=>`<td>${x}회</td>`).join('')}</tr>`).join('')}</tbody></table>`; }
function roll(){
  if(state.from>=state.to) return;
  const d=CUBES[state.cube], i=currentStep(), p=d.p[i], cap=d.cap[i]; state.pity++;
  const forced=cap&&state.pity>=cap, win=forced||Math.random()<p; const line=document.createElement('div'); line.className=win?'win':'loss'; line.textContent=win?`✓ ${state.pity}회차에 ${stageName(i)} 성공${forced?' · 천장':''}`:`× ${state.pity}회차 실패`;
  state.log.unshift(line.outerHTML); if(win){state.from++;state.pity=0;if(state.from>=state.to)state.log.unshift('<div class="win">◆ 목표 등급 도달! 새 판으로 다시 도전할 수 있어요.</div>');} $('simLog').innerHTML=state.log.slice(0,16).join(''); renderAll(); }
function resetSim(){state.from=0;state.pity=0;state.log=[];renderAll();}
function renderSim(){ const d=CUBES[state.cube],i=currentStep(); $('simRank').textContent=RANKS[state.from]?.[0]||'✓'; $('simLabel').textContent=state.from>=state.to?`${RANKS[state.to]} 도달`:`${stageName(state.from)}`; $('simPity').textContent=state.from>=state.to?'완료 · 처음부터 다시 시작하세요':`현재 카운터 ${state.pity}회 / ${d.cap[i]?`천장 ${d.cap[i]}회`:'천장 정보 없음'}`; $('simLog').innerHTML=state.log.slice(0,16).join(''); }
function renderAll(){renderRanks();renderChoices();renderData();renderStrategy();renderSim();renderCeilings();const c=LEVEL_COSTS[state.level];$('levelCostNote').textContent=`잠재 재설정 비용: ${c.map(fmt).join(' / ')} (레어 / 에픽 / 유니크 / 레전드리)`;}
$('level').onchange=e=>{state.level=Number(e.target.value);renderAll();}; $('cubePrice').oninput=e=>{state.price=Number(e.target.value)||0;renderAll();}; $('rollBtn').onclick=roll; $('resetBtn').onclick=resetSim; renderAll();
