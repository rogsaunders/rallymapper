// src/library/lib/adminApi.js
//
// Client wrapper for the admin-listings Netlify function (service-role
// curation). The function re-checks the caller's is_admin flag, so this is
// only a UX convenience — not the security boundary.

import { supabase } from "../../lib/supabaseClient";

const ENDPOINT = "/.netlify/functions/admin-listings";

async function call(action, extra = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in.");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...extra }),
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new Error(payload?.error || `Request failed (${res.status})`);
  return payload;
}

export const listQueue = () => call("list").then((p) => p.listings ?? []);
export const publishListing = (id) => call("publish", { id });
export const rejectListing = (id, reason) => call("reject", { id, reason });
export const unpublishListing = (id) => call("unpublish", { id });
export const deleteListing = (id) => call("delete", { id });
export const setPreview = (id, previewBase64) => call("set-preview", { id, previewBase64 });
