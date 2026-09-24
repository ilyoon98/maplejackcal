const RANKS = ['레어', '에픽', '유니크', '레전드리'];
const RANK_COLORS = ['#7cd4ff', '#b58cff', '#ffa94d', '#6bd98a'];
const KIND_LABEL = { normal:'잠재능력', additional:'에디셔널 잠재능력' };
const LEVEL_BRACKETS = [[1,'1~159'],[160,'160~199'],[200,'200~249'],[250,'250~300']];
const AUTO_SPEED = 15; // 빠름 고정
// 잠재능력 재설정(=블랙 큐브와 동일 기능) 메소 가격. 레벨구간 → [레어,에픽,유니크,레전드리]
const POTENTIAL_COST = { 1:[4000000,16000000,34000000,40000000], 160:[4250000,17000000,36125000,42500000], 200:[4500000,18000000,38250000,45000000], 250:[5000000,20000000,42500000,50000000] };
const ADDITIONAL_COST = { 1:[9750000,27300000,66300000,78000000], 160:[10375000,29050000,70550000,83000000], 200:[11000000,30800000,74800000,88000000], 250:[12250000,34300000,83300000,98000000] };
const PRICE_TABLES = { potential:POTENTIAL_COST, additional:ADDITIONAL_COST };
const CUBE_ICON = {
  potentialMeso:['잠재.png'], black:['블랙.webp'], red:['레드.webp'], meisterMax:['명장.webp'], meister:['장인.webp'], suspicious:['수상한.png'],
  addReset:['에디잠재.png'], addWhite:['에디큐브.webp','화이트에디.webp'], addSuspicious:['수상한에디.webp','브론즈.webp']
};
function iconImg(files){ return files.map(f=>`<img src="icons/Cube/${encodeURIComponent(f)}" alt="" onerror="this.remove()">`).join(''); }
const CUBES = {
  potentialMeso:{name:'잠재능력 재설정 (메소)', kind:'normal', p:[.15,.035,.014], cap:[10,42,107], official:'potential'},
  black:{name:'블랙 큐브', kind:'normal', p:[.15,.035,.014], cap:[10,42,107]},
  red:{name:'레드 큐브', kind:'normal', p:[.06,.018,.003], cap:[25,83,500]},
  meisterMax:{name:'명장의 큐브 / 골드', kind:'normal', p:[.079994,.016959,.001996], cap:[null,null,null]},
  meister:{name:'장인의 큐브 / 실버', kind:'normal', p:[.047619,.011858], cap:[null,null]},
  suspicious:{name:'수상한 큐브', kind:'normal', p:[.009901], cap:[null]},
  addReset:{name:'에디셔널 잠재 재설정', kind:'additional', p:[.02381,.009804,.007], cap:[62,152,214], official:'additional'},
  addWhite:{name:'에디셔널 큐브 / 화이트 에디셔널 큐브', kind:'additional', p:[.047619,.019608,.007], cap:[62,152,214]},
  addSuspicious:{name:'수상한 에디셔널 큐브 / 브론즈 에디셔널 큐브', kind:'additional', p:[.004], cap:[null]}
};
const DEFAULT_RANK = 2; // 기본 현재 등급: 유니크
let state = { tab:'normal', cube:'black', from:DEFAULT_RANK, startRank:DEFAULT_RANK, to:3, level:200, pity:0, miracle:false, stageAgg:{}, runStagePct:{}, runMiracleOn:false, runMiracleOff:false, runAttempts:0, runMeso:0, runExpected:0, runLog:[], mesoSpent:0, sessionRuns:0, expectedTotal:0, pendingChoice:null };
let autoTimer = null;
function effP(p){ return state.miracle ? Math.min(p*2, .999) : p; }
function maxTo(key){ return CUBES[key].p.length; }
function ensureValidCube(){
  if(maxTo(state.cube) <= state.startRank){
    const alt = Object.keys(CUBES).find(k=>CUBES[k].kind===state.tab && maxTo(k)>state.startRank);
    if(alt){ state.cube=alt; }
  }
  state.to = maxTo(state.cube);
}
function resetSession(){ state.pity=0; state.stageAgg={}; state.runStagePct={}; state.runMiracleOn=false; state.runMiracleOff=false; state.runAttempts=0; state.runMeso=0; state.runExpected=0; state.runLog=[]; state.mesoSpent=0; state.sessionRuns=0; state.expectedTotal=0; state.pendingChoice=null; }
const $ = id => document.getElementById(id);
function pct(n){ return `${(n*100).toFixed(4).replace(/0+$/,'').replace(/\.$/,'')}%`; }
function fmt(n){ return Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '∞'; }
function currentStep(){ return Math.min(state.from, CUBES[state.cube].p.length-1); }
function rankSpan(i){ return `<span style="color:${RANK_COLORS[i]}">${RANKS[i]}</span>`; }
function stageName(i){ return `${RANKS[i]} → ${RANKS[i+1]}`; }
function stageNameHtml(i){ return `${rankSpan(i)} → ${rankSpan(i+1)}`; }
// 큐브 1회에 나가는 메소. 큐브 종류·등급과 무관하게 아이템 레벨 n으로만 정해진다.
// (인게임 재설정 창의 "재설정 비용". 200제면 200*200*20 = 800,000)
function cubeFee(level=state.level){
  const n=Number(level)||0;
  const rate = n>=121 ? 20 : n>=71 ? 2.5 : n>=31 ? .25 : 0;
  return Math.floor(n*n*rate);
}
// 메소 재설정 비용표의 레벨 구간 키
function costBracket(level=state.level){ return [...LEVEL_BRACKETS].reverse().find(([lv])=>level>=lv)[0]; }
// 이 항목 1회 메소. 메소 재설정이면 등급별 비용표, 큐브면 레벨 공식
function attemptPrice(stage){
  const d=CUBES[state.cube];
  if(d.official) return (PRICE_TABLES[d.official][costBracket()] || [0,0,0,0])[stage] || 0;
  return cubeFee();
}
function cubeExpected(p, cap){ return cap ? (1-Math.pow(1-p,cap))/p : 1/p; }
// 한 판 총 지출의 분포에서 분위수를 구한다. 단계별 시도 횟수 분포를 비용 축에서 합친다(합성곱).
// 천장까지 끌려가는 소수의 판이 평균을 끌어올리기 때문에, 중앙값은 기대값보다 늘 낮다.
const quantileCache = new Map();
function runCostQuantile(q){
  const d=CUBES[state.cube];
  const key=[state.cube,state.startRank,state.to,state.level,state.miracle,q].join('|');
  if(quantileCache.has(key)) return quantileCache.get(key);
  const stages=[];
  for(let i=state.startRank;i<state.to;i++){
    const idx=Math.min(i,d.p.length-1), p=effP(d.p[idx]);
    // 천장이 없으면 사실상 끝나는 횟수에서 끊는다
    const cap=d.cap[idx] || Math.ceil(Math.log(1e-6)/Math.log(1-p));
    stages.push({ p, cap, price:attemptPrice(i) });
  }
  const max=stages.reduce((s,x)=>s+x.cap*x.price,0);
  if(!max){ quantileCache.set(key,0); return 0; }
  const N=2000, unit=max/N;
  let dist=new Float64Array(N+1); dist[0]=1;
  for(const s of stages){
    const next=new Float64Array(N+1);
    for(let k=1;k<=s.cap;k++){
      const pk = k<s.cap ? Math.pow(1-s.p,k-1)*s.p : Math.pow(1-s.p,s.cap-1);
      if(pk<1e-12) continue;
      const shift=Math.round(k*s.price/unit);
      for(let b=0;b+shift<=N;b++) if(dist[b]) next[b+shift]+=dist[b]*pk;
    }
    dist=next;
  }
  let acc=0, out=max;
  for(let b=0;b<=N;b++){ acc+=dist[b]; if(acc>=q){ out=b*unit; break; } }
  quantileCache.set(key,out);
  return out;
}
function stageExpectedCost(i){
  const d=CUBES[state.cube];
  return cubeExpected(effP(d.p[i]), d.cap[i]) * attemptPrice(i);
}
function renderTabs(){
  const row=$('kindTabs'); if(!row) return; row.innerHTML='';
  [['normal','잠재능력'],['additional','에디셔널 잠재능력']].forEach(([key,label])=>{
    const b=document.createElement('button'); b.className='rank-chip tab-chip'+(state.tab===key?' active':''); b.innerHTML=`${iconImg(CUBE_ICON[key==='normal'?'black':'addReset'])}<span>${label}</span>`;
    b.onclick=()=>{ if(state.tab===key) return; stopAuto(); state.tab=key; const first=Object.keys(CUBES).find(k=>CUBES[k].kind===key); state.cube=first;
      // 탭을 바꿔도 고른 현재 등급은 그대로 두고, 그 큐브가 감당 못 할 때만 레어로 내린다.
      state.startRank = maxTo(first)>state.startRank ? state.startRank : 0;
      state.from=state.startRank; resetSession(); renderAll(); };
    row.appendChild(b);
  });
}
function renderRanks(){
  const row=$('rankGoalRow'); row.innerHTML='<span class="rank-row-label">현재 등급</span>';
  RANKS.slice(0,3).forEach((name,i)=>{
    const b=document.createElement('button'); b.className='rank-chip'+(state.startRank===i?' active':'');
    b.style.setProperty('--chip-color', RANK_COLORS[i]); b.textContent=name;
    b.onclick=()=>{ stopAuto(); state.from=i; state.startRank=i; resetSession(); renderAll(); };
    row.appendChild(b);
  });
}
function renderChoices(){
  const box=$('cubeChoices'); box.innerHTML='';
  Object.entries(CUBES).filter(([,d])=>d.kind===state.tab).forEach(([key,d])=>{
    const b=document.createElement('button');
    b.className='cube-choice'+(key===state.cube?' active':'')+(CUBE_ICON[key].length>1?' pair-icon':'');
    const note = d.p.slice(Math.min(state.startRank,d.p.length)).map(p=>pct(effP(p))).join(' / ');
    b.innerHTML=`<div class="cube-choice-head">${iconImg(CUBE_ICON[key])}<strong>${d.name}</strong></div><small>${note}</small>`;
    b.onclick=()=>{
      stopAuto(); state.cube=key;
      if(maxTo(key)<=state.startRank){ state.from=0; state.startRank=0; }
      else state.from=state.startRank;
      state.pity=0; state.pendingChoice=null; renderAll();
    };
    box.appendChild(b);
  });
}
function renderLevelRow(){
  const input=$('itemLevel'); if(!input) return;
  // 타이핑 중에는 입력칸을 건드리지 않는다
  if(document.activeElement!==input) input.value=state.level;
  const d=CUBES[state.cube];
  $('itemLevelNote').textContent = d.official
    ? `메소 재설정 ${stageName(currentStep())} 1회 ${fmt(attemptPrice(currentStep()))} 메소`
    : `큐브 1회 ${fmt(cubeFee())} 메소`;
}
function stagePercentile(i, k, forced){
  if(forced) return 1;
  const p=effP(CUBES[state.cube].p[i]);
  return 1-Math.pow(1-p, k);
}
// 재도전한 단계는 최신 결과로 덮어써서, 한 판에 단계당 하나씩만 곱한다.
function runCombinedPercentile(){
  return Object.values(state.runStagePct).reduce((acc,v)=>acc*v, 1);
}
function runStageCount(){ return Object.keys(state.runStagePct).length; }
function roll(){
  const d=CUBES[state.cube], startI=currentStep(), p=effP(d.p[startI]), cap=d.cap[startI]; state.pity++;
  state.runAttempts++;
  if(state.miracle) state.runMiracleOn=true; else state.runMiracleOff=true;
  const price=attemptPrice(startI); state.mesoSpent+=price; state.runMeso+=price;
  const forced=cap&&state.pity>=cap, win=forced||Math.random()<p;
  if(win){
    const stagePct=stagePercentile(startI, state.pity, forced);
    const prev=state.stageAgg[startI]||{sum:0,count:0};
    state.stageAgg[startI]={ sum:prev.sum+stagePct, count:prev.count+1 };
    state.runStagePct[startI]=stagePct;
    // 기대 지출은 깬 단계마다 그 단계의 기대 비용을 쌓아서, 재도전이 섞여도 실제 지출과 같은 기준으로 비교한다.
    const expCost = stageExpectedCost(startI);
    state.expectedTotal += expCost; state.runExpected += expCost;
    const pityUsed=state.pity;
    state.from++; state.pity=0;
    const final = state.from>=state.to;
    if(final){
      // 목표 등급에 도달한 순간 그 자체로 "한 판" 완료. 이후 재도전/다음 판 선택과 무관하게 바로 기록한다.
      const finalRunPct=runCombinedPercentile(), finalRunStages=runStageCount();
      const miracle = state.runMiracleOn ? (state.runMiracleOff ? 'mixed' : 'on') : 'off';
      state.runLog.push({ n:state.sessionRuns+1, attempts:state.runAttempts, pct:finalRunPct, meso:state.runMeso, miracle });
      state.sessionRuns++;
      state.runStagePct={}; state.runMiracleOn=false; state.runMiracleOff=false; state.runAttempts=0; state.runMeso=0; state.runExpected=0;
      state.pendingChoice = { prevFrom:startI, final:true, pityUsed, finalRunPct, finalRunStages };
    } else {
      state.pendingChoice = { prevFrom:startI, final:false, pityUsed };
    }
    stopAuto();
  }
  renderSim();
}
function resolveRetry(){ if(!state.pendingChoice) return; state.from=state.pendingChoice.prevFrom; state.pendingChoice=null; resumeAfterDecision(); }
function resolveNext(){
  if(!state.pendingChoice) return;
  if(state.pendingChoice.final) state.from=state.startRank;
  state.pendingChoice=null; resumeAfterDecision();
}
function resumeAfterDecision(){ renderSim(); autoTimer=setInterval(roll, AUTO_SPEED); updateAutoBtn(); }
function resetSim(){ stopAuto(); state.from=state.startRank; resetSession(); renderAll(); }
function stopAuto(){ if(autoTimer){ clearInterval(autoTimer); autoTimer=null; } updateAutoBtn(); }
function toggleAuto(){
  if(autoTimer){ stopAuto(); return; }
  if(state.pendingChoice) return;
  autoTimer=setInterval(roll, AUTO_SPEED);
  updateAutoBtn();
}
// 등급업 선택지 버튼과 높이를 맞추려고 여기에도 설명 줄을 둔다.
function updateAutoBtn(){
  const b=$('autoBtn'); if(!b) return;
  const sub = autoTimer ? '자동 진행 중' : `${stageName(currentStep())} 도전`;
  b.innerHTML = `${autoTimer?'정지':'자동 굴리기'}<small>${sub}</small>`;
  b.classList.toggle('active', !!autoTimer);
}
function renderSim(){
  const d=CUBES[state.cube];
  const pc=state.pendingChoice;
  const labelIndex = pc ? pc.prevFrom : state.from;
  $('simLabel').innerHTML = (pc && pc.final) ? `${rankSpan(state.to)} 도달` : stageNameHtml(labelIndex);
  const dispPity = pc ? pc.pityUsed : state.pity;
  const capIndex = pc ? pc.prevFrom : currentStep();
  const capText = d.cap[capIndex] ? `천장 ${d.cap[capIndex]}회` : '천장 정보 없음';
  $('simPity').innerHTML=`<span class="pity-box${pc?' done':''}">현재 카운터 <b class="pity-num">${dispPity}</b>회 <span class="pity-cap">/ ${capText}</span></span>`;
  $('simRuns').innerHTML=`완료한 판 <b class="runs-num">${state.sessionRuns}</b>판`;
  // 숨어 있을 때도 같은 모양으로 채워 둬야 겹친 칸의 높이가 미리 잡힌다.
  const retryFrom = pc ? pc.prevFrom : currentStep();
  $('retryBtn').innerHTML=`다시 돌리기<small>${stageName(retryFrom)} 재도전</small>`;
  $('nextBtn').innerHTML = (pc && pc.final)
    ? `다음 판 시작<small>${RANKS[state.startRank]}부터 다시</small>`
    : `다음 가기<small>${stageName(Math.min(state.from, state.to-1))} 진행</small>`;
  updateAutoBtn();
  // 두 줄은 겹쳐 놓고 보이기만 바꾼다. display를 건드리면 높이가 튄다.
  $('normalActions').classList.toggle('is-hidden', !!pc);
  $('decisionRow').classList.toggle('is-hidden', !pc);
  renderPercentiles();
  renderRunLog();
}
// 큰 카드에 들어가도록 억/만 단위로 줄인다. 정확한 값은 title로 남긴다.
function meso(n){
  n=Math.round(n);
  const eok=Math.floor(n/1e8), man=Math.floor((n%1e8)/1e4);
  if(eok) return `${eok.toLocaleString('ko-KR')}억${man?` ${man.toLocaleString('ko-KR')}만`:''}`;
  if(man) return `${man.toLocaleString('ko-KR')}만`;
  return n.toLocaleString('ko-KR');
}
function mesoHtml(n){ return `<span title="${fmt(n)} 메소">${meso(n)}</span>`; }
// 기대보다 더 쓰면 손해(빨강), 덜 쓰면 이득(초록).
function verdictHtml(diff){
  if(Math.round(diff)===0) return '<b>기대와 같음</b>';
  return diff>0 ? `<b class="bad">${mesoHtml(diff)} 메소 더 씀</b>` : `<b class="good">${mesoHtml(-diff)} 메소 덜 씀</b>`;
}
function renderRunLog(){
  const box=$('runLog'); if(!box) return;
  if(!state.runLog.length){ box.innerHTML=''; return; }
  const rows = state.runLog.slice().reverse().map(r=>{
    const mesoPart = r.meso ? `<span class="rl-meso">${mesoHtml(r.meso)} 메소</span>` : '';
    const tag = r.miracle==='on' ? '<span class="rl-tag">미라클</span>' : r.miracle==='mixed' ? '<span class="rl-tag mixed">일부 미라클</span>' : '';
    return `<div class="run-log-row"><b class="rl-n">${r.n}판</b><span class="rl-att">${r.attempts}회</span><span class="rl-pct">상위 ${pct(r.pct)}${tag}</span>${mesoPart}</div>`;
  }).join('');
  box.innerHTML=`<div class="run-log-head">판별 기록 <small>최신순</small></div>${rows}`;
}
function renderPercentiles(){
  const box=$('simPercentiles'); if(!box) return;
  const parts=[];
  const pc=state.pendingChoice;
  const showCombo = pc && pc.final ? pc.finalRunStages>1 : runStageCount()>1;
  if(showCombo){
    const comboPct = pc && pc.final ? pc.finalRunPct : runCombinedPercentile();
    parts.push(`<div class="stat-tile hero"><div class="label">이번 판 종합</div><div class="value">상위 ${pct(comboPct)}</div></div>`);
  }
  const entries=Object.entries(state.stageAgg).sort((a,b)=>a[0]-b[0]);
  if(entries.length){
    parts.push(`<div class="stage-tiles">${entries.map(([i,s])=>`<div class="stat-tile"><div class="label">${stageName(Number(i))}</div><div class="value">상위 ${pct(s.sum/s.count)}</div><div class="sub">${s.count}회 평균</div></div>`).join('')}</div>`);
  }
  const d=CUBES[state.cube];
  if(state.mesoSpent>0){
    // 판당 평균은 끝난 판만 쓴다. 진행 중인 판을 섞으면 분자만 커져서 손해처럼 보인다.
    const doneActual = state.mesoSpent - state.runMeso;
    const doneExpected = state.expectedTotal - state.runExpected;
    if(state.sessionRuns>0 && doneExpected>0){
      const runs=state.sessionRuns;
      const avgActual=doneActual/runs, avgExpected=doneExpected/runs, diff=avgActual-avgExpected;
      const median=runCostQuantile(.5);
      parts.push(`<div class="stat-tile compare"><div class="cmp-col"><div class="label">판당 실제 지출</div><div class="value">${mesoHtml(avgActual)}</div></div><div class="cmp-vs">vs</div><div class="cmp-col expected"><div class="label">판당 기대 지출</div><div class="value">${mesoHtml(avgExpected)}</div>${median?`<div class="sub">중앙값 ${mesoHtml(median)}</div>`:''}</div><div class="cmp-verdict"><span>판당 손익 · ${runs}판 평균</span>${verdictHtml(diff)}</div>${median?`<div class="cmp-note">판의 절반은 ${mesoHtml(median)} 안에 끝나요. 천장까지 가는 판이 평균을 끌어올려서, 기대 지출보다 싸게 끝나는 판이 더 흔합니다.</div>`:''}</div>`);
    }
    // 누적 손익은 진행 중인 판까지 포함한다. 깬 단계마다 기대 비용을 쌓아 비교 기준을 맞춘다.
    // 1판만 끝나고 진행 중인 판이 없으면 판당 타일과 값이 같으므로 접는다.
    const sameAsPerRun = state.sessionRuns===1 && state.runMeso===0 && doneExpected>0;
    if(state.expectedTotal>0 && !sameAsPerRun){
      const runNote = state.runMeso>0 ? `${state.sessionRuns}판 + 진행 중` : `${state.sessionRuns}판 전체`;
      parts.push(`<div class="stat-tile compare cumulative"><div class="cmp-col"><div class="label">누적 실제 지출</div><div class="value">${mesoHtml(state.mesoSpent)}</div></div><div class="cmp-vs">vs</div><div class="cmp-col expected"><div class="label">누적 기대 지출</div><div class="value">${mesoHtml(state.expectedTotal)}</div></div><div class="cmp-verdict"><span>누적 손익 · ${runNote}</span>${verdictHtml(state.mesoSpent-state.expectedTotal)}</div></div>`);
    } else if(!sameAsPerRun){
      parts.push(`<div class="stat-tile total"><div class="label">누적 실제 지출</div><div class="value">${mesoHtml(state.mesoSpent)} 메소</div></div>`);
    }
  }
  box.innerHTML=parts.join('');
}
function renderAll(){ ensureValidCube(); renderTabs(); renderRanks(); renderChoices(); renderLevelRow(); renderSim(); }
$('autoBtn').onclick=toggleAuto; $('resetBtn').onclick=resetSim;
$('retryBtn').onclick=resolveRetry; $('nextBtn').onclick=resolveNext;
$('miracleCheckbox').onchange=e=>{state.miracle=e.target.checked;renderAll();};
// 아이템 레벨이 큐브 1회 메소를 정한다. 판이 도는 중에 바꾸면 기준이 섞이므로 세션을 초기화한다
$('itemLevel').addEventListener('input',e=>{
  if(e.target.value==='') return;
  stopAuto();
  state.level=Math.min(Math.max(Math.round(Number(e.target.value)||0),1),300);
  if(state.mesoSpent>0) resetSession();
  renderAll();
});
$('itemLevel').addEventListener('blur',renderAll);
renderAll();
