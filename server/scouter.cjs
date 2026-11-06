'use strict';
const path=require('node:path');
const fs=require('node:fs');
const data=require('../scouter_data.js');

function failure(code){const e=new Error(code);e.code=code;return e;}

// The function runs in the loaded result page. Read rendered card text, never
// React internals, tokens, or an undocumented provider endpoint.
function extractRenderedResult(){
  const heading=Array.from(document.querySelectorAll('h1,h2,h3,h4')).find(n=>/^Lv\.\s*\d+\s/.test(n.textContent.trim()));
  const match=heading?.textContent.trim().match(/^Lv\.\s*\d+\s+(.+?)\s*\//);
  const rows=Array.from(document.querySelectorAll('img[alt="boss"]')).map(img=>{
    const card=img.closest('button')?.parentElement;
    const text=card?.innerText||'';
    const value=text.match(/(?:\[파티\]\s*)?([\d,.]+)\s*%/);
    return {icon:img.getAttribute('src'),percent:value?Number(value[1].replaceAll(',','')):null,eligibility:text.split('\n')[0]};
  });
  const body=document.body.innerText;
  const time=body.match(/적용중인\s*보스\s*시간\s*:\s*(\d+)\s*분/);
  const simHeading=Array.from(document.querySelectorAll('h1,h2,h3,h4')).find(n=>n.textContent.trim()==='추가 스펙 시뮬레이터');
  let simContainer=simHeading;
  while(simContainer&&simContainer!==document.body&&!simContainer.querySelector('[role="switch"]'))simContainer=simContainer.parentElement;
  const simulation=simContainer&&simContainer!==document.body?simContainer.querySelector('[role="switch"]'):null;
  const allTab=Array.from(document.querySelectorAll('[role="tab"]')).find(n=>n.textContent.trim()==='전체 보기');
  return {characterName:match?.[1].trim()||'',rows,bossTimeMinutes:time?Number(time[1]):null,allView:allTab?.getAttribute('aria-selected')==='true',destinyChampion:document.getElementById('destiny-checkbox')?.getAttribute('aria-checked')==='true',simulation:simulation?simulation.getAttribute('aria-checked')==='true':null};
}

async function launchBrowser(){
  const {chromium}=require('playwright-core');
  if(process.env.SCOUTER_CDP_URL){
    // An operator-owned standard browser service may be selected for deployment.
    // Use a separate context; never read or alter its existing tabs or storage.
    return chromium.connectOverCDP(process.env.SCOUTER_CDP_URL,{timeout:15000});
  }
  let executablePath=process.env.SCOUTER_BROWSER_EXECUTABLE_PATH;
  let args=[];
  if(!executablePath&&process.platform==='win32')executablePath=[path.join(process.env.PROGRAMFILES||'C:\\Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)','Microsoft/Edge/Application/msedge.exe')].find(p=>fs.existsSync(p));
  if(!executablePath&&process.platform==='darwin')executablePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if(!executablePath){const mod=await import('@sparticuz/chromium');executablePath=await mod.default.executablePath();args=mod.default.args;}
  return chromium.launch({executablePath,args,headless:true,timeout:15000});
}

async function scrape(name,preset='00000',options={}){
  const started=Date.now(),sourceUrl=data.resultUrl(name,preset),browser=await (options.launchBrowser||launchBrowser)();
  function budget(max){const remaining=45000-(Date.now()-started);if(remaining<=0)throw failure('SCOUTER_TIMEOUT');return Math.min(max,remaining);}
  let context;
  try{
    context=await browser.newContext({locale:'ko-KR',timezoneId:'Asia/Seoul',viewport:{width:1280,height:900},serviceWorkers:'block'});
    const page=await context.newPage();page.setDefaultTimeout(budget(12000));
    const response=await page.goto(sourceUrl,{waitUntil:'domcontentloaded',timeout:budget(25000)});
    if(response&&[401,403,429].includes(response.status()))throw failure('SCOUTER_BLOCKED');
    if(response&&response.status()>=400)throw failure('SCOUTER_UNAVAILABLE');
    await page.waitForFunction(()=>{
      const cards=document.querySelectorAll('img[alt="boss"]');
      return cards.length>0&&Array.from(cards).some(img=>/\d\s*%/.test(img.closest('button')?.parentElement?.innerText||''));
    },null,{timeout:budget(20000)});
    const close=page.getByRole('button',{name:'Close',exact:true});if(await close.count())await close.click({timeout:budget(5000)});
    await page.getByRole('tab',{name:'전체 보기',exact:true}).click({timeout:budget(5000)});
    await page.getByRole('tab',{name:'전체 보기',exact:true}).waitFor({state:'visible',timeout:budget(5000)});
    const raw=await page.evaluate(extractRenderedResult);
    if(raw.characterName!==name)throw failure('SCOUTER_CHARACTER_MISMATCH');
    if(!raw.allView||raw.bossTimeMinutes!==20||!raw.destinyChampion||raw.simulation!==false)throw failure('SCOUTER_CONDITIONS_CHANGED');
    const {rates,unmapped}=data.rowsToRates(raw.rows);
    return {schemaVersion:1,characterName:name,preset,sourceUrl,fetchedAt:new Date().toISOString(),conditions:{view:'all',bossTimeMinutes:20,destinyChampion:true,simulation:false},rates,unmapped,rowCount:raw.rows.length};
  }catch(error){
    if(error.code?.startsWith('SCOUTER_'))throw error;
    if(error.message?.startsWith('SCOUTER_'))throw failure(error.message);
    if(error.code==='MODULE_NOT_FOUND')throw failure('SCOUTER_NOT_CONFIGURED');
    if(error.name==='TimeoutError')throw failure('SCOUTER_TIMEOUT');
    throw failure('SCOUTER_UNAVAILABLE');
  }finally{
    if(context)await context.close().catch(()=>{});
    await browser.close().catch(()=>{});
  }
}

function createService({collect=scrape,now=Date.now,ttl=15*60*1000,maxEntries=100,maxConcurrent=1}={}){
  const cache=new Map(),pending=new Map();let active=0;
  return {async get(name,preset='00000'){
    data.resultUrl(name,preset);const key=name+'|'+preset,cached=cache.get(key);
    if(cached&&now()-cached.time<ttl)return {...cached.value,cached:true};
    if(pending.has(key))return pending.get(key);
    if(active>=maxConcurrent)throw failure('SCOUTER_BUSY');
    active++;
    const task=Promise.resolve().then(()=>collect(name,preset)).then(value=>{
      if(!data.normalizeSnapshot(value,name,preset))throw failure('SCOUTER_INVALID_RESPONSE');
      cache.delete(key);cache.set(key,{time:now(),value});while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
      return {...value,cached:false};
    }).finally(()=>{active--;pending.delete(key);});
    pending.set(key,task);return task;
  }};
}
module.exports={scrape,extractRenderedResult,createService};
