import { renderTulipSvg } from "./tulipRenderer";

export function exportRoadbookHtml(stage) {
  const roadbook = stage?.roadbook;
  const rows = roadbook?.views?.driver || roadbook?.rows || [];
  const title = stage?.meta?.stageName || "RouteMapper Roadbook";

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

  .header {
    border: 2px solid #000;
    margin-bottom: 8px;
    padding: 8px 10px;
  }

  .title {
    font-size: 24px;
    font-weight: 800;
    margin: 0 0 4px 0;
  }

  .meta {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 12px;
  }

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
    <div class="header">
      <div class="title">${escapeHtml(title)}</div>
      <div class="meta">
        <div><strong>Trip:</strong> ${escapeHtml(stage?.meta?.tripName || "")}</div>
        <div><strong>Date:</strong> ${escapeHtml(stage?.meta?.tripDate || "")}</div>
        <div><strong>Day:</strong> ${escapeHtml(stage?.meta?.dayNumber ?? "")}</div>
        <div><strong>Route:</strong> ${escapeHtml(stage?.meta?.routeName || "")}</div>
        <div><strong>Stage:</strong> ${escapeHtml(stage?.meta?.stageNumber ?? "")}</div>
        <div><strong>Rows:</strong> ${rows.length}</div>
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

function renderRow(row, index, nextRow) {
  const total = formatKm(row.kmTotal);
  const partial = formatKm(row.kmPartial);
  const tulip = renderTulipSvg(row.tulipTemplate || row.eventType);
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
    <div class="tulip-box">
      ${tulip}
    </div>
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
