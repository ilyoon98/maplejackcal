/* Presentation only: reuse existing inputs/results; never calculate game probabilities or costs. */
(function () {
  'use strict';
  function init() {
    const q = (s, r = document) => r.querySelector(s);
    const qa = (s, r = document) => Array.from(r.querySelectorAll(s));
    const page = location.pathname.split('/').pop() || 'index.html';
    document.body.dataset.uxPage = page;
    const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
    const text = s => q(s)?.textContent.trim() || '';
    const setText = (n, value) => { if (n && n.textContent !== value) n.textContent = value; };
    function fold(node, title) {
      if (!node) return;
      const d = make('details', 'ux-details'); const s = make('summary', '', title);
      node.before(d); d.append(s, node); return d;
    }
    const header = q('header');
    const help = make('dialog', 'ux-help'); help.id = 'uxHelp'; help.setAttribute('aria-labelledby', 'uxHelpTitle');
    const head = make('div', 'ux-help-head'); const title = make('h2', '', '사용법 · 계산 기준'); title.id = 'uxHelpTitle'; title.textContent = '사용법 · 계산 기준';
    const close = make('button', 'ux-button', '닫기 ✕'); close.type = 'button'; close.setAttribute('aria-label', '도움말 닫기');
    head.append(title, close); help.append(head);
    const intro = make('p', 'ux-hint', /play|gacha/.test(page) ? '가상으로 진행한 결과와 기록을 확인할 수 있어요. 실제 게임의 아이템이나 재화는 사용하지 않습니다.' : '입력값을 바꾸면 결과가 자동으로 갱신됩니다. 상세 내역은 결과 아래에서 펼쳐볼 수 있어요.'); help.append(intro);
    qa('[data-ux-help]').forEach(n => {
      const section = make('section', 'ux-help-section'); section.append(make('h3', '', n.dataset.uxHelp));
      const detail = q('details', n); if (detail) { q('summary', detail)?.remove(); section.append(...detail.childNodes); }
      else { qa('h2', n).forEach(h => h.remove()); section.append(...n.childNodes); }
      help.append(section); n.remove();
    });
    const source = q('#dataSource'); if (source) { const section = make('section', 'ux-help-section'); section.append(make('h3', '', '데이터 출처'), source); help.append(section); }
    const guides = {
      'index.html': '일반 계산기는 API 연결 없이 사용할 수 있습니다. 캐릭터 정보를 가져오려면 내 캐릭터 연결에서 API 키를 등록하세요. 키와 설정은 이 브라우저에 저장됩니다.',
      'trace_calc.html': '아이템과 작을 선택한 뒤, 진행 중인 작이라면 슬롯을 눌러 성공·실패를 표시하세요. 손절 기준표는 결과 아래에서 펼칠 수 있습니다.',
      'authentic_symbol_calc.html': '캐릭터를 조회하거나 현재 심볼 레벨을 직접 설정하세요. 목표 포스까지 최소 메소가 드는 강화 순서를 보여줍니다. 심볼 보유 수량과 획득 기간을 고려한 경로는 아닙니다.',
      'boss_income_calc.html': 'API 없이 캐릭터를 직접 추가하고 보스·난이도·완료 상태를 선택할 수 있습니다. API를 연결하면 스케줄러에서 보스와 완료 상태를 가져옵니다. 파티 인원은 직접 확인하세요. 완료 보스 기준 수익은 결정석 판매 여부를 확인한 금액이 아닙니다. 월간 예상은 주간 수익 4회와 월간 보스 수익의 합입니다.',
      'cube_calc.html': '현재 등급과 목표 등급을 선택하세요. 천장은 등급업 기준이며 옵션 획득을 보장하지 않습니다. 내 기록 비교에 실제 사용 횟수를 입력할 수 있습니다.',
      'cube_play.html': '한 단계 등급업하면 자동 진행이 멈춥니다. 같은 구간을 다시 도전하거나 다음 등급으로 진행할 수 있어요. 완료한 판의 평균과 누적 기록은 서로 다른 비교 기준입니다.',
      'pet_gacha.html': '원더블랙 2개 또는 원더블랙과 루나 스윗을 합성합니다. 자동 뽑기는 블랙＋스윗을 우선 사용합니다. 보관함의 확률은 원더베리·합성 등 해당 단계 기준이며 서로 더하지 않습니다.',
      'boutique_gacha.html': '자동 뽑기의 목표는 한 번에 얻는 티켓 수입니다. 피버는 10번째 뽑기마다 적용됩니다. 성적표의 상위 비율은 정규근사 추정치이며 적은 횟수에서는 참고용입니다.',
      'seedring_gacha.html': '오늘의 뽑기는 지정 상자를 한 번, 무한 뽑기는 선택한 상자를 반복해서 엽니다. 확률은 커뮤니티 자료로 재구성한 추정치입니다. 전체 확률은 화면의 확률표를 펼쳐 확인하세요.',
      'coin_shop_calc.html': '현재까지 사용 가능은 선택 주차까지의 누적 획득 계획에서 구매 기록을 뺀 값입니다. 이번 주 잔액은 장바구니까지 반영합니다. 종료 예상 잔액에는 앞으로 받을 코인이 포함됩니다. 전부 구매 처리는 이 계산기의 기록만 갱신합니다.'
    };
    if (guides[page]) { const section = make('section', 'ux-help-section'); section.append(make('h3', '', '사용 방법'), make('p', '', guides[page])); help.append(section); }
    document.body.append(help);
    if (header) {
      const opener = make('button', 'ux-help-open', '? 도움말'); opener.type = 'button'; opener.setAttribute('aria-haspopup', 'dialog'); opener.setAttribute('aria-controls', help.id);
      header.append(opener); header.classList.add('ux-header');
      opener.addEventListener('click', () => { help.showModal(); document.body.classList.add('ux-modal-open'); close.focus(); });
      help.addEventListener('close', () => { document.body.classList.remove('ux-modal-open'); opener.focus(); });
    }
    close.addEventListener('click', () => help.close());
    help.addEventListener('click', e => { if (e.target === help) { const r = help.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) help.close(); } });

    if (page === 'index.html') {
      const api = q('#apiKey'); const tools = qa('.tool-section')[0]; if (api && tools) tools.after(api);
      const openKey = () => { if (location.hash === '#apiKey' && api) { api.open = true; api.scrollIntoView(); } }; window.addEventListener('hashchange', openKey);
      const groups = [ ['강화 비용', ['trace_calc','starforce_calc','cube_calc','cube_option_calc','item_craft_calc']], ['수익·거래', ['trade_margin_calc','meso_market_calc']], ['캐릭터·보스', ['authentic_symbol_calc','boss_income_calc','boss_buff_planner']], ['이벤트', ['coin_shop_calc']] ];
      const grid = q('.tool-grid', tools); const cards = qa('.tool-card', grid);
      // Keep every calculator in one grid; categories filter it without adding empty rows.
      grid.id = 'ux-tool-grid';
      const filters = make('div', 'ux-home-filters');
      filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', '계산기 분류');
      const count = make('span', 'ux-home-count', '전체 ' + cards.length + '개');
      count.setAttribute('role', 'status');
      [['전체', null], ...groups].forEach(([name, paths], index) => {
        const button = make('button', 'ux-button', name); button.type = 'button';
        button.setAttribute('aria-pressed', String(index === 0)); button.setAttribute('aria-controls', grid.id);
        button.addEventListener('click', () => {
          qa('button', filters).forEach(b => b.setAttribute('aria-pressed', String(b === button)));
          let visible = 0;
          cards.forEach(card => { card.hidden = !!paths && !paths.includes(card.getAttribute('href').replace('.html', '')); if (!card.hidden) visible++; });
          count.textContent = name + ' ' + visible + '개';
        });
        filters.append(button);
      });
      const toolbar = make('div', 'ux-home-toolbar'); toolbar.append(filters, count); grid.before(toolbar);
      const sections = qa('.tool-section'); if (api) sections[sections.length - 1].after(api); openKey();
      qa('.tool-card p').forEach(p => { const href = p.closest('a').getAttribute('href'); const copy = {'trade_margin_calc.html':'본전 판매가와 수수료 제외 순이익','meso_market_calc.html':'바로 거래 vs 직접 등록 실수령 비교','item_craft_calc.html':'노작부터 완성까지 평균 제작 비용','cube_calc.html':'현재 등급에서 목표 등급까지 비용'}; if (copy[href]) p.textContent = copy[href]; });
    }
    if (page === 'item_craft_calc.html') {
      const totals = q('.ic-totals'); totals.prepend(q('.ic-total.avg')); q('#resRatio').hidden = true;
      const panels = ['flame','star','pot','addi'];
      panels.forEach(key => {
        const panel = q('#' + key + 'Panel'), h = q('h2', panel); const body = make('div', 'ux-stage-body'); body.id = 'ux-' + key + '-body';
        while (h.nextSibling) body.append(h.nextSibling); panel.append(body);
        const button = make('button', 'ux-stage-toggle'); button.type = 'button'; button.setAttribute('aria-controls', body.id); button.setAttribute('aria-expanded', 'false');
        const label = make('span', 'ux-stage-label', h.childNodes[0].textContent.trim()); const summary = make('span', 'ux-stage-summary'); button.append(label, summary);
        h.childNodes[0].remove(); h.prepend(button); body.hidden = true;
        const update = () => {
          const enabled = q('#on-' + key).checked;
          const rows = qa('.ic-row', body).map(row => { const name = q('.ic-row-name', row)?.childNodes[0].textContent.trim() || ''; const input = q('input', row); const val = input ? input.value : q('.ic-row-val', row)?.textContent.trim() || ''; return name + ' ' + val; });
          const ranks = qa('.ic-grades .active', body).map(n => n.textContent.trim()).join(' → ');
          const value = !enabled ? '계산에서 제외' : key === 'star' ? q('#starStart').value + '성 → ' + q('#starGoal').value + '성 · ' + (qa('#starEvents .active').map(n => n.textContent.trim()).filter(v => !v.includes('샤이닝')).join(' / ') || '이벤트 없음') : (ranks ? ranks + ' · ' : '') + (rows.length ? rows.join(' / ') : key === 'flame' ? '목표 미설정 · 비용 제외' : '등급업만 계산');
          setText(summary, value); button.setAttribute('aria-label', label.textContent + ' 설정 ' + (body.hidden ? '펼치기' : '접기') + ' · ' + value);
        };
        button.addEventListener('click', () => { body.hidden = !body.hidden; button.setAttribute('aria-expanded', String(!body.hidden)); update(); });
        panel.addEventListener('input', update); panel.addEventListener('change', update);
        new MutationObserver(update).observe(body, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class']}); update();
      });
      const scope = q('#uxCraftScope');
      const scopeUpdate = () => { const notes = []; if (!Number(q('#basePrice').value.replaceAll(',', ''))) notes.push('노작값 0 · 장비 구매 비용 제외'); if(q('#on-flame').checked && !q('#flameBody .ic-row')) notes.push('추가옵션 목표 미설정'); ['pot','addi'].forEach(k => { if(q('#on-'+k).checked && !q('#'+k+'Body .ic-row')) notes.push((k==='pot'?'잠재':'에디')+'는 등급업만'); }); setText(scope, notes.join(' / ') || '선택한 강화 단계와 목표 기준 · 평균 비용은 실제 지출을 보장하지 않습니다.'); };
      document.addEventListener('input', scopeUpdate); document.addEventListener('change', scopeUpdate); new MutationObserver(scopeUpdate).observe(q('#breakdown'), {childList:true, subtree:true}); scopeUpdate();
    }
    if (page === 'boss_buff_planner.html') {
      ['buffMin','baseMin'].forEach(id => {
        const input=q('#'+id); const value=make('strong','ux-fixed-setting');
        input.hidden=true; input.after(value);
        const update=()=>setText(value, input.value);
        document.addEventListener('buff-profile-loaded',update);
        q('#resetBtn').addEventListener('click',update);
        update();
      });
      const result = q('.layout-right'); const sections = qa(':scope > section', result); const switcher = make('div', 'ux-switch'); switcher.setAttribute('role','group'); switcher.setAttribute('aria-label','동선 목적');
      sections.forEach((s, i) => { s.id = 'ux-buff-result-' + i; const b = make('button', 'ux-button', i ? '버프 한 번만 쓰기' : '전체 보스 돌기'); b.type = 'button'; b.setAttribute('aria-controls',s.id); b.setAttribute('aria-pressed',String(i===0)); s.hidden = i!==0; switcher.append(b); b.addEventListener('click', () => { sections.forEach((other,j) => { other.hidden=i!==j; switcher.children[j].setAttribute('aria-pressed',String(i===j)); }); }); }); result.prepend(switcher);
    }
    if (page === 'trace_calc.html') {
      const root = q('#resultBody'); const current = q('.card-primary', root); root.prepend(current);
      const p = q('.note', current); p.textContent = '슬롯을 눌러 성공·실패를 표시하세요. 비어 있는 슬롯은 아직 시도하지 않은 상태입니다.';
      fold(q('.card-ref', root), '처음부터 시작할 때의 전체 기대값');
    }
    if (page === 'cube_option_calc.html') { const cost = q('#resMeso').closest('.primary-metric'); q('.primary-metrics').prepend(cost); }
    if (page === 'cube_calc.html' || page === 'cube_option_calc.html') {
      const host = q('#priceBox') || q('#costInfo'); const note = make('p','ux-scope'); host.after(note);
      const update = () => { const selected = q('#cubeChoices .active'); setText(note, selected && selected.textContent.includes('재설정') ? '메소 재설정 비용 기준' : '큐브 자체 구입비 제외 · 큐브 사용 수수료만 메소에 반영'); };
      new MutationObserver(update).observe(q('#cubeChoices'),{childList:true,subtree:true,attributes:true,attributeFilter:['class']}); update();
    }
    if (page === 'trade_margin_calc.html' || page === 'meso_market_calc.html') {
      const verdict = q('#verdictBox'); const result = verdict.parentElement; result.insertBefore(verdict, q('#breakEvenBox') || q('#netBox'));
      const update = () => { result.classList.toggle('ux-has-verdict', !verdict.classList.contains('hidden')); };
      new MutationObserver(update).observe(verdict,{attributes:true,attributeFilter:['class']}); update();
    }


    if (['cube_play.html','starforce_play.html','pet_gacha.html','boutique_gacha.html'].includes(page)) {
      const reset=q('#resetBtn'); const actions=make('div','ux-header-actions');
      const oldRow=reset.closest('.reset-row');
      actions.append(reset,q('.ux-help-open')); header.append(actions);
      reset.className='ux-button ux-session-reset';
      oldRow?.remove();
    }
    if (page === 'cube_play.html' || page === 'starforce_play.html') {
      const panel=q('.card-primary');
      const score=make('div','ux-play-score'); score.id='uxPlayScore';
      score.setAttribute('aria-label','최근 완료한 판 성적');
      score.innerHTML='<span class="ux-score-caption">최근 완료한 판</span><strong id="uxScoreRank">상위 —%</strong><span id="uxScoreCost">목표 달성 후 기대 지출과 비교합니다.</span>';
      q('h2',panel).after(score);
      const stats=q('#simStats, #simPercentiles');
      const updateScore=()=>{
        setText(q('#uxScoreRank'),q('[data-ux-rank]',stats)?.textContent || '상위 —%');
        setText(q('#uxScoreCost'),q('[data-ux-cost]',stats)?.textContent || '목표 달성 후 기대 지출과 비교합니다.');
      };
      new MutationObserver(updateScore).observe(stats,{childList:true,subtree:true}); updateScore();
      if (stats) {
        const controls=make('div','ux-switch'); controls.setAttribute('role','group'); controls.setAttribute('aria-label','기록 비교 기준');
        ['완료한 판 평균','누적 기록'].forEach((label,i)=>{const b=make('button','ux-button',label);b.type='button';b.setAttribute('aria-pressed',String(i===0));controls.append(b);b.addEventListener('click',()=>{stats.dataset.uxStats=i?'total':'average';qa('button',controls).forEach((x,j)=>x.setAttribute('aria-pressed',String(i===j)));});});
        stats.before(controls); stats.dataset.uxStats='average';
        const empty=make('p','ux-hint','목표 달성 후 평균 대비 기록을 확인할 수 있어요.'); controls.after(empty);
        const update=()=>{const has=!!q('.compare',stats);const hasAverage=!!q('.compare:not(.cumulative)',stats);controls.hidden=!has;empty.hidden=has;controls.children[0].disabled=!hasAverage;if(has&&!hasAverage)stats.dataset.uxStats='total';qa('button',controls).forEach((b,i)=>b.setAttribute('aria-pressed',String((stats.dataset.uxStats==='total')===Boolean(i))));};new MutationObserver(update).observe(stats,{childList:true,subtree:true});update();
      }
      fold(q('#runLog'),'판별 기록 펼치기');
    }
    if (page === 'pet_gacha.html') {
      const inventory=q('#inventory'); const button=make('button','ux-button','합성 불가 결과도 보기');button.type='button';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','inventory');inventory.after(button);inventory.classList.add('ux-materials-only');
      button.addEventListener('click',()=>{const compact=inventory.classList.toggle('ux-materials-only');button.setAttribute('aria-expanded',String(!compact));button.textContent=compact?'합성 불가 결과도 보기':'합성 불가 결과 접기';});
      const hint=make('p','ux-hint','블랙·스윗은 합성 재료, 쁘띠는 최종 결과입니다.');inventory.before(hint);
    }
    if (page === 'starforce_calc.html') {
      const table=q('#safeguardAdvice'); const heading=table.previousElementSibling;
      const comparison=q('#spareCompare'); heading.remove();
      const detail=make('details','ux-details'); const summary=make('summary','','파괴방지 손익분기표');
      detail.append(summary,table,comparison); q('#safeguardChips').after(detail);
      const result=q('#resMeso').closest('.sf-panel'); const note=make('p','ux-scope');q('.sf-metrics',result).before(note);
      const update=()=>{const empty=!Number(q('#spareInput').value.replaceAll(',',''));setText(note,empty?'노작값 0 · 파괴 시 장비 구매 비용 제외':'입력한 노작값을 파괴 비용에 포함');};q('#spareInput').addEventListener('input',update);new MutationObserver(update).observe(q('#resMeso'),{childList:true,subtree:true,characterData:true});update();
    }

    // Mobile result shortcut reads the existing rendered output, never recomputes it.
    const docks = {
      'item_craft_calc.html':['.ic-result','#resAvg','평균 제작 비용'],
      'cube_option_calc.html':['.cube-layout > aside','#resMeso','평균 비용'],
      'cube_calc.html':['.cube-layout > aside','#expectedCost','평균 비용'],
      'starforce_calc.html':['.sf-layout > aside','#resMeso','평균 비용'],
      'trace_calc.html':['.layout-right','#actionValue','지금 할 일'],
      'boss_buff_planner.html':['.layout-right','#packResult','동선 확인'],
      'trade_margin_calc.html':['.tm-result','#breakEvenValue','본전 판매가'],
      'meso_market_calc.html':['.mm-result','#evenValue','손익분기 시세'],
      'cube_play.html':['.cube-layout > aside','#simLabel','가상 큐브'],
      'starforce_play.html':['.sf-layout > aside','#stageStar','현재 성'],
      'boutique_gacha.html':['.bt-right','#spent','가상 지출'],
      'pet_gacha.html':['.pet-right','#spent','가상 지출']
    };
    const config = docks[page];
    if (config && q(config[0])) {
      const [target, source, label] = config; const bar = make('div','ux-result-dock'); const go = make('button','ux-dock-main'); go.type='button';
      const caption = make('span','ux-dock-caption',label); const val = make('strong'); const action = make('span','ux-dock-action','결과 보기 ↑'); go.append(caption,val,action); bar.append(go); document.body.append(bar); document.body.classList.add('ux-has-dock');
      const dest=q(target); if(!dest.id) dest.id='ux-result'; go.setAttribute('aria-controls',dest.id);
      go.addEventListener('click',()=>{ dest.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}); dest.setAttribute('tabindex','-1'); dest.focus({preventScroll:true}); });
      const update=()=> { let value=text(source); if(page==='boss_buff_planner.html') value='전체 동선 / 버프 한 번'; if(page==='starforce_play.html') value+='★'; if(q('#verdictBox') && !q('#verdictBox').classList.contains('hidden')) {value=text('#verdictValue');setText(caption,page==='trade_margin_calc.html'?'총 순이익':'실수령 차이');} else setText(caption,label); setText(val,value||'조건을 입력하세요'); };
      const observed=q(source); if(observed)new MutationObserver(update).observe(dest,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']}); update();
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
