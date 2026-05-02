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

    const nearby = merged.find(
      (event) =>
        Math.abs((event.distanceM ?? 0) - waypoint.distanceM) <= mergeRadiusM,
    );

    if (nearby) {
      // Manual waypoint always wins — override classification, note, and the
      // bearings/angle. Using the waypoint's own track-position angle ensures
      // the rendered tulip direction matches the manual icon, even when a
      // nearby auto-detected event had the opposite sign.
      nearby.icon = waypoint.icon || nearby.icon;
      nearby.eventType = waypoint.eventType || nearby.eventType;
      nearby.tulipTemplate = waypoint.eventType || nearby.tulipTemplate;
      nearby.notes = waypoint.note || nearby.notes;
      nearby.source = "merged";
      if (angleData) {
        nearby.bearingIn = angleData.bearingIn;
        nearby.bearingOut = angleData.bearingOut;
        nearby.angle = angleData.angle;
      }

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
      bearingIn: angleData?.bearingIn ?? null,
      bearingOut: angleData?.bearingOut ?? null,
      angle: angleData?.angle ?? null,
      linkedWaypointIds: waypoint.id ? [waypoint.id] : [],
    });
  }

  return merged.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
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
