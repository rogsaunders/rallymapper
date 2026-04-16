import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import logoUrl from "../../assets/fullLogo_transparent.png";
import manifest from "../../icons/iconManifest.json";

// Load all icon SVGs at build time via Vite
const _svgModules = import.meta.glob("../../icons/svg/*.svg", { query: "?raw", import: "default", eager: true });

const ICON_DEFS = manifest.map(d => ({
  ...d,
  svg: _svgModules[`../../icons/svg/${d.file}`] ?? "",
}));

const ICON_BY_ID = Object.fromEntries(ICON_DEFS.map(d => [d.id, d]));

// Minimal 1×1 white PNG as fallback for SVG ImageRun in older Word viewers
const FALLBACK_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";
const FALLBACK_PNG = Uint8Array.from(atob(FALLBACK_PNG_B64), c => c.charCodeAt(0));

// ─── Layout constants ─────────────────────────────────────────────────────────
// A4 portrait: 11906 × 16838 DXA. Margins 10 mm = 567 DXA. Content width 10772 DXA.
const MARGIN = 567;
const PAGE_W = 11906;
const CW     = PAGE_W - MARGIN * 2; // 10772

const COL = {
  total:    900,  // ~0.63"
  partial:  900,  // ~0.63"
  rowno:    440,  // ~0.31"
  tulip:   2160,  // ~1.50" — wider for clear tulip diagrams
  cap:      540,  // ~0.38"
  notes:   4312,  // ~3.00" — editorial column
  gps:     1520,  // ~1.06"
}; // 900+900+440+2160+540+4312+1520 = 10772 ✓

const BD       = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const BORDERS  = { top: BD, bottom: BD, left: BD, right: BD };
const APPENDIX_COLS = 4;

// ─── Public export ────────────────────────────────────────────────────────────

export async function exportRoadbookDocx(stage) {
  const roadbook = stage?.roadbook;
  const allRows  = roadbook?.views?.driver || roadbook?.rows || [];
  const rows     = ensureStartRow(allRows);
  const flaggedRows = detectUTurnZones(rows);
  const meta     = stage?.meta || {};
  const title    = meta.stageName || "RouteMapper Roadbook";

  // Fetch logo PNG for the header
  let logoPngData = FALLBACK_PNG;
  try {
    const res = await fetch(logoUrl);
    const ab  = await res.arrayBuffer();
    logoPngData = new Uint8Array(ab);
  } catch {
    // Use fallback
  }

  const headerTables  = buildDocxHeader(rows, meta, logoPngData);
  const warningTable  = buildDocxWarning();
  const roadbookTable = buildRoadbookTable(rows, flaggedRows, meta, title);
  const appendixTable = buildIconAppendix();

  const doc = new Document({
    creator: "RouteMapper",
    title,
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: 16838 },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
          },
        },
        children: [
          ...headerTables,
          warningTable,
          new Paragraph({ spacing: { before: 120 }, children: [] }),
          roadbookTable,
        ],
      },
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
            children: [new TextRun({ text: "Icon Reference", bold: true, size: 40, font: "Arial" })],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: "All available icons grouped by category.", size: 18, color: "555555", font: "Arial" })],
          }),
          appendixTable,
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

// ─── Header ───────────────────────────────────────────────────────────────────

