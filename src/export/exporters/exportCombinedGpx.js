import { gpxFooter, gpxHeader, xmlEscape } from "./gpxShared";
import {
  buildStartWaypoint,
  buildTrackpointXml,
  buildWaypointXml,
} from "./exportUniversalGpx";

/**
 * Combined GPX export — waypoints + recorded track in a single file.
 *
 * Composes the same waypoint and trackpoint builders used by the separate
 * `_waypoints.gpx` and `_track.gpx` exports, so the combined output is
 * structurally identical (same Number() casting, finite-coord filtering,
 * START waypoint inclusion, time elements, and POI-aware naming).
 *
 * Targets downstream tools that expect both kinds of GPX entity in one
 * file — Rally Navigator, Guru Maps, Hema, Garmin BaseCamp.
 */
export function exportCombinedGpx(stage, config = {}) {
  const trackName = xmlEscape(stage?.meta?.stageName || "RouteMapper");

  // Waypoints — start point (if present) followed by user-added waypoints
  const startWaypoint = buildStartWaypoint(stage?.startGPS);

  // Exclude any kind:"start" entry from the regular-waypoint list — the
  // synthetic START emitted by buildStartWaypoint(stage.startGPS) already
  // covers it.  See exportUniversalGpx.js for the longer rationale.
  const regularWaypoints = (stage.waypoints || [])
    .filter(
      (w) =>
        w.kind !== "start" &&
        w.poi !== "START" &&
        Number.isFinite(Number(w.lat)) &&
        Number.isFinite(Number(w.lon)),
    )
    .map((w, index) => buildWaypointXml(w, index));

  const allWaypoints = [startWaypoint, ...regularWaypoints]
    .filter(Boolean)
    .join("\n");

  // Track — single <trk> with one <trkseg>
  const trackPoints = (stage.trackPoints || [])
    .filter(
      (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)),
    )
    .map(buildTrackpointXml)
    .join("\n");

  const track = [
    `  <trk>`,
    `    <name>${trackName}</name>`,
    `    <trkseg>`,
    trackPoints,
    `    </trkseg>`,
    `  </trk>`,
  ].join("\n");

  return [
    gpxHeader(config.appName || "RouteMapper"),
    allWaypoints,
    track,
    gpxFooter(),
  ].join("\n");
}
