// src/library/lib/submitApi.js
//
// Author submission API for the Route Library (Phase A).
//
// The actual write (file upload + listing/version insert) happens in the
// `submit-route` Netlify function using the service-role key. Direct browser
// uploads to the route-files bucket are rejected by the storage service
// regardless of RLS policy, so all writes are server-mediated. Author-gating
// is enforced both here (UX) and in the function (authoritative).

import { supabase } from "../../lib/supabaseClient";

const SUBMIT_ENDPOINT = "/.netlify/functions/submit-route";

/** 'active' | 'paused' | 'removed' | null (not an author). */
export async function getAuthorStatus(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("route_authors")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("submitApi: getAuthorStatus failed", error.message);
    return null;
  }
  return data?.status ?? null;
}

// Encode a File to base64 in chunks (avoids call-stack limits on large files).
async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Submit a route: posts the file + metadata to the server function, which
 * creates a `submitted` listing, uploads the file, and records version 1.
 * Returns the new listing id. Throws on any failure.
 */
export async function submitRoute({ file, fields, metadata, previewBase64 }) {
  if (!file) throw new Error("No route file selected.");
  if (!fields?.title?.trim()) throw new Error("A title is required.");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in.");

  const fileBase64 = await fileToBase64(file);

  const res = await fetch(SUBMIT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      fields,
      metadata,
      fileName: file.name,
      fileBase64,
      previewBase64: previewBase64 || null,
    }),
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    throw new Error(payload?.error || `Submit failed (${res.status})`);
  }
  return payload?.listingId;
}
