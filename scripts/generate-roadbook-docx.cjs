'use strict';
/**
 * RouteMapper — Roadbook DOCX generator
 *
 * Reads a _roadbook.json (or _stage.json) and writes a print-ready,
 * fully editable Word document.
 *
 * Usage:
 *   node scripts/generate-roadbook-docx.cjs <roadbook.json> [output.docx]
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, AlignmentType, BorderStyle, WidthType, ShadingType,
  VerticalAlign, HeightRule,
} = require('docx');

const fs   = require('fs');
const path = require('path');

// ─── Icon loading ─────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..');
const ICON_SVG_DIR = path.join(REPO_ROOT, 'src/icons/svg');
const FALLBACK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144"><rect x="4" y="4" width="136" height="136" rx="8" fill="#eee" stroke="#999" stroke-width="8"/></svg>';

let ICON_DEFS = [];
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'src/icons/iconManifest.json'), 'utf8'));
  ICON_DEFS = manifest.map(d => {
    let svg = FALLBACK_SVG;
    try { svg = fs.readFileSync(path.join(ICON_SVG_DIR, d.file), 'utf8').trim(); } catch (_) {}
    return { ...d, svg };
  });
} catch (_) {
  console.warn('⚠ Could not load iconManifest.json — icons will be unavailable');
}

const ICON_BY_ID = Object.fromEntries(ICON_DEFS.map(d => [d.id, d]));

// ─── Args ────────────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
let inputArg, outputArg;
let minConfidence = 0.70;
let flagUturnZones = true;

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--min-confidence' && rawArgs[i + 1]) {
    minConfidence = parseFloat(rawArgs[++i]);
  } else if (rawArgs[i] === '--no-filter') {
    minConfidence = 0;
  } else if (rawArgs[i] === '--no-flag-uturns') {
    flagUturnZones = false;
  } else if (!inputArg) {
    inputArg = rawArgs[i];
  } else if (!outputArg) {
    outputArg = rawArgs[i];
  }
}

if (!inputArg) {
  console.error('Usage: node generate-roadbook-docx.cjs <roadbook.json> [output.docx] [--min-confidence 0.70] [--no-filter]');
  process.exit(1);
}

const inputPath  = path.resolve(inputArg);
const outputPath = outputArg
  ? path.resolve(outputArg)
  : inputPath.replace(/_roadbook\.json$/, '_roadbook.docx').replace(/\.json$/, '.docx');

// ─── Load & normalise ────────────────────────────────────────────────────────

const loaded = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const stage   = loaded.roadbook ? loaded : { meta: loaded.meta, roadbook: loaded };
const roadbook = stage.roadbook;
const allRows = (roadbook.views && roadbook.views.driver) || roadbook.rows || [];
const meta    = stage.meta || {};
const title   = meta.stageName || 'RouteMapper Roadbook';

// ─── Start row ───────────────────────────────────────────────────────────────

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
    const toRad = d => d * Math.PI / 180;
    const dLon  = toRad(rows[1].lon - first.lon);
    const y = Math.sin(dLon) * Math.cos(toRad(rows[1].lat));
    const x = Math.cos(toRad(first.lat)) * Math.sin(toRad(rows[1].lat)) -
              Math.sin(toRad(first.lat)) * Math.cos(toRad(rows[1].lat)) * Math.cos(dLon);
    angle = Math.atan2(y, x) * 180 / Math.PI;
  }

  return [
    { kmTotal: 0, kmPartial: 0, icon: 'start', eventType: 'straight', angle, notes: 'Start', lat: null, lon: null, confidence: 1, source: 'synthetic' },
    ...rows,
  ];
}

// ─── Row filtering ───────────────────────────────────────────────────────────

function filterRows(rows, threshold) {
  return rows.filter(row => {
    if (row.icon) return true;
    if (row.eventType === 'note') return true;
    if (row.source === 'manual') return true;
    return (row.confidence || 0) >= threshold;
  });
}

function detectUTurnZones(rows) {
  const flagged = new Set();

  const hairpins = rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) =>
      (row.eventType === 'hairpin_right' || row.eventType === 'hairpin_left') && !row.icon
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
      for (let k = Math.max(0, i - 1); k <= Math.min(rows.length - 1, i + 2); k++) {
        flagged.add(k);
      }
    }
  });

  return flagged;
}

const rows      = ensureStartRow(filterRows(allRows, minConfidence));
const flaggedRows = flagUturnZones ? detectUTurnZones(rows) : new Set();

// ─── Tulip SVG renderer ──────────────────────────────────────────────────────

function renderTulipSvg(eventType, opts) {
  opts = opts || {};
  const size  = opts.size || 120;
  const c     = size / 2;
  const s     = opts.strokeWidth || 10;
  const angle = (opts.angle != null) ? opts.angle : null;

  if (angle !== null) return renderAngleTulip(size, c, s, angle);

  switch (eventType) {
    case 'right_90':    return wrap(size, seg(c,size,c,c,s) + exitSeg(c,c,size,c,s));
    case 'left_90':     return wrap(size, seg(c,size,c,c,s) + exitSeg(c,c,0,c,s));
    case 'sharp_right': return wrap(size, seg(c,size,c,c+10,s) + exitSeg(c,c+10,size-10,20,s));
    case 'sharp_left':  return wrap(size, seg(c,size,c,c+10,s) + exitSeg(c,c+10,10,20,s));
    case 'bear_right':  return wrap(size, seg(c,size,c,c+10,s) + exitSeg(c,c+10,c+35,20,s));
    case 'bear_left':   return wrap(size, seg(c,size,c,c+10,s) + exitSeg(c,c+10,c-35,20,s));
    case 'hairpin_right': return wrap(size,
      `<path d="M ${c} ${size} L ${c} ${c+20} Q ${c} 20 ${size-20} 20 L ${size-20} ${c}" fill="none" stroke="black" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round"/>` +
      arrowHead(size-20, 20, size-20, c, s));
    case 'hairpin_left':  return wrap(size,
      `<path d="M ${c} ${size} L ${c} ${c+20} Q ${c} 20 20 20 L 20 ${c}" fill="none" stroke="black" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round"/>` +
      arrowHead(20, 20, 20, c, s));
    default: return wrap(size, exitSeg(c,size,c,10,s));
  }
}

function renderAngleTulip(size, c, s, angle) {
  const arm = c - 10;
  const rad = angle * Math.PI / 180;
  const ex  = r2(c + arm * Math.sin(rad));
  const ey  = r2(c - arm * Math.cos(rad));

  if (Math.abs(angle) > 150) {
    const lx = r2(c + (angle > 0 ? 1 : -1) * arm * 0.6);
    return wrap(size,
      `<path d="M ${c} ${size} L ${c} ${c+20} Q ${c} 10 ${ex} ${ey} L ${lx} ${c}" fill="none" stroke="black" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round"/>` +
      arrowHead(ex, ey, lx, c, s));
  }
  return wrap(size, seg(c,size,c,c,s) + exitSeg(c,c,ex,ey,s));
}

function seg(x1,y1,x2,y2,s) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="${s}" stroke-linecap="round"/>`;
}
function exitSeg(x1,y1,x2,y2,s) { return seg(x1,y1,x2,y2,s) + arrowHead(x1,y1,x2,y2,s); }
function arrowHead(x1,y1,x2,y2,s) {
  const angle = Math.atan2(y2-y1, x2-x1);
  const sz = s * 1.8, b = 2.45;
  return `<polygon points="${r2(x2)},${r2(y2)} ${r2(x2+sz*Math.cos(angle+b))},${r2(y2+sz*Math.sin(angle+b))} ${r2(x2+sz*Math.cos(angle-b))},${r2(y2+sz*Math.sin(angle-b))}" fill="black"/>`;
}
function r2(n)  { return Math.round(n * 100) / 100; }
function wrap(size, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect x="0" y="0" width="${size}" height="${size}" fill="white"/>${inner}</svg>`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtKm(v) {
  const n = Number(v || 0);
  return isFinite(n) ? n.toFixed(2) : '';
}

function fmtCap(row, nextRow) {
  let bearing = null;
  if (row && Number.isFinite(row.bearingOut))         bearing = row.bearingOut;
  else if (nextRow && Number.isFinite(nextRow.bearingIn)) bearing = nextRow.bearingIn;
  else if (nextRow && Number.isFinite(row.lat) && Number.isFinite(row.lon) &&
           Number.isFinite(nextRow.lat) && Number.isFinite(nextRow.lon)) {
    const toRad = d => d * Math.PI / 180;
    const dLon  = toRad(nextRow.lon - row.lon);
    const y = Math.sin(dLon) * Math.cos(toRad(nextRow.lat));
    const x = Math.cos(toRad(row.lat)) * Math.sin(toRad(nextRow.lat)) -
              Math.sin(toRad(row.lat)) * Math.cos(toRad(nextRow.lat)) * Math.cos(dLon);
    bearing = Math.atan2(y, x) * 180 / Math.PI;
  }
  if (!Number.isFinite(bearing)) return '';
  return Math.round(((bearing % 360) + 360) % 360) + '\u00b0';
}

function fmtGps(lat, lon) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return [''];
  return [toDms(lat, 'lat'), toDms(lon, 'lon')];
}

function toDms(value, kind) {
  const abs     = Math.abs(value);
  const deg     = Math.floor(abs);
  const minFull = (abs - deg) * 60;
  const min     = Math.floor(minFull);
  const sec     = ((minFull - min) * 60).toFixed(3);
  const hemi    = kind === 'lat' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  return `${deg}\u00b0${String(min).padStart(2,'0')}.${sec}'${hemi}`;
}

function humanize(v) {
  return String(v || 'note').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Minimal PNG fallback for SVG ImageRun ───────────────────────────────────
// Modern Word (2016+) renders the SVG directly; this 1×1 white PNG satisfies
// the docx library's requirement for a raster fallback in older viewers.
const FALLBACK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=',
  'base64'
);

// ─── Layout constants ────────────────────────────────────────────────────────
// A4 portrait: 11906 x 16838 DXA.  Margins: 10 mm = 567 DXA each side.
// Content width: 11906 - 567*2 = 10772 DXA

const MARGIN = 567;
const PAGE_W = 11906;
const CW     = PAGE_W - MARGIN * 2; // 10772

// Column widths — must sum to CW (10772)
const COL = {
  total:   1000,  // 0.69"
  partial: 1000,
  rowno:    480,  // 0.33"
  tulip:   1440,  // 1"
  cap:      720,  // 0.5"
  notes:   4532,  // ~3.15" — the editorial column
  gps:     1600,  // ~1.11"
};
// 1000+1000+480+1440+720+4532+1600 = 10772 ✓

const BD = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const BORDERS = { top: BD, bottom: BD, left: BD, right: BD };

// ─── Cell builders ───────────────────────────────────────────────────────────

function hdrCell(text, width) {
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: '111111', type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18, font: 'Arial' })],
    })],
  });
}

function dataCell(children, width, opts) {
  opts = opts || {};
  if (!Array.isArray(children)) children = [children];
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: opts.fill || 'FFFFFF', type: ShadingType.CLEAR },
    verticalAlign: opts.valign || VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children,
  });
}

// ─── Build rows ──────────────────────────────────────────────────────────────

const headerRow = new TableRow({
  tableHeader: true,
  children: [
    hdrCell('Total',   COL.total),
    hdrCell('Partial', COL.partial),
    hdrCell('#',       COL.rowno),
    hdrCell('Tulip',   COL.tulip),
    hdrCell('CAP',     COL.cap),
    hdrCell('Notes',   COL.notes),
    hdrCell('GPS',     COL.gps),
  ],
});

const dataRows = rows.map((row, i) => {
  const nextRow  = rows[i + 1] || null;
  const isManual = Boolean(row.icon);
  const isFlagged = flaggedRows.has(i);
  const distFill = isManual ? 'FFF200' : 'EFEFEF';
  const noteFill = isFlagged ? 'FFF3CD' : 'FFFFFF';

  // Tulip SVG → Buffer for ImageRun
  const svgStr = renderTulipSvg(row.tulipTemplate || row.eventType, { angle: row.angle });
  const svgBuf = Buffer.from(svgStr, 'utf8');

  const noteText = (isFlagged ? '\u26a0 REVIEW  ' : '') + (row.notes || humanize(row.eventType));
  const subText  = [
    row.icon ? row.icon : (row.eventType || ''),
    Number.isFinite(row.confidence) ? 'conf ' + Number(row.confidence).toFixed(2) : '',
    row.angle != null ? Math.round(row.angle) + '\u00b0' : '',
  ].filter(Boolean).join('  \u2009');

  const gpsParts = fmtGps(row.lat, row.lon);

  return new TableRow({
    height: { value: 1800, rule: HeightRule.ATLEAST },
    children: [
      // Total km
      dataCell(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: fmtKm(row.kmTotal), bold: true, size: 52, font: 'Arial' })] }),
        COL.total, { fill: distFill, valign: VerticalAlign.TOP }
      ),
      // Partial km
      dataCell(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: fmtKm(row.kmPartial), bold: true, size: 44, font: 'Arial' })] }),
        COL.partial, { fill: distFill, valign: VerticalAlign.BOTTOM }
      ),
      // Row number (black bg, white text)
      dataCell(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(i + 1), bold: true, size: 36, color: 'FFFFFF', font: 'Arial' })] }),
        COL.rowno, { fill: '000000', valign: VerticalAlign.BOTTOM }
      ),
      // Tulip diagram (+ icon if set)
      (() => {
        const iconDef  = row.icon ? ICON_BY_ID[row.icon] : null;
        const isNavIcon = iconDef && iconDef.category === 'Nav';
        const iconBuf  = iconDef ? Buffer.from(iconDef.svg, 'utf8') : null;
        const iconImg  = (size) => new ImageRun({
          type: 'svg', data: iconBuf, fallback: { type: 'png', data: FALLBACK_PNG },
          transformation: { width: size, height: size },
          altText: { title: iconDef.label, description: iconDef.label, name: iconDef.label },
        });
        const tulipImg = (size) => new ImageRun({
          type: 'svg', data: svgBuf, fallback: { type: 'png', data: FALLBACK_PNG },
          transformation: { width: size, height: size },
          altText: { title: 'Tulip', description: 'Turn diagram', name: 'Tulip' },
        });

        let children;
        if (!iconDef) {
          // No icon — plain tulip
          children = [new Paragraph({ alignment: AlignmentType.CENTER, children: [tulipImg(90)] })];
        } else if (isNavIcon) {
          // Corner style: full tulip + small nav icon below as confirmation
          children = [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [tulipImg(80)] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [iconImg(36)] }),
          ];
        } else {
          // Overlay style: icon is primary, tulip shown small below
          children = [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [iconImg(72)] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [tulipImg(44)] }),
          ];
        }
        return dataCell(children, COL.tulip, { fill: 'F3F3F3' });
      })(),
      // CAP bearing
      dataCell(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: fmtCap(row, nextRow), bold: true, size: 40, font: 'Arial' })] }),
        COL.cap, { fill: 'FFF35A', valign: VerticalAlign.BOTTOM }
      ),
      // Notes (editorial column — wide, editable)
      new TableCell({
        borders: BORDERS,
        width: { size: COL.notes, type: WidthType.DXA },
        shading: { fill: noteFill, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 140, right: 140 },
        children: [
          new Paragraph({ children: [new TextRun({ text: noteText, bold: true, size: 32, font: 'Arial' })] }),
          new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: subText, size: 16, color: '888888', font: 'Arial' })] }),
        ],
      }),
      // GPS coordinates
      new TableCell({
        borders: BORDERS,
        width: { size: COL.gps, type: WidthType.DXA },
        shading: { fill: 'FFFFFF', type: ShadingType.CLEAR },
        verticalAlign: VerticalAlign.BOTTOM,
        margins: { top: 80, bottom: 80, left: 80, right: 80 },
        children: gpsParts.map(line =>
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: line, size: 16, font: 'Arial Narrow' })] })
        ),
      }),
    ],
  });
});

// ─── Branded header ──────────────────────────────────────────────────────────

let RM_LOGO_PNG_BUF = FALLBACK_PNG;
try {
  RM_LOGO_PNG_BUF = fs.readFileSync(path.join(REPO_ROOT, 'website/assets/RouteMapper-Logo-Pack/Full Colour/fullLogo_transparent.png'));
} catch (_) { /* use fallback */ }

