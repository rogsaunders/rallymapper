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

function MapReadyBridge({ onMapReady }) {
  const map = useMap();
  useEffect(() => {
    if (typeof onMapReady === "function") onMapReady(map);
  }, [map, onMapReady]);
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

function fmtKm(meters) {
  const km = meters / 1000;
  return km >= 10 ? `${km.toFixed(1)} km` : `${km.toFixed(2)} km`;
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
  onMapReady,
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

  const segmentLabels = useMemo(() => {
    // Use only START + WAYPOINTS for labels (not track points)
    const pts = [];

    const add = (lat, lon) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      pts.push([lat, lon]);
    };

    if (startGPS) add(Number(startGPS.lat), Number(startGPS.lon));

    (waypoints || [])
      .filter((wp) => wp && wp.kind !== "start" && wp.poi !== "START")
      .forEach((wp) => add(Number(wp.lat), Number(wp.lon)));

    if (pts.length < 2) return [];

    const labels = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const meters = L.latLng(a[0], a[1]).distanceTo(L.latLng(b[0], b[1]));
      if (meters < 25) continue;

      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      labels.push({
        key: `wpseg-${i}`,
        position: mid,
        text: fmtKm(meters),
      });
    }

    return labels;
  }, [startGPS, waypoints]);

  return (
    <div
      className={
        mapMode === "review"
          ? "fixed inset-0 z-50" // full screen map
          : showMap
            ? "h-[100px] sm:h-[180px] md:h-[200px]" // normal
            : "h-0" // collapsed
      }
    >
      <MapContainer
        center={[defaultCenter.lat, defaultCenter.lon]}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        preferCanvas={true}
      >
        <FixResize resizeKey={resizeKey} />

        <TileLayer
          attribution={tile.attribution}
          url={tile.url}
          maxZoom={tile.maxZoom}
          crossOrigin="anonymous"
        />

        <MapReadyBridge onMapReady={onMapReady} />

        <Recenter center={recenterTarget} zoom={14} enabled={followMap} />

        {routePositions.length >= 2 && (
          <Polyline
            positions={routePositions}
            pathOptions={{ color: "red", weight: 5, opacity: 0.9 }}
          />
        )}

        {segmentLabels.map((s) => (
          <Marker
            key={s.key}
            position={s.position}
            interactive={false}
            icon={L.divIcon({
              className: "segment-label",
              html: `<div>${s.text}</div>`,
              iconSize: [80, 24], // optional
              iconAnchor: [40, 12], // optional (center the label)
            })}
          />
        ))}

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

        {/* Waypoints */}
        {(waypoints || []).map((wp, idx) => {
          const lat = Number(wp?.lat);
          const lon = Number(wp?.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

          const type = String(wp.type || "").toLowerCase();
          const iconId = String(wp.iconId || "").toLowerCase();
          const rawIconId = wp.iconId; // ✅ add this (or just use wp.iconId directly)
          const isStart = wp.kind === "start" || wp.poi === "START";

          let svgFallback = ICONS.note?.svg;

          if (isStart) {
            svgFallback = START_SVG;
          } else if (type === "hazard") {
            const hazardKey = iconId || "danger_1";
            svgFallback =
              ICONS.hazard?.variants?.[hazardKey]?.svg ||
              ICONS.hazard?.svg ||
              ICONS.note?.svg;
          } else if (type === "nav") {
            const navKey = iconId || "straight";
            const DEBUG = false;
            if (DEBUG && type === "nav")
              console.log("NAV waypoint debug:", {
                type,
                iconId,
                hasVariant: !!ICONS.nav?.variants?.[iconId],
              });
            svgFallback =
              ICONS.nav?.variants?.[navKey]?.svg ||
              ICONS.nav?.svg ||
              ICONS.note?.svg;
          } else if (type === "control") {
            const controlKey = iconId || "start";
            svgFallback =
              ICONS.control?.variants?.[controlKey]?.svg ||
              ICONS.control?.svg ||
              ICONS.note?.svg;
          } else if (type === "terrain") {
            const terrainKey = iconId || "bump";
            svgFallback =
              ICONS.terrain?.variants?.[terrainKey]?.svg ||
              ICONS.terrain?.svg ||
              ICONS.note?.svg;
          } else if (ICONS[type]?.svg) {
            svgFallback = ICONS[type].svg;
          }
          if (type === "nav") {
            console.log("NAV waypoint iconId =", wp.iconId);
          }

          // console.log("NAV svgFallback starts:", svgFallback?.slice?.(0, 120));

          const cacheKey = isStart ? "start" : `${type}:${iconId || "default"}`;
          const icon = getLeafletIcon(cacheKey, svgFallback);

          if (!icon) {
            console.warn("Missing icon for waypoint", {
              type,
              iconId,
              cacheKey,
              svgFallbackLen: svgFallback?.length,
              svgFallbackSample: svgFallback?.slice?.(0, 50),
            });
          }

          return (
            <Marker
              key={`${wp.timestamp ?? "no-ts"}_${lat}_${lon}_${idx}`}
              position={[lat, lon]}
              icon={icon}
            >
              <Popup>
                {isStart ? "START" : wp.poi || `Waypoint ${idx + 1}`}
                <br />
                <small>{wp.timestamp}</small>
                {wp.type && (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Type: {String(wp.type).toUpperCase()}
                  </div>
                )}
                {(type === "hazard" || type === "nav") && rawIconId && (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    IconId: {String(rawIconId)}
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
            let svgFallback = ICONS.note?.svg;
            if (type === "hazard") {
              svgFallback =
                ICONS.hazard?.variants?.[iconId || "danger_1"]?.svg ||
                ICONS.hazard?.svg ||
                ICONS.note?.svg;
            } else if (type === "nav") {
              svgFallback =
                ICONS.nav?.variants?.[iconId || "straight"]?.svg ||
                ICONS.nav?.svg ||
                ICONS.note?.svg;
            } else if (type === "control") {
              svgFallback =
                ICONS.control?.variants?.[iconId || "start"]?.svg ||
                ICONS.control?.svg ||
                ICONS.note?.svg;
            } else if (type === "terrain") {
              svgFallback =
                ICONS.terrain?.variants?.[iconId || "bump"]?.svg ||
                ICONS.terrain?.svg ||
                ICONS.note?.svg;
            } else if (ICONS[type]?.svg) {
              svgFallback = ICONS[type].svg;
            }
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
