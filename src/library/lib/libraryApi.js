// src/library/lib/libraryApi.js
//
// Read-only data layer for the Route Library storefront (Phase A — free
// catalogue). Uses the shared anon Supabase client; RLS lets anonymous
// visitors read `published` listings and their versions, so browse/detail
// need no sign-in.
//
// Phase A keeps route files in a PUBLIC storage bucket, so downloads are a
// plain public URL (no signed-URL function). Phase B switches to private +
// signed URLs + a purchase/entitlement check.

import { supabase } from "../../lib/supabaseClient";

// Columns for the browse grid (kept lean — detail fetches everything).
const LIST_COLS =
  "id,title,summary,activity,sub_type,region,country,distance_km," +
  "stage_count,waypoint_count,difficulty,surface,price_cents,currency," +
  "preview_path,download_count,published_at";

/**
 * List published listings, newest first. Optional filters:
 *   { search, activity, country }
 * `search` runs against the generated full-text vector (websearch syntax).
 */
export async function listPublishedRoutes({ search, activity, country } = {}) {
  let q = supabase
    .from("route_listings")
    .select(LIST_COLS)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(60);

  if (activity) q = q.eq("activity", activity);
  if (country) q = q.eq("country", country);
  if (search && search.trim()) {
    q = q.textSearch("search_tsv", search.trim(), {
      type: "websearch",
      config: "english",
    });
  }

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Fetch one published listing plus its versions, or null if not found. */
export async function getListing(id) {
  const { data, error } = await supabase
    .from("route_listings")
    .select(
      "*, route_versions(id,version,storage_path,file_bytes,format_version,created_at)",
    )
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The latest version of a listing (highest version number), or null. */
export function latestVersion(listing) {
  const versions = listing?.route_versions ?? [];
  if (!versions.length) return null;
  return [...versions].sort((a, b) => b.version - a.version)[0];
}

/** Public URL for a preview thumbnail object (or null). */
export function previewUrl(path) {
  if (!path) return null;
  return supabase.storage.from("route-previews").getPublicUrl(path).data
    .publicUrl;
}

/** Public URL for a route file object (Phase A: public bucket). */
export function fileUrl(path) {
  if (!path) return null;
  return supabase.storage.from("route-files").getPublicUrl(path).data.publicUrl;
}
