(function () {
  'use strict';
  const C = window.StarforceHistoryCore, $ = id => document.getElementById(id);
  let rows = [], groups = [], selected = null, selectedRows = [], page = 0, controller = null, appliedFrom = 1, appliedTo = 1;
  const overrides = new Map();
  const attemptCache = new Map();
  let coverage='partial',queryPeriod='';
  let detailTrigger=null;
  let activeKey=NexonKey.get();
  let accountCharacters=[],characterRequest=null,characterLoadState='idle';
  const selectedWorlds=new Set(),selectedCharacters=new Set();
  let allWorlds=true,allCharacters=true,availableWorlds=[],availableCharacters=[];
  const characterKey=c=>JSON.stringify([c.world||'',c.name]);
  const fmt = n => Math.round(n).toLocaleString('ko-KR');
  const meso = n => {
    if(n===0)return '0 메소';
    const amount=Math.floor(Math.abs(n)/1e4),hundredMillions=Math.floor(amount/1e4),tenThousands=amount%1e4;
    const parts=[];
    if(hundredMillions)parts.push(fmt(hundredMillions)+'억');
    if(tenThousands)parts.push(fmt(tenThousands)+'만');
    return (n<0?'-':'')+(parts.join(' ')||'1만 미만')+' 메소';
  };
  const profitText=n=>meso(Math.abs(n)).replace(' 메소','')+(n>0?' 이득':n<0?' 손해':' 차이 없음');
  function kstToday() { return new Date(Date.now()+9*3600000).toISOString().slice(0,10); }
  function earliest() { const d = new Date(kstToday()); d.setUTCFullYear(d.getUTCFullYear()-2); return d.toISOString().slice(0,10); }
  function status(message, error) { $('historyStatus').textContent = message; $('historyStatus').classList.toggle('error',!!error); }
  function refreshKey() { $('keyState').textContent = NexonKey.has() ? '기존 API 키 연결됨' : '홈에서 본인 API 키를 등록해 주세요.'; }
  function addText(parent, tag, text) { const el=document.createElement(tag); el.textContent=text; parent.append(el); return el; }
  function appendWorld(parent,world){
    if(!world)return;
    const path=window.NexonCharacters?.worldIconPath(world);
    if(path){const icon=document.createElement('img');icon.className='history-world-icon';icon.src=path;icon.alt='';icon.addEventListener('error',()=>icon.hidden=true,{once:true});parent.append(icon);}
    addText(parent,'span',world);
  }
  function characterLine(parent,g){
    parent.replaceChildren();parent.classList.add('history-character-line');appendWorld(parent,g.world);
    addText(parent,'span',(g.world?' · ':'')+g.character);
  }
  function renderCharacterFilters(){
    const active=document.activeElement,focus=active?.type==='checkbox'?{parent:active.closest('.history-multi-filter')?.id,value:active.value}:null;
    const scroll=['historyWorldOptions','historyCharacterOptions'].map(id=>[id,$(id).scrollTop]);
    const candidates=new Map(),metadata=new Map(accountCharacters.map(c=>[characterKey(c),c]));
    rows.filter(r=>!C.specialCurrency(r)).forEach(r=>{
      const character={name:r.character_name,world:r.world_name||''},key=characterKey(character);
      if(!candidates.has(key))candidates.set(key,metadata.get(key)||character);
    });
    // Partial results may not have reached a previously selected character yet.
    if(coverage==='complete')for(const key of selectedCharacters)if(!candidates.has(key))selectedCharacters.delete(key);
    const worlds=[...new Set([...accountCharacters.map(c=>c.world),...rows.map(r=>r.world_name),...selectedWorlds].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
    availableWorlds=worlds;availableCharacters=[...candidates.keys()];
    const syncAll=(id,keys,selection,all)=>{
      const count=all?keys.length:keys.filter(key=>selection.has(key)).length,input=$(id);
      input.checked=all||keys.length>0&&count===keys.length;input.indeterminate=!input.checked&&count>0;input.disabled=!keys.length;
    };
    const option=(parent,value,checked,content)=>{
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=value;input.checked=checked;label.append(input);content(label);parent.append(label);
    };
    $('historyWorldOptions').replaceChildren();
    worlds.forEach(world=>option($('historyWorldOptions'),world,allWorlds||selectedWorlds.has(world),label=>appendWorld(label,world)));
    syncAll('historyWorldAll',worlds,selectedWorlds,allWorlds);
    const worldSummary=$('historyWorldSummary');worldSummary.replaceChildren();
    if($('historyWorldAll').checked)worldSummary.textContent='전체 서버';
    else if(selectedWorlds.size===1)appendWorld(worldSummary,[...selectedWorlds][0]);
    else worldSummary.textContent=selectedWorlds.size?selectedWorlds.size+'개 서버 선택':'서버 선택 없음';
    worldSummary.title=(allWorlds?worlds:[...selectedWorlds]).join(', ');
    $('historyCharacterOptions').replaceChildren();
    const visible=[...candidates.values()].filter(c=>allWorlds||selectedWorlds.has(c.world)).sort((a,b)=>(b.level||0)-(a.level||0)||a.world.localeCompare(b.world,'ko')||a.name.localeCompare(b.name,'ko'));
    visible.forEach(c=>option($('historyCharacterOptions'),characterKey(c),allCharacters||selectedCharacters.has(characterKey(c)),label=>{
      addText(label,'span',window.NexonCharacters?.characterOptionText(c)||c.name);if(c.world)appendWorld(label,c.world);
    }));
    if(!visible.length)addText($('historyCharacterOptions'),'p',rows.length?'선택한 서버에 메소 강화 기록이 있는 캐릭터가 없습니다.':'기록을 불러오면 캐릭터가 표시됩니다.');
    syncAll('historyCharacterAll',visible.map(characterKey),selectedCharacters,allCharacters);
    const chosen=visible.filter(c=>allCharacters||selectedCharacters.has(characterKey(c)));
    // Keep selections from other worlds so changing the world filter does not erase them.
    $('historyCharacterSummary').textContent=$('historyCharacterAll').checked?'전체 캐릭터':chosen.length===1?chosen[0].name:chosen.length?chosen.length+'명 선택':'캐릭터 선택 없음';
    $('historyCharacterSummary').title=(allCharacters?availableCharacters:[...selectedCharacters]).map(value=>{const [world,name]=JSON.parse(value);return name+' · '+world;}).join(', ');
    if(focus?.parent)[...$(focus.parent).querySelectorAll('input')].find(input=>input.value===focus.value)?.focus({preventScroll:true});
    scroll.forEach(([id,top])=>$(id).scrollTop=top);
    $('historyCharactersStatus').textContent=(rows.length?'스타포스 기록 캐릭터 '+fmt(candidates.size)+'명':'조회 기간에 강화 기록이 있는 캐릭터만 표시합니다.')+(characterLoadState==='loading'?' · 캐릭터 정보 확인 중':characterLoadState==='failed'?' · 캐릭터 정보를 불러오지 못했습니다.':'');
  }
  async function loadCharacters(){
    characterRequest?.abort();characterRequest=null;$('historyCharactersRefresh').disabled=false;accountCharacters=[];characterLoadState='idle';renderCharacterFilters();
    if(!NexonKey.has()||!window.NexonCharacters)return;
    const request=new AbortController(),key=NexonKey.get();characterRequest=request;
    $('historyCharactersRefresh').disabled=true;characterLoadState='loading';renderCharacterFilters();
    const timer=setTimeout(()=>request.abort(),25000);
    try{
      const loaded=await NexonCharacters.fetch({key,signal:request.signal});
      if(characterRequest!==request||NexonKey.get()!==key)return;
      accountCharacters=loaded;characterLoadState='ready';renderCharacterFilters();
    }catch(e){if(characterRequest===request&&NexonKey.get()===key){characterLoadState='failed';renderCharacterFilters();}}
    finally{clearTimeout(timer);if(characterRequest===request){characterRequest=null;$('historyCharactersRefresh').disabled=false;}}
  }
  function resetComparison(){
    $('itemComparison').className='history-comparison';$('itemComparison').textContent='목표 달성 분석 후 기대비용 대비 이득·손해를 표시합니다.';
  }
  async function api(key, signal, path, params) {
    const request = new AbortController();
    const abort = () => request.abort();
    signal.addEventListener('abort',abort,{once:true});
    if (signal.aborted) request.abort();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut=true; request.abort(); },25000);
    try {
      const response = await fetch('https://open.api.nexon.com/maplestory/v1'+path+'?'+new URLSearchParams(params),{headers:{'x-nxopen-api-key':key},signal:request.signal});
      const body = await response.json().catch(()=>null);
      if (!response.ok) {
        const code = body && body.error && body.error.name;
        const messages = {OPENAPI00002:'이 API 키로 기록을 조회할 수 없습니다. 본인 계정의 키를 확인하세요.',OPENAPI00003:'조회 가능한 기록을 찾을 수 없습니다.',OPENAPI00004:'조회 날짜와 조건을 확인하세요.',OPENAPI00005:'API 키가 유효하지 않습니다. 홈에서 다시 등록하세요.',OPENAPI00006:'API 경로를 찾을 수 없습니다.',OPENAPI00007:'API 호출 한도를 초과했습니다. 잠시 후 기간을 줄여 다시 조회하세요.',OPENAPI00009:'데이터 준비 중입니다. 잠시 후 다시 조회하세요.',OPENAPI00010:'게임 점검 중입니다.',OPENAPI00011:'API 점검 중입니다.'};
        const limited = code==='OPENAPI00007' || response.status===429;
        const error = new Error(limited ? 'API 호출 제한이 계속되고 있습니다. 잠시 후 다시 시도하세요. 개발 단계 키는 초당 5회·하루 1,000회 제한이며, 하루 한도 소진 여부는 넥슨 내 애플리케이션에서 확인하세요. 기간을 줄여도 이미 소진한 한도는 복구되지 않습니다.' : messages[code] || '기록 조회에 실패했습니다. (HTTP '+response.status+')');
        error.code=code;error.status=response.status;
        const retryAfter=response.headers.get('Retry-After');
        if(retryAfter) error.retryAfterMs=/^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter)*1000 : Math.max(0,Date.parse(retryAfter)-Date.now());
        throw error;
      }
      return body;
    } catch(e) { if(timedOut) throw new Error('응답 시간이 초과되었습니다. 잠시 후 다시 조회하세요.'); throw e; }
    finally { clearTimeout(timer); signal.removeEventListener('abort',abort); }
  }
  function costSummary() {
    const sum=list=>list.reduce((out,g)=>{
      const e=groupCost(g);out.cost+=e.cost;out.spareCost+=e.spareCost;out.count+=e.count;out.tries+=g.rows.length;out.unpricedDestroy+=e.unpricedDestroy;
      Object.entries(e.reasons).forEach(([reason,n])=>out.reasons[reason]=(out.reasons[reason]||0)+n);
      return out;
    },{cost:0,spareCost:0,count:0,tries:0,unpricedDestroy:0,reasons:{}});
    const total=sum(groups),account=sum(C.grouped(rows,'').map(g=>({...g,rows:C.currencyRows(g.rows,'normal')})));
    const incomplete=coverage!=='complete'||total.count<total.tries||total.unpricedDestroy>0;
    $('costStatus').textContent=incomplete?'일부 비용 미반영':'';
    $('totalCost').textContent=total.tries&&!total.count&&!total.spareCost?'계산 필요':meso(total.cost+total.spareCost);
    $('totalCostExact').textContent=meso(total.cost+total.spareCost)+' · '+fmt(total.count)+' / '+fmt(total.tries)+'회 강화비 반영';
    $('totalCostScope').textContent=queryPeriod+' · '+$('historyWorldSummary').textContent+' · '+$('historyCharacterSummary').textContent+(coverage!=='complete'?' · 조회 미완료':'');
    $('accountCost').textContent='계정 전체: '+meso(account.cost+account.spareCost)+' · '+fmt(account.count)+' / '+fmt(account.tries)+'회 강화비 반영';
    $('enhanceCost').textContent=meso(total.cost);$('spareCost').textContent=meso(total.spareCost);
    $('costSummary').textContent='추정 강화비 '+meso(total.cost)+' · '+fmt(total.count)+' / '+fmt(total.tries)+'회 반영 · 기록의 이벤트·파괴방지 자동 적용, 현재 단가 기준. 대체 장비비는 입력한 경우 합계에 포함하며 복구 메소는 제외합니다.';
    $('costMissing').replaceChildren();
    Object.entries(total.reasons).forEach(([reason,n])=>addText($('costMissing'),'li',reason+' '+fmt(n)+'회 · 장비 상세에서 확인하세요.'));
    if(total.unpricedDestroy)addText($('costMissing'),'li','파괴 '+fmt(total.unpricedDestroy)+'회의 대체 장비값 미입력 · 재구입비가 합계에서 빠져 있습니다.');
    $('costMissing').hidden=!$('costMissing').children.length;
    renderAggregate();
  }
  function renderAggregate(){
    const comparison=C.aggregateAttempts(groups,settings,StarforceData,StarforceCalc.calculate,attemptCache);
    const incomplete=coverage!=='complete'||comparison.excludedRecords>0||groups.some(g=>groupCost(g).unpricedDestroy>0);
    $('totalProfit').className=comparison.records?(comparison.delta>=0?'gain':'loss'):'';
    $('totalProfit').textContent=comparison.records?profitText(comparison.delta):'—';
    $('profitStatus').textContent=comparison.records?(incomplete?'기대비용 대비 · 일부 비교':'기대비용 대비'):'계산 가능한 기록 없음';
    $('totalGains').textContent=comparison.records?meso(comparison.gains):'—';$('totalLosses').textContent=comparison.records?meso(comparison.losses):'—';
    $('profitActual').textContent=comparison.records?meso(comparison.actual):'—';$('profitExpected').textContent=comparison.records?meso(comparison.reference):'—';
    const count=groups.reduce((n,g)=>n+g.rows.length,0);
    $('profitCoverage').textContent=fmt(comparison.records)+' / '+fmt(count)+'회 비교 · '+fmt(comparison.excludedRecords)+'회 제외'+(coverage!=='complete'?' · 전체 기간 조회 미완료':'')+' · 목표 별을 추정하지 않습니다.';
    $('profitExcluded').replaceChildren();
    Object.entries(comparison.reasons).forEach(([reason,n])=>addText($('profitExcluded'),'li',reason+' · '+fmt(n)+'회 제외'));
    if(groups.some(g=>groupCost(g).unpricedDestroy>0))addText($('profitExcluded'),'li','대체 장비값 미입력: 파괴로 잃은 진척은 비교하지만 재구입비는 빠져 있습니다.');
    $('profitExcluded').hidden=!$('profitExcluded').children.length;
    $('profitRows').replaceChildren();
    comparison.entries.forEach(entry=>{
      const tr=document.createElement('tr');
      [entry.name+' · '+entry.character+' · '+entry.world,fmt(entry.records)+'회'+(entry.excluded?' · '+fmt(entry.excluded)+'회 제외':''),meso(entry.actual),meso(entry.reference),profitText(entry.delta)].forEach(value=>addText(tr,'td',value));
      tr.lastChild.className=entry.delta>=0?'gain':'loss';$('profitRows').append(tr);
    });
  }
  function settings(g){return overrides.get(g.key)||{level:C.itemLevel(g.name),mvp:0,pcRoom:false,spare:0};}
  function equipmentLabel(g){
    const info=C.itemInfo(g.name),level=settings(g).level;
    const origin=overrides.has(g.key)?'':info?.inferred?' (계열 기준)':!info?' (이름 기준 추정)':'';
    const label=level?'Lv. '+level+origin:'레벨 미확인';
    return [label,info?.slot,info?.set].filter(Boolean).join(' · ');
  }
  function groupCost(g,list=g.rows){
    const options=settings(g);return C.costTotals(list,options.level,StarforceData,options);
  }
  function fillCard(button,g){
    button.replaceChildren();const totals=groupCost(g),comparison=C.aggregateAttempts([g],settings,StarforceData,StarforceCalc.calculate,attemptCache);
    addText(button,'strong',g.name);
    characterLine(addText(button,'small',''),g);
    const money=addText(button,'span','');money.className='history-card-money';
    const spending=addText(money,'span','');addText(spending,'span','사용 메소'+(totals.count<g.rows.length||totals.unpricedDestroy||coverage!=='complete'?' · 일부 추정':''));
    addText(spending,'b',totals.count||totals.spareCost?meso(totals.total):'계산 필요').className='history-card-cost';
    const profit=addText(money,'span','');addText(profit,'span','손익'+(comparison.records&&(comparison.excludedRecords||totals.unpricedDestroy||coverage!=='complete')?' · 일부 비교':''));
    const amount=addText(profit,'b',comparison.records?profitText(comparison.delta):'계산 불가');amount.className='history-card-profit'+(comparison.records?(comparison.delta>=0?' gain':' loss'):'');
    amount.title=Object.entries(comparison.reasons).map(([reason,n])=>reason+' · '+fmt(n)+'회').join('\n');
    button.setAttribute('aria-label',g.name+' · '+g.world+' · '+g.character+' 상세 기록 보기');
  }
  function renderCounts(parent,list){
    const success=list.filter(r=>!C.destroyed(r)&&r.after_starforce_count>r.before_starforce_count).length,broken=list.filter(C.destroyed).length;
    const stats=document.createElement('span');stats.className='history-counts';
    [['tries','시도',list.length],['success','성공',success],['failure','실패',list.length-success-broken],['destroy','파괴',broken]].forEach(([kind,label,value])=>{
      const cell=addText(stats,'span','');cell.className='history-stat '+kind;
      addText(cell,'span',label);addText(cell,'b',fmt(value));
    });parent.append(stats);
  }
  function refreshOverview(){
    const totals=groupCost(selected,selectedRows);
    $('itemOverview').textContent=fmt(selectedRows.length)+'회 · 추정 사용 메소 '+meso(totals.total)+'\n강화비 '+meso(totals.cost)+' + 대체 장비비 '+meso(totals.spareCost)+(totals.count!==selectedRows.length?'\n비용 누락: '+Object.entries(totals.reasons).map(([reason,n])=>reason+' '+n+'회').join(' · '):'')+(totals.unpricedDestroy?'\n파괴 '+totals.unpricedDestroy+'회 대체 장비값 미입력':'')+'\n현재 단가 · 이벤트·파괴방지 자동 반영 · 복구 메소 제외';
    renderCounts($('itemOverview'),selectedRows);
    const comparison=C.aggregateAttempts([{...selected,rows:selectedRows}],settings,StarforceData,StarforceCalc.calculate,attemptCache);
    if(comparison.excludedRecords)addText($('itemOverview'),'small','손익 제외: '+Object.entries(comparison.reasons).map(([reason,n])=>reason+' '+fmt(n)+'회').join(' · '));
    characterLine($('itemSubtitle'),selected);addText($('itemSubtitle'),'span',' · '+equipmentLabel(selected)+' · '+selected.rows[0].date_create.slice(0,10)+' ~ '+selected.rows.at(-1).date_create.slice(0,10));
    $('itemEvents').replaceChildren();
    const labels=new Set();
    selectedRows.forEach(r=>{
      if(C.active(r.destroy_defence))labels.add('파괴방지');
      (Array.isArray(r.starforce_event_list)?r.starforce_event_list:[]).forEach(e=>{
        if(!e||typeof e!=='object'||Array.isArray(e)){labels.add('이벤트 조건 해석 필요');return;}
        [['cost_discount_rate','비용 할인'],['destroy_decrease_rate','파괴확률 감소'],['success_rate','성공확률'],['recovery_cost_discount_rate','복구 할인']].forEach(([key,label])=>{if(e[key]&&C.eventPercent(e[key])!==0)labels.add(label+' '+String(e[key])+(String(e[key]).includes('%')?'':'%')+(e.starforce_event_range?' · '+e.starforce_event_range+'성':''));});
        if(Number(e.plus_value)>0)labels.add('추가 '+e.plus_value+'성');
      });
    });
    if(!labels.size)labels.add('기록된 이벤트 없음');
    labels.forEach(label=>addText($('itemEvents'),'span',label));
  }
  function renderGroups(preserveDetail=false) {
    renderCharacterFilters();
    const scope=C.grouped(rows.filter(r=>(allWorlds||selectedWorlds.has(r.world_name))&&(allCharacters||selectedCharacters.has(JSON.stringify([r.world_name||'',r.character_name])))), '');
    groups=scope.map(g=>({...g,rows:C.currencyRows(g.rows,'normal')})).filter(g=>g.rows.length);
    $('historyResults').hidden=false;
    $('historyItems').replaceChildren();
    const keepDetail=preserveDetail&&$('historyDetail').open&&groups.some(g=>g.key===selected?.key);
    if(!keepDetail){if($('historyDetail').open)$('historyDetail').close();selected=null;}
    const filtered=groups.flatMap(g=>g.rows);
    $('totalTries').textContent=fmt(filtered.length)+'회';
    $('totalDestroy').textContent=fmt(filtered.filter(C.destroyed).length)+'회';
    groups.forEach(g => {
      const button=document.createElement('button'); button.type='button'; button.setAttribute('aria-pressed','false');
      button.setAttribute('aria-haspopup','dialog');fillCard(button,g);
      if(keepDetail&&selected.key===g.key){detailTrigger=button;button.setAttribute('aria-pressed','true');}
      button.addEventListener('click',()=>selectGroup(g,button)); $('historyItems').append(button);
    });
    if(!groups.length) addText($('historyItems'),'p','선택한 조건에 메소 강화 기록이 없습니다.');
    costSummary();
  }
  function selectGroup(group,button) {
    selected=group;detailTrigger=button;
    $('historyItems').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    $('itemTitle').textContent=group.name;
    $('itemSubtitle').textContent=[group.world,group.character,group.rows[0].date_create.slice(0,10)+' ~ '+group.rows.at(-1).date_create.slice(0,10)].filter(Boolean).join(' · ');
    $('rangeFrom').value=1; $('rangeTo').value=group.rows.length;
    $('rangeFrom').max=$('rangeTo').max=group.rows.length;
    $('sessionSelect').replaceChildren();
    const all=document.createElement('option');all.value='all';all.textContent='전체 기록 · '+group.rows.length+'회';$('sessionSelect').append(all);
    C.sessions(group.rows).forEach((session,i)=>{
      const option=document.createElement('option');option.value=session.from+':'+session.to;
      option.textContent='구간 '+(i+1)+' · '+session.from+'~'+session.to+'번 · '+session.reason;$('sessionSelect').append(option);
    });
    $('analysisForm').reset();
    const saved=settings(group);$('itemLevel').value=saved.level||'';$('itemMvp').value=saved.mvp||0;$('itemPc').checked=!!saved.pcRoom;$('itemSpare').value=saved.spare||0;
    $('analysisSettings').open=false;$('rangeSettings').open=false;
    applyRange();
    $('historyDetail').showModal();$('detailClose').focus();
  }
  function applyRange() {
    if(!selected) return;
    const from=Number($('rangeFrom').value),to=Number($('rangeTo').value);
    if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to>selected.rows.length||from>to){$('analysisResult').textContent='시작·종료 순번을 확인하세요.';return;}
    selectedRows=selected.rows.slice(from-1,to);page=0;appliedFrom=from;appliedTo=to;
    $('analysisConfirmed').checked=false;
    $('analysisResult').textContent='장비 레벨과 강화 조건을 확인하면 비용과 기대값을 비교할 수 있습니다.';
    resetComparison();
    const first=selectedRows[0],last=selectedRows.at(-1);
    $('rangeSummary').textContent=from+'~'+to+'번 · '+selectedRows.length+'회 · '+first.before_starforce_count+'성 → '+(C.destroyed(last)?'파괴':last.after_starforce_count+'성')+' · 파괴 '+selectedRows.filter(C.destroyed).length+'회';
    costSummary();refreshOverview();renderRows();
  }
  function renderRows() {
    const body=$('historyRows');body.replaceChildren();
    const offset=appliedFrom-1;
    selectedRows.slice(page*100,(page+1)*100).forEach((r,i)=>{
      const tr=document.createElement('tr');
      const config=settings(selected),cost=C.recordCost(r,config.level,StarforceData,config);
      const comparison=C.attemptComparison(r,config,StarforceData,StarforceCalc.calculate,attemptCache);
      const difference=comparison.status==='complete'?meso(Math.abs(comparison.delta))+(comparison.delta>=0?' 이득':' 손해'):comparison.reason;
      const conditions=['스타캐치 '+C.starcatchLabel(r),'파괴방지 '+(C.active(r.destroy_defence)?'사용':'미사용'),...(Array.isArray(r.starforce_event_list)?r.starforce_event_list.map(e=>e&&typeof e==='object'&&!Array.isArray(e)?Object.entries(e).map(([key,value])=>({starforce_event_range:'범위',cost_discount_rate:'비용 할인',destroy_decrease_rate:'파괴 감소',success_rate:'성공률',plus_value:'추가 별',recovery_cost_discount_rate:'복구 할인'}[key]||key)+': '+value).join(' / '):'이벤트 형식 확인 필요'):r.starforce_event_list==null?[]:['이벤트 형식 확인 필요'])].join(' · ');
      [String(offset+page*100+i+1),r.date_create.replace('T',' ').slice(0,19),r.before_starforce_count+' → '+(C.destroyed(r)?'✕':r.after_starforce_count),r.item_upgrade_result,cost===null?C.costIssue(r,config.level,StarforceData):meso(cost),difference,conditions].forEach(t=>addText(tr,'td',t));
      if(comparison.status==='complete'){
        const cell=tr.children[5];cell.className=comparison.delta>=0?'history-gain':'history-loss';cell.title='결과 기준금액 '+meso(comparison.reference)+' − 사용액 '+meso(comparison.actual);
        addText(cell,'small','상승 기대비용 '+meso(comparison.expected)).className='history-attempt-reference';
        if(C.destroyed(r))addText(cell,'small','잃은 별 기준 '+meso(comparison.reference)+' · 대체비 '+meso(comparison.spareCost)).className='history-attempt-reference';
      }
      tr.children[3].className='history-outcome '+(C.destroyed(r)?'destroy':r.after_starforce_count>r.before_starforce_count?'success':'failure');body.append(tr);
    });
    $('rowsPage').textContent=(page+1)+' / '+Math.max(1,Math.ceil(selectedRows.length/100));
    $('rowsPrev').disabled=page===0;$('rowsNext').disabled=(page+1)*100>=selectedRows.length;
  }
  function analyze(event) {
    event.preventDefault(); if(!selectedRows.length) return;
    resetComparison();
    const out=$('analysisResult');
    if(Number($('rangeFrom').value)!==appliedFrom||Number($('rangeTo').value)!==appliedTo){out.textContent='변경한 순번의 구간 적용을 먼저 눌러 주세요.';return;}
    const issue=C.pathIssue(selectedRows)||C.starcatchIssue(selectedRows);
    if(issue){out.textContent=issue;return;}
    const signatures=new Set(selectedRows.map(C.eventSignature));
    const guards={};
    for(const r of selectedRows){const star=r.before_starforce_count,on=C.active(r.destroy_defence);if(star in guards&&guards[star]!==on){out.textContent='파괴방지 사용 조건이 바뀐 기록입니다. 비용은 자동 합산하며, 목표 확률 비교는 고급 설정에서 같은 조건의 구간을 선택하세요.';return;}guards[star]=on;}
    if(signatures.size>1){out.textContent='여러 이벤트 기간이 포함되어 비용은 각각 자동 반영했습니다. 목표 확률 비교는 고급 설정에서 같은 이벤트 구간을 선택하세요.';return;}
    const events=selectedRows[0].starforce_event_list||[];
    const modifiers=selectedRows.map(C.recordModifiers);
    if(modifiers.some(m=>!m||m.plus||![0,.3].includes(m.discount)||![0,.3].includes(m.destroyDown)||![0,1].includes(m.success))){out.textContent='이 이벤트의 목표 확률 비교는 아직 지원하지 않습니다. 상세 기록의 이벤트를 확인하세요.';return;}
    const discount30=events.some(e=>C.eventPercent(e.cost_discount_rate)===.3),lucky5=events.some(e=>C.eventPercent(e.success_rate)===1),destroyDown30=events.some(e=>C.eventPercent(e.destroy_decrease_rate)===.3);
    // Only use the calculator's exact event templates; unknown ranges cannot be extrapolated.
    for(let s=0;s<30;s++){
      const m=C.recordModifiers({...selectedRows[0],before_starforce_count:s});
      if(!m||m.discount!==(discount30?.3:0)||m.destroyDown!==(destroyDown30&&s<=21?.3:0)||m.success!==(lucky5&&[5,10,15].includes(s)?1:0)){out.textContent='기록의 이벤트 범위가 목표 분석 모델과 달라 비용만 자동 반영합니다.';return;}
    }
    const opts={level:Number($('itemLevel').value),start:selectedRows[0].before_starforce_count,goal:Number($('itemGoal').value),spare:Number($('itemSpare').value),mvp:Number($('itemMvp').value),pcRoom:$('itemPc').checked,discount30,lucky5,destroyDown30,safeguard:guards,recoveryMode:'off'};
    if(!Number.isInteger(opts.level)||opts.level<1||opts.level>300||!Number.isInteger(opts.goal)||opts.goal<=opts.start||opts.goal>30||!Number.isSafeInteger(opts.spare)||opts.spare<0||!$('analysisConfirmed').checked){out.textContent='장비 레벨, 시작 별보다 높은 목표 별, 대체 장비값과 확인 항목을 점검하세요.';return;}
    const result=StarforceCalc.calculate(opts),steps=result.steps;
    // Reject outcomes impossible under the selected fixed policy.
    if(selectedRows.some(r=>C.destroyed(r)&&steps[r.before_starforce_count].d===0 || !C.destroyed(r)&&r.before_starforce_count===r.after_starforce_count&&steps[r.before_starforce_count].p===1)){
      out.textContent='기록과 선택한 강화 조건이 맞지 않습니다. 파괴방지·100% 성공 이벤트를 확인하거나 구간을 나눠 주세요.';return;
    }
    const costOf=list=>list.reduce((sum,r)=>sum+steps[r.before_starforce_count].cost+(C.destroyed(r)?opts.spare:0),0);
    const total=costOf(selectedRows);
    costSummary();
    const hit=selectedRows.findIndex(r=>!C.destroyed(r)&&r.after_starforce_count>=opts.goal);
    let text='선택 구간 '+fmt(selectedRows.length)+'회 · 환산 비용 '+meso(total)+'\n';
    if(hit<0){
      const cdf=C.countCDF(steps,opts.start,opts.goal,selectedRows.length);
      text+='목표 '+opts.goal+'성 미달성 · 진행 중\n완성 전이므로 절약·초과 손익은 판정하지 않습니다.';
      $('itemComparison').textContent='목표 '+opts.goal+'성 미달성 · 진행 중이므로 이득·손해를 판정하지 않습니다.';
      if(cdf!==null)text+='\n같은 조건에서 '+fmt(selectedRows.length)+'회까지 목표에 도달하지 못할 확률 '+((1-cdf)*100).toFixed(2)+'%';
    } else {
      const used=selectedRows.slice(0,hit+1),actual=costOf(used),delta=result.total.meso-actual;
      const cdf=C.countCDF(steps,opts.start,opts.goal,used.length);
      text+='최초 '+opts.goal+'성 달성까지 '+fmt(used.length)+'회 / '+meso(actual)+'\n';
      text+='동일 조건 기대 '+result.total.tries.toLocaleString('ko-KR',{maximumFractionDigits:1})+'회 / '+meso(result.total.meso)+'\n';
      text+='기대비용 대비 '+meso(Math.abs(delta))+(delta>=0?' 절약 · 이득':' 초과 · 손해')+'\n';
      $('itemComparison').replaceChildren();$('itemComparison').className='history-comparison '+(delta>=0?'gain':'loss');
      addText($('itemComparison'),'span','최초 '+opts.goal+'성 달성 · 기대비용 대비');
      addText($('itemComparison'),'strong',meso(Math.abs(delta))+(delta>=0?' 이득 (절약)':' 손해 (초과)'));
      addText($('itemComparison'),'small','환산 사용 '+meso(actual)+' / 기대 '+meso(result.total.meso)+' · 거래 손익은 포함하지 않습니다.');
      text+=cdf===null?'횟수가 많아 상위 확률 계산을 생략했습니다.': '횟수 기준 운 상위 '+(cdf*100<0.01?'<0.01':(cdf*100).toFixed(2))+'% · '+fmt(used.length)+'회 이내 달성 확률';
      if(used.length<selectedRows.length)text+='\n목표 달성 이후 '+fmt(selectedRows.length-used.length)+'회는 전체 환산 비용에만 포함합니다.';
    }
    text+='\n현재 확률·단가와 선택 조건으로 환산한 비교이며 실제 지출·거래 손익·전체 유저 순위가 아닙니다.';
    out.textContent=text;
  }
  function fullPeriod(){
    $('historyTo').value=kstToday();$('historyFrom').value=earliest();
    ['historyFrom','historyTo'].forEach(id=>$(id)._flatpickr?.setDate($(id).value,false));
    $('historyPeriods').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.days==='all')));
  }
  fullPeriod();
  ['historyFrom','historyTo'].forEach(id=>{$(id).min=earliest();$(id).max=kstToday();});
  $('historyPeriods').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
    const today=kstToday();
    $('historyTo').value=today;
    $('historyFrom').value=button.dataset.days==='all' ? earliest() : new Date(Date.parse(today)-(Number(button.dataset.days)-1)*86400000).toISOString().slice(0,10);
    $('historyPeriods').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  }));
  ['historyFrom','historyTo'].forEach(id=>$(id).addEventListener('input',()=>{
    $('historyPeriods').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','false'));
  }));
  refreshKey();
  loadCharacters();
  $('historyQuery').addEventListener('submit',async event=>{
    event.preventDefault();if(controller)return;
    if(!NexonKey.has()){status('홈에서 본인 API 키를 먼저 등록하세요.',true);return;}
    const from=$('historyFrom').value,to=$('historyTo').value;
    try{C.days(from,to);if(from<earliest()||to>kstToday())throw new Error('최근 2년 이내의 날짜를 선택하세요.');}catch(e){status(e.message,true);return;}
    const request=new AbortController();controller=request;
    const key=NexonKey.get();
    coverage='partial';queryPeriod=from===to?from:from+' ~ '+to;
    const completedDays=new Map();let cache=null,cacheFailed=false,lastPreview=0,cacheReady=false;
    // Keep the current view usable during refresh and retain it if the network fails.
    C.normalize(rows,from,to).forEach(row=>{
      const date=C.day(row.date_create);if(!completedDays.has(date))completedDays.set(date,{records:[],stale:true});completedDays.get(date).records.push(row);
    });
    const showPartial=()=>{
      rows=C.normalize([...completedDays.values()].flatMap(day=>day.records),from,to);renderGroups(true);
      $('historyCoverage').textContent='부분 조회 · '+completedDays.size+' / '+C.days(from,to).length+'일 · 전체 기간 합계가 아닙니다.'+([...completedDays.values()].some(day=>day.stale)?' 갱신 전 저장 기록 포함.':'');
    };
    if(completedDays.size)showPartial();
    else{rows=[];groups=[];selected=null;selectedRows=[];$('historyResults').hidden=true;renderCharacterFilters();}
    $('historyFetch').disabled=true;$('historyCancel').hidden=false;
    status('기록을 불러오는 중입니다.');
    try{
      try{
        cache=await StarforceHistoryCache.open(key);
        const saved=await cache.getSettings();
        if(request.signal.aborted||NexonKey.get()!==key)throw new DOMException('중단','AbortError');
        overrides.clear();
        if(saved&&typeof saved==='object')Object.entries(saved).forEach(([groupKey,value])=>{const clean=C.cleanSettings(value);if(clean)overrides.set(groupKey,clean);});
      }catch(e){if(e.name==='AbortError')throw e;cacheFailed=true;}
      const paced=C.pacedRequest((path,params)=>api(key,request.signal,path,params),{signal:request.signal,onRetry:(ms,attempt)=>status('API 호출 제한으로 '+Math.ceil(ms/1000)+'초 대기 후 같은 페이지를 다시 조회합니다. ('+attempt+'/3)')});
      const loaded=await C.fetchHistory(paced,from,to,(done,total,count)=>status(done+' / '+total+'일 확인 중 · '+fmt(count)+'건 · 저장된 날짜는 API 요청 생략'),{
        cache,signal:request.signal,newestFirst:true,
        refreshFrom:new Date(Date.parse(kstToday())-86400000).toISOString().slice(0,10),
        onCacheError:()=>{cacheFailed=true;},
        onCacheReady:()=>{cacheReady=true;if(!request.signal.aborted&&NexonKey.get()===key&&completedDays.size)showPartial();},
        onDay:(date,records,stale)=>{
          completedDays.set(date,{records,stale});
          if(cacheReady&&!request.signal.aborted&&NexonKey.get()===key&&!$('historyDetail').open&&Date.now()-lastPreview>1000){showPartial();lastPreview=Date.now();}
        }
      });
      if(request.signal.aborted||NexonKey.get()!==key)throw new DOMException('중단','AbortError');
      rows=loaded;coverage='complete';renderGroups(true);
      $('historyCoverage').textContent=from+' ~ '+to+' · 전체 기간 조회 완료';
      status('조회 완료'+(cacheFailed?' · 브라우저 저장 실패':''));
    }catch(e){
      if(controller!==request||NexonKey.get()!==key)return;
      let message=e.name==='AbortError'?'조회를 중단했습니다.':e instanceof TypeError?'네트워크 연결을 확인하고 다시 조회하세요.':e.message;
      if(NexonKey.get()===key&&completedDays.size){
        showPartial();
        message+=' 현재 '+completedDays.size+' / '+C.days(from,to).length+'일의 부분 기록만 표시합니다. 전체 기간 합계가 아닙니다.';
        if([...completedDays.values()].some(day=>day.stale))message+=' 최신 갱신에 실패한 저장 기록이 포함되어 있습니다.';
      }
      message+=cacheFailed?' 브라우저 저장에 실패해 다시 요청할 수 있습니다.':' 완료한 날짜는 저장되어 다음 조회에서 이어집니다.';
      status(message,true);
    }
    finally{cache?.close();if(controller===request){controller=null;$('historyFetch').disabled=false;$('historyCancel').hidden=true;}}
  });
  $('historyCancel').addEventListener('click',()=>controller&&controller.abort());
  $('detailClose').addEventListener('click',()=>$('historyDetail').close());
  $('historyDetail').addEventListener('close',()=>{if(detailTrigger){detailTrigger.setAttribute('aria-pressed','false');if(detailTrigger.isConnected)detailTrigger.focus();}});
  $('costUpdate').addEventListener('click',async()=>{
    if(!selected)return;
    const value=C.cleanSettings({level:Number($('itemLevel').value),mvp:Number($('itemMvp').value),pcRoom:$('itemPc').checked,spare:Number($('itemSpare').value)});
    if(!value){$('analysisResult').textContent='장비 레벨은 1~300, 대체 장비값은 0 이상의 정수로 입력하세요.';return;}
    const key=NexonKey.get(),groupKey=selected.key;
    overrides.set(groupKey,value);
    attemptCache.clear();
    fillCard(detailTrigger,selected);costSummary();refreshOverview();renderRows();
    $('analysisResult').textContent='카드와 전체 합계에 비용 수정을 반영했습니다. 저장 중입니다.';
    let cache;const snapshot=Object.fromEntries(overrides);$('costUpdate').disabled=true;
    try{cache=await StarforceHistoryCache.open(key);await cache.setSettings(snapshot);if(selected?.key===groupKey&&NexonKey.get()===key)$('analysisResult').textContent='카드와 전체 합계에 반영하고 저장했습니다. 같은 이름 장비의 전체 기록에 적용됩니다.';}
    catch(e){if(selected?.key===groupKey&&NexonKey.get()===key)$('analysisResult').textContent='합계에 반영했지만 설정 저장에 실패했습니다. 새로고침하면 다시 입력해야 합니다.';}
    finally{cache?.close();$('costUpdate').disabled=false;}
  });
  $('sessionSelect').addEventListener('change',()=>{
    const value=$('sessionSelect').value,range=value==='all'?[1,selected.rows.length]:value.split(':').map(Number);
    $('rangeFrom').value=range[0];$('rangeTo').value=range[1];applyRange();
  });
  [['historyWorld','world',selectedWorlds],['historyCharacterSelect','character',selectedCharacters]].forEach(([id,kind,selection])=>{
    $(id).addEventListener('change',event=>{
      if(event.target.type!=='checkbox')return;
      const keys=kind==='world'?availableWorlds:availableCharacters;
      const setAll=value=>{if(kind==='world')allWorlds=value;else allCharacters=value;};
      if(event.target.hasAttribute('data-select-all')){selection.clear();setAll(event.target.checked);}
      else{
        if(kind==='world'?allWorlds:allCharacters){selection.clear();keys.forEach(key=>selection.add(key));setAll(false);}
        if(event.target.checked)selection.add(event.target.value);else selection.delete(event.target.value);
        if(keys.length&&keys.every(key=>selection.has(key))){selection.clear();setAll(true);}
      }
      renderCharacterFilters();if(rows.length)renderGroups();
    });
    $(id).addEventListener('toggle',()=>{if($(id).open)$(['historyWorld','historyCharacterSelect'].find(other=>other!==id)).open=false;});
  });
  document.addEventListener('click',event=>{['historyWorld','historyCharacterSelect'].forEach(id=>{if(!$(id).contains(event.target))$(id).open=false;});});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')['historyWorld','historyCharacterSelect'].forEach(id=>$(id).open=false);});
  $('historyCharactersRefresh').addEventListener('click',loadCharacters);
  $('rangeApply').addEventListener('click',applyRange);
  ['rangeFrom','rangeTo'].forEach(id=>$(id).addEventListener('input',()=>{if(selected){resetComparison();costSummary();$('analysisConfirmed').checked=false;$('analysisResult').textContent='순번이 바뀌었습니다. 구간 적용을 눌러 주세요.';}}));
  $('analysisForm').addEventListener('submit',analyze);
  $('analysisForm').addEventListener('input',()=>{if(selected){resetComparison();costSummary();$('analysisResult').textContent='조건이 바뀌었습니다. 선택 구간 분석을 눌러 다시 계산하세요.';}});
  $('rowsPrev').addEventListener('click',()=>{page--;renderRows();});$('rowsNext').addEventListener('click',()=>{page++;renderRows();});
  function autoLoad(){if(NexonKey.has()&&!controller){fullPeriod();$('historyQuery').requestSubmit();}}
  function keyChanged(){
    const key=NexonKey.get();if(key===activeKey)return;activeKey=key;
    if(controller)controller.abort();controller=null;
    if($('historyDetail').open)$('historyDetail').close();overrides.clear();attemptCache.clear();rows=[];groups=[];selectedRows=[];selected=null;selectedWorlds.clear();selectedCharacters.clear();allWorlds=allCharacters=true;$('historyResults').hidden=true;refreshKey();loadCharacters();
    $('historyFetch').disabled=false;$('historyCancel').hidden=true;
    status(key?'새 계정 기록을 불러옵니다.':'홈에서 본인 API 키를 등록해 주세요.');autoLoad();
  }
  window.addEventListener('storage',event=>{if(event.key===NexonKey.STORAGE_KEY||event.key===null)keyChanged();});
  window.addEventListener('nexon-key-changed',keyChanged);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',autoLoad,{once:true});else autoLoad();
})();
