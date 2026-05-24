// src/drive/components/FooterBar.jsx
//
// Bottom chrome.
//
// M2: GPS status indicator, distance-from-GPS-to-current-row,
//     Prev / Next manual stepping. No auto-advance yet — that's M3.
//
// Layout tuned for iPhone portrait: three rows of vertical density
// is too much for the small screen, so everything lives in one row
// with the Prev/Next buttons taking the most prominent space.

import React from "react";

function fmtMeters(m) {
  if (m == null || !Number.isFinite(m)) return "—";
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

export default function FooterBar({
  gps,
  gpsError,
  distanceToCurrentM,
  onPrev,
  onNext,
  onSnap,
  canPrev,
  canNext,
}) {
  const hasGps = !!gps;
  const gpsTitle = hasGps
    ? `GPS fix: ${Number(gps.lat).toFixed(5)}, ${Number(gps.lon).toFixed(5)}${
        Number.isFinite(gps.accuracy) ? ` ±${Math.round(gps.accuracy)} m` : ""
      }`
    : gpsError || "Waiting for GPS fix…";

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

        {/* Distance to current row */}
        <div className="flex-1 text-center tabular-nums text-sm">
          {hasGps ? (
            <>
              <span className="text-gray-500">to current:&nbsp;</span>
              <span className="font-semibold text-gray-900">
                {fmtMeters(distanceToCurrentM)}
              </span>
            </>
          ) : (
            <span className="text-gray-400">waiting for GPS…</span>
          )}
        </div>

        {/* Prev / Snap / Next */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onPrev}
            disabled={!canPrev}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
            title="Previous row"
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
            title="Next row"
          >
            ▶
          </button>
        </div>
      </div>
    </footer>
  );
}
