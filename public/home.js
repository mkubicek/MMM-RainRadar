/* Home precipitation episodes and playback pacing. No rendering or weather requests. */
(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory();
  else root.RainRadarHome=factory();
}(typeof self!=="undefined"?self:this,function(){
  "use strict";
  function level(frame){return frame&&frame.available&&Number.isInteger(frame.homeLevel)&&frame.homeLevel>=0&&frame.homeLevel<=9?frame.homeLevel:null;}
  function state(frame){var n=level(frame);return n===null?"unknown":n===0?"dry":n>=6?"heavy":"rain";}
  function intensity(frame){var n=level(frame);return n===null?"Unavailable":n===0?"Dry":n<=2?"Light rain":n>=6?"Heavy rain":"Rain";}
  function analyze(data){
    var frames=data.frames,episodes=[],active=null,byFrame=new Array(frames.length);
    frames.forEach(function(f,i){
      var n=level(f);
      if(n!==null&&n>0){
        if(!active){active={first:i,last:i,peak:i,end:null,startKnown:i>0&&level(frames[i-1])===0};episodes.push(active);}
        active.last=i;
        if(n>level(frames[active.peak]))active.peak=i;
        byFrame[i]=active;
      }else{
        if(active&&n===0)active.end=i;
        active=null;
      }
    });
    // A manifest can advertise a frame before the image is usable. Keep the last
    // successful observation, with its real timestamp, rather than selecting a blank map.
    var latest=-1,available=-1;
    frames.forEach(function(f,i){
      if(f.kind!=="measurement"||f.time>data.latestObservation||!f.available)return;
      if(available<0||f.time>frames[available].time)available=i;
      if(level(f)!==null&&(latest<0||f.time>frames[latest].time))latest=i;
    });
    if(latest<0)latest=available;
    return {frames:frames,latest:latest,episodes:episodes,byFrame:byFrame};
  }
  function outlook(timeline,now){
    var frames=timeline.frames,latest=timeline.latest,after=latest<0?now:frames[latest].time;
    var future=frames.filter(function(f){return f.kind==="forecast"&&f.time>after&&f.time>=now;});
    var episode=timeline.episodes.find(function(e){
      return frames[e.last].kind==="forecast"&&(e.end===null?frames[e.last].time>=now:frames[e.end].time>now);
    });
    // A missing cell before the first wet cell makes an arrival estimate uncertain.
    var gap=episode?frames.some(function(f,i){return i>latest&&i<episode.first&&f.time>after&&level(f)===null;}):future.some(function(f){return level(f)===null;});
    return {episode:episode||null,gap:gap,complete:future.length>0&&future.every(function(f){return level(f)!==null;}),end:future.length?future[future.length-1].time:null};
  }
  function delay(timeline,index,config,speed){
    var frames=timeline.frames,base=config.frameInterval/speed,ms=base;
    if(config.adaptivePlayback){
      var n=level(frames[index]),episode=timeline.byFrame[index];
      ms=n===null?Math.max(base,300):n===0?Math.max(80,base*0.65):Math.max(n>=6?650:420,base*(n>=6?3:2));
      if(episode){
        if(index===episode.first)ms=Math.max(ms,1600);
        if(index===episode.peak&&episode.peak!==episode.first)ms=Math.max(ms,1200);
        if(index===episode.last&&episode.end!==null)ms=Math.max(ms,900);
      }else if(index+1<frames.length&&level(frames[index+1])>0)ms=Math.max(ms,280);
      if(index===timeline.latest)ms=Math.max(ms,1000);
      if(index===frames.length-1)ms=Math.max(ms,800);
    }
    if(index===timeline.latest)ms+=config.pauseAtLatest;
    return ms;
  }
  return {level:level,state:state,intensity:intensity,analyze:analyze,outlook:outlook,delay:delay};
}));