function buildDocxHeader() {
  const lastWithKm = [...rows].reverse().find(r => Number.isFinite(Number(r.kmTotal)));
  const totalKm    = lastWithKm ? Number(lastWithKm.kmTotal).toFixed(1) : '—';
  const waypointCount = rows.filter(r => r.source !== 'synthetic').length;

  const firstGps = rows.find(r => Number.isFinite(Number(r.lat)));
  const lastGps  = [...rows].reverse().find(r => Number.isFinite(Number(r.lat)));
  const startParts  = firstGps ? fmtGps(firstGps.lat,  firstGps.lon)  : ['—'];
  const finishParts = lastGps  ? fmtGps(lastGps.lat,   lastGps.lon)   : ['—'];

  const metaLines = [
    ['Trip',  meta.tripName],
    ['Route', meta.routeName],
    ['Day',   meta.dayNumber],
    ['Stage', meta.stageNumber],
    ['Date',  meta.tripDate],
  ].filter(([, v]) => v != null && v !== '');

  const BD2 = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const hdrBorders = { top: BD2, bottom: BD2, left: BD2, right: BD2 };

  const COL1 = 2400, COL2 = CW - COL1; // 2400 + 8372 = 10772

  // Logo image: 1280×1024 native → display at 140×112 pt
  const logoImg = new ImageRun({
    type: 'png', data: RM_LOGO_PNG_BUF,
    transformation: { width: 140, height: 112 },
    altText: { title: 'RouteMapper', description: 'RouteMapper logo', name: 'RM Logo' },
  });

  // Row 1: Logo (left) | Stage name (right) — combined, taller row
  const brandRow = new TableRow({ children: [
    new TableCell({
      borders: hdrBorders,
      width: { size: COL1, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [logoImg] })],
    }),
    new TableCell({
      borders: hdrBorders,
      width: { size: COL2, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      shading: { fill: 'F8F8F8', type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 160, right: 160 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: title, bold: true, size: 40, font: 'Arial' })],
      })],
    }),
  ]});

  // Row 2: Stats (left) | Meta (right)
  const statsCell = new TableCell({
    borders: hdrBorders,
    width: { size: COL1, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: totalKm, bold: true, size: 52, font: 'Arial' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'KILOMETRES', size: 14, font: 'Arial', color: '444444' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: [new TextRun({ text: String(waypointCount), bold: true, size: 52, font: 'Arial' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'WAYPOINTS', size: 14, font: 'Arial', color: '444444' })] }),
    ],
  });

  const metaCell = new TableCell({
    borders: hdrBorders,
    width: { size: COL2, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 160, right: 120 },
    children: metaLines.length ? metaLines.map(([k, v]) => new Paragraph({
      children: [
        new TextRun({ text: k + ':  ', bold: true, size: 20, font: 'Arial' }),
        new TextRun({ text: String(v), size: 20, font: 'Arial' }),
      ],
    })) : [new Paragraph({ children: [] })],
  });

  const dataRow = new TableRow({ children: [statsCell, metaCell] });

  // Row 4: Start / Finish GPS (2 equal cells)
  const gpsHalf = Math.floor(CW / 2);
  const makeGpsCell = (label, parts) => new TableCell({
    borders: hdrBorders,
    width: { size: gpsHalf, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: label, bold: true, size: 20, color: '006b6b', font: 'Arial', characterSpacing: 80 })] }),
      ...parts.map(p => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: p, bold: true, size: 20, font: 'Arial Narrow' })] })),
    ],
  });

  const gpsRow = new TableRow({ children: [
    makeGpsCell('START',  startParts),
    makeGpsCell('FINISH', finishParts),
  ]});

  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [COL1, COL2],
    rows: [brandRow, dataRow, gpsRow],
  });
}

