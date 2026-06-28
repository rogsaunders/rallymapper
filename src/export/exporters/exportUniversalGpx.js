import {
  readWaypointLookbackMs,
  snapWaypointToTrack,
} from "../../lib/roadbook/snapWaypoints";
import {
  gpxFooter,
  gpxHeader,
  openRallyTypeForIcon,
  symbolForIcon,
  xmlEscape,
} from "./gpxShared";

export function exportUniversalTrackGpx(stage, config = {}) {
  const name = xmlEscape(stage?.meta?.stageName || "Stage Track");

  const points = (stage.trackPoints || [])
    .filter(
      (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)),
    )
    .map(buildTrackpointXml)
    .join("\n");

  return [
    gpxHeader(config.appName),
    `  <trk>`,
    `    <name>${name}</name>`,
    `    <trkseg>`,
    points,
    `    </trkseg>`,
    `  </trk>`,
    gpxFooter(),
  ].join("\n");
}

export function exportUniversalWaypointsGpx(stage, config = {}) {
  const startWaypoint = buildStartWaypoint(stage?.startGPS);

  const regularWaypoints = getRegularWaypoints(stage).map((w, index) =>
    buildWaypointXml(w, index),
  );

  const allWaypoints = [startWaypoint, ...regularWaypoints]
    .filter(Boolean)
    .join("\n");

  return [gpxHeader(config.appName), allWaypoints, gpxFooter()].join("\n");
}

/**
 * Filter, validate, snap, and chronologically sort the user-added
 * waypoints for GPX export. Shared by exportUniversalWaypointsGpx and
 * exportCombinedGpx so both produce identical waypoint order.
 *
 * Filtering:
 *   - Excludes any kind:"start" / poi:"START" entry — the synthetic START
 *     emitted by buildStartWaypoint(stage.startGPS) covers that. Without
 *     this filter, the GPX would carry two START entries since
 *     RouteMapperLayout keeps a kind:"start" row in stage.waypoints as the
 *     canonical row 1 of the roadbook.
 *   - Drops anything without finite lat/lon.
 *
 * Snap-to-track (see snapWaypointToTrack):
 *   - Each waypoint is re-positioned to its nearest-by-time trackpoint,
 *     correcting for iOS GPS staleness that occasionally lands a
 *     waypoint 100-200 m off the recorded path. The trackpoint stream
 *     is the canonical record of "where the user actually was".
 *
 * Sorting:
 *   - By waypoint timestamp ascending, so consumers that draw straight
 *     connectors between consecutive <wpt> entries (e.g. Rally Navigator's
 *     free tier) render a sensible route rather than a zigzag when the
 *     in-memory stage.waypoints array is out of time order. Waypoints
 *     without a parseable timestamp sort to the end while preserving their
 *     original relative order (Array.prototype.sort is stable).
 */
export function getRegularWaypoints(stage) {
  const trackPoints = stage.trackPoints || [];
  const lookbackMs = readWaypointLookbackMs();
  return (stage.waypoints || [])
    .filter(
      (w) =>
        w.kind !== "start" &&
        w.poi !== "START" &&
        Number.isFinite(Number(w.lat)) &&
        Number.isFinite(Number(w.lon)),
    )
    .map((w) => snapWaypointToTrack(w, trackPoints, lookbackMs))
    .sort((a, b) => waypointTimeMs(a) - waypointTimeMs(b));
}

// snapWaypointToTrack + readWaypointLookbackMs live in
// src/lib/roadbook/snapWaypoints.js so the in-app roadbook display
// (Review, RouteMapperLayout) can apply the same snap and show coords
// that agree with what ends up in the exported GPX.

function waypointTimeMs(w) {
  const t = Date.parse(w.timestamp || w.time || "");
  return Number.isFinite(t) ? t : Infinity;
}

export function buildStartWaypoint(startGPS) {
  if (
    !startGPS ||
    !Number.isFinite(Number(startGPS.lat)) ||
    !Number.isFinite(Number(startGPS.lon))
  ) {
    return null;
  }

  const lat = Number(startGPS.lat);
  const lon = Number(startGPS.lon);
  const time = startGPS.timestamp || "";
  const name = xmlEscape("START");
  const desc = xmlEscape("Stage Start");
  const sym = xmlEscape(symbolForIcon("start"));
  const orType = xmlEscape(openRallyTypeForIcon("start"));

  return [
    `  <wpt lat="${lat}" lon="${lon}">`,
    `    <name>${name}</name>`,
    `    <desc>${desc}</desc>`,
    `    <sym>${sym}</sym>`,
    `    <type>${orType}</type>`,
    time ? `    <time>${xmlEscape(time)}</time>` : null,
    `  </wpt>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildWaypointXml(w, index) {
  const lat = Number(w.lat);
  const lon = Number(w.lon);

  const iconId = w.iconId || w.icon || "";
  const type = w.type || "";
  const poi = (w.poi || w.name || "").trim();
  const time = w.timestamp || w.time || "";

  const fallbackName = iconId
    ? iconId.toUpperCase()
    : type
      ? `${type.toUpperCase()} ${index + 1}`
      : `WP${index + 1}`;

  const name = xmlEscape(poi || fallbackName);

  const descParts = [];
  if (type) descParts.push(`Type: ${type}`);
  if (iconId) descParts.push(`Icon: ${iconId}`);
  if (poi) descParts.push(`POI: ${poi}`);

  const desc = xmlEscape(descParts.join(" | "));
  const sym = xmlEscape(symbolForIcon(iconId || type));
  const orType = xmlEscape(openRallyTypeForIcon(iconId || type));

  return [
    `  <wpt lat="${lat}" lon="${lon}">`,
    `    <name>${name}</name>`,
    desc ? `    <desc>${desc}</desc>` : null,
    `    <sym>${sym}</sym>`,
    `    <type>${orType}</type>`,
    time ? `    <time>${xmlEscape(time)}</time>` : null,
    `  </wpt>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildTrackpointXml(p) {
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  const time = p.time || p.timestamp || "";

  return [
    `    <trkpt lat="${lat}" lon="${lon}">`,
    time ? `      <time>${xmlEscape(time)}</time>` : null,
    `    </trkpt>`,
  ]
    .filter(Boolean)
    .join("\n");
}
