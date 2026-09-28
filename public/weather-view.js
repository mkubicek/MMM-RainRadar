/* Static forecast panels: updated on data refresh/hour changes, never by radar animation. */
(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory();
  else root.RainRadarWeather=factory();
}(typeof self!=="undefined"?self:this,function(){
  "use strict";
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function value(n,suffix){return Number.isFinite(n)?Math.round(n)+(suffix||""):"—";}
  function amount(n){return Number.isFinite(n)?(n===0?"0":n<0.1?"<0.1":n.toFixed(1).replace(/\.0$/,""))+" mm":"— mm";}
  function icon(p){
    var n=document.createElementNS("http://www.w3.org/2000/svg","svg");n.setAttribute("viewBox","0 0 24 24");n.setAttribute("class","rr-weather-icon");n.setAttribute("aria-hidden","true");
    var tone=p.code===800?(p.night?"moon":"sun"):p.code===801?"sun":p.code>=200&&p.code<300?"storm":p.code>=300&&p.code<600?"rain":p.code>=600&&p.code<700?"snow":"cloud";
    n.setAttribute("data-tone",tone);
    var cloud="M5 16a4 4 0 0 1-1-7 6 6 0 0 1 11-2 4.5 4.5 0 1 1 3 9H5";
    var sun="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 1v3 M12 20v3 M1 12h3 M20 12h3 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2";
    var d=p.code===800?(p.night?"M18 16A8 8 0 0 1 8 5a8 8 0 1 0 10 11":sun):cloud;
    if(p.code===null)d="M8 8a4 4 0 1 1 6 4l-2 2 M12 18v1";
    else if(p.code>=200&&p.code<300)d=cloud+" M13 13l-4 6h4l-2 4";
    else if(p.code>=300&&p.code<600)d=cloud+" M7 19l-1 3 M12 19l-1 3 M17 19l-1 3";
    else if(p.code>=600&&p.code<700)d=cloud+" M8 19v4 M6 21h4 M17 19v4 M15 21h4";
    else if(p.code>=700&&p.code<800)d="M3 7h18 M5 12h14 M3 17h18";
    else if(p.code===801)d="M6 2v2 M1 7h2 M2 2l2 2 M10 3l2-2 M5 11a4 4 0 1 1 6-5 "+cloud;
    var path=document.createElementNS(n.namespaceURI,"path");path.setAttribute("d",d);n.appendChild(path);return n;
  }
  function dayKey(time,zone){
    var parts=new Intl.DateTimeFormat("en-GB",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(time));
    return ["year","month","day"].map(function(k){return parts.find(function(p){return p.type===k;}).value;}).join("-");
  }
  function blocks(hours,now){
    var start=Math.ceil(now/3600000)*3600,byTime={};hours.forEach(function(h){byTime[h.time]=h;});
    var result=[];
    for(var i=0;i<4;i++){
      var t=start+i*10800,end=t+10800,rows=[1,2,3].map(function(n){return byTime[t+n*3600];}),last=rows[2];
      var complete=rows.every(function(h){return !!h;});
      result.push({time:t,end:end,temp:last?last.temp:null,code:last?last.code:null,night:last&&last.night,description:last?last.description:"Unavailable",
        pop:last?last.pop:null,
        rain:complete&&rows.every(function(h){return h.rain!==null;})?rows.reduce(function(sum,h){return sum+h.rain;},0):null,
        wind:complete&&rows.every(function(h){return h.wind!==null;})?Math.max.apply(null,rows.map(function(h){return h.wind;})):null});
    }
    return result;
  }
  function Forecast(root,config){
    this.config=config;this.data=null;this.error="";this.renderedHour=null;
    this.hour=new Intl.DateTimeFormat(config.locale,{hour:"2-digit",hour12:false,timeZone:config.timeZone});
    this.day=new Intl.DateTimeFormat("en-GB",{weekday:"short",timeZone:config.timeZone});
    this.date=new Intl.DateTimeFormat(config.locale,{month:"short",day:"numeric",timeZone:config.timeZone});
    this.now=el("div","rr-weather-now");this.now.textContent="Loading weather…";root.appendChild(this.now);
    this.panels=el("div","rr-weather-panels");this.notice=el("div","rr-weather-notice");this.notice.setAttribute("role","status");
  }
  Forecast.prototype.setData=function(data){if(this.data===data)return;this.data=data;this.error="";this.render();};
  Forecast.prototype.setError=function(message){this.error=message;this.status();};
  Forecast.prototype.refresh=function(){if(this.data&&this.renderedHour!==Math.floor(Date.now()/3600000))this.render();else this.status();};
  Forecast.prototype.status=function(){
    var message=this.error;
    if(this.data&&(Date.now()-(this.data.issuedAt||this.data.fetchedAt)>7200000))message=message?message+" · Stale weather":"Stale weather forecast";
    if(!this.data&&message)this.now.textContent="Weather unavailable";
    this.notice.textContent=message;this.notice.hidden=!message;
  };
  Forecast.prototype.render=function(){
    if(!this.data)return;var self=this,d=this.data;this.renderedHour=Math.floor(Date.now()/3600000);
    var current=d.hourly.find(function(h){return h.time>=Date.now()/1000&&h.temp!==null;})||d.current;
    this.now.title="MeteoSwiss forecast for the current hour";
    this.now.textContent="";this.now.appendChild(icon(current));this.now.appendChild(el("span","rr-current-temp",value(current.temp,"°")));
    var summary=el("div","rr-current-summary");summary.appendChild(el("div","rr-current-condition",current.description));
    summary.appendChild(el("div","rr-current-detail","Wind "+value(current.wind===null?null:current.wind*3.6," km/h")+" · Forecast"));this.now.appendChild(summary);
    this.panels.textContent="";
    this.panels.appendChild(el("div","rr-weather-heading","NEXT 12 HOURS"));
    var hours=el("div","rr-weather-hours");
    blocks(d.hourly,Date.now()).forEach(function(h){
      var cell=el("div","rr-weather-hour");cell.title=h.description+" · Temperature in final hour · Three-hour rain chance · Three-hour precipitation · Wind "+value(h.wind===null?null:h.wind*3.6," km/h");
      cell.appendChild(el("div","rr-hour-label",self.hour.format(new Date(h.time*1000))+"–"+self.hour.format(new Date(h.end*1000))));
      var temp=el("div","rr-hour-temp");temp.appendChild(icon(h));temp.appendChild(el("span",null,value(h.temp,"°")));cell.appendChild(temp);
      cell.appendChild(el("div","rr-rain-chance",value(h.pop===null?null:h.pop*100,"%")));
      cell.appendChild(el("div","rr-rain-amount",amount(h.rain)));hours.appendChild(cell);
    });this.panels.appendChild(hours);
    this.panels.appendChild(el("div","rr-weather-heading rr-days-heading","NEXT 3 DAYS"));
    var days=el("div","rr-weather-days");
    // Daily entries were selected in the configured timezone by the provider.
    var upcoming=d.daily.filter(function(day){return day.date>dayKey(Date.now(),self.config.timeZone);}).slice(0,3);
    upcoming.forEach(function(day){
      var cell=el("div","rr-weather-day");cell.title=self.date.format(new Date(day.time*1000))+" · "+day.description;
      cell.appendChild(el("div","rr-day-label",self.day.format(new Date(day.time*1000))));
      var temp=el("div","rr-day-temp");temp.appendChild(icon(day));temp.appendChild(el("span",null,value(day.high,"°")));temp.appendChild(el("span","rr-low",value(day.low,"°")));cell.appendChild(temp);
      cell.appendChild(el("div","rr-day-rain",amount(day.rain)));days.appendChild(cell);
    });
    if(upcoming.length<3)days.appendChild(el("div","rr-weather-notice","Daily forecast incomplete"));
    this.panels.appendChild(days);this.status();
  };
  return {Forecast:Forecast,blocks:blocks,amount:amount};
}));
