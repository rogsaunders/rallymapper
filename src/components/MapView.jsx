import React, { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { ICONS } from "../icons/iconRegistry";

const LIVE_SVG = `<svg viewBox="0 0 24 24" width="24" height="24">
  <circle cx="12" cy="12" r="6" fill="#2563EB" stroke="white" stroke-width="3"/>
  <circle cx="12" cy="12" r="10" fill="none" stroke="#2563EB" stroke-opacity="0.35" stroke-width="2"/>
</svg>`;

const START_SVG = `<svg viewBox="0 0 24 24" width="24" height="24">
  <circle cx="12" cy="12" r="9" fill="#2563EB" stroke="white" stroke-width="3" />
</svg>`;

function makeSvgDivIcon(svg, size = 28) {
  const safeSvg =
    typeof svg === "string" && svg.trim()
      ? svg
      : `<svg viewBox="0 0 24 24">
           <text x="10" y="18">•</text>
         </svg>`;

  return L.divIcon({
    className: "rm-leaflet-svg-icon",
    html: `<div class="rm-leaflet-svg-wrap">${safeSvg}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

const svgToDivIcon = (svg, className = "") =>
  L.divIcon({
    className: `wp-svg-icon ${className}`.trim(),
    html: `<div class="wp-svg-wrap">${svg}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });

// Watches the map's container element and calls invalidateSize() whenever
// its rendered size changes. Solves two problems with the previous
// timeout-based approach:
//   1. iPad PWA mounts: layout settles asynchronously after first paint,
//      so a 50 ms timeout could fire before the container had its real
//      size — Leaflet then captured a stale size and rendered tiles for
//      a region that didn't match what the user saw.
//   2. Class-driven resizes (Hide/Show, normal ↔ review): no longer
//      need an explicit resizeKey prop to coordinate — the observer
//      catches them naturally.
//
// Falls back to a single timeout invalidation when ResizeObserver is
// unavailable (very old Safari, mostly).
function FixResize({ resizeKey }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;

    // Always do an immediate invalidation — handles the case where the
    // observer fires before the map has painted any tiles.
    map.invalidateSize();

    if (typeof ResizeObserver === "undefined") {
      // Old-Safari fallback: a single delayed invalidation.
      const t = setTimeout(() => map.invalidateSize(), 250);
      return () => clearTimeout(t);
    }

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [map, resizeKey]);
  return null;
}

function Recenter({ center, zoom, enabled }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;
    if (!center) return;
    map.setView([center.lat, center.lon], zoom, { animate: true });
  }, [enabled, center?.lat, center?.lon, zoom, map]);

  return null;
}

// Pans + zooms to a specific lat/lon when it changes. Used by Review
// Mode so that selecting a roadbook row flies the map to that row's
// coordinates. Distinct from <Recenter/> which is the GPS-follow path
// in Record/Drive Mode.
function FlyTo({ target, zoom = 16, enabled = true }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line no-console
      console.log("[FlyTo] skipped — disabled");
      return;
    }
    if (!target) {
      // eslint-disable-next-line no-console
      console.log("[FlyTo] skipped — no target");
      return;
    }
    const lat = Number(target.lat);
    const lon = Number(target.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      // eslint-disable-next-line no-console
      console.warn("[FlyTo] skipped — invalid coords", { target });
      return;
    }
    // Diagnostic — temporary while we chase the "map lands off-row"
    // bug. Logs every time the effect fires with the coords it's
    // about to apply. Remove after the bug is closed.
    // eslint-disable-next-line no-console
    console.log("[FlyTo] →", lat.toFixed(6), lon.toFixed(6), "zoom:", zoom);
    try {
      // Was: map.flyTo([lat, lon], zoom, { animate: true, duration: 0.6 })
      // Swapped to setView (instant, no animation window) to remove
      // the 600 ms gap during which something else (FitBounds,
      // invalidateSize, a tile load) could clobber the centring.
      // If the bug persists with setView, the cause is downstream
      // (something is overriding view AFTER it's set), not the
      // animation itself.
      map.setView([lat, lon], zoom, { animate: false });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[FlyTo] setView threw, falling back", e);
      map.setView([lat, lon], zoom);
    }
  }, [enabled, target?.lat, target?.lon, zoom, map]);
  return null;
}

