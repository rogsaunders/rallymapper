// src/drive/lib/tulipAdapter.js
//
// Thin wrapper around the existing renderTulipSvg() exported from
// src/roadbook. Drive Mode calls THIS instead of the underlying
// function directly, so if the roadbook side ever changes the
// signature (during the Map PDF branch work, or later), only this
// one file needs updating.
//
// Input: a roadbook row (the structure defined in
// src/roadbook/roadbookTypes.js). Output: an SVG string ready to drop
// into a React component via dangerouslySetInnerHTML.

import { renderTulipSvg } from "../../roadbook";

/**
 * Render a tulip diagram for one roadbook row.
 *
 * @param {Object} row — a row from roadbook.rows[]
 * @param {Object} [opts]
 * @param {number} [opts.size=100]        — SVG width/height in px
 * @param {number} [opts.strokeWidth=6]   — line stroke width
 * @returns {string} SVG markup
 */
export function tulipFor(row, opts = {}) {
  if (!row) return "";

  const size = opts.size ?? 100;
  const strokeWidth = opts.strokeWidth ?? 6;

  // renderTulipSvg(eventType, options) — see src/roadbook/tulipRenderer.js.
  // Pass angle when present (manual waypoints carry one); otherwise fall
  // back to eventType for the auto-detected turn templates.
  return renderTulipSvg(row.eventType, {
    size,
    strokeWidth,
    angle: row.angle ?? null,
  });
}
