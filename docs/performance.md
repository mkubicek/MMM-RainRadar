# Raspberry Pi measurements

Measured 25 September 2026 on a **Raspberry Pi 4 Model B, 2 GB RAM**, ARMv7,
Raspbian Buster, Node 10.24.0, MagicMirror² 2.18, Electron 16.0.5. The user's
existing mirror remained running. Benchmarks were isolated in a temporary directory;
no installation, mirror restart or display takeover was performed.

## Helper: 110 live frames, one hour observed + ten hours forecast

| Metric | Cold load | Cached refresh |
| --- | ---: | ---: |
| Wall time | 3,735 ms | 8 ms |
| Process CPU time | 2,072 ms | 7.3 ms |
| Frontend payload | 9,344 bytes | 9,344 bytes |
| JS heap | 7.2 MiB | 7.5 MiB |
| Entire standalone Node process RSS | 41.5 MiB | 41.5 MiB |

This was a mostly dry scene. It is not a worst-case storm/network benchmark.
The normal polling interval is five minutes; cold-load work is not repeated at
animation speed. The raw frame cache used 224 KB and prepared geometry 3.2 KB
for this scene. Entry and serialized-size limits bound both caches; these are
not claims about exact JavaScript heap limits.

## Rainy renderer: 49 historical frames

The actual module adapter and production view were loaded in a separate invisible
Electron window on the Pi. The base map loaded successfully. Both passes drew
all 49 frames; the second reused cached paths. Device/render density was 1×.

| Frame preparation/draw calls | First pass | Cached pass |
| --- | ---: | ---: |
| Mean | 3.84 ms | 2.45 ms |
| 95th percentile | 7.7 ms | 6.3 ms |
| Maximum | 14.2 ms | 11.4 ms |

These measurements used fixed playback at **120 ms per frame** (480 ms / 4×).
The current adaptive playback shows about 50 frames per loop at roughly 75–80 ms
each, with short holds at key moments. This timing change does not constitute a new
Pi performance measurement.
Measurements time JavaScript/path preparation and Canvas drawing calls with a
requestAnimationFrame boundary between frames; they do not independently measure
GPU completion. The entire test renderer process working set was about 80 MiB,
including Chromium overhead, **not incremental module memory**.

The captured screenshot is [raspberry-pi-preview.png](raspberry-pi-preview.png).
This verifies the module adapter, native canvas paths, UI, map, and actual rainy
contours on the installed Electron version. It does not establish a performance
guarantee for all map sizes, storm complexity or numbers of module instances.

## MeteoSwiss weather panels (0.3.0)

Measured on the same Pi with live local-forecast data: cold load 1.11 s, 816 ms
process CPU, 7.2 MiB Node heap, and 4.5 KB sent to the frontend. Cached refresh:
1 ms. These are a standalone provider process's measurements, not incremental
MagicMirror memory. The probability CSV lookup transferred 77,825 bytes using
byte ranges; this excludes the compact JSON responses, catalogue and manifest.
The actual weather CSV is tens of megabytes and is never downloaded in full.
Forecast panels are static during radar playback.
