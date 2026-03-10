import { getIconExportMeta } from "./iconMappings";

export function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function symbolForIcon(icon) {
  return getIconExportMeta(icon).gpxSymbol;
}

export function gpxHeader(appName = "RouteMapper") {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="${xmlEscape(appName)}" xmlns="http://www.topografix.com/GPX/1/1">`;
}

export function gpxFooter() {
  return `</gpx>`;
}
