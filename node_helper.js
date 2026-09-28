"use strict";
const NodeHelper=require("node_helper");
const core=require("./public/core");
const {RadarProvider}=require("./lib/provider");
const {WeatherProvider}=require("./lib/weather");
module.exports=NodeHelper.create({
  requiresVersion:"2.18.0",
  start:function(){this.provider=new RadarProvider();this.weatherProvider=new WeatherProvider();this.instances=new Map();this.stopped=false;},
  socketNotificationReceived:function(notification,payload){
    if(notification!=="RAIN_RADAR_REQUEST" || this.stopped || !payload || typeof payload.id!=="string" || !/^[\w-]{1,160}$/.test(payload.id))return;
    let config;
    try{config=core.normalize(payload.config);}catch(error){this.sendSocketNotification("RAIN_RADAR_ERROR",{id:payload.id,message:"Configuration: "+error.message});return;}
    let state=this.instances.get(payload.id);
    const signature=JSON.stringify(config);
    if(!state || state.signature!==signature){
      if(!state && this.instances.size>=32)return;
      state={signature:signature,busy:false,lastAttempt:0,data:null};this.instances.set(payload.id,state);
    }
    if(config.showWeather)this.requestWeather(payload.id,config,state);
    if(state.busy)return;
    if(Date.now()-state.lastAttempt<30000){
      if(state.error)this.sendSocketNotification("RAIN_RADAR_ERROR",{id:payload.id,message:state.error});
      else if(state.data)this.sendSocketNotification("RAIN_RADAR_DATA",{id:payload.id,data:state.data});
      return;
    }
    state.busy=true;state.lastAttempt=Date.now();
    this.provider.series(config).then(data=>{
      if(this.stopped || this.instances.get(payload.id)!==state)return;
      state.data=data;state.error=null;this.sendSocketNotification("RAIN_RADAR_DATA",{id:payload.id,data:data});
    }).catch(()=>{
      state.error="Radar unavailable — retrying shortly";
      if(!this.stopped && this.instances.get(payload.id)===state)this.sendSocketNotification("RAIN_RADAR_ERROR",{id:payload.id,message:state.error});
    }).then(()=>{state.busy=false;});
  },
  requestWeather:function(id,config,state){
    if(state.weatherBusy)return;
    if(state.weatherAttempt && Date.now()-state.weatherAttempt<900000){
      if(state.weatherData)this.sendSocketNotification("RAIN_RADAR_WEATHER",{id:id,data:state.weatherData});
      if(state.weatherError)this.sendSocketNotification("RAIN_RADAR_WEATHER_ERROR",{id:id,message:state.weatherError});
      return;
    }
    state.weatherBusy=true;state.weatherAttempt=Date.now();
    this.weatherProvider.forecast(config).then(data=>{
      if(this.stopped||this.instances.get(id)!==state)return;
      state.weatherData=data;state.weatherError=null;this.sendSocketNotification("RAIN_RADAR_WEATHER",{id:id,data:data});
    }).catch(()=>{
      state.weatherError="Weather forecast unavailable";
      if(!this.stopped&&this.instances.get(id)===state)this.sendSocketNotification("RAIN_RADAR_WEATHER_ERROR",{id:id,message:state.weatherError});
    }).then(()=>{state.weatherBusy=false;});
  },
  stop:function(){this.stopped=true;this.instances.clear();}
});
