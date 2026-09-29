/* Read-only account history. No credentials or history are persisted here. */
(function (root) {
  'use strict';
  const equipment = typeof module !== 'undefined' && module.exports ? require('./equipment_data.json') : root.EquipmentData;
  const equipmentIndex = new Map();
  const equipmentKey = name => typeof name === 'string' ? name.normalize('NFC').replace(/\s+/g, '').toLowerCase() : '';
  for (const item of equipment?.items || []) {
    for (const name of [item.name, ...item.aliases]) equipmentIndex.set(equipmentKey(name), item);
  }
  function itemInfo(name) { return equipmentIndex.get(equipmentKey(name)) || null; }
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
  function grouped(rows, name) {
    const groups = new Map();
    rows.filter(r => !name || r.character_name.toLocaleLowerCase() === name.toLocaleLowerCase()).forEach(r => {
      const key = JSON.stringify([r.world_name || '', r.character_name, r.target_item]);
      if (!groups.has(key)) groups.set(key, {key, name:r.target_item, character:r.character_name, world:r.world_name || '', rows:[]});
      groups.get(key).rows.push(r);
    });
    return [...groups.values()].sort((a,b) => b.rows.length - a.rows.length);
  }
  function destroyed(row) { return /파괴|destroy/i.test(row.item_upgrade_result); }
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
  function recordCost(row,level,data,options={}) {
    if(!Number.isInteger(level)||level<1||level>300||row.before_starforce_count>=30||active(row.superior_item_flag)||active(row.protect_shield))return null;
    if(row.upgrade_item && !/^(없음|미사용|미적용|메소|-)$/.test(row.upgrade_item))return null;
    const modifiers=recordModifiers(row);if(!modifiers)return null;
    const star=row.before_starforce_count,base=data.baseCost(star,level);
    const personal=star<17?(options.mvp||0)+(options.pcRoom?.05:0):0;
    const guard=modifiers.guard && data.PROTECT_STARS.includes(star)?data.PROTECT_COST_MULTIPLIER-1:0;
    if(modifiers.guard&&!data.PROTECT_STARS.includes(star))return null;
    return Math.round(base*Math.max(0,1-modifiers.discount-personal)+base*guard);
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
      if (active(r.superior_item_flag) || active(r.chance_time) || active(r.event_field_flag) || active(r.protect_shield) || /펄스|pulse/i.test(r.upgrade_item || '')) return '특수 강화 기록은 현재 분석 모델에서 지원하지 않습니다.';
      if (before >= 30 || (!destroyed(r) && after !== before && after !== before+1)) return '하락·다중 성 상승·특수 복구가 포함된 구간은 현재 모델로 분석할 수 없습니다.';
      if (i && before !== (destroyed(rows[i-1]) ? 12 : rows[i-1].after_starforce_count)) return '별의 흐름이 이어지지 않습니다. 장비가 섞였거나 복구·누락 기록이 있는지 확인하고 구간을 나눠 주세요.';
    }
    return '';
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
  async function fetchHistory(api, from, to, progress) {
    const dates = days(from,to), rows = [];
    for (let i=0;i<dates.length;i++) {
      let cursor = '', pages = 0;
      const cursors = new Set();
      do {
        const body = await api('/history/starforce', cursor ? {count:1000,cursor} : {count:1000,date:dates[i]});
        if (!body || !Array.isArray(body.starforce_history)) throw new Error('스타포스 기록 응답을 읽을 수 없습니다.');
        rows.push(...body.starforce_history);
        if (rows.length > 200000) throw new Error('기록이 너무 많습니다. 조회 기간을 줄여 주세요.');
        cursor = body.next_cursor || '';
        if (typeof cursor !== 'string' || (cursor && cursors.has(cursor)) || ++pages > 1000) throw new Error('다음 기록을 불러오는 중 오류가 발생했습니다. 기간을 줄여 다시 조회하세요.');
        if (cursor) cursors.add(cursor);
        if (progress) progress(i+1, dates.length, rows.length);
      } while(cursor);
    }
    return normalize(rows,from,to);
  }
  const core = {day,validDate,days,normalize,grouped,destroyed,active,countCDF,pathIssue,fetchHistory,abortableDelay,pacedRequest,itemInfo,itemLevel,eventPercent,inEventRange,recordModifiers,recordCost};
  if (typeof module !== 'undefined' && module.exports) module.exports=core;
  else root.StarforceHistoryCore=core;
})(typeof window !== 'undefined' ? window : globalThis);
