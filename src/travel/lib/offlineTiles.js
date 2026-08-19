// src/travel/lib/offlineTiles.js
//
// Phase 2b — pre-fetch the map tiles covering a stage's route corridor so
// the live map works offline in no-signal terrain. Purely additive to the
// tiles-when-online path: fetching a tile URL populates the service
// worker's CacheFirst store (see vite.travel.config.js runtimeCaching), so
// the SAME URLs TileLayer requests later are served from cache offline.
//
// Usage-policy note: bulk-caching OSM/Esri tiles is against their tile
// usage policies; this is bounded (a tile cap + explicit user opt-in) and
// fine for personal/beta use. Before commercial launch, point the sources
// at a caching-permitted provider — a config change in staticMapRenderer's
// TILE_SOURCES. See project_travel_livemap.
//
// No React/DOM here (except fetch) so the corridor math is unit-testable.

import { decimateTrack } from "./mapProjection";

const TILE_SIZE_BYTES_EST = 25 * 1024; // ~25 KB/tile average (JPEG imagery)

function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}
function latToTileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) *
      Math.pow(2, z),
  );
}

export function buildTileUrl(cfg, z, x, y) {
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

/**
 * Every {z,x,y} tile covering the route corridor — each track point's tile
 * plus a `buffer`-tile ring — across zoom levels [minZoom, maxZoom].
 *
 * The corridor is built low zoom → high zoom and stops adding a level once
 * the running total would exceed `cap` (the lowest level is always kept).
 * So long routes gracefully degrade to fewer zoom levels rather than
 * ballooning storage.
 *
 * @returns {{ tiles: {z,x,y}[], zooms: number[], count: number, bytesEst: number }}
 */
export function corridorTiles(
  trackPoints,
  { minZoom = 13, maxZoom = 16, buffer = 1, cap = 1500 } = {},
) {
  const pts = decimateTrack(trackPoints || [], 4000).filter(
    (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)),
  );
  if (pts.length === 0) {
    return { tiles: [], zooms: [], count: 0, bytesEst: 0 };
  }

  const tiles = [];
  const zooms = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const set = new Set();
    const n = Math.pow(2, z);
    for (const p of pts) {
      const cx = lonToTileX(Number(p.lon), z);
      const cy = latToTileY(Number(p.lat), z);
      for (let dx = -buffer; dx <= buffer; dx++) {
        for (let dy = -buffer; dy <= buffer; dy++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= n || y >= n) continue;
          set.add(x + "/" + y);
        }
      }
    }
    // Keep the lowest zoom unconditionally; stop before blowing the cap.
    if (zooms.length > 0 && tiles.length + set.size > cap) break;
    for (const kk of set) {
      const [x, y] = kk.split("/").map(Number);
      tiles.push({ z, x, y });
    }
    zooms.push(z);
  }

  return {
    tiles,
    zooms,
    count: tiles.length,
    bytesEst: tiles.length * TILE_SIZE_BYTES_EST,
  };
}

/** Stable-ish identity for a stage, for the per-stage "saved" flag. */
export function stageKey(trackPoints) {
  const n = trackPoints?.length || 0;
  if (n === 0) return null;
  const a = trackPoints[0];
  const b = trackPoints[n - 1];
  return `${n}_${Number(a.lat).toFixed(4)}_${Number(a.lon).toFixed(4)}_${Number(
    b.lat,
  ).toFixed(4)}_${Number(b.lon).toFixed(4)}`;
}

/**
 * Fetch every corridor tile so the service worker caches it. Concurrency-
 * limited; tolerant of individual failures (a dead tile can't stall the
 * batch). Reports progress via onProgress({done,total,failed}). Abortable
 * via an AbortSignal.
 */
export async function downloadCorridor(
  tiles,
  cfg,
  { concurrency = 6, onProgress, signal } = {},
) {
  const total = tiles.length;
  let done = 0;
  let failed = 0;
  let i = 0;

  async function worker() {
    while (i < total) {
      if (signal?.aborted) return;
      const t = tiles[i++];
      try {
        const res = await fetch(buildTileUrl(cfg, t.z, t.x, t.y), {
          mode: "cors",
          signal,
        });
        if (!res.ok) failed++;
      } catch {
        failed++; // network/abort — keep going
      }
      done++;
      onProgress?.({ done, total, failed });
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return { done, failed, total };
}

/** Human-readable size, e.g. "38 MB" / "620 KB". */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