// One-shot "fit the map to encompass the whole route" — triggered
// whenever fitKey changes (so Review Mode can refit when the user
// switches between stages). Computes bounds from the union of
// trackPoints and waypoints; falls back to a single setView if only
// one point is available. Skips silently if there's nothing to fit.
function FitBounds({ fitKey, points, padding = 32 }) {
  const map = useMap();
  useEffect(() => {
    if (fitKey == null) return;
    if (!points || points.length === 0) return;

    const valid = points
      .map((p) => [Number(p?.lat), Number(p?.lon)])
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));

    if (valid.length === 0) return;

    if (valid.length === 1) {
      map.setView(valid[0], 14, { animate: true });
      return;
    }

    try {
      const bounds = L.latLngBounds(valid);
      map.fitBounds(bounds, {
        padding: [padding, padding],
        maxZoom: 16,
        animate: true,
      });
    } catch (e) {
      // Defensive — fall back to the first point.
      map.setView(valid[0], 14);
    }
    // fitKey is the trigger; points is captured via closure so we
    // explicitly don't want it in the dep list (would refit on every
    // marker re-render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);
  return null;
}

// ── Waypoint map marker helpers ───────────────────────────────────────────────
//
// Map markers use a compact two-row HTML badge instead of the full SVG icons.
// The top row shows an abbreviated type/icon label (L, R, H1, N, …) on a
// coloured background; the bottom row shows the sequential WP number.
// This approach:
//   • avoids the "NOTE" text rendered by note.svg
//   • works reliably in PDF captures (pure HTML/CSS, no canvas timing issues)
//   • lets navigators cross-reference with the roadbook instantly

const ICON_ABBR = {
  // Nav
  left: "L", right: "R", keep_l: "KL", keep_r: "KR",
  straight: "S", gate: "GT", cattle_gate: "CG",
  railroad: "RR", give_way: "GW", caution: "CA",
  // Hazard
  danger_1: "H1", danger_2: "H2", danger_3: "H3",
  // Terrain
  bump: "B", bumps: "BB", dip: "D", twisty: "TW",
  ruts: "RT", washout: "WO", up_hill: "UP", down_hill: "DN",
  // Control
  start: "ST", finish: "FN", stop: "SP", checkpoint: "CP",
  time: "TC", fuel: "F", service: "SV",
  // Speed (badge shows the limit itself — what a driver wants to read)
  speed_25: "25", speed_40: "40", speed_50: "50", speed_60: "60",
  speed_80: "80", speed_100: "100", speed_110: "110",
};

const TYPE_COLOR = {
  nav:     "#1d4ed8", // blue
  hazard:  "#dc2626", // red
  control: "#7c3aed", // purple
  terrain: "#b45309", // amber/brown
  note:    "#374151", // grey
  speed:   "#eab308", // yellow — matches real-world speed signage
};

function getIconAbbr(type, iconId) {
  const id = (iconId || "").toLowerCase();
  if (id && ICON_ABBR[id]) return ICON_ABBR[id];
  const t = (type || "note").toLowerCase();
  return { nav: "N", hazard: "H", control: "C", terrain: "T", note: "N" }[t] ?? "N";
}

function getTypeColor(type) {
  return TYPE_COLOR[(type || "note").toLowerCase()] ?? TYPE_COLOR.note;
}

