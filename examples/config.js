// Add this object to the modules array in MagicMirror/config/config.js.
// Public example: Zurich city centre, not a private address.
module.exports = {
  module: "MMM-RainRadar",
  position: "bottom_left",
  header: "RAIN RADAR",
  config: {
    location: { latitude: 47.3769, longitude: 8.5417, label: "Zurich" },
    mapCenter: { latitude: 47.39, longitude: 8.53 },
    mapSpanKm: 48,
    width: 460,
    height: 230,
    forecastHours: 10,
    markers: [
      { latitude: 47.3769, longitude: 8.5417, label: "Zurich" },
      { latitude: 47.45038, longitude: 8.5624, label: "Airport", showLabel: false }
    ]
  }
};
