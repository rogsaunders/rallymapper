import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

export async function exportRoadbookDocx(stage) {
  const roadbook = stage?.roadbook;
  const rawRows = roadbook?.views?.driver || roadbook?.rows || [];
  const rows = ensureStartRow(rawRows);
  const title = stage?.meta?.stageName || "RouteMapper Roadbook";
  const meta = stage?.meta || {};

  const lastWithKm = [...rows].reverse().find((r) =>
    Number.isFinite(Number(r.kmTotal)),
  );
  const totalKm = lastWithKm ? Number(lastWithKm.kmTotal).toFixed(1) : "—";
  const waypointCount = rows.filter((r) => r.source !== "synthetic").length;

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new TextRun({ text: title, bold: true, size: 36 }),
            ],
          }),
          ...buildMetaLines(meta, totalKm, waypointCount),
          new Paragraph({ spacing: { after: 200 }, children: [] }),
          buildTable(rows),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

function buildMetaLines(meta, totalKm, waypointCount) {
  const pairs = [
    ["Trip", meta.tripName],
    ["Route", meta.routeName],
    ["Day", meta.dayNumber],
    ["Stage", meta.stageNumber],
    ["Date", meta.tripDate],
    ["Total distance", totalKm ? `${totalKm} km` : null],
    ["Waypoints", waypointCount],
  ].filter(([, v]) => v != null && v !== "");

  return pairs.map(
    ([k, v]) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `${k}: `, bold: true, size: 20 }),
          new TextRun({ text: String(v), size: 20 }),
        ],
      }),
  );
}

function buildTable(rows) {
  const COLS = [
    { label: "#", width: 5 },
    { label: "Total (km)", width: 10 },
    { label: "Partial (km)", width: 11 },
    { label: "CAP", width: 8 },
    { label: "Event / Icon", width: 20 },
    { label: "Note", width: 28 },
    { label: "GPS", width: 18 },
  ];

  const border = {
    top: { style: BorderStyle.SINGLE, size: 4 },
    bottom: { style: BorderStyle.SINGLE, size: 4 },
    left: { style: BorderStyle.SINGLE, size: 4 },
    right: { style: BorderStyle.SINGLE, size: 4 },
  };

  const headerCells = COLS.map(({ label, width }) =>
    new TableCell({
      width: { size: width, type: WidthType.PERCENTAGE },
      borders: border,
      shading: { fill: "111111" },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: label,
              bold: true,
              color: "FFFFFF",
              size: 18,
            }),
          ],
        }),
      ],
    }),
  );

  const dataRows = rows.map((row, index) => {
    const isManual = Boolean(row.icon);
    const fill = isManual ? "FFF200" : "EFEFEF";

    return new TableRow({
      children: [
        cell(String(index + 1), border, 5, { fill: "000000", color: "FFFFFF", bold: true, align: AlignmentType.CENTER }),
        cell(formatKm(row.kmTotal), border, 10, { fill, align: AlignmentType.CENTER }),
        cell(formatKm(row.kmPartial), border, 11, { fill, align: AlignmentType.CENTER }),
        cell(formatCap(row), border, 8, { fill: "FFF35A", align: AlignmentType.CENTER }),
        cell(formatEvent(row), border, 20, {}),
        cell(row.notes || humanize(row.eventType), border, 28, {}),
        cell(formatGps(row.lat, row.lon), border, 18, { size: 16 }),
      ],
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: headerCells, tableHeader: true }), ...dataRows],
  });
}

function cell(text, border, width, { fill, color, bold, align, size } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: border,
    shading: fill ? { fill } : undefined,
    children: [
      new Paragraph({
        alignment: align || AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            bold: bold || false,
            color: color || "000000",
            size: size || 20,
          }),
        ],
      }),
    ],
  });
}

function ensureStartRow(rows) {
  if (!rows.length) return rows;
  if (Math.abs(rows[0].kmTotal || 0) < 0.01) return rows;
  return [
    {
      kmTotal: 0,
      kmPartial: 0,
      icon: "start",
      eventType: "straight",
      angle: null,
      notes: "Start",
      lat: null,
      lon: null,
      confidence: 1,
      source: "synthetic",
    },
    ...rows,
  ];
}

function formatKm(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function formatCap(row) {
  const bearing = row.bearingOut ?? null;
  if (!Number.isFinite(bearing)) return "";
  return `${Math.round(((bearing % 360) + 360) % 360)}°`;
}

function formatEvent(row) {
  const parts = [];
  if (row.icon) parts.push(row.icon);
  else parts.push(humanize(row.eventType));
  return parts.join(" / ");
}

function formatGps(lat, lon) {
  if (lat == null || lon == null) return "";
  const latN = Number(lat);
  const lonN = Number(lon);
  if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return "";
  return `${toDms(latN, "lat")}  ${toDms(lonN, "lon")}`;
}

function toDms(value, kind) {
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutesFull = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = ((minutesFull - minutes) * 60).toFixed(3);
  const hemi = kind === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${degrees}°${String(minutes).padStart(2, "0")}.${seconds}'${hemi}`;
}

function humanize(value) {
  return String(value || "note")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
