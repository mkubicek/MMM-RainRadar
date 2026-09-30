/* Shared, dependency-free configuration and geometry. ES2018 / Node 10 compatible. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RainRadarCore = factory();
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var SCALE = [
    { color: "9e849a", lower: 0.2, upper: 1 }, { color: "2a00fa", lower: 1, upper: 2 },
    { color: "2a933b", lower: 2, upper: 4 }, { color: "49ff36", lower: 4, upper: 6 },
    { color: "fcff2d", lower: 6, upper: 10 }, { color: "faca1e", lower: 10, upper: 20 },
    { color: "f87c00", lower: 20, upper: 40 }, { color: "f70c00", lower: 40, upper: 60 },
    { color: "ac00db", lower: 60, upper: null }
  ];
  var DEFAULTS = {
    location: { latitude: 47.3769, longitude: 8.5417, label: "Location" },
    mapCenter: null, mapSpanKm: 48, width: 460, height: 230, pixelRatio: 1,
    markers: [], showLocation: true, showLocationLabel: false, showMarkerLabels: true,
    showHeader: true, title: "RAIN RADAR", showControls: true, showLegend: false, showWeather: false,
    mapStyle: "rivers", mapOpacity: 0.65, rainOpacity: 0.9,
    pastMinutes: 60, forecastHours: 10, frameStepMinutes: 5,
    updateInterval: 300000, staleAfterMinutes: 20,
    autoplay: true, respectReducedMotion: true, adaptivePlayback: true, showHomeSummary: false,
    frameInterval: 480, playbackSpeed: 4,
    pauseAtLatest: 0, timeZone: "Europe/Zurich", locale: "en-GB"
  };
  function number(value, name, min, max) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(name + " must be a number between " + min + " and " + max);
    }
    return value;
  }
  function text(value, name, max) {
    if (typeof value !== "string" || value.length > max) throw new Error(name + " must be text (max " + max + " characters)");
    return value;
  }
  function location(value, name) {
    if (!value || typeof value !== "object") throw new Error(name + " must contain latitude and longitude");
    return {
      latitude: number(value.latitude, name + ".latitude", 45, 49),
      longitude: number(value.longitude, name + ".longitude", 4, 12),
      label: text(value.label === undefined ? "" : value.label, name + ".label", 80),
      showLabel: value.showLabel !== false
    };
  }
  // swisstopo's approximate WGS84 -> CH1903/LV03 transformation (metres).
  function project(latitude, longitude) {
    var p = (latitude * 3600 - 169028.66) / 10000;
    var l = (longitude * 3600 - 26782.5) / 10000;
    return [600072.37 + 211455.93*l - 10938.51*l*p - 0.36*l*p*p - 44.54*l*l*l,
      200147.07 + 308807.95*p + 3745.25*l*l + 76.63*p*p - 194.56*l*l*p + 119.79*p*p*p];
  }
  function normalize(input) {
    input = input || {};
    var c = {};
    Object.keys(DEFAULTS).forEach(function (key) { c[key] = input[key] === undefined ? DEFAULTS[key] : input[key]; });
    c.location = location(c.location, "location");
    c.mapCenter = c.mapCenter === null ? c.location : location(c.mapCenter, "mapCenter");
    ["showLocation", "showLocationLabel", "showMarkerLabels", "showHeader", "showControls", "showLegend", "showWeather", "showHomeSummary", "adaptivePlayback", "autoplay", "respectReducedMotion"].forEach(function (key) {
      if (typeof c[key] !== "boolean") throw new Error(key + " must be true or false");
    });
    [["width",200,1600],["height",100,1000],["pixelRatio",1,2],["mapSpanKm",10,700],["pastMinutes",0,180],
      ["forecastHours",0,24],["frameStepMinutes",5,60],["updateInterval",60000,3600000],
      ["staleAfterMinutes",5,180],["frameInterval",100,3000],["playbackSpeed",1,8],
      ["pauseAtLatest",0,10000],["mapOpacity",0,1],["rainOpacity",0,1]].forEach(function (spec) {
      number(c[spec[0]], spec[0], spec[1], spec[2]);
    });
    if (c.pastMinutes === 0 && c.forecastHours === 0) throw new Error("Choose a non-zero pastMinutes or forecastHours");
    if (["rivers", "lakes", "none"].indexOf(c.mapStyle) < 0) throw new Error("mapStyle must be rivers, lakes or none");
    text(c.title, "title", 100); text(c.locale, "locale", 40); text(c.timeZone, "timeZone", 80);
    try { new Intl.DateTimeFormat(c.locale, { timeZone: c.timeZone }).format(new Date()); }
    catch (error) { throw new Error("Invalid locale or timeZone"); }
    if (!Array.isArray(c.markers) || c.markers.length > 20) throw new Error("markers must be an array of up to 20 locations");
    c.markers = c.markers.map(function (m) { return location(m, "marker"); });
    var center = project(c.mapCenter.latitude, c.mapCenter.longitude);
    var halfWidth = c.mapSpanKm * 500, halfHeight = halfWidth * c.height / c.width;
    c.bounds = { west: center[0]-halfWidth, east: center[0]+halfWidth, south: center[1]-halfHeight, north: center[1]+halfHeight };
    c.point = project(c.location.latitude, c.location.longitude);
    if (!contains(c.bounds, c.point)) throw new Error("location must be inside the map; adjust mapCenter or mapSpanKm");
    return c;
  }
  function contains(b, p) { return p[0] >= b.west && p[0] <= b.east && p[1] >= b.south && p[1] <= b.north; }
  function pixel(point, bounds, width, height) {
    return [(point[0]-bounds.west)/(bounds.east-bounds.west)*width, (bounds.north-point[1])/(bounds.north-bounds.south)*height];
  }
  function levelForColor(color) {
    var match = SCALE.findIndex(function (c) { return c.color === color.toLowerCase(); });
    return match < 0 ? null : match + 1;
  }
  function levelForRate(rate) {
    if (rate === null || !Number.isFinite(rate)) return null;
    var level = 0;
    SCALE.forEach(function (c, i) { if (rate >= c.lower) level = i + 1; });
    return level;
  }
  function insideRing(point, points) {
    var hit = false;
    for (var i=0,j=points.length-1;i<points.length;j=i++) {
      var a=points[i], b=points[j];
      if ((a[1]>point[1]) !== (b[1]>point[1]) && point[0] < (b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) hit=!hit;
    }
    return hit;
  }
  function insidePolygon(point, rings) {
    return rings.reduce(function (hit, ring) { return insideRing(point,ring) ? !hit : hit; }, false);
  }
  function nearestIndex(frames, timestamp) {
    return frames.reduce(function (best, f, i) {
      return Math.abs(f.time-timestamp) < Math.abs(frames[best].time-timestamp) ? i : best;
    }, 0);
  }
  return { defaults: DEFAULTS, scale: SCALE, normalize: normalize, project: project, contains: contains,
    pixel: pixel, levelForColor: levelForColor, levelForRate: levelForRate,
    insideRing: insideRing, insidePolygon: insidePolygon, nearestIndex: nearestIndex };
}));
