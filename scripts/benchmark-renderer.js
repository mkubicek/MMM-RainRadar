"use strict";
// Run with Electron, not node. An invisible offscreen window exercises the real module adapter.
const {app,BrowserWindow}=require("electron");
const fs=require("fs"),path=require("path");
const core=require("../public/core");
const root=path.join(__dirname,"..");
const fixture=JSON.parse(fs.readFileSync(path.join(root,"demo/rain-replay.json"),"utf8"));
const config=core.normalize({autoplay:false,location:{latitude:47.3769,longitude:8.5417,label:"Zurich"},mapCenter:{latitude:47.39,longitude:8.53},markers:[{latitude:47.3769,longitude:8.5417,label:"Zurich"},{latitude:47.45038,longitude:8.5624,label:"Airport",showLabel:false}]});
const data=Object.assign({},fixture,{frames:fixture.frames.map(f=>{const g=f.grid,x=Math.floor((config.point[0]-g.e0)/g.cell),y=Math.floor((g.n1-config.point[1])/g.cell);return{time:f.time,kind:f.kind,available:true,polygons:f.polygons,homeLevel:core.levelForRate(g.values[y][x])};})});
app.whenReady().then(async()=>{
  const win=new BrowserWindow({width:490,height:520,show:false,webPreferences:{offscreen:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
  win.webContents.setFrameRate(60);
  await win.loadFile(path.join(root,"scripts/renderer.html"));
  const result=await win.webContents.executeJavaScript(`(async function(){
    const instance=Object.assign({config:${JSON.stringify(config)},data:{},identifier:'renderer_benchmark',file:p=>p,sendSocketNotification(){}},window.definition);
    instance.start();document.querySelector('header').innerHTML=instance.getHeader();document.querySelector('main').appendChild(instance.getDom());
    instance.socketNotificationReceived('RAIN_RADAR_DATA',{id:instance.identifier,data:${JSON.stringify(data)}});
    const view=instance.radarView, timings=[];
    for(let pass=0;pass<2;pass++)for(let i=0;i<view.data.frames.length;i++){
      await new Promise(resolve=>requestAnimationFrame(resolve));view.index=i;const start=performance.now();view.draw();timings.push({pass,ms:performance.now()-start});
    }
    view.index=view.data.frames.reduce((best,f,i)=>f.homeLevel>view.data.frames[best].homeLevel?i:best,0);view.draw();
    const image=document.querySelector('.rr-basemap');if(image&&!image.complete)await Promise.race([new Promise(resolve=>image.addEventListener('load',resolve,{once:true})),new Promise(resolve=>setTimeout(resolve,6000))]);
    clearTimeout(instance.requestTimer);view.destroy();
    return {frames:view.data.frames.length,passes:[0,1].map(pass=>{const a=timings.filter(t=>t.pass===pass).map(t=>t.ms).sort((a,b)=>a-b);return{pass,meanMs:a.reduce((a,b)=>a+b,0)/a.length,p95Ms:a[Math.floor(a.length*.95)],maxMs:a[a.length-1]};}),mapLoaded:!view.mapFailed,header:document.querySelector('header').textContent,homeBars:view.data.frames.filter(f=>f.homeLevel>0).length};
  })()`);
  await new Promise(resolve=>setTimeout(resolve,150));
  const image=await win.webContents.capturePage();
  const output=process.env.RAIN_RADAR_SCREENSHOT||path.join(root,"renderer-check.png");fs.writeFileSync(output,image.toPNG());
  result.electron=process.versions.electron;result.memory=app.getAppMetrics().filter(p=>p.type==="Tab").map(p=>p.memory);
  console.log(JSON.stringify(result));app.quit();
}).catch(error=>{console.error(error.stack);app.exit(1);});
setTimeout(()=>{console.error("Renderer benchmark timed out");app.exit(1);},30000).unref();
