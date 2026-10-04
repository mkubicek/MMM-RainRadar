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
  // One playback loop as [{index, ms}]. Adaptive playback spends loopDuration on motion, spread
  // evenly over frames sampled densest near now and in home rain, then adds holds at the latest
  // observation and at home arrival, peak and clearing (together at most loopDuration again).
  // Rain duration changes which frames are shown, never how long the loop takes. With
  // interpolation the view glides between frames, so half as many frames are needed.
  function plan(timeline,config,speed){
    var frames=timeline.frames,latest=timeline.latest,usable=[];
    frames.forEach(function(f,i){if(f.available)usable.push(i);});
    var result;
    if(!config.adaptivePlayback){
      result=usable.map(function(i){return {index:i,ms:config.frameInterval/speed};});
    }else{
      var budget=config.loopDuration,hold={};
      var add=function(i,share){if(frames[i].available)hold[i]=Math.max(hold[i]||0,budget*share);};
      if(latest>=0)add(latest,0.15);
      // A dry gap of up to 15 minutes is a lull, not a new arrival and clearing.
      var lull=function(a,b){return a&&b&&a.end!==null&&frames[b.first].time-frames[a.end].time<=900;};
      timeline.episodes.forEach(function(e,k,all){
        if(e.startKnown&&!lull(all[k-1],e))add(e.first,0.18);
        if(e.peak!==e.first&&level(frames[e.peak])>=4)add(e.peak,0.1);
        if(e.end!==null&&!lull(e,all[k+1]))add(e.end,0.1);
      });
      var held=Object.keys(hold),holdTotal=held.reduce(function(sum,i){return sum+hold[i];},0);
      if(holdTotal>budget)held.forEach(function(i){hold[i]*=budget/holdTotal;});
      var rest=budget,count=Math.max(2,Math.min(usable.length,Math.floor(rest/(config.interpolate?160:80))));
      var now=latest>=0?frames[latest].time:frames[0].time;
      var weights=usable.map(function(i,k){
        var next=usable[k+1],span=next===undefined?(k?frames[i].time-frames[usable[k-1]].time:1):frames[next].time-frames[i].time;
        var t=frames[i].time,near=t>=now-3600&&t<=now+7200;
        return Math.max(1,span)*(near?2.5:1)*(level(frames[i])>0?2:1);
      });
      var total=weights.reduce(function(a,b){return a+b;},0),step=total/count,cumulative=0,threshold=0,picked=[];
      usable.forEach(function(i,k){
        if(usable.length<=count||cumulative>=threshold||hold[i]!==undefined){picked.push(i);while(threshold<=cumulative)threshold+=step;}
        cumulative+=weights[k];
      });
      // Short windows play at a readable pace rather than stretching to fill the budget.
      var even=Math.min(400,rest/picked.length);
      result=picked.map(function(i){return {index:i,ms:even+(hold[i]||0)};});
    }
    result.forEach(function(s){if(s.index===latest)s.ms+=config.pauseAtLatest;});
    return result;
  }
  return {level:level,state:state,intensity:intensity,analyze:analyze,outlook:outlook,plan:plan};
}));
