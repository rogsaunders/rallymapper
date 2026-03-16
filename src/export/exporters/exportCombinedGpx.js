import { gpxHeader, gpxFooter, symbolForIcon, xmlEscape } from "./gpxShared";

export function exportCombinedGpx(stage, config = {}) {
  const name = xmlEscape(stage?.meta?.stageName || "RouteMapper");

  const waypoints = (stage.waypoints || [])
    .map((w, index) => {
      const name = xmlEscape(w.name || w.iconId || `WP${index + 1}`);
      const desc = xmlEscape(w.note || "");
      const sym = xmlEscape(symbolForIcon(w.iconId || w.icon));

      return [
        `  <wpt lat="${w.lat}" lon="${w.lon}">`,
        `    <name>${name}</name>`,
        desc ? `    <desc>${desc}</desc>` : null,
        `    <sym>${sym}</sym>`,
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
