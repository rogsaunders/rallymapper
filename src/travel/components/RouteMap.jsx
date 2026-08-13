// src/travel/components/RouteMap.jsx
//
// Live route map for Travel Mode.
//
// Layers (bottom to top):
//   1. TileLayer  — optional raster backdrop (satellite / street / topo),
//      shown when online; Phase 2. Off/offline → nothing, vector shows.
//   2. SVG vector — the recorded track (ahead bold, behind faded, white
//      casing so it reads over imagery), your live position + heading, the
//      next-waypoint marker, tappable dots for every row.
//
// Web Mercator throughout (see mapProjection) so tiles + vectors align.
// North-up. Follow framing (you + next waypoint) by default; a corner
// button toggles the whole-stage overview. See project_travel_livemap.
//
// Map ↔ list link: every roadbook row with coords is a tappable dot;
// tapping selects that row. Off-route (isOffTrack from the parent) turns
// the position dot amber and shows an "Off route · N m" badge.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  fitView,
  decimateTrack,
  headingAlongTrack,
} from "../lib/mapProjection";
import { tileSourceAttribution } from "../../export/staticMapRenderer";
import TileLayer from "./TileLayer";

const RENDER_MAX_POINTS = 500;
const FOLLOW_MIN_ZOOM = 13;
const FOLLOW_MAX_ZOOM = 18;
const OVERVIEW_MIN_ZOOM = 3;
const OVERVIEW_MAX_ZOOM = 18;

