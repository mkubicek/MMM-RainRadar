"use strict";
// Illustrative weather for the recorded-radar demo. These are invented values, not a forecast.
module.exports=function sampleWeather(now){
  const start=Math.ceil(now/3600000)*3600;
  const hourly=Array.from({length:17},function(_,i){return {time:start+i*3600,temp:17-Math.floor(i/4),wind:2.2,rain:i<6?0.5:0,pop:i<6?0.7:0.2,code:i<6?500:801,night:false,description:i<6?"Light rain":"Partly cloudy"};});
  const daily=Array.from({length:5},function(_,i){const time=Math.floor(now/86400000)*86400+i*86400;return {time:time,date:new Date(time*1000).toISOString().slice(0,10),low:10+i,high:19+i,rain:i===1?3:0,pop:null,code:i===1?500:801,night:false,description:i===1?"Light rain":"Partly cloudy"};});
  return {source:"Synthetic demo",intervalHours:3,intervalEnding:true,current:hourly[0],hourly:hourly,daily:daily,fetchedAt:now,issuedAt:now};
};
