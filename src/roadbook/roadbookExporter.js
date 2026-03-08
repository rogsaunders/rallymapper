export function exportRoadbookJson(roadbook) {
  return JSON.stringify(roadbook, null, 2)
}

export function exportRoadbookCsv(roadbook) {
  const headers = [
    "index",
    "kmTotal",
    "kmPartial",
    "eventType",
    "notes",
    "lat",
    "lon",
    "confidence",
  ]

  const lines = [headers.join(",")]

  for (const row of roadbook.rows || []) {
    lines.push(
      [
        row.index,
        row.kmTotal,
        row.kmPartial,
        escapeCsv(row.eventType),
        escapeCsv(row.notes),
        row.lat,
        row.lon,
        row.confidence,
      ].join(",")
    )
  }

  return lines.join("\n")
}

function escapeCsv(value) {
  const text = String(value ?? "")
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}
