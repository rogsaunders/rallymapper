#!/usr/bin/env node
// scripts/combine-trip.mjs
//
// Combine every RouteMapper stage in a folder into a single trip
// overview: a self-contained interactive HTML map (Leaflet) plus
// sibling GPX and GeoJSON for any GIS tool.
//
// Usage:
//   node scripts/combine-trip.mjs \
//     --stages <dir-with-stage-jsons> \
//     --out <output-dir> \
//     [--trip-name "ERCA 2026"] \
//     [--simplify 5]
//
// If --trip-name is omitted, every trip found in --stages is processed
// (one output folder per tripName). If --simplify is set, trackpoints
// are downsampled to at most 1 in N (keeps the overview HTML small
// without visibly hurting a continent-scale view). The GPX / GeoJSON
// outputs always carry the full-resolution track so participants who
// import them into Google Earth / Hema / RN get the real thing.
//
// Input format: any file this script finds via `fs.readdirSync` that
// parses as JSON with the RouteMapper stage shape:
//   { meta: {...}, trackPoints: [{lat, lon, time, ...}], waypoints: [...] }
// Both raw exports (as `stage.json` inside a route zip) and rows
// pulled directly from `stage_exports` work.
//
// Output (one set per trip):
//   <out>/<trip-slug>/
//     index.html   — self-contained Leaflet overview, double-click to open
//     route.gpx    — combined GPX, one <trk> per stage + one <wpt> per WP
//     route.geojson — same data in GeoJSON form
//     manifest.txt — one-line-per-stage summary + trip totals

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Arg parsing ─────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { stages: null, out: null, tripName: null, simplify: 5 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--stages") out.stages = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--trip-name") out.tripName = argv[++i];
    else if (a === "--simplify") out.simplify = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 32).join("\n"));
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!out.stages) throw new Error("--stages <dir> is required");
  if (!out.out) throw new Error("--out <dir> is required");
  return out;
}

// ── Stage loading + grouping ────────────────────────────────────────

function loadStages(dir) {
  const entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const stages = [];
  for (const f of entries) {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    try {
      const s = JSON.parse(raw);
      if (!s?.meta?.tripName) {
        console.warn(`  skip ${f}: no meta.tripName`);
        continue;
      }
      stages.push({ file: f, ...s });
    } catch (e) {
      console.warn(`  skip ${f}: parse error ${e.message}`);
    }
  }
  return stages;
}

function groupByTrip(stages) {
  const groups = new Map();
  for (const s of stages) {
    const key = s.meta.tripName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const da = Number(a.meta.dayNumber) || 0;
      const db = Number(b.meta.dayNumber) || 0;
      if (da !== db) return da - db;
      return (a.meta.startedAt || "").localeCompare(b.meta.startedAt || "");
    });
  }
  return groups;
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── Track simplification ────────────────────────────────────────────
//
// Continent-scale view: 50 k trackpoints across 29 stages is far more
// resolution than a Leaflet map at zoom 4 can render distinctly. Every
// Nth point keeps the shape intact and drops the HTML output size
// dramatically. The GPX/GeoJSON get the full-res track.

function stridePoints(points, stride) {
  if (stride <= 1 || !Array.isArray(points)) return points || [];
  const out = [];
  for (let i = 0; i < points.length; i += stride) out.push(points[i]);
  // Always include the last point so the polyline reaches the endpoint.
  if (points.length && (points.length - 1) % stride !== 0) out.push(points[points.length - 1]);
  return out;
}

// ── Colour palette ──────────────────────────────────────────────────
//
// Distinct colour per stage. HSL with even hue spacing works well for
// up to ~30 stages; larger palettes would need something like
// d3-scale-chromatic's cyclic scheme. Saturation + lightness fixed for
// consistent visual weight.

function stageColour(index, total) {
  const hue = Math.round((index * 360) / Math.max(total, 1));
  return `hsl(${hue}, 70%, 45%)`;
}

// ── GPX ─────────────────────────────────────────────────────────────

