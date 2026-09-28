const test=require('node:test'),assert=require('node:assert/strict');
const sample=require('../demo/weather-fixture');
const {blocks}=require('../public/weather-view');
test('offline demo weather fills all panels without a provider request',()=>{
 const now=Date.parse('2026-09-27T12:00:00Z'),data=sample(now);
 assert.equal(data.source,'Synthetic demo');
 const hours=blocks(data.hourly,now);
 assert.equal(hours.length,4);
 assert.ok(hours.every(h=>Number.isFinite(h.temp)&&Number.isFinite(h.rain)));
 assert.ok(data.daily.every(d=>Number.isFinite(d.high)&&Number.isFinite(d.low)));
});
