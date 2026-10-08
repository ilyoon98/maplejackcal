// Run explicitly with Playwright available on NODE_PATH. Uses mocked API data only.
const {chromium} = require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!['.html','.js','.css','.png','.webp','.ico'].includes(path.extname(file))){res.writeHead(404);res.end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(data);});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
    const page=await browser.newPage({viewport:{width:1280,height:960}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const base='http://127.0.0.1:'+server.address().port;
    const choose=async(kind,values=[])=>{
      const id=kind==='world'?'historyWorld':'historyCharacterSelect',options=kind==='world'?'historyWorldOptions':'historyCharacterOptions';
      await page.locator('#'+id).evaluate(el=>el.open=true);
      const all=page.locator(kind==='world'?'#historyWorldAll':'#historyCharacterAll');
      if(values.length){await all.check();await all.uncheck();}
      else{await all.uncheck();await all.check();}
      for(const value of values){
        await page.waitForFunction(({options,value})=>[...document.querySelectorAll('#'+options+' input')].some(el=>el.value===value),{options,value});
        const index=await page.locator('#'+options+' input').evaluateAll((nodes,value)=>nodes.findIndex(el=>el.value===value),value);
        await page.locator('#'+options+' input').nth(index).check();
      }
      await page.locator('#'+id).evaluate(el=>el.open=false);
    };
    const character=(world,name='테스터')=>JSON.stringify([world,name]);
    const compactMeso=n=>{
      if(n===0)return '0 메소';
      const units=Math.floor(Math.abs(n)/10000),eok=Math.floor(units/10000),man=units%10000;
      return (n<0?'-':'')+([eok?eok.toLocaleString('ko-KR')+'억':'',man?man.toLocaleString('ko-KR')+'만':''].filter(Boolean).join(' ')||'1만 미만')+' 메소';
    };
    // Historical empty days represent a completed initial import; live refresh still uses mocked APIs.
    const seedPast=async()=>page.evaluate(async()=>{
      const cache=await StarforceHistoryCache.open('test-only-key');
      try{await Promise.all(StarforceHistoryCore.days(document.querySelector('#historyFrom').min,document.querySelector('#historyTo').max).slice(0,-1).map(async date=>{if(!await cache.get(date))await cache.set(date,[]);}));}finally{cache.close();}
    });
    const reloadSaved=async()=>{await seedPast();await page.reload();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('조회 완료'));};
    // Reset only this test browser's fake account between mocked datasets.
    const resetFixture=async()=>{
      await page.evaluate(async()=>{
        const cache=await StarforceHistoryCache.open('test-only-key');
        try{await cache.clear();await cache.set(document.querySelector('#historyTo').max,[]);}finally{cache.close();}
      });
      await reloadSaved();
      await page.evaluate(async()=>{const cache=await StarforceHistoryCache.open('test-only-key');try{await cache.clear();}finally{cache.close();}});
      await page.locator('#historyFrom').evaluate((el,date)=>el._flatpickr.setDate(date,true),today);
    };
    let mode='normal',calls=[],characterMode='normal',characterCalls=0,releaseRefresh,notifyRefresh;
    const refreshGate=new Promise(resolve=>releaseRefresh=resolve);
    const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
    const rows=Array.from({length:12},(_,i)=>({id:'fixture-'+i,character_name:i===11?'다른캐릭터':'테스터',world_name:'스카니아',target_item:i===11?'<img src=x onerror=alert(1)>':'아케인셰이드 나이트헬름',date_create:today+'T12:'+String(i).padStart(2,'0')+':00+09:00',before_starforce_count:i<10?12+i:22,after_starforce_count:i<10?13+i:22,item_upgrade_result:i<10?'성공':'실패',starcatch_result:null,starforce_event_list:[]}));
    const segments=rows.slice(0,4).map((r,i)=>({...r,id:'segment-'+i,before_starforce_count:[12,15,12,13][i],after_starforce_count:[13,0,13,14][i],item_upgrade_result:i===1?'파괴':'성공',starcatch_result:i===3?'실패':'성공'}));
    const worldRows=[{...rows[0],id:'world-s',target_item:'마이스터링'}, {...rows[0],id:'world-l',world_name:'루나',target_item:'마이스터링'}, {...rows[0],id:'world-low',character_name:'저렙캐릭터',world_name:'루나',target_item:'메커네이터 펜던트',before_starforce_count:0,after_starforce_count:1}];
    const lossRows=Array.from({length:20},(_,i)=>({...rows[0],id:'loss-'+i,date_create:today+'T13:'+String(i).padStart(2,'0')+':00+09:00',before_starforce_count:12,after_starforce_count:i===19?13:12,item_upgrade_result:i===19?'성공':'실패'}));
    const currencyRows=[{...rows[0],id:'currency-success',before_starforce_count:13,after_starforce_count:14}, {...rows[1],id:'currency-special',before_starforce_count:14,after_starforce_count:0,item_upgrade_result:'파괴',upgrade_item:'펄스 인핸서'}, {...rows[2],id:'currency-failure',before_starforce_count:15,after_starforce_count:15,item_upgrade_result:'실패'}, {...rows[0],id:'special-only',character_name:'특수재화캐릭터',target_item:'특수 전용 장비',upgrade_item:'펄스 인핸서'}];
    const revampRows=[...Array.from({length:1230},(_,i)=>({...rows[0],id:'revamp-'+i,before_starforce_count:13,after_starforce_count:i===1229?14:13,item_upgrade_result:i===1229?'성공':'실패'})), ...Array.from({length:4},(_,i)=>({...rows[0],id:'event-'+i,starforce_event_list:[{cost_discount_rate:'30%',starforce_event_range:'0~14'}]})), ...Array.from({length:8},(_,i)=>({...rows[0],id:'special-'+i,upgrade_item:'펄스 인핸서'})), {...rows[0],id:'unknown-level',target_item:'미등록 장비'}];
    await page.route('https://open.api.nexon.com/**',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/maplestory/v1/notice-event'){await route.fulfill({json:{event_notice:[]}});return;}
      if(url.pathname==='/maplestory/v1/character/list'){
        characterCalls++;
        if(characterMode==='error'){await route.fulfill({status:403,json:{error:{name:'OPENAPI00002'}}});return;}
        await route.fulfill({json:{account_list:[{account_id:'fixture-account',character_list:[
          {ocid:'scania-test',character_name:'테스터',world_name:'스카니아',character_level:200},
          {ocid:'luna-test',character_name:'테스터',world_name:'루나',character_level:285},
          {ocid:'low-level',character_name:'저렙캐릭터',world_name:'루나',character_level:120}
        ]}]}});return;
      }
      calls.push(url);
      assert.equal(url.pathname,'/maplestory/v1/history/starforce');
      assert.equal(url.searchParams.has('ocid'),false);
      if(mode==='error'){await route.fulfill({status:429,json:{error:{name:'OPENAPI00007'}}});return;}
      if(mode==='slow'){await new Promise(r=>setTimeout(r,300));}
      if(mode==='refresh'){notifyRefresh?.();await refreshGate;await route.fulfill({json:{starforce_history:[rows[0],{...rows[1],id:'new-on-return'}],next_cursor:null}});return;}
      if(mode==='segments'){await route.fulfill({json:{starforce_history:segments,next_cursor:null}});return;}
      if(mode==='special'){await route.fulfill({json:{starforce_history:[currencyRows[1],currencyRows[3]],next_cursor:null}});return;}
      if(mode==='revamp'){await route.fulfill({json:url.searchParams.has('cursor')?{starforce_history:revampRows.slice(1000),next_cursor:null}:{starforce_history:revampRows.slice(0,1000),next_cursor:'revamp-next'}});return;}
      if(['worlds','loss','currency'].includes(mode)){await route.fulfill({json:{starforce_history:mode==='worlds'?worldRows:mode==='loss'?lossRows:currencyRows,next_cursor:null}});return;}
      await route.fulfill({json:url.searchParams.has('cursor')?{starforce_history:rows.slice(5),next_cursor:null}:{starforce_history:rows.slice(0,6),next_cursor:'fixture-next'}});
    });
    await page.goto(base+'/starforce_history.html');
    assert.ok(await page.locator('#historyFrom').evaluate(el=>el.value===el.min));
    await page.locator('#historyFrom').evaluate((el,date)=>el._flatpickr.setDate(date,true),today);
    const fetchBefore=await page.locator('#historyFetch').boundingBox();
    await page.locator('#historyFrom').click();
    assert.equal(await page.locator('#historyFromCalendar').isVisible(),true);
    await page.locator('#historyFrom').click();
    assert.equal(await page.locator('#historyFromCalendar').isVisible(),false);
    await page.locator('#historyFrom').click();
    assert.equal(await page.locator('#historyFromCalendar').isVisible(),true);
    assert.equal((await page.locator('#historyFetch').boundingBox()).y,fetchBefore.y);
    const monthButtonBefore=await page.locator('#historyFromCalendar .flatpickr-prev-month').boundingBox();
    await page.locator('#historyFromCalendar .flatpickr-prev-month').click();
    assert.equal((await page.locator('#historyFromCalendar .flatpickr-prev-month').boundingBox()).y,monthButtonBefore.y);
    await page.locator('#historyFromCalendar .flatpickr-next-month').click();
    await page.locator('#historyFromCalendar .flatpickr-day.selected').click();
    assert.equal(await page.locator('#historyFromCalendar').isVisible(),false);
    await page.locator('#historyPeriods [data-days="7"]').click();
    assert.equal(await page.locator('#historyFrom').inputValue(),new Date(Date.parse(today)-6*86400000).toISOString().slice(0,10));
    await page.locator('#historyPeriods [data-days="all"]').click();
    assert.ok(await page.locator('#historyFrom').evaluate(el=>el.value===el.min));
    await page.locator('#historyTo').focus();await page.locator('#historyTo').press('Enter');
    assert.equal(await page.locator('#historyToCalendar').isVisible(),true);
    await page.locator('#historyTo').press('Escape');
    assert.equal(await page.locator('#historyPeriods [data-days="1"]').count(),0);
    assert.match(await page.locator('#keyState').innerText(),/등록/);
    await page.locator('#historyFetch').click();assert.match(await page.locator('#historyStatus').innerText(),/먼저 등록/);
    await page.evaluate(()=>{localStorage.setItem('nxopen_api_key','test-only-key');localStorage.setItem('boss_income_state',JSON.stringify({characters:[{name:'테스터',ocid:'unused'}]}));});
    await reloadSaved();
    assert.equal(calls.length,2);assert.ok(await page.locator('#historyFrom').evaluate(el=>el.value===el.min));
    await page.locator('#historyFrom').evaluate((el,date)=>el._flatpickr.setDate(date,true),today);
    await page.waitForFunction(()=>!document.querySelector('#historyCharactersRefresh').disabled);
    assert.equal(await page.locator('#historyName, #historyCharacters').count(),0);
    assert.equal(await page.locator('#historyCharacterOptions input').count(),2);
    assert.deepEqual(await page.evaluate(()=>[1,2,3,4].map(n=>NexonCharacters.worldIconPath('챌린저스'+n))),Array(4).fill('icons/server/챌린저스.webp'));
    assert.equal(await page.locator('.site-tab[data-group=history].active').count(),1);
    await page.locator('#historyFetch').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('조회 완료'));
    assert.equal(await page.locator('#totalTries').innerText(),'12회');assert.equal(calls.length,2);
    assert.equal(await page.locator('#historyCharacterOptions input').count(),2);
    assert.match(await page.locator('#historyCharacterOptions').textContent(),/테스터 · Lv.200/);
    assert.doesNotMatch(await page.locator('#historyCharacterOptions').textContent(),/저렙캐릭터|Lv.285/);
    assert.match(await page.locator('#historyCharactersStatus').innerText(),/기록 캐릭터 2명/);
    assert.equal(await page.locator('#historyWorldOptions input:not(:checked), #historyCharacterOptions input:not(:checked)').count(),0);
    await page.locator('#historyCharacterSelect').evaluate(el=>el.open=true);
    await page.locator('#historyCharacterOptions input').first().uncheck();
    assert.equal(await page.locator('#totalTries').innerText(),'1회');
    assert.equal(await page.locator('#historyCharacterOptions input:checked').count(),1);
    assert.equal(await page.locator('#historyCharacterAll').evaluate(el=>el.indeterminate),true);
    await page.locator('#historyCharacterOptions input').last().uncheck();
    assert.equal(await page.locator('#totalTries').innerText(),'0회');
    assert.equal(await page.locator('#historyCharacterSummary').innerText(),'캐릭터 선택 없음');
    assert.equal(await page.locator('#historyCharacterAll').isChecked(),false);
    await page.locator('#historyCharacterAll').check();assert.equal(await page.locator('#totalTries').innerText(),'12회');
    await page.locator('#historyCharacterSelect').evaluate(el=>el.open=false);
    await page.locator('#historyWorld').evaluate(el=>el.open=true);
    await page.locator('#historyWorldAll').uncheck();
    assert.equal(await page.locator('#totalTries').innerText(),'0회');assert.equal(await page.locator('#historyWorldSummary').innerText(),'서버 선택 없음');
    assert.equal(await page.locator('#historyWorldOptions input:checked').count(),0);
    await page.locator('#historyWorldAll').check();assert.equal(await page.locator('#totalTries').innerText(),'12회');
    await page.locator('#historyWorld').evaluate(el=>el.open=false);
    assert.equal(await page.locator('#historyItems img:not(.history-world-icon)').count(),0);
    assert.equal(await page.locator('#historyItems .history-world-icon').count(),2);
    const historyCalls=calls.length;
    await choose('world',['루나']);assert.equal(await page.locator('#totalTries').innerText(),'0회');
    assert.equal(await page.locator('#historyWorldSummary img').getAttribute('src'),'icons/server/루나.webp');
    await choose('world',['스카니아']);assert.equal(await page.locator('#totalTries').innerText(),'12회');
    await choose('character',[character('스카니아')]);assert.equal(await page.locator('#totalTries').innerText(),'11회');
    assert.match(await page.locator('#totalCostScope').innerText(),/스카니아 · 테스터/);
    assert.equal(calls.length,historyCalls);
    await choose('character');await choose('world');
    assert.match(await page.locator('#costStatus').innerText(),/일부 비용 미반영/);
    assert.match(await page.locator('#costMissing').textContent(),/레벨 미확인 1회/);
    await choose('character',[character('스카니아')]);assert.equal(await page.locator('#totalTries').innerText(),'11회');assert.equal(calls.length,2);
    assert.equal(await page.locator('#historyDetail').isVisible(),false);
    assert.equal(await page.locator('#historyItems .history-stat').count(),0);
    assert.equal(await page.locator('#historyItems .history-level, #historyItems .history-card-stars').count(),0);
    assert.equal(await page.locator('#historyItems .history-card-profit.gain').count(),1);
    assert.equal(await page.locator('#historyResults > .history-finance').count(),1);
    assert.equal(await page.locator('#historyCurrencyFilters, .history-profit, #historyResults > .history-spending').count(),0);
    assert.equal(await page.locator('#financeDetails').evaluate(el=>el.open),false);
    assert.equal(await page.locator('.history-detail-dialog .history-table th').count(),7);
    assert.equal(await page.locator('#totalItems').count(),0);
    assert.match(await page.locator('#profitCoverage').textContent(),/11 \/ 11회 비교/);
    assert.match(await page.locator('#totalProfit').innerText(),/이득/);
    assert.equal(await page.locator('#totalCostLabel').innerText(),'총 사용 메소');
    assert.equal(await page.locator('#costStatus').innerText(),'');
    const expected=await page.evaluate(()=>{
      return Array.from({length:11},(_,i)=>StarforceData.baseCost(i<10?12+i:22,200)).reduce((a,b)=>a+b,0);
    });
    assert.equal(await page.locator('#totalCostExact').textContent(),compactMeso(expected)+' · 11 / 11회 강화비 반영');
    await page.locator('#historyItems button').first().click();
    assert.equal(await page.locator('#itemLevel').inputValue(),'200');
    assert.equal(await page.locator('#itemOverview .history-stat.success b').innerText(),'10');
    assert.match(await page.locator('#historyRows').innerText(),/확률 보정 자동 적용/);
    assert.equal(await page.locator('#analysisSettings').evaluate(el=>el.open),false);
    const detailTop=(await page.locator('#historyDetail').boundingBox()).y;
    await page.locator('#analysisSettings > summary').click();
    assert.equal((await page.locator('#historyDetail').boundingBox()).y,detailTop);
    await page.locator('#itemLevel').fill('200');await page.locator('#analysisConfirmed').check();
    await page.locator('#analysisForm button[type=submit]').click();
    let result=await page.locator('#analysisResult').innerText();
    assert.match(result,/최초 22성 달성까지 10회/);assert.match(result,/상위/);assert.match(result,/이후 1회/);
    assert.match(await page.locator('#itemComparison').innerText(),/이득 \(절약\)/);assert.equal(await page.locator('#itemComparison.gain').count(),1);
    assert.match(await page.locator('#costSummary').textContent(),/11 \/ 11회/);
    await page.locator('#itemMvp').selectOption('0.1');await page.locator('#costUpdate').click();
    assert.equal(await page.locator('#itemComparison.gain').count(),0);
    await page.waitForFunction(()=>document.querySelector('#analysisResult').textContent.includes('저장했습니다'));
    assert.notEqual(await page.locator('#totalCostExact').textContent(),compactMeso(expected)+' · 11 / 11회 강화비 반영');
    const savedTotal=await page.locator('#totalCostExact').textContent();
    await page.locator('#rangeSettings > summary').click();
    await page.locator('#rangeTo').fill('5');await page.locator('#rangeApply').click();
    await page.locator('#analysisConfirmed').check();await page.locator('#analysisForm button[type=submit]').click();
    result=await page.locator('#analysisResult').innerText();assert.match(result,/미달성/);assert.doesNotMatch(result,/절약\n|상위/);
    await page.locator('#rangeTo').fill('4');await page.locator('#analysisConfirmed').check();await page.locator('#analysisForm button[type=submit]').click();assert.match(await page.locator('#analysisResult').innerText(),/구간 적용을 먼저/);
    await page.locator('#detailClose').click();
    await choose('world',['루나']);assert.equal(await page.locator('#totalTries').innerText(),'0회');assert.equal(await page.locator('#historyDetail').isVisible(),false);
    assert.equal(await page.locator('#historyCharacterOptions input').count(),0);await choose('world');
    await choose('character',[character('스카니아')]);
    const beforeCache=calls.length;
    await reloadSaved();assert.equal(await page.locator('#historyCharacterOptions input').count(),2);
    await page.locator('#historyFrom').evaluate((el,date)=>el._flatpickr.setDate(date,true),today);
    await page.locator('#historyFetch').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('조회 완료'));
    await choose('character',[character('스카니아')]);
    assert.equal(calls.length,beforeCache);assert.equal(await page.locator('#totalTries').innerText(),'11회');
    assert.equal(await page.locator('#totalCostExact').textContent(),savedTotal);
    await page.locator('#historyItems button').first().click();await page.locator('#analysisSettings > summary').click();
    assert.equal(await page.locator('#itemMvp').inputValue(),'0.1');await page.locator('#detailClose').click();
    assert.equal(await page.evaluate(async date=>{const cache=await StarforceHistoryCache.open('different-test-key');try{return (await cache.get(date))===undefined;}finally{cache.close();}},today),true);
    await resetFixture();
    mode='error';await page.locator('#historyFetch').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('한도'));assert.equal(await page.locator('#historyResults').isVisible(),false);
    mode='slow';await page.locator('#historyFetch').click();await page.locator('#historyCancel').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('중단했습니다'));
    mode='normal';await page.locator('#historyFetch').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('조회 완료'));
    const output=process.env.TEMP||root;
    await page.screenshot({path:path.join(output,'starforce-history-desktop.png'),fullPage:true});
    await page.locator('#historyItems button').first().click();
    await page.screenshot({path:path.join(output,'starforce-history-detail.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,'starforce-history-mobile.png'),fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>window.innerWidth).slice(0,12).map(e=>[e.tagName,e.className,e.getBoundingClientRect().width]))));
    await page.locator('#detailClose').click();
    await page.screenshot({path:path.join(output,'starforce-history-mobile-overview.png'),fullPage:true});
    await page.setViewportSize({width:1280,height:960});
    await resetFixture();
    mode='segments';await page.locator('#historyFetch').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('조회 완료'));
    const segmentBase=await page.evaluate(()=>[12,15,12,13].reduce((sum,star)=>sum+StarforceData.baseCost(star,200),0));
    assert.match(await page.locator('#costMissing').textContent(),/파괴 1회의 대체 장비값 미입력/);
    await page.locator('#historyItems button').first().click();
    assert.equal(await page.locator('#sessionSelect option').count(),4);
    await page.locator('#analysisSettings > summary').click();
    await page.locator('#itemSpare').fill('123456');await page.locator('#costUpdate').click();await page.waitForFunction(()=>document.querySelector('#analysisResult').textContent.includes('저장했습니다'));
    assert.equal(await page.locator('#totalCostExact').textContent(),compactMeso(segmentBase+123456)+' · 4 / 4회 강화비 반영');
    assert.equal(await page.locator('#spareCost').textContent(),'12만 메소');
    assert.equal(await page.locator('#costMissing').isVisible(),false);
    assert.match(await page.locator('#profitCoverage').textContent(),/4 \/ 4회 비교 · 0회 제외/);
    assert.equal(await page.locator('#historyRows .history-loss').count(),1);
    const comparisonActual=await page.evaluate(()=>[12,15,12,13].reduce((sum,star)=>sum+StarforceData.baseCost(star,200),123456));
    assert.equal(await page.locator('#profitActual').textContent(),compactMeso(comparisonActual));
    await page.locator('#sessionSelect').selectOption('4:4');
    assert.equal(await page.locator('#totalCostExact').textContent(),compactMeso(segmentBase+123456)+' · 4 / 4회 강화비 반영');
    await page.locator('#analysisConfirmed').check();await page.locator('#analysisForm button[type=submit]').click();assert.match(await page.locator('#analysisResult').innerText(),/스타캐치 성공이 확인되지/);
    await page.locator('#sessionSelect').selectOption('2:3');await page.locator('#analysisConfirmed').check();await page.locator('#analysisForm button[type=submit]').click();assert.match(await page.locator('#analysisResult').innerText(),/미달성/);
    await page.locator('#detailClose').click();await reloadSaved();
    await page.locator('#historyFrom').evaluate((el,date)=>el._flatpickr.setDate(date,true),today);
    await page.locator('#historyFetch').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('조회 완료'));
    assert.equal(await page.locator('#totalCostExact').textContent(),compactMeso(segmentBase+123456)+' · 4 / 4회 강화비 반영');
    assert.equal(await page.evaluate(async()=>{const cache=await StarforceHistoryCache.open('different-test-key');try{return (await cache.getSettings())===undefined;}finally{cache.close();}}),true);
    await resetFixture();
    const yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
    await page.evaluate(async({date,row})=>{const cache=await StarforceHistoryCache.open('test-only-key');try{await cache.set(date,[{...row,date_create:date+'T12:00:00+09:00'}]);}finally{cache.close();}},{date:yesterday,row:segments[0]});
    await page.locator('#historyFrom').evaluate((el,date)=>el._flatpickr.setDate(date,true),yesterday);
    mode='error';await page.locator('#historyFetch').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('부분 기록만'));
    assert.equal(await page.locator('#totalTries').innerText(),'1회');assert.match(await page.locator('#costStatus').innerText(),/일부 비용 미반영/);assert.match(await page.locator('#totalCostScope').innerText(),/조회 미완료/);
    await resetFixture();
    await page.locator('#historyFrom').evaluate((el,date)=>el._flatpickr.setDate(date,true),today);
    mode='worlds';await page.locator('#historyFetch').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('조회 완료'));
    assert.equal(await page.locator('#totalTries').innerText(),'3회');
    assert.equal(await page.locator('#historyCharacterOptions input').count(),3);
    assert.match(await page.locator('#historyCharacterOptions').textContent(),/저렙캐릭터 · Lv.120/);
    await choose('world',['스카니아','루나']);assert.equal(await page.locator('#totalTries').innerText(),'3회');
    await choose('character',[character('스카니아'),character('루나')]);assert.equal(await page.locator('#totalTries').innerText(),'2회');
    assert.match(await page.locator('#totalCostScope').innerText(),/전체 서버 · 2명 선택/);
    await choose('world',['루나']);assert.equal(await page.locator('#totalTries').innerText(),'1회');
    await choose('character');assert.equal(await page.locator('#totalTries').innerText(),'2회');
    const worldCalls=calls.length;
    await choose('character',[character('루나')]);assert.equal(await page.locator('#totalTries').innerText(),'1회');
    await page.locator('#historyItems button').first().click();assert.match(await page.locator('#itemSubtitle').innerText(),/Lv. 140 · 반지/);await page.locator('#detailClose').click();
    await choose('character',[character('루나','저렙캐릭터')]);assert.equal(await page.locator('#totalTries').innerText(),'1회');
    await page.locator('#historyItems button').first().click();assert.match(await page.locator('#itemSubtitle').innerText(),/Lv. 120 · 펜던트/);await page.locator('#detailClose').click();
    assert.equal(calls.length,worldCalls);
    characterMode='error';await page.locator('#historyCharactersRefresh').click();await page.waitForFunction(()=>document.querySelector('#historyCharactersStatus').textContent.includes('불러오지 못했습니다'));
    assert.equal(await page.locator('#totalTries').innerText(),'1회');
    await choose('character',[character('루나')]);assert.equal(await page.locator('#totalTries').innerText(),'1회');
    characterMode='normal';await page.locator('#historyCharactersRefresh').click();await page.waitForFunction(()=>!document.querySelector('#historyCharactersRefresh').disabled);
    await choose('world');await choose('character');
    await resetFixture();
    mode='loss';await page.locator('#historyFetch').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('조회 완료'));
    const aggregateBeforeGoal=await page.locator('#totalProfit').innerText();assert.match(aggregateBeforeGoal,/손해/);
    await page.locator('#historyItems button').first().click();await page.locator('#analysisSettings > summary').click();await page.locator('#itemGoal').fill('13');await page.locator('#analysisConfirmed').check();await page.locator('#analysisForm button[type=submit]').click();
    assert.match(await page.locator('#itemComparison').innerText(),/손해 \(초과\)/);assert.equal(await page.locator('#itemComparison.loss').count(),1);
    assert.equal(await page.locator('#totalProfit').innerText(),aggregateBeforeGoal);
    assert.ok(characterCalls>0);await page.locator('#detailClose').click();
    await resetFixture();
    mode='currency';await page.locator('#historyFetch').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('조회 완료'));
    const currencyCalls=calls.length;
    assert.equal(await page.locator('#totalTries').innerText(),'2회');assert.match(await page.locator('#profitCoverage').textContent(),/2 \/ 2회 비교 · 0회 제외/);
    assert.equal(await page.locator('#totalDestroy').innerText(),'0회');assert.equal(await page.locator('#historyItems button').count(),1);
    assert.equal(await page.locator('#historyCharacterOptions input').count(),1);
    assert.doesNotMatch(await page.locator('#historyCharacterOptions').textContent(),/특수재화캐릭터/);
    assert.doesNotMatch(await page.locator('#historyItems').innerText(),/특수 전용/);
    const normalCost=await page.evaluate(()=>StarforceData.baseCost(13,200)+StarforceData.baseCost(15,200));
    assert.equal(await page.locator('#totalCostExact').textContent(),compactMeso(normalCost)+' · 2 / 2회 강화비 반영');
    assert.equal(await page.locator('#historyItems .history-card-profit').innerText(),await page.locator('#totalProfit').innerText());
    await page.locator('#historyItems button').first().click();
    assert.equal(await page.locator('#sessionSelect option').count(),3);
    assert.equal(await page.locator('#historyRows .history-gain').count(),1);assert.equal(await page.locator('#historyRows .history-loss').count(),1);
    assert.equal(await page.locator('#historyRows .history-attempt-reference').count(),2);
    assert.match(await page.locator('#historyRows').innerText(),/상승 기대비용/);
    await page.locator('#analysisSettings > summary').click();await page.locator('#itemSpare').fill('100000000');await page.locator('#costUpdate').click();await page.waitForFunction(()=>document.querySelector('#analysisResult').textContent.includes('저장했습니다'));
    assert.equal(await page.locator('#totalCostExact').textContent(),compactMeso(normalCost)+' · 2 / 2회 강화비 반영');
    assert.equal(await page.locator('#spareCost').textContent(),'0 메소');
    await page.locator('#detailClose').click();
    assert.equal(await page.locator('#historyItems .history-card-profit').innerText(),await page.locator('#totalProfit').innerText());assert.equal(calls.length,currencyCalls);
    await resetFixture();
    mode='special';await page.locator('#historyFetch').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('조회 완료'));
    assert.equal(await page.locator('#historyCharacterOptions input').count(),0);
    assert.equal(await page.locator('#totalTries').innerText(),'0회');assert.equal(await page.locator('#totalProfit').innerText(),'—');
    assert.equal(await page.locator('#totalCost').innerText(),'0 메소');assert.equal(await page.locator('#historyItems button').count(),0);
    assert.equal(await page.locator('#profitActual').textContent(),'—');assert.equal(await page.locator('#totalGains').textContent(),'—');
    await resetFixture();
    mode='revamp';await page.locator('#historyFetch').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('조회 완료'));
    assert.equal(await page.locator('#totalTries').innerText(),'1,235회');assert.match(await page.locator('#profitCoverage').textContent(),/1,234 \/ 1,235회 비교 · 1회 제외/);
    assert.match(await page.locator('#totalProfit').innerText(),/손해/);assert.match(await page.locator('#profitStatus').innerText(),/일부 비교/);
    const reasons=await page.locator('#profitExcluded').textContent();assert.doesNotMatch(reasons,/스타캐치|특수 강화 재화|이벤트 범위/);assert.match(reasons,/레벨 미확인.*1회 제외/);
    const unavailable=page.locator('#historyItems button').filter({hasText:'미등록 장비'});
    assert.match(await unavailable.locator('.history-card-profit').getAttribute('title'),/장비 레벨 미확인/);
    await unavailable.click();assert.match(await page.locator('#itemOverview').innerText(),/손익 제외: 장비 레벨 미확인 1회/);await page.locator('#detailClose').click();
    assert.equal(await page.locator('#financeDetails').evaluate(el=>el.open),false);assert.equal(await page.locator('#profitExcluded').isVisible(),false);
    await page.screenshot({path:path.join(output,'starforce-history-revamp.png'),fullPage:true});
    const revampCalls=calls.length,revampTotal=await page.locator('#totalProfit').innerText();
    await reloadSaved();await page.locator('#historyFrom').evaluate((el,date)=>el._flatpickr.setDate(date,true),today);
    await page.locator('#historyFetch').click();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('조회 완료'));
    assert.equal(calls.length,revampCalls);assert.equal(await page.locator('#totalProfit').innerText(),revampTotal);
    await page.evaluate(async({date,records})=>{
      const cache=await StarforceHistoryCache.open('test-only-key'),now=Date.now;Date.now=()=>now()-600000;
      try{await cache.set(date,records);}finally{Date.now=now;cache.close();}
    },{date:today,records:rows});
    const refreshStarted=new Promise(resolve=>notifyRefresh=resolve);
    mode='refresh';const beforeRefresh=calls.length;await page.reload();
    await page.waitForFunction(()=>document.querySelector('#totalTries').textContent==='12회'&&!document.querySelector('#historyCancel').hidden);
    await refreshStarted;assert.equal(calls.length,beforeRefresh+1);await page.locator('#historyItems button').first().click();
    releaseRefresh();await page.waitForFunction(()=>document.querySelector('#historyStatus').textContent.includes('조회 완료'));
    assert.equal(await page.locator('#totalTries').innerText(),'13회');assert.equal(await page.locator('#historyDetail').isVisible(),true);await page.locator('#detailClose').click();
    const afterRefresh=calls.length;await reloadSaved();assert.equal(calls.length,afterRefresh);assert.equal(await page.locator('#totalTries').innerText(),'13회');
    await page.goto(base+'/index.html');assert.equal(await page.locator('.site-tab[data-group=history]').count(),1);
    await page.locator('.site-tab[data-group=history]').click();assert.match(page.url(),/starforce_history.html/);
    assert.deepEqual(errors,[]);
    console.log('PASS: attempt gains/losses and target independence, destruction, unified summary and compact equipment cards, special currency excluded, server icons/filters, account character API and fallback, low-level characters, totals, missing costs, replacement costs, settings reload/isolation, sessions, starcatch, partial totals, XSS, API error/cancel, navigation, mobile overflow, no browser errors.');
    console.log('Screenshots: '+path.join(output,'starforce-history-desktop.png')+'; '+path.join(output,'starforce-history-mobile.png'));
  }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
