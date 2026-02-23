import { escXml, kmFromMeters } from "../formatters";
import { haversineMeters, bearingDegrees } from "../math";
import { prettyLabelFromTypeIcon } from "../labels";

export function toOpenRallyGpx({ meta, startGPS, waypoints }) {
  // Build an ordered list of points (START then waypoints)
  const pts = [];

  if (startGPS?.lat != null && startGPS?.lon != null) {
    pts.push({
      lat: Number(startGPS.lat),
      lon: Number(startGPS.lon),
      timestamp: startGPS.timestamp,
      poi: "START",
      type: "control",
      iconId: "start",
    });
  }

  for (const wp of waypoints || []) {
    const lat = Number(wp?.lat);
    const lon = Number(wp?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    pts.push({ ...wp, lat, lon });
  }

  // Compute cumulative distance + cap per point
  let cumMeters = 0;

  const wpts = pts
    .map((p, i) => {
      const prev = i > 0 ? pts[i - 1] : null;
      const next = i < pts.length - 1 ? pts[i + 1] : null;

      if (prev) cumMeters += haversineMeters(prev, p);

      // CAP: prefer heading from this point to next; fallback to prev->this
      const cap = next
        ? bearingDegrees(p, next)
        : prev
          ? bearingDegrees(prev, p)
          : 0;

      const name = p.poi?.trim() ? p.poi.trim() : `WP ${i + 1}`;
      const desc =
        (p.poi && p.poi.trim()) || prettyLabelFromTypeIcon(p) || name;

      return `
  <wpt lat="${p.lat}" lon="${p.lon}">
    <name>${escXml(name)}</name>
    <desc>${escXml(desc)}</desc>
    ${p.timestamp ? `<time>${escXml(p.timestamp)}</time>` : ""}
    <extensions>
      <openrally:distance>${escXml(kmFromMeters(cumMeters))}</openrally:distance>
      <openrally:cap>${escXml(String(cap))}</openrally:cap>
      <openrally:show_coordinates/>
    </extensions>
  </wpt>`;
    })
    .join("");

  // Optional track line (RN often imports both fine)
  const trkpts = pts
    .map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"></trkpt>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<gpx
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:openrally="http://www.openrally.org/xmlschemas/GpxExtensions/v1.0.3"
  creator="Route Mapper"
  version="1.1"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd
                      http://www.openrally.org/xmlschemas/GpxExtensions/v1.0.3 openrally.xsd">

  <metadata>
    <name>${escXml(meta.tripName || "Survey Trip")}</name>
    <desc>${escXml(`Day ${meta.dayNumber} – ${meta.routeName} – Stage ${meta.stageNumber}`)}</desc>
    <time>${escXml(meta.endedAt || new Date().toISOString())}</time>
  </metadata>

  ${wpts}

  <trk>
    <name>${escXml(`Stage ${meta.stageNumber}`)}</name>
    <trkseg>
      ${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}
