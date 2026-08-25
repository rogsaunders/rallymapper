// src/travel/components/PreStart.jsx
//
// The screen the navigator sees AFTER loading a roadbook but BEFORE
// driving begins.  Its job: tell them where the start is, how far
// away, and which way to head, then let them tap Begin when they're
// actually at the start line.
//
// Per the design decisions in the PR thread:
//   - Manual confirm — no auto-transition when proximity hits green
//     (driver may still be repositioning in the staging area).
//   - Static map via staticMapRenderer (no Leaflet in the Drive
//     bundle).  Single render at mount; doesn't follow the user.
//     Bounds chosen to centre the start with ~500 m of padding.
//   - Traffic-light proximity disc — at-a-glance feedback.
//   - Voice "At start" announcement when status first transitions
//     into "at-start", piggybacking on the existing useVoiceReadout
//     pipeline.
//
// Skip / fast-path:
//   - If startCoords is null (legacy stage with no recoverable start),
//     the parent (DriveMode) skips PreStart entirely and drops into
//     the regular Drive UI.  PreStart assumes startCoords is non-null.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  renderMapToCanvas,
  computeBounds,
} from "../../export/staticMapRenderer";
import {
  useStartProximity,
  formatStartDistance,
} from "../hooks/useStartProximity";

const MAP_WIDTH = 720;
const MAP_HEIGHT = 480;

// 500 m of padding around the start gives a useful local view without
// the user-position dot disappearing off-screen for normal approaches.
// At ~zoom 16 this fits a typical staging-area neighbourhood.
const MAP_PADDING_M = 500;

// Ceiling on the "fit start + user" frame. Fitting both is genuinely useful in
// the same region (e.g. driving in from a nearby town — the ~10 km case looks
// great). But the common planning case is loading a stage the night before from
// home, often interstate (start 1000s of km away), where fitting both zooms out
// to the whole continent and the start is a meaningless dot. Past this span we
// drop the user and frame the start locally; the "N km to start · <dir>" line
// conveys the far-away relationship. ~40 km keeps the near-region view while
// killing the continental one. (Below MAP_PADDING_M*2 we floor the zoom-in
// instead — user effectively on the start.)
const MAX_FIT_SPAN_M = 40000;

// Pad a single point into a bbox the renderer can fit.  Approximation:
// 1 deg lat ≈ 111 km, 1 deg lon ≈ 111 km · cos(lat).  Good enough for
// the few-hundred-metre framing this screen needs.
function bboxAround(center, paddingM) {
  const dLat = paddingM / 111_000;
  const dLon =
    paddingM / (111_000 * Math.cos((center.lat * Math.PI) / 180));
  return [
    [center.lat - dLat, center.lon - dLon],
    [center.lat + dLat, center.lon + dLon],
  ];
}

const STATUS_DISC = {
  "no-gps":   { color: "#9ca3af", label: "Waiting for GPS…" },
  "far":      { color: "#dc2626", label: "Heading to start" },
  "approach": { color: "#f59e0b", label: "Approaching start" },
  "near":     { color: "#f59e0b", label: "Almost there" },
  "at-start": { color: "#16a34a", label: "AT START" },
};