function buildDocxHeader(rows, meta, logoPngData) {
  const lastWithKm = [...rows].reverse().find(r => Number.isFinite(Number(r.kmTotal)));
  const totalKm    = lastWithKm ? Number(lastWithKm.kmTotal).toFixed(1) : "—";
  const waypointCount = rows.filter(r => r.source !== "synthetic").length;
  const firstGps = rows.find(r => r.lat != null && Number.isFinite(Number(r.lat)));
  const lastGps  = [...rows].reverse().find(r => r.lat != null && Number.isFinite(Number(r.lat)));
  const startParts  = firstGps ? fmtGps(firstGps.lat, firstGps.lon) : ["—"];
  const finishParts = lastGps  ? fmtGps(lastGps.lat,  lastGps.lon)  : ["—"];

  const BD2 = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const hdrBorders = { top: BD2, bottom: BD2, left: BD2, right: BD2 };
  const Q = Math.floor(CW / 4);
  const COL1 = Q, COL2 = CW - COL1;

  const logoImg = new ImageRun({
    type: "png",
    data: logoPngData,
    transformation: { width: 140, height: 88 },
    altText: { title: "RouteMapper", description: "RouteMapper logo", name: "RM Logo" },
  });

  const tripText  = meta.tripName  ? `Trip: ${meta.tripName}`   : null;
  const dayParts  = [meta.dayNumber && `Day ${meta.dayNumber}`, meta.stageNumber && `Stage ${meta.stageNumber}`].filter(Boolean).join(" ");
  const routeText = meta.routeName ? `Route: ${meta.routeName}` : (meta.stageName || null);

  const stageInfoParas = [
    tripText  && new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: tripText,  bold: true, size: 28, font: "Arial" })] }),
    dayParts  && new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: dayParts,  bold: true, size: 28, font: "Arial" })] }),
    routeText && new Paragraph({ spacing: { before: 0, after: 0  }, children: [new TextRun({ text: routeText, bold: true, size: 28, font: "Arial" })] }),
  ].filter(Boolean);

  const brandTable = new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [COL1, COL2],
    rows: [new TableRow({ children: [
      new TableCell({
        borders: hdrBorders, width: { size: COL1, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [logoImg] })],
      }),
      new TableCell({
        borders: hdrBorders, width: { size: COL2, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 160, right: 160 },
        children: stageInfoParas.length ? stageInfoParas : [new Paragraph({ children: [] })],
      }),
    ]})],
  });

  const makeStatCell = (num, lbl) => new TableCell({
    borders: hdrBorders, width: { size: Q, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: num,  bold: true, size: 52, font: "Arial" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: lbl,  size: 14,   font: "Arial", color: "444444" })] }),
    ],
  });

  const makeGpsCell = (label, parts) => new TableCell({
    borders: hdrBorders, width: { size: Q, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: label, bold: true, size: 20, color: "006b6b", font: "Arial", characterSpacing: 80 })] }),
      ...parts.map(p => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: p, bold: true, size: 20, font: "Arial Narrow" })] })),
    ],
  });

  const statsGpsTable = new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [Q, Q, Q, Q],
    rows: [new TableRow({ children: [
      makeStatCell(totalKm, "KILOMETERS"),
      makeStatCell(String(waypointCount), "WAYPOINTS"),
      makeGpsCell("START",  startParts),
      makeGpsCell("FINISH", finishParts),
    ]})],
  });

  return [brandTable, statsGpsTable];
}

// ─── Warning block ────────────────────────────────────────────────────────────

function buildDocxWarning() {
  const BD2 = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const borders = { top: BD2, bottom: BD2, left: BD2, right: BD2 };
  const p = (text, bold = false, size = 14) =>
    new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text, bold, size, font: "Arial" })] });

  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [CW],
    rows: [new TableRow({ children: [new TableCell({
      borders,
      margins: { top: 80, bottom: 80, left: 160, right: 160 },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 }, children: [new TextRun({ text: "WARNING", bold: true, size: 22, font: "Arial", characterSpacing: 80 })] }),
        p("THIS ROUTE MAY INVOLVE HAZARDOUS CONDITIONS. NAVIGATE THIS ROUTE AT YOUR OWN RISK.", true, 14),
        p("Conditions on any route can change at any time without notice. This route may pass through or lead to remote areas far from assistance. This is not a closed or controlled course. The route crosses and travels on public roads and tracks where other vehicles, pedestrians, livestock, and wildlife may be present."),
        p("Some hazards have been identified in this roadbook for guidance purposes only. The absence of a hazard marker does not mean the route is safe. Most hazards are not identified or marked. All distances, bearings, and GPS coordinates are approximate and should not be treated as precise navigation data."),
        p("If at any point signs, conditions, landowner instructions, or other indicators suggest the route passes through restricted, private, closed, or otherwise prohibited areas, this roadbook must not be followed into those areas."),
        new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "ROUTEMAPPER ACCEPTS NO RESPONSIBILITY FOR THE ACCURACY, COMPLETENESS, OR SAFETY OF THIS ROUTE. THE USER ACCEPTS FULL RESPONSIBILITY FOR THEIR OWN SAFETY AND THE SAFETY OF THEIR PASSENGERS AND VEHICLE AT ALL TIMES.", bold: true, size: 14, font: "Arial" })] }),
      ],
    })]})],
  });
}

// ─── Roadbook table ───────────────────────────────────────────────────────────

