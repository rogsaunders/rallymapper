export function mergeWithWaypoints(events, waypoints, config) {
  const mergeRadiusM = config.mergeRadiusM ?? 20
  const merged = [...events]

  for (const waypoint of waypoints || []) {
    const distanceM = waypoint.distanceFromStartM ?? 0

    const nearby = merged.find((event) => Math.abs(event.distanceM - distanceM) <= mergeRadiusM)

    if (nearby) {
      nearby.icon = waypoint.icon || nearby.icon
      nearby.notes = combineNotes(nearby.notes, waypoint.note)
      nearby.source = "merged"
      nearby.linkedWaypointIds = [...(nearby.linkedWaypointIds || []), waypoint.id]
      nearby.confidence = Math.min(1, (nearby.confidence ?? 0.7) + 0.15)
      continue
    }

    const eventType = mapWaypointToEventType(waypoint.icon)

    merged.push({
      id: `wp-${waypoint.id}`,
      lat: waypoint.lat,
      lon: waypoint.lon,
      distanceM,
      eventType,
      tulipTemplate: eventType,
      icon: waypoint.icon || null,
      notes: waypoint.note || humanizeEventType(eventType),
      source: "manual",
      confidence: 0.95,
      linkedWaypointIds: [waypoint.id],
    })
  }

  return merged.sort((a, b) => a.distanceM - b.distanceM)
}

function mapWaypointToEventType(icon) {
  switch (icon) {
    case "start":
      return "start"
    case "finish":
      return "finish"
    case "gate":
      return "gate"
    case "water":
      return "water"
    case "crest":
      return "crest"
    case "dip":
      return "dip"
    case "danger1":
      return "danger_1"
    case "danger2":
      return "danger_2"
    case "danger3":
      return "danger_3"
    case "control":
      return "control"
    default:
      return "note"
  }
}

function combineNotes(a, b) {
  if (!a) return b || ""
  if (!b) return a
  if (a.includes(b)) return a
  return `${a} — ${b}`
}

function humanizeEventType(value) {
  return String(value || "note")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
