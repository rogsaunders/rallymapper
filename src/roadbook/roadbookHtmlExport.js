import { renderTulipSvg } from "./tulipRenderer";
import logoUrl from "../assets/fullLogo_transparent.png";
import manifest from "../icons/iconManifest.json";

// Load all icon SVGs at build time via Vite
const _svgModules = import.meta.glob("../icons/svg/*.svg", { query: "?raw", import: "default", eager: true });

const ICON_DEFS = manifest.map(d => ({
  ...d,
  svg: _svgModules[`../icons/svg/${d.file}`] ?? "",
}));

const ICON_BY_ID = Object.fromEntries(ICON_DEFS.map(d => [d.id, d]));
const ICON_CATEGORIES = [...new Set(ICON_DEFS.map(d => d.category))];

// Nav icons appear as a corner badge; all others overlay the tulip.
const NAV_ICON_IDS = new Set(["left","right","keep_l","keep_r","straight","caution","gate","cattle_gate"]);

// ─── Public export ────────────────────────────────────────────────────────────

export async function exportRoadbookHtml(stage) {
  // Inline the logo as base64 so the HTML works as a standalone file
  let logoSrc = logoUrl;
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    logoSrc = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    // Fall back to URL — works when served from the web server
  }

  const roadbook = stage?.roadbook;
  const rawRows  = roadbook?.views?.driver || roadbook?.rows || [];
  const rows     = ensureStartRow(rawRows);
  const flaggedRows = detectUTurnZones(rows);

  const title = stage?.meta?.stageName || "RouteMapper Roadbook";
  const rowHtml = rows.map((row, i) => buildRow(row, i, rows[i + 1], flaggedRows.has(i))).join("\n");

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
  #palette-spacer { display: none !important; }
  body { background: #fff; }
  .rb-row { break-inside: avoid; }
  .filter-note { display: none; }
  .no-print { display: none; }
}

