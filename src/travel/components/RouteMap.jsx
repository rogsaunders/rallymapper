// src/travel/components/RouteMap.jsx
//
// Live vector route map for Travel Mode. Draws the recorded track as a
// line (road ahead bold, behind faded), your live position with a
// heading arrow, and the next-waypoint marker — all in SVG, no map
// tiles, so it works offline in no-signal terrain. See project_travel_
// livemap for the locked design decisions.
//
// North-up. Two framings:
//   • follow (default) — frames you together with the next waypoint, so
//     both stay on screen; re-centres as you drive.
//   • overview — the whole stage at once (tap the ⤢ button).
//
// Map ↔ list link: every roadbook row with coords is a tappable dot;
// tapping selects that row (onSelectRow). The current row is drawn as an
// amber numbered marker matching the highlighted row in the list.
//
// Off-route: when the parent says you've drifted (isOffTrack), the
// position dot turns amber and an "Off route · N m" badge shows. The
// audible cue is fired by the parent (chime.js), not here.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  fitProjector,
  decimateTrack,
  headingAlongTrack,
} from "../lib/mapProjection";

const FOLLOW_MIN_SPAN_M = 700; // don't zoom in tighter than this
const FOLLOW_MAX_SPAN_M = 8000; // don't zoom out wider than this
const RENDER_MAX_POINTS = 500; // decimation ceiling for the line

function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ w: Math.round(cr.width), h: Math.round(cr.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

function isFiniteCoord(p) {
  return p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon));
}

