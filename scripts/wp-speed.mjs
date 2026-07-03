#!/usr/bin/env node
/**
 * RouteMapper — Average speed between two waypoints.
 *
 * Reads a stage.json (either the top-level export wrapper or the
 * inner `stage` object), looks up two waypoints by their 1-based
 * index, and prints the average speed between them.
 *
 * Usage:
 *   node scripts/wp-speed.mjs <stage.json> <fromWP> <toWP>
 *
 * Examples:
 *   node scripts/wp-speed.mjs ~/Downloads/MyTrip.../Source/stage.json 3 21
 *   node scripts/wp-speed.mjs stage.json 1 14
 *
 * Notes:
 *   • Waypoint numbers are 1-based (WP 1 = the START row in most
 *     stages). Order doesn't matter — passing 21 3 gives the same
 *     answer as 3 21.
 *   • Average speed = (distanceFromStartM_to − distanceFromStartM_from)
 *     ÷ (timestamp_to − timestamp_from), then converted to km/h.
 *     This is the AVERAGE — instantaneous speeds at any point in
 *     between can be much higher or lower.
 *   • Stationary = time within the window spent effectively stopped
 *     (trackpoint segments under 1 km/h). Moving avg = distance ÷
 *     (duration − stationary) — the pace held while actually moving.
 *     Both need `trackPoints`; they print "—" if it's absent.
 *   • If the stage.json was exported by an older RouteMapper that
 *     didn't record distanceFromStartM on waypoints, the script
 *     falls back to summing the segmentMeters in `routePoints`.
 */

import fs from "fs";

// ─── Args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 3 || args.includes("--help") || args.includes("-h")) {
  console.error(
    "Usage: node scripts/wp-speed.mjs <stage.json> <fromWP> <toWP>\n" +
      "       (waypoint numbers are 1-based; order doesn't matter)",
  );
  process.exit(args.length === 0 ? 1 : 0);
}

const [stagePath, fromArg, toArg] = args;

const fromN = Number(fromArg);
const toN = Number(toArg);
if (!Number.isInteger(fromN) || !Number.isInteger(toN) || fromN < 1 || toN < 1) {
  console.error(`Bad waypoint numbers: "${fromArg}" / "${toArg}" (need positive integers)`);
  process.exit(1);
}

// ─── Read stage.json ─────────────────────────────────────────────────────────