function makeWaypointDivIcon(type, iconId, number, { selected = false } = {}) {
  const abbr  = getIconAbbr(type, iconId);
  const bg    = getTypeColor(type);
  const numHtml = number != null
    ? `<div style="background:#fff;border:1.5px solid #374151;border-radius:3px;
                   font-size:9px;font-weight:700;padding:1px 4px;color:#111;
                   font-family:sans-serif;line-height:1.2;text-align:center;
                   box-shadow:0 1px 2px rgba(0,0,0,0.18);">${number}</div>`
    : "";

  // Review Mode "selected" highlight — a yellow ring around the badge.
  // Implemented as an outer wrapper so the badge geometry is unaffected
  // and only the visual emphasis changes.
  const wrapStyle = selected
    ? `display:flex;flex-direction:column;align-items:center;gap:2px;
       padding:3px;border-radius:8px;background:rgba(234,179,8,0.25);
       box-shadow:0 0 0 2px #eab308, 0 0 12px rgba(234,179,8,0.6);
       pointer-events:none;`
    : `display:flex;flex-direction:column;align-items:center;gap:2px;
       pointer-events:none;`;

  const html = `<div style="${wrapStyle}">
    <div style="background:${bg};color:#fff;border-radius:4px;padding:2px 5px;
                font-size:10px;font-weight:800;font-family:sans-serif;line-height:1.3;
                white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.35);
                border:1.5px solid rgba(255,255,255,0.35);">${abbr}</div>
    ${numHtml}
  </div>`;

  const baseW = Math.max(24, abbr.length * 7 + 12);
  const baseH = number != null ? 34 : 20;
  const w = selected ? baseW + 6 : baseW;
  const h = selected ? baseH + 6 : baseH;

  return L.divIcon({
    className: "rm-waypoint-icon",
    html,
    iconSize:    [w, h],
    iconAnchor:  [w / 2, h / 2],
    popupAnchor: [0, -(h / 2)],
  });
}

