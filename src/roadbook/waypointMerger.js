import { getIconExportMeta } from "./iconMappings";
import {
  bearingBetweenPoints,
  circularMeanDeg,
  normalizeAngle,
} from "./geo";

// How far ahead/behind a manual waypoint to search for an auto-detected
// turn candidate to snap onto, when the locally-measured angle is shallow.
// Sized to forgive realistic offsets:
//   • driver glances at signage on approach and calls "Mapper" early
//   • call lands on the entry to a roundabout but the actual exit turn
//     is on the other side of the loop (~300–400 m of road distance)
// Still tight enough that the next turn down a long straight won't be
// confused for the one the driver was naming.
const SNAP_SEARCH_RADIUS_M = 400;

export function mergeWithWaypoints(events, waypoints, preprocessedTrack, config) {
  const mergeRadiusM = config.mergeRadiusM ?? 20;
  const merged = [...events];
  const track = Array.isArray(preprocessedTrack) ? preprocessedTrack : [];

  for (const rawWaypoint of waypoints || []) {
    const waypoint = normalizeWaypoint(rawWaypoint);
    if (!Number.isFinite(waypoint.lat) || !Number.isFinite(waypoint.lon)) {
      continue;
    }

    // Compute the turn angle from the track points either side of the
    // waypoint's recorded distance. Mirrors the windowing in turnDetection.js
    // so manual and derived events use the same yardstick. Returns null when
    // the waypoint is too close to the track start/end to sample reliably.
    let angleData = computeAngleAtDistance(track, waypoint.distanceM);

    // Snap-to-nearby-turn fallback for directional manual waypoints.
    // If the locally-measured angle is shallow (driver called "Mapper"
    // before reaching the apex, or the GPS pin landed slightly off the
    // turn), search nearby auto-detected turn candidates within
    // SNAP_SEARCH_RADIUS_M of the waypoint's distance for one whose
    // direction matches the manual icon — adopt its bearings/angle so
    // the rendered tulip reflects the actual turn the driver intended.
    const minTurnAngleDeg = config.minTurnAngleDeg ?? 25;
    if (
      isDirectionalIcon(waypoint.icon) &&
      isShallow(angleData, minTurnAngleDeg)
    ) {
      const iconDir = directionFromIcon(waypoint.icon);
      const snapped = findNearbyDirectionalTurn(
        events,
        waypoint.distanceM,
        iconDir,
        SNAP_SEARCH_RADIUS_M,
        minTurnAngleDeg,
      );
      if (snapped) {
        angleData = {
          bearingIn: snapped.bearingIn,
          bearingOut: snapped.bearingOut,
          angle: snapped.angle,
        };
      }
    }

    // Resolve which bearings/angle to apply based on the manual icon:
    //  • non-directional icons (note, straight, gate, …) get angle:null so
    //    the renderer falls back to the canned template
    //  • directional icons (left, right, bear_*, sharp_*, hairpin_*) get
    //    the measured magnitude, sign-flipped if it disagrees with the
    //    icon's direction — driver knows which way they turned
    const resolved = resolveAngleForIcon(waypoint.icon, angleData);

    // Stage-start waypoints are sacrosanct: they must always render as
    // their own roadbook row (the Start tulip + "Start" note), never be
    // merged into a turn detected at the same coordinates, and never have
    // a separate waypoint (e.g. a Bump tapped immediately after Start
    // Stage at the same GPS) collapsed INTO them.  Without this, the
    // typical "Add Waypoint at distance 0" case overwrites the start's
    // icon/notes with whatever the user just added.
    const isStartWaypoint = waypoint.eventType === "start";
    const nearby = isStartWaypoint
      ? null
      : merged.find(
          (event) =>
            Math.abs((event.distanceM ?? 0) - waypoint.distanceM) <=
              mergeRadiusM && event.eventType !== "start",
        );

    if (nearby) {
      // Manual waypoint always wins — override classification, note, and
      // the bearings/angle.
      nearby.icon = waypoint.icon || nearby.icon;
      nearby.eventType = waypoint.eventType || nearby.eventType;
      nearby.tulipTemplate = waypoint.eventType || nearby.tulipTemplate;
      nearby.notes = waypoint.note || nearby.notes;
      nearby.source = "merged";
      nearby.bearingIn = resolved.bearingIn;
      nearby.bearingOut = resolved.bearingOut;
      nearby.angle = resolved.angle;

      const existingIds = Array.isArray(nearby.linkedWaypointIds)
        ? nearby.linkedWaypointIds.filter(Boolean)
        : [];

      nearby.linkedWaypointIds = waypoint.id
        ? [...existingIds, waypoint.id]
        : existingIds;

      nearby.confidence = Math.min(1, (nearby.confidence ?? 0.7) + 0.15);
      continue;
    }

    merged.push({
      id: `wp-${waypoint.id || waypoint.timestamp || Math.random().toString(36).slice(2)}`,
      lat: waypoint.lat,
      lon: waypoint.lon,
      distanceM: waypoint.distanceM,
      eventType: waypoint.eventType,
      tulipTemplate: waypoint.eventType,
      icon: waypoint.icon,
      notes: waypoint.note,
      source: "manual",
      confidence: 0.95,
      bearingIn: resolved.bearingIn,
      bearingOut: resolved.bearingOut,
      angle: resolved.angle,
      linkedWaypointIds: waypoint.id ? [waypoint.id] : [],
    });
  }

  return merged.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
}

