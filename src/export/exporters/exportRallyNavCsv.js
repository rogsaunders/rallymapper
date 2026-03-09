export function exportRallyNavCsv(stage) {
  const rows = stage?.roadbook?.rows || [];

  const headers = [
    "index",
    "kmTotal",
    "kmPartial",
    "eventType",
    "icon",
    "notes",
    "lat",
    "lon",
    "confidence",
  ];

  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.index ?? "",
        row.kmTotal ?? "",
        row.kmPartial ?? "",
        csv(row.eventType),
        csv(row.icon),
        csv(row.notes),
        row.lat ?? "",
        row.lon ?? "",
        row.confidence ?? "",
      ].join(","),
    );
  }

  return lines.join("\n");
}

function csv(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}
