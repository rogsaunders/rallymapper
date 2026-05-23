/**
 * Icon registry — built from iconManifest.json + src/icons/svg/*.svg
 *
 * To add a new icon (or a whole new category):
 *   1. Drop <id>.svg into src/icons/svg/
 *   2. Add one entry to iconManifest.json  { id, label, category, file }
 *
 * Done — no other files need editing. RouteMapperLayout iterates
 * ICON_CATEGORIES dynamically, so new categories surface as type-picker
 * buttons AND their variant icons render automatically. (Promise made
 * true by the iconIdByCategory refactor.)
 */

import manifest from "./iconManifest.json";

const _svgModules = import.meta.glob("./svg/*.svg", { as: "raw", eager: true });

// Flat list: [{ id, label, category, file, svg }, ...]
export const ICON_DEFS = manifest.map(d => ({
  ...d,
  svg: _svgModules[`./svg/${d.file}`] ?? "",
}));

// Quick lookup by id
export const ICON_BY_ID = Object.fromEntries(ICON_DEFS.map(d => [d.id, d]));

// Nav icons appear as corner badge; all others overlay the tulip
export const NAV_ICON_IDS = new Set(
  ICON_DEFS.filter(d => d.category === "Nav").map(d => d.id)
);

// Ordered unique categories as they appear in the manifest
export const ICON_CATEGORIES = [...new Set(ICON_DEFS.map(d => d.category))];

// Legacy shape — ICONS object keyed by category, with variants
// Kept so existing app components that import ICONS don't break.
export const ICON_ORDER = ICON_CATEGORIES.map(c => c.toLowerCase());

export const ICONS = Object.fromEntries(
  ICON_CATEGORIES.map(cat => {
    const members = ICON_DEFS.filter(d => d.category === cat);
    const first = members[0];
    const entry = {
      label: cat,
      svg: first?.svg ?? "",
      variants: Object.fromEntries(members.map(d => [d.id, { label: d.label, svg: d.svg }])),
    };
    return [cat.toLowerCase(), entry];
  })
);
