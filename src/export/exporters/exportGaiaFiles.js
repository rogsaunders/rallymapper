import { exportUniversalTrackGpx, exportUniversalWaypointsGpx } from "./exportUniversalGpx"

export function exportGaiaFiles(stage, config = {}, baseName = "RouteMapper_Stage") {
  return {
    [`${baseName}_gaia_track.gpx`]: exportUniversalTrackGpx(stage, config),
    [`${baseName}_gaia_waypoints.gpx`]: exportUniversalWaypointsGpx(stage, config),
  }
}
