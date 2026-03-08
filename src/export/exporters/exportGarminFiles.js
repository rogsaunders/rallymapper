import { exportUniversalTrackGpx, exportUniversalWaypointsGpx } from "./exportUniversalGpx"

export function exportGarminFiles(stage, config = {}, baseName = "RouteMapper_Stage") {
  const combined = [
    exportUniversalWaypointsGpx(stage, config).replace(/<\/?gpx[^>]*>/g, "").trim(),
    exportUniversalTrackGpx(stage, config).replace(/<\/?gpx[^>]*>/g, "").trim(),
  ].join("\n")

  return {
    [`${baseName}_garmin.gpx`]: `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="${config.appName || "RouteMapper"}" xmlns="http://www.topografix.com/GPX/1/1">\n${combined}\n</gpx>`,
  }
}
