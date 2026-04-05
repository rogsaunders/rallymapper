#!/usr/bin/env node
/**
 * RouteMapper — Roadbook HTML regenerator with interactive icon palette.
 *
 * Usage:
 *   node scripts/regenerate-roadbook.mjs <roadbook.json> [output.html] [options]
 *
 * Options:
 *   --min-confidence <n>   Suppress derived rows below threshold (default 0.70)
 *   --no-filter            Include all rows regardless of confidence
 *   --no-flag-uturns       Disable U-turn zone highlighting
 *
 * The generated HTML is print-ready AND interactive:
 *   - Open in any browser to drag icons from the palette onto note cells
 *   - Edit note text directly in the browser (contenteditable)
 *   - Print with Cmd/Ctrl+P — palette hides automatically
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// ─── Args ────────────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
let inputArg, outputArg;
let minConfidence = 0.70;
let flagUturnZones = true;

for (let i = 0; i < rawArgs.length; i++) {
  if      (rawArgs[i] === "--min-confidence" && rawArgs[i+1]) minConfidence = parseFloat(rawArgs[++i]);
  else if (rawArgs[i] === "--no-filter")       minConfidence = 0;
  else if (rawArgs[i] === "--no-flag-uturns")  flagUturnZones = false;
  else if (!inputArg)  inputArg  = rawArgs[i];
  else if (!outputArg) outputArg = rawArgs[i];
}

if (!inputArg) {
  console.error("Usage: node scripts/regenerate-roadbook.mjs <roadbook.json> [output.html] [--min-confidence 0.70] [--no-filter]");
  process.exit(1);
}

const inputPath  = path.resolve(inputArg);
const outputPath = outputArg
  ? path.resolve(outputArg)
  : inputPath.replace(/_roadbook\.json$/, "_roadbook_regen.html").replace(/\.json$/, "_regen.html");

// ─── Load stage ──────────────────────────────────────────────────────────────

const loaded = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const stage  = loaded.roadbook ? loaded : { meta: loaded.meta, roadbook: loaded };

// ─── Icon loading ─────────────────────────────────────────────────────────────
// Reads from iconManifest.json + src/icons/svg/*.svg — add new icons there.

const ICON_SVG_DIR = path.join(REPO_ROOT, "src/icons/svg");
const FALLBACK_SVG = (label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144"><rect x="4" y="4" width="136" height="136" rx="8" fill="#eee" stroke="#999" stroke-width="6"/><text x="72" y="80" text-anchor="middle" font-size="24" fill="#555">${label}</text></svg>`;

let ICON_DEFS = [];
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "src/icons/iconManifest.json"), "utf8"));
  ICON_DEFS = manifest.map(d => {
    let svg = FALLBACK_SVG(d.label);
    try { svg = fs.readFileSync(path.join(ICON_SVG_DIR, d.file), "utf8").trim(); } catch (_) {}
    return { ...d, svg };
  });
} catch (_) {
  console.warn("⚠ Could not load iconManifest.json — palette will be empty");
}

const ICON_CATEGORIES = [...new Set(ICON_DEFS.map(d => d.category))];

// Quick lookup by icon id
const ICON_BY_ID = Object.fromEntries(ICON_DEFS.map(d => [d.id, d]));

// ─── Start row ────────────────────────────────────────────────────────────────

function ensureStartRow(rows) {
  if (!rows.length) return rows;
  if (Math.abs(rows[0].kmTotal || 0) < 0.01) return rows;

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
    { kmTotal: 0, kmPartial: 0, icon: "start", eventType: "straight", angle, notes: "Start", lat: null, lon: null, confidence: 1, source: "synthetic" },
    ...rows,
  ];
}

// ─── Row filtering ────────────────────────────────────────────────────────────

function filterRows(rows, threshold) {
  return rows.filter(row => {
    if (row.icon) return true;
    if (row.eventType === "note") return true;
    if (row.source === "manual")  return true;
    return (row.confidence ?? 0) >= threshold;
  });
}

function detectUTurnZones(rows) {
  const flagged = new Set();
  const hairpins = rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) =>
      (row.eventType === "hairpin_right" || row.eventType === "hairpin_left") && !row.icon
    );
  for (let a = 0; a < hairpins.length; a++) {
    for (let b = a + 1; b < hairpins.length; b++) {
      if (Math.abs(hairpins[b].row.kmTotal - hairpins[a].row.kmTotal) <= 3.0) {
        for (let k = hairpins[a].i; k <= hairpins[b].i; k++) flagged.add(k);
      }
    }
  }
  rows.forEach((row, i) => {
    if (row.notes && /u[\s-]?turn/i.test(row.notes)) {
      for (let k = Math.max(0, i-1); k <= Math.min(rows.length-1, i+2); k++) flagged.add(k);
    }
  });
  return flagged;
}

// ─── Tulip renderer ───────────────────────────────────────────────────────────

function renderTulipSvg(eventType, options = {}) {
  const size = options.size ?? 120;
  const c    = size / 2;
  const s    = options.strokeWidth ?? 10;
  const angle = options.angle;
  if (angle != null) return renderAngleTulip(size, c, s, angle);
  switch (eventType) {
    case "right_90":    return svgWrap(size, seg(c,size,c,c,s) + exitSeg(c,c,size,c,s));
    case "left_90":     return svgWrap(size, seg(c,size,c,c,s) + exitSeg(c,c,0,c,s));
    case "sharp_right": return svgWrap(size, seg(c,size,c,c+10,s) + exitSeg(c,c+10,size-10,20,s));
    case "sharp_left":  return svgWrap(size, seg(c,size,c,c+10,s) + exitSeg(c,c+10,10,20,s));
    case "bear_right":  return svgWrap(size, seg(c,size,c,c+10,s) + exitSeg(c,c+10,c+35,20,s));
    case "bear_left":   return svgWrap(size, seg(c,size,c,c+10,s) + exitSeg(c,c+10,c-35,20,s));
    case "hairpin_right": return svgWrap(size,
      `<path d="M ${c} ${size} L ${c} ${c+20} Q ${c} 20 ${size-20} 20 L ${size-20} ${c}" fill="none" stroke="black" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round"/>` +
      arrowHead(size-20, 20, size-20, c, s));
    case "hairpin_left":  return svgWrap(size,
      `<path d="M ${c} ${size} L ${c} ${c+20} Q ${c} 20 20 20 L 20 ${c}" fill="none" stroke="black" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round"/>` +
      arrowHead(20, 20, 20, c, s));
    default: return svgWrap(size, exitSeg(c,size,c,10,s));
  }
}

function renderAngleTulip(size, c, s, angle) {
  const arm = c - 10;
  const rad = (angle * Math.PI) / 180;
  const ex  = r(c + arm * Math.sin(rad));
  const ey  = r(c - arm * Math.cos(rad));
  if (Math.abs(angle) > 150) {
    const lx = r(c + (angle > 0 ? 1 : -1) * arm * 0.6);
    return svgWrap(size,
      `<path d="M ${c} ${size} L ${c} ${c+20} Q ${c} 10 ${ex} ${ey} L ${lx} ${c}" fill="none" stroke="black" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round"/>` +
      arrowHead(ex, ey, lx, c, s));
  }
  return svgWrap(size, seg(c,size,c,c,s) + exitSeg(c,c,ex,ey,s));
}

function seg(x1,y1,x2,y2,s) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="${s}" stroke-linecap="round"/>`;
}
function exitSeg(x1,y1,x2,y2,s) { return seg(x1,y1,x2,y2,s) + arrowHead(x1,y1,x2,y2,s); }
function arrowHead(x1,y1,x2,y2,s) {
  const angle = Math.atan2(y2-y1, x2-x1);
  const sz = s * 1.8, b = 2.45;
  return `<polygon points="${r(x2)},${r(y2)} ${r(x2+sz*Math.cos(angle+b))},${r(y2+sz*Math.sin(angle+b))} ${r(x2+sz*Math.cos(angle-b))},${r(y2+sz*Math.sin(angle-b))}" fill="black"/>`;
}
function r(n) { return Math.round(n * 100) / 100; }
function svgWrap(size, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect x="0" y="0" width="${size}" height="${size}" fill="white"/>${inner}</svg>`;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatKm(v)    { const n = Number(v ?? 0); return Number.isFinite(n) ? n.toFixed(2) : ""; }
function formatConf(v)  { const n = Number(v ?? 0); return Number.isFinite(n) ? n.toFixed(2) : ""; }

function formatCap(row, next) {
  let b = null;
  if (Number.isFinite(row?.bearingOut))  b = row.bearingOut;
  else if (Number.isFinite(next?.bearingIn)) b = next.bearingIn;
  else if (next && Number.isFinite(row?.lat) && Number.isFinite(next?.lat))
    b = bearingBetween(row.lat, row.lon, next.lat, next.lon);
  return Number.isFinite(b) ? `${Math.round(((b%360)+360)%360)}°` : "";
}

function bearingBetween(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const dLon  = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return Math.atan2(y, x) * 180 / Math.PI;
}

function formatGps(lat, lon) {
  const la = Number(lat), lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return "";
  return `${toDms(la,"lat")}<br>${toDms(lo,"lon")}`;
}

function toDms(v, kind) {
  const abs = Math.abs(v), deg = Math.floor(abs);
  const mFull = (abs - deg) * 60, min = Math.floor(mFull);
  const sec   = ((mFull - min) * 60).toFixed(3);
  const hemi  = kind === "lat" ? (v >= 0 ? "N" : "S") : (v >= 0 ? "E" : "W");
  return `${deg}°${String(min).padStart(2,"0")}.${sec}'${hemi}`;
}

function humanize(v) {
  return String(v || "note").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildIconPaletteHtml() {
  const sections = ICON_CATEGORIES.map(cat => {
    const icons = ICON_DEFS.filter(d => d.category === cat);
    const items = icons.map(d =>
      `<div class="pi" draggable="true" data-id="${d.id}" title="${d.label}">` +
        `<div class="pi-icon">${d.svg}</div>` +
        `<div class="pi-label">${d.label}</div>` +
      `</div>`
    ).join("");
    return `<div class="ps"><div class="ps-cat">${cat}</div><div class="ps-icons">${items}</div></div>`;
  }).join("");

  return `
<div id="palette" class="palette">
  <div class="palette-hdr">
    <span>🗂 Icon Stash &mdash; drag onto any Note cell &nbsp;&nbsp; <small>&#x2318;P to print (palette hides automatically)</small></span>
    <button onclick="togglePalette()" id="palette-btn">Hide</button>
  </div>
  <div class="palette-body" id="palette-body">
    ${sections}
  </div>
</div>`;
}

function buildIconSvgsJs() {
  const obj = Object.fromEntries(ICON_DEFS.map(d => [d.id, d.svg]));
  return `const ICON_SVGS = ${JSON.stringify(obj)};`;
}

function buildDragDropJs() {
  return `
<script>
${buildIconSvgsJs()}

const NAV_IDS = new Set(['left','right','keep_l','keep_r','straight','caution','gate','cattle_gate']);
let _dragId = null;

// Palette toggle
function togglePalette() {
  const body = document.getElementById('palette-body');
  const btn  = document.getElementById('palette-btn');
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? '' : 'none';
  btn.textContent = hidden ? 'Hide' : 'Show';
}

// Drag from palette
document.querySelectorAll('.pi').forEach(item => {
  item.addEventListener('dragstart', e => {
    _dragId = item.dataset.id;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', _dragId);
    item.classList.add('dragging');
  });
  item.addEventListener('dragend', () => item.classList.remove('dragging'));
});

// Drop onto tulip cells
document.querySelectorAll('.tulip-box').forEach(cell => {
  cell.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    cell.classList.add('drag-over');
  });
  cell.addEventListener('dragleave', e => {
    if (!cell.contains(e.relatedTarget)) cell.classList.remove('drag-over');
  });
  cell.addEventListener('drop', e => {
    e.preventDefault();
    cell.classList.remove('drag-over');
    if (!_dragId) return;

    const svg = ICON_SVGS[_dragId];
    if (!svg) return;

    // Ensure a .tulip-wrap exists as the positioning parent
    let wrap = cell.querySelector('.tulip-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'tulip-wrap';
      while (cell.firstChild) wrap.appendChild(cell.firstChild);
      cell.appendChild(wrap);
    }

    // Remove any previously dropped icon of the same slot
    const isNav = NAV_IDS.has(_dragId);
    const slotClass = isNav ? 'tulip-icon-corner' : 'tulip-icon-overlay';
    wrap.querySelectorAll('.' + slotClass + '.dropped').forEach(el => el.remove());

    // Add/remove the dimming class on the tulip diagram
    if (!isNav) {
      wrap.classList.add('tulip-has-overlay');
    }

    const icon = document.createElement('div');
    icon.className = slotClass + ' dropped';
    icon.title = _dragId;
    icon.innerHTML = svg;
    wrap.appendChild(icon);

    _dragId = null;
  });
});

// Double-click to remove a dropped icon
document.addEventListener('dblclick', e => {
  const dropped = e.target.closest('.dropped');
  if (dropped && dropped.closest('.tulip-box')) {
    // If removing an overlay, un-dim the tulip
    if (dropped.classList.contains('tulip-icon-overlay')) {
      const wrap = dropped.closest('.tulip-wrap');
      if (wrap && !wrap.querySelector('.tulip-icon-overlay:not(.dropped)')) {
        wrap.classList.remove('tulip-has-overlay');
      }
    }
    dropped.remove();
  }
});
</script>`;
}

let RM_LOGO_DATA_URI = "";
try {
  const logoBuf = fs.readFileSync(path.join(REPO_ROOT, "website/assets/RouteMapper-Logo-Pack/Full Colour/fullLogo_transparent.png"));
  RM_LOGO_DATA_URI = `data:image/png;base64,${logoBuf.toString("base64")}`;
} catch (_) { /* logo not found — brand row will show text only */ }

