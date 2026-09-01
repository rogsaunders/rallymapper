// src/lib/checkout.js
//
// Client-side helper to initiate Stripe Checkout.
// Calls the Netlify Function which creates the session server-side
// (keeping the Stripe secret key out of the browser).

/**
 * Redirect the current user to Stripe Checkout for the given price.
 *
 * @param {string} priceId   — Stripe price ID (from stripePrices.js)
 * @param {string} planType  — 'solo_monthly' | 'pro_monthly' | 'pro_yearly' |
 *                             'event_pass'
 * @param {object} session   — Supabase session object (for the JWT)
 */
export async function redirectToCheckout(priceId, planType, session) {
  const token = session?.access_token;
  if (!token) throw new Error("You must be signed in to upgrade.");

  // Open the Stripe tab synchronously inside the click gesture, then point it
  // at the session URL once it's created. Opening it here (not after the async
  // fetch) is what stops popup blockers from killing it. If the browser still
  // blocks it (stripeTab === null), fall back to same-tab navigation.
  const stripeTab = window.open("", "_blank");

  try {
    const res = await fetch("/.netlify/functions/create-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ priceId, planType }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not start checkout — please try again.");
    }

    const { url } = await res.json();
    if (stripeTab) stripeTab.location.href = url;
    else window.location.href = url;
  } catch (e) {
    if (stripeTab) stripeTab.close();
    throw e;
  }
}

/**
 * Redirect the current user to the Stripe Customer Portal so they can
 * manage their subscription (cancel, update card, view invoices).
 *
 * @param {object} session — Supabase session object (for the JWT)
 */
export async function redirectToPortal(session) {
  const token = session?.access_token;
  if (!token) throw new Error("You must be signed in to manage billing.");

  // Same new-tab pattern as checkout (opened in the gesture to survive popup
  // blockers; same-tab fallback if blocked).
  const portalTab = window.open("", "_blank");

  try {
    const res = await fetch("/.netlify/functions/create-portal-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not open billing portal — please try again.");
    }

    const { url } = await res.json();
    if (portalTab) portalTab.location.href = url;
    else window.location.href = url;
  } catch (e) {
    if (portalTab) portalTab.close();
    throw e;
  }
}
