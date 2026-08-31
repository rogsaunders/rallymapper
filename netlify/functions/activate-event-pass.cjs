// netlify/functions/activate-event-pass.cjs
//
// Activates the authenticated user's oldest UNUSED event pass:
//   status → 'active', activated_at → now, expires_at → now + 60 days,
//   trip_name → optional event name, and profiles.plan → 'event_pass'.
//
// Access and the 60-day window both start HERE, not at purchase (the webhook
// only records an 'unused' pass). profiles.plan is locked from client writes,
// so activation must run server-side with the service role.
//
// Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PASS_DAYS = 60;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // ── Authenticate ─────────────────────────────────────────────────────────
  const token = (event.headers.authorization || "").replace("Bearer ", "");
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  // ── Optional event name ──────────────────────────────────────────────────
  let tripName = null;
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    if (typeof body.tripName === "string" && body.tripName.trim()) {
      tripName = body.tripName.trim().slice(0, 120);
    }
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  // ── Find the oldest unused pass ──────────────────────────────────────────
  const { data: pass, error: findErr } = await supabase
    .from("event_passes")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "unused")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    console.error("activate-event-pass: find failed", findErr.message);
    return { statusCode: 500, body: JSON.stringify({ error: "Could not activate pass." }) };
  }
  if (!pass) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "You don't have an event pass to activate." }),
    };
  }

  // ── Activate (conditional update guards a double-activation race) ─────────
  const nowMs = Date.now();
  const activatedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + PASS_DAYS * 86400000).toISOString();

  const { data: activated, error: updErr } = await supabase
    .from("event_passes")
    .update({
      status: "active",
      activated_at: activatedAt,
      expires_at: expiresAt,
      trip_name: tripName,
    })
    .eq("id", pass.id)
    .eq("status", "unused")
    .select("id, activated_at, expires_at, trip_name")
    .maybeSingle();

  if (updErr) {
    console.error("activate-event-pass: update failed", updErr.message);
    return { statusCode: 500, body: JSON.stringify({ error: "Could not activate pass." }) };
  }
  if (!activated) {
    return {
      statusCode: 409,
      body: JSON.stringify({ error: "That pass was already activated." }),
    };
  }

  // ── Grant the plan (service role — profiles.plan is locked to clients) ────
  const { error: planErr } = await supabase
    .from("profiles")
    .update({ plan: "event_pass" })
    .eq("id", user.id);
  if (planErr) {
    console.error("activate-event-pass: plan update failed", planErr.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Pass activated but plan update failed — please contact support.",
      }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      activated_at: activated.activated_at,
      expires_at: activated.expires_at,
      trip_name: activated.trip_name,
    }),
  };
};
