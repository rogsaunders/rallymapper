import { getIconExportMeta } from "./iconMappings";

export function mergeWithWaypoints(events, waypoints, config) {
  const mergeRadiusM = config.mergeRadiusM ?? 20;
  const merged = [...events];

  for (const rawWaypoint of waypoints || []) {
    const waypoint = normalizeWaypoint(rawWaypoint);
    if (!Number.isFinite(waypoint.lat) || !Number.isFinite(waypoint.lon)) {
      continue;
    }

    const nearby = merged.find(
      (event) =>
        Math.abs((event.distanceM ?? 0) - waypoint.distanceM) <= mergeRadiusM,
    );

    if (nearby) {
      // Manual waypoint always wins — override classification and note
      nearby.icon = waypoint.icon || nearby.icon;
      nearby.eventType = waypoint.eventType || nearby.eventType;
      nearby.tulipTemplate = waypoint.eventType || nearby.tulipTemplate;
      nearby.notes = waypoint.note || nearby.notes;
      nearby.source = "merged";

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
      linkedWaypointIds: waypoint.id ? [waypoint.id] : [],
    });
  }

  return merged.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
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

function combineNotes(a, b) {
  if (!a) return b || "";
  if (!b) return a;
  if (a.includes(b)) return a;
  return `${a} — ${b}`;
}

function humanizeEventType(value) {
  return String(value || "note")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
