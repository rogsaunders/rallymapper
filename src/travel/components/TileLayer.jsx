// src/travel/components/TileLayer.jsx
//
// Raster map-tile backdrop for the Travel Mode live map (Phase 2). Draws
// Web Mercator tiles to a <canvas> positioned BEHIND the vector SVG in
// RouteMap. Uses the same fractional zoom + centre that RouteMap's
// fitView produced, so tiles and the vector route line up by construction.
//
// Vector-first, always: this layer is purely additive. Offline (or with a
// dead tile source) the fetches just fail and the vector map shows through
// unchanged — no all-or-nothing failure. Tiles are rendered at the nearest
// integer zoom and scaled by 2^(zoom−tileZoom) to match the vector layer's
// fractional zoom exactly.
//
// Tile sources (all token-free) and attribution come from staticMapRenderer,
// shared with the PDF export path.

import React, { useEffect, useRef } from "react";
import { lonLatToWorldPixel } from "../lib/mapProjection";
import { TILE_SOURCES } from "../../export/staticMapRenderer";

const TILE_SIZE = 256;
const CACHE_MAX = 400;

// Module-level cache of successfully decoded tile images, keyed by URL.
// Panning revisits the same tiles constantly, so this keeps redraws instant
// (and flicker-free) after the first fetch.
const tileCache = new Map();

function buildTileUrl(cfg, z, x, y) {
  let url = cfg.template
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
  if (cfg.subdomains && cfg.subdomains.length) {
    const idx = Math.abs(x + y) % cfg.subdomains.length;
    url = url.replace("{s}", cfg.subdomains[idx]);
  }
  return url;
}

function getTile(url) {
  return new Promise((resolve) => {
    const cached = tileCache.get(url);
    if (cached) {
      resolve(cached);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (tileCache.size >= CACHE_MAX) {
        const oldest = tileCache.keys().next().value;
        tileCache.delete(oldest);
      }
      tileCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export default function TileLayer({
  tileSource,
  centerLat,
  centerLon,
  zoom,
  width,
  height,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !height || !Number.isFinite(zoom)) return;
    const cfg = TILE_SOURCES[tileSource] || TILE_SOURCES.osm;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Render at the nearest integer zoom the source supports, scaled to the
    // vector layer's fractional zoom so everything aligns.
    const tileZoom = Math.max(0, Math.min(cfg.maxZoom ?? 19, Math.round(zoom)));
    const scale = Math.pow(2, zoom - tileZoom);
    const size = TILE_SIZE * scale;
    const cw = lonLatToWorldPixel(centerLat, centerLon, tileZoom);
    const n = Math.pow(2, tileZoom);

    // Visible tile range (world px window / TILE_SIZE).
    const leftWX = cw.x - width / 2 / scale;
    const rightWX = cw.x + width / 2 / scale;
    const topWY = cw.y - height / 2 / scale;
    const botWY = cw.y + height / 2 / scale;
    const minTX = Math.max(0, Math.floor(leftWX / TILE_SIZE));
    const maxTX = Math.min(n - 1, Math.floor(rightWX / TILE_SIZE));
    const minTY = Math.max(0, Math.floor(topWY / TILE_SIZE));
    const maxTY = Math.min(n - 1, Math.floor(botWY / TILE_SIZE));

    let cancelled = false;
    for (let tx = minTX; tx <= maxTX; tx++) {
      for (let ty = minTY; ty <= maxTY; ty++) {
        const sx = (tx * TILE_SIZE - cw.x) * scale + width / 2;
        const sy = (ty * TILE_SIZE - cw.y) * scale + height / 2;
        getTile(buildTileUrl(cfg, tileZoom, tx, ty)).then((img) => {
          if (cancelled || !img) return;
          // +1 px overlap hides hairline seams between scaled tiles.
          ctx.drawImage(img, sx, sy, size + 1, size + 1);
        });
      }
    }
    return () => {
      cancelled = true;
    };
  }, [tileSource, centerLat, centerLon, zoom, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{ width: "100%", height: "100%" }}
      aria-hidden="true"
    />
  );
}