function buildInfoRow(meta, title) {
  const dayPart   = [meta.dayNumber   && `Day ${meta.dayNumber}`,
                     meta.stageNumber && `Stage ${meta.stageNumber}`].filter(Boolean).join("  ");
  const routePart = meta.routeName ? `Route: ${meta.routeName}` : (meta.stageName || null);
  const tripPart  = meta.tripName  ? `Trip: ${meta.tripName}`   : null;
  const labelText = [tripPart, dayPart, routePart].filter(Boolean).join("   \u2022   ") || title;

  const BD2 = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  // NOT tableHeader — a spanning columnSpan:7 row as tableHeader corrupts
  // Word's column grid on pages 2+ causing garbled content.
  return new TableRow({
    children: [new TableCell({
      borders: { top: BD2, bottom: BD2, left: BD2, right: BD2 },
      columnSpan: 7,
      width: { size: CW, type: WidthType.DXA },
      shading: { fill: "222222", type: ShadingType.CLEAR },
      margins: { top: 40, bottom: 40, left: 140, right: 140 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: labelText, bold: true, size: 18, color: "FFFFFF", font: "Arial" }),
        ],
      })],
    })],
  });
}

function buildRoadbookTable(rows, flaggedRows, meta, title) {
  const infoRow = buildInfoRow(meta, title);
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hdrCell("Total",   COL.total),
      hdrCell("Partial", COL.partial),
      hdrCell("#",       COL.rowno),
      hdrCell("Tulip",   COL.tulip),
      hdrCell("CAP",     COL.cap),
      hdrCell("Notes",   COL.notes),
      hdrCell("GPS",     COL.gps),
    ],
  });

  const dataRows = rows.map((row, i) => {
    const nextRow   = rows[i + 1] || null;
    const isManual  = Boolean(row.icon);
    const isFlagged = flaggedRows.has(i);
    const distFill  = isManual ? "FFF200" : "EFEFEF";
    const noteFill  = isFlagged ? "FFF3CD" : "FFFFFF";

    const svgStr  = renderTulipSvg(row.tulipTemplate || row.eventType, { angle: row.angle });
    const svgData = new TextEncoder().encode(svgStr);

    const noteText = (isFlagged ? "⚠ REVIEW  " : "") + (row.notes || humanize(row.eventType));
    const subText  = [
      row.icon ? row.icon : (row.eventType || ""),
      Number.isFinite(row.confidence) ? "conf " + Number(row.confidence).toFixed(2) : "",
      row.angle != null ? Math.round(row.angle) + "°" : "",
    ].filter(Boolean).join("  \u2009");

    const gpsParts = fmtGps(row.lat, row.lon);

    const imgRun = (data, size) => new ImageRun({
      type: "svg",
      data,
      fallback: { type: "png", data: FALLBACK_PNG },
      transformation: { width: size, height: size },
      altText: { title: "Tulip", description: "Turn diagram", name: "Tulip" },
    });

    const iconDef    = row.icon ? ICON_BY_ID[row.icon] : null;
    const isNavIcon  = iconDef && iconDef.category === "Nav";
    const iconData   = iconDef ? new TextEncoder().encode(iconDef.svg) : null;
    const iconImgRun = (size) => iconData ? new ImageRun({
      type: "svg",
      data: iconData,
      fallback: { type: "png", data: FALLBACK_PNG },
      transformation: { width: size, height: size },
      altText: { title: iconDef.label, description: iconDef.label, name: iconDef.label },
    }) : null;

    let tulipCellChildren;
    if (!iconDef) {
      tulipCellChildren = [new Paragraph({ alignment: AlignmentType.CENTER, children: [imgRun(svgData, 90)] })];
    } else if (isNavIcon) {
      tulipCellChildren = [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [imgRun(svgData, 80)] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [iconImgRun(36)] }),
      ];
    } else {
      tulipCellChildren = [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [iconImgRun(72)] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [imgRun(svgData, 44)] }),
      ];
    }

    return new TableRow({
      height: { value: 1800, rule: HeightRule.ATLEAST },
      children: [
        dataCell(
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: fmtKm(row.kmTotal), bold: true, size: 52, font: "Arial" })] }),
          COL.total, { fill: distFill, valign: VerticalAlign.TOP }
        ),
        dataCell(
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: fmtKm(row.kmPartial), bold: true, size: 44, font: "Arial" })] }),
          COL.partial, { fill: distFill, valign: VerticalAlign.BOTTOM }
        ),
        dataCell(
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(i + 1), bold: true, size: 36, color: "FFFFFF", font: "Arial" })] }),
          COL.rowno, { fill: "000000", valign: VerticalAlign.BOTTOM }
        ),
        dataCell(tulipCellChildren, COL.tulip, { fill: "F3F3F3" }),
        dataCell(
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: fmtCap(row, nextRow), bold: true, size: 40, font: "Arial" })] }),
          COL.cap, { fill: "FFF35A", valign: VerticalAlign.BOTTOM }
        ),
        new TableCell({
          borders: BORDERS,
          width: { size: COL.notes, type: WidthType.DXA },
          shading: { fill: noteFill, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 140, right: 140 },
          children: [
            new Paragraph({ children: [new TextRun({ text: noteText, bold: true, size: 32, font: "Arial" })] }),
            new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: subText, size: 16, color: "888888", font: "Arial" })] }),
          ],
        }),
        new TableCell({
          borders: BORDERS,
          width: { size: COL.gps, type: WidthType.DXA },
          shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
          verticalAlign: VerticalAlign.BOTTOM,
          margins: { top: 80, bottom: 80, left: 80, right: 80 },
          children: gpsParts.map(line =>
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: line, size: 16, font: "Arial Narrow" })] })
          ),
        }),
      ],
    });
  });

  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [COL.total, COL.partial, COL.rowno, COL.tulip, COL.cap, COL.notes, COL.gps],
    rows: [infoRow, headerRow, ...dataRows],
  });
}

