'use strict';
const {scrape}=require('../server/scouter.cjs');
const fs=require('node:fs');
(async()=>{
 const result=await scrape(process.argv[2]||'토끼털쇼타');
 console.log(JSON.stringify({characterName:result.characterName,rowCount:result.rowCount,mapped:result.rates.length,sample:result.rates.filter(r=>['Lotus|Extreme','TheFirstAdversary|Normal','RadiantMalefic|Normal'].includes(r.bossId))},null,2));
 if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
