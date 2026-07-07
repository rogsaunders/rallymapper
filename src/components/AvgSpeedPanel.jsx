// src/components/AvgSpeedPanel.jsx
//
// Inline "average speed between two points" panel. Shared by:
//   • Record Mode (controls strip, default closed) — quick mid-survey
//     check on the in-progress stage. Uses raw waypoints (rows don't
//     exist yet — the roadbook engine only runs at end-of-stage).
//   • Review Mode (sub-header, default open) — Lachie's post-survey
//     workflow: load a historical stage and iterate through pairs to
//     plan stage lengths for the participants. Uses ROADBOOK ROWS so
//     the numbers here match the map markers and the roadbook list
//     (both of which show row indices, not waypoint indices).
//
// Mode is controlled by whether the caller passes a `rows` prop:
//   • rows omitted / empty → waypoint mode  (raw stage.waypoints)
//   • rows non-empty       → row mode       (indexes into that array)
//
// The underlying maths lives in src/lib/wpSpeed.js —
// computeWpSpeed / computeStationaryMs for waypoints;
// computeRowSpeed / computeRowStationaryMs for rows. Both variants
// return the same result shape so this component only branches at the
// call site.
//
// UX choices:
//   • Two <input type="number"> boxes for From / To. Better than a
//     dropdown of 30+ labels — iPad keyboards expose the number pad
//     and arrow-key stepping is fast for "scan many pairs" workflows.
//   • Result line below the inputs updates LIVE as either input
//     changes (no Calculate button). Errors surface inline in the
//     same line so the user always sees one piece of feedback per
//     state.
//   • Tap the header to expand/collapse. Header always shows the
//     item-count hint so the user knows the valid range without
//     having to expand.
//   • The whole panel disabled (greyed, no clicks) when there aren't
//     yet ≥ 2 items. Mid-stage or post-stage both supported.

import React, { useState } from "react";
import {
  computeWpSpeed,
  computeStationaryMs,
  computeRowSpeed,
  computeRowStationaryMs,
  computeMovingSpeedKmh,
  formatDuration,
  formatClockTime,
} from "../lib/wpSpeed";

