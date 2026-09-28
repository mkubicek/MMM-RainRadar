"use strict";
const https=require("https"),zlib=require("zlib");
const {requestJSON}=require("./http");
const ROOT="https://data.geo.admin.ch/ch.meteoschweiz.ogd-local-forecasting/";
const API="https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-local-forecasting/items/";
const PARAMETERS=["tre200h0","fu3010h0","rre150h0","rp0003i0","jww003i0","tre200pn","tre200px","rka150p0","jp2000d0"];
function timestamp(s){if(!/^\d{12}$/.test(s))throw new Error("Invalid forecast timestamp");return Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8),+s.slice(8,10),+s.slice(10,12))/1000;}
function csvRow(line){const cells=[];let value="",quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===';'&&!quoted){cells.push(value);value="";}else value+=c;}cells.push(value.replace(/\r$/,""));return cells;}
// Read the small postal-point catalogue once, with bounded streaming memory.
function streamLines(url,onLine,options){
  options=options||{};
  if(!url.startsWith(ROOT))return Promise.reject(new Error("Invalid forecast source"));
  return new Promise((resolve,reject)=>{
    let req,source,deadline,done=false,pending="",decoded=0,downloaded=0;
    const finish=error=>{if(done)return;done=true;clearTimeout(deadline);if(source)source.destroy();if(req)req.destroy();error?reject(error):resolve({downloaded:downloaded,decoded:decoded});};
    req=https.get(url,{headers:{"Accept-Encoding":"gzip","User-Agent":"MMM-RainRadar/0.3"}},res=>{
      if(res.statusCode!==200){res.resume();return finish(new Error("Forecast HTTP "+res.statusCode));}
      res.on("data",b=>{downloaded+=b.length;});res.on("error",finish);
      source=res.headers["content-encoding"]==="gzip"?res.pipe(zlib.createGunzip()):res;
      source.on("error",finish);
      source.on("data",chunk=>{
        if(done)return;
        try{
          decoded+=chunk.length;if(decoded>(options.maxBytes||48*1024*1024))throw new Error("Forecast CSV exceeds size limit");
          pending+=chunk.toString("latin1");let end;
          while((end=pending.indexOf("\n"))!==-1){const line=pending.slice(0,end).replace(/\r$/,"");pending=pending.slice(end+1);if(onLine(line)===false){finish();return;}}
          if(pending.length>16384)throw new Error("Forecast CSV line exceeds size limit");
        }catch(error){finish(error);}
      });
      source.on("end",()=>{if(done)return;try{if(pending)onLine(pending);finish();}catch(error){finish(error);}});
    });
    req.on("error",finish);deadline=setTimeout(()=>finish(new Error("Forecast download timed out")),45000);
  });
}
function rangeRequest(url,start,end){
  if(!url.startsWith(ROOT))return Promise.reject(new Error("Invalid probability source"));
  return new Promise((resolve,reject)=>{
    let req,deadline,done=false;const finish=(error,result)=>{if(done)return;done=true;clearTimeout(deadline);if(req)req.destroy();error?reject(error):resolve(result);};
    req=https.get(url,{headers:{Range:"bytes="+start+"-"+end,"Accept-Encoding":"identity"}},res=>{
      const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers["content-range"]||"");
      if(res.statusCode!==206||!match||Number(match[1])!==start){res.resume();return finish(new Error("Probability source does not support byte ranges"));}
      let size=0;const chunks=[];
      res.on("data",chunk=>{size+=chunk.length;if(size>end-start+1)return finish(new Error("Oversized probability range"));chunks.push(chunk);});res.on("error",finish);
      res.on("end",()=>finish(null,{start:start,total:Number(match[3]),text:Buffer.concat(chunks).toString("latin1"),bytes:size}));
    });req.on("error",finish);deadline=setTimeout(()=>finish(new Error("Probability range timed out")),10000);
  });
}
function rangeRows(chunk){
  const lines=chunk.text.split("\n");if(chunk.start>0)lines.shift();if(chunk.start+chunk.bytes<chunk.total)lines.pop();
  return lines.map(line=>line.trim().split(";")).filter(c=>c.length===4&&/^\d+$/.test(c[0])&&/^\d+$/.test(c[1])&&/^\d{12}$/.test(c[2]));
}
function comparePoint(row,point){return Number(row[1])-Number(point.type)||Number(row[0])-Number(point.id);}
async function readProbability(url,point,request){
  request=request||rangeRequest;let chunk=await request(url,0,4095),bytes=chunk.bytes,lo=0,hi=chunk.total;
  if(!chunk.text.startsWith("point_id;point_type_id;Date;rp0003i0"))throw new Error("Unexpected probability schema");
  for(let attempt=0;attempt<20;attempt++){
    const rows=rangeRows(chunk);if(!rows.length)throw new Error("No rows in probability range");
    // This product is sorted by point type, point ID, then timestamp.
    for(let i=1;i<rows.length;i++)if(comparePoint(rows[i],{type:rows[i-1][1],id:rows[i-1][0]})<0)throw new Error("Probability point order changed");
    if(rows.some(r=>comparePoint(r,point)===0)){
      const begin=Math.max(0,chunk.start-16384),end=Math.min(chunk.total-1,chunk.start+chunk.bytes+16384);
      const surrounding=await request(url,begin,end);bytes+=surrounding.bytes;const all=rangeRows(surrounding),selected=all.filter(r=>comparePoint(r,point)===0);
      if(!selected.length||(begin>0&&!all.some(r=>comparePoint(r,point)<0))||(end<chunk.total-1&&!all.some(r=>comparePoint(r,point)>0)))throw new Error("Incomplete probability point range");
      const values=new Map();let previous=0;selected.forEach(r=>{const t=timestamp(r[2]);if(t<previous)throw new Error("Probability timestamps changed order");previous=t;const n=r[3].trim()===""?NaN:Number(r[3]);values.set(t,Number.isFinite(n)?n:null);});
      return {values:values,bytes:bytes};
    }
    if(comparePoint(rows[0],point)>0)hi=chunk.start;
    else if(comparePoint(rows[rows.length-1],point)<0)lo=chunk.start+chunk.bytes;
    else throw new Error("Forecast point missing between probability rows");
    if(lo>=hi)throw new Error("Forecast point not found");
    const mid=Math.floor((lo+hi)/2);chunk=await request(url,mid,Math.min(mid+4095,chunk.total-1));bytes+=chunk.bytes;
  }
  throw new Error("Probability search budget exceeded");
}
function numeric(value){return value!==null&&value!==undefined&&String(value).trim()!==""&&Number.isFinite(Number(value))?Number(value):null;}
class MeteoSwissSource{
  constructor(options){options=options||{};this.json=options.json||requestJSON;this.lines=options.lines||streamLines;this.range=options.range||rangeRequest;this.now=options.now||Date.now;this.points=null;this.manifest=null;this.pendingMetadata=null;this.pendingManifest=null;this.bytes=0;this.probabilityCache=new Map();}
  async locations(){
    if(this.points)return this.points;
    if(this.pendingMetadata)return this.pendingMetadata;
    this.pendingMetadata=(async()=>{
      const points=[];let header;
      await this.lines(ROOT+"ogd-local-forecasting_meta_point.csv",line=>{
        const row=csvRow(line);if(!header){header=row;return;}
        const p={};header.forEach((k,i)=>{p[k]=row[i];});
        if(p.point_type_id!=="2")return;
        const lat=Number(p.point_coordinates_wgs84_lat),lon=Number(p.point_coordinates_wgs84_lon);
        if(Number.isFinite(lat)&&Number.isFinite(lon))points.push({id:p.point_id,type:p.point_type_id,name:p.point_name,postalCode:p.postal_code,latitude:lat,longitude:lon});
      },{maxBytes:2*1024*1024});
      if(!points.length)throw new Error("No forecast locations");this.points=points;return points;
    })();try{return await this.pendingMetadata;}finally{this.pendingMetadata=null;}
  }
  async latest(){
    if(this.manifest&&this.now()-this.manifest.checkedAt<900000)return this.manifest;
    if(this.pendingManifest)return this.pendingManifest;
    this.pendingManifest=(async()=>{
      const v=await this.json("https://www.meteoschweiz.admin.ch/product/output/versions.json");
      const chart=v["forecast-chart-v2"],widget=v["weather-widget/forecast-v2"];
      if(!/^\d{8}_\d{4}$/.test(chart)||!/^\d{8}_\d{4}$/.test(widget))throw new Error("Invalid MeteoSwiss forecast version");
      this.manifest={chart:chart,widget:widget,run:chart+"/"+widget,issuedAt:Math.min(timestamp(chart.replace("_","")),timestamp(widget.replace("_","")))*1000,checkedAt:this.now()};return this.manifest;
    })();try{return await this.pendingManifest;}finally{this.pendingManifest=null;}
  }
  async probability(point){
    let lastError;
    for(let day=0;day<2;day++){
      try{
        const date=new Date(this.now()-day*86400000).toISOString().slice(0,10).replace(/-/g,"");
        const item=await this.json(API+date+"-ch");
        const names=Object.keys(item.assets||{}).filter(n=>/^vnut12\.lssw\.\d{12}\.rp0003i0\.csv$/.test(n)).sort();
        if(!names.length)throw new Error("No precipitation probability file");const name=names[names.length-1],issuedAt=timestamp(name.split(".")[2])*1000;
        if(this.now()-issuedAt>7200000)throw new Error("Stale precipitation probability");
        const key=name+"/"+point.type+"/"+point.id;if(this.probabilityCache.has(key))return this.probabilityCache.get(key);
        const result=await readProbability(item.assets[name].href,point,this.range);this.bytes+=result.bytes;this.probabilityCache.set(key,result.values);while(this.probabilityCache.size>32)this.probabilityCache.delete(this.probabilityCache.keys().next().value);return result.values;
      }catch(error){lastError=error;}
    }
    throw lastError;
  }
  async load(config){
    const [points,run]=await Promise.all([this.locations(),this.latest()]);
    const distance=p=>Math.pow((p.latitude-config.location.latitude)*111,2)+Math.pow((p.longitude-config.location.longitude)*111*Math.cos(config.location.latitude*Math.PI/180),2);
    const point=points.reduce((best,p)=>distance(p)<distance(best)?p:best,points[0]);
    if(distance(point)>2500)throw new Error("No MeteoSwiss forecast point within 50 km");
    if(!/^\d+$/.test(point.id))throw new Error("Invalid forecast point");
    const site="https://www.meteoschweiz.admin.ch/product/output/";
    const [chart,widget,probability]=await Promise.all([
      this.json(site+"forecast-chart-v2/version__"+run.chart+"/en/"+point.id+".json"),
      this.json(site+"weather-widget/forecast-v2/version__"+run.widget+"/en/"+point.id+".json"),
      this.probability(point).catch(()=>new Map())
    ]);
    if(!Array.isArray(chart)||!widget||!widget.data||!Array.isArray(widget.data.forecasts))throw new Error("Invalid MeteoSwiss local forecast");
    const fields={};PARAMETERS.forEach(p=>{fields[p]=new Map();});fields.rp0003i0=probability;
    const symbols=[];
    chart.forEach(day=>{
      [["temperature","tre200h0"],["rainfall","rre150h0"],["wind","fu3010h0"]].forEach(pair=>{
        const data=pair[0]==="wind"?day.wind&&day.wind.data:day[pair[0]];
        if(!Array.isArray(data))return;data.forEach(row=>{if(Array.isArray(row)&&Number.isFinite(row[0]))fields[pair[1]].set(row[0]/1000,numeric(row[1]));});
      });
      (day.symbols||[]).forEach(s=>{if(Number.isFinite(s.timestamp))symbols.push(s);});
    });
    fields.tre200h0.forEach((v,time)=>{
      // Website symbols sit at the middle of a three-hour display interval.
      const symbol=symbols.find(s=>time*1000>s.timestamp-5400000&&time*1000<=s.timestamp+5400000);
      fields.jww003i0.set(time,symbol?numeric(symbol.weather_symbol_id):null);
    });
    widget.data.forecasts.forEach(day=>{
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day.date_iso))return;const time=Date.parse(day.date_iso+"T00:00:00Z")/1000;
      fields.tre200pn.set(time,numeric(day.temp_low));fields.tre200px.set(time,numeric(day.temp_high));fields.rka150p0.set(time,numeric(day.precip_mean));fields.jp2000d0.set(time,numeric(day.weather_symbol_id));
    });
    return {fields:fields,point:point,issuedAt:run.issuedAt,run:run.run};
  }
}
module.exports={MeteoSwissSource,timestamp,csvRow,PARAMETERS,readProbability,rangeRows};
