// netlify/functions/admin-listings.js
//
// Admin curation for the Route Library: list the review queue and
// publish / reject / unpublish listings. Authors cannot self-publish (RLS
// blocks the status transition), so this runs with the SERVICE ROLE key and
// gates on the caller's `route_authors.is_admin` flag.
//
// POST { action: "list" }                        → { listings: [...] }
// POST { action: "publish",   id }               → { ok: true }
// POST { action: "reject",    id, reason? }       → { ok: true }
// POST { action: "unpublish", id }               → { ok: true }
//
// Required env (already set for submit-route): VITE_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.

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

  // Authenticate the caller.
  const token = (event.headers.authorization || "").replace("Bearer ", "");
  if (!token) return json(401, { error: "Not signed in" });
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(token);
  if (authError || !user) return json(401, { error: "Invalid session" });

  // Authorise: must be an admin.
  const { data: authorRow, error: adminErr } = await admin
    .from("route_authors")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminErr) return json(500, { error: "Admin check failed" });
  if (!authorRow?.is_admin) return json(403, { error: "Not authorised" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  const { action, id, reason } = body;

  if (action === "list") {
    // The review queue: everything awaiting a decision, newest first.
    const { data, error } = await admin
      .from("route_listings")
      .select(
        "id,status,title,summary,activity,sub_type,region,country," +
          "distance_km,stage_count,waypoint_count,price_cents,created_at," +
          "route_versions(version,storage_path,file_bytes)",
      )
      .in("status", ["submitted", "in_review", "unpublished"])
      .order("created_at", { ascending: true });
    if (error) return json(500, { error: error.message });
    return json(200, { listings: data ?? [] });
  }

  if (!id) return json(400, { error: "Missing listing id" });

  if (action === "publish") {
    const { error } = await admin
      .from("route_listings")
      .update({ status: "published", published_at: new Date().toISOString(), rejected_reason: null })
      .eq("id", id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  if (action === "reject") {
    const { error } = await admin
      .from("route_listings")
      .update({ status: "rejected", rejected_reason: reason || null })
      .eq("id", id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  if (action === "unpublish") {
    const { error } = await admin
      .from("route_listings")
      .update({ status: "unpublished" })
      .eq("id", id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(400, { error: "Unknown action" });
};
