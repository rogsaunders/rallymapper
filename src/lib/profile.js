// src/lib/profile.js
//
// Thin wrapper around the `profiles` table.
//
// The profiles table mirrors auth.users (same primary key) and adds
// app-level fields: display name, contact info, and — critically — the
// billing plan that gates feature access in Phase 2.
//
// A trigger in Supabase auto-inserts a 'free' row on every new sign-up,
// so a profile always exists for authenticated users.

import { supabase } from "./supabaseClient";

/**
 * Fetch the profile for the given user ID.
 * Returns null if not found or on error.
 */
export async function fetchProfile(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, phone, organization, plan, created_at, updated_at")
    .eq("id", userId)
    .single();

  if (error) {
    if (error.code !== "PGRST116") {
      // PGRST116 = row not found — expected for brand-new users before
      // the trigger has fired. Anything else is worth logging.
      console.warn("profile: fetch failed", error.message);
    }
    return null;
  }

  return data;
}

/**
 * Upsert profile fields for the current user.
 * Only pass the fields you want to change — others are left untouched.
 *
 * @param {string} userId
 * @param {object} fields  e.g. { full_name, phone, organization }
 */
export async function updateProfile(userId, fields) {
  if (!userId) throw new Error("updateProfile: userId is required");

  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: userId, ...fields, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );

  if (error) throw error;
}
