'use strict';

const {createHash,randomUUID}=require('node:crypto');
const {redisCommand,createStore:createRateStore}=require('./rate-store.cjs');
const {catalog}=require('../party_boss_scheduler.js');
const {validName}=require('../scouter_data.js');
const {accountId}=require('../account_catalog.js');
const bossLimits=new Map(catalog(require('../boss_db.js')).map(boss=>[boss.id,boss.max]));
const KEY='maplejackcal:boss-parties:v1';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const WRITE=`local old=redis.call('HGET',KEYS[1],ARGV[1])
local created=tonumber(ARGV[6])
local owner=ARGV[2]
if old then
  local record=cjson.decode(old)
  -- 공유 파티는 누구나 수정한다. 만든 사람 기록은 처음 값을 유지한다.
  owner=record.owner
  if ARGV[4]=='save' and record.payload==ARGV[5] then return old end
  if record.revision~=ARGV[3] then return 0 end
  if ARGV[4]=='delete' then return redis.call('HDEL',KEYS[1],ARGV[1]) end
  created=record.createdAt
else
  if ARGV[4]=='delete' then return 1 end
  if ARGV[3]~='' then return 0 end
  if redis.call('HLEN',KEYS[1])>=200 then return -1 end
end
local value=cjson.encode({owner=owner,revision=ARGV[7],payload=ARGV[5],createdAt=created})
redis.call('HSET',KEYS[1],ARGV[1],value)
return value`;

function ownerHash(token){
  return typeof token==='string'&&uuid.test(token)?createHash('sha256').update(token).digest('hex'):'';
}
function publicParty(record,owner){
  return {...JSON.parse(record.payload),revision:record.revision,canEdit:true,mine:Boolean(owner&&record.owner===owner)};
}
function createStore({command=redisCommand(),key=KEY+(process.env.VERCEL_ENV==='preview'?':preview':''),rates=createRateStore({command})}={}){
  async function read(token){
    const owner=ownerHash(token);
    const rows=command?(await command(['HVALS',key])).map(row=>JSON.parse(row)):[];
    rows.sort((a,b)=>a.createdAt-b.createdAt||a.revision.localeCompare(b.revision));
    return {persistent:!!command,parties:rows.map(record=>publicParty(record,owner))};
  }
  async function write(action,raw,token,expected){
    if(!command)throw new Error('PARTY_NOT_CONFIGURED');
    const owner=ownerHash(token);
    if(!owner)throw new Error('PARTY_FORBIDDEN');
    if(!raw||typeof raw.id!=='string'||!uuid.test(raw.id)||typeof expected!=='string'||(expected&&!uuid.test(expected)))throw new Error('PARTY_INVALID');
    let payload='';
    if(action==='save'){
      const name=typeof raw.name==='string'?raw.name.trim():'';
      const max=bossLimits.get(raw.bossId);
      if(!name||name.length>60||!max||!Array.isArray(raw.members)||raw.members.length>max||!raw.members.every(validName)||new Set(raw.members).size!==raw.members.length)throw new Error('PARTY_INVALID');
      if(raw.members.length){
        const registry=await rates.read(),registered=new Set(registry.snapshots.map(snapshot=>snapshot.characterName));
        if(raw.members.some(name=>!registered.has(name)))throw new Error('PARTY_MEMBER_NOT_REGISTERED');
        if(new Set(raw.members.map(name=>accountId(registry,name))).size!==raw.members.length)throw new Error('PARTY_ACCOUNT_CONFLICT');
      }
      payload=JSON.stringify({id:raw.id,name,bossId:raw.bossId,members:raw.members});
    }
    const result=await command(['EVAL',WRITE,1,key,raw.id,owner,expected,action,payload,String(Date.now()),randomUUID()]);
    if(result===0)throw new Error('PARTY_CONFLICT');
    if(result===-1)throw new Error('PARTY_LIMIT');
    if(result===-2)throw new Error('PARTY_FORBIDDEN');
    return action==='delete'?{id:raw.id}:{party:publicParty(JSON.parse(result),owner)};
  }
  return {read,write};
}

module.exports={createStore,WRITE};
