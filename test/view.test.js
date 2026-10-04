const test=require('node:test');const assert=require('node:assert/strict');const{parseHTML}=require('linkedom');const core=require('../public/core');
function setup(options){const{window,document}=parseHTML('<html><body><div id="root"></div></body></html>');global.window=window;global.document=document;window.matchMedia=()=>({matches:false});window.HTMLCanvasElement.prototype.getContext=function(){return{scale(){},clearRect(){},fill(){}};};global.Path2D=class{moveTo(){}lineTo(){}closePath(){}};const{View}=require('../public/view');return new View(document.getElementById('root'),core.normalize(Object.assign({autoplay:false},options)));}
const now=Math.floor(Date.now()/1000);const frames=[0,300,600].map((delta,i)=>({time:now+delta,kind:i?'forecast':'measurement',available:true,homeLevel:i,polygons:[]}));
const data={latestObservation:now,frames,partial:false,replay:false};
test('refresh preserves paused frame and configured playback speed',()=>{const v=setup({playbackSpeed:8});try{v.setData(data);v.slider.value=now+300;v.slider.oninput();v.setData(data);assert.equal(v.index,1);assert.equal(v.playing,false);assert.equal(v.speed,8);}finally{v.destroy();}});
test('scrubbing selects map and chart together; keyboard steps entire frames',()=>{const v=setup();try{v.setData(data);v.slider.value=now+590;v.slider.oninput();assert.equal(v.index,2);assert.equal(v.kind.textContent,'Forecast');assert.match(v.cursor.getAttribute('transform'),/translate/);v.slider.onkeydown({key:'Home',preventDefault(){},stopPropagation(){}});assert.equal(v.index,0);assert.equal(v.kind.textContent,'Observed');}finally{v.destroy();}});
test('missing frames are visibly unavailable, not drawn as dry',()=>{const v=setup();try{v.setData(Object.assign({},data,{partial:true,frames:[{time:now,kind:'measurement',available:false,homeLevel:null,polygons:[]}]}));assert.match(v.notice.textContent,/Frame unavailable/);assert.match(v.slider.getAttribute('aria-valuetext'),/Unavailable/);}finally{v.destroy();}});
const wet=Object.assign({},data,{frames:frames.map((f,i)=>Object.assign({},f,{polygons:i===1?[{color:'9ab7f5',rings:[]}]:[]}))});
test('suspend stops playback timers and resume retains desired playback',()=>{const v=setup({autoplay:true});try{v.setData(wet);assert.ok(v.timer);v.setSuspended(true);assert.equal(v.timer,null);assert.equal(v.playing,true);v.setSuspended(false);assert.ok(v.timer);}finally{v.destroy();assert.equal(v.destroyed,true);}});
test('marker labels are text, not injected HTML',()=>{const v=setup({markers:[{latitude:47.38,longitude:8.54,label:'<img src=x onerror=alert(1)>'}]});try{assert.equal(v.root.querySelectorAll('img').length,1);assert.ok(v.root.textContent.includes('<img src=x onerror=alert(1)>'));}finally{v.destroy();}});
test('forecast stays static during radar playback and refreshes independently',()=>{const v=setup({showWeather:true});try{const time=Math.ceil(Date.now()/3600000)*3600;const weather={fetchedAt:Date.now(),current:{time:Date.now()/1000,temp:12,feels:11,wind:2,code:800,night:true,description:'clear sky'},hourly:Array.from({length:14},(_,i)=>({time:time+i*3600,temp:12,wind:2,pop:.2,rain:0,code:800})),daily:[{time:time+86400,date:'2099-01-01',high:20,low:8,pop:.2,rain:0,code:800,wind:2}]};v.setWeather(weather);v.setData(data);const panel=v.weather.panels.firstChild;v.index=1;v.draw();assert.equal(v.weather.panels.firstChild,panel);assert.equal(v.root.querySelectorAll('.rr-weather-hour').length,4);v.setWeatherError('Offline');assert.equal(v.weather.notice.textContent,'Offline');assert.match(v.weather.now.textContent,/12°/);}finally{v.destroy();}});
test('a dry window holds the latest observation instead of animating',()=>{const v=setup({autoplay:true});try{v.setData(Object.assign({},data,{frames:frames.map(f=>Object.assign({},f,{homeLevel:0})),latestObservation:now+300}));assert.equal(v.timer,null);assert.equal(v.index,1);assert.equal(v.root.dataset.playing,'false');v.setData(wet);assert.ok(v.timer);assert.equal(v.root.dataset.playing,'true');}finally{v.destroy();}});
const {scene}=require('../demo/home-fixture');
test('home arrival summary stays fixed while the forecast map shows overhead rain',()=>{
  const v=setup();try{
    const d=scene(v.config,'arrival',Date.now());v.setData(d);
    const headline=v.homeHeadline.textContent,detail=v.homeDetail.textContent;
    assert.match(headline,/Rain expected in ~\d+ min/);assert.match(detail,/Dry on latest radar · Forecast/);
    v.index=d.frames.findIndex(f=>f.homeLevel>0);v.draw();
    assert.equal(v.homeHeadline.textContent,headline);assert.equal(v.homeDetail.textContent,detail);
    assert.match(v.homeFrameTitle.textContent,/rain over home/i);
    assert.equal(v.homeMarker.dataset.state,'rain');assert.equal(v.homeMarker.dataset.kind,'forecast');
    assert.match(v.slider.getAttribute('aria-valuetext'),/At home: Light rain/);
  }finally{v.destroy();}
});
test('heavy rain at home gets a measured intensity and a forecast clearing time',()=>{
  const v=setup();try{v.setData(scene(v.config,'heavy',Date.now()));
    assert.equal(v.homeHeadline.textContent,'Heavy rain at home');
    assert.match(v.homeDetail.textContent,/20–40 mm\/h · Dry again ~.+ · Forecast/);
    assert.equal(v.homeSummary.dataset.state,'heavy');assert.equal(v.homeMarker.dataset.state,'heavy');
    assert.ok(v.root.querySelector('.rr-home-window'));assert.ok(v.root.querySelector('.rr-bar.rr-heavy'));
  }finally{v.destroy();}
});
test('missing latest home sample is unavailable while known forecast rain remains visible',()=>{
  const v=setup({autoplay:true});try{v.setData(scene(v.config,'missing',Date.now()));
    assert.equal(v.homeHeadline.textContent,'Home radar unavailable');assert.match(v.homeDetail.textContent,/Rain in forecast/);
    assert.match(v.homeDetail.textContent,/Gaps before rain/);assert.equal(v.dry,false);
    assert.match(v.homeFrameTitle.textContent,/unavailable/);
  }finally{v.destroy();}
});
test('stale observation is never presented as current rain',()=>{
  const v=setup();try{const d=scene(v.config,'stale',Date.now());d.demo=false;v.setData(d);
    assert.match(v.homeHeadline.textContent,/^Last radar: rain at home/);
    assert.match(v.homeSource.textContent,/OLD RADAR/);assert.match(v.homeDetail.textContent,/Updated \d+ min ago/);
  }finally{v.destroy();}
});
test('recorded rainfall is labelled as a recording rather than current home conditions',()=>{
  const v=setup();try{v.setData(Object.assign({},scene(v.config,'heavy',Date.now()),{demo:false,replay:true,label:'16 Sep 2026'}));
    assert.match(v.homeHeadline.textContent,/in this recording/);assert.match(v.homeSource.textContent,/RECORDING/);
    assert.match(v.homeFrameTime.textContent,/Recorded/);
  }finally{v.destroy();}
});
test('an entirely dry scene is still and retains the summary and manual scrubber',()=>{
  const v=setup({autoplay:true});try{v.setData(scene(v.config,'dry',Date.now()));
    assert.equal(v.homeHeadline.textContent,'Dry at home');assert.match(v.homeDetail.textContent,/No rain in forecast through/);
    assert.equal(v.timer,null);assert.equal(v.play.disabled,true);assert.equal(v.slider.disabled,false);
    v.slider.onkeydown({key:'End',preventDefault(){},stopPropagation(){}});
    assert.equal(v.playing,false);assert.equal(v.index,v.data.frames.length-1);
  }finally{v.destroy();}
});
test('home summary and map marker can be hidden independently',()=>{
  const v=setup({showHomeSummary:false,showLocation:false});try{v.setData(scene(v.config,'rain',Date.now()));
    assert.equal(v.homeSummary.hidden,true);assert.equal(v.homeMarker,undefined);assert.match(v.homeFrameTitle.textContent,/Rain over home/);
  }finally{v.destroy();}
});
test('missing forecasts remain incomplete when only one usable observation exists',()=>{
  const v=setup({autoplay:true});try{v.setData({latestObservation:now,frames:[{time:now,kind:'measurement',available:true,homeLevel:0,polygons:[]},{time:now+300,kind:'forecast',available:false,homeLevel:null,polygons:[]}]});
    assert.equal(v.dry,false);assert.equal(v.timer,null);assert.match(v.homeDetail.textContent,/incomplete/);
  }finally{v.destroy();}
});
test('refresh updates current home conditions while retaining a paused historical frame',()=>{
  const v=setup();try{
    const arrival=scene(v.config,'arrival',Date.now());v.setData(arrival);
    v.slider.value=arrival.frames[2].time;v.slider.oninput();const selected=v.data.frames[v.index].time;
    v.setData(scene(v.config,'heavy',Date.now()));
    assert.equal(v.playing,false);assert.equal(v.data.frames[v.index].time,selected);
    assert.equal(v.homeHeadline.textContent,'Heavy rain at home');assert.equal(v.homeFrameTitle.textContent,'Dry at home');
  }finally{v.destroy();}
});
test('a recording with missing home data cannot claim dry conditions',()=>{
  const v=setup();try{v.setData({latestObservation:now,replay:true,label:'Archived',frames:[{time:now,kind:'measurement',available:false,homeLevel:null,polygons:[]}]});
    assert.match(v.homeHeadline.textContent,/incomplete/);assert.equal(v.homeSummary.dataset.state,'unknown');
  }finally{v.destroy();}
});
test('a missing newest frame uses the recent valid observation rather than announcing home radar unavailable',()=>{
  const v=setup({showHomeSummary:true});try{v.setData({latestObservation:now,frames:[
    {time:now-300,kind:'measurement',available:true,homeLevel:0,polygons:[]},
    {time:now,kind:'measurement',available:false,homeLevel:null,polygons:[]},
    {time:now+300,kind:'forecast',available:true,homeLevel:0,polygons:[]}
  ]});
    assert.notEqual(v.homeHeadline.textContent,'Home radar unavailable');
    assert.equal(v.index,0);assert.equal(v.kind.textContent,'Observed');
    assert.equal(v.homeSource.textContent,'LATEST RADAR · '+v.timeLabel(now-300));
    assert.ok(!v.notice.textContent.includes('Frame unavailable'));
  }finally{v.destroy();}
});
test('default view stays minimal in dry, rainy, heavy and unavailable home scenes',()=>{
  const v=setup();try{for(const name of ['dry','rain','heavy','missing']){
    v.setData(scene(v.config,name,Date.now()));
    assert.equal(v.homeSummary.hidden,true);assert.equal(v.homeFrame.hidden,true);assert.equal(v.focus.hidden,true);
    assert.equal(v.focus.textContent,'');
  }}finally{v.destroy();}
});
test('automatic playback skips unavailable frames while manual scrubbing can still select them',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const v=setup({autoplay:true});try{
    v.setData({latestObservation:now,frames:[
      {time:now,kind:'measurement',available:true,homeLevel:0,polygons:[]},
      {time:now+300,kind:'forecast',available:false,homeLevel:null,polygons:[]},
      {time:now+600,kind:'forecast',available:true,homeLevel:3,polygons:[]}
    ]});
    t.mock.timers.tick(1000);assert.equal(v.index,2);assert.ok(!v.notice.textContent.includes('Frame unavailable'));
    v.slider.value=now+300;v.slider.oninput();assert.equal(v.index,1);assert.match(v.notice.textContent,/Frame unavailable/);
  }finally{v.destroy();}
});
test('a single usable observation is held without pretending there is an animation',()=>{
  const v=setup({autoplay:true});try{
    v.setData({latestObservation:now,frames:[
      {time:now,kind:'measurement',available:true,homeLevel:3,polygons:[]},
      {time:now+300,kind:'forecast',available:false,homeLevel:null,polygons:[]}
    ]});assert.equal(v.timer,null);assert.equal(v.root.dataset.playing,'false');assert.equal(v.play.disabled,true);
  }finally{v.destroy();}
});
test('motion search recovers how far a rain cell moved',()=>{
  const {shift}=require('../public/view');const w=60,h=30,blob=(cx,cy)=>{const m=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)m[y*w+x]=(x-cx)**2+((y-cy)*1.5)**2<36?1:0;return m;};
  assert.deepEqual(shift(blob(20,12),blob(27,15),w,h,[0,0],10,6),[7,3]);
  assert.equal(shift(new Uint8Array(w*h),new Uint8Array(w*h),w,h,[0,0],10,6),null);
});
function glideSetup(t,options){
  const v=setup(Object.assign({autoplay:true},options)),calls=[];
  const ctx={scale(){},clearRect(){},fill(){},drawImage(){calls.push('draw');},getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)})};
  window.HTMLCanvasElement.prototype.getContext=()=>ctx;v.ctx=ctx;
  let clock=0;global.requestAnimationFrame=fn=>setTimeout(()=>{clock+=16;fn(clock);},16);global.cancelAnimationFrame=id=>clearTimeout(id);
  return {v,calls};
}
test('interpolation glides into the next planned frame, then shows it',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {v,calls}=glideSetup(t,{});try{
    v.setData(wet);const from=v.index,next=v.plan[(v.plan.findIndex(s=>s.index===from)+1)%v.plan.length].index;
    const advance=ms=>{for(let i=0;i<ms;i+=8)t.mock.timers.tick(8);};
    advance(v.plan.find(s=>s.index===from).ms-v.glideMs+40);
    assert.ok(calls.length>0);assert.equal(v.index,from);
    advance(v.glideMs+40);assert.equal(v.index,next);
    v.setSuspended(true);assert.equal(v.glide,null);assert.equal(v.timer,null);
  }finally{v.destroy();delete global.requestAnimationFrame;delete global.cancelAnimationFrame;}
});
test('interpolation can be turned off and never runs without animation frames',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {v,calls}=glideSetup(t,{interpolate:false});try{v.setData(wet);t.mock.timers.tick(3000);assert.equal(calls.length,0);}finally{v.destroy();delete global.requestAnimationFrame;delete global.cancelAnimationFrame;}
});
