// src/library/lib/preview.js
//
// Generate a static map thumbnail for a Route Library listing from a parsed
// roadbook bundle (output of parseRouteFile). Reuses the canvas-based
// staticMapRenderer (no Leaflet, OSM tiles are CORS-enabled so the canvas
// stays untainted and toBlob works). Best-effort — callers ignore failures.

import { renderMapToCanvas, computeBounds } from "../../export/staticMapRenderer";

function toLatLon(p) {
  const lat = Number(p?.lat);
  const lon = Number(p?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function bytesToBase64(bytes) {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Render a preview PNG and return it base64-encoded (no data: prefix), or
 * null if there aren't enough coordinates to draw a meaningful map.
 */
export async function generatePreviewBase64({ roadbook, trackPoints } = {}) {
  let points = (trackPoints ?? []).map(toLatLon).filter(Boolean);
  if (points.length < 2) {
    points = (roadbook?.rows ?? []).map(toLatLon).filter(Boolean);
  }
  if (points.length < 2) return null;

  const bounds = computeBounds(points);
  if (!bounds) return null;

  const canvas = await renderMapToCanvas({
    routePositions: points,
    bounds,
    tileSource: "osm",
    // Kept modest: the thumbnail rides along in the submit payload next to the
    // (much larger) route ZIP, and Netlify functions cap the request body.
    width: 640,
    height: 360,
    padding: 24,
  });

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) return null;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  return bytesToBase64(bytes);
}
