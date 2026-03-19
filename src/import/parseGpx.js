// src/import/parseGpx.js
//
// Parses a GPX file string into a partial stage object that RouteMapper can
// consume directly (trackPoints, waypoints, startGPS, stageName).

import { haversineM } from "../roadbook/geo.js";
import {
  resolveIconFromGpxWpt,
  resolveWaypointTypeCategory,
} from "./gpxIconResolver.js";

/**
 * Parse a GPX XML string into a partial stage.
 *
 * @param {string} gpxText  Raw GPX file contents
 * @returns {{ trackPoints: object[], waypoints: object[], stageName: string, startGPS: object|null }}
 */
export function parseGpxToStage(gpxText) {
  if (!gpxText || typeof gpxText !== "string") {
    throw new Error("parseGpxToStage: expected a GPX string");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(gpxText, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(
      "Invalid GPX: " +
        (parseError.textContent || "XML parse error").slice(0, 200),
    );
  }

  const stageName = extractStageName(doc);
  const trackPoints = extractTrackPoints(doc);
  const waypoints = extractWaypoints(doc, trackPoints);

  const firstTrack = trackPoints[0] ?? null;
  const startGPS = firstTrack
    ? {
        lat: firstTrack.lat,
        lon: firstTrack.lon,
        timestamp: firstTrack.time ?? new Date().toISOString(),
      }
    : null;

  return { trackPoints, waypoints, stageName, startGPS };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractStageName(doc) {
  return (
    doc.querySelector("metadata > name")?.textContent?.trim() ||
    doc.querySelector("trk > name")?.textContent?.trim() ||
    ""
  );
}

function extractTrackPoints(doc) {
  const trkpts = Array.from(doc.querySelectorAll("trkpt"));
  const points = [];
  let distanceFromStartM = 0;

  for (const trkpt of trkpts) {
    const lat = parseFloat(trkpt.getAttribute("lat"));
    const lon = parseFloat(trkpt.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const time = trkpt.querySelector("time")?.textContent?.trim() ?? null;

    if (points.length > 0) {
      const prev = points[points.length - 1];
      distanceFromStartM += haversineM(prev.lat, prev.lon, lat, lon);
    }

    const pt = { lat, lon, distanceFromStartM };
    if (time) pt.time = time;
    points.push(pt);
  }

  return points;
}

function extractWaypoints(doc, trackPoints) {
  const wpts = Array.from(doc.querySelectorAll("wpt"));
  const waypoints = [];

  for (const wpt of wpts) {
    const lat = parseFloat(wpt.getAttribute("lat"));
    const lon = parseFloat(wpt.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const name = wpt.querySelector("name")?.textContent?.trim() ?? "";
    const desc = wpt.querySelector("desc")?.textContent?.trim() ?? "";
    const sym = wpt.querySelector("sym")?.textContent?.trim() ?? "";
    const type = wpt.querySelector("type")?.textContent?.trim() ?? "";
    const time = wpt.querySelector("time")?.textContent?.trim() ?? null;

    const iconId = resolveIconFromGpxWpt({ desc, type, sym });
    const typeCategory = resolveWaypointTypeCategory(iconId);

    // Prefer "POI: xxx" extracted from a RouteMapper-written <desc>; else use <name>
    const poiMatch = desc.match(/\bPOI:\s*(.+?)(?:\s*\||$)/i);
    const poi = (poiMatch ? poiMatch[1].trim() : name) || "";

    const distanceFromStartM = snapWaypointToTrack(lat, lon, trackPoints);

    waypoints.push({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `gpx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      lat,
      lon,
      poi,
      timestamp: time ?? new Date().toISOString(),
      kind: "waypoint",
      type: typeCategory,
      iconId,
      distanceFromStartM,
    });
  }

  return waypoints;
}

/**
 * Find the track point closest to (lat, lon) and return its
 * distanceFromStartM so the waypoint lands at the right place along the route.
 * Returns 0 when there are no track points.
 */
function snapWaypointToTrack(lat, lon, trackPoints) {
  if (!trackPoints.length) return 0;

  let minDist = Infinity;
  let snapped = 0;

  for (const pt of trackPoints) {
    const d = haversineM(lat, lon, pt.lat, pt.lon);
    if (d < minDist) {
      minDist = d;
      snapped = pt.distanceFromStartM;
    }
  }

  return snapped;
}
