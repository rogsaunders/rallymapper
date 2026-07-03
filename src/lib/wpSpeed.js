// src/lib/wpSpeed.js
//
// In-app sibling of scripts/wp-speed.mjs — compute the average speed
// between two waypoints of a loaded stage. Same maths so the CLI and
// the app stay in lockstep; if one of them is edited, the diff should
// flag the other for review.
//
// Public surface:
//   • computeWpSpeed(stage, fromN, toN)
//       → returns { ok: true, result }  on success
//       → returns { ok: false, error: { code, message } } otherwise
//
//   • formatDuration(ms)   → "1 h 22 min 22 s"
//   • formatClockTime(iso) → local-time string like "08:10:23"
//
// `stage` is the same shape RouteMapperLayout passes around — top-level
// `waypoints` array required, `routePoints` accepted as a fallback for
// the (rare) older export that didn't carry distanceFromStartM on
// waypoint records.
//
// The function is pure (no React, no DOM). Tested via the test stage
// fixture that the CLI script uses.

/**
 * @typedef {Object} WpSpeedResult
 * @property {number}  fromIdx        Zero-based array index of From WP
 * @property {number}  toIdx          Zero-based array index of To WP
 * @property {Object}  from           The From waypoint object
 * @property {Object}  to             The To waypoint object
 * @property {string}  fromLabel      Display label for the From WP
 * @property {string}  toLabel        Display label for the To WP
 * @property {number}  durationMs     Elapsed time in ms
 * @property {number}  distanceM      Distance along track in metres
 * @property {number}  speedMps       Average speed in metres / second
 * @property {number}  speedKmh       Average speed in km / hour
 */

function tryGetDistanceM(stage, wp, idx) {
  if (Number.isFinite(Number(wp?.distanceFromStartM))) {
    return Number(wp.distanceFromStartM);
  }
  if (Array.isArray(stage?.routePoints)) {
    let running = 0;
    for (let i = 0; i <= idx && i < stage.routePoints.length; i++) {
      const seg = Number(stage.routePoints[i]?.segmentMeters);
      if (Number.isFinite(seg)) running += seg;
    }
    return running;
  }
  return null;
}

function parseT(wp) {
  const t = Date.parse(wp?.timestamp || wp?.time || "");
  return Number.isFinite(t) ? t : null;
}

function labelFor(wp) {
  return wp?.poi || wp?.notes || wp?.iconId || wp?.type || "(unnamed)";
}

// Speed below this counts a trackpoint segment as "stationary".
// 1 km/h is well below walking pace (~5 km/h) so it cleanly captures
// genuine stops while absorbing GPS jitter (a few metres of drift
// while truly still still reads as low pseudo-speed). It also covers
// "off-app" breaks where iOS suspends the tab and only one trackpoint
// lands across a long pause — the segment's avg speed across that
// span is ~zero so it gets credited as stationary even though no
// per-second samples exist.
const STATIONARY_SPEED_MPS = 1000 / 3600; // 1 km/h

/**
 * Total time the vehicle was effectively stationary between two
 * waypoints. Walks the trackpoints in the from→to window and sums
 * any segment whose average speed is below STATIONARY_SPEED_MPS.
 *
 * Same 1-based, order-independent indexing as computeWpSpeed.
 *
 * @returns {number|null} milliseconds (≥ 0), or null when inputs
 *   are unusable (missing arrays, bad indices, missing timestamps).
 */
export function computeStationaryMs(stage, fromN, toN) {
  const waypoints = stage?.waypoints;
  const trackPoints = stage?.trackPoints;
  if (!Array.isArray(waypoints) || !Array.isArray(trackPoints)) return null;

  const a = Number(fromN);
  const b = Number(toN);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo < 1 || hi > waypoints.length || lo === hi) return null;

  const fromT = parseT(waypoints[lo - 1]);
  const toT = parseT(waypoints[hi - 1]);
  if (fromT == null || toT == null) return null;

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

    const speedMps = segM / (dtMs / 1000);
    if (speedMps < STATIONARY_SPEED_MPS) {
      // Clip the segment to the requested from→to window so a long
      // stop that straddles a boundary doesn't double-count.
      const segStart = Math.max(prevT, fromT);
      const segEnd = Math.min(currT, toT);
      stationaryMs += Math.max(0, segEnd - segStart);
    }
  }
  return stationaryMs;
}

