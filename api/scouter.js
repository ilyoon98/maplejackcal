'use strict';
const data=require('../scouter_data.js');
const {createService}=require('../server/scouter.cjs');
const service=createService();
const sharedStore=require('../shared_scouter_snapshots.json');
function createSharedSource(fallback=service,store=sharedStore){return {async get(name,preset){
  const snapshot=data.findShared(store,name,preset);
  return snapshot?{...snapshot,cached:true}:fallback.get(name,preset);
}};}
const defaultSource=createSharedSource();
function createHandler(source=defaultSource){return async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');res.statusCode=405;res.end(JSON.stringify({error:{code:'METHOD_NOT_ALLOWED'}}));return;}
  const url=new URL(req.url,'http://localhost'),names=url.searchParams.getAll('name'),presets=url.searchParams.getAll('preset');
  const name=names[0],preset=presets[0]||'00000';
  if(names.length!==1||presets.length>1||!data.validName(name)||!data.validPreset(preset)){res.statusCode=400;res.end(JSON.stringify({error:{code:'SCOUTER_BAD_INPUT'}}));return;}
  try{const result=await source.get(name,preset);res.statusCode=200;res.end(JSON.stringify(result));}
  catch(e){const known=['SCOUTER_BUSY','SCOUTER_BLOCKED','SCOUTER_TIMEOUT','SCOUTER_NOT_CONFIGURED','SCOUTER_CHARACTER_MISMATCH','SCOUTER_CONDITIONS_CHANGED','SCOUTER_INVALID_RESPONSE','SCOUTER_NO_RATES','SCOUTER_AMBIGUOUS_ROWS','SCOUTER_INVALID_PERCENT'];const code=known.includes(e.code)?e.code:'SCOUTER_UNAVAILABLE';res.statusCode=code==='SCOUTER_BUSY'?429:code==='SCOUTER_TIMEOUT'?504:503;if(code==='SCOUTER_BUSY')res.setHeader('Retry-After','15');res.end(JSON.stringify({error:{code}}));}
};}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.createSharedSource=createSharedSource;
