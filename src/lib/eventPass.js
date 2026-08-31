// src/lib/eventPass.js
//
// Client helpers for the Event Pass lifecycle. A pass is bought via Stripe
// (recorded 'unused' by the webhook), then ACTIVATED here — activation starts
// the 60-day access window and grants the plan. profiles.plan is locked from
// client writes, so activation goes through a service-role Netlify function.

import { supabase } from "./supabaseClient";

/**
 * Fetch the current user's event passes (RLS scopes to their own rows).
 * Newest first. Returns [] on error.
 */
export async function fetchEventPasses(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("event_passes")
    .select("id, status, trip_name, activated_at, expires_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("eventPass: fetch failed", error.message);
    return [];
  }
  return data || [];
}

/**
 * Activate the user's oldest unused pass. `tripName` is optional (an event
 * label). Resolves with { activated_at, expires_at, trip_name }; throws with a
 * user-facing message on failure.
 */
export async function activateEventPass(tripName) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("You must be signed in.");

  const res = await fetch("/.netlify/functions/activate-event-pass", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ tripName: tripName || null }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.error || "Could not activate your event pass — please try again.",
    );
  }
  return res.json();
}
