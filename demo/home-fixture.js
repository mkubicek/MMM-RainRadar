"use strict";
// Deliberately synthetic, demo-only scenes. Never used by the module or live provider.
const core=require("../public/core");
const scenarios=["arrival","rain","heavy","dry","missing","stale"];
function scene(config,name,now){
  const latest=Math.floor(now/300000)*300-(name==="stale"?2700:0);
  function cloud(east,north,radius,color){
    const ring=Array.from({length:36},(_,i)=>{
      const angle=i*Math.PI/18,wobble=1+0.09*Math.sin(angle*5);
      return [Math.round(east+Math.cos(angle)*radius*wobble),Math.round(north+Math.sin(angle)*radius*0.6*wobble)];
    });
    return {color,rings:[ring]};
  }
  const frames=Array.from({length:37},(_,i)=>{
    const minute=(i-12)*5;
    let homeLevel=0;
    if(name!=="dry"){
      const start=name==="arrival"||name==="missing"?25:-20,end=name==="arrival"||name==="missing"?80:45;
      if(minute>=start&&minute<end)homeLevel=name==="heavy"?7:minute<start+10||minute>=end-10?1:4;
    }
    const offset=homeLevel>0?0:minute<25?-10000+minute*160:14000;
    const polygons=name==="dry"?[]:[cloud(config.point[0]+offset,config.point[1],6500,"2a00fa")];
    if(homeLevel>0){
      polygons.push(cloud(config.point[0],config.point[1],4300,core.scale[homeLevel-1].color));
    }
    const available=!(name==="missing"&&(i<=12||i===15));
    return {time:latest+minute*60,kind:i<=12?"measurement":"forecast",available,
      homeLevel:available?homeLevel:null,polygons:available?polygons:[]};
  });
  return {frames,latestObservation:latest,fetchedAt:now,replay:false,demo:true,label:"Illustrative home scenario",horizonLimited:false};
}
module.exports={scenarios,scene};
