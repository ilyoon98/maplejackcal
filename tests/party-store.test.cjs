'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createStore,WRITE}=require('../server/party-store.cjs');
const {createHandler}=require('../api/boss-parties.js');

function memoryRedis(){
  const entries=new Map();
  return async function command(args){
    if(args[0]==='HVALS')return [...entries.values()].map(record=>JSON.stringify(record));
    assert.equal(args[0],'EVAL');assert.equal(args[1],WRITE);
    const [,,,,id,owner,expected,action,payload,createdAt,revision]=args;
    const old=entries.get(id);
    if(old&&action==='save'&&old.payload===payload)return JSON.stringify(old);
    if(old&&old.revision!==expected)return 0;
    if(action==='delete'){entries.delete(id);return 1;}
    if(!old&&expected)return 0;
    const record={owner:old?.owner||owner,payload,createdAt:old?.createdAt||Number(createdAt),revision};
    entries.set(id,record);return JSON.stringify(record);
  };
}
function fixture(){
  const command=memoryRedis(),rates={read:async()=>({snapshots:['첫캐릭터','부캐','둘째캐릭터'].map(characterName=>({characterName})),accounts:[{id:'one',characters:[{name:'첫캐릭터'},{name:'부캐'}]}]})};
  const store=()=>createStore({command,rates});
  const party={id:randomUUID(),name:'금요팟',bossId:'Lotus|Extreme',members:['첫캐릭터','둘째캐릭터']};
  return {store,party,owner:randomUUID()};
}
async function call(handler,method,body,owner,headers={}){
  let payload;const res={setHeader(){},end(text){payload=JSON.parse(text);}};
  await handler({method,body,headers:{'content-type':'application/json','x-party-owner':owner,...headers}},res);
  return {status:res.statusCode,payload};
}
test('공유 파티는 다른 서버에서도 조회되고 만든 브라우저만 수정하거나 삭제한다',async()=>{
  const {store,party,owner}=fixture(),a=createHandler(store()),b=createHandler(store());
  const request={action:'save',party:{...party,ocid:'private',apiKey:'secret'},revision:''};
  const created=await call(a,'POST',request,owner);assert.equal(created.status,200);
  const revision=created.payload.party.revision;
  assert.equal((await call(a,'POST',request,owner)).payload.party.revision,revision);
  const publicList=(await call(b,'GET')).payload;
  assert.deepEqual(publicList.parties,[{...party,revision,canEdit:true,mine:false}]);
  assert(!JSON.stringify(publicList).includes(owner));
  assert.equal((await call(b,'GET',undefined,owner)).payload.parties[0].mine,true);
  // 다른 브라우저도 수정할 수 있고, 만든 사람 기록은 그대로 남는다.
  const edit=await call(b,'POST',{action:'save',party:{...party,name:'토요팟'},revision},randomUUID());
  assert.equal((await call(b,'GET',undefined,owner)).payload.parties[0].mine,true);
  assert.equal(edit.status,200);assert.notEqual(edit.payload.party.revision,revision);
  assert.equal((await call(b,'POST',{action:'save',party:{...party,name:'일요팟'},revision},owner)).status,409);
  assert.equal((await call(a,'POST',{action:'delete',party:{id:party.id},revision:edit.payload.party.revision},owner)).status,200);
  assert.deepEqual((await call(b,'GET')).payload.parties,[]);
});
test('공유 파티는 미등록 캐릭터, 같은 계정 중복, 인원 초과, 외부 사이트 쓰기를 거부한다',async()=>{
  const {store,party,owner}=fixture(),handler=createHandler(store());
  for(const [members,code] of [[['미등록'],'PARTY_MEMBER_NOT_REGISTERED'],[['첫캐릭터','부캐'],'PARTY_ACCOUNT_CONFLICT'],[['첫캐릭터','부캐','둘째캐릭터'],'PARTY_INVALID']]){
    const response=await call(handler,'POST',{action:'save',party:{...party,members},revision:''},owner);
    assert.equal(response.status,400);assert.equal(response.payload.error.code,code);
  }
  assert.equal((await call(handler,'POST',{action:'save',party,revision:''},owner,{'sec-fetch-site':'cross-site'})).status,403);
  assert.deepEqual((await call(handler,'GET')).payload.parties,[]);
});
