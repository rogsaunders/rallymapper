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
  <text x="2" y="18">📡</text>
</svg>`;

const START_SVG = `<svg viewBox="0 0 24 24" width="24" height="24">
  <circle cx="12" cy="12" r="10" fill="#111827" />
  <text x="8" y="16" fill="white" font-size="10">S</text>
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

function FixResize() {
  const map = useMap();

  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 50);
    return () => clearTimeout(t);
  }, [map]);

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
  followMap,
}) {
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
  }, [ICONS]);

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
    const latestWaypoint = waypoints?.length
      ? waypoints[waypoints.length - 1]
      : null;
    return latestWaypoint ?? startGPS ?? currentGPS ?? null;
  }, [followMap, waypoints, startGPS, currentGPS]);

  const routePositions = useMemo(() => {
    const pts = [];

    if (startGPS) {
      const sLat = Number(startGPS.lat);
      const sLon = Number(startGPS.lon);
      if (Number.isFinite(sLat) && Number.isFinite(sLon))
        pts.push([sLat, sLon]);
    }

    const rest = (waypoints || [])
      .filter((wp) => wp && wp.kind !== "start" && wp.poi !== "START")
      .map((wp) => [Number(wp.lat), Number(wp.lon), wp.timestamp])
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon))
      .sort((a, b) => String(a[2] ?? "").localeCompare(String(b[2] ?? "")))
      .map(([lat, lon]) => [lat, lon]);

    for (const p of rest) {
      const last = pts[pts.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
    }

    return pts;
  }, [startGPS, waypoints]);

  const segmentLabels = useMemo(() => {
    if (!routePositions || routePositions.length < 2) return [];
    const labels = [];

    for (let i = 0; i < routePositions.length - 1; i++) {
      const a = routePositions[i];
      const b = routePositions[i + 1];
      if (!a || !b) continue;

      const meters = L.latLng(a[0], a[1]).distanceTo(L.latLng(b[0], b[1]));
      if (meters < 25) continue;

      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

      labels.push({
        key: `seg-${i}`,
        position: mid,
        text: fmtKm(meters),
      });
    }

    return labels;
  }, [routePositions]);

  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={[defaultCenter.lat, defaultCenter.lon]}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
      >
        <FixResize />

        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

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
            console.log("NAV marker", {
              type,
              iconId,
              hasVariant: !!ICONS.nav?.variants?.[iconId],
            });
            svgFallback =
              ICONS.nav?.variants?.[navKey]?.svg ||
              ICONS.nav?.svg ||
              ICONS.note?.svg;
          } else if (type === "control") {
            const controlKey = iconId || "start"; // whatever your default is
            svgFallback =
              ICONS.control?.variants?.[controlKey]?.svg ||
              ICONS.control?.svg ||
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
              key={wp.timestamp ?? `${lat},${lon},${idx}`}
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
                Object.keys(ICONS?.nav?.variants || {})); console.log("navKey
                =", iconId, "variant =", ICONS?.nav?.variants?.[iconId]);
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
