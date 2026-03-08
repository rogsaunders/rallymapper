import { exportUniversalTrackGpx, exportUniversalWaypointsGpx } from "./exportUniversalGpx"

export function exportHemaFiles(stage, config = {}, baseName = "RouteMapper_Stage") {
  return {
    [`${baseName}_hema_track.gpx`]: exportUniversalTrackGpx(stage, config),
    [`${baseName}_hema_waypoints.gpx`]: exportUniversalWaypointsGpx(stage, config),
  }
}
