// src/travel/components/FooterBar.jsx
//
// Bottom chrome.
//
// M3 changes:
//   - Distance label is now "next" (was "to current"), reflecting
//     that the current row is what the navigator is approaching.
//   - Distance number prefers along-track (matches roadbook); falls
//     back to straight-line with an "(off-track)" hint when the user
//     drifts more than ~100 m from any recorded track point.
//   - Adds a ⏸/▶ pause toggle in the controls cluster.

import React from "react";

function fmtDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return "—";
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

export default function FooterBar({
  gps,
  gpsError,
  nextDistance, // { distance, method } | null
  isPaused,
  isOverriding,
  onPrev,
  onNext,
  onSnap,
  onTogglePause,
  canPrev,
  canNext,
}) {
  const hasGps = !!gps;
  const gpsTitle = hasGps
    ? `GPS fix: ${Number(gps.lat).toFixed(5)}, ${Number(gps.lon).toFixed(5)}${
        Number.isFinite(gps.accuracy) ? ` ±${Math.round(gps.accuracy)} m` : ""
      }`
    : gpsError || "Waiting for GPS fix…";

  const method = nextDistance?.method;
  const distance = nextDistance?.distance ?? null;
  const offTrack = method === "straight-line";
  const passed = method === "passed";

  return (
    <footer className="sticky bottom-0 bg-white border-t shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <div className="px-3 py-2 flex items-center gap-2">
        {/* GPS pill */}
        <div
          className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${
            hasGps ? "bg-green-500" : "bg-red-500"
          } bg-opacity-15`}
          title={gpsTitle}
        >
          {hasGps ? "🟢" : "🔴"} GPS
        </div>

        {/* Distance to next */}
        <div className="flex-1 text-center tabular-nums text-sm min-w-0">
          {hasGps ? (
            distance == null ? (
              <span className="text-gray-400">no row selected</span>
            ) : (
              <>
                <span className="text-gray-500">
                  {passed ? "passed:" : "next:"}&nbsp;
                </span>
                <span className="font-semibold text-gray-900">
                  {fmtDistance(distance)}
                </span>
                {offTrack && (
                  <span
                    className="ml-1 text-[10px] text-amber-700"
                    title="You're more than 100 m from the recorded track — showing straight-line distance instead of along-track"
                  >
                    (off-track)
                  </span>
                )}
              </>
            )
          ) : (
            <span className="text-gray-400">waiting for GPS…</span>
          )}
        </div>

        {/* Controls cluster */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onTogglePause}
            className={`px-3 py-1.5 rounded-lg border text-sm font-semibold ${
              isPaused
                ? "border-amber-500 bg-amber-50 text-amber-700"
                : "border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
            }`}
            title={
              isPaused
                ? "Auto-advance paused — tap to resume"
                : "Pause auto-advance"
            }
          >
            {isPaused ? "▶" : "⏸"}
          </button>
          <button
            type="button"
            onClick={onPrev}
            disabled={!canPrev}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
            title="Previous row (pauses auto-advance briefly)"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={onSnap}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50"
            title="Snap-scroll to the current row"
          >
            ↺
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
            title="Next row (pauses auto-advance briefly)"
          >
            ▶
          </button>
        </div>
      </div>

      {/* Optional second row: override-active indicator */}
      {isOverriding && !isPaused && (
        <div className="px-3 pb-1 text-[10px] text-amber-700 text-center">
          Auto-advance paused after manual step
        </div>
      )}
    </footer>
  );
}
