// src/export/exporters/exportGarminFiles.js
//
// Garmin BaseCamp bundle — single combined GPX file (waypoints + track).
//
// Earlier versions stitched the universal `_track.gpx` and
// `_waypoints.gpx` strings together by stripping their <gpx> wrappers
// and re-wrapping in a new envelope. That left the two inner
// <?xml ...?> prologs intact, producing a document with three XML
// declarations — invalid per the XML spec. Lenient parsers (Hema,
// Guru, Gaia, Rally Navigator) tolerated it; Garmin BaseCamp's strict
// parser rejected the file outright.
//
// We now delegate to exportCombinedGpx, which produces structurally
// identical content (same waypoint + track builders) but with one
// prolog and one <gpx> wrapper.

import { exportCombinedGpx } from "./exportCombinedGpx";

export function exportGarminFiles(stage, config = {}, baseName = "RouteMapper_Stage") {
  return {
    [`${baseName}_garmin.gpx`]: exportCombinedGpx(stage, config),
  };
}
