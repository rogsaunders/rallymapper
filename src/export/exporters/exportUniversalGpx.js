import { haversineMeters } from "../../lib/roadbook/math";
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
  return (stage.waypoints || [])
    .filter(
      (w) =>
        w.kind !== "start" &&
        w.poi !== "START" &&
        Number.isFinite(Number(w.lat)) &&
        Number.isFinite(Number(w.lon)),
    )
    .map((w) => snapWaypointToTrack(w, trackPoints))
    .sort((a, b) => waypointTimeMs(a) - waypointTimeMs(b));
}

function waypointTimeMs(w) {
  const t = Date.parse(w.timestamp || w.time || "");
  return Number.isFinite(t) ? t : Infinity;
}

// ── Snap-to-track ────────────────────────────────────────────────────
//
// iOS occasionally delivers a stale GPS fix when an app polls — so the
// position read at the moment the user taps Record can be 5-15 s behind
// where they actually were. When a stage's waypoints are exported and
// rendered by a tool that draws straight connectors between consecutive
// <wpt> entries (e.g. Rally Navigator's free tier), the inconsistent
// staleness across waypoints turns a smooth descent into a saw-tooth
// zigzag — a waypoint with fresh GPS sits where the user was, the next
// one with stale GPS sits 100 m behind, the one after that sits where
// it should, and so on.
//
// The trackpoint stream is recorded continuously and represents the
// canonical "where the user actually was at time T" history. For each
// waypoint we find the trackpoint whose timestamp is closest to the
// waypoint's, and if it's within both time and distance gates, we
// replace the waypoint's coordinates with that trackpoint's.
//
// Defensive gates:
//   - SNAP_TIME_WINDOW_MS (15 s): trackpoints farther in time than this
//     are ignored — keeps us from snapping to an irrelevant point if
//     GPS lost signal for a long stretch.
//   - SNAP_DISTANCE_MAX_M (200 m): if the waypoint is farther than this
//     from its nearest-by-time trackpoint, it's likely a deliberate
//     off-track waypoint (a landmark observed from a layby, etc.) and
//     we leave it alone.
//
// Verified against a real user-submitted stage (2026-05-31 freeway
// descent): WP 14 "steep left hander" — 12 s stale, 142 m off-track —
// snaps to the on-track position. The visible 167 m wrong-direction
// jump that produced an RN zigzag triangle reduces to a 67 m natural
// road-curvature wiggle. Healthy waypoints (small or no staleness)
// snap by only 1-10 m, essentially a no-op.

const SNAP_TIME_WINDOW_MS = 15_000;
const SNAP_DISTANCE_MAX_M = 200;

function snapWaypointToTrack(waypoint, trackPoints) {
  if (!trackPoints || trackPoints.length === 0) return waypoint;
  const wpMs = Date.parse(waypoint.timestamp || waypoint.time || "");
  if (!Number.isFinite(wpMs)) return waypoint;

  let bestIdx = -1;
  let bestDelta = Infinity;
  for (let i = 0; i < trackPoints.length; i++) {
    const tpMs = Date.parse(trackPoints[i].time || trackPoints[i].timestamp || "");
    if (!Number.isFinite(tpMs)) continue;
    const delta = Math.abs(tpMs - wpMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestDelta > SNAP_TIME_WINDOW_MS) return waypoint;

  const tp = trackPoints[bestIdx];
  const distance = haversineMeters(
    { lat: Number(waypoint.lat), lon: Number(waypoint.lon) },
    { lat: Number(tp.lat), lon: Number(tp.lon) },
  );
  if (distance > SNAP_DISTANCE_MAX_M) return waypoint;

  return { ...waypoint, lat: tp.lat, lon: tp.lon };
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