export default function PreStart({
  startCoords,
  trackPoints,
  gps,
  gpsError,
  triggerRadiusM,
  tileSource = "osm",
  onBegin,
  onCancel,
  voiceSpeak,
  voiceEnabled,
}) {
  const proximity = useStartProximity({ startCoords, gps, triggerRadiusM });
  const { status, distanceM, octant } = proximity;
  const disc = STATUS_DISC[status] || STATUS_DISC["no-gps"];

  // The recorded track, as {lat,lon} for the renderer. Drawn as a polyline
  // under the Start marker so the navigator can see which way the stage heads
  // out of the start. The frame stays local to the start (see bbox logic
  // below), so only the first stretch of route shows — the rest clips off-frame.
  const routePositions = useMemo(() => {
    return (trackPoints || [])
      .map((p) => ({ lat: Number(p?.lat), lon: Number(p?.lon) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  }, [trackPoints]);

  // ── One-shot map render ────────────────────────────────────────────
  // Renders ONCE at mount: tiles + a route polyline + a Start marker.  Live
  // GPS is overlaid as a CSS-positioned dot on top so we don't re-fetch
  // tiles every GPS tick.
  const [mapDataUrl, setMapDataUrl] = useState(null);
  const [mapBounds, setMapBounds] = useState(null);
  const [mapError, setMapError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function renderMap() {
      try {
        // bounds: bbox around the start point with MAP_PADDING_M of
        // breathing room.  Tilt towards including the user too if
        // they're close enough — keeps the user dot on the map for
        // a wider range of staging-area starts.
        let bbox;
        if (gps) {
          const fit = computeBounds([
            [startCoords.lat, startCoords.lon],
            [gps.lat, gps.lon],
          ]);
          const spanLatM = (fit[1][0] - fit[0][0]) * 111_000;
          const spanLonM =
            (fit[1][1] - fit[0][1]) *
            111_000 *
            Math.cos((startCoords.lat * Math.PI) / 180);
          // Include the user only in a sensible mid-range. Too tight (< 2·pad):
          // they're on the start. Too wide (> MAX_FIT_SPAN_M): they're far away
          // (typically planning from home). Either way, frame the start locally
          // so its surroundings are legible; otherwise fit both.
          const tooTight =
            spanLatM < MAP_PADDING_M * 2 || spanLonM < MAP_PADDING_M * 2;
          const tooWide =
            spanLatM > MAX_FIT_SPAN_M || spanLonM > MAX_FIT_SPAN_M;
          bbox =
            tooTight || tooWide
              ? bboxAround(startCoords, MAP_PADDING_M)
              : fit;
        } else {
          bbox = bboxAround(startCoords, MAP_PADDING_M);
        }

        const canvas = await renderMapToCanvas({
          routePositions,
          waypoints: [
            {
              lat: startCoords.lat,
              lon: startCoords.lon,
              kind: "start",
              poi: "START",
            },
          ],
          bounds: bbox,
          tileSource,
          width: MAP_WIDTH,
          height: MAP_HEIGHT,
          padding: 60,
        });
        if (cancelled) return;
        setMapDataUrl(canvas.toDataURL("image/png"));
        setMapBounds(bbox);
      } catch (e) {
        console.warn("PreStart: map render failed", e);
        if (!cancelled) setMapError(e?.message || "Map render failed");
      }
    }
    renderMap();
    return () => {
      cancelled = true;
    };
    // Render once when we first have startCoords; we don't want the
    // map to re-render as GPS updates — that would re-fetch all the
    // tiles every tick.  The first GPS fix (if available at mount)
    // does influence the bbox, but subsequent fixes only move the
    // overlay dot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCoords?.lat, startCoords?.lon, tileSource, routePositions]);

  // ── Voice announcement on green transition ─────────────────────────
  // useRef tracks the previous status so we fire the "At start" voice
  // line exactly once, when status flips into "at-start".  Subsequent
  // re-renders while the user is still at-start don't re-trigger.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current !== "at-start" && status === "at-start") {
      if (voiceEnabled && typeof voiceSpeak === "function") {
        voiceSpeak("At start. Ready to begin.");
      }
    }
    prevStatusRef.current = status;
  }, [status, voiceEnabled, voiceSpeak]);

  // ── User-position pixel coords (for the overlay dot) ────────────────
  // Maps lat/lon to canvas-pixel coords using the same bbox the map
  // was rendered with.  Returns null when GPS hasn't fixed yet OR
  // when the user is outside the rendered area.
  const userPx = (() => {
    if (!gps || !mapBounds) return null;
    const [[s, w], [n, e]] = mapBounds;
    if (gps.lat < s || gps.lat > n || gps.lon < w || gps.lon > e) return null;
    const xFrac = (gps.lon - w) / (e - w);
    const yFrac = 1 - (gps.lat - s) / (n - s); // y flipped (north = up)
    return { xPct: xFrac * 100, yPct: yFrac * 100 };
  })();

  const isAtStart = status === "at-start";

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Head to the start
            </h2>
            <p className="text-sm text-gray-600">
              The map shows the recorded start of this stage.  Tap{" "}
              <strong>Begin driving</strong> once you're at the start line.
            </p>
          </div>

          {/* Static map + user overlay dot */}
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="relative aspect-[3/2] bg-gray-100">
              {mapDataUrl ? (
                <>
                  <img
                    src={mapDataUrl}
                    alt="Stage start location"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {userPx && (
                    <div
                      className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-blue-600 border-2 border-white shadow-lg animate-pulse"
                      style={{
                        left: `${userPx.xPct}%`,
                        top: `${userPx.yPct}%`,
                      }}
                      title="Your current position"
                    />
                  )}
                </>
              ) : mapError ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 p-4 text-center">
                  Map unavailable — proceeding without it.<br />
                  <span className="text-xs text-gray-400">{mapError}</span>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
                  Loading map…
                </div>
              )}
            </div>

            {/* Proximity readout */}
            <div className="flex items-center gap-3 p-4 border-t">
              <div
                className={`w-12 h-12 rounded-full shrink-0 ${
                  isAtStart ? "animate-pulse" : ""
                }`}
                style={{ backgroundColor: disc.color }}
                aria-label={disc.label}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900">
                  {disc.label}
                </div>
                <div className="text-xs text-gray-500 tabular-nums">
                  {status === "no-gps" ? (
                    gpsError || "Waiting for GPS fix…"
                  ) : status === "at-start" ? (
                    <>You're within {triggerRadiusM} m of the start.</>
                  ) : (
                    <>
                      {formatStartDistance(distanceM)} to start
                      {octant && (
                        <>
                          {" "}
                          <span className="text-base">{octant.arrow}</span>{" "}
                          {octant.label}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Begin button — emphasised at-start, dimmer beforehand */}
          <button
            type="button"
            onClick={onBegin}
            className={`w-full px-4 py-4 rounded-xl text-white text-lg font-semibold transition ${
              isAtStart ? "animate-pulse" : ""
            }`}
            style={{
              backgroundColor: isAtStart ? "#16a34a" : "#588233",
            }}
          >
            {isAtStart
              ? "✓ Begin driving"
              : "I'm at the start — Begin driving"}
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 text-gray-700 bg-white text-sm font-medium hover:bg-gray-50"
          >
            ← Back to roadbook picker
          </button>
        </div>
      </div>
    </div>
  );
}
