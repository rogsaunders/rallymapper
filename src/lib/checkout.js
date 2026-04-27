// src/lib/checkout.js
//
// Client-side helper to initiate Stripe Checkout.
// Calls the Netlify Function which creates the session server-side
// (keeping the Stripe secret key out of the browser).

/**
 * Redirect the current user to Stripe Checkout for the given price.
 *
 * @param {string} priceId   — Stripe price ID (from stripePrices.js)
 * @param {string} planType  — 'solo_monthly' | 'solo_yearly' | 'pro_monthly' |
 *                             'pro_yearly' | 'event_pass'
 * @param {object} session   — Supabase session object (for the JWT)
 */
export async function redirectToCheckout(priceId, planType, session) {
  const token = session?.access_token;
  if (!token) throw new Error("You must be signed in to upgrade.");

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
  window.location.href = url;
}