export default function RouteMap({
  trackPoints,
  rows,
  currentIndex,
  userTrackIdx,
  gps,
  followCoords,
  isOffTrack = false,
  offsetM,
  onSelectRow,
}) {
  const [followMode, setFollowMode] = useState(true);
  const [wrapRef, { w: measuredW, h: measuredH }] = useElementSize();
  const w = measuredW || 400;
  const h = measuredH || 300;

  const hasTrack = Array.isArray(trackPoints) && trackPoints.length >= 2;

  // Decimate the dense recorded track once per load — the line doesn't
  // need 5 m resolution and 20 k SVG points would be too heavy to redraw.
  const decTrack = useMemo(
    () => (hasTrack ? decimateTrack(trackPoints, RENDER_MAX_POINTS) : []),
    [trackPoints, hasTrack],
  );

  const currentRow =
    currentIndex != null && rows ? rows[currentIndex] : null;
  // Memoised so the projector useMemo below doesn't recompute every
  // render on a fresh object identity.
  const nextWp = useMemo(
    () =>
      isFiniteCoord(currentRow)
        ? { lat: Number(currentRow.lat), lon: Number(currentRow.lon) }
        : null,
    [currentRow],
  );

  // Choose the projector. Follow: frame [centre, next waypoint] so both
  // stay visible, clamped so it never zooms absurdly. Overview: the whole
  // stage. Falls back to the track when there's nothing to follow yet.
  const { project } = useMemo(() => {
    if (!hasTrack || w === 0) return { project: null };
    if (followMode) {
      const center =
        (isFiniteCoord(followCoords) && followCoords) ||
        (isFiniteCoord(gps) && gps) ||
        null;
      const focus = [center, nextWp].filter(isFiniteCoord);
      return fitProjector(focus.length ? focus : decTrack, w, h, {
        padding: 36,
        minSpanM: FOLLOW_MIN_SPAN_M,
        maxSpanM: FOLLOW_MAX_SPAN_M,
      });
    }
    return fitProjector(decTrack, w, h, { padding: 28 });
  }, [hasTrack, w, h, followMode, followCoords, gps, nextWp, decTrack]);

  if (!hasTrack) {
    return (
      <div
        ref={wrapRef}
        className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm p-4 text-center"
      >
        No route track for this stage — the map needs a recorded GPS track.
      </div>
    );
  }

  // Project the decimated track, then split into travelled (behind) and
  // ahead of the user's position along the track.
  const pts = project ? decTrack.map((p) => project(p.lat, p.lon)) : [];
  const frac =
    Number.isFinite(userTrackIdx) &&
    userTrackIdx >= 0 &&
    trackPoints.length > 1
      ? userTrackIdx / (trackPoints.length - 1)
      : 0;
  const splitIdx = Math.round(frac * (decTrack.length - 1));
  const behind = pts.slice(0, splitIdx + 1);
  const ahead = pts.slice(splitIdx);
  const toPolyline = (arr) => arr.map((p) => `${p.x},${p.y}`).join(" ");

  const startP = project ? project(trackPoints[0].lat, trackPoints[0].lon) : null;
  const endP = project
    ? project(
        trackPoints[trackPoints.length - 1].lat,
        trackPoints[trackPoints.length - 1].lon,
      )
    : null;

  const userP = project && isFiniteCoord(gps) ? project(gps.lat, gps.lon) : null;
  const userOnScreen =
    userP && userP.x >= -8 && userP.x <= w + 8 && userP.y >= -8 && userP.y <= h + 8;
  const heading = headingAlongTrack(trackPoints, userTrackIdx);
  const userColor = isOffTrack ? "#d97706" : "#16a34a";

  const wpP = project && nextWp ? project(nextWp.lat, nextWp.lon) : null;

  return (
    <div ref={wrapRef} className="relative w-full h-full bg-[#edf1f5]">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0"
      >
        {/* travelled (faded) then ahead (bold), so ahead draws on top */}
        {behind.length >= 2 && (
          <polyline
            points={toPolyline(behind)}
            fill="none"
            stroke="#b6c2d1"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {ahead.length >= 2 && (
          <polyline
            points={toPolyline(ahead)}
            fill="none"
            stroke="#334155"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* every roadbook row with coords = a subtle, tappable dot */}
        {rows &&
          rows.map((r, i) => {
            if (!isFiniteCoord(r) || i === currentIndex) return null;
            const p = project(Number(r.lat), Number(r.lon));
            return (
              <g key={r.index ?? i} onClick={() => onSelectRow?.(i)} style={{ cursor: "pointer" }}>
                <circle cx={p.x} cy={p.y} r={11} fill="transparent" />
                <circle cx={p.x} cy={p.y} r={2.6} fill="#64748b" />
              </g>
            );
          })}

        {/* start / finish */}
        {startP && (
          <g>
            <circle cx={startP.x} cy={startP.y} r={5} fill="#fff" stroke="#16a34a" strokeWidth={2.5} />
            <text x={startP.x} y={startP.y + 2.5} fontSize={7} textAnchor="middle" fill="#16a34a" fontWeight="bold">S</text>
          </g>
        )}
        {endP && (
          <g>
            <circle cx={endP.x} cy={endP.y} r={5.5} fill="#111827" />
            <text x={endP.x} y={endP.y + 2.5} fontSize={7} textAnchor="middle" fill="#fff" fontWeight="bold">F</text>
          </g>
        )}

        {/* current / next waypoint — amber, numbered, matches the list */}
        {wpP && (
          <g onClick={() => onSelectRow?.(currentIndex)} style={{ cursor: "pointer" }}>
            <circle cx={wpP.x} cy={wpP.y} r={13} fill="transparent" />
            <circle cx={wpP.x} cy={wpP.y} r={7.5} fill="#d97706" stroke="#fff" strokeWidth={1.5} />
            <text x={wpP.x} y={wpP.y + 2.8} fontSize={8} textAnchor="middle" fill="#fff" fontWeight="bold">
              {currentRow?.index ?? ""}
            </text>
          </g>
        )}

        {/* live position + heading arrow */}
        {userOnScreen && (
          <g transform={`translate(${userP.x} ${userP.y})${heading != null ? ` rotate(${heading})` : ""}`}>
            {heading != null && (
              <polygon points="0,-15 5.5,-6 -5.5,-6" fill={userColor} />
            )}
            <circle r={8} fill={userColor} stroke="#fff" strokeWidth={2.5} />
          </g>
        )}
      </svg>

      {/* compass (north-up, static) */}
      <div className="absolute left-2 top-2 flex flex-col items-center text-[10px] leading-none text-slate-500 select-none pointer-events-none">
        <span className="text-xs">↑</span>
        <span>N</span>
      </div>

      {/* on/off route badge */}
      {isFiniteCoord(gps) && (
        <div
          className={`absolute left-2 bottom-2 rounded-full px-2 py-0.5 text-[11px] font-medium flex items-center gap-1 border ${
            isOffTrack
              ? "bg-amber-100 text-amber-800 border-amber-400"
              : "bg-green-100 text-green-800 border-green-300"
          }`}
        >
          {isOffTrack
            ? `⚠ Off route${Number.isFinite(Number(offsetM)) ? ` · ${Math.round(Number(offsetM))} m` : ""}`
            : "✓ On route"}
        </div>
      )}

      {/* follow ↔ whole-stage toggle */}
      <button
        type="button"
        onClick={() => setFollowMode((m) => !m)}
        className="absolute right-2 bottom-2 w-9 h-9 rounded-lg bg-white/95 border border-gray-300 text-gray-700 shadow-sm flex items-center justify-center text-base hover:bg-white"
        title={followMode ? "Show whole stage" : "Follow my position"}
        aria-label={followMode ? "Show whole stage" : "Follow my position"}
      >
        {followMode ? "⤢" : "◎"}
      </button>
    </div>
  );
}
