function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function exportGoogleEarthKml(stage, config = {}, baseName = "RouteMapper_Stage") {
  const coords = (stage.trackPoints || []).map((p) => `${p.lon},${p.lat},0`).join(" ")
  const placemarks = (stage.waypoints || []).map((w, i) => `
    <Placemark>
      <name>${esc(w.name || w.icon || `WP${i + 1}`)}</name>
      <description>${esc(w.note || "")}</description>
      <Point><coordinates>${w.lon},${w.lat},0</coordinates></Point>
    </Placemark>`).join("\n")

  return {
    [`${baseName}_googleearth.kml`]: `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(config.appName || "RouteMapper")}</name>
    <Placemark>
      <name>${esc(stage?.meta?.stageName || "Stage Track")}</name>
      <LineString><coordinates>${coords}</coordinates></LineString>
    </Placemark>
    ${placemarks}
  </Document>
</kml>`,
  }
}
