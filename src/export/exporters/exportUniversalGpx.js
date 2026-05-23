import {
  gpxFooter,
  gpxHeader,
  openRallyTypeForIcon,
  symbolForIcon,
  xmlEscape,
} from "./gpxShared";

export function exportUniversalTrackGpx(stage, config = {}) {
  const name = xmlEscape(stage?.meta?.stageName || "Stage Track");

  const points = (stage.trackPoints || [])
    .filter(
      (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)),
    )
    .map(buildTrackpointXml)
    .join("\n");

  return [
    gpxHeader(config.appName),
    `  <trk>`,
    `    <name>${name}</name>`,
    `    <trkseg>`,
    points,
    `    </trkseg>`,
    `  </trk>`,
    gpxFooter(),
  ].join("\n");
}

export function exportUniversalWaypointsGpx(stage, config = {}) {
  const startWaypoint = buildStartWaypoint(stage?.startGPS);

  const regularWaypoints = (stage.waypoints || [])
    .filter(
      (w) => Number.isFinite(Number(w.lat)) && Number.isFinite(Number(w.lon)),
    )
    .map((w, index) => buildWaypointXml(w, index));

  const allWaypoints = [startWaypoint, ...regularWaypoints]
    .filter(Boolean)
    .join("\n");

  return [gpxHeader(config.appName), allWaypoints, gpxFooter()].join("\n");
}

export function buildStartWaypoint(startGPS) {
  if (
    !startGPS ||
    !Number.isFinite(Number(startGPS.lat)) ||
    !Number.isFinite(Number(startGPS.lon))
  ) {
    return null;
  }

  const lat = Number(startGPS.lat);
  const lon = Number(startGPS.lon);
  const time = startGPS.timestamp || "";
  const name = xmlEscape("START");
  const desc = xmlEscape("Stage Start");
  const sym = xmlEscape(symbolForIcon("start"));
  const orType = xmlEscape(openRallyTypeForIcon("start"));

  return [
    `  <wpt lat="${lat}" lon="${lon}">`,
    `    <name>${name}</name>`,
    `    <desc>${desc}</desc>`,
    `    <sym>${sym}</sym>`,
    `    <type>${orType}</type>`,
    time ? `    <time>${xmlEscape(time)}</time>` : null,
    `  </wpt>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildWaypointXml(w, index) {
  const lat = Number(w.lat);
  const lon = Number(w.lon);

  const iconId = w.iconId || w.icon || "";
  const type = w.type || "";
  const poi = (w.poi || w.name || "").trim();
  const time = w.timestamp || w.time || "";

  const fallbackName = iconId
    ? iconId.toUpperCase()
    : type
      ? `${type.toUpperCase()} ${index + 1}`
      : `WP${index + 1}`;

  const name = xmlEscape(poi || fallbackName);

  const descParts = [];
  if (type) descParts.push(`Type: ${type}`);
  if (iconId) descParts.push(`Icon: ${iconId}`);
  if (poi) descParts.push(`POI: ${poi}`);

  const desc = xmlEscape(descParts.join(" | "));
  const sym = xmlEscape(symbolForIcon(iconId || type));
  const orType = xmlEscape(openRallyTypeForIcon(iconId || type));

  return [
    `  <wpt lat="${lat}" lon="${lon}">`,
    `    <name>${name}</name>`,
    desc ? `    <desc>${desc}</desc>` : null,
    `    <sym>${sym}</sym>`,
    `    <type>${orType}</type>`,
    time ? `    <time>${xmlEscape(time)}</time>` : null,
    `  </wpt>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildTrackpointXml(p) {
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  const time = p.time || p.timestamp || "";

  return [
    `    <trkpt lat="${lat}" lon="${lon}">`,
    time ? `      <time>${xmlEscape(time)}</time>` : null,
    `    </trkpt>`,
  ]
    .filter(Boolean)
    .join("\n");
}
