const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const core=require('../public/core');
function helper(){const jobs=[];class Provider{forecast(config){return new Promise((resolve,reject)=>jobs.push({weather:true,config,resolve,reject}));}series(config){return new Promise((resolve,reject)=>jobs.push({config,resolve,reject}));}}const sent=[];const context={require:n=>n==='node_helper'?{create:o=>o}:n==='./public/core'?core:n==='./lib/weather'?{WeatherProvider:Provider}:{RadarProvider:Provider},module:{exports:{}},Map,Date,JSON};vm.runInNewContext(fs.readFileSync(require.resolve('../node_helper'),'utf8'),context);const h=context.module.exports;h.sendSocketNotification=(name,payload)=>sent.push({name,payload});h.start();return{h,jobs,sent};}
const flush=()=>new Promise(r=>setImmediate(r));
test('helper isolates simultaneous module instances',async()=>{const{h,jobs,sent}=helper();h.socketNotificationReceived('RAIN_RADAR_REQUEST',{id:'one',config:{}});h.socketNotificationReceived('RAIN_RADAR_REQUEST',{id:'two',config:{forecastHours:2}});assert.equal(jobs.length,2);jobs[1].resolve({version:'two'});jobs[0].resolve({version:'one'});await flush();assert.deepEqual(sent.map(s=>[s.payload.id,s.payload.data.version]),[['two','two'],['one','one']]);});
test('helper discards old config response and never emits after stop',async()=>{const{h,jobs,sent}=helper();h.socketNotificationReceived('RAIN_RADAR_REQUEST',{id:'one',config:{}});h.socketNotificationReceived('RAIN_RADAR_REQUEST',{id:'one',config:{forecastHours:2}});jobs[0].resolve({version:'old'});await flush();assert.equal(sent.length,0);h.stop();jobs[1].resolve({version:'new'});await flush();assert.equal(sent.length,0);});
test('helper validates config and coalesces duplicate requests',()=>{const{h,jobs,sent}=helper();h.socketNotificationReceived('RAIN_RADAR_REQUEST',{id:'one',config:{width:-1}});assert.equal(jobs.length,0);assert.match(sent[0].payload.message,/Configuration/);h.socketNotificationReceived('RAIN_RADAR_REQUEST',{id:'one',config:{}});h.socketNotificationReceived('RAIN_RADAR_REQUEST',{id:'one',config:{}});assert.equal(jobs.length,1);});
test('helper preserves refresh failure during cooldown instead of claiming recovery',async()=>{
  const {h,jobs,sent}=helper();const request={id:'one',config:{}};h.socketNotificationReceived('RAIN_RADAR_REQUEST',request);jobs[0].resolve({version:'old'});await flush();
  h.instances.get('one').lastAttempt=0;h.socketNotificationReceived('RAIN_RADAR_REQUEST',request);jobs[1].reject(Error('offline'));await flush();h.socketNotificationReceived('RAIN_RADAR_REQUEST',request);
  assert.equal(sent[sent.length-1].name,'RAIN_RADAR_ERROR');assert.equal(jobs.length,2);
});

test('weather succeeds independently of radar failure and respects refresh budget',async()=>{
 const {h,jobs,sent}=helper();const request={id:'weather',config:{showWeather:true}};h.socketNotificationReceived('RAIN_RADAR_REQUEST',request);
 jobs.find(j=>j.weather).resolve({hourly:[],daily:[]});jobs.find(j=>!j.weather).reject(Error('radar offline'));await flush();
 assert.ok(sent.some(s=>s.name==='RAIN_RADAR_WEATHER'));assert.ok(sent.some(s=>s.name==='RAIN_RADAR_ERROR'));
 h.socketNotificationReceived('RAIN_RADAR_REQUEST',request);assert.equal(jobs.filter(j=>j.weather).length,1);
});
test('weather errors preserve cached forecast and stopped helper discards late weather',async()=>{
 const {h,jobs,sent}=helper();const request={id:'weather',config:{showWeather:true}};h.socketNotificationReceived('RAIN_RADAR_REQUEST',request);
 jobs.find(j=>j.weather).resolve({current:{temp:12}});jobs.find(j=>!j.weather).resolve({});await flush();h.instances.get('weather').weatherAttempt=0;h.socketNotificationReceived('RAIN_RADAR_REQUEST',request);
 jobs.filter(j=>j.weather)[1].reject(Error('offline'));await flush();assert.ok(h.instances.get('weather').weatherData);assert.equal(sent[sent.length-1].name,'RAIN_RADAR_WEATHER_ERROR');
 h.instances.get('weather').weatherAttempt=0;h.socketNotificationReceived('RAIN_RADAR_REQUEST',request);h.stop();const count=sent.length;jobs.filter(j=>j.weather)[2].resolve({});await flush();assert.equal(sent.length,count);
});
