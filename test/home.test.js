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
function long(levels,latest=12){return home.analyze({latestObservation:latest*300,frames:levels.map((level,i)=>({time:i*300,kind:i<=latest?'measurement':'forecast',available:level!==null,homeLevel:level}))});}
const total=p=>p.reduce((sum,s)=>sum+s.ms,0);
test('adaptive loop length does not grow with rain duration',()=>{
  const c=core.normalize({}),dry=Array(157).fill(0),wet=Array(157).fill(7);
  assert.ok(Math.abs(total(home.plan(long(dry),c,4))-4600)<1);
  assert.ok(Math.abs(total(home.plan(long(wet),c,4))-total(home.plan(long(wet.map((_,i)=>i<40?7:0)),c,4))+400)<1);
  const showers=dry.map((_,i)=>Math.floor(i/6)%2?2:0);assert.ok(total(home.plan(long(showers),c,4))<=8000+1);
  assert.ok(Math.abs(total(home.plan(long(dry),core.normalize({loopDuration:10000}),4))-11500)<1);
});
test('adaptive loop holds latest, arrival, peak and clearing and samples densest near now',()=>{
  const levels=Array(157).fill(0);for(let i=60;i<84;i++)levels[i]=i>=70&&i<74?7:3;
  const t=long(levels),p=home.plan(t,core.normalize({}),4),ms=i=>(p.find(s=>s.index===i)||{}).ms;
  const even=Math.min(...p.map(s=>s.ms));
  for(const i of [12,60,70,84])assert.ok(ms(i)>even*3,'hold at '+i);
  const gaps=p.slice(1).map((s,k)=>s.index-p[k].index),near=gaps.filter((g,k)=>p[k].index>=12&&p[k].index<24),far=gaps.filter((g,k)=>p[k].index>100);
  assert.ok(Math.max(...near)<Math.min(...far));
  assert.ok(even>=60);
});
test('interpolated playback shows about half as many frames in the same motion budget',()=>{
  const levels=Array(157).fill(0).map((_,i)=>i>=60&&i<84?3:0),t=long(levels);
  const hard=home.plan(t,core.normalize({interpolate:false}),4),soft=home.plan(t,core.normalize({}),4);
  assert.ok(soft.length<hard.length*0.65);assert.ok(Math.abs(total(soft)-total(hard))<1);
});
test('short dry lulls do not add arrival and clearing holds',()=>{
  const levels=Array(157).fill(0);for(let i=30;i<60;i++)levels[i]=i===40||i===50?0:2;
  const p=home.plan(long(levels),core.normalize({}),4),even=Math.min(...p.map(s=>s.ms));
  assert.deepEqual(p.filter(s=>s.ms>even*3).map(s=>s.index),[12,30,60]);
});
test('unavailable frames are never planned',()=>{
  const levels=Array(40).fill(0);levels[5]=null;levels[20]=null;
  for(const cfg of [{},{adaptivePlayback:false}])assert.ok(home.plan(long(levels),core.normalize(cfg),4).every(s=>s.index!==5&&s.index!==20));
});
test('constant playback opt-out and configured latest hold remain available',()=>{
  const t=timeline([0,0,6,0]),c=core.normalize({adaptivePlayback:false,pauseAtLatest:500});
  assert.deepEqual(home.plan(t,c,4).map(s=>s.ms),[120,620,120,120]);
});
test('unknown, dry and heavy rain have distinct states without a thunderstorm claim',()=>{
  assert.equal(home.state({available:false,homeLevel:0}),'unknown');
  assert.equal(home.level({available:true,homeLevel:10}),null);
  assert.equal(home.state({available:true,homeLevel:0}),'dry');
  assert.equal(home.intensity({available:true,homeLevel:6}),'Heavy rain');
});
