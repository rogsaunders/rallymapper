// src/lib/roadbook/snapWaypoints.js
//
// Shared "snap waypoint to the recorded track" logic used by both the
// GPX exporter (so downstream tools like Rally Navigator render a smooth
// route instead of an iOS-staleness zigzag) and the in-app roadbook
// display in Review / RouteMapperLayout (so what the organiser sees on
// screen matches what ends up in the exported GPX).
//
// Before this module existed the snap lived only in the GPX exporter,
// which meant the in-app roadbook showed raw tap-time coords while the
// exported GPX carried snapped coords — a recurring source of "why
// don't the numbers in RouteMapper match Rally Navigator?" confusion.
// Snapping at the display boundary too makes the two artifacts agree.
//
// snapWaypointToTrack and the lookback offset were extracted verbatim
// from src/export/exporters/exportUniversalGpx.js (PR #43, refined in
// later passes). Behaviour is unchanged for the export path.

import { haversineMeters } from "./math";

// ── Lookback offset ──────────────────────────────────────────────────
//
// User-tunable setting (Settings → Waypoint Lookback, 0–3 s) that
// shifts the snap target backwards in time. Compensates for the human
// reaction-time gap between seeing a landmark and tapping Record.

const WAYPOINT_LOOKBACK_KEY = "rm_waypoint_lookback_s";
const WAYPOINT_LOOKBACK_MAX_MS = 5_000;

export function readWaypointLookbackMs() {
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

// ── Snap-to-track ────────────────────────────────────────────────────
//
// iOS occasionally delivers a stale GPS fix when an app polls — so the
// position read at the moment the user taps Record can be 5–15 s behind
// where they actually were. The trackpoint stream is continuously
// updated via watchPosition and represents the canonical "where the
// user was at time T" history.
//
// We interpolate the user's position at the waypoint's timestamp from
// the two trackpoints bracketing it in time. Linear interpolation
// avoids the forward bias of a nearest-neighbour snap.
//
// Defensive gates:
//   - SNAP_TIME_WINDOW_MS (15 s): if the brackets span more than this,
//     treat as a GPS dropout and leave the waypoint alone.
//   - SNAP_DISTANCE_MAX_M (400 m): if the raw waypoint is farther than
//     this from the interpolated track position it's likely a
//     deliberate off-track waypoint (a landmark observed from a layby,
//     etc.) — leave it alone.

const SNAP_TIME_WINDOW_MS = 15_000;
const SNAP_DISTANCE_MAX_M = 400;

export function snapWaypointToTrack(waypoint, trackPoints, lookbackMs = 0) {
  if (!trackPoints || trackPoints.length === 0) return waypoint;
  const rawWpMs = Date.parse(waypoint.timestamp || waypoint.time || "");
  if (!Number.isFinite(rawWpMs)) return waypoint;
  const wpMs = rawWpMs - Math.max(0, Number(lookbackMs) || 0);

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

  let interpLat;
  let interpLon;
  if (beforeIdx >= 0 && afterIdx >= 0 && beforeIdx !== afterIdx) {
    if (afterMs - beforeMs > SNAP_TIME_WINDOW_MS) return waypoint;
    const span = afterMs - beforeMs;
    const frac = span > 0 ? (wpMs - beforeMs) / span : 0;
    const before = trackPoints[beforeIdx];
    const after = trackPoints[afterIdx];
    interpLat = Number(before.lat) + frac * (Number(after.lat) - Number(before.lat));
    interpLon = Number(before.lon) + frac * (Number(after.lon) - Number(before.lon));
  } else {
    const idx = beforeIdx >= 0 ? beforeIdx : afterIdx;
    if (idx < 0) return waypoint;
    const tpMs = beforeIdx >= 0 ? beforeMs : afterMs;
    if (Math.abs(tpMs - wpMs) > SNAP_TIME_WINDOW_MS) return waypoint;
    interpLat = Number(trackPoints[idx].lat);
    interpLon = Number(trackPoints[idx].lon);
  }

  const distance = haversineMeters(
    { lat: Number(waypoint.lat), lon: Number(waypoint.lon) },
    { lat: interpLat, lon: interpLon },
  );
  if (distance > SNAP_DISTANCE_MAX_M) return waypoint;

  return { ...waypoint, lat: interpLat, lon: interpLon };
}

// ── Display-side wrapper ─────────────────────────────────────────────
//
// Used by Review / RouteMapperLayout to snap an entire waypoints array
// in place for rendering. Differs from the export-side use of
// snapWaypointToTrack in two ways:
//   • Preserves input array order — does NOT sort by timestamp. The
//     in-app display reads stage.waypoints in insertion order; reordering
//     here would silently change row numbers in Review.
//   • Passes start-row waypoints (kind:"start" / poi:"START") through
//     unmodified. The export rebuilds START from stage.startGPS, so the
//     exported START is always the raw fix — keeping the displayed START
//     unsnapped mirrors that.

export function snapWaypointsForDisplay(waypoints, trackPoints) {
  if (!Array.isArray(waypoints)) return [];
  if (!trackPoints || trackPoints.length === 0) return waypoints;
  const lookbackMs = readWaypointLookbackMs();
  return waypoints.map((w) => {
    if (!w) return w;
    if (w.kind === "start" || w.poi === "START") return w;
    return snapWaypointToTrack(w, trackPoints, lookbackMs);
  });
}
