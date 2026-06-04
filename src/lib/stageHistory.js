// src/lib/stageHistory.js
//
// Utilities for listing and loading previously saved stages.
//
// Two storage backends are supported transparently:
//   • Supabase  — authenticated users (query meta column only for the list;
//                 load full payload only when a stage is opened)
//   • localStorage — guest users (scan rm_stage:{owner}:* keys)
//
// Returned records share a common shape:
//   {
//     localId:  string,          // UUID that identifies this save
//     meta:     object,          // stage metadata (name, date, counts, etc.)
//     source:   "supabase"|"local",
//     savedAt:  ISO8601 string,  // best-effort save timestamp
//   }

import { supabase } from "./supabaseClient.js";

const LOCAL_KEY_PREFIX = "rm_stage:";

// Hard upper bound on the History list. 200 covers a multi-day survey
// (Lachie's 24-day rally at 3-4 stages/day = ~75-80 stages, with
// generous headroom). Each row is a few hundred bytes of metadata, so
// the list scrolls fine; the Supabase query stays well under 100 KB.
// If a user exceeds this, the panel footer will surface that there are
// older stages not shown — at which point a Load More UI becomes the
// right next step.
export const STAGE_HISTORY_LIMIT = 200;

// ── Helpers ──────────────────────────────────────────────────────────────────

function metaSavedAt(meta) {
  return meta?.endedAt || meta?.startedAt || null;
}

// ── Supabase ─────────────────────────────────────────────────────────────────

/**
 * Fetch stage list for an authenticated user.
 * Selects only `local_id`, `meta`, and `created_at` — the heavy `payload`
 * column is excluded so the list loads quickly.
 */
async function listSupabaseStages(userId, limit = STAGE_HISTORY_LIMIT) {
  const { data, error } = await supabase
    .from("stage_exports")
    .select("local_id, meta, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("stageHistory: Supabase list failed", error.message);
    return [];
  }

  return (data || []).map((row) => ({
    localId: row.local_id,
    meta: row.meta || {},
    source: "supabase",
    savedAt: row.created_at || metaSavedAt(row.meta),
  }));
}

/**
 * Load the full payload for a single stage from Supabase.
 */
async function loadSupabaseStage(userId, localId) {
  const { data, error } = await supabase
    .from("stage_exports")
    .select("payload")
    .eq("user_id", userId)
    .eq("local_id", localId)
    .single();

  if (error || !data?.payload) {
    console.warn("stageHistory: Supabase load failed", error?.message);
    return null;
  }

  return data.payload;
}

// ── localStorage ──────────────────────────────────────────────────────────────

/**
 * Enumerate all rm_stage:{owner}:* keys and return metadata summaries.
 * Parses each value but discards the heavy roadbook / trackPoints arrays.
 */
function listLocalStages(owner) {
  const prefix = `${LOCAL_KEY_PREFIX}${owner}:`;
  const results = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;

    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const stage = JSON.parse(raw);
      const localId = key.slice(prefix.length);

      results.push({
        localId,
        meta: stage.meta || {},
        source: "local",
        savedAt: metaSavedAt(stage.meta) || stage.created_at || null,
      });
    } catch {
      // Corrupted entry — skip silently
    }
  }

  // Sort newest first
  results.sort((a, b) => {
    const ta = a.savedAt ? new Date(a.savedAt).getTime() : 0;
    const tb = b.savedAt ? new Date(b.savedAt).getTime() : 0;
    return tb - ta;
  });

  return results.slice(0, STAGE_HISTORY_LIMIT);
}

/**
 * Load the full stage object from localStorage.
 */
