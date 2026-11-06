'use strict';
const {timingSafeEqual}=require('node:crypto');
const {createStore}=require('../server/rate-store.cjs');
function createHandler(store=createStore(),env=process.env){return async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  function reply(status,body){res.statusCode=status;res.end(JSON.stringify(body));}
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return reply(405,{error:{code:'METHOD_NOT_ALLOWED'}});}
  try{
    if(req.method==='GET')return reply(200,{...await store.read(),requiresPin:!!env.RATE_EDIT_PIN});
    if(req.headers['sec-fetch-site']==='cross-site')return reply(403,{error:{code:'RATE_ORIGIN'}});
    if(!(req.headers['content-type']||'').startsWith('application/json'))return reply(415,{error:{code:'RATE_CONTENT_TYPE'}});
    if(env.RATE_EDIT_PIN){const a=Buffer.from(String(req.headers['x-rate-pin']||'')),b=Buffer.from(env.RATE_EDIT_PIN);if(a.length!==b.length||!timingSafeEqual(a,b))return reply(401,{error:{code:'RATE_PIN_REQUIRED'}});}
    let body=req.body;
    if(!body){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536)return reply(413,{error:{code:'RATE_TOO_LARGE'}});}body=JSON.parse(raw);}
    if(typeof body==='string'){if(Buffer.byteLength(body)>65536)return reply(413,{error:{code:'RATE_TOO_LARGE'}});body=JSON.parse(body);}
    if(Buffer.byteLength(JSON.stringify(body))>65536)return reply(413,{error:{code:'RATE_TOO_LARGE'}});
    reply(200,body.action==='accounts'?await store.saveAccounts(body.accounts,body.expectedRevision):{snapshot:await store.save(body.snapshot,body.expectedRevision)});
  }catch(e){const code=['RATE_DB_NOT_CONFIGURED','RATE_CONFLICT','RATE_INVALID','ACCOUNT_INVALID','RATE_LIMIT'].includes(e.message)?e.message:e instanceof SyntaxError?'RATE_INVALID':'RATE_DB_UNAVAILABLE';reply(code==='RATE_CONFLICT'?409:['RATE_INVALID','ACCOUNT_INVALID'].includes(code)?400:code==='RATE_LIMIT'?429:503,{error:{code}});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