function buildRmHeader(stage, rows) {
  const meta = stage?.meta || {};
  const title = meta.stageName || "RouteMapper Roadbook";
  const lastWithKm = [...rows].reverse().find(r => Number.isFinite(Number(r.kmTotal)));
  const totalKm = lastWithKm ? Number(lastWithKm.kmTotal).toFixed(1) : "—";
  const waypointCount = rows.filter(r => r.source !== "synthetic").length;
  const firstGps = rows.find(r => Number.isFinite(Number(r.lat)));
  const lastGps  = [...rows].reverse().find(r => Number.isFinite(Number(r.lat)));
  const metaItems = [["Trip",meta.tripName],["Route",meta.routeName],["Day",meta.dayNumber],["Stage",meta.stageNumber],["Date",meta.tripDate]]
    .filter(([,v]) => v != null && v !== "")
    .map(([k,v]) => `<div class="rm-meta-row"><span class="rm-meta-k">${k}</span><span>${escapeHtml(String(v))}</span></div>`)
    .join("");
  const logoHtml = RM_LOGO_DATA_URI
    ? `<img src="${RM_LOGO_DATA_URI}" class="rm-logo-img" alt="RouteMapper">`
    : `<div><div class="rm-wordmark-main"><span class="rm-word-route">ROUTE</span><span class="rm-word-mapper">MAPPER</span></div><div class="rm-tagline">Rally Roadbook System</div></div>`;
  return `<div class="rm-header">
  <div class="rm-brand-row">
    <div class="rm-brand-logo">${logoHtml}</div>
    <div class="rm-brand-stage"><div class="rm-stage">${escapeHtml(title)}</div></div>
  </div>
  <div class="rm-data-row">
    <div class="rm-stats">
      <div class="rm-stat"><span class="rm-stat-n">${totalKm}</span><span class="rm-stat-l">Kilometres</span></div>
      <div class="rm-stat"><span class="rm-stat-n">${waypointCount}</span><span class="rm-stat-l">Waypoints</span></div>
    </div>
    <div class="rm-meta-grid">${metaItems}</div>
  </div>
  <div class="rm-endpoints">
    <div class="rm-ep"><div class="rm-ep-label">Start</div><div class="rm-ep-gps">${firstGps ? formatGps(firstGps.lat,firstGps.lon) : "—"}</div></div>
    <div class="rm-ep"><div class="rm-ep-label">Finish</div><div class="rm-ep-gps">${lastGps ? formatGps(lastGps.lat,lastGps.lon) : "—"}</div></div>
  </div>
</div>`;
}

