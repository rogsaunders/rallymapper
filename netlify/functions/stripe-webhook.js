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

// Map Stripe subscription status to plan behaviour
const INACTIVE_STATUSES = ["past_due", "unpaid", "cancelled", "incomplete_expired"];

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

      console.log("stripe-webhook: subscription.status =", subscription.status);
      console.log("stripe-webhook: current_period_end raw =", subscription.current_period_end, typeof subscription.current_period_end);

      const periodEndMs = Number(subscription.current_period_end) * 1000;
      const periodEndIso = isNaN(periodEndMs) ? null : new Date(periodEndMs).toISOString();

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

    const updatedPeriodMs = Number(subscription.current_period_end) * 1000;
    const updatedPeriodIso = isNaN(updatedPeriodMs) ? null : new Date(updatedPeriodMs).toISOString();

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
