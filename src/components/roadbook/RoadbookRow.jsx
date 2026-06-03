// src/components/roadbook/RoadbookRow.jsx
//
// One row of the scrolling roadbook. Shared between Drive Mode and
// Review Mode.
//
// Highlight modes (mutually exclusive in practice; selected wins if
// both happen to be set):
//   • position="current"   — Drive Mode's "you are here" amber band.
//   • position="above"     — Drive Mode's faded already-passed style.
//   • selected={true}      — Review Mode's "you tapped this" yellow band.
//
// Drive Mode passes `position` (set by useDriveAdvance). Review Mode
// passes `selected` (set by user taps on the row or the matching map
// marker). RoadbookView keeps the two highlight pathways separate.
//
// (Originally lived in src/drive/components/ — moved here when the
// roadbook list was lifted to a shared location so /review could
// reuse it without depending on /drive.)

import React, { forwardRef, useMemo } from "react";
import { tulipFor } from "./tulipAdapter";

function fmtKmFromKm(km) {
  if (km == null || !Number.isFinite(Number(km))) return "—";
  return Number(km).toFixed(2);
}

function fmtCap(bearing) {
  if (bearing == null || !Number.isFinite(Number(bearing))) return "—";
  const b = ((Number(bearing) % 360) + 360) % 360;
  return `${Math.round(b)}°`;
}

const RoadbookRow = forwardRef(function RoadbookRow(
  { row, position, selected = false, onTap },
  ref,
) {
  // position: "above" | "current" | "below" | "neutral"
  const tulipSvg = useMemo(() => tulipFor(row, { size: 96 }), [row]);

  const isCurrent = position === "current";

  const containerCls = selected
    ? "bg-yellow-50 border-l-4 border-yellow-500 pl-3"
    : isCurrent
      ? "bg-amber-50 border-l-4 border-amber-500 pl-3"
      : position === "above"
        ? "opacity-60"
        : "";

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onTap?.(row)}
      className={`block w-full text-left flex items-start gap-3 py-3 border-b border-gray-100 hover:bg-gray-50 ${containerCls}`}
    >
      <div className="text-xs font-semibold text-gray-500 w-10 pt-1 text-right tabular-nums">
        {row.index ?? "—"}
      </div>

      <div
        className="shrink-0 w-24 h-24 flex items-center justify-center bg-white rounded border border-gray-200"
        dangerouslySetInnerHTML={{ __html: tulipSvg }}
        aria-hidden="true"
      />

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 break-words">
          {row.notes || row.eventType || "—"}
        </div>
        {row.icon && (
          <div className="text-[11px] mt-0.5 inline-block px-2 py-0.5 rounded-full bg-gray-100 border text-gray-700">
            {row.icon}
          </div>
        )}
      </div>

      <div className="text-right text-xs text-gray-600 whitespace-nowrap tabular-nums">
        <div className="font-semibold text-gray-900">
          {fmtKmFromKm(row.kmPartial)} km
        </div>
        <div>tot {fmtKmFromKm(row.kmTotal)} km</div>
        <div className="mt-1">CAP {fmtCap(row.bearingOut)}</div>
      </div>
    </button>
  );
});

export default RoadbookRow;
