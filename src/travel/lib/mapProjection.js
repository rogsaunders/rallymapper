// src/travel/lib/mapProjection.js
//
// Pure geometry helpers for the Travel Mode live route map (RouteMap.jsx).
//
// Projection: Web Mercator (the standard slippy-map projection), so the
// vector route/markers and the optional raster tile backdrop (Phase 2)
// stay pixel-aligned by construction — the same property staticMapRenderer
// relies on. lonLatToWorldPixel mirrors that module's formula exactly.
//
// The map is vector-first: it draws the recorded track as a line and works
// with NO tiles at all (offline, in no-signal terrain). Tiles are an
// optional backdrop layered behind, using the same fractional zoom this
// module computes. See project_travel_livemap.
//
// No React/DOM dependencies here so it can be unit-tested in isolation.

import { bearingBetweenPoints } from "../../roadbook/geo";

const TILE_SIZE = 256;

/**
 * Project (lat, lon) to absolute world-pixel coordinates at `zoom`.
 * `zoom` may be fractional (the tile layer rounds it for actual tiles).
 * Origin (0,0) is the top-left of the world at this zoom; y increases
 * southward. Identical math to staticMapRenderer.lonLatToWorldPixel.
 */
export function lonLatToWorldPixel(lat, lon, zoom) {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * scale;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
  return { x, y };
}

// Zoom-independent normalised Mercator coords in [0,1], used only to pick
// the fit zoom.
function mercNorm(lat, lon) {
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: (lon + 180) / 360,
    y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI),
  };
}

/**
 * Downsample a dense recorded track to at most `maxPoints` for rendering.
 * A stage is ~20 k points at 5 m spacing — far more than a legible line
 * needs, and too many SVG nodes to redraw live. Stride decimation keeps
 * the shape; first and last points are always kept.
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
 * points ahead so it isn't jittery. Returns null if it can't be computed.
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
 * Fit `points` into a `width`×`height` viewport in Web Mercator.
 *
 * @returns {{ project(lat,lon)->{x,y}, zoom, centerLat, centerLon }}
 *   - project: lat/lon -> viewport px (fractional zoom)
 *   - zoom: fractional zoom that fits the points (clamped to min/maxZoom)
 *   - centerLat/centerLon: viewport centre (also feeds the tile layer)
 */
export function fitView(points, width, height, opts = {}) {
  const { padding = 24, minZoom = 2, maxZoom = 19 } = opts;
  const valid = (points || []).filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon),
  );
  if (valid.length === 0 || width <= 0 || height <= 0) {
    return {
      project: () => ({ x: width / 2, y: height / 2 }),
      zoom: minZoom,
      centerLat: 0,
      centerLon: 0,
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

  // Normalised spans (zoom-independent); guard against zero for a single
  // point or a perfectly axis-aligned line.
  const nSW = mercNorm(minLat, minLon);
  const nNE = mercNorm(maxLat, maxLon);
  const normSpanX = Math.abs(nNE.x - nSW.x) || 1e-9;
  const normSpanY = Math.abs(nSW.y - nNE.y) || 1e-9; // south has larger y
  const innerW = Math.max(1, width - 2 * padding);
  const innerH = Math.max(1, height - 2 * padding);

  // Largest zoom where normSpan · TILE_SIZE · 2^zoom still fits.
  const zx = Math.log2(innerW / (normSpanX * TILE_SIZE));
  const zy = Math.log2(innerH / (normSpanY * TILE_SIZE));
  let zoom = Math.min(zx, zy);
  if (!Number.isFinite(zoom)) zoom = maxZoom;
  zoom = Math.max(minZoom, Math.min(maxZoom, zoom));

  const cw = lonLatToWorldPixel(centerLat, centerLon, zoom);
  function project(lat, lon) {
    const p = lonLatToWorldPixel(lat, lon, zoom);
    return { x: p.x - cw.x + width / 2, y: p.y - cw.y + height / 2 };
  }
  return { project, zoom, centerLat, centerLon };
}
