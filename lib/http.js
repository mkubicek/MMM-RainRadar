"use strict";
const https=require("https");
function requestJSON(url, options) {
  options=options||{};
  return new Promise((resolve,reject)=>{
    let finished=false;
    const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(deadline);error?reject(error):resolve(value);};
    const req=https.get(url,{headers:{"User-Agent":"MMM-RainRadar/0.1","Accept":"application/json"}},res=>{
      if(res.statusCode!==200){res.resume();return finish(new Error("Weather service HTTP "+res.statusCode));}
      const chunks=[];let bytes=0;
      res.on("data",chunk=>{
        bytes+=chunk.length;
        if(bytes>(options.maxBytes||16*1024*1024)){finish(new Error("Weather response too large"));req.destroy();return;}
        chunks.push(chunk);
      });
      res.on("error",finish);
      res.on("end",()=>{try{finish(null,JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch(error){finish(new Error("Invalid weather JSON"));}});
    });
    const deadline=setTimeout(()=>{finish(new Error("Weather request timed out"));req.destroy();},options.timeout||10000);
    req.on("error",finish);
  });
}
module.exports={requestJSON};
