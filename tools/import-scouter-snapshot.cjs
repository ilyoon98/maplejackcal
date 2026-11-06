'use strict';
const fs=require('node:fs');
const path=require('node:path');
const data=require('../scouter_data.js');
function convert(capture){
  const match=typeof capture.character==='string'&&capture.character.match(/^Lv\.\s*\d+\s+(.+?)\s*\//);
  const name=match&&match[1].trim(),preset=capture.preset;
  if(!data.validName(name)||!data.validPreset(preset)||capture.captureMethod!=='browser-dom'||capture.time!=='20'||capture.destinyChampion!=='true'||capture.simulation!=='false')throw new Error('Capture identity or calculation conditions are invalid');
  if(!Array.isArray(capture.rows)||capture.rows.length>100)throw new Error('Invalid capture rows');
  const parsed=data.rowsToRates(capture.rows.map(row=>({icon:row[0],percent:row[1],eligibility:row[2]})));
  const raw={schemaVersion:1,characterName:name,preset,sourceUrl:data.resultUrl(name,preset),fetchedAt:capture.fetchedAt,conditions:{view:'all',bossTimeMinutes:20,destinyChampion:true,simulation:false},rates:parsed.rates,storage:'public-json'};
  const valid=data.normalizeSnapshot(raw,name,preset);if(!valid)throw new Error('Invalid captured snapshot');
  return {...valid,storage:'public-json',captureMethod:'browser-dom',observedPageTime:capture.observedPageTime,rowCount:capture.rows.length,unmapped:parsed.unmapped,sourceRows:capture.rows};
}
if(require.main===module){
  try{
    if(!process.argv[2])throw new Error('Usage: node tools/import-scouter-snapshot.cjs <browser-capture.json>');
    const snapshot=convert(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
    const output=path.resolve(__dirname,'../shared_scouter_snapshots.json');
    const existing=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{schemaVersion:1,snapshots:[]};
    if(existing.schemaVersion!==1||!Array.isArray(existing.snapshots))throw new Error('Existing shared store is invalid');
    const snapshots=existing.snapshots.filter(s=>s.characterName!==snapshot.characterName||s.preset!==snapshot.preset);
    snapshots.push(snapshot);
    fs.writeFileSync(output,JSON.stringify({schemaVersion:1,snapshots},null,2)+'\n');
    console.log(snapshot.characterName+': '+snapshot.rowCount+' captured rows, '+snapshot.rates.length+' supported rates saved to shared_scouter_snapshots.json');
  }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={convert};
