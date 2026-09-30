const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../public/core'),home=require('../public/home');
function timeline(levels,latest=1){return home.analyze({latestObservation:latest*300,frames:levels.map((level,i)=>({time:i*300,kind:i<=latest?'measurement':'forecast',available:level!==null,homeLevel:level}))});}
test('rain windows retain arrival, peak and first dry sample at home',()=>{
  const t=timeline([0,0,1,3,7,7,2,0]);
  assert.deepEqual(t.episodes,[{first:2,last:6,peak:4,end:7,startKnown:true}]);
  assert.equal(t.byFrame[5],t.episodes[0]);assert.equal(t.byFrame[7],undefined);
});
test('missing cells break rain windows and cannot confirm arrival or clearing',()=>{
  const t=timeline([0,1,null,4,0]);
  assert.equal(t.episodes.length,2);assert.equal(t.episodes[0].end,null);
  assert.equal(t.episodes[1].startKnown,false);assert.equal(t.episodes[1].end,4);
  const o=home.outlook(t,450);assert.equal(o.gap,true);assert.equal(o.complete,false);
});
test('outlook skips rain that has already passed and uses the next forecast window',()=>{
  const t=timeline([0,0,2,0,0,3,0]);
  assert.equal(home.outlook(t,950).episode.first,5);
  assert.equal(home.outlook(t,1850).episode,null);assert.equal(home.outlook(t,1850).complete,false);
});
test('missing forecast after a wet window does not become a complete outlook',()=>{
  const t=timeline([0,0,2,3,null]);
  assert.equal(home.outlook(t,400).gap,false);assert.equal(home.outlook(t,400).complete,false);
});
test('adaptive pace makes home rain readable and holds arrival and peak once per window',()=>{
  const t=timeline([0,0,1,3,7,7,2,0]),c=core.normalize({playbackSpeed:2});
  const delays=t.frames.map((_,i)=>home.delay(t,i,c,c.playbackSpeed));
  assert.ok(delays[0]<delays[3]);assert.ok(delays[3]<delays[5]);
  assert.ok(delays[2]>=1600);assert.ok(delays[4]>=1200);
  assert.ok(delays[5]<delays[4]);assert.ok(delays[6]>=900);
  assert.ok(delays[1]>=1000);assert.ok(delays[7]>=800);
});
test('constant playback opt-out and configured latest hold remain available',()=>{
  const t=timeline([0,0,6,0]),c=core.normalize({adaptivePlayback:false,pauseAtLatest:500});
  assert.deepEqual(t.frames.map((_,i)=>home.delay(t,i,c,4)),[120,620,120,120]);
});
test('unknown, dry and heavy rain have distinct states without a thunderstorm claim',()=>{
  assert.equal(home.state({available:false,homeLevel:0}),'unknown');
  assert.equal(home.level({available:true,homeLevel:10}),null);
  assert.equal(home.state({available:true,homeLevel:0}),'dry');
  assert.equal(home.intensity({available:true,homeLevel:6}),'Heavy rain');
});
