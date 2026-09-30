/* Canvas map and accessible timeline, shared by MagicMirror and the standalone demo. */
(function(root,factory){
  if(typeof module==="object" && module.exports)module.exports=factory(require("./core"),require("./weather-view"),require("./home"));
  else root.RainRadarView=factory(root.RainRadarCore,root.RainRadarWeather,root.RainRadarHome);
}(typeof self!=="undefined"?self:this,function(core,weather,home){
  "use strict";
  function element(tag,className,text){var el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
  function svg(tag,attrs){var el=document.createElementNS("http://www.w3.org/2000/svg",tag);Object.keys(attrs||{}).forEach(function(k){el.setAttribute(k,attrs[k]);});return el;}
  function content(el,text){if(el.textContent!==text)el.textContent=text;}
  function labelRange(level){if(level===null)return "Unavailable";if(level===0)return "Below 0.2 mm/h";var c=core.scale[level-1];return c.upper?c.lower+"–"+c.upper+" mm/h":c.lower+"+ mm/h";}
  function wms(config){
    var b=config.bounds;
    var layer=config.mapStyle==="lakes"?"ch.bafu.vec25-seen":"ch.swisstopo.vec200-hydrography";
    var p=new URLSearchParams({SERVICE:"WMS",VERSION:"1.3.0",REQUEST:"GetMap",FORMAT:"image/png",TRANSPARENT:"true",
      LAYERS:layer,STYLES:"",CRS:"EPSG:21781",BBOX:[b.west,b.south,b.east,b.north].join(","),
      WIDTH:String(Math.min(1600,Math.round(config.width*config.pixelRatio))),HEIGHT:String(Math.min(1000,Math.round(config.height*config.pixelRatio)))});
    return "https://wms.geo.admin.ch/?"+p.toString();
  }
  function View(root,config){
    this.root=root;this.config=config;this.data=null;this.index=0;this.speed=config.playbackSpeed;
    this.playing=config.autoplay && !(config.respectReducedMotion && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    this.suspended=false;this.destroyed=false;this.paths=[];this.timer=null;this.error="";this.mapFailed=false;
    this.format=new Intl.DateTimeFormat(config.locale,{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:config.timeZone});
    this.fullFormat=new Intl.DateTimeFormat(config.locale,{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false,timeZone:config.timeZone});
    this.build();
    var self=this;this.statusTimer=setInterval(function(){self.status();self.renderHomeSummary();if(self.weather)self.weather.refresh();},60000);
  }
  View.prototype.build=function(){
    var self=this,c=this.config,r=this.root;
    r.classList.add("rr-widget");r.style.width=c.width+"px";r.setAttribute("aria-label","Rain radar");
    if(c.showWeather)this.weather=new weather.Forecast(r,c);
    this.homeSummary=element("div","rr-home-summary");this.homeSummary.hidden=!c.showHomeSummary;
    this.homeSummary.setAttribute("role","status");this.homeSummary.setAttribute("aria-atomic","true");
    var heading=element("div","rr-home-heading");heading.appendChild(element("span",null,"AT HOME"));
    this.homeSource=element("span","rr-home-source","");heading.appendChild(this.homeSource);this.homeSummary.appendChild(heading);
    this.homeHeadline=element("div","rr-home-headline","Checking rain at home…");this.homeDetail=element("div","rr-home-detail","");
    this.homeSummary.appendChild(this.homeHeadline);this.homeSummary.appendChild(this.homeDetail);r.appendChild(this.homeSummary);
    this.map=element("div","rr-map");this.map.style.height=c.height+"px";
    if(c.mapStyle!=="none"){
      var image=element("img","rr-basemap");image.alt="";image.src=wms(c);image.style.opacity=c.mapOpacity;
      image.onerror=function(){self.mapFailed=true;self.status();};image.onload=function(){self.mapFailed=false;self.status();};this.map.appendChild(image);
    }
    this.canvas=element("canvas","rr-rain");var ratio=c.pixelRatio;
    this.canvas.width=Math.round(c.width*ratio);this.canvas.height=Math.round(c.height*ratio);this.canvas.style.opacity=c.rainOpacity;
    this.ctx=this.canvas.getContext("2d");this.ctx.scale(ratio,ratio);this.map.appendChild(this.canvas);
    var places=svg("svg",{viewBox:"0 0 "+c.width+" "+c.height,"aria-hidden":"true"});
    var points=c.markers.map(function(p){return {point:core.project(p.latitude,p.longitude),label:p.label,show:c.showMarkerLabels&&p.showLabel,home:false};});
    if(c.showLocation)points.push({point:c.point,label:c.location.label,show:c.showLocationLabel,home:true});
    points.forEach(function(p){
      if(!core.contains(c.bounds,p.point))return;
      var xy=core.pixel(p.point,c.bounds,c.width,c.height);var group=svg("g",{"class":p.home?"rr-home":"rr-marker"});
      if(p.home){
        self.homeMarker=group;
        group.appendChild(svg("circle",{cx:xy[0],cy:xy[1],r:16,"class":"rr-home-halo"}));
        group.appendChild(svg("circle",{cx:xy[0],cy:xy[1],r:9,"class":"rr-home-ring"}));
      }
      group.appendChild(svg("circle",{cx:xy[0],cy:xy[1],r:p.home?3:1.6,"class":p.home?"rr-home-dot":""}));
      if(p.show&&p.label){var right=xy[0]>c.width*0.72;var text=svg("text",{x:xy[0]+(right?-7:7),y:Math.max(12,Math.min(c.height-4,xy[1]+4)),"text-anchor":right?"end":"start"});text.textContent=p.label;group.appendChild(text);}
      places.appendChild(group);
    });
    // Frame context lives on the map; the summary above it always describes the latest radar.
    this.homeFrame=element("div","rr-home-frame");this.homeFrame.hidden=true;
    this.homeFrameTitle=element("span","rr-home-frame-title");this.homeFrameTime=element("span","rr-home-frame-time");
    this.homeFrame.appendChild(this.homeFrameTitle);this.homeFrame.appendChild(this.homeFrameTime);
    this.homeFrame.setAttribute("aria-live","off");
    this.map.appendChild(places);r.appendChild(this.map);
    this.map.appendChild(this.homeFrame);
    this.chartWrap=element("div","rr-chart-wrap");
    this.chart=svg("svg",{viewBox:"0 0 "+c.width+" 60","aria-hidden":"true"});this.chartWrap.appendChild(this.chart);
    this.slider=element("input","rr-scrubber");this.slider.type="range";this.slider.step="1";this.slider.disabled=true;
    this.slider.setAttribute("aria-label","Precipitation at configured location — select radar frame");
    this.slider.oninput=function(){if(!self.data)return;self.playing=false;self.index=core.nearestIndex(self.data.frames,Number(self.slider.value));self.draw();self.schedule();};
    this.slider.onkeydown=function(event){
      if(!self.data || ["ArrowLeft","ArrowRight","Home","End"].indexOf(event.key)<0)return;
      event.preventDefault();event.stopPropagation();self.playing=false;
      self.index=event.key==="Home"?0:event.key==="End"?self.data.frames.length-1:Math.max(0,Math.min(self.data.frames.length-1,self.index+(event.key==="ArrowRight"?1:-1)));
      self.draw();self.schedule();
    };
    this.chartWrap.appendChild(this.slider);r.appendChild(this.chartWrap);
    var footer=element("div","rr-playback");
    this.play=element("button","rr-button rr-play","▶");this.play.type="button";this.play.disabled=true;
    this.play.onclick=function(){self.playing=!self.playing;self.draw();self.schedule();};
    this.time=element("span","rr-time","—");this.kind=element("span","rr-kind","");
    footer.appendChild(this.play);footer.appendChild(this.time);footer.appendChild(this.kind);
    this.focus=element("span","rr-focus","");footer.appendChild(this.focus);
    if(!c.showControls)this.play.hidden=true;
    var attribution=element("span","rr-attribution");
    var meteo=element("a",null,"MeteoSwiss");meteo.href="https://www.meteoswiss.admin.ch/";meteo.target="_blank";meteo.rel="noopener noreferrer";
    attribution.appendChild(meteo);
    if(c.mapStyle!=="none"){attribution.appendChild(document.createTextNode(" · "));var swisstopo=element("a",null,"swisstopo");swisstopo.href="https://www.swisstopo.admin.ch/";swisstopo.target="_blank";swisstopo.rel="noopener noreferrer";attribution.appendChild(swisstopo);}
    if(!this.weather)footer.appendChild(attribution);r.appendChild(footer);
    if(c.showLegend){var legend=element("div","rr-legend");core.scale.forEach(function(level){var item=element("span",null,String(level.lower));item.style.borderTopColor="#"+level.color;legend.appendChild(item);});legend.appendChild(element("span",null,"mm/h"));r.appendChild(legend);}
    this.notice=element("div","rr-notice","Loading radar…");this.notice.setAttribute("role","status");r.appendChild(this.notice);
    if(this.weather){r.appendChild(this.weather.panels);r.appendChild(this.weather.notice);var credits=element("div","rr-weather-credits");credits.appendChild(attribution);r.appendChild(credits);}
  };
  View.prototype.timeLabel=function(time){return this.format.format(new Date(time*1000));};
  View.prototype.x=function(time){var fs=this.data.frames;return 4+(time-fs[0].time)/Math.max(1,fs[fs.length-1].time-fs[0].time)*(this.config.width-8);};
  View.prototype.setData=function(data){
    if(this.destroyed)return;
    if(!data || !Array.isArray(data.frames) || !data.frames.length){this.setError("No radar frames available");return;}
    var previous=this.data && this.data.frames[this.index].time;
    this.data=data;this.error="";
    this.homeTimeline=home.analyze(data);
    this.index=previous===undefined || previous===null?core.nearestIndex(data.frames,data.replay?data.frames[0].time:data.latestObservation):core.nearestIndex(data.frames,previous);
    // Nothing to animate when no frame shows rain: hold the latest observation instead of
    // redrawing identical empty frames several times a second.
    this.dry=!data.replay && data.frames.every(function(f){return home.level(f)===0&&(!f.polygons || !f.polygons.length);});
    if(this.dry&&this.playing)this.index=core.nearestIndex(data.frames,data.latestObservation);
    this.paths=new Array(data.frames.length);this.renderChart();this.renderHomeSummary();this.draw();this.schedule();this.status();
  };
  View.prototype.renderHomeSummary=function(){
    if(this.destroyed)return;
    if(!this.data){content(this.homeHeadline,this.error?"Home radar unavailable":"Checking rain at home…");return;}
    var d=this.data,t=this.homeTimeline,f=t.frames[t.latest],now=Date.now()/1000;
    var outlook=home.outlook(t,now),e=outlook.episode,title,detail="",tone=home.state(f);
    var stale=!d.replay&&now-d.latestObservation>this.config.staleAfterMinutes*60;
    var source=(d.demo?"DEMO":d.replay?"RECORDING":stale?"OLD RADAR":"LATEST RADAR")+" · "+this.timeLabel(d.latestObservation);
    if(d.replay){
      var wet=t.episodes[0],incomplete=t.frames.some(function(frame){return home.level(frame)===null;});
      tone=wet?home.state(t.frames[wet.peak]):incomplete?"unknown":"dry";
      title=wet?"Rain over home in this recording":incomplete?"Home data incomplete in this recording":"Dry at home in this recording";
      detail=d.label+(wet?" · "+this.timeLabel(t.frames[wet.first].time)+"–"+this.timeLabel(t.frames[wet.last].time):"");
    }else{
      title=tone==="unknown"?"Home radar unavailable":tone==="dry"?"Dry at home":home.intensity(f)+" at home";
      if(stale&&tone!=="unknown")title="Last radar: "+title.toLowerCase();
      if(tone==="rain"||tone==="heavy"){
        var current=t.byFrame[t.latest],dryFrame=current&&current.end!==null?t.frames[current.end]:null;
        detail=labelRange(home.level(f))+" · ";
        if(dryFrame&&dryFrame.kind==="forecast")detail+=(dryFrame.time>now?"Dry again ~":"Dry in forecast ~")+this.timeLabel(dryFrame.time)+" · Forecast";
        else if(current&&t.frames[current.last].kind==="forecast")detail+="Rain forecast through "+this.timeLabel(t.frames[current.last].time)+(outlook.complete?"":" · Gaps in outlook");
        else detail+="Forecast incomplete";
      }else if(e){
        var start=t.frames[e.first].time;
        if(start<=now){detail="Rain forecast around now";if(!stale&&tone==="dry")tone="soon";}
        else{
          var minutes=Math.max(1,Math.round((start-now)/60));
          detail=(outlook.gap||!e.startKnown?"Rain in forecast ~":"Rain expected ~")+this.timeLabel(start);
          if(!outlook.gap&&e.startKnown&&minutes<=90&&!stale&&tone==="dry"){
            title="Rain expected in ~"+minutes+" min";detail="Dry on latest radar · Forecast ~"+this.timeLabel(start);tone="soon";
          }
          if(outlook.gap)detail+=" · Gaps before rain";
        }
      }else if(outlook.complete)detail="No rain in forecast through "+this.timeLabel(outlook.end);
      else detail=outlook.end?"Home forecast incomplete":"No home forecast available";
      if(stale){detail="Updated "+Math.floor((now-d.latestObservation)/60)+" min ago · "+detail;tone="unknown";}
    }
    if(this.homeSummary.dataset.state!==tone)this.homeSummary.dataset.state=tone;
    content(this.homeSource,source);content(this.homeHeadline,title);content(this.homeDetail,detail);
  };
  View.prototype.renderChart=function(){
    var self=this,c=this.config,frames=this.data.frames,first=frames[0].time,last=frames[frames.length-1].time;
    while(this.chart.firstChild)this.chart.removeChild(this.chart.firstChild);
    var observed=frames.some(function(f){return f.kind==="measurement";}),forecast=frames.some(function(f){return f.kind==="forecast";});
    var boundary=this.x(Math.min(last,Math.max(first,this.data.latestObservation)));
    var title=svg("text",{x:4,y:10,"class":"rr-period"});title.textContent=this.data.replay?"REPLAY · "+this.data.label:this.data.demo?"DEMO · AT HOME":observed?"Past":"";this.chart.appendChild(title);
    if(forecast){var future=svg("text",{x:Math.min(c.width-72,boundary+8),y:10,"class":"rr-period"});future.textContent="Forecast";this.chart.appendChild(future);}
    this.homeTimeline.episodes.forEach(function(e){
      var start=self.x(frames[e.first].time),end=self.x(frames[e.end===null?e.last:e.end].time);
      self.chart.appendChild(svg("rect",{x:Math.max(0,start-2),y:15,width:Math.max(4,end-start),height:25,"class":"rr-home-window rr-"+home.state(frames[e.peak])}));
    });
    frames.forEach(function(f,i){
      var width=Math.max(1,Math.min(i?self.x(f.time)-self.x(frames[i-1].time):10,i<frames.length-1?self.x(frames[i+1].time)-self.x(f.time):10)-2);
      var n=home.level(f),h=n===null?4:n===0?1:3+n*2;
      var bar=svg("rect",{x:self.x(f.time)-width/2,y:36-h,width:width,height:h,"class":"rr-bar rr-"+home.state(f)+" "+(f.kind==="forecast"?"rr-forecast ":"")+(n===null?"rr-missing":"")});
      this.chart.appendChild(bar);
    },this);
    this.chart.appendChild(svg("line",{x1:4,x2:boundary,y1:36,y2:36,"class":"rr-baseline"}));
    this.chart.appendChild(svg("line",{x1:boundary,x2:c.width-4,y1:36,y2:36,"class":"rr-baseline rr-future-line"}));
    if(observed&&forecast)this.chart.appendChild(svg("line",{x1:boundary,x2:boundary,y1:15,y2:40,"class":"rr-boundary"}));
    var step=(last-first)/3600>c.width/40?7200:3600;
    for(var t=Math.ceil(first/step)*step;t<=last;t+=step){var px=this.x(t);var tick=svg("text",{x:px,y:54,"text-anchor":px<25?"start":px>c.width-25?"end":"middle"});tick.textContent=this.timeLabel(t);this.chart.appendChild(tick);}
    this.cursor=svg("g",{"class":"rr-cursor"});this.cursor.appendChild(svg("line",{y1:13,y2:40}));this.cursor.appendChild(svg("circle",{cy:36,r:1.5}));this.chart.appendChild(this.cursor);
    this.slider.min=first;this.slider.max=last;this.slider.disabled=frames.length<2;
  };
  View.prototype.draw=function(){
    if(!this.data || this.destroyed)return;
    var f=this.data.frames[this.index],c=this.config,ctx=this.ctx;
    ctx.clearRect(0,0,c.width,c.height);
    if(f.available){
      var self=this;
      if(!this.paths[this.index])this.paths[this.index]=(f.polygons||[]).map(function(p){
        var path=new Path2D();p.rings.forEach(function(r){r.forEach(function(point,i){var xy=core.pixel(point,c.bounds,c.width,c.height);if(i)path.lineTo(xy[0],xy[1]);else path.moveTo(xy[0],xy[1]);});path.closePath();});
        return {path:path,color:p.color};
      });
      this.paths[this.index].forEach(function(p){ctx.globalCompositeOperation=p.color==="ffffff"?"destination-out":"source-over";ctx.fillStyle=p.color==="ffffff"?"#000":"#"+p.color;ctx.fill(p.path,"evenodd");});
      ctx.globalCompositeOperation="source-over";
    }
    this.cursor.setAttribute("transform","translate("+this.x(f.time)+" 0)");this.slider.value=f.time;
    var kind=f.kind==="forecast"?"Forecast":"Observed";
    this.time.textContent=this.timeLabel(f.time);this.time.title=this.fullFormat.format(new Date(f.time*1000));this.kind.textContent=kind;
    this.slider.setAttribute("aria-valuetext",this.time.title+" · "+kind+" · At home: "+home.intensity(f)+" · "+labelRange(home.level(f)));
    var homeState=home.state(f),wet=homeState==="rain"||homeState==="heavy";
    if(this.homeMarker){
      if(this.homeMarker.dataset.state!==homeState)this.homeMarker.dataset.state=homeState;
      if(this.homeMarker.dataset.kind!==f.kind)this.homeMarker.dataset.kind=f.kind;
    }
    if(this.homeFrame.dataset.state!==homeState)this.homeFrame.dataset.state=homeState;
    if(this.homeFrame.hidden)this.homeFrame.hidden=false;
    content(this.homeFrameTitle,wet?home.intensity(f)+" over home":homeState==="dry"?"Dry at home":"Home data unavailable");
    content(this.homeFrameTime,(this.data.demo?"Demo "+kind.toLowerCase():this.data.replay?"Recorded":kind)+" · "+this.timeLabel(f.time));
    content(this.focus,this.config.adaptivePlayback&&wet?"Following home rain":"");
    // Only touch the controls when they change: an attribute write re-styles the whole widget.
    var animating=String(this.playing&&!this.suspended&&!this.dry&&this.data.frames.length>1);
    var disabled=this.data.frames.length<2||this.dry;
    if(this.play.disabled!==disabled)this.play.disabled=disabled;
    content(this.play,this.playing&&!this.dry?"Ⅱ":"▶");
    var playLabel=this.dry?"No rain in the radar window":this.playing?"Pause radar animation":"Play radar animation";
    if(this.play.getAttribute("aria-label")!==playLabel)this.play.setAttribute("aria-label",playLabel);
    if(this.root.dataset.playing!==animating)this.root.dataset.playing=animating;
    this.status();
  };
  View.prototype.status=function(){
    if(this.destroyed)return;
    var messages=[];
    if(this.error)messages.push(this.error);
    if(this.data){
      if(!this.data.replay && Date.now()/1000-this.data.latestObservation>this.config.staleAfterMinutes*60)messages.push("Stale radar · last observation "+this.timeLabel(this.data.latestObservation));
      var f=this.data.frames[this.index];if(f&&!f.available)messages.push("Frame unavailable");
      if(this.data.horizonLimited)messages.push("Forecast available through "+this.timeLabel(this.data.frames[this.data.frames.length-1].time));
      if(this.data.replay)messages.push("Historical observations · "+this.data.label);
      if(this.data.demo)messages.push("Illustrative weather · not live radar");
    }else if(!this.error)messages.push("Loading radar…");
    if(this.mapFailed)messages.push("Base map unavailable");
    var notice=messages.join(" · ");if(this.notice.textContent!==notice)this.notice.textContent=notice;this.notice.hidden=messages.length===0;
  };
  View.prototype.setWeather=function(data){if(this.weather)this.weather.setData(data);};
  View.prototype.setWeatherError=function(message){if(this.weather)this.weather.setError(message);};
  View.prototype.setError=function(message){this.error=message;this.status();this.renderHomeSummary();};
  View.prototype.schedule=function(){
    clearTimeout(this.timer);this.timer=null;
    if(this.destroyed||this.suspended||!this.playing||this.dry||!this.data||this.data.frames.length<2)return;
    var self=this,delay=home.delay(this.homeTimeline,this.index,this.config,this.speed);
    this.timer=setTimeout(function(){self.index=(self.index+1)%self.data.frames.length;self.draw();self.schedule();},delay);
  };
  View.prototype.setSuspended=function(value){this.suspended=value;this.schedule();if(this.data)this.draw();};
  View.prototype.destroy=function(){this.destroyed=true;clearTimeout(this.timer);clearInterval(this.statusTimer);this.paths=[];};
  return {View:View,wms:wms,labelRange:labelRange};
}));
