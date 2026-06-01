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

// ── Lookback offset ──────────────────────────────────────────────────
//
// After PR #43's interpolation snap, waypoints land at the user's
// actual GPS position at the moment they tapped Record. If the user
// taps right at a landmark, the pin lands at the landmark. If they
// tap 1-2 s after passing it (typical human reaction: see landmark →
// decide → look at iPad → tap), the pin lands 20-50 m past it.
//
// The lookback offset is a user-tunable setting that shifts the snap
// target backwards in time by N seconds — effectively asking "where
// was I N seconds before I tapped?". For a surveyor with a consistent
// reaction-time gap, dialling in 1-1.5 s lands pins close to their
// intended landmarks without changing how they tap.
//
// Default 0 preserves the strict PR #43 behaviour. Range capped at
// 5 s to prevent absurd values; the slider in the UI is constrained to
// 0-3 s.

const WAYPOINT_LOOKBACK_KEY = "rm_waypoint_lookback_s";
const WAYPOINT_LOOKBACK_MAX_MS = 5_000;

function readWaypointLookbackMs() {
  if (typeof localStorage === "undefined") return 0;
  try {
    const raw = localStorage.getItem(WAYPOINT_LOOKBACK_KEY);
    if (raw == null) return 0;
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    return Math.min(seconds, WAYPOINT_LOOKBACK_MAX_MS / 1000) * 1000;
  } catch {
    return 0;
  }
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
// The trackpoint stream is recorded continuously via watchPosition and
// represents the canonical "where the user actually was at time T"
// history. We interpolate the user's position at the waypoint's
// timestamp from the two trackpoints that bracket it in time, and
// replace the waypoint's coords with that interpolated value.
//
// Interpolation (rather than the previous nearest-by-time snap) avoids
// a subtle forward/backward bias: trackpoints sample every 5-10 s, so
// the "nearest in time" trackpoint can be ~2-5 s after the waypoint,
// which at highway speed places the snap target 40-100 m forward of
// where the user actually was. The visible symptom is "waypoints appear
// past their landmarks." Linear interpolation between bracketing points
// gives the position at the exact waypoint timestamp, with no time-
// direction bias.
//
// Defensive gates:
//   - SNAP_TIME_WINDOW_MS (15 s): if the bracketing trackpoints span
//     more than this, we treat it as a GPS dropout and leave the
//     waypoint alone.
//   - SNAP_DISTANCE_MAX_M (400 m): if the waypoint is farther than this
//     from the interpolated track position, it's likely a deliberate
//     off-track waypoint (a landmark observed from a layby, etc.) and
//     we leave it alone. Raised from 200 m to catch the freeway-speed
//     case where 6+ s of iOS staleness can put a tap-time read ~250 m
//     behind the true position.
//
// Lookback offset (lookbackMs): subtract from the waypoint timestamp
// before interpolation, so the snap target is "where the user was N
// seconds before they tapped". Compensates for human reaction time
// between seeing a landmark and tapping Record. Default 0 preserves
// strict PR #43 behaviour. See readWaypointLookbackMs.
//
// Verified against two real user-submitted stages:
//   - 2026-05-31 (Lachie's freeway descent): the 167 m wrong-direction
//     zigzag at WP 14 "steep left hander" reduces to a smooth curve.
//   - 2026-06-01 (Roger's 18 km Mylor→Bunnings): WP "css station" no
//     longer overshoots forward; WP "speed 80 roadworks" (253 m off
//     under the old 200 m gate) now snaps correctly to the recorded
//     freeway track.

const SNAP_TIME_WINDOW_MS = 15_000;
const SNAP_DISTANCE_MAX_M = 400;

function snapWaypointToTrack(waypoint, trackPoints, lookbackMs = 0) {
  if (!trackPoints || trackPoints.length === 0) return waypoint;
  const rawWpMs = Date.parse(waypoint.timestamp || waypoint.time || "");
  if (!Number.isFinite(rawWpMs)) return waypoint;
  // Target time is shifted backwards by the lookback amount, so the
  // interpolation lands where the user was BEFORE they tapped (closer
  // to where they saw the landmark, not where they ended up after
  // reaction-time delay).
  const wpMs = rawWpMs - Math.max(0, Number(lookbackMs) || 0);

  // Find the bracketing trackpoints: the latest one with time <= wpMs
  // and the earliest one with time >= wpMs. Most trackpoint streams
  // are time-monotonic, but we don't assume that — scan once.
  let beforeIdx = -1;
  let beforeMs = -Infinity;
  let afterIdx = -1;
  let afterMs = Infinity;
  for (let i = 0; i < trackPoints.length; i++) {
    const tpMs = Date.parse(trackPoints[i].time || trackPoints[i].timestamp || "");
    if (!Number.isFinite(tpMs)) continue;
    if (tpMs <= wpMs && tpMs > beforeMs) {
      beforeMs = tpMs;
      beforeIdx = i;
    }
    if (tpMs >= wpMs && tpMs < afterMs) {
      afterMs = tpMs;
      afterIdx = i;
    }
  }

  // Compute the interpolated position at the waypoint's timestamp.
  // Edge cases:
  //   - waypoint timestamp lies outside the trackpoint span (e.g. a
  //     waypoint captured before the first trackpoint arrived): fall
  //     back to the single available bracket if within the time window,
  //     otherwise leave the waypoint alone.
  let interpLat;
  let interpLon;
  if (beforeIdx >= 0 && afterIdx >= 0 && beforeIdx !== afterIdx) {
    // Normal case: two distinct brackets.
    if (afterMs - beforeMs > SNAP_TIME_WINDOW_MS) return waypoint;
    const span = afterMs - beforeMs;
    const frac = span > 0 ? (wpMs - beforeMs) / span : 0;
    const before = trackPoints[beforeIdx];
    const after = trackPoints[afterIdx];
    interpLat = Number(before.lat) + frac * (Number(after.lat) - Number(before.lat));
    interpLon = Number(before.lon) + frac * (Number(after.lon) - Number(before.lon));
  } else {
    // Only one side has a bracket, or both indices coincide (waypoint
    // timestamp matches a trackpoint exactly). Use whichever single
    // trackpoint is available, gated by the time window.
    const idx = beforeIdx >= 0 ? beforeIdx : afterIdx;
    if (idx < 0) return waypoint;
    const tpMs = beforeIdx >= 0 ? beforeMs : afterMs;
    if (Math.abs(tpMs - wpMs) > SNAP_TIME_WINDOW_MS) return waypoint;
    interpLat = Number(trackPoints[idx].lat);
    interpLon = Number(trackPoints[idx].lon);
  }

  // Distance gate — preserve deliberately off-track waypoints.
  const distance = haversineMeters(
    { lat: Number(waypoint.lat), lon: Number(waypoint.lon) },
    { lat: interpLat, lon: interpLon },
  );
  if (distance > SNAP_DISTANCE_MAX_M) return waypoint;

  return { ...waypoint, lat: interpLat, lon: interpLon };
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