// ─── Icon appendix ────────────────────────────────────────────────────────────

function buildIconAppendix() {
  const iconCellW = Math.floor(CW / APPENDIX_COLS);
  const categories = [...new Set(ICON_DEFS.map(d => d.category))];
  const appRows = [];

  for (const cat of categories) {
    const icons = ICON_DEFS.filter(d => d.category === cat);

    appRows.push(new TableRow({
      children: [new TableCell({
        borders: BORDERS,
        width: { size: CW, type: WidthType.DXA },
        columnSpan: APPENDIX_COLS,
        shading: { fill: "333333", type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 140, right: 140 },
        children: [new Paragraph({ children: [new TextRun({ text: cat.toUpperCase(), bold: true, color: "FFFFFF", size: 22, font: "Arial" })] })],
      })],
    }));

    for (let i = 0; i < icons.length; i += APPENDIX_COLS) {
      const chunk = icons.slice(i, i + APPENDIX_COLS);
      while (chunk.length < APPENDIX_COLS) chunk.push(null);

      appRows.push(new TableRow({
        height: { value: 1440, rule: HeightRule.ATLEAST },
        children: chunk.map(d => new TableCell({
          borders: BORDERS,
          width: { size: iconCellW, type: WidthType.DXA },
          shading: { fill: d ? "FAFAFA" : "F0F0F0", type: ShadingType.CLEAR },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: d ? [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({
                type: "svg",
                data: new TextEncoder().encode(d.svg),
                fallback: { type: "png", data: FALLBACK_PNG },
                transformation: { width: d.category === "Nav" ? 36 : 72, height: d.category === "Nav" ? 36 : 72 },
                altText: { title: d.label, description: d.label, name: d.label },
              })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 40 },
              children: [new TextRun({ text: d.label, bold: true, size: 20, font: "Arial" })],
            }),
          ] : [new Paragraph({ children: [] })],
        })),
      }));
    }
  }

  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: Array(APPENDIX_COLS).fill(iconCellW),
    rows: appRows,
  });
}

// ─── Cell builders ────────────────────────────────────────────────────────────

function hdrCell(text, width) {
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: "111111", type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 18, font: "Arial" })] })],
  });
}

function dataCell(children, width, { fill, valign } = {}) {
  if (!Array.isArray(children)) children = [children];
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: fill || "FFFFFF", type: ShadingType.CLEAR },
    verticalAlign: valign || VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children,
  });
}

// ─── Tulip SVG renderer ───────────────────────────────────────────────────────

