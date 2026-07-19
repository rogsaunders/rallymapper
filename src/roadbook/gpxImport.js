// src/roadbook/gpxImport.js
//
// Parse a GPX file (notably a Rally Navigator export) into the shape the
// roadbook engine consumes: { trackPoints, waypoints, meta }. Feed the result
// to generateRoadbook() and you get real tulips + turn detection, identical to
// a live RouteMapper recording.
//
// Why this exists: Lachie's workflow is survey in RouteMapper → edit in Rally
// Navigator → export GPX → distribute. go.routemapper.net can then import that
// GPX (via parseRouteFile) for both Travel "Load roadbook" and Library submit.
//
// What RN actually exports (confirmed from docs/samples/rn-openrally.gpx):
//   • A dense <trkpt> track (the full recorded path) — this is the good bit,
//     and it's what we build the roadbook geometry from.
//   • <wpt> points. In the "Plain" export these are bare position markers
//     (name Untitled_NNN, no semantics). In the "Open Rally" export each <wpt>
//     carries <extensions> with openrally:distance (cumulative km),
//     openrally:cap (heading°), and openrally:tulip / openrally:notes — but the
//     tulip/notes are RENDERED PNG BITMAPS, not symbol codes. There is nothing
//     machine-readable to icon-map, so we ignore them and let the engine
//     regenerate tulips from the track geometry.
//
// Mode: if any <wpt> carries openrally extensions we treat the waypoints as the
// author's curated note-points and pass them through (the engine merges each
// into a nearby detected turn, or emits a "note" row). If none do — a plain
// GPX / bare track — we skip the waypoints (they're coarse shape vertices, not
// instructions) and rely purely on track auto-detection.
//
// Intentionally regex-based, not DOMParser: an Open Rally file is ~700 KB and
// most of that is base64 tulip bitmaps we never use. Streaming the tags we care
// about avoids inflating all that base64 into DOM nodes.

const NUM = "[-+]?\\d*\\.?\\d+";
const TRKPT_RE = new RegExp(
  `<trkpt\\b[^>]*?\\blat="(${NUM})"[^>]*?\\blon="(${NUM})"[^>]*?>([\\s\\S]*?)<\\/trkpt>`,
  "g",
);
const WPT_RE = new RegExp(
  `<wpt\\b[^>]*?\\blat="(${NUM})"[^>]*?\\blon="(${NUM})"[^>]*?>([\\s\\S]*?)<\\/wpt>`,
  "g",
);
const ELE_RE = new RegExp(`<ele>\\s*(${NUM})\\s*<\\/ele>`);
const NAME_RE = /<name>([\s\S]*?)<\/name>/;
const OR_DISTANCE_RE = new RegExp(`<openrally:distance>\\s*(${NUM})\\s*<\\/openrally:distance>`);
const OR_CAP_RE = new RegExp(`<openrally:cap>\\s*(${NUM})\\s*<\\/openrally:cap>`);
const METADATA_RE = /<metadata\b[\s\S]*?<\/metadata>/;
const OR_UNITS_RE = /<openrally:units>\s*([\s\S]*?)\s*<\/openrally:units>/;
const OR_FORMAT_RE = /<openrally:format>\s*([\s\S]*?)\s*<\/openrally:format>/;
const CREATOR_RE = /<gpx\b[^>]*\bcreator="([^"]*)"/;
const TRK_NAME_RE = /<trk\b[\s\S]*?<name>([\s\S]*?)<\/name>/;

const UNTITLED_RE = /^untitled[_\s-]*\d+$/i;

/**
 * Parse GPX text into { trackPoints, waypoints, meta }.
 *   trackPoints: [{ lat, lon, ele? }]           — dense recorded path
 *   waypoints:   [{ lat, lon, icon, note?, cap?, distanceFromStartM }]
 *                (empty unless the file carries openrally waypoint extensions)
 *   meta:        { title, source, creator, units, format, totalDistanceKm }
 * Throws if the file has no usable track.
 */
export function parseGpxToStage(text) {
  if (typeof text !== "string" || !text.includes("<gpx")) {
    throw new Error("Not a GPX file.");
  }

  const trackPoints = [];
  for (const m of text.matchAll(TRKPT_RE)) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const point = { lat, lon };
    const ele = ELE_RE.exec(m[3]);
    if (ele) point.ele = Number(ele[1]);
    trackPoints.push(point);
  }

  if (trackPoints.length < 2) {
    throw new Error(
      "GPX has no track. Rally Navigator must export a track (<trkpt>) for the roadbook — re-export with the track included.",
    );
  }

  // Waypoints: only meaningful when annotated (Open Rally export). A plain GPX
  // has bare shape-vertex <wpt>s we deliberately ignore.
  const waypoints = [];
  for (const m of text.matchAll(WPT_RE)) {
    const inner = m[3];
    if (!inner.includes("openrally:")) continue; // bare shape point — skip
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const distKm = OR_DISTANCE_RE.exec(inner);
    const cap = OR_CAP_RE.exec(inner);
    const nameM = NAME_RE.exec(inner);
    const rawName = nameM ? nameM[1].trim() : "";
    const name = UNTITLED_RE.test(rawName) ? "" : rawName;

    waypoints.push({
      lat,
      lon,
      // No readable symbol in RN's export — a generic marker. The engine
      // regenerates the tulip from the surrounding track geometry.
      icon: "note",
      ...(name ? { note: name } : {}),
      ...(cap ? { cap: Number(cap[1]) } : {}),
      distanceFromStartM: distKm ? Number(distKm[1]) * 1000 : 0,
    });
  }

  const metaBlock = (METADATA_RE.exec(text) || [""])[0];
  const totalDistance = OR_DISTANCE_RE.exec(metaBlock);
  const units = OR_UNITS_RE.exec(metaBlock);
  const format = OR_FORMAT_RE.exec(metaBlock);
  const creator = CREATOR_RE.exec(text);
  const trkName = TRK_NAME_RE.exec(text);

  const meta = {
    title: (trkName ? trkName[1].trim() : "") || "Imported GPX route",
    source: "gpx-import",
    creator: creator ? creator[1] : null,
    units: units ? units[1].trim() : "metric",
    format: format ? format[1].trim() : null,
    totalDistanceKm: totalDistance
      ? Number(totalDistance[1])
      : waypoints.length
        ? waypoints[waypoints.length - 1].distanceFromStartM / 1000
        : null,
  };

  return { trackPoints, waypoints, meta };
}

/** True for filenames/inputs we should route through the GPX importer. */
export function isGpxFilename(name) {
  return typeof name === "string" && name.toLowerCase().endsWith(".gpx");
}
