// Converts the captured 1 km radar grid to interpolated contour polygons.
// Rendering is smoothed; the original grid remains the authority for chart values.
import { contours } from 'd3-contour';
import { readFile, writeFile } from 'node:fs/promises';
import core from '../public/core.js';
const input = process.argv[2] || new URL('../demo/rain-source.json', import.meta.url);
const data = JSON.parse(await readFile(input, 'utf8'));
const frames = data.frames.map(frame => {
  const g = frame.grid;
  const values = g.values.flat().map(v => v === null ? NaN : v);
  const shapes = contours().size([g.width, g.height]).thresholds(core.scale.map(c => c.lower)).smooth(true)(values);
  const polygons = [];
  shapes.forEach((shape, index) => shape.coordinates.forEach(rings => {
    polygons.push({ color: core.scale[index].color, rings: rings.map(ring => ring.map(([x,y]) => [
      Math.round(g.e0 + x*g.cell), Math.round(g.n1-y*g.cell)
    ])) });
  }));
  return { time: frame.t, kind: 'measurement', available: true, polygons, grid: g, source: frame.source };
});
await writeFile(new URL('../demo/rain-replay.json', import.meta.url), JSON.stringify({replay:true,label:'16 Sep 2026',latestObservation:frames.at(-1).time,frames}));
console.log(`Converted ${frames.length} frames to smooth contours; original grids retained for point sampling.`);