const LS_TILE_MODE = "rm_drive_tile_mode";
const TILE_CYCLE = ["satellite", "street", "topo", "off"];
const TILE_LABEL = { satellite: "🛰 Satellite", street: "🗺 Street", topo: "⛰ Topo", off: "▨ Vector" };
const SOURCE_KEY = { satellite: "esri_imagery", street: "osm", topo: "opentopo" };

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
  const [tileMode, setTileMode] = useState(() => {
    const v = typeof localStorage !== "undefined" && localStorage.getItem(LS_TILE_MODE);
    return v && TILE_CYCLE.includes(v) ? v : "satellite";
  });
  useEffect(() => {
    localStorage.setItem(LS_TILE_MODE, tileMode);
  }, [tileMode]);

  const [wrapRef, { w: measuredW, h: measuredH }] = useElementSize();
  const w = measuredW || 400;
  const h = measuredH || 300;

  const hasTrack = Array.isArray(trackPoints) && trackPoints.length >= 2;

  const decTrack = useMemo(
    () => (hasTrack ? decimateTrack(trackPoints, RENDER_MAX_POINTS) : []),
    [trackPoints, hasTrack],
  );

  const currentRow = currentIndex != null && rows ? rows[currentIndex] : null;
  const nextWp = useMemo(
    () =>
      isFiniteCoord(currentRow)
        ? { lat: Number(currentRow.lat), lon: Number(currentRow.lon) }
        : null,
    [currentRow],
  );

  // Web Mercator view: follow frames [centre, next waypoint]; overview
  // frames the whole stage. Returns project() + fractional zoom + centre
  // (the tile layer reuses the zoom/centre so it stays aligned).
  const view = useMemo(() => {
    if (!hasTrack || w === 0) return null;
    if (followMode) {
      const center =
        (isFiniteCoord(followCoords) && followCoords) ||
        (isFiniteCoord(gps) && gps) ||
        null;
      const focus = [center, nextWp].filter(isFiniteCoord);
      return fitView(focus.length ? focus : decTrack, w, h, {
        padding: 40,
        minZoom: FOLLOW_MIN_ZOOM,
        maxZoom: FOLLOW_MAX_ZOOM,
      });
    }
    return fitView(decTrack, w, h, {
      padding: 28,
      minZoom: OVERVIEW_MIN_ZOOM,
      maxZoom: OVERVIEW_MAX_ZOOM,
    });
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

  const project = view?.project;
  const pts = project ? decTrack.map((p) => project(p.lat, p.lon)) : [];
  const frac =
    Number.isFinite(userTrackIdx) && userTrackIdx >= 0 && trackPoints.length > 1
      ? userTrackIdx / (trackPoints.length - 1)
      : 0;
  const splitIdx = Math.round(frac * (decTrack.length - 1));
  const behind = pts.slice(0, splitIdx + 1);
  const ahead = pts.slice(splitIdx);
  const toPolyline = (arr) => arr.map((p) => `${p.x},${p.y}`).join(" ");

  const startP = project ? project(trackPoints[0].lat, trackPoints[0].lon) : null;
  const endP = project
    ? project(trackPoints[trackPoints.length - 1].lat, trackPoints[trackPoints.length - 1].lon)
    : null;

  const userP = project && isFiniteCoord(gps) ? project(gps.lat, gps.lon) : null;
  const userOnScreen =
    userP && userP.x >= -8 && userP.x <= w + 8 && userP.y >= -8 && userP.y <= h + 8;
  const heading = headingAlongTrack(trackPoints, userTrackIdx);
  const userColor = isOffTrack ? "#d97706" : "#16a34a";

  const wpP = project && nextWp ? project(nextWp.lat, nextWp.lon) : null;
  const tilesOn = tileMode !== "off";

  return (
    <div ref={wrapRef} className="relative w-full h-full bg-[#edf1f5] overflow-hidden">
      {tilesOn && view && (
        <TileLayer
          tileSource={SOURCE_KEY[tileMode]}
          centerLat={view.centerLat}
          centerLon={view.centerLon}
          zoom={view.zoom}
          width={w}
          height={h}
        />
      )}

      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0"
      >
        {/* travelled (faded) — white casing + muted core */}
        {behind.length >= 2 && (
          <>
            <polyline points={toPolyline(behind)} fill="none" stroke="#ffffff" strokeOpacity={0.85} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={toPolyline(behind)} fill="none" stroke="#94a3b8" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {/* ahead — white casing + bold dark core, reads over any backdrop */}
        {ahead.length >= 2 && (
          <>
            <polyline points={toPolyline(ahead)} fill="none" stroke="#ffffff" strokeOpacity={0.9} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={toPolyline(ahead)} fill="none" stroke="#1e293b" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}

        {/* every roadbook row with coords = a subtle, tappable dot */}
        {rows &&
          rows.map((r, i) => {
            if (!isFiniteCoord(r) || i === currentIndex) return null;
            const p = project(Number(r.lat), Number(r.lon));
            return (
              <g key={r.index ?? i} onClick={() => onSelectRow?.(i)} style={{ cursor: "pointer" }}>
                <circle cx={p.x} cy={p.y} r={11} fill="transparent" />
                <circle cx={p.x} cy={p.y} r={2.6} fill="#475569" stroke="#fff" strokeWidth={0.75} />
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
            <circle cx={endP.x} cy={endP.y} r={5.5} fill="#111827" stroke="#fff" strokeWidth={1.5} />
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
            {heading != null && <polygon points="0,-15 5.5,-6 -5.5,-6" fill={userColor} />}
            <circle r={8} fill={userColor} stroke="#fff" strokeWidth={2.5} />
          </g>
        )}
      </svg>

      {/* compass (north-up, static) */}
      <div className="absolute left-2 top-2 flex flex-col items-center text-[10px] leading-none text-slate-700 select-none pointer-events-none drop-shadow">
        <span className="text-xs">↑</span>
        <span>N</span>
      </div>

      {/* tile-style switcher (cycles satellite → street → topo → vector) */}
      <button
        type="button"
        onClick={() => setTileMode((m) => TILE_CYCLE[(TILE_CYCLE.indexOf(m) + 1) % TILE_CYCLE.length])}
        className="absolute right-2 top-2 rounded-lg bg-white/95 border border-gray-300 text-gray-700 shadow-sm px-2 py-1 text-[11px] font-medium hover:bg-white"
        title="Change map style"
      >
        {TILE_LABEL[tileMode]}
      </button>

      {/* attribution (required when tiles are shown) */}
      {tilesOn && (
        <div className="absolute right-2 bottom-11 text-[9px] text-gray-700 bg-white/70 rounded px-1 leading-tight pointer-events-none max-w-[70%] text-right">
          {tileSourceAttribution(SOURCE_KEY[tileMode])}
        </div>
      )}

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