// ─── Icon appendix ────────────────────────────────────────────────────────────
// Last page: grid of all icons with labels for copy-paste reference.

const APPENDIX_COLS = 4;
const iconCellW = Math.floor(CW / APPENDIX_COLS); // ~2693 DXA each

function iconAppendixRows() {
  const appRows = [];
  const categories = ['Note', 'Hazard', 'Nav', 'Control'];

  for (const cat of categories) {
    const icons = ICON_DEFS.filter(d => d.category === cat);

    // Category header spanning all columns
    appRows.push(new TableRow({
      children: [new TableCell({
        borders: BORDERS,
        width: { size: CW, type: WidthType.DXA },
        columnSpan: APPENDIX_COLS,
        shading: { fill: '333333', type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 140, right: 140 },
        children: [new Paragraph({
          children: [new TextRun({ text: cat.toUpperCase(), bold: true, color: 'FFFFFF', size: 22, font: 'Arial' })],
        })],
      })],
    }));

    // Icons in rows of APPENDIX_COLS
    for (let i = 0; i < icons.length; i += APPENDIX_COLS) {
      const chunk = icons.slice(i, i + APPENDIX_COLS);
      // Pad to full row
      while (chunk.length < APPENDIX_COLS) chunk.push(null);

      appRows.push(new TableRow({
        height: { value: 1440, rule: HeightRule.ATLEAST },
        children: chunk.map(d => new TableCell({
          borders: BORDERS,
          width: { size: iconCellW, type: WidthType.DXA },
          shading: { fill: d ? 'FAFAFA' : 'F0F0F0', type: ShadingType.CLEAR },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: d ? [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({
                type: 'svg',
                data: Buffer.from(d.svg, 'utf8'),
                fallback: { type: 'png', data: FALLBACK_PNG },
                transformation: { width: 64, height: 64 },
                altText: { title: d.label, description: d.label, name: d.label },
              })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 40 },
              children: [new TextRun({ text: d.label, bold: true, size: 20, font: 'Arial' })],
            }),
          ] : [new Paragraph({ children: [] })],
        })),
      }));
    }
  }
  return appRows;
}

