// netlify/functions/create-portal-session.js
//
// Creates a Stripe Billing Portal session so the authenticated user can
// manage their subscription (cancel, update card, view invoices, etc.).
//
// Required env vars:
//   STRIPE_SECRET_KEY
//   VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // ── Authenticate ───────────────────────────────────────────────────────────
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

  // ── Look up Stripe customer ID ─────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "No billing account found. Purchase a plan first." }),
    };
  }

  // ── Create portal session ──────────────────────────────────────────────────
  const origin =
    event.headers.origin ||
    event.headers.referer?.replace(/\/$/, "") ||
    "https://app.routemapper.net";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${origin}/`,
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: portalSession.url }),
  };
};