/* ── Base ── */
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #f0f0f0; color: #000; }
.page { max-width: 900px; margin: 0 auto; background: #fff; padding: 10px; }

/* ── Icon Palette ── */
.palette { background: #e8e8e8; color: #111; padding: 8px 12px; border-radius: 0 0 6px 6px; position: fixed; top: 0; left: 0; right: 0; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
.palette-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-size: 12px; }
.palette-hdr small { color: #666; }
.palette-hdr button { background: #bbb; color: #111; border: none; padding: 3px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; }
.palette-body { display: flex; gap: 6px; flex-wrap: wrap; }
.ps { display: flex; align-items: flex-start; gap: 2px; border-right: 1px solid #bbb; padding-right: 6px; margin-right: 2px; }
.ps:last-child { border-right: none; }
.ps-cat { writing-mode: vertical-lr; text-orientation: mixed; transform: rotate(180deg); font-size: 9px; font-weight: 700; color: #666; letter-spacing: 0.08em; text-transform: uppercase; align-self: center; margin-right: 2px; }
.ps-icons { display: flex; flex-wrap: wrap; gap: 3px; }
.pi { display: flex; flex-direction: column; align-items: center; width: 52px; cursor: grab; padding: 3px; border-radius: 4px; border: 1px solid transparent; transition: background 0.15s, border-color 0.15s; }
.pi:hover { background: rgba(0,0,0,0.08); border-color: #999; }
.pi.dragging { opacity: 0.4; }
.pi-icon { width: 36px; height: 36px; }
.pi-icon svg { width: 36px; height: 36px; display: block; }
.pi-label { font-size: 8px; color: #444; text-align: center; margin-top: 2px; line-height: 1.2; }

/* ── RouteMapper branded header ── */
.rm-header { border: 2px solid #000; margin-bottom: 8px; }
.rm-brand-row { display: flex; align-items: stretch; border-bottom: 2px solid #000; }
.rm-brand-logo { display: flex; align-items: center; justify-content: center; padding: 12px 16px; border-right: 2px solid #000; flex: 0 0 25%; }
.rm-logo-img { height: 120px; width: auto; display: block; }
.rm-brand-stage { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 16px 24px; gap: 2px; }
.rm-hdr-line { font-size: 20px; font-weight: 700; line-height: 1.3; }
.rm-hdr-route { font-size: 22px; font-weight: 900; }
.rm-wordmark { font-size: 18px; font-weight: 900; letter-spacing: 0.1em; }
.rm-data-row { display: flex; }
.rm-stat { flex: 1; padding: 8px 12px; text-align: center; border-right: 2px solid #000; }
.rm-stat-n { display: block; font-size: 32px; font-weight: 900; line-height: 1; }
.rm-stat-l { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #444; margin-top: 2px; }
.rm-ep { flex: 1; padding: 8px 12px; text-align: center; border-right: 2px solid #000; }
.rm-ep:last-child { border-right: none; }
.rm-ep-label { font-size: 10px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: #006b6b; margin-bottom: 4px; }
.rm-ep-gps { font-size: 12px; font-weight: 700; line-height: 1.5; }

/* ── Warning block ── */
.rm-warning { border: 2px solid #000; margin-bottom: 8px; padding: 8px 12px; background: #fff; }
.rm-warning-title { font-size: 13px; font-weight: 900; text-align: center; letter-spacing: 0.08em; margin-bottom: 6px; }
.rm-warning-body { font-size: 10px; line-height: 1.5; color: #111; }
.rm-warning-body p { margin: 0 0 5px 0; }
.rm-warning-body p:last-child { margin-bottom: 0; font-weight: 700; }
@media print { .rm-warning { break-inside: avoid; } }

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
.rb-row { height: 124px; page-break-inside: avoid; }
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
.tulip-icon-corner { position: absolute; bottom: 4px; right: 4px; width: 40px; height: 40px; background: #fff; border: 1.5px solid #ccc; border-radius: 4px; padding: 2px; }
.tulip-icon-corner svg { width: 36px; height: 36px; display: block; }
.tulip-icon-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 78px; height: 78px; }
.tulip-icon-overlay svg { width: 78px; height: 78px; display: block; }
.tulip-has-overlay .tulip-diagram svg { opacity: 0.2; }

/* ── Badges ── */
.badge { display: inline-block; border: 1px solid #444; padding: 1px 5px; border-radius: 999px; font-size: 10px; font-weight: 700; }
.review-badge { display: inline-block; background: #ff9800; color: #fff; padding: 1px 5px; border-radius: 999px; font-size: 10px; font-weight: 700; }
.muted { color: #777; }
.debug { color: #888; font-size: 10px; }
</style>
</head>
<body>
${buildIconPaletteHtml()}
<div id="palette-spacer"></div>
<script>
(function(){
  var pal=document.getElementById('palette');
  var sp=document.getElementById('palette-spacer');
  if(pal&&sp) sp.style.height=(pal.offsetHeight+6)+'px';
})();
</script>
<div class="page">
  ${buildRmHeader(stage, rows, logoSrc)}
  <div class="rm-warning">
    <div class="rm-warning-title">WARNING</div>
    <div class="rm-warning-body">
      <p>THIS ROUTE MAY INVOLVE HAZARDOUS CONDITIONS. NAVIGATE THIS ROUTE AT YOUR OWN RISK.</p>
      <p>Conditions on any route can change at any time without notice. This route may pass through or lead to remote areas far from assistance. This is not a closed or controlled course. The route crosses and travels on public roads and tracks where other vehicles, pedestrians, livestock, and wildlife may be present.</p>
      <p>Some hazards have been identified in this roadbook for guidance purposes only. The absence of a hazard marker does not mean the route is safe. Most hazards are not identified or marked. All distances, bearings, and GPS coordinates are approximate and should not be treated as precise navigation data.</p>
      <p>If at any point signs, conditions, landowner instructions, or other indicators suggest the route passes through restricted, private, closed, or otherwise prohibited areas, this roadbook must not be followed into those areas.</p>
      <p>ROUTEMAPPER ACCEPTS NO RESPONSIBILITY FOR THE ACCURACY, COMPLETENESS, OR SAFETY OF THIS ROUTE. THE USER ACCEPTS FULL RESPONSIBILITY FOR THEIR OWN SAFETY AND THE SAFETY OF THEIR PASSENGERS AND VEHICLE AT ALL TIMES.</p>
    </div>
  </div>
  <div class="filter-note no-print">${flaggedRows.size > 0 ? `⚠ ${flaggedRows.size} row(s) highlighted (possible U-turn). ` : ""}Drag icons from the palette onto any tulip cell · double-click a dropped icon to remove it · click any Note cell to edit text</div>
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

// ─── Icon palette HTML ────────────────────────────────────────────────────────

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
    <span>🗂 Icon Stash &mdash; drag onto any tulip cell &nbsp;&nbsp; <small>&#x2318;P to print (palette hides automatically)</small></span>
    <div style="display:flex;gap:6px;">
      <button onclick="undoLastDrop()" id="undo-btn" disabled title="Undo last icon drop (⌘Z)">↩ Undo</button>
      <button onclick="togglePalette()" id="palette-btn">Hide</button>
    </div>
  </div>
  <div class="palette-body" id="palette-body">
    ${sections}
  </div>
</div>`;
}

// ─── Drag-drop JavaScript (inlined into output HTML) ─────────────────────────

function buildDragDropJs() {
  // Embed all icon SVGs as a JS object so they're available at runtime
  const iconSvgsJson = JSON.stringify(
    Object.fromEntries(ICON_DEFS.map(d => [d.id, d.svg]))
  );

  return `<script>
const ICON_SVGS = ${iconSvgsJson};
const NAV_IDS = new Set(['left','right','keep_l','keep_r','straight','caution','gate','cattle_gate']);
let _dragId = null;
const _undoStack = [];

function updateBodyPadding() {
  const pal = document.getElementById('palette');
  const sp  = document.getElementById('palette-spacer');
  if (pal && sp) sp.style.height = (pal.offsetHeight + 6) + 'px';
}
window.addEventListener('resize', updateBodyPadding);

function togglePalette() {
  const body = document.getElementById('palette-body');
  const btn  = document.getElementById('palette-btn');
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? '' : 'none';
  btn.textContent = hidden ? 'Hide' : 'Show';
  setTimeout(updateBodyPadding, 50);
}

function undoLastDrop() {
  if (!_undoStack.length) return;
  const { cell, wrap, newIcon, removedIcon, wasHasOverlay, wrapWasCreated } = _undoStack.pop();
  newIcon.remove();
  if (removedIcon) wrap.appendChild(removedIcon);
  if (!wasHasOverlay) wrap.classList.remove('tulip-has-overlay');
  if (wrapWasCreated && !wrap.querySelector('.dropped')) {
    while (wrap.firstChild) cell.insertBefore(wrap.firstChild, wrap);
    wrap.remove();
  }
  const undoBtn = document.getElementById('undo-btn');
  if (undoBtn) {
    undoBtn.disabled = _undoStack.length === 0;
    undoBtn.style.opacity = _undoStack.length === 0 ? '0.5' : '1';
  }
}

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undoLastDrop();
  }
});

document.querySelectorAll('.pi').forEach(item => {
  item.addEventListener('dragstart', e => {
    _dragId = item.dataset.id;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', _dragId);
    item.classList.add('dragging');
  });
  item.addEventListener('dragend', () => item.classList.remove('dragging'));
});

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

    let wrap = cell.querySelector('.tulip-wrap');
    let wrapWasCreated = false;
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'tulip-wrap';
      while (cell.firstChild) wrap.appendChild(cell.firstChild);
      cell.appendChild(wrap);
      wrapWasCreated = true;
    }

    const isNav = NAV_IDS.has(_dragId);
    const slotClass = isNav ? 'tulip-icon-corner' : 'tulip-icon-overlay';
    const wasHasOverlay = wrap.classList.contains('tulip-has-overlay');
    let removedIcon = null;
    wrap.querySelectorAll('.' + slotClass + '.dropped').forEach(el => { removedIcon = el; el.remove(); });

    if (!isNav) wrap.classList.add('tulip-has-overlay');

    const icon = document.createElement('div');
    icon.className = slotClass + ' dropped';
    icon.title = _dragId;
    icon.innerHTML = svg;
    wrap.appendChild(icon);

    _undoStack.push({ cell, wrap, newIcon: icon, removedIcon, wasHasOverlay, wrapWasCreated });

    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) { undoBtn.disabled = false; undoBtn.style.opacity = '1'; }
    _dragId = null;
  });
});

document.addEventListener('dblclick', e => {
  const dropped = e.target.closest('.dropped');
  if (dropped && dropped.closest('.tulip-box')) {
    if (dropped.classList.contains('tulip-icon-overlay')) {
      const wrap = dropped.closest('.tulip-wrap');
      if (wrap && !wrap.querySelector('.tulip-icon-overlay:not(.dropped)')) {
        wrap.classList.remove('tulip-has-overlay');
      }
    }
    dropped.remove();
    const idx = _undoStack.findIndex(u => u.newIcon === dropped);
    if (idx !== -1) _undoStack.splice(idx, 1);
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
      undoBtn.disabled = _undoStack.length === 0;
      undoBtn.style.opacity = _undoStack.length === 0 ? '0.5' : '1';
    }
  }
});
<\/script>`;
}

// ─── Header ───────────────────────────────────────────────────────────────────

function buildRmHeader(stage, rows, logoSrc) {
  const meta = stage?.meta || {};
  const lastWithKm = [...rows].reverse().find(r => Number.isFinite(Number(r.kmTotal)));
  const totalKm = lastWithKm ? Number(lastWithKm.kmTotal).toFixed(1) : "—";
  const waypointCount = rows.filter(r => r.source !== "synthetic").length;
  const firstGps = rows.find(r => r.lat != null && Number.isFinite(Number(r.lat)));
  const lastGps  = [...rows].reverse().find(r => r.lat != null && Number.isFinite(Number(r.lat)));

  const tripLine  = meta.tripName  ? `<div class="rm-hdr-line">Trip: ${escapeHtml(meta.tripName)}</div>` : "";
  const dayParts  = [meta.dayNumber && `Day ${meta.dayNumber}`, meta.stageNumber && `Stage ${meta.stageNumber}`].filter(Boolean).join(" ");
  const dayLine   = dayParts  ? `<div class="rm-hdr-line">${escapeHtml(dayParts)}</div>` : "";
  const routeLine = meta.routeName ? `<div class="rm-hdr-line rm-hdr-route">Route: ${escapeHtml(meta.routeName)}</div>` : "";

  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" class="rm-logo-img" alt="RouteMapper">`
    : `<div class="rm-wordmark">ROUTEMAPPER</div>`;

  return `<div class="rm-header">
  <div class="rm-brand-row">
    <div class="rm-brand-logo">${logoHtml}</div>
    <div class="rm-brand-stage">${tripLine}${dayLine}${routeLine}</div>
  </div>
  <div class="rm-data-row">
    <div class="rm-stat"><span class="rm-stat-n">${totalKm}</span><span class="rm-stat-l">Kilometers</span></div>
    <div class="rm-stat"><span class="rm-stat-n">${waypointCount}</span><span class="rm-stat-l">Waypoints</span></div>
    <div class="rm-ep"><div class="rm-ep-label">Start</div><div class="rm-ep-gps">${firstGps ? formatGps(firstGps.lat, firstGps.lon) : "—"}</div></div>
    <div class="rm-ep"><div class="rm-ep-label">Finish</div><div class="rm-ep-gps">${lastGps ? formatGps(lastGps.lat, lastGps.lon) : "—"}</div></div>
  </div>
</div>`;
}

// ─── Row rendering ────────────────────────────────────────────────────────────

function buildTulipCell(row) {
  const tulip   = renderTulipSvg(row.tulipTemplate || row.eventType, { angle: row.angle });
  const iconDef = row.icon ? ICON_BY_ID[row.icon] : null;

  if (!iconDef) {
    return `<div class="tulip-box"><div class="tulip-wrap"><div class="tulip-diagram">${tulip}</div></div></div>`;
  }
  if (NAV_ICON_IDS.has(row.icon)) {
    return `<div class="tulip-box"><div class="tulip-wrap">` +
      `<div class="tulip-diagram">${tulip}</div>` +
      `<div class="tulip-icon-corner" title="${escapeHtml(iconDef.label)}">${iconDef.svg}</div>` +
      `</div></div>`;
  }
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
    row.icon
      ? `<span class="badge">${escapeHtml(row.icon)}</span>`
      : `<span class="muted">${escapeHtml(row.eventType || "")}</span>`,
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

// ─── U-turn zone detection ────────────────────────────────────────────────────

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
      for (let k = Math.max(0, i - 1); k <= Math.min(rows.length - 1, i + 2); k++) flagged.add(k);
    }
  });
  return flagged;
}

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

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatKm(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function formatConf(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function formatCap(row, next) {
  let b = null;
  if (Number.isFinite(row?.bearingOut)) b = row.bearingOut;
  else if (Number.isFinite(next?.bearingIn)) b = next.bearingIn;
  else if (next && Number.isFinite(row?.lat) && Number.isFinite(next?.lat))
    b = bearingBetween(row.lat, row.lon, next.lat, next.lon);
  return Number.isFinite(b) ? `${Math.round(((b % 360) + 360) % 360)}°` : "";
}

function formatGps(lat, lon) {
  if (lat == null || lon == null) return "";
  const latN = Number(lat), lonN = Number(lon);
  if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return "";
  return `${toDms(latN, "lat")}<br>${toDms(lonN, "lon")}`;
}

function toDms(v, kind) {
  const abs = Math.abs(v), deg = Math.floor(abs);
  const mFull = (abs - deg) * 60, min = Math.floor(mFull);
  const sec = ((mFull - min) * 60).toFixed(3);
  const hemi = kind === "lat" ? (v >= 0 ? "N" : "S") : (v >= 0 ? "E" : "W");
  return `${deg}°${String(min).padStart(2, "0")}.${sec}'${hemi}`;
}

function bearingBetween(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const dLon  = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return Math.atan2(y, x) * 180 / Math.PI;
}

function humanize(v) {
  return String(v || "note").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