function toGpx(trip, stages) {
  const xmlEsc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="RouteMapper combine-trip.mjs" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${xmlEsc(trip)}</name></metadata>`,
  ];

  // Waypoints per stage — prefix name with stage number for context.
  stages.forEach((s, i) => {
    const stagePrefix = `D${s.meta.dayNumber ?? "?"}S${s.meta.stageNumber ?? "?"}`;
    for (const w of s.waypoints || []) {
      if (!Number.isFinite(Number(w.lat)) || !Number.isFinite(Number(w.lon))) continue;
      const label = xmlEsc(w.poi || w.iconId || w.type || "wp");
      lines.push(`  <wpt lat="${w.lat}" lon="${w.lon}"><name>${stagePrefix} ${label}</name></wpt>`);
    }
  });

  // One <trk> per stage — participants can toggle in Google Earth.
  stages.forEach((s, i) => {
    lines.push(`  <trk><name>${xmlEsc(s.meta.stageName || `Stage ${i + 1}`)}</name><trkseg>`);
    for (const p of s.trackPoints || []) {
      if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lon))) continue;
      const t = p.time ? `<time>${xmlEsc(p.time)}</time>` : "";
      lines.push(`    <trkpt lat="${p.lat}" lon="${p.lon}">${t}</trkpt>`);
    }
    lines.push("  </trkseg></trk>");
  });

  lines.push("</gpx>");
  return lines.join("\n");
}

// ── GeoJSON ─────────────────────────────────────────────────────────

function toGeoJson(trip, stages) {
  const features = [];
  stages.forEach((s, i) => {
    const coords = (s.trackPoints || [])
      .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)))
      .map((p) => [Number(p.lon), Number(p.lat)]);
    if (coords.length >= 2) {
      features.push({
        type: "Feature",
        properties: {
          stageIndex: i,
          day: s.meta.dayNumber ?? null,
          stageName: s.meta.stageName ?? "",
          routeName: s.meta.routeName ?? "",
          startedAt: s.meta.startedAt ?? null,
          endedAt: s.meta.endedAt ?? null,
          distanceM: s.meta.totalDistanceM ?? null,
          waypointCount: (s.waypoints || []).length,
        },
        geometry: { type: "LineString", coordinates: coords },
      });
    }
    for (const w of s.waypoints || []) {
      if (!Number.isFinite(Number(w.lat)) || !Number.isFinite(Number(w.lon))) continue;
      features.push({
        type: "Feature",
        properties: {
          stageIndex: i,
          day: s.meta.dayNumber ?? null,
          stageName: s.meta.stageName ?? "",
          waypointName: w.poi ?? "",
          icon: w.iconId ?? w.type ?? null,
          timestamp: w.timestamp ?? null,
        },
        geometry: { type: "Point", coordinates: [Number(w.lon), Number(w.lat)] },
      });
    }
  });
  return JSON.stringify({ type: "FeatureCollection", name: trip, features }, null, 0);
}

// ── HTML (interactive Leaflet, self-contained) ──────────────────────

function toHtml(trip, stages, simplifyStride) {
  const totalTracked = stages.reduce((sum, s) => sum + (s.trackPoints?.length || 0), 0);
  const totalWaypoints = stages.reduce((sum, s) => sum + (s.waypoints?.length || 0), 0);
  const totalDistanceKm = stages.reduce(
    (sum, s) => sum + Number(s.meta?.totalDistanceM || 0) / 1000,
    0,
  );

  // Build one payload record per stage — subsampled trackpoints, plus
  // all waypoints. Kept as a JSON string embedded in the <script> tag.
  const payload = stages.map((s, i) => {
    const sampled = stridePoints(s.trackPoints || [], simplifyStride);
    return {
      i,
      day: s.meta.dayNumber ?? null,
      name: s.meta.stageName ?? `Stage ${i + 1}`,
      route: s.meta.routeName ?? "",
      startedAt: s.meta.startedAt ?? null,
      endedAt: s.meta.endedAt ?? null,
      distanceKm: Number(s.meta.totalDistanceM || 0) / 1000,
      colour: stageColour(i, stages.length),
      coords: sampled
        .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)))
        .map((p) => [Number(p.lat), Number(p.lon)]),
      waypoints: (s.waypoints || [])
        .filter((w) => Number.isFinite(Number(w.lat)) && Number.isFinite(Number(w.lon)))
        .map((w) => ({
          lat: Number(w.lat),
          lon: Number(w.lon),
          poi: w.poi || "",
          icon: w.iconId || w.type || "",
        })),
    };
  });

  const dateRange = (() => {
    const times = stages
      .flatMap((s) => [s.meta?.startedAt, s.meta?.endedAt])
      .filter(Boolean)
      .map((t) => Date.parse(t))
      .filter(Number.isFinite);
    if (!times.length) return "";
    const first = new Date(Math.min(...times));
    const last = new Date(Math.max(...times));
    const fmt = (d) => d.toISOString().slice(0, 10);
    return `${fmt(first)} → ${fmt(last)}`;
  })();

  const html = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escHtml(trip)} — Route Overview</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  :root { --header-h: 56px; }
  html, body { margin: 0; padding: 0; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  header {
    height: var(--header-h); box-sizing: border-box;
    background: #1f2937; color: #f9fafb;
    display: flex; align-items: center; gap: 16px;
    padding: 0 16px; box-shadow: 0 1px 3px rgba(0,0,0,.15);
    z-index: 1000; position: relative;
  }
  header h1 { font-size: 16px; font-weight: 600; margin: 0; }
  header .stats { font-size: 12px; opacity: .8; }
  #map { position: absolute; top: var(--header-h); left: 0; right: 0; bottom: 0; }
  .legend {
    position: absolute; top: calc(var(--header-h) + 12px); right: 12px;
    background: rgba(255,255,255,.95); padding: 10px 12px; border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,.15); font-size: 12px;
    max-height: calc(100vh - var(--header-h) - 24px); overflow-y: auto;
    max-width: 280px; z-index: 500;
  }
  .legend h2 { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: #374151; }
  .legend-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; cursor: pointer; user-select: none; }
  .legend-row input { margin: 0; }
  .legend-swatch { width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0; }
  .legend-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #111; }
  .legend-name.dim { opacity: .4; text-decoration: line-through; }
  .legend-km { color: #6b7280; font-variant-numeric: tabular-nums; }
  .legend-actions { margin-top: 8px; display: flex; gap: 6px; font-size: 11px; }
  .legend-actions button { border: 1px solid #d1d5db; background: white; padding: 3px 8px; border-radius: 4px; cursor: pointer; }
  .leaflet-popup-content { font-size: 12px; line-height: 1.35; }
  .leaflet-popup-content .stage { color: #6b7280; font-size: 11px; }
</style>
</head>
<body>
<header>
  <h1>${escHtml(trip)}</h1>
  <div class="stats">
    ${escHtml(dateRange)} · ${stages.length} stages ·
    ${totalDistanceKm.toFixed(0)} km ·
    ${totalWaypoints} waypoints ·
    ${totalTracked.toLocaleString()} trackpoints
  </div>
</header>
<div id="map"></div>
<div class="legend">
  <h2>Stages</h2>
  <div id="legend-rows"></div>
  <div class="legend-actions">
    <button onclick="toggleAll(true)">Show all</button>
    <button onclick="toggleAll(false)">Hide all</button>
  </div>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const STAGES = ${JSON.stringify(payload)};

const map = L.map('map', { preferCanvas: true }).setView([-25, 133], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

const stageLayers = STAGES.map((s) => {
  const line = L.polyline(s.coords, {
    color: s.colour, weight: 3, opacity: .85, smoothFactor: 1.5,
  }).bindPopup(
    '<div><strong>' + escapeHtml(s.name) + '</strong>' +
    '<div class="stage">Day ' + (s.day ?? '?') + ' · ' + (s.distanceKm.toFixed(1)) + ' km</div></div>'
  );
  const wpLayer = L.layerGroup(s.waypoints.map((w) =>
    L.circleMarker([w.lat, w.lon], {
      radius: 4, color: s.colour, weight: 1, fillColor: s.colour, fillOpacity: .8,
    }).bindPopup(
      '<div><strong>' + escapeHtml(w.poi || '(unnamed)') + '</strong>' +
      '<div class="stage">' + escapeHtml(s.name) + '</div></div>'
    )
  ));
  const layer = L.featureGroup([line, wpLayer]).addTo(map);
  return { s, line, wpLayer, layer, visible: true };
});

// Fit to everything on load.
const bounds = L.latLngBounds([]);
stageLayers.forEach(({ line }) => bounds.extend(line.getBounds()));
if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });

// Legend rendering.
const legendRoot = document.getElementById('legend-rows');
stageLayers.forEach((entry, i) => {
  const row = document.createElement('label');
  row.className = 'legend-row';
  row.innerHTML =
    '<input type="checkbox" checked data-i="' + i + '" />' +
    '<span class="legend-swatch" style="background:' + entry.s.colour + '"></span>' +
    '<span class="legend-name">D' + (entry.s.day ?? '?') + ' · ' + escapeHtml(entry.s.name) + '</span>' +
    '<span class="legend-km">' + entry.s.distanceKm.toFixed(0) + ' km</span>';
  legendRoot.appendChild(row);
});
legendRoot.addEventListener('change', (e) => {
  const i = Number(e.target.dataset.i);
  if (!Number.isFinite(i)) return;
  const entry = stageLayers[i];
  entry.visible = e.target.checked;
  if (entry.visible) entry.layer.addTo(map);
  else map.removeLayer(entry.layer);
  e.target.closest('.legend-row').querySelector('.legend-name').classList.toggle('dim', !entry.visible);
});

function toggleAll(show) {
  document.querySelectorAll('#legend-rows input').forEach((cb) => {
    if (cb.checked !== show) { cb.checked = show; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
}
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
</script>
</body>
</html>`;
  return html;
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Manifest ────────────────────────────────────────────────────────

function toManifest(trip, stages) {
  const lines = [`${trip}`, `${stages.length} stages`, ""];
  let totalKm = 0;
  let totalWp = 0;
  for (const s of stages) {
    const km = Number(s.meta.totalDistanceM || 0) / 1000;
    totalKm += km;
    totalWp += (s.waypoints || []).length;
    lines.push(
      `  Day ${String(s.meta.dayNumber ?? "?").padStart(2)} — ` +
        `${km.toFixed(1).padStart(6)} km — ` +
        `${String((s.waypoints || []).length).padStart(3)} WP — ` +
        `${s.meta.stageName || ""}`,
    );
  }
  lines.push("");
  lines.push(`Total: ${totalKm.toFixed(1)} km, ${totalWp} waypoints`);
  return lines.join("\n");
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  console.log(`Loading stages from ${opts.stages} ...`);
  const stages = loadStages(opts.stages);
  console.log(`  found ${stages.length} stage JSONs`);

  const groups = groupByTrip(stages);
  const targets = opts.tripName ? new Map([[opts.tripName, groups.get(opts.tripName)]]) : groups;

  for (const [trip, list] of targets) {
    if (!list?.length) {
      console.warn(`  no stages for tripName="${trip}"`);
      continue;
    }
    const dir = path.join(opts.out, slug(trip));
    fs.mkdirSync(dir, { recursive: true });

    console.log(`\n${trip} → ${dir}`);
    console.log(`  ${list.length} stages`);

    fs.writeFileSync(path.join(dir, "index.html"), toHtml(trip, list, opts.simplify));
    fs.writeFileSync(path.join(dir, "route.gpx"), toGpx(trip, list));
    fs.writeFileSync(path.join(dir, "route.geojson"), toGeoJson(trip, list));
    fs.writeFileSync(path.join(dir, "manifest.txt"), toManifest(trip, list));

    const sizes = ["index.html", "route.gpx", "route.geojson", "manifest.txt"].map((f) => {
      const p = path.join(dir, f);
      return `    ${f.padEnd(15)} ${(fs.statSync(p).size / 1024).toFixed(1)} kB`;
    });
    console.log(sizes.join("\n"));
  }

  console.log(`\ndone.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