function buildHtml(stage, rows, flaggedRows) {
  const title  = stage?.meta?.stageName || "RouteMapper Roadbook";
  const rowHtml = rows.map((row, i) => buildRow(row, i, rows[i+1], flaggedRows.has(i))).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>
/* ── Print ── */
@page { size: A4 portrait; margin: 10mm; }
@media print {
  .palette { display: none !important; }
  body { background: #fff; }
  .rb-row { break-inside: avoid; }
  .filter-note { display: none; }
}

/* ── Base ── */
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #f0f0f0; color: #000; }
.page { max-width: 900px; margin: 0 auto; background: #fff; padding: 10px; }

/* ── Icon Palette ── */
.palette { background: #1a1a2e; color: #fff; padding: 8px 12px; margin-bottom: 10px; border-radius: 6px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
.palette-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-size: 12px; }
.palette-hdr small { color: #aaa; }
.palette-hdr button { background: #444; color: #fff; border: none; padding: 3px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; }
.palette-body { display: flex; gap: 6px; flex-wrap: wrap; }
.ps { display: flex; align-items: flex-start; gap: 2px; border-right: 1px solid #444; padding-right: 6px; margin-right: 2px; }
.ps:last-child { border-right: none; }
.ps-cat { writing-mode: vertical-lr; text-orientation: mixed; transform: rotate(180deg); font-size: 9px; font-weight: 700; color: #aaa; letter-spacing: 0.08em; text-transform: uppercase; align-self: center; margin-right: 2px; }
.ps-icons { display: flex; flex-wrap: wrap; gap: 3px; }
.pi { display: flex; flex-direction: column; align-items: center; width: 52px; cursor: grab; padding: 3px; border-radius: 4px; border: 1px solid transparent; transition: background 0.15s, border-color 0.15s; }
.pi:hover { background: rgba(255,255,255,0.12); border-color: #666; }
.pi.dragging { opacity: 0.4; }
.pi-icon { width: 36px; height: 36px; }
.pi-icon svg { width: 36px; height: 36px; display: block; }
.pi-label { font-size: 8px; color: #ccc; text-align: center; margin-top: 2px; line-height: 1.2; }

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

/* ── Roadbook table ── */
.filter-note { margin-bottom: 6px; padding: 5px 10px; background: #f5f5f5; border: 1px solid #ccc; font-size: 11px; color: #555; border-radius: 3px; }

.roadbook { width: 100%; border-collapse: collapse; table-layout: fixed; }
.roadbook td, .roadbook th { border: 2px solid #000; padding: 0; vertical-align: top; }
.roadbook thead th { background: #111; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; padding: 5px 6px; }
.col-total   { width: 110px; }
.col-partial { width: 110px; }
.col-rowno   { width: 48px; }
.col-tulip   { width: 240px; }
.col-cap     { width: 80px; }
.col-note    { width: auto; }
.col-gps     { width: 160px; }

/* ── Row cells ── */
.rb-row  { height: 124px; page-break-inside: avoid; }
.rb-row.flagged .note-box { background: #fff8e1; }

.distance-box { display: flex; flex-direction: column; height: 124px; }
.distance-box.total.manual, .distance-box.partial.manual { background: #fff200; }
.distance-box.total.derived, .distance-box.partial.derived { background: #efefef; }
.distance-main { flex: 1; display: flex; align-items: flex-start; justify-content: center; padding-top: 8px; font-size: 40px; line-height: 1; font-weight: 900; }
.distance-sub  { border-top: 2px solid #000; min-height: 36px; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; background: #fff; }
.rowno-box  { height: 124px; display: flex; align-items: flex-end; justify-content: center; background: #000; color: #fff; font-size: 22px; font-weight: 800; padding-bottom: 8px; }
.tulip-box  { height: 124px; display: flex; align-items: center; justify-content: center; background: #f3f3f3; }
.cap-box    { height: 124px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 8px; background: #fff35a; font-size: 26px; font-weight: 900; }
.note-box   { height: 124px; display: flex; flex-direction: column; background: #fff; }
.note-main  { flex: 1; padding: 8px 10px 4px 10px; font-size: 20px; font-weight: 700; line-height: 1.1; outline: none; }
.note-sub   { border-top: 1px solid #bbb; padding: 4px 8px; font-size: 11px; color: #555; display: flex; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
.gps-box    { height: 124px; display: flex; align-items: flex-end; justify-content: center; padding: 8px; background: #fff; }
.gps-inner  { width: 100%; border: 2px solid #000; padding: 5px 6px; text-align: center; font-size: 11px; font-weight: 700; line-height: 1.2; }

/* ── Editable notes ── */
.note-editable { cursor: text; }
.note-editable:focus { background: #fffde7; }

/* ── Tulip cell drop target ── */
.tulip-box { position: relative; }
.tulip-wrap { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.tulip-box.drag-over { background: #e3f2fd; outline: 2px dashed #1976d2; }

/* Nav icon: small badge pinned to bottom-right of tulip cell */
.tulip-icon-corner { position: absolute; bottom: 4px; right: 4px; width: 40px; height: 40px; background: #fff; border: 1.5px solid #ccc; border-radius: 4px; padding: 2px; }
.tulip-icon-corner svg { width: 36px; height: 36px; display: block; }

/* Hazard / Control / Note icon: centred overlay on top of (dimmed) tulip */
.tulip-icon-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 78px; height: 78px; }
.tulip-icon-overlay svg { width: 78px; height: 78px; display: block; }
.tulip-has-overlay .tulip-diagram svg { opacity: 0.2; }

/* ── Inline icons (in note cells, if ever used) ── */
.inline-icon { display: inline-block; width: 28px; height: 28px; vertical-align: middle; margin: 0 3px 2px 0; cursor: default; }
.inline-icon svg { width: 28px; height: 28px; display: block; }

/* ── Badges ── */
.badge { display: inline-block; border: 1px solid #444; padding: 1px 5px; border-radius: 999px; font-size: 10px; font-weight: 700; }
.review-badge { display: inline-block; background: #ff9800; color: #fff; padding: 1px 5px; border-radius: 999px; font-size: 10px; font-weight: 700; }
.muted { color: #777; }
.debug { color: #888; font-size: 10px; }
</style>
</head>
<body>
${buildIconPaletteHtml()}
<div class="page">
  ${buildRmHeader(stage, rows)}
  <div class="filter-note">${flaggedRows.size > 0 ? `⚠ ${flaggedRows.size} row(s) highlighted (possible U-turn). ` : ""}Drag icons from the palette onto any tulip cell · double-click a dropped icon to remove it · click any Note cell to edit text</div>
  <table class="roadbook">
    <thead>
      <tr>
        <th class="col-total">Total</th>
        <th class="col-partial">Partial</th>
        <th class="col-rowno">#</th>
        <th class="col-tulip">Tulip</th>
        <th class="col-cap">CAP</th>
        <th class="col-note">Note — click to edit</th>
        <th class="col-gps">GPS</th>
      </tr>
    </thead>
    <tbody>${rowHtml}</tbody>
  </table>
</div>
${buildDragDropJs()}
</body>
</html>`;
}

// Nav icons appear as a corner badge confirming the tulip.
// All other icons (hazard, control, note) overlay the tulip as the primary symbol.
const NAV_ICON_IDS = new Set(["left","right","keep_l","keep_r","straight","caution","gate","cattle_gate"]);

function buildTulipCell(row) {
  const tulip   = renderTulipSvg(row.tulipTemplate || row.eventType, { angle: row.angle });
  const iconDef = row.icon ? ICON_BY_ID[row.icon] : null;

  if (!iconDef) {
    // No icon — plain tulip
    return `<div class="tulip-box"><div class="tulip-wrap"><div class="tulip-diagram">${tulip}</div></div></div>`;
  }

  if (NAV_ICON_IDS.has(row.icon)) {
    // Corner badge: tulip at full opacity, small icon bottom-right
    return `<div class="tulip-box"><div class="tulip-wrap">` +
      `<div class="tulip-diagram">${tulip}</div>` +
      `<div class="tulip-icon-corner" title="${escapeHtml(iconDef.label)}">${iconDef.svg}</div>` +
      `</div></div>`;
  }

  // Overlay: icon centred, tulip dimmed behind
  return `<div class="tulip-box"><div class="tulip-wrap tulip-has-overlay">` +
    `<div class="tulip-diagram">${tulip}</div>` +
    `<div class="tulip-icon-overlay" title="${escapeHtml(iconDef.label)}">${iconDef.svg}</div>` +
    `</div></div>`;
}

function buildRow(row, index, next, flagged) {
  const total    = formatKm(row.kmTotal);
  const partial  = formatKm(row.kmPartial);
  const cap      = formatCap(row, next);
  const gps      = formatGps(row.lat, row.lon);
  const isManual = Boolean(row.icon);
  const modeClass = isManual ? "manual" : "derived";
  const flagClass = flagged ? " flagged" : "";

  const noteText    = row.notes || humanize(row.eventType);
  const reviewBadge = flagged ? `<span class="review-badge">REVIEW</span> ` : "";

  const debugStr = [
    row.icon ? `<span class="badge">${escapeHtml(row.icon)}</span>` : `<span class="muted">${escapeHtml(row.eventType||"")}</span>`,
    `<span class="debug">Conf ${formatConf(row.confidence)}${row.angle != null ? ` · ${Math.round(row.angle)}°` : ""}</span>`,
  ].join(" ");

  return `
<tr class="rb-row${flagClass}">
  <td class="col-total"><div class="distance-box total ${modeClass}"><div class="distance-main">${total}</div></div></td>
  <td class="col-partial"><div class="distance-box partial ${modeClass}"><div class="distance-sub">${partial}</div></div></td>
  <td class="col-rowno"><div class="rowno-box">${index + 1}</div></td>
  <td class="col-tulip">${buildTulipCell(row)}</td>
  <td class="col-cap"><div class="cap-box">${cap}</div></td>
  <td class="col-note">
    <div class="note-box">
      <div class="note-main note-editable" contenteditable="true">${reviewBadge}${escapeHtml(noteText)}</div>
      <div class="note-sub">${debugStr}</div>
    </div>
  </td>
  <td class="col-gps"><div class="gps-box"><div class="gps-inner">${gps}</div></div></td>
</tr>`;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const roadbook    = stage?.roadbook;
const allRows     = roadbook?.views?.driver || roadbook?.rows || [];
const filteredRows = ensureStartRow(filterRows(allRows, minConfidence));
const flaggedRows  = flagUturnZones ? detectUTurnZones(filteredRows) : new Set();

const html = buildHtml(stage, filteredRows, flaggedRows);
fs.writeFileSync(outputPath, html, "utf8");

const suppressed = allRows.length - filteredRows.length;
console.log(`✓ ${allRows.length} rows loaded`);
if (suppressed > 0) console.log(`✓ ${filteredRows.length} rows after confidence filter (≥${minConfidence.toFixed(2)}) — ${suppressed} suppressed`);
if (flaggedRows.size > 0) console.log(`⚠ ${flaggedRows.size} row(s) flagged for review (U-turn zone)`);
console.log(`✓ ${ICON_DEFS.length} icons loaded into palette`);
console.log(`✓ Written to: ${outputPath}`);
