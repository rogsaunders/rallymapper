// src/lib/stageNaming.js
//
// Single source of truth for how a stage is identified to the user —
// both as the export ZIP's filename and as the label Drive Mode
// displays in its header.  Keeps the recording side, the export
// pipeline, and Drive in sync so the navigator sees the same string
// they used to pick the file off disk.
//
// Format: `TripName_DayN_RouteName_StageName`
//
// Fallbacks (so empty inputs never produce double-underscores or
// orphaned segments like `Trip__Stage`):
//   - tripName  empty → "Untitled"
//   - dayNumber non-finite → 1
//   - routeName empty → `Route{routeNumber}` (or `Route1` if missing)
//   - stageName empty → `Stage{stageNumber}` (or `Stage1` if missing)

/**
 * Case-preserving filesystem-safe slug.  Replaces runs of any character
 * outside `[a-zA-Z0-9_-]` with a single underscore, collapses runs of
 * underscores, and trims leading/trailing underscores.  Used for the
 * stage's filename — readable on macOS / Windows / iOS Files.
 */
export function safeName(s) {
  return String(s || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Build the export ZIP's filename base (no extension).
 * Example: `MyTrip_Day1_Route1_Stage1`.
 */
export function stageFilenameBase(meta = {}) {
  const trip = safeName(meta.tripName) || "Untitled";
  const dayN = Number.isFinite(Number(meta.dayNumber))
    ? Number(meta.dayNumber)
    : 1;
  const route =
    safeName(meta.routeName) ||
    `Route${Number.isFinite(Number(meta.routeNumber)) ? Number(meta.routeNumber) : 1}`;
  const stage =
    safeName(meta.stageName) ||
    `Stage${Number.isFinite(Number(meta.stageNumber)) ? Number(meta.stageNumber) : 1}`;
  return `${trip}_Day${dayN}_${route}_${stage}`;
}

/**
 * Human-readable display parts.  Same fallback logic as
 * stageFilenameBase but does NOT sanitise — keeps user spacing and
 * punctuation intact for on-screen rendering ("Adelaide Hills" not
 * "Adelaide_Hills").
 *
 * Returns `{ trip, day, route, stage }` — each a string, ready to be
 * combined with separators of the caller's choice (e.g. ` · ` for the
 * Drive header subtitle).
 */
export function stageDisplayParts(meta = {}) {
  const tripRaw = meta.tripName ? String(meta.tripName).trim() : "";
  const trip = tripRaw || "Untitled";
  const dayN = Number.isFinite(Number(meta.dayNumber))
    ? Number(meta.dayNumber)
    : 1;
  const routeRaw = meta.routeName ? String(meta.routeName).trim() : "";
  const route =
    routeRaw ||
    `Route ${Number.isFinite(Number(meta.routeNumber)) ? Number(meta.routeNumber) : 1}`;
  const stageRaw = meta.stageName ? String(meta.stageName).trim() : "";
  const stage =
    stageRaw ||
    `Stage ${Number.isFinite(Number(meta.stageNumber)) ? Number(meta.stageNumber) : 1}`;
  return { trip, day: dayN, route, stage };
}
