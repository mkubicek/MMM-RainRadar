"use strict";
const core = require("../public/core");
function decodeRing(shape, coords) {
  if (!shape || !Number.isInteger(shape.i) || !Number.isInteger(shape.j) ||
      typeof shape.o !== "string" || typeof shape.d !== "string" || shape.d.length < (shape.o.length-1)*2 || !/^\d*$/.test(shape.o)) {
    throw new Error("Invalid radar contour");
  }
  let i=shape.i, j=shape.j;
  const points=[];
  for (let k=0;k<shape.o.length;k++) {
    const offset=Number(shape.o[k])/10+0.05;
    const gx=i%2===0?i/2:(i-1)/2+offset;
    const gy=i%2===0?(j-1)/2+offset:j/2;
    points.push([1000*(coords.x_min+(coords.x_max-coords.x_min)*gx/(coords.x_count-1)),
      1000*(coords.y_min+(coords.y_max-coords.y_min)*gy/(coords.y_count-1))]);
    if (2*k<shape.d.length) { i+=shape.d.charCodeAt(2*k)-77; j+=shape.d.charCodeAt(2*k+1)-77; }
  }
  return points;
}
function intersects(rings, bounds) {
  let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
  rings.forEach(r=>r.forEach(p=>{west=Math.min(west,p[0]);east=Math.max(east,p[0]);south=Math.min(south,p[1]);north=Math.max(north,p[1]);}));
  return east>=bounds.west && west<=bounds.east && north>=bounds.south && south<=bounds.north;
}
function decode(data, config) {
  const c=data && data.coords;
  if (!data || !Array.isArray(data.areas)) throw new Error("Invalid radar frame");
  if (!c || ![c.x_min,c.x_max,c.x_count,c.y_min,c.y_max,c.y_count].every(Number.isFinite) || c.x_count<2 || c.y_count<2) throw new Error("Invalid radar grid");
  const inCoverage=core.contains({west:c.x_min*1000,east:c.x_max*1000,south:c.y_min*1000,north:c.y_max*1000},config.point);
  const entries=[];
  // The provider has two contour encodings: polygon rings (with holes), and legacy nested paint layers.
  const multi=data.areas.length && data.areas[0].shapes.some(s=>s.length>1);
  const levels=new Set();
  data.areas.forEach(a=>{
    if (!/^[\da-f]{6}$/i.test(a.color) || !Array.isArray(a.shapes)) throw new Error("Invalid radar area");
    a.shapes.forEach(s=>{
      if (!Array.isArray(s) || !s.length) throw new Error("Invalid radar shape");
      s.forEach(r=>{if (!Number.isInteger(r.l)) throw new Error("Invalid contour level"); levels.add(r.l);});
    });
  });
  Array.from(levels).sort((a,b)=>a-b).forEach(level=>{
    let previous="ffffff";
    data.areas.forEach(area=>{
      area.shapes.forEach(shape=>{
        if (multi) {
          if (shape[0].l===level) entries.push({color:area.color.toLowerCase(),rings:shape.map(r=>decodeRing(r,c))});
        } else {
          shape.forEach((r,index)=>{if(r.l===level)entries.push({color:index===0?area.color.toLowerCase():previous,rings:[decodeRing(r,c)]});});
        }
      });
      previous=area.color.toLowerCase();
    });
  });
  let homeLevel=inCoverage?0:null;
  entries.forEach(p=>{if(inCoverage && core.insidePolygon(config.point,p.rings))homeLevel=p.color==="ffffff"?0:core.levelForColor(p.color);});
  return { homeLevel: homeLevel, polygons: entries.filter(p=>intersects(p.rings,config.bounds)).map(p=>({
    color:p.color, rings:p.rings.map(r=>r.map(point=>point.map(Math.round)))
  })) };
}
module.exports={decode,decodeRing,intersects};
