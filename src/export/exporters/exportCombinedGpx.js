import {
  gpxFooter,
  gpxHeader,
  openRallyTypeForIcon,
  symbolForIcon,
  xmlEscape,
} from "./gpxShared";

export function exportCombinedGpx(stage, config = {}) {
  const name = xmlEscape(stage?.meta?.stageName || "RouteMapper");

  const waypoints = (stage.waypoints || [])
    .map((w, index) => {
      const iconId = w.iconId || w.icon || "";
      const type = w.type || "";
      const poi = (w.poi || w.name || "").trim();
      const time = w.timestamp || w.time || "";

      // Fallback name: prefer user's poi note, then iconId, then WP index
      const fallbackName = iconId
        ? iconId.toUpperCase()
        : type
          ? `${type.toUpperCase()} ${index + 1}`
          : `WP${index + 1}`;
      const wptName = xmlEscape(poi || fallbackName);

      // Structured desc — "Type: nav | Icon: right | POI: note" — mirrors
      // exportUniversalGpx so the importer can recover iconId exactly.
      const descParts = [];
      if (type) descParts.push(`Type: ${type}`);
      if (iconId) descParts.push(`Icon: ${iconId}`);
      if (poi) descParts.push(`POI: ${poi}`);
      const desc = xmlEscape(descParts.join(" | "));

      const sym = xmlEscape(symbolForIcon(iconId || type));
      const orType = xmlEscape(openRallyTypeForIcon(iconId || type));

      return [
        `  <wpt lat="${w.lat}" lon="${w.lon}">`,
        `    <name>${wptName}</name>`,
        desc ? `    <desc>${desc}</desc>` : null,
        `    <sym>${sym}</sym>`,
        `    <type>${orType}</type>`,
        time ? `    <time>${xmlEscape(time)}</time>` : null,
        `  </wpt>`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const trackPoints = (stage.trackPoints || [])
    .map(
      (p) =>
        `    <trkpt lat="${p.lat}" lon="${p.lon}">${
          p.time ? `\n      <time>${xmlEscape(p.time)}</time>\n    ` : ""
        }</trkpt>`,
    )
    .join("\n");

  const track = [
    `  <trk>`,
    `    <name>${name}</name>`,
    `    <trkseg>`,
    trackPoints,
    `    </trkseg>`,
    `  </trk>`,
  ].join("\n");

  return [
    gpxHeader(config.appName || "RouteMapper"),
    waypoints,
    track,
    gpxFooter(),
  ].join("\n");
}
