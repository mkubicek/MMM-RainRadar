"use strict";
const {MeteoSwissSource}=require("./weather-source");
function dayKey(time,zone){const parts=new Intl.DateTimeFormat("en-GB",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(time*1000));return ["year","month","day"].map(k=>parts.find(p=>p.type===k).value).join("-");}
// MeteoSwiss symbol numbers mapped to our own condition drawings; no proprietary graphics.
function condition(value){
  if(!Number.isFinite(value))return {code:null,night:false,description:"Unavailable"};
  const night=value>=100,n=night?value-100:value;
  if(value===133)return {code:600,night:true,description:"Snow"};
  if(n===1)return {code:800,night:night,description:night?"Clear sky":"Sunny"};
  if([2,3,26].indexOf(n)>=0)return {code:801,night:night,description:"Partly cloudy"};
  if([27,28].indexOf(n)>=0)return {code:741,night:night,description:n===28?"Fog":"Low cloud"};
  if([12,13,23,24,25,36,37,38,39,40,41,42].indexOf(n)>=0)return {code:200,night:night,description:"Thunderstorms"};
  if([7,10,15,18,21,31].indexOf(n)>=0)return {code:611,night:night,description:"Rain and snow"};
  if([8,11,16,19,22,30,34].indexOf(n)>=0)return {code:600,night:night,description:"Snow"};
  if([6,9,14,17,20,29,32,33].indexOf(n)>=0)return {code:500,night:night,description:"Rain"};
  if([4,5,35].indexOf(n)>=0)return {code:804,night:night,description:"Cloudy"};
  return {code:null,night:night,description:"Unavailable"};
}
function normalize(raw,now){
  const f=raw.fields;
  const get=(key,t)=>f[key]&&f[key].has(t)?f[key].get(t):null;
  if(!f.tre200h0||!f.tre200pn||!f.tre200px)throw new Error("Incomplete MeteoSwiss forecast");
  const hourly=Array.from(f.tre200h0.keys()).filter(t=>t>=now/1000-7200&&t<=now/1000+20*3600).sort((a,b)=>a-b).map(time=>Object.assign({time:time,temp:get("tre200h0",time),feels:null,wind:get("fu3010h0",time)===null?null:get("fu3010h0",time)/3.6,rain:get("rre150h0",time),pop:get("rp0003i0",time)===null?null:Math.max(0,Math.min(1,get("rp0003i0",time)/100))},condition(get("jww003i0",time))));
  const current=hourly.find(h=>h.time>=now/1000&&h.temp!==null)||hourly.filter(h=>h.temp!==null).slice(-1)[0];
  if(!current)throw new Error("No current forecast temperature");
  const daily=Array.from(f.tre200pn.keys()).sort((a,b)=>a-b).map(time=>Object.assign({time:time,date:new Date(time*1000).toISOString().slice(0,10),low:get("tre200pn",time),high:get("tre200px",time),pop:null,rain:get("rka150p0",time),wind:null},condition(get("jp2000d0",time))));
  return {source:"MeteoSwiss",intervalHours:3,intervalEnding:true,current:current,hourly:hourly,daily:daily,fetchedAt:now,issuedAt:raw.issuedAt,point:raw.point,run:raw.run};
}
class WeatherProvider{
  constructor(options){options=options||{};this.source=options.source||new MeteoSwissSource(options);this.now=options.now||Date.now;this.cache=new Map();this.pending=new Map();}
  async forecast(config){
    const id=JSON.stringify([config.location.latitude,config.location.longitude]);const hit=this.cache.get(id);
    if(hit&&this.now()-hit.fetchedAt<900000)return hit;
    if(this.pending.has(id))return this.pending.get(id);
    const job=(async()=>{
      // Reuse extracted point data while the website forecast version is unchanged.
      const latest=await this.source.latest();
      if(hit&&hit.run===latest.run){const cached=Object.assign({},hit,{fetchedAt:this.now()});this.cache.set(id,cached);return cached;}
      const raw=await this.source.load(config),result=normalize(raw,this.now());this.cache.delete(id);this.cache.set(id,result);
      while(this.cache.size>32)this.cache.delete(this.cache.keys().next().value);return result;
    })();this.pending.set(id,job);try{return await job;}finally{this.pending.delete(id);}
  }
}
module.exports={WeatherProvider,normalize,condition,dayKey};
