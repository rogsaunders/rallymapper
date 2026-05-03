import { getIconExportMeta } from "./iconMappings";
import {
  bearingBetweenPoints,
  circularMeanDeg,
  normalizeAngle,
} from "./geo";

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
    const angleData = computeAngleAtDistance(track, waypoint.distanceM);

    // Resolve which bearings/angle to apply based on the manual icon:
    //  • non-directional icons (note, straight, gate, …) get angle:null so
    //    the renderer falls back to the canned template
    //  • directional icons (left, right, bear_*, sharp_*, hairpin_*) get
    //    the measured magnitude, sign-flipped if it disagrees with the
    //    icon's direction — driver knows which way they turned
    const resolved = resolveAngleForIcon(waypoint.icon, angleData);

    const nearby = merged.find(
      (event) =>
        Math.abs((event.distanceM ?? 0) - waypoint.distanceM) <= mergeRadiusM,
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
