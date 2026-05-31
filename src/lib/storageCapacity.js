// src/lib/storageCapacity.js
//
// Measure browser localStorage usage so the UI can warn the user before
// Safari's ~5 MB-per-origin cap silently drops writes.
//
// Why this matters for RouteMapper: stages are persisted to localStorage
// under keys like `rm_stage:${owner}:${local_id}` (see planLimits.js).
// Each saved stage carries its full trackpoints + waypoints + roadbook,
// typically 50-200 KB per stage. Over a multi-day survey the per-origin
// cap is reachable; once hit, Safari silently drops localStorage writes
// — including the autosave draft, so an in-progress stage can be lost
// on a reload with no warning.
//
// Safari/WebKit stores localStorage values as UTF-16, so byte cost ≈
// (key.length + value.length) * 2 per entry. This is an estimate; the
// true cap also includes some per-key overhead, but it's close enough
// for a "you're approaching the limit" gauge.

const SOFT_LIMIT_BYTES = 5 * 1024 * 1024; // Safari iOS per-origin cap

/**
 * Sum bytes used by every entry in window.localStorage.
 * Returns 0 if localStorage is unavailable (SSR, blocked).
 */
export function getLocalStorageBytes() {
  if (typeof localStorage === "undefined") return 0;
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key == null) continue;
      const value = localStorage.getItem(key) ?? "";
      bytes += (key.length + value.length) * 2;
    }
  } catch (e) {
    console.warn("storageCapacity: getLocalStorageBytes failed", e);
    return 0;
  }
  return bytes;
}

/**
 * Snapshot of current localStorage usage relative to the Safari cap.
 *   bytes        — current usage
 *   limitBytes   — assumed soft limit (5 MB)
 *   percentUsed  — 0..100
 *   isWarning    — true when usage ≥ 80% of soft limit (4 MB)
 *   isCritical   — true when usage ≥ 95% of soft limit (4.75 MB)
 */
export function getStorageStatus() {
  const bytes = getLocalStorageBytes();
  const percentUsed = Math.min(100, (bytes / SOFT_LIMIT_BYTES) * 100);
  return {
    bytes,
    limitBytes: SOFT_LIMIT_BYTES,
    percentUsed,
    isWarning: percentUsed >= 80,
    isCritical: percentUsed >= 95,
  };
}

/**
 * Human-friendly byte formatter — "3.4 MB", "812 KB", "4 B".
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
