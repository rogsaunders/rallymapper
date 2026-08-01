// netlify/functions/stripe-webhook.js
//
// Handles Stripe webhook events to keep Supabase in sync with billing state.
//
// Required env vars:
//   STRIPE_SECRET_KEY        — sk_test_... or sk_live_...
//   STRIPE_WEBHOOK_SECRET    — whsec_... (from Stripe webhook settings)
//   VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Map Stripe subscription status to plan behaviour.
//
// Stripe's API uses the American spelling "canceled" (one L). We list both
// spellings so the includes() check is robust either way and so that any
// future API change won't silently break the inactive→free transition.
// Internally we prefer the British "cancelled" (one of Roger's preferences
// — RouteMapper is an Australian app) when WRITING our own status values.
const INACTIVE_STATUSES = [
  "past_due",
  "unpaid",
  "canceled",   // Stripe API value
  "cancelled",  // British spelling — kept for forward compatibility / our own writes
  "incomplete_expired",
];

// Read current_period_end from a Stripe subscription object, tolerating both
// the legacy top-level field and the newer nested location at
// subscription.items.data[0].current_period_end. Returns an ISO timestamp,
// or null when neither is present (e.g. trial subscriptions).
function readPeriodEndIso(subscription) {
  const unix =
    subscription?.current_period_end ??
    subscription?.items?.data?.[0]?.current_period_end ??
    null;
  if (unix == null) return null;
  const ms = Number(unix) * 1000;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

exports.handler = async (event) => {
  // ── Verify Stripe signature ────────────────────────────────────────────────
  const sig = event.headers["stripe-signature"];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("Stripe webhook signature failed:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const { type, data: { object } } = stripeEvent;
  console.log("Stripe webhook received:", type);

  // ── checkout.session.completed ─────────────────────────────────────────────
  // Fired when payment is confirmed. Activate the plan in Supabase.
  if (type === "checkout.session.completed") {
    const session = object;
    const userId   = session.metadata?.supabase_user_id;
    const planType = session.metadata?.plan_type;

    if (!userId || !planType) {
      console.error("Missing metadata in session:", session.id);
      return { statusCode: 200, body: "OK" };
    }

    if (planType === "event_pass") {
      // One-time payment — create an event_pass record (status: unused)
      // Trip name is locked later when the user activates it in the app.
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);

      const { error } = await supabase.from("event_passes").insert({
        user_id:                    userId,
        stripe_payment_intent_id:   session.payment_intent,
        status:                     "unused",
        expires_at:                 expiresAt.toISOString(),
      });
      if (error) console.error("event_passes insert failed:", error.message);

      await supabase
        .from("profiles")
        .update({ plan: "event_pass" })
        .eq("id", userId);
    } else {
      // Subscription — fetch full subscription object for period details
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription,
      );

      const periodEndIso = readPeriodEndIso(subscription);

      const { error } = await supabase.from("subscriptions").insert({
        user_id:                userId,
        stripe_customer_id:     session.customer,
        stripe_subscription_id: session.subscription,
        plan:                   planType,
        status:                 subscription.status,
        current_period_end:     periodEndIso,
      });
      if (error) console.error("subscriptions insert failed:", error.message);

      await supabase
        .from("profiles")
        .update({ plan: planType })
        .eq("id", userId);
    }
  }

  // ── customer.subscription.updated ─────────────────────────────────────────
  // Fired on renewal, plan change, or payment failure.
  if (type === "customer.subscription.updated") {
    const subscription = object;

    const updatedPeriodIso = readPeriodEndIso(subscription);

    const { data: sub, error } = await supabase
      .from("subscriptions")
      .update({
        status:             subscription.status,
        current_period_end: updatedPeriodIso,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", subscription.id)
      .select("user_id, plan")
      .single();

    if (error) console.error("subscriptions update failed:", error.message);

    if (sub) {
      const newPlan = INACTIVE_STATUSES.includes(subscription.status)
        ? "free"
        : sub.plan;
      await supabase.from("profiles").update({ plan: newPlan }).eq("id", sub.user_id);
    }
  }

  // ── customer.subscription.deleted ─────────────────────────────────────────
  // Fired when a subscription is fully cancelled. Revert to free.
  if (type === "customer.subscription.deleted") {
    const subscription = object;

    const { data: sub, error } = await supabase
      .from("subscriptions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("stripe_subscription_id", subscription.id)
      .select("user_id")
      .single();

    if (error) console.error("subscriptions delete update failed:", error.message);

    if (sub) {
      await supabase.from("profiles").update({ plan: "free" }).eq("id", sub.user_id);
    }
  }

  return { statusCode: 200, body: "OK" };
};
