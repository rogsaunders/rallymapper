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

  // Every DB write below THROWS on error so this catch returns a non-2xx and
  // Stripe RETRIES (webhooks are at-least-once). All writes are idempotent —
  // upserts / update-then-insert keyed on Stripe's own unique ids (the
  // subscriptions and event_passes tables both have UNIQUE constraints on
  // those ids) — so a retry or a duplicate delivery can't create duplicate
  // rows or double-grant. Permanent data problems (missing metadata) are
  // logged and 200'd so Stripe doesn't retry them forever.
  try {
    if (type === "checkout.session.completed") {
      await handleCheckoutCompleted(object);
    } else if (
      type === "customer.subscription.created" ||
      type === "customer.subscription.updated"
    ) {
      await syncSubscription(object);
    } else if (type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(object);
    }
    return { statusCode: 200, body: "OK" };
  } catch (e) {
    console.error("Stripe webhook processing failed:", type, e.message);
    // Non-2xx → Stripe retries with backoff. Idempotency (above) makes the
    // eventual re-delivery safe.
    return { statusCode: 500, body: "Processing error" };
  }
};

// ── checkout.session.completed ────────────────────────────────────────────
// Fired when payment is confirmed. One-time payment → event pass; subscription
// → reconcile the subscription object (which the subscription.* events also do,
// so this is order-independent and idempotent either way).
async function handleCheckoutCompleted(session) {
  const userId = session.metadata?.supabase_user_id;
  const planType = session.metadata?.plan_type;
  if (!userId || !planType) {
    console.error("Missing metadata in session:", session.id);
    return; // permanent — don't retry
  }

  if (planType === "event_pass") {
    // A purchased pass is UNUSED until the buyer activates it: access and the
    // 60-day window both start at ACTIVATION, not purchase (see
    // activate-event-pass.cjs). So we only record the pass here — no plan
    // grant, no dates.
    // Idempotent: unique(stripe_payment_intent_id) → a redelivery is a no-op.
    const { error } = await supabase.from("event_passes").upsert(
      {
        user_id: userId,
        stripe_payment_intent_id: session.payment_intent,
        status: "unused",
      },
      { onConflict: "stripe_payment_intent_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(`event_passes upsert: ${error.message}`);
  } else {
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    await syncSubscription(subscription);
  }
}

// ── customer.subscription.created / updated ───────────────────────────────
// Create-or-update the subscription row and reflect the plan on the profile.
// Works whether or not the row exists yet (webhooks aren't ordered), and for
// legacy subscriptions created before we stamped metadata (those already have
// a row, so the update path handles them).
async function syncSubscription(subscription) {
  const periodEndIso = readPeriodEndIso(subscription);
  const nowIso = new Date().toISOString();

  const { data: rows, error: uerr } = await supabase
    .from("subscriptions")
    .update({
      status: subscription.status,
      current_period_end: periodEndIso,
      updated_at: nowIso,
    })
    .eq("stripe_subscription_id", subscription.id)
    .select("user_id, plan");
  if (uerr) throw new Error(`subscriptions update: ${uerr.message}`);

  let userId;
  let plan;
  if (rows && rows.length) {
    userId = rows[0].user_id;
    plan = rows[0].plan;
  } else {
    // No row yet — insert from the metadata stamped at checkout.
    userId = subscription.metadata?.supabase_user_id;
    plan = subscription.metadata?.plan_type;
    if (!userId || !plan) {
      console.error("subscription sync: no row + no metadata for", subscription.id);
      return; // permanent — don't retry
    }
    const { error: ierr } = await supabase.from("subscriptions").insert({
      user_id: userId,
      stripe_customer_id: subscription.customer,
      stripe_subscription_id: subscription.id,
      plan,
      status: subscription.status,
      current_period_end: periodEndIso,
    });
    if (ierr) {
      // 23505 = a concurrent delivery inserted first; the row now exists and
      // that delivery reflects the profile — safe to stop here.
      if (ierr.code === "23505") return;
      throw new Error(`subscriptions insert: ${ierr.message}`);
    }
  }

  const newPlan = INACTIVE_STATUSES.includes(subscription.status) ? "free" : plan;
  await setProfilePlan(userId, newPlan);
}

// ── customer.subscription.deleted ─────────────────────────────────────────
// Fully cancelled → revert to free, even if the row was never recorded.
async function handleSubscriptionDeleted(subscription) {
  const { data: rows, error } = await supabase
    .from("subscriptions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .select("user_id");
  if (error) throw new Error(`subscriptions cancel: ${error.message}`);

  const userId = rows?.[0]?.user_id || subscription.metadata?.supabase_user_id;
  if (userId) await setProfilePlan(userId, "free");
}

async function setProfilePlan(userId, plan) {
  const { error } = await supabase
    .from("profiles")
    .update({ plan })
    .eq("id", userId);
  if (error) throw new Error(`profiles plan update: ${error.message}`);
}