// Decide what bearings/angle to apply to a manual waypoint, given its icon
// and the angle data measured from the surrounding track points.
//
//  • Non-directional icons (note, straight, gate, start, finish, …) return
//    nulls so the renderer falls back to the canned template. Otherwise a
//    "keep straight" waypoint placed near a real road bend would render as
//    a corner labelled "straight".
//
//  • Directional icons (left, right, keep_l/r, bear_*, sharp_*, hairpin_*)
//    return the measured magnitude. If the measured sign disagrees with the
//    icon's direction (e.g. driver said "Left" but the GPS curve there
//    measured +60°), the sign is flipped so the rendered direction matches
//    the spoken intent. Magnitude is preserved either way.
function resolveAngleForIcon(icon, angleData) {
  if (!angleData || !isDirectionalIcon(icon)) {
    return { bearingIn: null, bearingOut: null, angle: null };
  }
  const iconDir = directionFromIcon(icon);
  const angleDir =
    angleData.angle > 0 ? "right" : angleData.angle < 0 ? "left" : null;
  const angle =
    iconDir && angleDir && iconDir !== angleDir
      ? -angleData.angle
      : angleData.angle;
  return {
    bearingIn: angleData.bearingIn,
    bearingOut: angleData.bearingOut,
    angle,
  };
}

const DIRECTIONAL_ICONS = new Set([
  "left",
  "right",
  "keep_l",
  "keep_r",
  "bear_left",
  "bear_right",
  "sharp_left",
  "sharp_right",
  "hairpin_left",
  "hairpin_right",
]);

function isDirectionalIcon(icon) {
  return DIRECTIONAL_ICONS.has(icon);
}

function directionFromIcon(icon) {
  if (!icon) return null;
  if (icon === "left" || icon === "keep_l" || icon.endsWith("_left")) {
    return "left";
  }
  if (icon === "right" || icon === "keep_r" || icon.endsWith("_right")) {
    return "right";
  }
  return null;
}

// Treat a measured angle as "shallow" when its magnitude is below the
// auto-detector's own minimum-turn threshold. Below this, the driver is
// effectively on a straight section and any L/R icon they placed here
// almost certainly refers to a turn slightly ahead/behind.
function isShallow(angleData, minTurnAngleDeg) {
  if (!angleData || !Number.isFinite(angleData.angle)) return true;
  return Math.abs(angleData.angle) < minTurnAngleDeg;
}

// Search the auto-detected turn candidates for the nearest one (by road
// distance) within `searchRadiusM` of the given distance whose direction
// matches the manual icon and whose magnitude clears the minimum
// threshold. Returns null if nothing suitable is found.
function findNearbyDirectionalTurn(
  events,
  distanceM,
  iconDir,
  searchRadiusM,
  minMagnitudeDeg,
) {
  if (!iconDir || !Number.isFinite(distanceM)) return null;

  let best = null;
  let bestDelta = Infinity;
  for (const event of events) {
    if (event?.source !== "derived") continue;
    if (!Number.isFinite(event.angle) || !Number.isFinite(event.distanceM)) {
      continue;
    }
    if (Math.abs(event.angle) < minMagnitudeDeg) continue;

    const eventDir = event.angle > 0 ? "right" : "left";
    if (eventDir !== iconDir) continue;

    const delta = Math.abs(event.distanceM - distanceM);
    if (delta > searchRadiusM) continue;
    if (delta >= bestDelta) continue;

    bestDelta = delta;
    best = event;
  }
  return best;
}

// Find the track point nearest to the given distance-from-start and compute
// bearingIn/bearingOut/angle using a 3-point averaging window on each side —
// matching the convention in turnDetection.js so manual and auto-detected
// events render with consistent tulip geometry. Returns null when there
// aren't enough surrounding points (waypoint too close to start/end).
function computeAngleAtDistance(track, distanceM) {
  if (!track.length || !Number.isFinite(distanceM)) return null;

  const index = nearestTrackIndex(track, distanceM);
  if (index < 3 || index > track.length - 4) return null;

  const bearingIn = averageBearing(track, index, -3, -1);
  const bearingOut = averageBearing(track, index, 1, 3);
  if (!Number.isFinite(bearingIn) || !Number.isFinite(bearingOut)) return null;

  return {
    bearingIn,
    bearingOut,
    angle: normalizeAngle(bearingOut - bearingIn),
  };
}

function nearestTrackIndex(track, distanceM) {
  let best = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < track.length; i++) {
    const d = track[i]?.distanceFromStartM;
    if (!Number.isFinite(d)) continue;
    const delta = Math.abs(d - distanceM);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return best;
}

function averageBearing(points, index, fromOffset, toOffset) {
  const bearings = [];
  for (let offset = fromOffset; offset <= toOffset; offset += 1) {
    const current = points[index + offset];
    const next = points[index + offset + 1];
    if (!current || !next) continue;
    bearings.push(bearingBetweenPoints(current, next));
  }
  if (!bearings.length) return NaN;
  return circularMeanDeg(bearings);
}

function normalizeWaypoint(wp) {
  const icon = wp.iconId || wp.icon || wp.type || "note";
  const eventType = mapWaypointToEventType(icon);

  return {
    id: wp.id ?? null,
    lat: Number(wp.lat),
    lon: Number(wp.lon),
    timestamp: wp.timestamp || wp.time || null,
    icon,
    eventType,
    note: wp.poi || wp.note || wp.description || humanizeEventType(eventType),
    distanceM: Number.isFinite(Number(wp.distanceFromStartM))
      ? Number(wp.distanceFromStartM)
      : 0,
  };
}

function mapWaypointToEventType(icon) {
  return getIconExportMeta(icon).roadbookEvent;
}

function humanizeEventType(value) {
  return String(value || "note")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
