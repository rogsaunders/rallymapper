// src/library/lib/handoff.js
//
// In-memory handoff of a downloaded route File from the Route Library to
// Travel Mode. Both surfaces live in the same SPA on go.routemapper.net, so
// "Open in Travel" downloads the route, stashes the File here, and navigates
// to "/"; the Travel home reads it once and feeds it into TravelMode's
// existing `initialFile` prop.
//
// Deliberately a module singleton (not storage): a File can't be serialised
// to sessionStorage, and the handoff only needs to survive a client-side
// route change, not a reload. On reload it's simply re-openable from the
// listing.

let pending = null;

export function setPendingRoute(file) {
  pending = file || null;
}

// Read-and-clear: returns the pending File (or null) and forgets it, so a
// later visit to Travel doesn't re-load a stale route.
export function takePendingRoute() {
  const f = pending;
  pending = null;
  return f;
}
