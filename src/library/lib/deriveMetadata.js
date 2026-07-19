// src/library/lib/deriveMetadata.js
//
// Derive Route Library listing metadata from a parsed roadbook bundle
// (the output of parseRouteFile). These are the complexity inputs that will
// drive the Phase B sliding-scale price, plus the bounding box for search.

import { haversineM } from "../../roadbook/geo";

function round1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

export function deriveListingMetadata({ roadbook, trackPoints, stageMeta } = {}) {
  const rows = roadbook?.rows ?? [];

  // Waypoint count — meaningful rows (exclude the synthetic START row).
  const real = rows.filter((r) => r?.source !== "synthetic");
  const waypoint_count = real.length || rows.length || 0;

  // Distance — prefer the roadbook's cumulative kmTotal, else sum the track.
  let distance_km = null;
  const lastKm = [...rows]
    .reverse()
    .find((r) => Number.isFinite(Number(r?.kmTotal)));
  if (lastKm) distance_km = Number(lastKm.kmTotal);
  if ((!distance_km || distance_km <= 0) && (trackPoints?.length ?? 0) > 1) {
    let m = 0;
    for (let i = 1; i < trackPoints.length; i++) {
      const a = trackPoints[i - 1];
      const b = trackPoints[i];
      if (
        [a?.lat, a?.lon, b?.lat, b?.lon].every((v) => Number.isFinite(Number(v)))
      ) {
        m += haversineM(Number(a.lat), Number(a.lon), Number(b.lat), Number(b.lon));
      }
    }
    distance_km = m / 1000;
  }
  distance_km = round1(distance_km);

  // Bounding box from any coords we can find (track points + located rows).
  const lats = [];
  const lons = [];
  const collect = (lat, lon) => {
    const la = Number(lat);
    const lo = Number(lon);
    if (Number.isFinite(la) && Number.isFinite(lo)) {
      lats.push(la);
      lons.push(lo);
    }
  };
  (trackPoints ?? []).forEach((p) => collect(p?.lat, p?.lon));
  rows.forEach((r) => collect(r?.lat, r?.lon));

  let bbox = {
    min_lat: null,
    min_lon: null,
    max_lat: null,
    max_lon: null,
    center_lat: null,
    center_lon: null,
  };
  if (lats.length) {
    const min_lat = Math.min(...lats);
    const max_lat = Math.max(...lats);
    const min_lon = Math.min(...lons);
    const max_lon = Math.max(...lons);
    bbox = {
      min_lat,
      min_lon,
      max_lat,
      max_lon,
      center_lat: (min_lat + max_lat) / 2,
      center_lon: (min_lon + max_lon) / 2,
    };
  }

  return {
    stage_count: 1, // a single export = one stage in Phase A
    distance_km,
    waypoint_count,
    ...bbox,
    // Suggestions to pre-fill the form (not stored directly):
    suggestedTitle: stageMeta?.stageName || stageMeta?.routeName || stageMeta?.title || "",
  };
}
