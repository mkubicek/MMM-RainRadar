# Changelog

## Unreleased — Rain at home

- Adaptive playback fits the loop into `loopDuration` (default 4 s) of motion plus short
  pauses at the latest observation and at home arrival, peak and clearing (at most 8 s in total).
  Frames are sampled densest near now and during home rain, so long rain no longer stretches
  the loop (previously up to ~100 s for a rainy 12-hour outlook).
- Motion-blended interpolation (`interpolate`, default on): about 25 frames per loop with
  glides between them; the rain motion between frames is estimated from the rendered radar
  and used for gaps up to 30 minutes, with a plain crossfade beyond. Glides run at `glideFps`
  (default 20) from a plain timer; on a Raspberry Pi 4 this costs no more CPU than hard cuts.
- Timeline labels for upcoming rain arrival, heavy or strong peak and clearing at home, and a
  home status line next to the current weather (`showHomeStatus`, default on), e.g.
  “Light rain in 85 min · from 20:30 · dry ~21:05”.
- Fix: forecast frames use a separate MeteoSwiss colour palette, which was not recognised, so
  forecast rain at home was shown as unavailable. Both palettes now map to the same classes.
- Minimal map/timeline presentation with a simple home dot, blue/amber precipitation bars
  and shaded home rain windows. Summary, arrival/clearing estimates and captions are opt-in.
- Constant playback pacing remains configurable.
- Dry-day playback requires complete home coverage; unavailable frames cannot appear dry.
- Demo-only scenarios and browser-verified narrow-layout screenshots.
- Compact weather spacing keeps the home radar and existing forecast panels in narrow columns.
- Use the newest usable observation when a manifest advertises a missing image; skip unavailable
  frames during autoplay. Missing/invalid individual images cannot cancel later downloads.

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