/**
 * Moving average speed — average speed over only the time the vehicle
 * was actually moving, i.e. distance / (duration − stationary). This is
 * higher than the overall average whenever there were stops, and is the
 * figure that best reflects the pace a participant can expect to hold on
 * the moving parts of a stage.
 *
 * @param {number} distanceM     Distance along track (metres)
 * @param {number} durationMs    Elapsed wall-clock time (ms)
 * @param {number|null} stationaryMs  Stationary time (ms) from
 *   computeStationaryMs, or null when it couldn't be computed.
 * @returns {number|null} km/h, or null when the moving time is
 *   unknown or non-positive (e.g. the whole window was stationary).
 */
export function computeMovingSpeedKmh(distanceM, durationMs, stationaryMs) {
  if (!Number.isFinite(distanceM) || !Number.isFinite(durationMs)) return null;
  if (stationaryMs == null || !Number.isFinite(stationaryMs)) return null;
  const movingMs = durationMs - stationaryMs;
  if (movingMs <= 0) return null;
  return (distanceM / (movingMs / 1000)) * 3.6;
}

/**
 * Compute the average speed between two waypoints, 1-based indices,
 * order-independent.
 *
 * @param {Object} stage     Stage payload (with `waypoints` array)
 * @param {number} fromN     1-based From WP number
 * @param {number} toN       1-based To WP number
 * @returns {{ ok: true, result: WpSpeedResult }
 *         | { ok: false, error: { code: string, message: string } }}
 */
export function computeWpSpeed(stage, fromN, toN) {
  const waypoints = stage?.waypoints;
  if (!Array.isArray(waypoints) || waypoints.length === 0) {
    return {
      ok: false,
      error: { code: "no_waypoints", message: "Stage has no waypoints." },
    };
  }

  const a = Number(fromN);
  const b = Number(toN);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) {
    return {
      ok: false,
      error: {
        code: "bad_input",
        message: "Waypoint numbers must be positive whole numbers.",
      },
    };
  }

  const lo = Math.min(a, b);
  const hi = Math.max(a, b);

  if (hi > waypoints.length) {
    return {
      ok: false,
      error: {
        code: "out_of_range",
        message: `Stage has ${waypoints.length} waypoints — ${hi} is out of range.`,
      },
    };
  }

  if (lo === hi) {
    return {
      ok: false,
      error: {
        code: "same_waypoint",
        message: "From and To are the same waypoint.",
      },
    };
  }

  const from = waypoints[lo - 1];
  const to = waypoints[hi - 1];

  const ta = parseT(from);
  const tb = parseT(to);
  if (ta == null || tb == null) {
    return {
      ok: false,
      error: {
        code: "missing_timestamp",
        message: `WP ${ta == null ? lo : hi} is missing its timestamp.`,
      },
    };
  }

  const da = tryGetDistanceM(stage, from, lo - 1);
  const db = tryGetDistanceM(stage, to, hi - 1);
  if (da == null || db == null) {
    return {
      ok: false,
      error: {
        code: "missing_distance",
        message: `WP ${da == null ? lo : hi} is missing its distance-from-start.`,
      },
    };
  }

  const durationMs = tb - ta;
  const distanceM = db - da;
  const speedMps = durationMs > 0 ? distanceM / (durationMs / 1000) : 0;

  return {
    ok: true,
    result: {
      fromIdx: lo - 1,
      toIdx: hi - 1,
      from,
      to,
      fromLabel: labelFor(from),
      toLabel: labelFor(to),
      durationMs,
      distanceM,
      speedMps,
      speedKmh: speedMps * 3.6,
    },
  };
}

/** "1 h 22 min 22 s" — used by both Record / Review panels. */
export function formatDuration(ms) {
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

/** "08:10:23" — local time, 24 h. */
export function formatClockTime(iso) {
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
