// src/lib/stripePrices.js
//
// Stripe price IDs — safe to commit, these are not secrets.
// These IDs are from the LIVE Stripe account (acct_1TQdpzF7LrulzgMx).
// They MUST be paired with sk_live_… in STRIPE_SECRET_KEY and a live-mode
// webhook signing secret in STRIPE_WEBHOOK_SECRET on Netlify; otherwise
// Checkout will return "No such price" or signature-verification errors.

export const STRIPE_PRICES = {
  event_pass:   "price_1TS4QHF7LrulzgMx3E3bQ4Ya",
  solo_monthly: "price_1TS4SPF7LrulzgMxb0sufYSM",
  pro_monthly:  "price_1TS4UMF7LrulzgMxqzxG6BjC",
  pro_yearly:   "price_1TS4X7F7LrulzgMxi55pKBRY",
};
