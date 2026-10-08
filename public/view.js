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
    this.suspended=false;this.destroyed=false;this.paths=[];this.frameCanvases=[];this.masks={};this.vectors={};this.timer=null;this.error="";this.mapFailed=false;
    this.format=new Intl.DateTimeFormat(config.locale,{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:config.timeZone});
    this.fullFormat=new Intl.DateTimeFormat(config.locale,{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false,timeZone:config.timeZone});
    this.build();
    var self=this;this.statusTimer=setInterval(function(){self.status();self.renderHomeSummary();if(self.weather)self.weather.refresh();},60000);
  }
  View.prototype.build=function(){
    var self=this,c=this.config,r=this.root;
    r.classList.add("rr-widget");r.style.width=c.width+"px";r.setAttribute("aria-label","Rain radar");
    if(c.showWeather)this.weather=new weather.Forecast(r,c);
    // One glanceable line about rain at home, next to the current weather when it is shown.
    this.homeStatus=element("div","rr-home-status");this.homeStatus.hidden=!c.showHomeStatus;this.homeStatus.setAttribute("role","status");
    this.homeStatusTitle=element("span","rr-home-status-title","");this.homeStatusDetail=element("span","rr-home-status-detail","");
    this.homeStatus.appendChild(this.homeStatusTitle);this.homeStatus.appendChild(this.homeStatusDetail);
    var top=element("div","rr-top");if(this.weather)top.appendChild(this.weather.now);top.appendChild(this.homeStatus);r.appendChild(top);
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
      if(p.home)self.homeMarker=group;
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
    this.focus.hidden=!c.showHomeSummary;
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
    this.homeTimeline=home.analyze(data);this.plan=home.plan(this.homeTimeline,this.config,this.speed);
    this.hasAnimation=data.frames.filter(function(f){return f.available;}).length>1;
    var observation=this.homeTimeline.frames[this.homeTimeline.latest],initial=observation?observation.time:data.latestObservation;
    this.index=previous===undefined || previous===null?core.nearestIndex(data.frames,data.replay?data.frames[0].time:initial):core.nearestIndex(data.frames,previous);
    if(this.playing&&!data.frames[this.index].available&&observation)this.index=this.homeTimeline.latest;
    // Nothing to animate when no frame shows rain: hold the latest observation instead of
    // redrawing identical empty frames several times a second.
    this.dry=!data.replay && data.frames.every(function(f){return home.level(f)===0&&(!f.polygons || !f.polygons.length);});
    if(this.dry&&this.playing)this.index=core.nearestIndex(data.frames,data.latestObservation);
    this.paths=new Array(data.frames.length);this.frameCanvases=new Array(data.frames.length);this.masks={};this.vectors={};
    this.glideMs=this.plan.length?Math.min.apply(null,this.plan.map(function(s){return s.ms;})):0;this.renderChart();this.renderHomeSummary();this.draw();this.schedule();this.status();
  };
  // "Light rain in 85 min / from 20:30 · dry ~21:05": what the latest radar and forecast say
  // about home, using the same arrival and clearing moments the timeline labels show.
  View.prototype.renderHomeStatus=function(){
    var t=this.homeTimeline,frames=t.frames,f=frames[t.latest],now=Date.now()/1000,self=this,title,detail="",tone;
    var at=function(i){return self.timeLabel(frames[i].time);};
    var moments=home.moments(t),clearingAfter=function(i){var m=moments.find(function(x){return x.kind==="clearing"&&x.index>i;});return m?m.index:null;};
    var n=home.level(f),observed=f?f.time:this.data.latestObservation;
    if(n===null){title="Home radar unavailable";tone="unknown";}
    else if(n>0){
      var current=t.byFrame[t.latest],dry=clearingAfter(t.latest);
      tone=home.state(f);title=(n>=6?"Heavy rain":n<=2?"Light rain":"Rain")+" now";
      var heavyLater=current&&current.peak>t.latest&&home.level(frames[current.peak])>=6;
      detail=(heavyLater?"heavy ~"+at(current.peak)+" · ":"")+(dry!==null?"dry ~"+at(dry):"through "+at(frames.length-1));
    }else{
      var next=t.episodes.find(function(e){return e.first>t.latest;});
      if(next){
        var peak=home.level(frames[next.peak]),start=frames[next.first].time,minutes=Math.max(1,Math.round((start-now)/60)),dryAt=clearingAfter(next.first);
        tone=peak>=6?"heavy":"rain";
        title=(peak>=6?"Heavy rain":peak<=2?"Light rain":"Rain")+(minutes<=90?" in "+minutes+" min":" ~"+at(next.first));
        detail=(minutes<=90?"from "+at(next.first):"in "+Math.round(minutes/30)/2+" h")+(dryAt!==null?" · dry ~"+at(dryAt):"");
      }else{title="Dry";tone="dry";detail="through "+at(frames.length-1);}
    }
    if(!this.data.replay&&now-observed>this.config.staleAfterMinutes*60){tone="unknown";detail="Radar from "+this.timeLabel(observed)+(detail?" · "+detail:"");}
    if(this.homeStatus.dataset.state!==tone)this.homeStatus.dataset.state=tone;
    content(this.homeStatusTitle,title);content(this.homeStatusDetail,detail);
  };
  View.prototype.renderHomeSummary=function(){
    if(this.destroyed)return;
    if(this.data)this.renderHomeStatus();
    if(!this.data){content(this.homeHeadline,this.error?"Home radar unavailable":"Checking rain at home…");return;}
    var d=this.data,t=this.homeTimeline,f=t.frames[t.latest],now=Date.now()/1000;
    var outlook=home.outlook(t,now),e=outlook.episode,title,detail="",tone=home.state(f);
    var observedTime=f?f.time:d.latestObservation,stale=!d.replay&&now-observedTime>this.config.staleAfterMinutes*60;
    var source=(d.demo?"DEMO":d.replay?"RECORDING":stale?"OLD RADAR":"LATEST RADAR")+" · "+this.timeLabel(observedTime);
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
      if(stale){detail="Updated "+Math.floor((now-observedTime)/60)+" min ago · "+detail;tone="unknown";}
    }
    if(this.homeSummary.dataset.state!==tone)this.homeSummary.dataset.state=tone;
    content(this.homeSource,source);content(this.homeHeadline,title);content(this.homeDetail,detail);
  };
  // Home rain as a continuous step profile: each frame spans to the midpoints of its
  // neighbours, and runs of equal frames share one rect; missing data is a dotted line.
  // Labels sit in a row above it.
  var BASE=40;
  function barHeight(n){return n?4+(n-1)*2.5:0;}
  View.prototype.renderChart=function(){
    var self=this,c=this.config,frames=this.data.frames,first=frames[0].time,last=frames[frames.length-1].time;
    while(this.chart.firstChild)this.chart.removeChild(this.chart.firstChild);
    var observed=frames.some(function(f){return f.kind==="measurement";}),forecast=frames.some(function(f){return f.kind==="forecast";});
    var boundary=this.x(Math.min(last,Math.max(first,this.data.latestObservation)));
    var xs=frames.map(function(f){return self.x(f.time);});
    var edge=function(i,side){var j=i+side;return j>=0&&j<frames.length?(xs[i]+xs[j])/2:xs[i]+side*Math.min(5,Math.abs(xs[i]-xs[i-side]||10)/2);};
    for(var i=0;i<frames.length;){
      var f=frames[i],n=home.level(f),j=i;
      while(j+1<frames.length&&home.level(frames[j+1])===n&&frames[j+1].kind===f.kind)j++;
      var left=edge(i,-1),right=edge(j,1),h=barHeight(n);
      if(n===null)this.chart.appendChild(svg("line",{x1:left+1,x2:Math.max(left+2,right-1),y1:BASE-3,y2:BASE-3,"class":"rr-missing"}));
      else if(n>0)this.chart.appendChild(svg("rect",{x:left,y:BASE-h,width:right-left,height:h,"class":"rr-bar rr-"+home.state(f)+(f.kind==="forecast"?" rr-forecast":"")}));
      i=j+1;
    }
    this.chart.appendChild(svg("line",{x1:4,x2:boundary,y1:BASE,y2:BASE,"class":"rr-baseline"}));
    this.chart.appendChild(svg("line",{x1:boundary,x2:c.width-4,y1:BASE,y2:BASE,"class":"rr-baseline rr-future-line"}));
    if(observed&&forecast)this.chart.appendChild(svg("line",{x1:boundary,x2:boundary,y1:13,y2:BASE+3,"class":"rr-boundary"}));
    var step=(last-first)/3600>c.width/40?7200:3600;
    for(var t=Math.ceil(first/step)*step;t<=last;t+=step){
      var px=this.x(t);this.chart.appendChild(svg("line",{x1:px,x2:px,y1:BASE,y2:BASE+3,"class":"rr-hour-tick"}));
      var tick=svg("text",{x:px,y:54,"text-anchor":px<25?"start":px>c.width-25?"end":"middle"});tick.textContent=this.timeLabel(t);this.chart.appendChild(tick);
    }
    // Top row: period names and upcoming arrival, peak and clearing at home (where playback
    // pauses). A moment whose label would overlap an earlier one is left unmarked.
    var taken=[];
    var place=function(text,x,anchor,className){
      var width=text.length*4.2,from=anchor==="end"?x-width:x;
      if(taken.some(function(s){return from<s[1]+4&&from+width>s[0]-4;}))return false;
      var label=svg("text",{x:x,y:10,"text-anchor":anchor,"class":className});label.textContent=text;self.chart.appendChild(label);
      taken.push([from,from+width]);return true;
    };
    place(this.data.replay?"REPLAY · "+this.data.label:this.data.demo?"DEMO · AT HOME":observed?"Past":"",4,"start","rr-period");
    var latest=this.homeTimeline.latest;
    home.moments(this.homeTimeline).forEach(function(m){
      if(m.index<=latest)return;
      var px=xs[m.index],heavy=home.level(frames[m.index])>=6,kind=" rr-"+m.kind+(heavy?" rr-heavy":"");
      var name=m.kind==="arrival"?"Rain":m.kind==="clearing"?"Dry":heavy?"Heavy":"Peak",end=px>c.width-50;
      if(place(name+" "+self.timeLabel(frames[m.index].time),end?px:px-1,end?"end":"start","rr-event"+kind))
        self.chart.appendChild(svg("line",{x1:px,x2:px,y1:13,y2:BASE,"class":"rr-event-tick"+kind}));
    });
    if(forecast)place("Forecast",Math.min(c.width-44,boundary+4),"start","rr-period");
    this.cursor=svg("g",{"class":"rr-cursor"});this.cursor.appendChild(svg("line",{y1:13,y2:BASE+3}));this.cursor.appendChild(svg("circle",{cy:BASE,r:1.5}));this.chart.appendChild(this.cursor);
    this.slider.min=first;this.slider.max=last;this.slider.disabled=frames.length<2;
  };
  View.prototype.draw=function(){
    if(!this.data || this.destroyed)return;
    var f=this.data.frames[this.index],c=this.config;
    this.ctx.clearRect(0,0,c.width,c.height);this.paint(this.ctx,this.index);
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
    var hideFrame=!this.config.showHomeSummary;
    if(this.homeFrame.hidden!==hideFrame)this.homeFrame.hidden=hideFrame;
    content(this.homeFrameTitle,wet?home.intensity(f)+" over home":homeState==="dry"?"Dry at home":"Home data unavailable");
    content(this.homeFrameTime,(this.data.demo?"Demo "+kind.toLowerCase():this.data.replay?"Recorded":kind)+" · "+this.timeLabel(f.time));
    content(this.focus,this.config.showHomeSummary&&this.config.adaptivePlayback&&wet?"Following home rain":"");
    // Only touch the controls when they change: an attribute write re-styles the whole widget.
    var animating=String(this.playing&&!this.suspended&&!this.dry&&this.hasAnimation);
    var disabled=!this.hasAnimation||this.dry;
    if(this.play.disabled!==disabled)this.play.disabled=disabled;
    content(this.play,this.playing&&!this.dry?"Ⅱ":"▶");
    var playLabel=this.dry?"No rain in the radar window":this.playing?"Pause radar animation":"Play radar animation";
    if(this.play.getAttribute("aria-label")!==playLabel)this.play.setAttribute("aria-label",playLabel);
    if(this.root.dataset.playing!==animating)this.root.dataset.playing=animating;
    this.status();
  };
  View.prototype.paint=function(ctx,index){
    var f=this.data.frames[index],c=this.config;
    if(!f.available)return;
    if(!this.paths[index])this.paths[index]=(f.polygons||[]).map(function(p){
      var path=new Path2D();p.rings.forEach(function(r){r.forEach(function(point,i){var xy=core.pixel(point,c.bounds,c.width,c.height);if(i)path.lineTo(xy[0],xy[1]);else path.moveTo(xy[0],xy[1]);});path.closePath();});
      return {path:path,color:p.color};
    });
    this.paths[index].forEach(function(p){ctx.globalCompositeOperation=p.color==="ffffff"?"destination-out":"source-over";ctx.fillStyle=p.color==="ffffff"?"#000":"#"+p.color;ctx.fill(p.path,"evenodd");});
    ctx.globalCompositeOperation="source-over";
  };
  // Interpolation: planned frames are rendered once to offscreen canvases, then each glide
  // slides both frames along the estimated rain motion and blends them.
  View.prototype.canGlide=function(){
    return this.config.interpolate&&typeof this.ctx.drawImage==="function"&&
      !(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };
  View.prototype.frameCanvas=function(index){
    if(this.frameCanvases[index])return this.frameCanvases[index];
    var canvas=document.createElement("canvas");canvas.width=this.canvas.width;canvas.height=this.canvas.height;
    var ctx=canvas.getContext("2d");ctx.scale(this.config.pixelRatio,this.config.pixelRatio);this.paint(ctx,index);
    return this.frameCanvases[index]=canvas;
  };
  View.prototype.mask=function(index,w,h){
    var key=index+":"+w;if(this.masks[key])return this.masks[key];
    var canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    var ctx=canvas.getContext("2d");ctx.drawImage(this.frameCanvas(index),0,0,w,h);
    var pixels=ctx.getImageData(0,0,w,h).data,mask=new Uint8Array(w*h);
    for(var i=0;i<mask.length;i++)mask[i]=pixels[i*4+3]>40?1:0;
    return this.masks[key]=mask;
  };
  View.prototype.motion=function(a,b){
    var key=a+">"+b,frames=this.data.frames;if(this.vectors[key])return this.vectors[key];
    var vector=[0,0],c=this.config;
    // Beyond 30 minutes rain grows and decays more than it moves: crossfade only.
    if(frames[b].time-frames[a].time<=1800){
      var qw=Math.max(8,Math.round(c.width/4)),qh=Math.max(4,Math.round(c.height/4)),hw=qw*2,hh=qh*2;
      var coarse=shift(this.mask(a,qw,qh),this.mask(b,qw,qh),qw,qh,[0,0],10,6);
      if(coarse){var fine=shift(this.mask(a,hw,hh),this.mask(b,hw,hh),hw,hh,[coarse[0]*2,coarse[1]*2],2,2);vector=[fine[0]*c.width/hw,fine[1]*c.height/hh];}
    }
    return this.vectors[key]=vector;
  };
  View.prototype.blend=function(a,b,f,vector){
    var c=this.config,ctx=this.ctx,frames=this.data.frames;
    ctx.clearRect(0,0,c.width,c.height);
    ctx.globalAlpha=1-f;ctx.drawImage(this.frameCanvas(a),vector[0]*f,vector[1]*f,c.width,c.height);
    ctx.globalCompositeOperation="lighter";ctx.globalAlpha=f;ctx.drawImage(this.frameCanvas(b),-vector[0]*(1-f),-vector[1]*(1-f),c.width,c.height);
    ctx.globalCompositeOperation="source-over";ctx.globalAlpha=1;
    this.cursor.setAttribute("transform","translate("+(this.x(frames[a].time)*(1-f)+this.x(frames[b].time)*f)+" 0)");
  };
  View.prototype.status=function(){
    if(this.destroyed)return;
    var messages=[];
    if(this.error)messages.push(this.error);
    if(this.data){
      var observation=this.data.frames[this.homeTimeline.latest],observedTime=observation?observation.time:this.data.latestObservation;
      if(!this.data.replay && Date.now()/1000-observedTime>this.config.staleAfterMinutes*60)messages.push("Stale radar · last observation "+this.timeLabel(observedTime));
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
    if(this.destroyed||this.suspended||!this.playing||this.dry||!this.data||!this.hasAnimation)return;
    // After a pause or scrub the current frame may not be in the plan: continue from the next planned frame.
    var self=this,plan=this.plan,index=this.index;
    var at=plan.findIndex(function(s){return s.index===index;}),next=at>=0?(at+1)%plan.length:plan.findIndex(function(s){return s.index>index;});
    if(next<0)next=0;
    var target=plan[next].index,wait=at>=0?plan[at].ms:plan[next].ms;
    // Glide into the next planned frame (never across the loop restart); holds stay still first.
    var glide=at>=0&&target>index&&this.canGlide()?Math.min(wait,this.glideMs):0;
    var vector=glide?this.motion(index,target):null;
    var arrive=function(){self.timer=null;self.index=target;self.draw();self.schedule();};
    // Glide images come from a plain timer at glideFps. The Pi composites in software, so
    // each image costs a full frame; animation-frame callbacks would also keep the frame
    // pipeline busy at the display rate even when nothing changes.
    var steps=glide?Math.max(1,Math.round(glide*this.config.glideFps/1000)):0,interval=steps?glide/steps:0,k=0;
    var step=function(){
      k++;
      if(k>=steps){arrive();return;}
      self.blend(index,target,k/steps,vector);self.timer=setTimeout(step,interval);
    };
    this.timer=steps?setTimeout(step,wait-glide+interval):setTimeout(arrive,wait);
  };
  View.prototype.setSuspended=function(value){this.suspended=value;this.schedule();if(this.data)this.draw();};
  View.prototype.destroy=function(){
    this.destroyed=true;clearTimeout(this.timer);clearInterval(this.statusTimer);
    this.paths=[];this.frameCanvases=[];this.masks={};this.vectors={};
  };
  // Best whole-pixel shift of rain mask a onto b around a guess, scored by mismatched wet cells.
  function shift(a,b,w,h,guess,rx,ry){
    var wet=0,i;for(i=0;i<a.length;i++)wet+=a[i]+b[i];
    if(wet<12)return null;
    var best=guess,bestScore=Infinity;
    for(var dy=guess[1]-ry;dy<=guess[1]+ry;dy++)for(var dx=guess[0]-rx;dx<=guess[0]+rx;dx++){
      var miss=0,seen=0;
      for(var y=Math.max(0,dy);y<Math.min(h,h+dy);y++)for(var x=Math.max(0,dx);x<Math.min(w,w+dx);x++){
        var va=a[(y-dy)*w+x-dx],vb=b[y*w+x];if(va|vb){seen++;if(va!==vb)miss++;}
      }
      // A small distance penalty prefers the shortest of equally good shifts.
      var score=(seen?miss/seen:1)+0.002*((dx-guess[0])*(dx-guess[0])+(dy-guess[1])*(dy-guess[1]));
      if(score<bestScore){bestScore=score;best=[dx,dy];}
    }
    return best;
  }
  return {View:View,wms:wms,labelRange:labelRange,shift:shift};
}));
