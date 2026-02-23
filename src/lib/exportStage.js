import JSZip from "jszip";
import { generateTulipPngBase64 } from "./tulipGenerator";

/* -------------------------------------------------- */
/* 🧠 Helpers                                        */
/* -------------------------------------------------- */

function escXml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toRad(d) {
  return (d * Math.PI) / 180;
}

export function bearingDeg(a, b) {
  if (!a || !b) return 0;

  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const dLon = toRad(Number(b.lon) - Number(a.lon));

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export function ensureTotalsMeters(ptsRaw = []) {
  let total = 0;

  return ptsRaw.map((p, i) => {
    if (i === 0) {
      return { ...p, segmentMeters: 0, totalMeters: 0 };
    }

    const prev = ptsRaw[i - 1];
    const d = haversineMeters(prev, p);
    total += d;

    return { ...p, segmentMeters: d, totalMeters: total };
  });
}

function haversineMeters(a, b) {
  if (!a || !b) return 0;

  const R = 6371000;
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const dLat = lat2 - lat1;
  const dLon = toRad(Number(b.lon) - Number(a.lon));

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);

  const aa = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(aa)));
}

export function prettyLabelFromTypeIcon(p) {
  if (!p?.type) return "";

  if (p.type === "nav") {
    const map = {
      left: "Turn Left",
      right: "Turn Right",
      keep_l: "Keep Left",
      keep_r: "Keep Right",
      straight: "Straight",
      caution: "Caution",
    };
    return map[p.iconId] || "Navigation";
  }

  if (p.type === "hazard") {
    const map = {
      danger_1: "Danger 1",
      danger_2: "Danger 2",
      danger_3: "Danger 3",
    };
    return map[p.iconId] || "Hazard";
  }

  if (p.type === "control") {
    const map = {
      start: "Start",
      finish: "Finish",
      checkpoint: "Checkpoint",
    };
    return map[p.iconId] || "Control";
  }

  return p.type;
}

/* -------------------------------------------------- */
/* 📍 GPX (OpenRally-compatible)                     */
/* -------------------------------------------------- */

export async function toGpx({ meta, startGPS, waypoints }) {
  const pts = ensureTotalsMeters(waypoints);

  const wptsArr = await Promise.all(
    pts.map(async (p, i) => {
      const name = p.poi?.trim() || `WP ${i + 1}`;

      const desc =
        (p.poi && p.poi.trim()) || prettyLabelFromTypeIcon(p) || name;

      const cap = i > 0 ? bearingDeg(pts[i - 1], p) : 0;

      const tulipBase64 = await generateTulipPngBase64({ cap });

      const km = (Number(p.totalMeters) / 1000).toFixed(2);

      return `
  <wpt lat="${p.lat}" lon="${p.lon}">
    <name>${escXml(name)}</name>
    <desc>${escXml(desc)}</desc>
    ${p.timestamp ? `<time>${escXml(p.timestamp)}</time>` : ""}
    <extensions>
      <openrally:distance>${escXml(km)}</openrally:distance>
      <openrally:cap>${escXml(String(Math.round(cap)))}</openrally:cap>
      <openrally:show_coordinates/>
      <openrally:tulip>
        <![CDATA[${tulipBase64}]]>
      </openrally:tulip>
    </extensions>
  </wpt>`;
    }),
  );

  const wpts = wptsArr.join("");

  const trkpts = pts
    .map(
      (p) => `
      <trkpt lat="${p.lat}" lon="${p.lon}">
        ${p.timestamp ? `<time>${escXml(p.timestamp)}</time>` : ""}
      </trkpt>`,
    )
    .join("");

  const totalMeters = pts.length ? Number(pts[pts.length - 1].totalMeters) : 0;

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<gpx
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:openrally="http://www.openrally.org/xmlschemas/GpxExtensions/v1.0.3"
  creator="Route Mapper"
  version="1.1"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd
                      http://www.openrally.org/xmlschemas/GpxExtensions/v1.0.3 openrally.xsd"
>
  <metadata>
    <name>${escXml(meta.tripName)}</name>
    <desc>Day ${meta.dayNumber} – ${escXml(meta.routeName)} – Stage ${meta.stageNumber}</desc>
    <time>${escXml(meta.endedAt)}</time>
    <extensions>
      <openrally:units>metric</openrally:units>
      <openrally:distance>${escXml(
        (totalMeters / 1000).toFixed(2),
      )}</openrally:distance>
    </extensions>
  </metadata>

  ${wpts}

  <trk>
    <name>Stage ${meta.stageNumber}</name>
    <trkseg>
      ${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

/* -------------------------------------------------- */
/* 📄 HTML Roadbook                                  */
/* -------------------------------------------------- */

export function buildStageHtml({ meta, waypoints }) {
  const pts = ensureTotalsMeters(waypoints);

  const rows = pts
    .map((p, i) => {
      const km = (p.totalMeters / 1000).toFixed(2);
      const cap = i > 0 ? Math.round(bearingDeg(pts[i - 1], p)) : 0;
      const desc =
        (p.poi && p.poi.trim()) || prettyLabelFromTypeIcon(p) || `WP ${i + 1}`;

      return `
        <tr>
          <td>${i + 1}</td>
          <td>${km}</td>
          <td>${cap}</td>
          <td>${desc}</td>
          <td>${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}</td>
        </tr>`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${meta.tripName} - Stage ${meta.stageNumber}</title>
<style>
body { font-family: Arial, sans-serif; padding: 20px; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ccc; padding: 6px; font-size: 14px; }
th { background: #f2f2f2; }
</style>
</head>
<body>
<h2>${meta.tripName}</h2>
<p>Day ${meta.dayNumber} – ${meta.routeName} – Stage ${meta.stageNumber}</p>
<table>
<thead>
<tr>
<th>#</th>
<th>Km</th>
<th>CAP</th>
<th>Description</th>
<th>Coordinates</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`;
}

/* -------------------------------------------------- */
/* 📦 ZIP Export                                     */
/* -------------------------------------------------- */

export async function makeStageZip({ meta, startGPS, waypoints, baseName }) {
  const zip = new JSZip();

  const gpxText = await toGpx({ meta, startGPS, waypoints });
  const jsonText = JSON.stringify({ meta, startGPS, waypoints }, null, 2);
  const htmlText = buildStageHtml({ meta, waypoints });

  zip.file(`${baseName}.gpx`, gpxText);
  zip.file(`${baseName}.json`, jsonText);
  zip.file(`${baseName}.html`, htmlText);

  return await zip.generateAsync({ type: "blob" });
}
