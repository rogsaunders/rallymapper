// src/lib/planLimits.js
//
// Single source of truth for plan tier limits and enforcement helpers.
//
// Usage:
//   import { getLimits, countLocalStages } from "./planLimits";
//   const limits = getLimits(plan);          // { stages, waypoints, fullExport }
//   const saved  = countLocalStages(owner);  // sync, localStorage-backed

import { supabase } from "./supabaseClient";

// ── Tier definitions ──────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
  free: {
    stages:     1,
    waypoints:  20,
    fullExport: false, // GPX core files only — no Hema/Garmin/KML/roadbook
  },
  solo: {
    stages:     Infinity,
    waypoints:  Infinity,
    fullExport: true,
  },
  pro: {
    stages:     Infinity,
    waypoints:  Infinity,
    fullExport: true,
  },
  event_pass: {
    stages:     Infinity,
    waypoints:  Infinity,
    fullExport: true,
  },
};

/**
 * Return the limits object for a given plan string.
 * Normalises 'solo_monthly' / 'solo_yearly' → 'solo' and
 * 'pro_monthly' / 'pro_yearly' → 'pro' before lookup.
 * Defaults to 'free' for any unrecognised value (safe fallback).
 */
export function getLimits(plan) {
  const normalised = (plan ?? "")
    .replace(/_monthly$/, "")
    .replace(/_yearly$/, "");
  return PLAN_LIMITS[normalised] ?? PLAN_LIMITS.free;
}

// ── Stage count helpers ───────────────────────────────────────────────────────

/**
 * Count stages saved in localStorage for a given owner key.
 * Synchronous — safe to call inside event handlers.
 */
export function countLocalStages(owner) {
  if (!owner) return 0;
  const prefix = `rm_stage:${owner}:`;
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i)?.startsWith(prefix)) count++;
  }
  return count;
}

/**
 * Count stages saved to Supabase for an authenticated user.
 * Async — use for a secondary check when online.
 */
export async function countRemoteStages(userId) {
  if (!userId) return 0;
  const { count, error } = await supabase
    .from("stage_exports")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    console.warn("planLimits: countRemoteStages failed", error.message);
    return 0;
  }
  return count ?? 0;
}

// ── Upgrade prompt messages ───────────────────────────────────────────────────

export const UPGRADE_REASONS = {
  stage_limit:
    "Free accounts are limited to 1 saved stage.\n\nUpgrade to Solo or Pro for unlimited stages.",
  waypoint_limit:
    "Free accounts are limited to 20 waypoints per stage.\n\nUpgrade to Solo or Pro for unlimited waypoints.",
};
