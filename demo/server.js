"use strict";
// Uses the production provider and view; the historical fixture is demo-only.
const http=require("http");
const fs=require("fs");
const path=require("path");
const core=require("../public/core");
const {RadarProvider}=require("../lib/provider");
const {intersects}=require("../lib/geometry");
const {WeatherProvider}=require("../lib/weather");
const sampleWeather=require("./weather-fixture");
const provider=new RadarProvider(),weather=new WeatherProvider();
const demoConfig=core.normalize({
  location:{latitude:47.3769,longitude:8.5417,label:"Zurich"},
  mapCenter:{latitude:47.39,longitude:8.53},mapSpanKm:48,
  markers:[{latitude:47.3769,longitude:8.5417,label:"Zurich"},{latitude:47.45038,longitude:8.56240,label:"Airport",showLabel:false}]
});
// ?layout=column: a narrow mirror column with the integrated weather outlook.
const columnConfig=core.normalize(Object.assign({},demoConfig,{width:360,height:225,forecastHours:12,showWeather:true}));
function configFor(url){return url.searchParams.get("layout")==="column"?columnConfig:demoConfig;}
const replay=JSON.parse(fs.readFileSync(path.join(__dirname,"rain-replay.json"),"utf8"));
function historical(config){
  return Object.assign({},replay,{fetchedAt:Date.now(),frames:replay.frames.map(f=>{
    const g=f.grid;const x=Math.floor((config.point[0]-g.e0)/g.cell),y=Math.floor((g.n1-config.point[1])/g.cell);
    const rate=x>=0&&x<g.width&&y>=0&&y<g.height?g.values[y][x]:null;
    return {time:f.time,kind:f.kind,available:true,homeLevel:core.levelForRate(rate),polygons:f.polygons.filter(p=>intersects(p.rings,config.bounds))};
  })});
}
const files={"/":"demo/index.html","/demo.js":"demo/demo.js","/core.js":"public/core.js","/view.js":"public/view.js","/weather-view.js":"public/weather-view.js","/style.css":"MMM-RainRadar.css"};
http.createServer(async function(req,res){
  try{
    const url=new URL(req.url,"http://localhost");
    const config=configFor(url);
    if(url.pathname==="/config"){res.setHeader("Content-Type","application/json");res.end(JSON.stringify(config));return;}
    if(url.pathname==="/weather"){res.setHeader("Content-Type","application/json");res.end(JSON.stringify(url.searchParams.get("mode")==="live"?await weather.forecast(config):sampleWeather(Date.now())));return;}
    if(url.pathname==="/data"){
      const data=url.searchParams.get("mode")==="live"?await provider.series(config):historical(config);
      res.setHeader("Content-Type","application/json");res.end(JSON.stringify(data));return;
    }
    if(!files[url.pathname]){res.statusCode=404;res.end("Not found");return;}
    res.setHeader("Content-Type",url.pathname.endsWith(".js")?"text/javascript":url.pathname.endsWith(".css")?"text/css":"text/html");
    res.setHeader("Cache-Control","no-store");res.end(fs.readFileSync(path.join(__dirname,"..",files[url.pathname])));
  }catch(error){res.statusCode=502;res.end("Radar temporarily unavailable");}
}).listen(Number(process.env.PORT||3200),"127.0.0.1",function(){console.log("RAIN RADAR demo: http://localhost:"+(process.env.PORT||3200));});