export default function AvgSpeedPanel({
  stage,
  rows = null,
  defaultOpen = false,
  className = "",
}) {
  // Row mode is opt-in: any non-empty rows array flips the panel to
  // row-based indexing. Record Mode never passes rows, so it keeps its
  // existing waypoint semantics.
  const useRows = Array.isArray(rows) && rows.length > 0;
  const items = useRows ? rows : stage?.waypoints || [];
  const count = items.length;
  const usable = count >= 2;

  // Short noun used everywhere in the UI copy so a mode switch changes
  // consistently. "WP 2" / "row 2".
  const noun = useRows ? "row" : "WP";
  const nounPlural = useRows ? "rows" : "waypoints";

  const [open, setOpen] = useState(defaultOpen);
  // Default to "whole stage" — From=1, To=last. The common-case tap.
  const [fromN, setFromN] = useState(1);
  const [toN, setToN] = useState(count >= 2 ? count : 2);

  // Re-clamp To when the count changes (live-capture in Record adds a
  // WP, or the user switches stages in Review). Keeps the form
  // sensible without resetting the user's chosen From.
  React.useEffect(() => {
    if (count >= 2 && toN > count) setToN(count);
  }, [count, toN]);

  const calc = usable
    ? useRows
      ? computeRowSpeed(stage, rows, fromN, toN)
      : computeWpSpeed(stage, fromN, toN)
    : null;
  const stationaryMs =
    usable && calc?.ok
      ? useRows
        ? computeRowStationaryMs(stage, rows, fromN, toN)
        : computeStationaryMs(stage, fromN, toN)
      : null;
  const movingKmh = calc?.ok
    ? computeMovingSpeedKmh(
        calc.result.distanceM,
        calc.result.durationMs,
        stationaryMs,
      )
    : null;

  // Row mode is naturally bounded (rows exists as a real array); WP
  // mode gets a raised ceiling per PR #107 so future large stages
  // aren't capped by the spinner.
  const maxAllowed = useRows ? count : Math.max(count, 100);

  return (
    <div
      className={`rounded-xl border bg-white ${className} ${
        usable ? "" : "opacity-60"
      }`}
    >
      {/* Header row — clickable to expand/collapse. */}
      <button
        type="button"
        onClick={() => usable && setOpen((v) => !v)}
        disabled={!usable}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-800 disabled:cursor-not-allowed"
        title={
          usable
            ? open
              ? "Hide Avg Speed"
              : "Show Avg Speed"
            : `Need at least 2 ${nounPlural}`
        }
      >
        <span className="text-base" aria-hidden="true">
          ⏱
        </span>
        <span>Avg Speed</span>
        <span className="ml-auto text-xs text-gray-500">
          {count === 0
            ? `no ${nounPlural} yet`
            : count === 1
              ? `1 ${noun} — need at least 2`
              : `${count} ${nounPlural}`}
        </span>
        {usable && (
          <span
            className="text-gray-400 text-xs"
            aria-hidden="true"
            style={{
              display: "inline-block",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 120ms ease",
            }}
          >
            ▸
          </span>
        )}
      </button>

      {open && usable && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-1 text-gray-700">
              From {noun}
              <input
                type="number"
                min={1}
                max={maxAllowed}
                value={fromN}
                onChange={(e) => setFromN(Number(e.target.value) || 1)}
                className="w-16 px-2 py-1 rounded border border-gray-300 bg-white text-right tabular-nums"
              />
            </label>
            <span className="text-gray-400">→</span>
            <label className="flex items-center gap-1 text-gray-700">
              To {noun}
              <input
                type="number"
                min={1}
                max={maxAllowed}
                value={toN}
                onChange={(e) => setToN(Number(e.target.value) || 1)}
                className="w-16 px-2 py-1 rounded border border-gray-300 bg-white text-right tabular-nums"
              />
            </label>
          </div>

          {calc?.ok ? (
            <div className="text-xs text-gray-800 space-y-0.5 leading-snug">
              <div className="text-gray-500">
                <span className="font-medium text-gray-700">
                  {noun} {calc.result.fromIdx + 1}
                </span>{" "}
                "{calc.result.fromLabel}"{" "}
                <span className="tabular-nums">
                  {formatClockTime(calc.result.from.timestamp)}
                </span>{" "}
                →{" "}
                <span className="font-medium text-gray-700">
                  {noun} {calc.result.toIdx + 1}
                </span>{" "}
                "{calc.result.toLabel}"{" "}
                <span className="tabular-nums">
                  {formatClockTime(calc.result.to.timestamp)}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                <span>
                  <span className="text-gray-500">Distance:</span>{" "}
                  <span className="font-semibold tabular-nums">
                    {(calc.result.distanceM / 1000).toFixed(2)} km
                  </span>
                </span>
                <span>
                  <span className="text-gray-500">Duration:</span>{" "}
                  <span className="font-semibold tabular-nums">
                    {formatDuration(calc.result.durationMs)}
                  </span>
                </span>
                <span>
                  <span className="text-gray-500">Avg speed:</span>{" "}
                  <span className="font-semibold tabular-nums text-[#588233]">
                    {calc.result.speedKmh.toFixed(1)} km/h
                  </span>
                </span>
                {/* Stationary time — sum of trackpoint segments in the
                    From→To window whose avg speed is <1 km/h. Captures
                    gates, floodway crossings, fuel stops, and any
                    suspended-tab pauses where one trackpoint spans a
                    long break with ~zero distance change. */}
                <span>
                  <span className="text-gray-500">Stationary:</span>{" "}
                  <span className="font-semibold tabular-nums">
                    {stationaryMs != null ? formatDuration(stationaryMs) : "—"}
                  </span>
                </span>
                {/* Moving average — avg speed over just the moving time
                    (duration − stationary). Excludes stops so it reflects
                    the pace held on the moving parts of the stage. */}
                <span>
                  <span className="text-gray-500">Moving avg:</span>{" "}
                  <span className="font-semibold tabular-nums text-[#588233]">
                    {movingKmh != null ? `${movingKmh.toFixed(1)} km/h` : "—"}
                  </span>
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-red-700">
              {calc?.error?.message ||
                `Choose two different ${nounPlural}.`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
