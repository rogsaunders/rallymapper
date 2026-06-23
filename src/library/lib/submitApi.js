// src/library/lib/submitApi.js
//
// Author submission API for the Route Library (Phase A). All writes go
// through RLS: only an `active` route_authors row may insert listings/
// versions and upload into their own storage folder. Publishing is NOT here
// — status transitions to published happen via the service role (curation).

import { supabase } from "../../lib/supabaseClient";

/** 'active' | 'paused' | 'removed' | null (not an author). */
export async function getAuthorStatus(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("route_authors")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("submitApi: getAuthorStatus failed", error.message);
    return null;
  }
  return data?.status ?? null;
}

/**
 * Create a listing in `submitted` state (ready for curation), upload the
 * route file, and record version 1. Returns the new listing id.
 *
 * Order matters for RLS + cleanup: insert the listing first (so we have an
 * id and ownership), then upload under <uid>/<listingId>/, then the version
 * row pointing at it.
 */
export async function submitRoute({ userId, file, fields, metadata }) {
  if (!userId) throw new Error("Not signed in.");
  if (!file) throw new Error("No route file selected.");
  if (!fields?.title?.trim()) throw new Error("A title is required.");

  // 1. Listing (submitted → enters the review queue).
  const { data: listing, error: lerr } = await supabase
    .from("route_listings")
    .insert({
      author_id: userId,
      status: "submitted",
      title: fields.title.trim(),
      summary: fields.summary?.trim() || null,
      description: fields.description?.trim() || null,
      activity: fields.activity || null,
      sub_type: fields.sub_type?.trim() || null,
      region: fields.region?.trim() || null,
      country: fields.country?.trim() || null,
      surface: fields.surface || null,
      difficulty: fields.difficulty || null,
      tags: fields.tags ?? [],
      price_cents: 0,
      currency: "aud",
      stage_count: metadata.stage_count,
      distance_km: metadata.distance_km,
      waypoint_count: metadata.waypoint_count,
      min_lat: metadata.min_lat,
      min_lon: metadata.min_lon,
      max_lat: metadata.max_lat,
      max_lon: metadata.max_lon,
      center_lat: metadata.center_lat,
      center_lon: metadata.center_lon,
    })
    .select("id")
    .single();
  if (lerr) throw lerr;

  // 2. Upload the route file into the author's folder.
  const safeName = file.name.replace(/[^\w.-]+/g, "_");
  const path = `${userId}/${listing.id}/${safeName}`;
  const { error: uerr } = await supabase.storage
    .from("route-files")
    .upload(path, file, {
      upsert: true,
      contentType: file.type || "application/zip",
    });
  if (uerr) {
    // Best-effort rollback so we don't leave an orphan listing with no file.
    await supabase.from("route_listings").delete().eq("id", listing.id);
    throw uerr;
  }

  // 3. Version row.
  const { error: verr } = await supabase.from("route_versions").insert({
    listing_id: listing.id,
    version: 1,
    storage_path: path,
    file_bytes: file.size,
    format_version: "1",
  });
  if (verr) throw verr;

  return listing.id;
}