let raw;
try {
  raw = fs.readFileSync(stagePath, "utf8");
} catch (e) {
  console.error(`Couldn't read ${stagePath}: ${e.message}`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error(`Couldn't parse JSON: ${e.message}`);
  process.exit(1);
}

// Support both the export wrapper ({app, version, stage: {…}}) and a
// bare stage object.
const stage = data.stage || data;
const waypoints = stage.waypoints;
if (!Array.isArray(waypoints) || waypoints.length === 0) {
  console.error("No waypoints array found in the stage payload.");
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tryGetDistanceM(wp, idx) {
  // 1) The standard field on every modern stage.json.
  if (Number.isFinite(Number(wp.distanceFromStartM))) {
    return Number(wp.distanceFromStartM);
  }
  // 2) Fallback for older exports that only carried per-waypoint
  //    fields on routePoints. Sum segmentMeters from start.
  if (Array.isArray(stage.routePoints)) {
    let running = 0;
    for (let i = 0; i <= idx && i < stage.routePoints.length; i++) {
      const seg = Number(stage.routePoints[i].segmentMeters);
      if (Number.isFinite(seg)) running += seg;
    }
    return running;
  }
  return null;
}

function parseT(wp) {
  const t = Date.parse(wp.timestamp || wp.time || "");
  return Number.isFinite(t) ? t : null;
}

// Speed below this counts a trackpoint segment as "stationary".
// 1 km/h is well below walking pace so it cleanly captures genuine
// stops while absorbing GPS jitter. Mirrors src/lib/wpSpeed.js — keep
// the two in lockstep.
const STATIONARY_SPEED_MPS = 1000 / 3600; // 1 km/h

// Total time the vehicle was effectively stationary between two
// timestamps. Walks the trackpoints and sums any segment whose average
// speed is below STATIONARY_SPEED_MPS, clipped to the from→to window.
// Returns milliseconds (≥ 0), or null when trackpoints are unavailable.
function computeStationaryMs(fromT, toT) {
  const trackPoints = stage.trackPoints;
  if (!Array.isArray(trackPoints)) return null;

  let stationaryMs = 0;
  for (let i = 1; i < trackPoints.length; i++) {
    const prev = trackPoints[i - 1];
    const curr = trackPoints[i];
    const prevT = parseT(prev);
    const currT = parseT(curr);
    if (prevT == null || currT == null) continue;

    // Trackpoints are time-ordered, so once we pass `toT` we're done.
    if (prevT >= toT) break;
    if (currT <= fromT) continue;

    const dtMs = currT - prevT;
    if (dtMs <= 0) continue;

    const prevDist = Number(prev.distanceFromStartM);
    const currDist = Number(curr.distanceFromStartM);
    if (!Number.isFinite(prevDist) || !Number.isFinite(currDist)) continue;
    const segM = currDist - prevDist;

    const segSpeedMps = segM / (dtMs / 1000);
    if (segSpeedMps < STATIONARY_SPEED_MPS) {
      // Clip to the requested window so a stop straddling a boundary
      // doesn't double-count.
      const segStart = Math.max(prevT, fromT);
      const segEnd = Math.min(currT, toT);
      stationaryMs += Math.max(0, segEnd - segStart);
    }
  }
  return stationaryMs;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalS = Math.round(ms / 1000);
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  const parts = [];
  if (h) parts.push(`${h} h`);
  if (h || m) parts.push(`${m} min`);
  parts.push(`${s} s`);
  return parts.join(" ");
}

function formatTime(iso) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function wpLabel(wp, idx) {
  const label = wp.poi || wp.notes || wp.iconId || wp.type || "(unnamed)";
  return `WP ${idx + 1}  "${label}"`;
}

// ─── Look up waypoints ───────────────────────────────────────────────────────

const lo = Math.min(fromN, toN);
const hi = Math.max(fromN, toN);
if (hi > waypoints.length) {
  console.error(
    `Waypoint ${hi} is out of range (stage has ${waypoints.length} waypoints).`,
  );
  process.exit(1);
}
if (lo === hi) {
  console.error("From and to are the same waypoint — distance is zero.");
  process.exit(1);
}

const a = waypoints[lo - 1];
const b = waypoints[hi - 1];

const ta = parseT(a);
const tb = parseT(b);
if (ta == null || tb == null) {
  console.error(
    `Missing timestamp on WP ${ta == null ? lo : hi} — cannot compute duration.`,
  );
  process.exit(1);
}

const da = tryGetDistanceM(a, lo - 1);
const db = tryGetDistanceM(b, hi - 1);
if (da == null || db == null) {
  console.error(
    `Missing distance on WP ${da == null ? lo : hi} — cannot compute speed.`,
  );
  process.exit(1);
}

const durationMs = tb - ta;
const distanceM = db - da;
const speedMps = durationMs > 0 ? distanceM / (durationMs / 1000) : 0;
const speedKmh = speedMps * 3.6;

// Stationary time and the moving average (speed over just the moving
// time = duration − stationary). Both null when trackpoints are absent
// or the whole window was stationary.
const stationaryMs = computeStationaryMs(ta, tb);
const movingMs = stationaryMs != null ? durationMs - stationaryMs : null;
const movingKmh =
  movingMs != null && movingMs > 0 ? (distanceM / (movingMs / 1000)) * 3.6 : null;

// ─── Print ───────────────────────────────────────────────────────────────────

const meta = stage.meta || {};
const stageLabel = [
  meta.tripName,
  meta.dayNumber != null ? `Day ${meta.dayNumber}` : null,
  meta.routeName,
  meta.stageNumber != null ? `Stage ${meta.stageNumber}` : null,
]
  .filter(Boolean)
  .join(" · ");

console.log("");
console.log("RouteMapper — average speed between waypoints");
console.log("──────────────────────────────────────────────");
if (stageLabel) console.log(`Stage:       ${stageLabel}`);
if (meta.tripDate) console.log(`Trip date:   ${meta.tripDate}`);
console.log("");
console.log(`From: ${wpLabel(a, lo - 1).padEnd(40)} ${formatTime(a.timestamp)}`);
console.log(`To:   ${wpLabel(b, hi - 1).padEnd(40)} ${formatTime(b.timestamp)}`);
console.log("");
console.log(`Duration:    ${formatDuration(durationMs)}`);
console.log(`Distance:    ${(distanceM / 1000).toFixed(2)} km  (${distanceM.toFixed(0)} m)`);
console.log(
  `Avg speed:   ${speedKmh.toFixed(1)} km/h  (${speedMps.toFixed(2)} m/s)`,
);
console.log(
  `Stationary:  ${stationaryMs != null ? formatDuration(stationaryMs) : "— (no trackpoints)"}`,
);
console.log(
  `Moving avg:  ${movingKmh != null ? `${movingKmh.toFixed(1)} km/h` : "—"}`,
);
console.log("");
