import { gpxFooter, gpxHeader, symbolForIcon, xmlEscape } from "./gpxShared"

export function exportUniversalTrackGpx(stage, config = {}) {
  const name = xmlEscape(stage?.meta?.stageName || "Stage Track")
  const points = (stage.trackPoints || [])
    .map((p) => `    <trkpt lat="${p.lat}" lon="${p.lon}">${p.time ? `\n      <time>${xmlEscape(p.time)}</time>\n    ` : ""}</trkpt>`)
    .join("\n")

  return [
    gpxHeader(config.appName),
    `  <trk>`,
    `    <name>${name}</name>`,
    `    <trkseg>`,
    points,
    `    </trkseg>`,
    `  </trk>`,
    gpxFooter(),
  ].join("\n")
}

export function exportUniversalWaypointsGpx(stage, config = {}) {
  const waypoints = (stage.waypoints || [])
    .map((w, index) => {
      const name = xmlEscape(w.name || w.icon || `WP${index + 1}`)
      const desc = xmlEscape(w.note || w.description || "")
      const sym = xmlEscape(symbolForIcon(w.icon))
      return [
        `  <wpt lat="${w.lat}" lon="${w.lon}">`,
        `    <name>${name}</name>`,
        desc ? `    <desc>${desc}</desc>` : null,
        `    <sym>${sym}</sym>`,
        `  </wpt>`,
      ].filter(Boolean).join("\n")
    })
    .join("\n")

  return [gpxHeader(config.appName), waypoints, gpxFooter()].join("\n")
}
