// src/travel/lib/mapProjection.js
//
// Pure geometry helpers for the Travel Mode live route map (RouteMap.jsx).
//
// The map is deliberately VECTOR-ONLY — no map tiles. Rallies run in
// no-signal terrain (outback, ranges), where streaming tiles would show
// blank squares exactly where the navigator needs them. Drawing the
// recorded track as a line on a plain background works offline, forever,
// and is cheap to redraw every GPS tick. See project_travel_livemap.
//
// This module has no React/DOM dependencies so it can be unit-tested in
// isolation (see the bundled node check used during development).
//
// Projection model: local equirectangular. For the few-km spans this map
// shows, we treat the area as flat: convert lat/lon to local metres about
// a centre point (with cos(lat) correction on longitude), then scale
// uniformly into the SVG viewport so the route keeps its true shape (no
// stretching). North is up (y is flipped).

import { bearingBetweenPoints } from "../../roadbook/geo";

const M_PER_DEG_LAT = 110540;
function mPerDegLon(lat) {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

/**
 * Downsample a dense recorded track to at most `maxPoints` for rendering.
 * A recorded stage is ~20 k points at 5 m spacing — far more than a
 * legible line needs, and too many SVG nodes to redraw live. Stride
 * decimation preserves the overall shape; the first and last points are
 * always kept. Call once at load and memoise.
 */
export function decimateTrack(points, maxPoints = 500) {
  const n = points?.length || 0;
  if (n <= maxPoints) return points || [];
  const step = Math.ceil(n / maxPoints);
  const out = [];
  for (let i = 0; i < n; i += step) out.push(points[i]);
  if (out[out.length - 1] !== points[n - 1]) out.push(points[n - 1]);
  return out;
}

/**
 * Heading (deg, 0=N clockwise) of the track at index `idx`, looking a few
 * points ahead so it isn't jittery. Used to orient the position arrow.
 * Returns null if it can't be computed.
 */
export function headingAlongTrack(points, idx, lookahead = 4) {
  const n = points?.length || 0;
  if (!Number.isFinite(idx) || idx < 0 || idx >= n - 1) return null;
  const a = points[idx];
  const b = points[Math.min(n - 1, idx + lookahead)];
  if (!a || !b) return null;
  return bearingBetweenPoints(a, b);
}

/**
 * Build a projector that fits `points` into a `width`×`height` viewport.
 *
 * @param points  array of {lat,lon} to frame
 * @param opts.padding   px inset from the edges (default 24)
 * @param opts.minSpanM  don't zoom in tighter than this many metres across
 *                       (avoids absurd zoom when the focus points are
 *                       almost coincident)
 * @param opts.maxSpanM  don't zoom out wider than this many metres across
 * @returns { project(lat,lon)->{x,y}, scale }  scale is px per metre
 */
export function fitProjector(points, width, height, opts = {}) {
  const { padding = 24, minSpanM = 0, maxSpanM = Infinity } = opts;
  const valid = (points || []).filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon),
  );
  if (valid.length === 0) {
    return {
      project: () => ({ x: width / 2, y: height / 2 }),
      scale: 1,
    };
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of valid) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;
  const mLon = mPerDegLon(centerLat);

  const toX = (lon) => (lon - centerLon) * mLon;
  const toY = (lat) => (lat - centerLat) * M_PER_DEG_LAT;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of valid) {
    const x = toX(p.lon);
    const y = toY(p.lat);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  let scale = Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY);
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  // Clamp the visible span (metres across the viewport width = width/scale).
  const visSpanM = width / scale;
  if (minSpanM && visSpanM < minSpanM) scale = width / minSpanM;
  if (maxSpanM !== Infinity && visSpanM > maxSpanM) scale = width / maxSpanM;

  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  function project(lat, lon) {
    return {
      x: width / 2 + (toX(lon) - midX) * scale,
      y: height / 2 - (toY(lat) - midY) * scale, // y flipped: north up
    };
  }
  return { project, scale };
}
