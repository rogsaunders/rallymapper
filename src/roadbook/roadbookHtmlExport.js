import { renderTulipSvg } from "./tulipRenderer";
import logoUrl from "../assets/fullLogo_transparent.png";
import manifest from "../icons/iconManifest.json";

// Vite loads every SVG in src/icons/svg/ as a raw string at build time.
// Adding a new SVG file + manifest entry is all that's needed.
const _svgModules = import.meta.glob("../icons/svg/*.svg", { as: "raw", eager: true });

const ICON_DEFS = manifest.map(d => ({
  ...d,
  svg: _svgModules[`../icons/svg/${d.file}`] ?? "",
}));

const ICON_SVG_MAP = Object.fromEntries(ICON_DEFS.map(d => [d.id, d.svg]));

const NAV_ICON_IDS = new Set(
  ICON_DEFS.filter(d => d.category === "Nav").map(d => d.id)
);


export function exportRoadbookHtml(stage) {
  const roadbook = stage?.roadbook;
  const rawRows = roadbook?.views?.driver || roadbook?.rows || [];
  const rows = ensureStartRow(rawRows);
  const title = stage?.meta?.stageName || "RouteMapper Roadbook";
  const meta = stage?.meta || {};

  const lastWithKm = [...rows].reverse().find(r => Number.isFinite(Number(r.kmTotal)));
  const totalKm = lastWithKm ? Number(lastWithKm.kmTotal).toFixed(1) : "—";
  const waypointCount = rows.filter(r => r.source !== "synthetic").length;
  const firstGps = rows.find(r => Number.isFinite(Number(r.lat)));
  const lastGps  = [...rows].reverse().find(r => Number.isFinite(Number(r.lat)));

  const rowHtml = rows.map((row, index) =>
    renderRow(row, index, rows[index + 1]),
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 10mm;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    background: #ffffff;
    color: #000;
  }

  .page {
    width: 100%;
    margin: 0 auto;
  }

  /* ── RouteMapper branded header ── */
  .rm-header { border: 2px solid #000; margin-bottom: 8px; }
  .rm-brand-row { display: flex; align-items: stretch; border-bottom: 2px solid #000; }
  .rm-brand-logo { display: flex; align-items: center; justify-content: center; padding: 12px 16px; border-right: 2px solid #000; flex-shrink: 0; }
  .rm-logo-img { height: 120px; width: auto; display: block; }
  .rm-brand-stage { flex: 1; display: flex; align-items: center; justify-content: center; padding: 16px 20px; }
  .rm-stage { font-size: 24px; font-weight: 900; text-align: center; line-height: 1.2; }
  .rm-data-row { display: flex; border-bottom: 2px solid #000; }
  .rm-stats { display: flex; flex-direction: column; border-right: 2px solid #000; flex-shrink: 0; }
  .rm-stat { padding: 8px 18px; text-align: center; border-bottom: 2px solid #000; }
  .rm-stat:last-child { border-bottom: none; }
  .rm-stat-n { display: block; font-size: 32px; font-weight: 900; line-height: 1; }
  .rm-stat-l { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #444; margin-top: 2px; }
  .rm-meta-grid { flex: 1; padding: 10px 16px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; justify-content: center; }
  .rm-meta-row { display: flex; gap: 8px; }
  .rm-meta-k { font-weight: 700; min-width: 46px; }
  .rm-endpoints { display: flex; }
  .rm-ep { flex: 1; padding: 8px 12px; text-align: center; border-right: 2px solid #000; }
  .rm-ep:last-child { border-right: none; }
  .rm-ep-label { font-size: 10px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: #006b6b; margin-bottom: 2px; }
  .rm-ep-gps { font-size: 12px; font-weight: 700; line-height: 1.5; }

  .roadbook {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .roadbook td,
  .roadbook th {
    border: 2px solid #000;
    padding: 0;
    vertical-align: top;
  }

  .roadbook thead th {
    background: #111;
    color: #fff;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 6px 8px;
  }

  .col-total {
    width: 110px;
  }

  .col-partial {
    width: 110px;
  }

  .col-rowno {
    width: 48px;
  }

  .col-tulip {
    width: 260px;
  }

  .col-cap {
    width: 90px;
  }

  .col-note {
    width: auto;
  }

  .col-gps {
    width: 170px;
  }

  .rb-row {
    height: 124px;
    page-break-inside: avoid;
  }

  .distance-box {
    display: flex;
    flex-direction: column;
    height: 124px;
  }

  .distance-box.total.manual,
  .distance-box.partial.manual {
    background: #fff200;
  }

  .distance-box.total.derived,
  .distance-box.partial.derived {
    background: #efefef;
  }

  .distance-main {
    flex: 1;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 10px;
    font-size: 44px;
    line-height: 1;
    font-weight: 900;
  }

  .distance-sub {
    border-top: 2px solid #000;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 800;
    background: #fff;
  }

  .rowno-box {
    height: 124px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: #000;
    color: #fff;
    font-size: 24px;
    font-weight: 800;
    padding-bottom: 10px;
  }

  .tulip-box {
    height: 124px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f3f3f3;
    position: relative;
  }

  .tulip-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tulip-icon-corner {
    position: absolute;
    bottom: 4px;
    right: 4px;
    width: 38px;
    height: 38px;
    background: #fff;
    border: 1.5px solid #ccc;
    border-radius: 4px;
    padding: 2px;
  }

  .tulip-icon-corner svg {
    width: 34px;
    height: 34px;
    display: block;
  }

  .tulip-icon-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 78px;
    height: 78px;
  }

  .tulip-icon-overlay svg {
    width: 78px;
    height: 78px;
    display: block;
  }

  .tulip-has-overlay .tulip-diagram svg {
    opacity: 0.2;
  }

  .cap-box {
    height: 124px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 10px;
    background: #fff35a;
    font-size: 28px;
    font-weight: 900;
  }

  .note-box {
    height: 124px;
    display: flex;
    flex-direction: column;
    background: #fff;
  }

  .note-main {
    flex: 1;
    padding: 10px 12px 6px 12px;
    font-size: 24px;
    font-weight: 800;
    line-height: 1.05;
  }

  .note-sub {
    border-top: 1px solid #bbb;
    padding: 6px 10px;
    font-size: 12px;
    color: #444;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .gps-box {
    height: 124px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 10px;
    background: #fff;
  }

  .gps-inner {
    width: 100%;
    border: 2px solid #000;
    padding: 6px 8px;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.15;
    background: #fff;
  }

  .muted {
    color: #666;
    font-weight: 600;
  }

  .badge {
    display: inline-block;
    border: 1px solid #444;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
  }

  .debug {
    color: #444;
    font-size: 11px;
  }

  @media print {
    body {
      background: #fff;
    }

    .header {
      break-inside: avoid;
    }

    .rb-row {
      break-inside: avoid;
    }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="rm-header">
      <div class="rm-brand-row">
        <div class="rm-brand-logo"><img src="${logoUrl}" class="rm-logo-img" alt="RouteMapper"></div>
        <div class="rm-brand-stage"><div class="rm-stage">${escapeHtml(title)}</div></div>
      </div>
      <div class="rm-data-row">
        <div class="rm-stats">
          <div class="rm-stat"><span class="rm-stat-n">${totalKm}</span><span class="rm-stat-l">Kilometres</span></div>
          <div class="rm-stat"><span class="rm-stat-n">${waypointCount}</span><span class="rm-stat-l">Waypoints</span></div>
        </div>
        <div class="rm-meta-grid">
          ${[["Trip", meta.tripName], ["Route", meta.routeName], ["Day", meta.dayNumber], ["Stage", meta.stageNumber], ["Date", meta.tripDate]].filter(([,v]) => v != null && v !== "").map(([k,v]) => `<div class="rm-meta-row"><span class="rm-meta-k">${k}</span><span>${escapeHtml(String(v))}</span></div>`).join("")}
        </div>
      </div>
      <div class="rm-endpoints">
        <div class="rm-ep"><div class="rm-ep-label">Start</div><div class="rm-ep-gps">${firstGps ? formatGps(firstGps.lat, firstGps.lon) : "—"}</div></div>
        <div class="rm-ep"><div class="rm-ep-label">Finish</div><div class="rm-ep-gps">${lastGps ? formatGps(lastGps.lat, lastGps.lon) : "—"}</div></div>
      </div>
    </div>

    <table class="roadbook">
      <thead>
        <tr>
          <th class="col-total">Total</th>
          <th class="col-partial">Partial</th>
          <th class="col-rowno">#</th>
          <th class="col-tulip">Tulip</th>
          <th class="col-cap">CAP</th>
          <th class="col-note">Note</th>
          <th class="col-gps">GPS</th>
        </tr>
      </thead>
      <tbody>
        ${rowHtml}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

function ensureStartRow(rows) {
  if (!rows.length) return rows;
  if (Math.abs(rows[0].kmTotal || 0) < 0.01) return rows; // already has a km-0 row

  // Derive initial bearing: use first row's bearingIn, or bearing from first→second row
  const first = rows[0];
  let angle = null;
  if (Number.isFinite(first.bearingIn)) {
    angle = first.bearingIn;
  } else if (
    rows.length > 1 &&
    Number.isFinite(first.lat) && Number.isFinite(first.lon) &&
    Number.isFinite(rows[1].lat) && Number.isFinite(rows[1].lon)
  ) {
    angle = bearingBetween(first.lat, first.lon, rows[1].lat, rows[1].lon);
  }

  return [
    {
      kmTotal: 0,
      kmPartial: 0,
      icon: "start",
      eventType: "straight",
      angle,
      notes: "Start",
      lat: null,
      lon: null,
      confidence: 1,
      source: "synthetic",
    },
    ...rows,
  ];
}

function renderTulipCell(row) {
  const tulip = renderTulipSvg(row.tulipTemplate || row.eventType, { angle: row.angle });
  const iconSvg = row.icon ? ICON_SVG_MAP[row.icon] : null;

  if (!iconSvg) {
    return `<div class="tulip-box"><div class="tulip-wrap"><div class="tulip-diagram">${tulip}</div></div></div>`;
  }

  if (NAV_ICON_IDS.has(row.icon)) {
    return `<div class="tulip-box"><div class="tulip-wrap">` +
      `<div class="tulip-diagram">${tulip}</div>` +
      `<div class="tulip-icon-corner">${iconSvg}</div>` +
      `</div></div>`;
  }

  return `<div class="tulip-box"><div class="tulip-wrap tulip-has-overlay">` +
    `<div class="tulip-diagram">${tulip}</div>` +
    `<div class="tulip-icon-overlay">${iconSvg}</div>` +
    `</div></div>`;
}

function renderRow(row, index, nextRow) {
  const total = formatKm(row.kmTotal);
  const partial = formatKm(row.kmPartial);
  const note = escapeHtml(row.notes || humanizeEventType(row.eventType));
  const gps = formatGps(row.lat, row.lon);
  const cap = formatCap(row, nextRow);
  const isManual = Boolean(row.icon);
  const modeClass = isManual ? "manual" : "derived";

  return `
<tr class="rb-row">
  <td class="col-total">
    <div class="distance-box total ${modeClass}">
      <div class="distance-main">${total}</div>
    </div>
  </td>

  <td class="col-partial">
    <div class="distance-box partial ${modeClass}">
      <div class="distance-sub">${partial}</div>
    </div>
  </td>

  <td class="col-rowno">
    <div class="rowno-box">${index + 1}</div>
  </td>

  <td class="col-tulip">
    ${renderTulipCell(row)}
  </td>

  <td class="col-cap">
    <div class="cap-box">${cap}</div>
  </td>

  <td class="col-note">
    <div class="note-box">
      <div class="note-main">${note}</div>
      <div class="note-sub">
        <span>${row.icon ? `<span class="badge">${escapeHtml(row.icon)}</span>` : `<span class="muted">${escapeHtml(row.eventType || "")}</span>`}</span>
        <span class="debug">Conf ${formatConfidence(row.confidence)}</span>
      </div>
    </div>
  </td>

  <td class="col-gps">
    <div class="gps-box">
      <div class="gps-inner">${gps}</div>
    </div>
  </td>
</tr>`;
}

function formatKm(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function formatConfidence(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function formatCap(row, nextRow) {
  let bearing = null;

  if (Number.isFinite(row?.bearingOut)) {
    bearing = row.bearingOut;
  } else if (Number.isFinite(nextRow?.bearingIn)) {
    bearing = nextRow.bearingIn;
  } else if (
    nextRow &&
    Number.isFinite(row?.lat) &&
    Number.isFinite(row?.lon) &&
    Number.isFinite(nextRow?.lat) &&
    Number.isFinite(nextRow?.lon)
  ) {
    bearing = bearingBetween(row.lat, row.lon, nextRow.lat, nextRow.lon);
  }

  if (!Number.isFinite(bearing)) return "";

  const cap = Math.round(((bearing % 360) + 360) % 360);

  return `${cap}°`;
}

function bearingBetween(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function formatGps(lat, lon) {
  const latN = Number(lat);
  const lonN = Number(lon);

  if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return "";

  return `${toDms(latN, "lat")}<br>${toDms(lonN, "lon")}`;
}

function toDms(value, kind) {
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutesFull = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = ((minutesFull - minutes) * 60).toFixed(3);

  const hemi =
    kind === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";

  return `${degrees}°${String(minutes).padStart(2, "0")}.${seconds}'${hemi}`;
}

function humanizeEventType(value) {
  return String(value || "note")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
