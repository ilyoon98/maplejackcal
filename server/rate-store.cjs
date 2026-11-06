'use strict';
const {randomUUID}=require('node:crypto');
const data=require('../scouter_data.js');
const accounts=require('../account_catalog.js');
const seed=require('../shared_scouter_snapshots.json');
const KEY='maplejackcal:boss-rates:v1';
// Compare and write one character atomically. Different characters never overwrite each other.
const WRITE=`local old=redis.call('HGET',KEYS[1],ARGV[1])
local revision=ARGV[4]
if old then revision=cjson.decode(old).revision end
if revision~=ARGV[2] then return 0 end
if not old and redis.call('HLEN',KEYS[1])>=500 then return -1 end
redis.call('HSET',KEYS[1],ARGV[1],ARGV[3])
return 1`;
function redisCommand(env=process.env,fetchImpl=fetch){
  const url=env.UPSTASH_REDIS_REST_URL||env.KV_REST_API_URL;
  const token=env.UPSTASH_REDIS_REST_TOKEN||env.KV_REST_API_TOKEN;
  if(!url||!token)return null;
  if(!/^https:\/\//.test(url))throw new Error('RATE_DB_CONFIG');
  return async args=>{const r=await fetchImpl(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});const body=await r.json();if(!r.ok||body.error)throw new Error('RATE_DB_UNAVAILABLE');return body.result;};
}
function createStore({command=redisCommand(),key=KEY+(process.env.VERCEL_ENV==='preview'?':preview':''),seeds=seed}={}){
  const id=s=>s.characterName+'|'+s.preset;
  const initial=seeds.snapshots.map(s=>({...data.normalizeSnapshot(s,s.characterName,s.preset),revision:'seed',storage:'public-json'}));
  async function read(){
    const entries=new Map(initial.map(s=>[id(s),s]));
    let registry={accounts:[],revision:''};
    if(command)for(const raw of await command(['HVALS',key])){const s=JSON.parse(raw);if(s.kind==='accounts'){registry={accounts:accounts.normalize(s.accounts),revision:s.revision};continue;}const valid=data.normalizeSnapshot(s,s.characterName,s.preset);if(valid)entries.set(id(valid),{...valid,revision:s.revision,storage:'shared-server'});}
    return {schemaVersion:1,persistent:!!command,snapshots:[...entries.values()],accounts:registry.accounts,accountRevision:registry.revision};
  }
  async function saveAccounts(raw,expectedRevision){
    if(!command)throw new Error('RATE_DB_NOT_CONFIGURED');if(typeof expectedRevision!=='string'||expectedRevision.length>80)throw new Error('ACCOUNT_INVALID');
    const value={kind:'accounts',accounts:accounts.normalize(raw),revision:randomUUID()};const result=await command(['EVAL',WRITE,1,key,'__accounts__',expectedRevision,JSON.stringify(value),'']);
    if(result===0)throw new Error('RATE_CONFLICT');if(result!==1)throw new Error('RATE_LIMIT');return {accounts:value.accounts,accountRevision:value.revision};
  }
  async function save(raw,expectedRevision){
    if(!command)throw new Error('RATE_DB_NOT_CONFIGURED');
    const s=raw&&data.normalizeSnapshot(raw,raw.characterName,raw.preset);
    if(!s||s.preset!=='00000'||typeof expectedRevision!=='string'||expectedRevision.length>80)throw new Error('RATE_INVALID');
    const value={...s,storage:'shared-server',revision:randomUUID(),savedAt:new Date().toISOString()};
    const result=await command(['EVAL',WRITE,1,key,id(s),expectedRevision,JSON.stringify(value),initial.some(i=>id(i)===id(s))?'seed':'']);
    if(result===0)throw new Error('RATE_CONFLICT');if(result!==1)throw new Error('RATE_LIMIT');return value;
  }
  return {read,save,saveAccounts};
}
module.exports={createStore,redisCommand,WRITE,KEY};
