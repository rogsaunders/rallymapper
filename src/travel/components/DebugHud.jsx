// src/travel/components/DebugHud.jsx
//
// Opt-in on-screen diagnostics for Travel Mode, toggled from the
// settings panel ("Show diagnostics"). Off by default; purely an
// observation overlay — it changes no behaviour.
//
// Added 2026-08 to diagnose the "active row falls behind" field report:
// it surfaces the exact inputs the auto-advance state machine acts on
// so a single instrumented drive can tell us WHY a row didn't advance
// (off-track? never inside the trigger radius? override window active?).
//
// Read while driving:
//   • acc      — GPS horizontal accuracy (m). >80 m fixes are dropped
//                upstream, so this should stay well under that.
//   • track    — perpendicular offset from the recorded line, and
//                whether that puts us "off" (>100 m, the along-track
//                fallback threshold).
//   • method   — what computeAlongTrackDistance returned this tick:
//                along-track / passed / straight-line.
//   • → row    — remaining distance to the current ("next") row.
//   • idx      — user's nearest track index vs the target row's index;
//                auto-advance fires when user ≥ target ("passed").
//   • row      — currentIndex / total, plus pause/override flags that
//                suppress auto-advance when set.

import React from "react";

function fmtM(m) {
  if (m == null || !Number.isFinite(Number(m))) return "—";
  const v = Number(m);
  return v >= 1000 ? `${(v / 1000).toFixed(2)} km` : `${Math.round(v)} m`;
}

export default function DebugHud({
  gps,
  nextDistance,
  currentIndex,
  targetTrackIdx,
  rowCount,
  isPaused,
  isOverriding,
}) {
  const method = nextDistance?.method ?? "—";
  const offsetM = nextDistance?.offsetM;
  const offTrack = Number.isFinite(Number(offsetM)) && Number(offsetM) > 100;
  const userIdx = nextDistance?.userIdx;

  const rows = [
    ["acc", gps ? fmtM(gps.accuracy) : "no fix"],
    [
      "spd",
      gps && Number.isFinite(Number(gps.speed))
        ? `${(Number(gps.speed) * 3.6).toFixed(0)} km/h`
        : "—",
    ],
    [
      "track",
      Number.isFinite(Number(offsetM))
        ? `${fmtM(offsetM)} ${offTrack ? "· OFF" : "· on"}`
        : "—",
    ],
    ["method", method],
    ["→ row", nextDistance ? fmtM(nextDistance.distance) : "—"],
    [
      "idx",
      `${Number.isFinite(Number(userIdx)) ? userIdx : "—"} / ${
        Number.isFinite(Number(targetTrackIdx)) ? targetTrackIdx : "—"
      }`,
    ],
    [
      "row",
      `${currentIndex == null ? "—" : currentIndex}${
        rowCount ? ` / ${rowCount - 1}` : ""
      }${isPaused ? " · PAUSED" : ""}${isOverriding ? " · OVR" : ""}`,
    ],
  ];

  return (
    <div
      className="pointer-events-none fixed top-16 right-2 z-40 rounded-lg bg-black/75 text-white text-[11px] leading-tight font-mono px-2.5 py-2 shadow-lg tabular-nums"
      aria-hidden="true"
    >
      <div className="text-[9px] uppercase tracking-wide text-amber-300 mb-1">
        diagnostics
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <span className="text-gray-400">{k}</span>
          <span
            className={
              k === "method" && method === "straight-line"
                ? "text-amber-300"
                : k === "track" && offTrack
                  ? "text-amber-300"
                  : ""
            }
          >
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}