function renderTulipSvg(eventType, opts = {}) {
  const size = opts.size ?? 120;
  const c    = size / 2;
  const s    = opts.strokeWidth ?? 10;
  const angle = opts.angle ?? null;

  if (angle !== null) return renderAngleTulip(size, c, s, angle);

  switch (eventType) {
    case "right_90":      return svgWrap(size, seg(c,size,c,c,s) + exitSeg(c,c,size,c,s));
    case "left_90":       return svgWrap(size, seg(c,size,c,c,s) + exitSeg(c,c,0,c,s));
    case "sharp_right":   return svgWrap(size, seg(c,size,c,c+10,s) + exitSeg(c,c+10,size-10,20,s));
    case "sharp_left":    return svgWrap(size, seg(c,size,c,c+10,s) + exitSeg(c,c+10,10,20,s));
    case "bear_right":    return svgWrap(size, seg(c,size,c,c+10,s) + exitSeg(c,c+10,c+35,20,s));
    case "bear_left":     return svgWrap(size, seg(c,size,c,c+10,s) + exitSeg(c,c+10,c-35,20,s));
    case "hairpin_right": return svgWrap(size,
      `<path d="M ${c} ${size} L ${c} ${c+20} Q ${c} 20 ${size-20} 20 L ${size-20} ${c}" fill="none" stroke="black" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round"/>` +
      arrowHead(size-20, 20, size-20, c, s));
    case "hairpin_left":  return svgWrap(size,
      `<path d="M ${c} ${size} L ${c} ${c+20} Q ${c} 20 20 20 L 20 ${c}" fill="none" stroke="black" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round"/>` +
      arrowHead(20, 20, 20, c, s));
    default: return svgWrap(size, exitSeg(c, size, c, 10, s));
  }
}

function renderAngleTulip(size, c, s, angle) {
  const arm = c - 10;
  const rad = angle * Math.PI / 180;
  const ex  = r(c + arm * Math.sin(rad));
  const ey  = r(c - arm * Math.cos(rad));
  if (Math.abs(angle) > 150) {
    const lx = r(c + (angle > 0 ? 1 : -1) * arm * 0.6);
    return svgWrap(size,
      `<path d="M ${c} ${size} L ${c} ${c+20} Q ${c} 10 ${ex} ${ey} L ${lx} ${c}" fill="none" stroke="black" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round"/>` +
      arrowHead(ex, ey, lx, c, s));
  }
  return svgWrap(size, seg(c, size, c, c, s) + exitSeg(c, c, ex, ey, s));
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

// ─── U-turn zone detection ────────────────────────────────────────────────────

function detectUTurnZones(rows) {
  const flagged = new Set();
  const hairpins = rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => (row.eventType === "hairpin_right" || row.eventType === "hairpin_left") && !row.icon);

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
  return [
    { kmTotal: 0, kmPartial: 0, icon: "start", eventType: "straight", angle: null, notes: "Start", lat: null, lon: null, confidence: 1, source: "synthetic" },
    ...rows,
  ];
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtKm(v) {
  const n = Number(v || 0);
  return isFinite(n) ? n.toFixed(2) : "";
}

function fmtCap(row, nextRow) {
  let bearing = null;
  if (row && Number.isFinite(row.bearingOut)) bearing = row.bearingOut;
  else if (nextRow && Number.isFinite(nextRow.bearingIn)) bearing = nextRow.bearingIn;
  else if (nextRow && Number.isFinite(row?.lat) && Number.isFinite(nextRow?.lat)) {
    const toRad = d => d * Math.PI / 180;
    const dLon  = toRad(nextRow.lon - row.lon);
    const y = Math.sin(dLon) * Math.cos(toRad(nextRow.lat));
    const x = Math.cos(toRad(row.lat)) * Math.sin(toRad(nextRow.lat)) -
              Math.sin(toRad(row.lat)) * Math.cos(toRad(nextRow.lat)) * Math.cos(dLon);
    bearing = Math.atan2(y, x) * 180 / Math.PI;
  }
  if (!Number.isFinite(bearing)) return "";
  return Math.round(((bearing % 360) + 360) % 360) + "°";
}

function fmtGps(lat, lon) {
  if (lat == null || lon == null) return [""];
  const latN = Number(lat), lonN = Number(lon);
  if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return [""];
  return [toDms(latN, "lat"), toDms(lonN, "lon")];
}

function toDms(value, kind) {
  const abs = Math.abs(value), deg = Math.floor(abs);
  const minFull = (abs - deg) * 60, min = Math.floor(minFull);
  const sec = ((minFull - min) * 60).toFixed(3);
  const hemi = kind === "lat" ? (value >= 0 ? "N" : "S") : (value >= 0 ? "E" : "W");
  return `${deg}°${String(min).padStart(2, "0")}.${sec}'${hemi}`;
}

function humanize(v) {
  return String(v || "note").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
