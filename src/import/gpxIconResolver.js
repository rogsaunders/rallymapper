// src/import/gpxIconResolver.js
//
// Reverse-maps GPX waypoint fields (<desc>, <type>, <sym>) back to a
// RouteMapper iconId and internal waypoint type category.

import { ICON_EXPORT_MAP } from "../roadbook/iconMappings.js";

// Build a reverse lookup: gpxSymbol → first iconId that uses it
const symToIconId = {};
for (const [iconId, meta] of Object.entries(ICON_EXPORT_MAP)) {
  if (!symToIconId[meta.gpxSymbol]) {
    symToIconId[meta.gpxSymbol] = iconId;
  }
}

// OpenRally <type> → best representative iconId
const openRallyTypeToIconId = {
  TULIP: "nav",
  DANGER: "danger_1",
  CAUTION: "caution",
  CONTROL: "control",
  ASSISTANCE: "service",
  START: "start",
  FINISH: "finish",
  WP: "note",
};

/**
 * Resolve a RouteMapper iconId from a parsed GPX <wpt> element's fields.
 *
 * Priority:
 *   1. "Icon: <iconId>" embedded in <desc> — written by RouteMapper's own exporter,
 *      gives perfect round-trip fidelity (e.g. "Icon: left | POI: Turn here")
 *   2. <type> using the OpenRally vocabulary (TULIP, DANGER, CONTROL …)
 *   3. <sym> Garmin / GPX symbol name
 *   4. Fallback: "note"
 */
export function resolveIconFromGpxWpt({ desc = "", type = "", sym = "" }) {
  // 1. RouteMapper desc pattern
  if (desc) {
    const m = desc.match(/\bIcon:\s*(\S+)/i);
    if (m && ICON_EXPORT_MAP[m[1]]) return m[1];
  }

  // 2. OpenRally <type>
  const upper = type.trim().toUpperCase();
  if (upper && openRallyTypeToIconId[upper]) return openRallyTypeToIconId[upper];

  // 3. GPX <sym>
  if (sym && symToIconId[sym.trim()]) return symToIconId[sym.trim()];

  return "note";
}

/**
 * Map a resolved iconId to the internal waypoint type category used by
 * RouteMapperLayout ("nav" | "hazard" | "control").
 */
export function resolveWaypointTypeCategory(iconId) {
  const meta = ICON_EXPORT_MAP[iconId];
  if (!meta) return "nav";
  const ort = meta.openRallyType;
  if (ort === "DANGER" || ort === "CAUTION") return "hazard";
  if (
    ort === "CONTROL" ||
    ort === "ASSISTANCE" ||
    ort === "START" ||
    ort === "FINISH"
  )
    return "control";
  return "nav";
}