function loadLocalStage(owner, localId) {
  const key = `${LOCAL_KEY_PREFIX}${owner}:${localId}`;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List up to 20 saved stages, newest first.
 *
 * @param {string|null} userId   - Supabase user ID (null for guests)
 * @param {string}      owner    - localStorage owner key (userId or guestId)
 * @returns {Promise<Array>}
 */
export async function listSavedStages(userId, owner) {
  if (userId) {
    // Auth user: prefer Supabase but fall back to localStorage if offline
    try {
      const remote = await listSupabaseStages(userId);
      if (remote.length > 0) return remote;
    } catch {
      // Network error — fall through to local
    }
  }
  return listLocalStages(owner);
}

/**
 * Load the full stage payload for a history entry.
 *
 * @param {string|null} userId
 * @param {string}      owner
 * @param {object}      entry   - record from listSavedStages
 * @returns {Promise<object|null>}
 */
export async function loadSavedStage(userId, owner, entry) {
  if (entry.source === "supabase" && userId) {
    const stage = await loadSupabaseStage(userId, entry.localId);
    if (stage) return stage;
    // Fall back to local if Supabase fails (e.g. offline)
  }
  return loadLocalStage(owner, entry.localId);
}

/**
 * Remove a stage's local copy to free device storage. Intentionally does
 * NOT touch the Supabase copy — for a multi-day survey the user wants
 * to clear localStorage pressure without losing the cloud backup. If the
 * stage was previously synced, it will continue to appear in History
 * (served from Supabase the next time listSavedStages runs).
 *
 * Use deleteStagePermanently() if you actually want the entry gone — the
 * trash icon in StageHistoryPanel does that. This local-only helper is
 * kept for callers that explicitly want device-storage cleanup without
 * affecting the cloud.
 *
 * Returns true if a local entry was found and removed.
 */
export function deleteLocalStage(owner, localId) {
  if (!owner || !localId) return false;
  const key = `${LOCAL_KEY_PREFIX}${owner}:${localId}`;
  try {
    if (localStorage.getItem(key) == null) return false;
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.warn("stageHistory: deleteLocalStage failed", e);
    return false;
  }
}

/**
 * Remove a stage's row from Supabase. No-op (returns ok=true) when
 * `userId` is null — guests have nothing in the cloud.
 *
 * Relies on the table's RLS policy restricting deletes to the row's
 * owning user. Returns `{ ok: false, error }` on RPC error so the
 * caller can surface it.
 */
async function deleteSupabaseStage(userId, localId) {
  if (!userId) return { ok: true };
  if (!localId) return { ok: false, error: { message: "Missing localId" } };
  try {
    const { error } = await supabase
      .from("stage_exports")
      .delete()
      .eq("user_id", userId)
      .eq("local_id", localId);
    if (error) {
      console.warn("stageHistory: deleteSupabaseStage failed", error.message);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (e) {
    console.warn("stageHistory: deleteSupabaseStage threw", e);
    return { ok: false, error: { message: e?.message || String(e) } };
  }
}

/**
 * Permanently delete a saved stage from both the cloud and this
 * device. Used by the History panel's trash icon — the user's mental
 * model is "this stage goes away forever," not "free up some device
 * storage and let it reappear next time."
 *
 * Strategy:
 *   1. Attempt the cloud delete first. If it fails (offline, RLS,
 *      network), return early without touching the local copy — that
 *      way the entry stays visible and the user sees the error
 *      rather than a half-deleted state.
 *   2. If the cloud delete succeeds (or the user is a guest with no
 *      cloud copy), delete the local copy too.
 *
 * Returns:
 *   { ok: true }                                  — fully deleted
 *   { ok: false, error: { message } }             — cloud delete failed
 *
 * The local-only failure mode is not reported as an error — if the
 * cloud is gone the entry will not reappear, and a stale localStorage
 * key is benign.
 */
export async function deleteStagePermanently({ userId, owner, localId }) {
  const cloudResult = await deleteSupabaseStage(userId, localId);
  if (!cloudResult.ok) return cloudResult;

  // Cloud delete succeeded (or user is guest). Now clear the local
  // copy. Best-effort — if it fails the entry won't reappear in the
  // list anyway.
  try {
    deleteLocalStage(owner, localId);
  } catch (_) {}
  return { ok: true };
}

// ── Write-back ───────────────────────────────────────────────────────────────

const ACTIVE_DRAFT_KEY = "routemapper_stage_draft_v1";

/**
 * Persist an edited stage payload back to the source it came from.
 *
 * Used by Review Mode's edit-in-place flow. Handles three cases:
 *
 *   source === "active"
 *     • Active stage draft. Writes to `routemapper_stage_draft_v1`.
 *       Record mode will pick up the edit on next remount via the
 *       "Resume unsaved stage?" gate.
 *
 *   source === "local"
 *     • Historical stage saved only on this device. Writes to
 *       `rm_stage:{owner}:{localId}`.
 *
 *   source === "supabase"
 *     • Historical stage backed by Supabase. Upserts the cloud row
 *       AND refreshes the local copy so listSavedStages's offline
 *       fallback stays consistent.
 *
 * @param {Object}  args
 * @param {?string} args.userId    Auth user id (null for guests).
 * @param {string}  args.owner     userId || guestOwnerId.
 * @param {string}  args.source    "active" | "local" | "supabase".
 * @param {?string} args.localId   Required for "local"/"supabase".
 * @param {Object}  args.payload   Full stage object to persist.
 * @param {?Object} [args.meta]    Optional Supabase meta override; if
 *                                 omitted, falls back to payload.meta
 *                                 or a minimal summary derived from
 *                                 the payload itself.
 * @returns {Promise<{ok: boolean, error?: Error}>}
 */
export async function saveStageMutation({
  userId,
  owner,
  source,
  localId,
  payload,
  meta,
}) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: new Error("payload required") };
  }

  if (source === "active") {
    try {
      localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(payload));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  if (!localId) {
    return {
      ok: false,
      error: new Error("localId required for historical mutation"),
    };
  }

  if (source === "local") {
    try {
      localStorage.setItem(
        `${LOCAL_KEY_PREFIX}${owner}:${localId}`,
        JSON.stringify(payload),
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  if (source === "supabase") {
    if (!userId) {
      return {
        ok: false,
        error: new Error("supabase source requires userId"),
      };
    }
    // Refresh the local cache so an offline list still shows the
    // edited version. A local write failure here is non-fatal — the
    // Supabase write is the source of truth.
    try {
      localStorage.setItem(
        `${LOCAL_KEY_PREFIX}${owner}:${localId}`,
        JSON.stringify(payload),
      );
    } catch (_) {
      /* non-fatal */
    }
    const effectiveMeta = meta ?? payload.meta ?? {
      tripName: payload.tripName,
      dayNumber: payload.dayNumber,
      routeNumber: payload.routeNumber,
      stageNumber: payload.stageNumber,
    };
    const { error } = await supabase
      .from("stage_exports")
      .upsert(
        {
          user_id: userId,
          local_id: localId,
          meta: effectiveMeta,
          payload,
        },
        { onConflict: "user_id,local_id" },
      );
    if (error) return { ok: false, error };
    return { ok: true };
  }

  return {
    ok: false,
    error: new Error(`unknown source: ${source}`),
  };
}
