# Data sources and third-party notices

The MIT license covers this module's code. Weather data and map data remain
subject to their source terms; they are not relicensed under MIT.

- **Source: MeteoSwiss** — precipitation observations and forecasts.
  The live adapter reads the website animation manifest and contour JSON used by
  https://www.meteoswiss.admin.ch/services-and-publications/applications/precipitation.html .
  This is an undocumented website interface, not a supported public API contract.
  MeteoSwiss documents its official open radar products at
  https://opendatadocs.meteoswiss.ch/d-radar-data/d1-precipitation-radar-products .
- **Source: swisstopo** — base-map hydrography through https://wms.geo.admin.ch/ .
  Coordinate conversion uses swisstopo's published approximate CH1903/WGS84
  transformation: https://www.swisstopo.admin.ch/en/transformation-calculation-services .
- The optional demo fixture contains 49 **actual observations**, 16 September 2026,
  15:00–19:00 UTC, at five-minute intervals, from the MeteoSwiss PRECIP/RZC open dataset.
  Each source HDF5 URL is retained in the fixture. Official STAC item:
  https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-precip/items/20260916-ch .
  It is clearly labelled as a historical replay, never used as fallback for a live outage,
  and excluded from the installation archive.
- Demo contours are generated with **d3-contour**, ISC-licensed, copyright Mike Bostock.
  It is a development dependency only; no d3 code is bundled in the runtime module.
  https://github.com/d3/d3-contour

The fixture uses the RATE dataset (gain 1, offset 0, mm/h), 710 × 640 cells of
1 km, top-left LV95 corner 2255000 / 1480000. The crop is rows 219:243 and columns
403:451, E 658000–706000 / N 237000–261000 in LV03. Null cells remain unavailable.
The demo uses linearly interpolated contour edges for appearance, but samples
chart values from the original 1 km cells. Interpolation does not add measurement
resolution. No private address or address-specific precipitation summary is bundled.

## Optional weather forecast

Source: MeteoSwiss. Local temperature, wind, precipitation and daily summaries are read
from the compact versioned feed used by the MeteoSwiss website. This JSON interface is
undocumented. Three-hour precipitation probabilities and postal-point metadata use the
[official open-data local forecasting collection](https://opendatadocs.meteoswiss.ch/e-forecast-data/e4-local-forecast-data)
(`ch.meteoschweiz.ogd-local-forecasting`, parameter `rp0003i0`). The CSV's timestamp marks
the end of its preceding three-hour interval. Daily totals use Swiss local calendar days.

Condition numbers are mapped to original SVG line drawings in this project. MeteoSwiss's
proprietary icon graphics are not distributed. Code MIT licensing does not replace the
provider's data terms. Attribution remains visible in the widget.
