/* global Module, RainRadarCore, RainRadarView */
Module.register("MMM-RainRadar", {
  requiresVersion: "2.18.0",
  defaults: {}, // Shared defaults and validation live in public/core.js.
  getScripts: function () { return [this.file("public/core.js"), this.file("public/home.js"), this.file("public/weather-view.js"), this.file("public/view.js")]; },
  getStyles: function () { return [this.file("MMM-RainRadar.css")]; },
  start: function () {
    this.weatherData = null; this.weatherError = ""; this.radarData = null; this.radarError = ""; this.radarView = null; this.requestTimer = null; this.radarSuspended = false;
    try {
      this.radarConfig = RainRadarCore.normalize(this.config);
      if (this.data.header === undefined) this.data.header = this.radarConfig.title;
      if (!this.radarConfig.showHeader) this.data.header = "";
      this.requestRadar();
    } catch (error) { this.radarError = "RAIN RADAR: " + error.message; }
  },
  getHeader: function () {
    return String(this.data.header || "").replace(/[&<>"']/g, function (c) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
    });
  },
  getDom: function () {
    if (!this.radarConfig) { var error = document.createElement("div"); error.className = "small dimmed"; error.textContent = this.radarError; return error; }
    if (!this.radarView) {
      var root = document.createElement("div");
      this.radarView = new RainRadarView.View(root, this.radarConfig);
      if (this.radarData) this.radarView.setData(this.radarData);
      if (this.weatherData) this.radarView.setWeather(this.weatherData);
      if (this.weatherError) this.radarView.setWeatherError(this.weatherError);
      if (this.radarError) this.radarView.setError(this.radarError);
      if (this.hidden || this.radarSuspended) this.radarView.setSuspended(true);
    }
    return this.radarView.root;
  },
  requestRadar: function () {
    if (this.radarSuspended) return;
    clearTimeout(this.requestTimer);
    this.sendSocketNotification("RAIN_RADAR_REQUEST", { id: this.identifier, config: this.radarConfig });
    // Keep requesting after a helper restart or socket reconnect, even without a response.
    var self = this;
    this.requestTimer = setTimeout(function () { self.requestRadar(); }, this.radarConfig.updateInterval);
  },
  socketNotificationReceived: function (notification, payload) {
    if (!payload || payload.id !== this.identifier || !this.radarConfig) return;
    if (notification === "RAIN_RADAR_WEATHER") {
      this.weatherData = payload.data; this.weatherError = "";
      if (this.radarView) this.radarView.setWeather(payload.data);
    } else if (notification === "RAIN_RADAR_WEATHER_ERROR") {
      this.weatherError = payload.message;
      if (this.radarView) this.radarView.setWeatherError(payload.message);
    } else if (notification === "RAIN_RADAR_DATA") {
      this.radarData = payload.data; this.radarError = "";
      if (this.radarView) this.radarView.setData(payload.data);
    } else if (notification === "RAIN_RADAR_ERROR") {
      this.radarError = payload.message;
      if (this.radarView) this.radarView.setError(payload.message);
      clearTimeout(this.requestTimer);
      var self = this;
      if (!this.radarSuspended) this.requestTimer = setTimeout(function () { self.requestRadar(); }, 60000);
    }
  },
  suspend: function () { this.radarSuspended = true; clearTimeout(this.requestTimer); if (this.radarView) this.radarView.setSuspended(true); },
  resume: function () { this.radarSuspended = false; if (this.radarView) this.radarView.setSuspended(false); if (this.radarConfig) this.requestRadar(); }
});
