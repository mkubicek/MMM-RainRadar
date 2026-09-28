"use strict";
const {requestJSON}=require("./http");
const {decode}=require("./geometry");
const ROOT="https://www.meteoschweiz.admin.ch";
function framePath(path) {
  if(typeof path!=="string" || !/^\/product\/output\/(radar|inca)\/[a-zA-Z0-9_./-]+\.json$/.test(path) || path.indexOf("..")!==-1)throw new Error("Invalid weather frame path");
  return ROOT+path;
}
function selectFrames(animation, config) {
  if(!animation || !Array.isArray(animation.map_images))throw new Error("Invalid radar manifest");
  const unique=new Map();
  animation.map_images.forEach(day=>{
    if(!Array.isArray(day.pictures))throw new Error("Invalid radar manifest");
    day.pictures.forEach(p=>{
      if(!Number.isFinite(p.timestamp) || ["measurement","forecast"].indexOf(p.data_type)<0)return;
      framePath(p.radar_url);
      const previous=unique.get(p.timestamp);
      if(!previous || p.data_type==="measurement")unique.set(p.timestamp,{time:p.timestamp,kind:p.data_type,url:p.radar_url});
    });
  });
  const all=Array.from(unique.values()).sort((a,b)=>a.time-b.time);
  const observations=all.filter(f=>f.kind==="measurement");
  if(!observations.length)throw new Error("No radar observations available");
  const latest=observations[observations.length-1].time;
  const requestedEnd=latest+config.forecastHours*3600;
  const endFrame=all.find(f=>f.time>=requestedEnd) || all[all.length-1];
  const selected=[];
  all.filter(f=>f.time>=latest-config.pastMinutes*60 && f.time<=endFrame.time).forEach(f=>{
    if(!selected.length || f.time-selected[selected.length-1].time>=config.frameStepMinutes*60 || f.time===latest || f.time===endFrame.time)selected.push(f);
  });
  if(!selected.length || selected.length>400)throw new Error("Invalid radar timeline length");
  return {frames:selected,latestObservation:latest,requestedEnd:requestedEnd,horizonLimited:endFrame.time<requestedEnd};
}
class RadarProvider {
  constructor(options) {
    options=options||{};
    this.fetch=options.fetch||requestJSON;
    this.now=options.now||Date.now;
    this.cache=new Map();this.pending=new Map();this.bytes=0;
    this.prepared=new Map();this.preparedBytes=0;
    this.maxBytes=options.maxBytes||32*1024*1024;
    this.queue=[];this.active=0;this.concurrency=options.concurrency||4;
  }
  async json(url,ttl) {
    const hit=this.cache.get(url);
    if(hit && this.now()-hit.at<ttl){this.cache.delete(url);this.cache.set(url,hit);return hit.data;}
    if(this.pending.has(url))return this.pending.get(url);
    const promise=this.limited(()=>this.fetch(url)).then(data=>{
      const size=Buffer.byteLength(JSON.stringify(data));
      const old=this.cache.get(url);if(old){this.bytes-=old.size;this.cache.delete(url);}
      if(size<=this.maxBytes){
        this.cache.set(url,{at:this.now(),data:data,size:size});this.bytes+=size;
        while(this.bytes>this.maxBytes || this.cache.size>256){const key=this.cache.keys().next().value;this.bytes-=this.cache.get(key).size;this.cache.delete(key);}
      }
      return data;
    });
    this.pending.set(url,promise);
    try{return await promise;}finally{this.pending.delete(url);}
  }
  limited(task) {
    return new Promise((resolve,reject)=>{this.queue.push({task:task,resolve:resolve,reject:reject});this.drain();});
  }
  drain() {
    while(this.active<this.concurrency && this.queue.length){
      const job=this.queue.shift();this.active++;
      Promise.resolve().then(job.task).then(job.resolve,job.reject).then(()=>{this.active--;this.drain();});
    }
  }
  async series(config) {
    const versions=await this.json(ROOT+"/product/output/versions.json",60000);
    const version=versions && versions["precipitation/animation"];
    if(typeof version!=="string" || !/^(version__)?[\w-]+$/.test(version))throw new Error("No radar product version");
    const animation=await this.json(ROOT+"/product/output/precipitation/animation/version__"+version.replace(/^version__/,"")+"/de/animation.json",60000);
    const selection=selectFrames(animation,config);
    const frames=new Array(selection.frames.length);
    const geometryKey=JSON.stringify([config.bounds,config.point,config.width]);
    let next=0,failures=0;
    const worker=async()=>{
      while(next<frames.length){
        const index=next++, f=selection.frames[index];
        try{
          if(failures>=4)throw new Error("Weather service unavailable");
          const key=geometryKey+f.url;
          let prepared=this.prepared.get(key);
          if(prepared){this.prepared.delete(key);this.prepared.set(key,prepared);}
          else{
            const raw=await this.json(framePath(f.url),86400000);
            const decoded=decode(raw,config);
            prepared={data:decoded,size:Buffer.byteLength(JSON.stringify(decoded))};
            if(prepared.size<=8*1024*1024){
              const previous=this.prepared.get(key);
              if(previous)this.preparedBytes-=previous.size;
              this.prepared.set(key,prepared);this.preparedBytes+=prepared.size;
              while(this.preparedBytes>8*1024*1024 || this.prepared.size>512){const oldest=this.prepared.keys().next().value;this.preparedBytes-=this.prepared.get(oldest).size;this.prepared.delete(oldest);}
            }
          }
          const decoded=prepared.data;
          frames[index]=Object.assign({time:f.time,kind:f.kind,available:true},decoded);
        }catch(error){failures++;frames[index]={time:f.time,kind:f.kind,available:false,homeLevel:null,polygons:[]};}
      }
    };
    await Promise.all(Array.from({length:Math.min(4,frames.length)},worker));
    if(!frames.some(f=>f.available))throw new Error("Radar frames are temporarily unavailable");
    return {frames:frames,latestObservation:selection.latestObservation,requestedEnd:selection.requestedEnd,
      horizonLimited:selection.horizonLimited,partial:failures>0,fetchedAt:this.now(),version:version,replay:false};
  }
}
module.exports={RadarProvider,selectFrames,framePath};
