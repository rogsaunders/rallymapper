// src/travel/lib/alongTrack.js
//
// Project a live GPS position onto the recorded GPS track and compute
// the remaining along-track distance to a target track index.
//
// Why this matters in Travel Mode:
//
//   Straight-line (haversine) distance is fast but diverges from the
//   roadbook's kmPartial/kmTotal values on any winding road. Rally
//   navigators want a number that MATCHES what their printed roadbook
//   says — so we project the user onto the recorded track and sum
//   segments forward to the target.
//
// Performance:
//
//   A full nearest-neighbour scan over a 100 km recorded track (~20 k
//   points at 5 m intervals) is ~20 k haversine calls per GPS tick.
//   That's tolerable on a modern iPhone but burns battery over a
//   multi-hour drive. So we accept an optional userHintIdx — the
//   user's nearest-track index from the previous tick — and search
//   only ±50 points around it (with a fallback to full scan if we
//   don't find a clear minimum).

import { distanceM } from "../../roadbook/geo";

// Beyond this distance from any track point, the user is considered
// "off-track" and we fall back to straight-line distance.
const OFF_TRACK_THRESHOLD_M = 100;

// Local search window around the hint index.
const HINT_SEARCH_WINDOW = 50;

/**
 * Find the index of the track point nearest to `target`.
 * If hintIdx is provided, search only the ±HINT_SEARCH_WINDOW
 * neighbourhood around it; expand to full scan if the local minimum
 * is on the edge of that window (suggests we drifted out of it).
 *
 * @param {Array<{lat:number,lon:number}>} trackPoints
 * @param {{lat:number,lon:number}} target
 * @param {number|null} hintIdx
 * @returns {{ idx: number, distance: number }}
 */
export function findNearestTrackIndex(trackPoints, target, hintIdx = null) {
  const n = trackPoints?.length || 0;
  if (n === 0) return { idx: -1, distance: Infinity };

  // Local window search
  if (
    Number.isFinite(hintIdx) &&
    hintIdx >= 0 &&
    hintIdx < n
  ) {
    const lo = Math.max(0, hintIdx - HINT_SEARCH_WINDOW);
    const hi = Math.min(n - 1, hintIdx + HINT_SEARCH_WINDOW);
    let bestIdx = hintIdx;
    let bestDist = Infinity;
    for (let i = lo; i <= hi; i++) {
      const d = distanceM(target, trackPoints[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    // If best is in the interior of the window we trust it; otherwise
    // fall through to a full scan.
    if (bestIdx > lo + 2 && bestIdx < hi - 2) {
      return { idx: bestIdx, distance: bestDist };
    }
  }

  // Full scan
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    const d = distanceM(target, trackPoints[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return { idx: bestIdx, distance: bestDist };
}

/**
 * Precompute the nearest-track index for every roadbook row.
 * Call once at roadbook-load time. Each row gains a `_trackIdx` field.
 *
 * @returns the same rows array with `_trackIdx` set where possible.
 */
export function annotateRowsWithTrackIdx(rows, trackPoints) {
  if (!Array.isArray(rows) || !Array.isArray(trackPoints) || trackPoints.length === 0) {
    return rows || [];
  }
  return rows.map((row) => {
    if (
      !Number.isFinite(Number(row.lat)) ||
      !Number.isFinite(Number(row.lon))
    ) {
      return row;
    }
    const { idx } = findNearestTrackIndex(trackPoints, {
      lat: Number(row.lat),
      lon: Number(row.lon),
    });
    return { ...row, _trackIdx: idx };
  });
}

/**
 * Compute the remaining distance from a live user position to the
 * track point at `targetTrackIdx`, summed along the recorded track.
 *
 * Returns:
 *   {
 *     distance: number,     // metres
 *     method: "along-track" | "straight-line" | "passed",
 *     userIdx: number,      // user's nearest track index (cache hint
 *                           //   for next tick)
 *   }
 *
 * `method` semantics:
 *   - "along-track":   normal case, user is on-track
 *   - "straight-line": user is >100 m from any track point; fell back
 *                      to haversine
 *   - "passed":        user is at or past the target (driving past
 *                      where the row was recorded); distance is the
 *                      straight-line distance back
 *
 * @param {Array<{lat:number,lon:number}>} trackPoints
 * @param {number} targetTrackIdx
 * @param {{lat:number,lon:number}} userPos
 * @param {number|null} userHintIdx
 */
export function computeAlongTrackDistance(
  trackPoints,
  targetTrackIdx,
  userPos,
  userHintIdx = null,
) {
  if (
    !Array.isArray(trackPoints) ||
    trackPoints.length === 0 ||
    !Number.isFinite(targetTrackIdx) ||
    targetTrackIdx < 0 ||
    !userPos
  ) {
    return { distance: NaN, method: "straight-line", userIdx: -1 };
  }

  const { idx: userIdx, distance: userOffsetM } = findNearestTrackIndex(
    trackPoints,
    userPos,
    userHintIdx,
  );

  // User is way off the recorded track — straight-line it
  if (userOffsetM > OFF_TRACK_THRESHOLD_M) {
    const target = trackPoints[targetTrackIdx];
    return {
      distance: distanceM(userPos, target),
      method: "straight-line",
      userIdx,
    };
  }

  // User has passed the target (drove on without manual advance, or
  // the user manually went back to look at a prior row)
  if (userIdx >= targetTrackIdx) {
    return {
      distance: distanceM(userPos, trackPoints[targetTrackIdx]),
      method: "passed",
      userIdx,
    };
  }

  // Normal case: sum segments along the track from userIdx to target.
  // Include the user's offset from the nearest track point so the
  // number stays smooth as they drive (avoids "jump down by ~30 m
  // every time the nearest-point bucket flips").
  let total = userOffsetM;
  for (let i = userIdx; i < targetTrackIdx; i++) {
    total += distanceM(trackPoints[i], trackPoints[i + 1]);
  }
  return { distance: total, method: "along-track", userIdx };
}