export default function MapView({
  currentGPS,
  startGPS,
  waypoints,
  pendingWaypoint = null,
  trackPoints,
  followMap,
  showMap = true,
  mapMode = "normal",
  mapSource = "osm",
  resizeKey = 0,
  // Review Mode plumbing (Record/Drive ignore these):
  //  • selectedWaypointId — id of the waypoint to highlight + fly to.
  //  • onMarkerClick(id)  — invoked when a waypoint marker is tapped;
  //                         Review Mode uses this to select the matching
  //                         roadbook row.
  //  • flyToTarget        — {lat, lon} to pan/zoom to (independent of
  //                         selectedWaypointId so Review can fly to
  //                         derived-row coords that aren't a waypoint).
  selectedWaypointId = null,
  onMarkerClick = null,
  flyToTarget = null,
  // Review Mode: change `fitBoundsKey` to trigger a one-shot fit of
  // the map to the union of trackPoints + waypoints. The key
  // identifies "which stage" — when it changes (e.g. switching
  // between historical entries) the map refits to the new route.
  // null/undefined = no auto-fit (Record/Drive default).
  fitBoundsKey = null,
  // Review Mode: override the per-waypoint "WP N" badge number with
  // the row index of the roadbook view currently being displayed.
  // Object keyed by waypoint id → 1-based row number. Waypoints
  // missing from the map fall back to the default 1-based-in-array
  // numbering. Record/Drive don't pass this and keep the default.
  waypointNumberOverride = null,
}) {
  const tile = useMemo(() => {
    switch (mapSource) {
      case "esri_imagery":
        return {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          attribution: "Tiles © Esri",
          maxZoom: 19,
        };
      case "opentopo":
        return {
          url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
          attribution: "© OpenTopoMap (CC-BY-SA)",
          maxZoom: 17,
        };
      case "osm":
      default:
        return {
          url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        };
    }
  }, [mapSource]);

  const leafletIcons = useMemo(() => {
    const hazardDefaultSvg = ICONS?.hazard?.svg;
    const hazardVariants = ICONS?.hazard?.variants || {};

    return new Map([
      ["live", makeSvgDivIcon(LIVE_SVG)],
      ["start", makeSvgDivIcon(START_SVG)],
      ["note", makeSvgDivIcon(ICONS?.note?.svg)],
      ["nav", makeSvgDivIcon(ICONS?.nav?.svg)],
      ["control", makeSvgDivIcon(ICONS?.control?.svg)],

      ["hazard", makeSvgDivIcon(hazardDefaultSvg || ICONS?.note?.svg)],
      [
        "danger_1",
        makeSvgDivIcon(hazardVariants?.danger_1?.svg ?? hazardDefaultSvg),
      ],
      [
        "danger_2",
        makeSvgDivIcon(hazardVariants?.danger_2?.svg ?? hazardDefaultSvg),
      ],
      [
        "danger_3",
        makeSvgDivIcon(hazardVariants?.danger_3?.svg ?? hazardDefaultSvg),
      ],

      [
        "unknown",
        makeSvgDivIcon(
          `<svg viewBox="0 0 24 24"><text x="10" y="18">•</text></svg>`,
        ),
      ],
    ]);
  }, []);

  function getLeafletIcon(key, svgFallback) {
    const k = key || "unknown";

    // If this is a per-waypoint / variant key, DON'T cache it
    // Examples: "nav:keep_l", "hazard:danger_2"
    const isVariantKey = k.includes(":");
    if (isVariantKey) {
      return makeSvgDivIcon(svgFallback || ICONS?.note?.svg);
    }

    // Normal cached lookup for base keys: live/start/note/nav/control/hazard/danger_1...
    const cached = leafletIcons.get(k);
    if (cached) return cached;

    if (svgFallback) {
      const built = makeSvgDivIcon(svgFallback);
      leafletIcons.set(k, built);
      return built;
    }

    return leafletIcons.get("unknown");
  }

  const defaultCenter = startGPS ?? currentGPS ?? { lat: -35.0, lon: 138.7 };

  const recenterTarget = useMemo(() => {
    if (!followMap) return null;
    const lastTrk = trackPoints?.length
      ? trackPoints[trackPoints.length - 1]
      : null;
    return lastTrk ?? currentGPS ?? startGPS ?? null;
  }, [followMap, trackPoints, currentGPS, startGPS]);

  const routePositions = useMemo(() => {
    const pts = [];

    const add = (lat, lon) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const last = pts[pts.length - 1];
      if (!last || last[0] !== lat || last[1] !== lon) pts.push([lat, lon]);
    };

    // include start
    if (startGPS) add(Number(startGPS.lat), Number(startGPS.lon));

    const source =
      (trackPoints?.length ? trackPoints : null) ??
      (waypoints?.length ? waypoints : []);

    const rest = source
      .map((p) => [
        Number(p.lat),
        Number(p.lon),
        p.time ?? p.ts ?? p.timestamp ?? "",
      ])
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon))
      .sort((a, b) => String(a[2]).localeCompare(String(b[2])))
      .map(([lat, lon]) => [lat, lon]);

    for (const [lat, lon] of rest) add(lat, lon);

    return pts;
  }, [startGPS, trackPoints, waypoints]);

  // Map each non-start waypoint object → its 1-based display number
  // (WP 1, WP 2, …).
  //
  // If `waypointNumberOverride` is provided (Review Mode), look the
  // waypoint up there first by id — that lets the marker label match
  // the Review row index. Waypoints missing from the override (e.g.
  // filtered out of the Driver view) fall back to the 1-based-in-
  // array numbering so they still carry a meaningful badge.
  const waypointNumberMap = useMemo(() => {
    const m = new Map();
    let n = 0;
    for (const wp of waypoints || []) {
      if (wp.kind === "start" || wp.poi === "START") continue;
      n += 1;
      const overridden = waypointNumberOverride?.[wp.id];
      m.set(wp, Number.isFinite(overridden) ? overridden : n);
    }
    return m;
  }, [waypoints, waypointNumberOverride]);

  return (
    <div
      className={
        mapMode === "review"
          ? "fixed inset-0 z-50" // legacy "full-screen map" toggle
          : mapMode === "fill"
            ? "h-full w-full" // fills its parent container (Review pane)
            : showMap
              ? "h-[100px] sm:h-[180px] md:h-[200px]" // normal record/edit
              : "h-0" // collapsed
      }
    >
      <MapContainer
        center={[defaultCenter.lat, defaultCenter.lon]}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
      >
        <FixResize resizeKey={resizeKey} />

        <TileLayer
          attribution={tile.attribution}
          url={tile.url}
          maxZoom={tile.maxZoom}
          crossOrigin="anonymous"
        />

        <Recenter center={recenterTarget} zoom={14} enabled={followMap} />

        {/* Review Mode: pan/zoom to whatever row the user selected. */}
        <FlyTo target={flyToTarget} zoom={16} enabled={!!flyToTarget} />

        {/* Review Mode: on stage load / stage switch, fit the map to
            the union of trackPoints + waypoints so the whole route is
            visible without the user needing to pan. Skipped in
            Record/Drive (they don't pass fitBoundsKey). */}
        <FitBounds
          fitKey={fitBoundsKey}
          points={[
            ...(trackPoints || []),
            ...(waypoints || []),
            ...(startGPS ? [startGPS] : []),
          ]}
        />

        {routePositions.length >= 2 && (
          <Polyline
            positions={routePositions}
            pathOptions={{ color: "red", weight: 5, opacity: 0.9 }}
          />
        )}

        {/* Live GPS */}
        {currentGPS && (
          <Marker
            position={[currentGPS.lat, currentGPS.lon]}
            icon={getLeafletIcon("live")}
          >
            <Popup>
              Live GPS
              <br />
              <small>{currentGPS.timestamp}</small>
            </Popup>
          </Marker>
        )}

        {/* Start */}
        {startGPS && (
          <Marker
            position={[startGPS.lat, startGPS.lon]}
            icon={getLeafletIcon("start")}
          >
            <Popup>Start Point</Popup>
          </Marker>
        )}

        {/* Waypoints — compact badge markers (abbreviated type + WP number) */}
        {(waypoints || []).map((wp, idx) => {
          const lat = Number(wp?.lat);
          const lon = Number(wp?.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

          const type    = String(wp.type   || "note").toLowerCase();
          const iconId  = String(wp.iconId || "").toLowerCase();
          const isStart = wp.kind === "start" || wp.poi === "START";
          const wpNumber = isStart ? null : waypointNumberMap.get(wp);
          const isSelected =
            selectedWaypointId != null && wp.id === selectedWaypointId;

          // Start uses the blue-circle SVG icon; all others use the compact badge.
          const icon = isStart
            ? getLeafletIcon("start")
            : makeWaypointDivIcon(type, iconId, wpNumber, { selected: isSelected });

          // Review Mode: tapping a marker should select its row. The
          // `onMarkerClick` callback is null in Record/Drive, so the
          // handler is a no-op there.
          const eventHandlers = onMarkerClick
            ? {
                click: () => {
                  if (wp.id != null) onMarkerClick(wp.id);
                },
              }
            : undefined;

          return (
            <Marker
              key={`${wp.timestamp ?? "no-ts"}_${lat}_${lon}_${idx}`}
              position={[lat, lon]}
              icon={icon}
              eventHandlers={eventHandlers}
            >
              <Popup>
                {isStart ? "START" : wp.poi || `WP ${wpNumber}`}
                <br />
                <small>{wp.timestamp}</small>
                {!isStart && (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {String(type).toUpperCase()}
                    {wp.iconId ? ` · ${wp.iconId}` : ""}
                  </div>
                )}
              </Popup>
            </Marker>
          );
        })}

        {/* Pending (snap-first) waypoint — rendered with a pulsing ring */}
        {pendingWaypoint &&
          Number.isFinite(Number(pendingWaypoint.lat)) &&
          Number.isFinite(Number(pendingWaypoint.lon)) &&
          (() => {
            const lat = Number(pendingWaypoint.lat);
            const lon = Number(pendingWaypoint.lon);
            const type = String(pendingWaypoint.type || "").toLowerCase();
            const iconId = String(pendingWaypoint.iconId || "").toLowerCase();
            // Pick the actual selected variant first, then the category's
            // default SVG, then the note placeholder. Generic across every
            // category in iconManifest.json — adding a new category (or a
            // new variant within one) needs no edit here.
            //
            // Previously this was a hardcoded if-chain for hazard / nav /
            // control / terrain, with everything else falling through to
            // ICONS[type].svg (the category's *first* variant). Speed
            // therefore always rendered as speed_25 in the pending state
            // regardless of which variant the user actually selected.
            const svgFallback =
              ICONS[type]?.variants?.[iconId]?.svg ||
              ICONS[type]?.svg ||
              ICONS.note?.svg;
            const pendingIcon = L.divIcon({
              className: "rm-leaflet-svg-icon rm-leaflet-pending",
              html: `<div class="rm-leaflet-svg-wrap rm-pending-wrap">${svgFallback || ""}</div>`,
              iconSize: [36, 36],
              iconAnchor: [18, 18],
              popupAnchor: [0, -18],
            });
            return (
              <Marker
                key="pending-waypoint"
                position={[lat, lon]}
                icon={pendingIcon}
                interactive={false}
              />
            );
          })()}
      </MapContainer>
    </div>
  );
}
