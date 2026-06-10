// src/travel/hooks/useStartProximity.js
//
// Compute distance + bearing from the user's live GPS to the recorded
// stage start, and bucket the result into a traffic-light status the
// PreStart screen can render at a glance.
//
// Pure-derivation: the only React surface is useMemo over the inputs.
// Buckets:
//   - "no-start"   start coords missing from the loaded stage
//   - "no-gps"     start present but no GPS fix yet
//   - "far"        > 1000 m from start
//   - "approach"   100 m – 1000 m from start
//   - "near"       triggerRadiusM – 100 m
//   - "at-start"   within triggerRadiusM (default 30 m)

import { useMemo } from "react";
import { haversineM, bearingDeg } from "../../roadbook/geo";

const FAR_THRESHOLD_M = 1000;
const APPROACH_THRESHOLD_M = 100;

// Compass-octant labels for the bearing arrow.  Keeps the readout
// glance-readable ("↗ NE 420 m") without forcing the navigator to
// translate degrees in their head.
const COMPASS_OCTANTS = [
  { label: "N",  arrow: "↑" },
  { label: "NE", arrow: "↗" },
  { label: "E",  arrow: "→" },
  { label: "SE", arrow: "↘" },
  { label: "S",  arrow: "↓" },
  { label: "SW", arrow: "↙" },
  { label: "W",  arrow: "←" },
  { label: "NW", arrow: "↖" },
];

function bearingToOctant(deg) {
  if (!Number.isFinite(deg)) return null;
  // 0° = N; octants every 45° centred on N, NE, E, …  Add half an
  // octant so 22.5–67.5° rounds to NE, etc.
  const idx = Math.floor(((deg + 22.5) % 360) / 45);
  return COMPASS_OCTANTS[idx];
}

export function useStartProximity({ startCoords, gps, triggerRadiusM = 30 }) {
  return useMemo(() => {
    if (!startCoords) {
      return { status: "no-start", distanceM: null, bearingDeg: null, octant: null };
    }
    if (!gps) {
      return { status: "no-gps", distanceM: null, bearingDeg: null, octant: null };
    }

    const d = haversineM(gps.lat, gps.lon, startCoords.lat, startCoords.lon);
    const b = bearingDeg(gps.lat, gps.lon, startCoords.lat, startCoords.lon);
    const oct = bearingToOctant(b);

    let status;
    if (d <= triggerRadiusM) status = "at-start";
    else if (d <= APPROACH_THRESHOLD_M) status = "near";
    else if (d <= FAR_THRESHOLD_M) status = "approach";
    else status = "far";

    return { status, distanceM: d, bearingDeg: b, octant: oct };
  }, [startCoords, gps, triggerRadiusM]);
}

/**
 * Human-readable distance for the pre-start readout.
 * Returns "—" when distance is null/non-finite.
 */
export function formatStartDistance(distanceM) {
  if (!Number.isFinite(distanceM)) return "—";
  if (distanceM >= 1000) return `${(distanceM / 1000).toFixed(2)} km`;
  if (distanceM >= 100) return `${Math.round(distanceM / 10) * 10} m`;
  return `${Math.round(distanceM)} m`;
}
