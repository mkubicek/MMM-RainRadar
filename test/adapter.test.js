const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const core=require('../public/core');
function adapter(config={}){
  const timers=new Map(),sent=[];let next=0,definition;
  class View{constructor(root){this.root=root;}setData(data){this.data=data;this.error='';}setError(error){this.error=error;}setWeather(data){this.weather=data;}setWeatherError(error){this.weatherError=error;}setSuspended(value){this.suspended=value;}}
  vm.runInNewContext(fs.readFileSync(require.resolve('../MMM-RainRadar'),'utf8'),{Module:{register:(name,d)=>definition=d},RainRadarCore:core,RainRadarView:{View},document:{createElement:()=>({})},setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id)});
  const m=Object.assign({},definition,{config,data:{},identifier:'one',sendSocketNotification:(name,payload)=>sent.push({name,payload})});m.start();return{m,sent,timers};
}
test('adapter pauses polling and playback when hidden before DOM creation',()=>{
  const {m,sent,timers}=adapter();assert.equal(sent.length,1);m.suspend();assert.equal(timers.size,0);m.getDom();assert.equal(m.radarView.suspended,true);
  m.socketNotificationReceived('RAIN_RADAR_ERROR',{id:'one',message:'Offline'});assert.equal(timers.size,0);m.resume();assert.equal(sent.length,2);assert.equal(m.radarView.suspended,false);assert.equal(timers.size,1);
});
test('adapter retains data on failure, retries, recovers and ignores other instances',()=>{
  const {m,timers}=adapter();m.getDom();const data={frames:[]};m.socketNotificationReceived('RAIN_RADAR_DATA',{id:'other',data});assert.equal(m.radarData,null);
  m.socketNotificationReceived('RAIN_RADAR_DATA',{id:'one',data});m.socketNotificationReceived('RAIN_RADAR_ERROR',{id:'one',message:'Offline'});assert.equal(m.radarView.data,data);assert.equal(m.radarView.error,'Offline');assert.equal([...timers.values()][0].ms,60000);
  m.socketNotificationReceived('RAIN_RADAR_DATA',{id:'one',data});assert.equal(m.radarView.error,'');
});
test('invalid configuration stays local and title markup is escaped',()=>{
  const {m,sent}=adapter({width:-1});assert.equal(sent.length,0);assert.match(m.getDom().textContent,/width/);
  assert.equal(adapter({title:'<rain>'}).m.getHeader(),'&lt;rain&gt;');
});

test('weather arriving before DOM creation is retained independently of radar',()=>{
 const {m}=adapter({showWeather:true});const weather={current:{temp:12}};
 m.socketNotificationReceived('RAIN_RADAR_WEATHER',{id:'other',data:weather});assert.equal(m.weatherData,null);
 m.socketNotificationReceived('RAIN_RADAR_WEATHER',{id:'one',data:weather});m.getDom();assert.equal(m.radarView.weather,weather);
 m.socketNotificationReceived('RAIN_RADAR_WEATHER_ERROR',{id:'one',message:'Offline'});assert.equal(m.radarView.weather,weather);assert.equal(m.radarView.weatherError,'Offline');
});
