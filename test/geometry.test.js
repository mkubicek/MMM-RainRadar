const test=require('node:test');const assert=require('node:assert/strict');const {decode}=require('../lib/geometry');
const coords={x_min:0,x_max:10,x_count:11,y_min:0,y_max:10,y_count:11};
function ring(i,j,width,level){return{i,j,l:level||0,o:'0000',d:String.fromCharCode(77+width,77,77,77+width,77-width,77)};}
const cfg={point:[2000,2000],bounds:{west:1500,east:2500,south:1500,north:2500}};
test('keeps enclosing polygons even when no vertex is in the cutout',()=>{const d=decode({coords,areas:[{color:'2a00fa',shapes:[[ring(0,1,8)]]}]},cfg);assert.equal(d.homeLevel,2);assert.equal(d.polygons.length,1);});
test('multi-ring polygon holes remain dry and render as holes',()=>{const d=decode({coords,areas:[{color:'2a00fa',shapes:[[ring(0,1,8),ring(2,3,4)]]}]},cfg);assert.equal(d.homeLevel,0);assert.equal(d.polygons[0].rings.length,2);});
test('nested higher-intensity polygons win in paint order',()=>{const d=decode({coords,areas:[{color:'9e849a',shapes:[[ring(0,1,8)]]},{color:'2a933b',shapes:[[ring(2,3,4,1)]]}]},cfg);assert.equal(d.homeLevel,3);});
test('outside source coverage is unavailable, not dry',()=>{const d=decode({coords,areas:[]},{point:[12000,0],bounds:cfg.bounds});assert.equal(d.homeLevel,null);});
test('malformed frame must not masquerade as a dry frame',()=>{assert.throws(()=>decode({},cfg));assert.throws(()=>decode({coords,areas:[{color:'bad',shapes:[]}]},cfg));assert.equal(decode({coords,areas:[]},cfg).homeLevel,0);});
