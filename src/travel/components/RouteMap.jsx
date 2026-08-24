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
  makeProjector,
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
const LS_ORIENT = "rm_drive_map_orient";
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

  // Orientation: north-up (default) or track-up. Opt-in, persisted.
  const [trackUp, setTrackUp] = useState(() => {
    const v = typeof localStorage !== "undefined" && localStorage.getItem(LS_ORIENT);
    return v === "track";
  });
  useEffect(() => {
    localStorage.setItem(LS_ORIENT, trackUp ? "track" : "north");
  }, [trackUp]);
  // Continuous rotation accumulator (deg) so the CSS transition always takes
  // the short way round when heading crosses 0°/360°.
  const rotAccumRef = useRef(0);

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

  const heading = headingAlongTrack(trackPoints, userTrackIdx);

  // Track-up: rotate the whole map so heading points up. Only in follow mode
  // with a heading and a fix. Render onto an oversized square (the viewport
  // diagonal) centred on the user, then CSS-rotate it by −heading about the
  // centre so the corners stay covered and the user stays pinned centre.
  const rotating =
    trackUp && followMode && heading != null && isFiniteCoord(gps) && !!view;
  const RS = Math.ceil(Math.hypot(w, h)) + 2;
  const renderW = rotating ? RS : w;
  const renderH = rotating ? RS : h;

  const rotCenter =
    (isFiniteCoord(gps) && gps) || (isFiniteCoord(followCoords) && followCoords) || null;
  const project =
    rotating && rotCenter
      ? makeProjector(rotCenter.lat, rotCenter.lon, view.zoom, RS, RS)
      : view?.project;

  // Unwrap the target rotation onto the accumulator so transitions never spin
  // the long way round.
  if (rotating) {
    const targetRot = -heading;
    const prev = rotAccumRef.current;
    const delta = ((((targetRot - prev) % 360) + 540) % 360) - 180;
    rotAccumRef.current = prev + delta;
  }
  const displayRot = rotating ? rotAccumRef.current : 0;
  // Counter-rotation to keep a text label upright inside the rotated stage.
  const upright = (x, y) =>
    rotating ? `rotate(${-displayRot} ${x} ${y})` : undefined;

  const tileCenterLat = rotating ? rotCenter.lat : view?.centerLat;
  const tileCenterLon = rotating ? rotCenter.lon : view?.centerLon;
  const tileZoom = rotating ? view.zoom : view?.zoom;

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
    userP &&
    userP.x >= -8 &&
    userP.x <= renderW + 8 &&
    userP.y >= -8 &&
    userP.y <= renderH + 8;
  const userColor = isOffTrack ? "#d97706" : "#16a34a";

  const wpP = project && nextWp ? project(nextWp.lat, nextWp.lon) : null;
  const tilesOn = tileMode !== "off";

  return (
    <div ref={wrapRef} className="relative w-full h-full bg-[#edf1f5] overflow-hidden">
      {/* Rotating stage: in track-up it's an oversized square centred on the
          user, CSS-rotated by −heading. Overlays below stay screen-fixed. */}
      <div
        className="absolute"
        style={
          rotating
            ? {
                width: RS,
                height: RS,
                left: (w - RS) / 2,
                top: (h - RS) / 2,
                transform: `rotate(${displayRot}deg)`,
                transformOrigin: "center",
                transition: "transform 0.25s linear",
                willChange: "transform",
              }
            : { inset: 0 }
        }
      >
        {tilesOn && view && (
          <TileLayer
            tileSource={SOURCE_KEY[tileMode]}
            centerLat={tileCenterLat}
            centerLon={tileCenterLon}
            zoom={tileZoom}
            width={renderW}
            height={renderH}
          />
        )}

        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${renderW} ${renderH}`}
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
            <text x={startP.x} y={startP.y + 2.5} fontSize={7} textAnchor="middle" fill="#16a34a" fontWeight="bold" transform={upright(startP.x, startP.y)}>S</text>
          </g>
        )}
        {endP && (
          <g>
            <circle cx={endP.x} cy={endP.y} r={5.5} fill="#111827" stroke="#fff" strokeWidth={1.5} />
            <text x={endP.x} y={endP.y + 2.5} fontSize={7} textAnchor="middle" fill="#fff" fontWeight="bold" transform={upright(endP.x, endP.y)}>F</text>
          </g>
        )}

        {/* current / next waypoint — amber, numbered, matches the list */}
        {wpP && (
          <g onClick={() => onSelectRow?.(currentIndex)} style={{ cursor: "pointer" }}>
            <circle cx={wpP.x} cy={wpP.y} r={13} fill="transparent" />
            <circle cx={wpP.x} cy={wpP.y} r={7.5} fill="#d97706" stroke="#fff" strokeWidth={1.5} />
            <text x={wpP.x} y={wpP.y + 2.8} fontSize={8} textAnchor="middle" fill="#fff" fontWeight="bold" transform={upright(wpP.x, wpP.y)}>
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
      </div>

      {/* compass — tap to toggle north-up / track-up; needle points to true north */}
      <button
        type="button"
        onClick={() => setTrackUp((t) => !t)}
        className="absolute left-2 top-2 w-9 h-9 rounded-lg bg-white/95 border border-gray-300 shadow-sm flex items-center justify-center hover:bg-white"
        title={trackUp ? "Track-up — tap for north-up" : "North-up — tap for track-up"}
        aria-label={trackUp ? "Switch to north-up" : "Switch to track-up"}
      >
        <span
          className="flex flex-col items-center leading-none text-[10px] text-slate-700"
          style={{ transform: `rotate(${displayRot}deg)` }}
        >
          <span className="text-xs text-red-600">↑</span>
          <span>N</span>
        </span>
      </button>

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
