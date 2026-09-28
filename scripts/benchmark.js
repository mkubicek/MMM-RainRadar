"use strict";
// Read-only workload: one cold live load and one cached refresh. No MagicMirror restart.
const {RadarProvider}=require("../lib/provider");
const core=require("../public/core");
const provider=new RadarProvider();
const config=core.normalize({});
async function run(label){
  const cpu=process.cpuUsage(),start=Date.now();
  const data=await provider.series(config);
  const used=process.cpuUsage(cpu);
  console.log(JSON.stringify({label:label,node:process.version,frames:data.frames.length,available:data.frames.filter(f=>f.available).length,
    elapsedMs:Date.now()-start,cpuMs:(used.user+used.system)/1000,frontendBytes:Buffer.byteLength(JSON.stringify(data)),
    heapMiB:Math.round(process.memoryUsage().heapUsed/1048576*10)/10,rssMiB:Math.round(process.memoryUsage().rss/1048576*10)/10,
    rawCacheBytes:provider.bytes,preparedCacheBytes:provider.preparedBytes}));
}
run("cold").then(()=>run("warm")).catch(e=>{console.error(e.message);process.exitCode=1;});
