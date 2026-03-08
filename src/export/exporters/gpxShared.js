export function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export function symbolForIcon(icon) {
  switch (icon) {
    case "start": return "Flag, Blue"
    case "finish": return "Flag, Red"
    case "danger1":
    case "danger2":
    case "danger3": return "Danger Area"
    case "gate": return "Gate"
    case "water": return "Bridge"
    case "crest": return "Summit"
    case "dip": return "Valley"
    case "control": return "Pin, Blue"
    case "stop": return "Stop Sign"
    default: return "Waypoint"
  }
}

export function gpxHeader(appName = "RouteMapper") {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="${xmlEscape(appName)}" xmlns="http://www.topografix.com/GPX/1/1">`
}

export function gpxFooter() {
  return `</gpx>`
}
