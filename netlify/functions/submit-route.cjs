// netlify/functions/submit-route.js
//
// Server-side route submission for the Route Library. The browser cannot
// upload to the route-files storage bucket directly — the storage service
// rejects authenticated client uploads regardless of RLS policy (proven via
// the Postgres logs). So the client sends the file + metadata here, and this
// function does the work with the SERVICE ROLE key, which bypasses storage
// RLS entirely. This is also the Phase B-ready architecture (authorised,
// server-mediated uploads).
//
// Required env vars (set on the Netlify project):
//   VITE_SUPABASE_URL          — already set for the app build
//   SUPABASE_SERVICE_ROLE_KEY  — service role secret (server-only)
//
// Auth: the caller's Supabase access token (Bearer) is verified, then we
// confirm they hold an `active` route_authors row before doing anything.

const { createClient } = require("@supabase/supabase-js");

const admin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VITE_SUPABASE_URL) {
    return json(500, { error: "Server not configured" });
  }

  // ── Authenticate the caller ────────────────────────────────────────────────
  const token = (event.headers.authorization || "").replace("Bearer ", "");
  if (!token) return json(401, { error: "Not signed in" });

  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(token);
  if (authError || !user) return json(401, { error: "Invalid session" });

  // ── Author gate (service role → bypasses RLS) ───────────────────────────────
  const { data: author } = await admin
    .from("route_authors")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (author?.status !== "active") {
    return json(403, { error: "Author access required" });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  const { fields, metadata, fileName, fileBase64, previewBase64 } = body || {};
  if (!fields?.title?.trim()) return json(400, { error: "A title is required." });
  if (!fileName || !fileBase64) return json(400, { error: "No route file." });

  const meta = metadata || {};

  // ── 1. Insert the listing (submitted → review queue) ────────────────────────
  const { data: listing, error: lerr } = await admin
    .from("route_listings")
    .insert({
      author_id: user.id,
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
      tags: Array.isArray(fields.tags) ? fields.tags : [],
      price_cents: 0,
      currency: "aud",
      stage_count: meta.stage_count ?? 1,
      distance_km: meta.distance_km ?? null,
      waypoint_count: meta.waypoint_count ?? null,
      min_lat: meta.min_lat ?? null,
      min_lon: meta.min_lon ?? null,
      max_lat: meta.max_lat ?? null,
      max_lon: meta.max_lon ?? null,
      center_lat: meta.center_lat ?? null,
      center_lon: meta.center_lon ?? null,
    })
    .select("id")
    .single();
  if (lerr) return json(400, { error: lerr.message });

  // ── 2. Upload the file (service role → bypasses storage RLS) ────────────────
  const buffer = Buffer.from(fileBase64, "base64");
  const safeName = String(fileName).replace(/[^\w.-]+/g, "_");
  const path = `${user.id}/${listing.id}/${safeName}`;
  const lowerName = safeName.toLowerCase();
  const contentType = lowerName.endsWith(".gpx")
    ? "application/gpx+xml"
    : lowerName.endsWith(".json")
      ? "application/json"
      : "application/zip";
  const { error: uerr } = await admin.storage
    .from("route-files")
    .upload(path, buffer, { contentType, upsert: true });
  if (uerr) {
    // Roll back the orphaned listing so a failed upload leaves nothing behind.
    await admin.from("route_listings").delete().eq("id", listing.id);
    return json(400, { error: `Upload failed: ${uerr.message}` });
  }

  // ── 3. Version row ──────────────────────────────────────────────────────────
  const { error: verr } = await admin.from("route_versions").insert({
    listing_id: listing.id,
    version: 1,
    storage_path: path,
    file_bytes: buffer.length,
    format_version: "1",
  });
  if (verr) return json(400, { error: verr.message });

  // ── 4. Preview thumbnail (best-effort) ──────────────────────────────────────
  // Generated client-side from the route's track. A failure here must not fail
  // the submission — the listing is already complete without it.
  if (previewBase64) {
    try {
      const previewPath = `${user.id}/${listing.id}/preview.png`;
      const { error: perr } = await admin.storage
        .from("route-previews")
        .upload(previewPath, Buffer.from(previewBase64, "base64"), {
          contentType: "image/png",
          upsert: true,
        });
      if (!perr) {
        await admin
          .from("route_listings")
          .update({ preview_path: previewPath })
          .eq("id", listing.id);
      }
    } catch (e) {
      console.warn("submit-route: preview upload failed", e?.message || e);
    }
  }

  return json(200, { listingId: listing.id });
};
