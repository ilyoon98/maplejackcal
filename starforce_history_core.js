/* Read-only account history with an optional completed-day cache adapter. */
(function (root) {
  'use strict';
  const equipment = typeof module !== 'undefined' && module.exports ? require('./equipment_data.json') : root.EquipmentData;
  const equipmentIndex = new Map();
  const equipmentKey = name => typeof name === 'string' ? name.normalize('NFC').replace(/\s+/g, '').toLowerCase() : '';
  for (const item of equipment?.items || []) {
    for (const name of [item.name, ...item.aliases]) equipmentIndex.set(equipmentKey(name), item);
  }
  function itemInfo(name) {
    const exact=equipmentIndex.get(equipmentKey(name));if(exact)return exact;
    if(typeof name!=='string')return null;
    const family=(equipment?.families||[]).find(f=>name.trim().startsWith(f.prefix));
    return family?{...family,name:name.trim(),inferred:true}:null;
  }
  function day(value) { return typeof value === 'string' ? value.slice(0, 10) : ''; }
  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }
  function days(from, to) {
    if (!validDate(from) || !validDate(to) || from > to) throw new Error('조회 시작일과 종료일을 확인하세요.');
    const count = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
    if (count > 732) throw new Error('조회 기간은 최대 2년 이내로 선택하세요.');
    return Array.from({length:count}, (_, i) => new Date(Date.parse(from) + i * 86400000).toISOString().slice(0,10));
  }
  function normalize(rows, from, to) {
    const seen = new Set();
    return rows.filter(r => {
      if (!r || typeof r.id !== 'string' || !r.id) throw new Error('강화 기록의 식별자를 읽을 수 없습니다.');
      if (seen.has(r.id)) return false;
      const date = day(r.date_create);
      if (!validDate(date)) throw new Error('강화 기록의 날짜를 읽을 수 없습니다.');
      if (date < from || date > to) return false;
      if (!Number.isInteger(r.before_starforce_count) || !Number.isInteger(r.after_starforce_count) ||
          r.before_starforce_count < 0 || r.before_starforce_count > 30 || r.after_starforce_count < 0 || r.after_starforce_count > 30 ||
          typeof r.target_item !== 'string' || typeof r.character_name !== 'string' || typeof r.item_upgrade_result !== 'string') throw new Error('강화 기록의 형식이 예상과 다릅니다.');
      seen.add(r.id); return true;
    }).sort((a,b) => a.date_create.localeCompare(b.date_create));
  }
  function grouped(rows, name, world='') {
    const groups = new Map();
    rows.filter(r => (!name || r.character_name.toLocaleLowerCase() === name.toLocaleLowerCase())&&(!world||r.world_name===world)).forEach(r => {
      const key = JSON.stringify([r.world_name || '', r.character_name, r.target_item]);
      if (!groups.has(key)) groups.set(key, {key, name:r.target_item, character:r.character_name, world:r.world_name || '', rows:[]});
      groups.get(key).rows.push(r);
    });
    return [...groups.values()].sort((a,b) => b.rows.length - a.rows.length);
  }
  function destroyed(row) { return /파괴|destroy/i.test(row.item_upgrade_result); }
  function specialCurrency(row) {
    const value=String(row.upgrade_item||'').trim();
    return !!value&&!/^(없음|미사용|미적용|메소|-)$/i.test(value);
  }
  function currencyRows(rows,mode='all') {
    if(mode==='all')return rows;
    let gap=false;
    return rows.flatMap(row=>{
      const keep=mode==='special'?specialCurrency(row):!specialCurrency(row);
      if(!keep){gap=true;return [];}
      const out=gap?{...row,history_gap_before:true}:row;gap=false;return [out];
    });
  }
  function active(value) { return value === true || /^(1|true|yes|성공|적용|사용|발동)$/i.test(String(value || '').trim()); }
  function itemLevel(name) {
    const info = itemInfo(name);
    if (info) return info.level;
    if (typeof name !== 'string') return null;
    for(const [prefix,level] of [['에테르넬 ',250],['아케인셰이드 ',200],['앱솔랩스 ',160],['파프니르 ',150]])if(name.startsWith(prefix))return level;
    return null;
  }
  function eventPercent(value) {
    if(value===undefined||value===null||value==='')return 0;
    const match=String(value).trim().match(/^(\d+(?:\.\d+)?)\s*%?$/);
    if(!match||Number(match[1])>100)return null;
    return Number(match[1])/100;
  }
  function inEventRange(value,star) {
    if(!value||/^(전체|전 구간|all)$/i.test(String(value).trim()))return true;
    const text=String(value).replace(/성|\s|\[|\]/g,'');
    let m=text.match(/^(\d+)[~\-～](\d+)$/);
    if(m)return star>=Number(m[1])&&star<=Number(m[2]);
    m=text.match(/^(\d+)(이하|미만|이상|초과)$/);
    if(m)return m[2]==='이하'?star<=+m[1]:m[2]==='미만'?star<+m[1]:m[2]==='이상'?star>=+m[1]:star>+m[1];
    if(/^\d+(?:[,·/]\d+)*$/.test(text))return text.split(/[,·/]/).some(n=>Number(n)===star);
    return null;
  }
  function recordModifiers(row) {
    let discount=0,destroyDown=0,success=0,plus=0;
    if(row.starforce_event_list!=null&&!Array.isArray(row.starforce_event_list))return null;
    for(const event of row.starforce_event_list||[]) {
      if(!event||typeof event!=='object'||Array.isArray(event))return null;
      const applies=inEventRange(event.starforce_event_range,row.before_starforce_count);
      if(applies===null)return null;
      if(!applies)continue;
      const cost=eventPercent(event.cost_discount_rate),destroy=eventPercent(event.destroy_decrease_rate),p=eventPercent(event.success_rate);
      const extra=event.plus_value==null||event.plus_value===''?0:Number(event.plus_value);
      if(cost===null||destroy===null||p===null||!Number.isFinite(extra))return null;
      discount=Math.max(discount,cost);destroyDown=Math.max(destroyDown,destroy);success=Math.max(success,p);plus=Math.max(plus,extra);
    }
    return {discount,destroyDown,success,plus,guard:active(row.destroy_defence)};
  }
  function costIssue(row,level,data) {
    if(!Number.isInteger(level)||level<1||level>300)return '장비 레벨 미확인';
    if(row.before_starforce_count>=30)return '30성 이상 강화';
    if(active(row.superior_item_flag))return '슈페리얼 장비';
    if(active(row.protect_shield))return '프로텍트 실드 사용';
    if(specialCurrency(row))return '특수 강화 재화 사용';
    if(!recordModifiers(row))return '이벤트 조건 해석 필요';
    if(active(row.destroy_defence)&&!data.PROTECT_STARS.includes(row.before_starforce_count))return '파괴방지 구간 확인 필요';
    return '';
  }
  function recordCost(row,level,data,options={}) {
    if(costIssue(row,level,data))return null;
    const modifiers=recordModifiers(row);
    const star=row.before_starforce_count,base=data.baseCost(star,level);
    const personal=star<17?(options.mvp||0)+(options.pcRoom?.05:0):0;
    const guard=modifiers.guard && data.PROTECT_STARS.includes(star)?data.PROTECT_COST_MULTIPLIER-1:0;
    if(modifiers.guard&&!data.PROTECT_STARS.includes(star))return null;
    // Match the calculator's discount order before rounding half-meso values.
    let rate=1-personal;rate-=modifiers.discount;
    return Math.round(base*Math.max(0,rate)+base*guard);
  }
  function costTotals(rows,level,data,options={}) {
    let cost=0,count=0,spareCost=0,unpricedDestroy=0;
    const reasons={};
    const spare=Number.isSafeInteger(options.spare)&&options.spare>0?options.spare:0;
    for(const row of rows){
      const issue=costIssue(row,level,data);
      if(issue)reasons[issue]=(reasons[issue]||0)+1;
      else {cost+=recordCost(row,level,data,options);count++;}
      if(destroyed(row)){if(spare)spareCost+=spare;else unpricedDestroy++;}
    }
    return {cost,count,spareCost,unpricedDestroy,reasons,total:cost+spareCost};
  }
  function cleanSettings(value) {
    if(!value||!Number.isInteger(value.level)||value.level<1||value.level>300||![0,.03,.05,.1].includes(value.mvp)||typeof value.pcRoom!=='boolean'||!Number.isSafeInteger(value.spare)||value.spare<0)return null;
    return {level:value.level,mvp:value.mvp,pcRoom:value.pcRoom,spare:value.spare};
  }
  function eventSignature(row) {
    const events=row.starforce_event_list;
    if(events!=null&&!Array.isArray(events))return 'invalid';
    if((events||[]).some(e=>!e||typeof e!=='object'||Array.isArray(e)))return 'invalid';
    return JSON.stringify((events||[]).map(e=>JSON.stringify(Object.keys(e).sort().map(k=>[k,e[k]]))).sort());
  }
  // KMS 2026-03-19: Star Catch was removed, its bonus became permanent,
  // and history/starforce now returns null for starcatch_result.
  // Source: https://maplestory.nexon.com/news/update/799
  function automaticStarcatch(row) {
    const date=day(row.date_create);
    return row.starcatch_result===null&&validDate(date)&&date>='2026-03-19';
  }
  function starcatchApplied(row) { return active(row.starcatch_result)||automaticStarcatch(row); }
  function starcatchState(row) {
    if(starcatchApplied(row))return true;
    if(row.starcatch_result===false||/^(0|false|no|실패|미적용|미사용|해제)$/i.test(String(row.starcatch_result??'').trim()))return false;
    return null;
  }
  function starcatchLabel(row) {
    return automaticStarcatch(row)?'확률 보정 자동 적용 (개편 이후)':row.starcatch_result||'미확인';
  }
  function starcatchIssue(rows) {
    if(rows.some(r=>!starcatchApplied(r)))return '스타캐치 성공이 확인되지 않은 기록이 포함되어 있습니다. 개편 이전 기록은 스타캐치 성공을 확인해야 하며, 2026-03-19 이후 null 기록은 확률 보정이 자동 적용됩니다.';
    return '';
  }
  // Suggestions only: the API has no unique equipment ID.
  function sessions(rows) {
    const out=[];let guards={};
    rows.forEach((r,i)=>{
      const prev=rows[i-1];let reason='전체 시작';
      if(prev){
        reason='';
        if(r.history_gap_before)reason='필터로 제외된 기록';
        else if(specialCurrency(r)!==specialCurrency(prev)||specialCurrency(r)&&r.upgrade_item!==prev.upgrade_item)reason='강화 재화 변경';
        else if(r.before_starforce_count!==(destroyed(prev)?12:prev.after_starforce_count))reason='별 흐름 단절';
        else if(eventSignature(r)!==eventSignature(prev))reason='이벤트 변경';
        else if(starcatchApplied(r)!==starcatchApplied(prev))reason='스타캐치 조건 변경';
        else if(r.before_starforce_count in guards&&guards[r.before_starforce_count]!==active(r.destroy_defence))reason='파괴방지 조건 변경';
      }
      if(reason){out.push({from:i+1,to:i+1,reason});guards={};}
      else out.at(-1).to=i+1;
      guards[r.before_starforce_count]=active(r.destroy_defence);
    });
    return out;
  }
  // Exact first-passage CDF for the existing calculator's success / stay / destroy model.
  function countCDF(steps, start, goal, attempts) {
    if (!Number.isInteger(start) || !Number.isInteger(goal) || start < 0 || goal > steps.length || start >= goal || !Number.isInteger(attempts) || attempts < 0 || attempts > 20000) return null;
    let mass = new Float64Array(goal); mass[start] = 1;
    let finished = 0;
    for (let t = 0; t < attempts; t++) {
      const next = new Float64Array(goal);
      for (let s = 0; s < goal; s++) {
        const {p,d} = steps[s];
        if (!Number.isFinite(p) || !Number.isFinite(d) || p < 0 || d < 0 || p+d > 1+1e-12 || (d > 0 && goal <= 12)) return null;
        if (s + 1 >= goal) finished += mass[s]*p; else next[s+1] += mass[s]*p;
        next[s] += mass[s] * Math.max(0,1-p-d);
        if (d) next[12] += mass[s]*d;
      }
      mass = next;
    }
    return Math.min(1, Math.max(0, finished));
  }
  function pathIssue(rows) {
    for (let i=0;i<rows.length;i++) {
      const r = rows[i], before=r.before_starforce_count, after=r.after_starforce_count;
      if(specialCurrency(r))return '특수 강화 재화 기록은 메소 손익 분석에서 제외합니다.';
      if(i&&r.history_gap_before)return '필터로 제외된 기록이 사이에 있습니다. 연속 강화 구간을 나눠 분석하세요.';
      if (active(r.superior_item_flag) || active(r.chance_time) || active(r.event_field_flag) || active(r.protect_shield) || /펄스|pulse/i.test(r.upgrade_item || '')) return '특수 강화 기록은 현재 분석 모델에서 지원하지 않습니다.';
      if (before >= 30 || (!destroyed(r) && after !== before && after !== before+1)) return '하락·다중 성 상승·특수 복구가 포함된 구간은 현재 모델로 분석할 수 없습니다.';
      if (i && before !== (destroyed(rows[i-1]) ? 12 : rows[i-1].after_starforce_count)) return '별의 흐름이 이어지지 않습니다. 장비가 섞였거나 복구·누락 기록이 있는지 확인하고 구간을 나눠 주세요.';
    }
    return '';
  }
  // Each attempt is priced under its recorded event and current-star safeguard.
  // Other stars use the baseline (no safeguard) policy for the recovery reference.
  function attemptComparison(row,options,data,calculate,cache=new Map()) {
    const starcatch=starcatchState(row);
    const issue=pathIssue([row])||(starcatch===null?'스타캐치 적용 여부 미확인 (비용 입력과 별개)':'')||costIssue(row,options.level,data);
    if(issue)return {status:'excluded',reason:issue};
    const eventKey='event:'+eventSignature(row);
    let template=cache.get(eventKey);
    if(!template){
      const events=row.starforce_event_list||[];
      const discount30=events.some(e=>eventPercent(e.cost_discount_rate)===.3),lucky5=events.some(e=>eventPercent(e.success_rate)===1),destroyDown30=events.some(e=>eventPercent(e.destroy_decrease_rate)===.3);
      template={discount30,lucky5,destroyDown30,eventModifiers:[]};
      for(let star=0;star<30;star++){
        const m=recordModifiers({...row,before_starforce_count:star});
        if(!m||m.plus||(m.success!==0&&m.success!==1)){template={reason:'이벤트 확률·추가 별 조건 해석 필요'};break;}
        template.eventModifiers.push({discount:m.discount,destroyDown:m.destroyDown,success:m.success});
      }
      cache.set(eventKey,template);
    }
    if(template.reason)return {status:'excluded',reason:template.reason};
    const {discount30,lucky5,destroyDown30,eventModifiers}=template;
    const star=row.before_starforce_count;
    const opts={level:options.level,spare:options.spare||0,mvp:options.mvp||0,pcRoom:!!options.pcRoom,start:0,goal:30,starcatch,discount30,lucky5,destroyDown30,eventModifiers,safeguard:active(row.destroy_defence)?{[star]:true}:{},recoveryMode:'off'};
    const key=JSON.stringify(opts);
    let result=cache.get(key);
    if(!result){result=calculate(opts);cache.set(key,result);}
    const step=result.steps[star];
    if(destroyed(row)&&step.d===0||!destroyed(row)&&row.after_starforce_count===star&&step.p===1)return {status:'excluded',reason:'기록과 강화 조건 불일치'};
    let reference=0;
    if(destroyed(row))for(let s=12;s<star;s++)reference-=result.rows[s].meso;
    else if(row.after_starforce_count===star+1)reference=result.rows[star].meso;
    const cost=recordCost(row,options.level,data,options),spareCost=destroyed(row)?opts.spare:0,actual=cost+spareCost;
    return {status:'complete',expected:result.rows[star].meso,reference,actual,cost,spareCost,delta:reference-actual};
  }
  function aggregateAttempts(groups,settings,data,calculate,cache=new Map()) {
    const out={actual:0,reference:0,delta:0,gains:0,losses:0,records:0,excludedRecords:0,reasons:{},entries:[]};
    for(const group of groups){
      const entry={key:group.key,name:group.name,character:group.character,world:group.world,actual:0,reference:0,delta:0,records:0,excluded:0};
      const options=settings(group);
      for(const row of group.rows){
        const value=attemptComparison(row,options,data,calculate,cache);
        if(value.status==='complete'){
          out.actual+=value.actual;out.reference+=value.reference;out.delta+=value.delta;out.gains+=Math.max(0,value.delta);out.losses+=Math.max(0,-value.delta);out.records++;
          entry.actual+=value.actual;entry.reference+=value.reference;entry.delta+=value.delta;entry.records++;
        }else{
          out.excludedRecords++;entry.excluded++;out.reasons[value.reason]=(out.reasons[value.reason]||0)+1;
        }
      }
      if(entry.records)out.entries.push(entry);
    }
    return out;
  }
  function abortableDelay(ms, signal) {
    return new Promise((resolve,reject) => {
      if(signal && signal.aborted) { reject(new DOMException('중단','AbortError')); return; }
      const abort = () => { clearTimeout(timer); signal.removeEventListener('abort',abort); reject(new DOMException('중단','AbortError')); };
      const timer = setTimeout(() => { if(signal)signal.removeEventListener('abort',abort); resolve(); },ms);
      if(signal)signal.addEventListener('abort',abort,{once:true});
    });
  }
  // Keep this page below the development key's 5 requests/second limit.
  // Other tabs/apps share the quota, so also back off after a 429.
  function pacedRequest(api, options={}) {
    const now=options.now || Date.now, wait=options.wait || abortableDelay;
    let lastStart=-Infinity;
    return async function(path,params) {
      for(let attempt=0;;attempt++) {
        if(options.signal && options.signal.aborted)throw new DOMException('중단','AbortError');
        const pause=Math.max(0,300-(now()-lastStart));
        if(pause)await wait(pause,options.signal);
        if(options.signal && options.signal.aborted)throw new DOMException('중단','AbortError');
        lastStart=now();
        try { return await api(path,params); }
        catch(error) {
          if((error.code!=='OPENAPI00007' && error.status!==429) || attempt>=3)throw error;
          const delay=Math.max(1000*2**attempt,Number(error.retryAfterMs)||0);
          // Do not automatically wait out a long or daily quota restriction.
          if(delay>30000)throw error;
          if(options.onRetry)options.onRetry(delay,attempt+1);
          await wait(delay,options.signal);
        }
      }
    };
  }
  async function fetchHistory(api, from, to, progress, options={}) {
    const dates = days(from,to), rows = [], cached=new Map();
    if(options.newestFirst)dates.reverse();
    const checkAbort=()=>{if(options.signal?.aborted)throw new DOMException('중단','AbortError');};
    // Load every available day first, so a failure on today's request does not hide older records.
    if(options.cache)for(const date of dates){
      checkAbort();
      let entry;
      try{entry=await options.cache.get(date);}catch(e){options.onCacheError?.();continue;}
      if(!entry||!Array.isArray(entry.rows))continue;
      let normalized;
      try{normalized=normalize(entry.rows,date,date);}catch(e){continue;}
      // A day fetched before its final five-minute API delay elapsed is not sealed forever.
      const settledAt=Date.parse(date+'T00:00:00+09:00')+86400000+300000;
      const validSavedAt=Number.isFinite(entry.savedAt)&&entry.savedAt<=Date.now();
      const age=Date.now()-entry.savedAt;
      const fresh=validSavedAt&&((date<options.refreshFrom&&entry.savedAt>=settledAt)||age<300000);
      cached.set(date,{rows:normalized,fresh});
      options.onDay?.(date,normalized,!fresh);
    }
    // Let the UI display all saved days together before making network requests.
    options.onCacheReady?.();
    for (let i=0;i<dates.length;i++) {
      checkAbort();
      if(cached.get(dates[i])?.fresh){
        rows.push(...cached.get(dates[i]).rows);
        if(rows.length>200000)throw new Error('기록이 너무 많습니다. 조회 기간을 줄여 주세요.');
        progress?.(i+1,dates.length,rows.length);
        continue;
      }
      const daily=[];
      let cursor = '', pages = 0;
      const cursors = new Set();
      do {
        const body = await api('/history/starforce', cursor ? {count:1000,cursor} : {count:1000,date:dates[i]});
        if (!body || !Array.isArray(body.starforce_history)) throw new Error('스타포스 기록 응답을 읽을 수 없습니다.');
        daily.push(...body.starforce_history);
        if (rows.length+daily.length > 200000) throw new Error('기록이 너무 많습니다. 조회 기간을 줄여 주세요.');
        cursor = body.next_cursor || '';
        if (typeof cursor !== 'string' || (cursor && cursors.has(cursor)) || ++pages > 1000) throw new Error('다음 기록을 불러오는 중 오류가 발생했습니다. 기간을 줄여 다시 조회하세요.');
        if (cursor) cursors.add(cursor);
        if (progress) progress(i+1, dates.length, rows.length+daily.length);
      } while(cursor);
      checkAbort();
      // Recent API responses may lag. Retain saved IDs, with newly fetched values taking priority.
      const completed=normalize([...daily,...(cached.get(dates[i])?.rows||[])],dates[i],dates[i]);
      rows.push(...completed);
      if(options.cache)try{await options.cache.set(dates[i],completed);}catch(e){options.onCacheError?.();}
      options.onDay?.(dates[i],completed,false);
    }
    return normalize(rows,from,to);
  }
  const core = {day,validDate,days,normalize,grouped,destroyed,active,countCDF,pathIssue,fetchHistory,abortableDelay,pacedRequest,itemInfo,itemLevel,eventPercent,inEventRange,recordModifiers,recordCost,costIssue,costTotals,cleanSettings,eventSignature,starcatchIssue,automaticStarcatch,starcatchApplied,starcatchLabel,sessions,specialCurrency,currencyRows,attemptComparison,aggregateAttempts};
  if (typeof module !== 'undefined' && module.exports) module.exports=core;
  else root.StarforceHistoryCore=core;
})(typeof window !== 'undefined' ? window : globalThis);
