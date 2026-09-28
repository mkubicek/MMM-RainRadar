# Changelog

## 0.4.0 — Quieter on dry days

- Hold the latest observation as a still frame when no frame in the window shows rain,
  instead of animating identical empty frames.
- Rewrite playback controls only when they change; own compositor layers for the base map
  and rain canvas.
- Demo: `?layout=column` renders the narrow layout with the live MeteoSwiss weather outlook;
  the demo uses the mirror's Roboto Condensed.
- New screenshots in `docs/`.

## 0.3.0 — MeteoSwiss throughout

- Replace OpenWeather panels with MeteoSwiss local forecasts; no API key required.
- Four three-hour outlooks with correctly aligned precipitation probabilities.
- Swiss daily highs/lows and rainfall totals; current-hour temperature/wind forecast.
- Compact point JSON and bounded CSV byte ranges avoid nationwide downloads.
- Retain muted weather-symbol colours and quiet radar playback.

## 0.2.0 — integrated outlook

- Optional current weather, six two-hour forecasts and next three calendar days.
- Server-only OpenWeather credentials, 15-minute cache and independent failure handling.
- Stationary forecast panels with muted weather-symbol colours; quiet playback dot and no speed label.

## 0.1.0 — initial implementation

- Configurable Swiss precipitation radar, 10-hour forecast and point-intensity bars.
- Native MagicMirror header, English UI and subtle labelled map markers.
- Interactive bar-chart playback, reduced-motion support and hidden-module pause.
- Bounded, deduplicated helper downloads and reusable decoded/canvas geometry.
- Multi-instance isolation, stale/partial/offline states and refresh-state preservation.
- Genuine rainy demo with interpolated contours and original-grid chart values.
- Verified backend and renderer performance on Raspberry Pi 4 / Node 10 / Electron 16.
