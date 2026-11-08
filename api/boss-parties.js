'use strict';
const {createStore}=require('../server/party-store.cjs');

const errors={PARTY_NOT_CONFIGURED:503,PARTY_INVALID:400,PARTY_MEMBER_NOT_REGISTERED:400,PARTY_ACCOUNT_CONFLICT:400,PARTY_FORBIDDEN:403,PARTY_CONFLICT:409,PARTY_LIMIT:429};

function createHandler(store=createStore()){
  return async function handler(req,res){
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    function reply(status,body){res.statusCode=status;res.end(JSON.stringify(body));}
    function fail(status,code){return reply(status,{error:{code}});}
    const owner=req.headers['x-party-owner'];
    try{
      if(req.method==='GET')return reply(200,await store.read(owner));
      if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return fail(405,'METHOD_NOT_ALLOWED');}
      if(req.headers['sec-fetch-site']==='cross-site')return fail(403,'PARTY_FORBIDDEN');
      if(!(req.headers['content-type']||'').startsWith('application/json'))return fail(415,'PARTY_CONTENT_TYPE');
      let body=req.body;
      if(body==null){
        body='';
        for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192)return fail(413,'PARTY_TOO_LARGE');}
      }
      if(typeof body==='string'){
        if(Buffer.byteLength(body)>8192)return fail(413,'PARTY_TOO_LARGE');
        body=JSON.parse(body);
      }
      if(Buffer.byteLength(JSON.stringify(body))>8192)return fail(413,'PARTY_TOO_LARGE');
      if(!body||!['save','delete'].includes(body.action))return fail(400,'PARTY_INVALID');
      return reply(200,await store.write(body.action,body.party,owner,body.revision));
    }catch(error){
      const code=error instanceof SyntaxError?'PARTY_INVALID':Object.hasOwn(errors,error.message)?error.message:'PARTY_UNAVAILABLE';
      return fail(errors[code]||503,code);
    }
  };
}

module.exports=createHandler();
module.exports.createHandler=createHandler;
