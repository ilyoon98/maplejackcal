(function () {
  'use strict';
  const C = window.StarforceHistoryCore, $ = id => document.getElementById(id);
  let rows = [], groups = [], selected = null, selectedRows = [], page = 0, controller = null, appliedFrom = 1, appliedTo = 1;
  const overrides = new Map();
  let detailTrigger=null;
  const fmt = n => Math.round(n).toLocaleString('ko-KR');
  const meso = n => Math.abs(n) >= 1e8 ? (n/1e8).toLocaleString('ko-KR',{maximumFractionDigits:2})+'억 메소' : fmt(n)+' 메소';
  function kstToday() { return new Date(Date.now()+9*3600000).toISOString().slice(0,10); }
  function earliest() { const d = new Date(kstToday()); d.setUTCFullYear(d.getUTCFullYear()-2); return d.toISOString().slice(0,10); }
  function status(message, error) { $('historyStatus').textContent = message; $('historyStatus').classList.toggle('error',!!error); }
  function refreshKey() { $('keyState').textContent = NexonKey.has() ? '기존 API 키 연결됨' : '홈에서 본인 API 키를 등록해 주세요.'; }
  function addText(parent, tag, text) { const el=document.createElement(tag); el.textContent=text; parent.append(el); return el; }
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
    let total=0, covered=0;
    groups.forEach(g => { const e=groupCost(g); total+=e.cost;covered+=e.count; });
    $('costSummary').textContent = '추정 강화비 '+meso(total)+' · '+fmt(covered)+' / '+fmt(groups.reduce((n,g)=>n+g.rows.length,0))+'회 반영 · 기록의 이벤트·파괴방지 자동 적용, 현재 단가 기준. 복구·재구입비 제외.';
  }
  function settings(g){return overrides.get(g.key)||{level:C.itemLevel(g.name),mvp:0,pcRoom:false};}
  function equipmentLabel(g){
    const info=C.itemInfo(g.name),level=settings(g).level;
    const label=level?'Lv. '+level+(!info&&!overrides.has(g.key)?' (이름 기준 추정)':''):'레벨 미확인';
    return [label,info?.slot,info?.set].filter(Boolean).join(' · ');
  }
  function groupCost(g,list=g.rows){
    const options=settings(g);let cost=0,count=0;
    list.forEach(row=>{const value=C.recordCost(row,options.level,StarforceData,options);if(value!==null){cost+=value;count++;}});
    return {cost,count};
  }
  function fillCard(button,g){
    button.replaceChildren();const totals=groupCost(g),first=g.rows[0],last=g.rows.at(-1);
    const success=g.rows.filter(r=>!C.destroyed(r)&&r.after_starforce_count>r.before_starforce_count).length,broken=g.rows.filter(C.destroyed).length;
    addText(button,'strong',g.name);
    addText(button,'span',equipmentLabel(g)).className='history-level';
    addText(button,'small',[g.world,g.character].filter(Boolean).join(' · '));
    addText(button,'span','★ '+first.before_starforce_count+' → '+(C.destroyed(last)?'파괴':last.after_starforce_count)).className='history-card-stars';
    addText(button,'b',totals.count?meso(totals.cost):settings(g).level?'비용 확인 필요':'장비 레벨 확인 필요').className='history-card-cost';
    renderCounts(button,g.rows);
    addText(button,'small',first.date_create.slice(0,10)+' ~ '+last.date_create.slice(0,10));
    addText(button,'small',totals.count===g.rows.length?'이벤트 반영 추정 비용 · 상세보기 →':totals.count+'/'+g.rows.length+'회 비용 반영 · 상세보기 →');
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
    $('itemOverview').textContent=fmt(selectedRows.length)+'회 · 추정 강화비 '+meso(totals.cost)+(totals.count!==selectedRows.length?'\n비용 확인 필요 '+(selectedRows.length-totals.count)+'회':'')+'\n현재 단가 · 이벤트·파괴방지 자동 반영 · 복구·재구입비 제외';
    renderCounts($('itemOverview'),selectedRows);
    $('itemSubtitle').textContent=[selected.world,selected.character,equipmentLabel(selected),selected.rows[0].date_create.slice(0,10)+' ~ '+selected.rows.at(-1).date_create.slice(0,10)].filter(Boolean).join(' · ');
    $('itemEvents').replaceChildren();
    const labels=new Set();
    selectedRows.forEach(r=>{
      if(C.active(r.destroy_defence))labels.add('파괴방지');
      (r.starforce_event_list||[]).forEach(e=>{
        [['cost_discount_rate','비용 할인'],['destroy_decrease_rate','파괴확률 감소'],['success_rate','성공확률'],['recovery_cost_discount_rate','복구 할인']].forEach(([key,label])=>{if(e[key]&&C.eventPercent(e[key])!==0)labels.add(label+' '+String(e[key])+(String(e[key]).includes('%')?'':'%')+(e.starforce_event_range?' · '+e.starforce_event_range+'성':''));});
        if(Number(e.plus_value)>0)labels.add('추가 '+e.plus_value+'성');
      });
    });
    if(!labels.size)labels.add('기록된 이벤트 없음');
    labels.forEach(label=>addText($('itemEvents'),'span',label));
  }
  function renderGroups() {
    groups=C.grouped(rows,$('historyName').value.trim());
    $('historyResults').hidden=false;
    $('historyItems').replaceChildren();
    if($('historyDetail').open)$('historyDetail').close();
    selected=null;
    const filtered=groups.flatMap(g=>g.rows);
    $('totalTries').textContent=fmt(filtered.length)+'회';
    $('totalDestroy').textContent=fmt(filtered.filter(C.destroyed).length)+'회';
    $('totalItems').textContent=fmt(groups.length)+'개';
    groups.forEach(g => {
      const button=document.createElement('button'); button.type='button'; button.setAttribute('aria-pressed','false');
      button.setAttribute('aria-haspopup','dialog');fillCard(button,g);
      button.addEventListener('click',()=>selectGroup(g,button)); $('historyItems').append(button);
    });
    if(!groups.length) addText($('historyItems'),'p','선택한 캐릭터와 기간에 기록이 없습니다. 닉네임을 비워 계정 전체 기록을 확인할 수 있습니다.');
    costSummary();
  }
  function selectGroup(group,button) {
    selected=group;detailTrigger=button;
    $('historyItems').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    $('itemTitle').textContent=group.name;
    $('itemSubtitle').textContent=[group.world,group.character,group.rows[0].date_create.slice(0,10)+' ~ '+group.rows.at(-1).date_create.slice(0,10)].filter(Boolean).join(' · ');
    $('rangeFrom').value=1; $('rangeTo').value=group.rows.length;
    $('rangeFrom').max=$('rangeTo').max=group.rows.length;
    $('analysisForm').reset();
    const saved=settings(group);$('itemLevel').value=saved.level||'';$('itemMvp').value=saved.mvp||0;$('itemPc').checked=!!saved.pcRoom;
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
      [String(offset+page*100+i+1),r.date_create.replace('T',' ').slice(0,19),r.before_starforce_count+' → '+(C.destroyed(r)?'✕':r.after_starforce_count),r.item_upgrade_result,cost===null?'확인 필요':meso(cost)].forEach(t=>addText(tr,'td',t));
      tr.children[3].className='history-outcome '+(C.destroyed(r)?'destroy':r.after_starforce_count>r.before_starforce_count?'success':'failure');body.append(tr);
    });
    $('rowsPage').textContent=(page+1)+' / '+Math.max(1,Math.ceil(selectedRows.length/100));
    $('rowsPrev').disabled=page===0;$('rowsNext').disabled=(page+1)*100>=selectedRows.length;
  }
  function analyze(event) {
    event.preventDefault(); if(!selectedRows.length) return;
    const out=$('analysisResult');
    if(Number($('rangeFrom').value)!==appliedFrom||Number($('rangeTo').value)!==appliedTo){out.textContent='변경한 순번의 구간 적용을 먼저 눌러 주세요.';return;}
    const issue=C.pathIssue(selectedRows);
    if(issue){out.textContent=issue;return;}
    const signatures=new Set(selectedRows.map(r=>JSON.stringify(r.starforce_event_list||[])));
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
      if(cdf!==null)text+='\n같은 조건에서 '+fmt(selectedRows.length)+'회까지 목표에 도달하지 못할 확률 '+((1-cdf)*100).toFixed(2)+'%';
    } else {
      const used=selectedRows.slice(0,hit+1),actual=costOf(used),delta=result.total.meso-actual;
      const cdf=C.countCDF(steps,opts.start,opts.goal,used.length);
      text+='최초 '+opts.goal+'성 달성까지 '+fmt(used.length)+'회 / '+meso(actual)+'\n';
      text+='동일 조건 기대 '+result.total.tries.toLocaleString('ko-KR',{maximumFractionDigits:1})+'회 / '+meso(result.total.meso)+'\n';
      text+='기대비용 대비 '+meso(Math.abs(delta))+(delta>=0?' 절약':' 초과')+'\n';
      text+=cdf===null?'횟수가 많아 상위 확률 계산을 생략했습니다.': '횟수 기준 운 상위 '+(cdf*100<0.01?'<0.01':(cdf*100).toFixed(2))+'% · '+fmt(used.length)+'회 이내 달성 확률';
      if(used.length<selectedRows.length)text+='\n목표 달성 이후 '+fmt(selectedRows.length-used.length)+'회는 전체 환산 비용에만 포함합니다.';
    }
    text+='\n현재 확률·단가와 선택 조건으로 환산한 비교이며 실제 지출·거래 손익·전체 유저 순위가 아닙니다.';
    out.textContent=text;
  }
  $('historyFrom').value=$('historyTo').value=kstToday();
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
  try {
    const saved=JSON.parse(localStorage.getItem('boss_income_state')||'{}');
    (Array.isArray(saved.characters)?saved.characters:[]).forEach(ch=>{if(typeof ch.name==='string'&&ch.name){const option=document.createElement('option');option.value=ch.name;$('historyCharacters').append(option);}});
  } catch(e) { /* Manual nickname entry remains available. */ }
  $('historyQuery').addEventListener('submit',async event=>{
    event.preventDefault();if(controller)return;
    if(!NexonKey.has()){status('홈에서 본인 API 키를 먼저 등록하세요.',true);return;}
    const from=$('historyFrom').value,to=$('historyTo').value;
    try{C.days(from,to);if(from<earliest()||to>kstToday())throw new Error('최근 2년 이내의 날짜를 선택하세요.');}catch(e){status(e.message,true);return;}
    const request=new AbortController();controller=request;
    const key=NexonKey.get();
    rows=[];groups=[];selected=null;selectedRows=[];$('historyResults').hidden=true;
    $('historyFetch').disabled=true;$('historyCancel').hidden=false;
    status('기록을 불러오는 중입니다.');
    try{
      const paced=C.pacedRequest((path,params)=>api(key,request.signal,path,params),{signal:request.signal,onRetry:(ms,attempt)=>status('API 호출 제한으로 '+Math.ceil(ms/1000)+'초 대기 후 같은 페이지를 다시 조회합니다. ('+attempt+'/3)')});
      const loaded=await C.fetchHistory(paced,from,to,(done,total,count)=>status(done+' / '+total+'일 조회 중 · '+fmt(count)+'건 수신'));
      if(request.signal.aborted||NexonKey.get()!==key)throw new DOMException('중단','AbortError');
      rows=loaded;renderGroups();
      status(from+' ~ '+to+' · 계정 기록 '+fmt(rows.length)+'건 조회 완료. 닉네임을 바꾸면 다시 요청하지 않고 필터링합니다.');
    }catch(e){status(e.name==='AbortError'?'조회를 중단했습니다. 부분 기록은 분석하지 않습니다.':e instanceof TypeError?'네트워크 연결을 확인하고 다시 조회하세요.':e.message,true);}
    finally{controller=null;$('historyFetch').disabled=false;$('historyCancel').hidden=true;}
  });
  $('historyCancel').addEventListener('click',()=>controller&&controller.abort());
  $('detailClose').addEventListener('click',()=>$('historyDetail').close());
  $('historyDetail').addEventListener('close',()=>{if(detailTrigger){detailTrigger.setAttribute('aria-pressed','false');if(detailTrigger.isConnected)detailTrigger.focus();}});
  $('costUpdate').addEventListener('click',()=>{
    const level=Number($('itemLevel').value);if(!Number.isInteger(level)||level<1||level>300){$('analysisResult').textContent='장비 레벨을 1~300 사이로 입력하세요.';return;}
    overrides.set(selected.key,{level,mvp:Number($('itemMvp').value),pcRoom:$('itemPc').checked});
    fillCard(detailTrigger,selected);costSummary();refreshOverview();renderRows();
    $('analysisResult').textContent='카드와 전체 합계에 비용 수정을 반영했습니다.';
  });
  $('historyName').addEventListener('input',()=>{if(rows.length)renderGroups();});
  $('rangeApply').addEventListener('click',applyRange);
  ['rangeFrom','rangeTo'].forEach(id=>$(id).addEventListener('input',()=>{if(selected){costSummary();$('analysisConfirmed').checked=false;$('analysisResult').textContent='순번이 바뀌었습니다. 구간 적용을 눌러 주세요.';}}));
  $('analysisForm').addEventListener('submit',analyze);
  $('analysisForm').addEventListener('input',()=>{if(selected){costSummary();$('analysisResult').textContent='조건이 바뀌었습니다. 선택 구간 분석을 눌러 다시 계산하세요.';}});
  $('rowsPrev').addEventListener('click',()=>{page--;renderRows();});$('rowsNext').addEventListener('click',()=>{page++;renderRows();});
  window.addEventListener('storage',event=>{if(event.key===NexonKey.STORAGE_KEY||event.key===null){if(controller)controller.abort();if($('historyDetail').open)$('historyDetail').close();overrides.clear();rows=[];groups=[];selectedRows=[];selected=null;$('historyResults').hidden=true;refreshKey();status('API 키가 변경되었습니다. 기록을 다시 조회하세요.');}});
})();
