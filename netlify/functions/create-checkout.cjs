// netlify/functions/create-checkout.js
//
// Creates a Stripe Checkout Session for the authenticated user.
// Called client-side from src/lib/checkout.js.
//
// Required env vars (set in Netlify site settings):
//   STRIPE_SECRET_KEY        — sk_test_... or sk_live_...
//   VITE_SUPABASE_URL        — already set for the app build
//   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Server-authoritative price map. The price is chosen HERE from the plan
// type — never trusted from the client — so a caller can't pair an expensive
// plan with a cheaper price. Mirror of src/lib/stripePrices.js (keep in sync;
// price IDs are not secrets).
const PLAN_PRICES = {
  event_pass:   "price_1TS4QHF7LrulzgMx3E3bQ4Ya",
  solo_monthly: "price_1TS4SPF7LrulzgMxb0sufYSM",
  pro_monthly:  "price_1TS4UMF7LrulzgMxqzxG6BjC",
  pro_yearly:   "price_1TS4X7F7LrulzgMxi55pKBRY",
};

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

  // ── Validate body ──────────────────────────────────────────────────────────
  // Only planType is trusted; the price is derived server-side (any client
  // priceId is ignored).
  let planType;
  try {
    ({ planType } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const priceId = PLAN_PRICES[planType];
  if (!priceId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing or invalid planType" }),
    };
  }

  // ── Get or create Stripe customer ──────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, full_name, phone")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: profile?.full_name || undefined,
      phone: profile?.phone || undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  } else if (profile?.full_name || profile?.phone) {
    // Existing customer — sync any name/phone updates back to Stripe so
    // billing receipts and tax docs stay current.
    try {
      await stripe.customers.update(customerId, {
        name: profile.full_name || undefined,
        phone: profile.phone || undefined,
      });
    } catch (e) {
      console.warn("stripe customer update failed:", e.message);
    }
  }

  // ── Create Checkout Session ────────────────────────────────────────────────
  const isSubscription = planType !== "event_pass";
  const origin =
    event.headers.origin ||
    event.headers.referer?.replace(/\/$/, "") ||
    "https://app.routemapper.net";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: isSubscription ? "subscription" : "payment",
    success_url: `${origin}/?billing=success&plan=${planType}`,
    cancel_url: `${origin}/?billing=cancelled`,
    metadata: {
      supabase_user_id: user.id,
      plan_type: planType,
    },
    // Stamp the subscription itself too, so later customer.subscription.*
    // webhook events carry the user + plan and can reconcile regardless of
    // delivery order (see stripe-webhook.cjs syncSubscription).
    subscription_data: isSubscription
      ? { metadata: { supabase_user_id: user.id, plan_type: planType } }
      : undefined,
    // Pre-fill the customer's email on the Stripe-hosted page
    customer_update: isSubscription
      ? { address: "auto" }
      : undefined,
    // Collect billing address for tax purposes (Australian GST)
    billing_address_collection: "auto",
    automatic_tax: { enabled: true },
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: session.url }),
  };
};