// ─── Document ────────────────────────────────────────────────────────────────

const doc = new Document({
  creator: 'RouteMapper',
  title,
  sections: [
    // ── Section 1: Roadbook ──
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: 16838 },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children: [
        buildDocxHeader(),
        new Paragraph({ spacing: { before: 120 }, children: [] }),
        new Table({
          width: { size: CW, type: WidthType.DXA },
          columnWidths: [COL.total, COL.partial, COL.rowno, COL.tulip, COL.cap, COL.notes, COL.gps],
          rows: [headerRow, ...dataRows],
        }),
      ],
    },
    // ── Section 2: Icon Reference ──
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: 16838 },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children: [
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: 'Icon Reference', bold: true, size: 40, font: 'Arial' })],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: 'Copy any icon and paste it into the Notes column above. Double-click a copied icon to select it.', size: 18, color: '555555', font: 'Arial' })],
        }),
        new Table({
          width: { size: CW, type: WidthType.DXA },
          columnWidths: Array(APPENDIX_COLS).fill(iconCellW),
          rows: iconAppendixRows(),
        }),
      ],
    },
  ],
});

// ─── Write ───────────────────────────────────────────────────────────────────

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  const suppressed = allRows.length - rows.length;
  console.log(`\u2713 ${allRows.length} rows loaded`);
  if (suppressed > 0) {
    console.log(`\u2713 ${rows.length} rows after confidence filter (\u2265${minConfidence.toFixed(2)}) \u2014 ${suppressed} suppressed`);
  }
  if (flaggedRows.size > 0) {
    console.log(`\u26a0 ${flaggedRows.size} row(s) flagged for review (possible U-turn section)`);
  }
  console.log(`\u2713 Written to: ${outputPath}`);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
