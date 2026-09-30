/* global RainRadarView */
(async function(){
  "use strict";
  var params=new URLSearchParams(location.search),mode=params.get("mode");
  if(["live","home"].indexOf(mode)<0)mode="replay";
  if(mode!=="home")document.getElementById(mode).className="active";
  var layout=params.get("layout")==="column"?"&layout=column":"";
  var scenario=mode==="home"?"&scenario="+encodeURIComponent(params.get("scenario")||"arrival"):"";
  document.getElementById("scenario").value=mode==="home"?params.get("scenario")||"arrival":"";
  document.getElementById("scenario").onchange=function(){if(this.value)location.search="?mode=home&scenario="+this.value+layout;};
  ["live","replay"].forEach(function(name){document.getElementById(name).href="?mode="+name+layout;});
  var config=await (await fetch("/config?"+layout)).json();
  document.querySelector("main").style.width=config.width+"px";
  if(config.showWeather&&mode==="replay")document.querySelector("nav span").textContent="Recorded radar · illustrative weather";
  if(mode==="home")document.querySelector("nav span").textContent="Illustrative · not live";
  var view=new RainRadarView.View(document.getElementById("radar"),config);
  if(config.showWeather)fetch("/weather?mode="+mode+layout).then(function(r){if(!r.ok)throw new Error();return r.json();}).then(function(d){view.setWeather(d);},function(){view.setWeatherError("Weather forecast unavailable");});
  function resize(){document.querySelector("main").style.transform="scale("+Math.min(1,(innerWidth-30)/config.width)+")";}
  resize();window.addEventListener("resize",resize);
  async function refresh(){try{var response=await fetch("/data?mode="+mode+layout+scenario);if(!response.ok)throw new Error("Unavailable");view.setData(await response.json());}catch(error){view.setError("Radar unavailable — try again shortly");}}
  await refresh();if(mode==="live")setInterval(refresh,config.updateInterval);
  document.addEventListener("visibilitychange",function(){view.setSuspended(document.hidden);});
  window.addEventListener("pagehide",function(){view.destroy();});
}());
