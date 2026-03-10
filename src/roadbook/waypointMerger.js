import { getIconExportMeta } from "./iconMappings";

export function mergeWithWaypoints(events, waypoints, config) {
  const mergeRadiusM = config.mergeRadiusM ?? 20;
  const merged = [...events];

  for (const waypoint of waypoints || []) {
    const iconId = waypoint.iconId || waypoint.icon || waypoint.type || "note";
    const eventType = mapWaypointToEventType(iconId);

    const distanceM = Number.isFinite(waypoint.distanceFromStartM)
      ? waypoint.distanceFromStartM
      : 0;

    const nearby = merged.find(
      (event) => Math.abs((event.distanceM ?? 0) - distanceM) <= mergeRadiusM,
    );

    const waypointNote =
      waypoint.poi ||
      waypoint.note ||
      waypoint.description ||
      humanizeEventType(eventType);

    if (nearby) {
      nearby.icon = iconId || nearby.icon;
      nearby.notes = combineNotes(nearby.notes, waypointNote);
      nearby.source = "merged";
      nearby.linkedWaypointIds = [
        ...(nearby.linkedWaypointIds || []),
        waypoint.id || `${waypoint.timestamp || "wp"}`,
      ];
      nearby.confidence = Math.min(1, (nearby.confidence ?? 0.7) + 0.15);
      continue;
    }

    merged.push({
      id: `wp-${waypoint.id || waypoint.timestamp || Math.random().toString(36).slice(2)}`,
      lat: waypoint.lat,
      lon: waypoint.lon,
      distanceM,
      eventType,
      tulipTemplate: eventType,
      icon: iconId,
      notes: waypointNote,
      source: "manual",
      confidence: 0.95,
      linkedWaypointIds: [waypoint.id || `${waypoint.timestamp || "wp"}`],
    });
  }

  return merged.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
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
