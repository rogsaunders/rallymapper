// src/travel/hooks/useTravelAdvance.js
//
// Owns "which row is current" + the auto-advance / pause / manual-
// override state machine.
//
// State outputs:
//   currentIndex   — number | null, which row is the navigator's "next"
//   isPaused       — boolean, explicit user pause
//   isOverriding   — boolean, manual override timer is active
//   userTrackIdx   — number, user's projected position on the track
//                    (exposed so the footer can show "off-track" hint
//                     and so the parent doesn't recompute it)
//   nextDistance   — { distance, method } | null, live distance to
//                    the current row along the recorded track
//
// Action outputs:
//   goPrev, goNext, jumpTo  — manual stepping (triggers override timer)
//   togglePause             — explicit pause toggle
//
// Auto-advance algorithm (M3):
//   - If paused or in manual-override window → skip
//   - If user has no GPS fix → skip
//   - If currentIndex is at the last row → skip
//   - Compute along-track distance from user to NEXT row
//     (currentIndex + 1). If <= triggerRadiusM, advance currentIndex.
//
// Why only check next-row (not look-ahead): keeps the behaviour
// predictable. If the user skips past a row's trigger zone without
// the auto-advance firing (e.g. GPS gap, very small zone), they
// can ◀ ▶ to correct. M4+ may add smarter look-ahead based on real
// field data.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { computeAlongTrackDistance } from "../lib/alongTrack";

const DEFAULT_MANUAL_OVERRIDE_MS = 30000;

export function useTravelAdvance({
  rows,
  trackPoints,
  gps,
  autoAdvanceEnabled = true,
  triggerRadiusM = 30,
  manualOverrideMs = DEFAULT_MANUAL_OVERRIDE_MS,
}) {
  const total = rows?.length ?? 0;
  const [currentIndex, setCurrentIndex] = useState(total > 0 ? 0 : null);
  const [isPaused, setIsPaused] = useState(false);
  const [overrideUntil, setOverrideUntil] = useState(0);
  const userTrackIdxRef = useRef(-1);
  const [_tick, setTick] = useState(0); // bump to re-render distance

  // Reset on new roadbook
  useEffect(() => {
    setCurrentIndex(total > 0 ? 0 : null);
    setIsPaused(false);
    setOverrideUntil(0);
    userTrackIdxRef.current = -1;
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute distance to the CURRENT row each GPS update. Recomputed
  // here (rather than in the parent) so the auto-advance logic can
  // act on the same value the UI shows.
  const nextDistance = useMemo(() => {
    if (!gps || currentIndex == null) return null;
    const row = rows[currentIndex];
    if (!row) return null;
    if (
      !Number.isFinite(Number(row.lat)) ||
      !Number.isFinite(Number(row.lon))
    ) {
      return null;
    }

    // Prefer along-track if we have both a track and the row has been
    // annotated with a track index (annotateRowsWithTrackIdx from
    // alongTrack.js — done in DriveMode when roadbook loads).
    if (
      Array.isArray(trackPoints) &&
      trackPoints.length > 0 &&
      Number.isFinite(row._trackIdx) &&
      row._trackIdx >= 0
    ) {
      const result = computeAlongTrackDistance(
        trackPoints,
        row._trackIdx,
        { lat: gps.lat, lon: gps.lon },
        userTrackIdxRef.current >= 0 ? userTrackIdxRef.current : null,
      );
      if (result.userIdx >= 0) userTrackIdxRef.current = result.userIdx;
      return result;
    }

    // Fallback: straight-line (we don't have a usable track)
    return null;
  }, [gps, currentIndex, rows, trackPoints]);

  // Auto-advance: when the user crosses into the next row's trigger
  // zone, bump currentIndex. Driven by GPS ticks via nextDistance.
  useEffect(() => {
    if (!autoAdvanceEnabled) return;
    if (isPaused) return;
    if (Date.now() < overrideUntil) return;
    if (currentIndex == null) return;
    if (currentIndex >= total - 1) return; // already at last row
    if (!nextDistance) return;

    // "passed" means the user has already driven past the current
    // row's recorded position — advance unconditionally.
    if (nextDistance.method === "passed") {
      setCurrentIndex(currentIndex + 1);
      return;
    }

    // Otherwise advance once we're inside the trigger zone.
    if (
      Number.isFinite(nextDistance.distance) &&
      nextDistance.distance <= triggerRadiusM
    ) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [
    nextDistance,
    autoAdvanceEnabled,
    isPaused,
    overrideUntil,
    currentIndex,
    total,
    triggerRadiusM,
  ]);

  const triggerOverride = useCallback(() => {
    setOverrideUntil(Date.now() + manualOverrideMs);
  }, [manualOverrideMs]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => {
      if (i == null) return 0;
      return Math.max(0, i - 1);
    });
    triggerOverride();
  }, [triggerOverride]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => {
      if (i == null) return 0;
      return Math.min(total - 1, i + 1);
    });
    triggerOverride();
  }, [total, triggerOverride]);

  const jumpTo = useCallback(
    (i) => {
      if (i == null) return;
      const clamped = Math.max(0, Math.min(total - 1, i));
      setCurrentIndex(clamped);
      triggerOverride();
    },
    [total, triggerOverride],
  );

  const togglePause = useCallback(() => {
    setIsPaused((p) => !p);
  }, []);

  // Tick the override-remaining indicator (so UI can show countdown
  // if we ever decide to surface it). Cheap; runs only while active.
  useEffect(() => {
    if (overrideUntil <= Date.now()) return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (Date.now() >= overrideUntil) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [overrideUntil]);

  const isOverriding = Date.now() < overrideUntil;
  const overrideRemainingMs = isOverriding
    ? Math.max(0, overrideUntil - Date.now())
    : 0;

  return {
    currentIndex,
    isPaused,
    isOverriding,
    overrideRemainingMs,
    userTrackIdx: userTrackIdxRef.current,
    nextDistance,
    goPrev,
    goNext,
    jumpTo,
    togglePause,
  };
}
