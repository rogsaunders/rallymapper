import JSZip from "jszip";
import { buildManifest } from "./manifestBuilder";
import { exportMasterJson } from "./exporters/exportMasterJson";
import {
  exportUniversalTrackGpx,
  exportUniversalWaypointsGpx,
} from "./exporters/exportUniversalGpx";
import { exportHemaFiles } from "./exporters/exportHemaFiles";
import { exportGarminFiles } from "./exporters/exportGarminFiles";
import { exportGoogleEarthKml } from "./exporters/exportGoogleEarthKml";
import { exportGaiaFiles } from "./exporters/exportGaiaFiles";
import { exportCombinedGpx } from "./exporters/exportCombinedGpx";
import { exportRallyNavCsv } from "./exporters/exportRallyNavCsv";
import { exportRoadbookHtml } from ".././roadbook/roadbookHtmlExport";
import { exportRoadbookDocx } from "./exporters/exportRoadbookDocx";

/**
 * Assemble a stage export ZIP organised by use case rather than by file type.
 *
 * Layout:
 *
 *   README.txt
 *   Universal/
 *     route.gpx      — combined waypoints + track (preferred for most tools)
 *     route.kml      — Google Earth and KML viewers
 *     track.gpx      — track only (fallback for picky importers)
 *     waypoints.gpx  — waypoints only (fallback for picky importers)
 *   RallyNavigator/
 *     route.gpx      — copy of Universal/route.gpx for one-stop RN import
 *   Printable/       — when a roadbook is present
 *     roadbook.html
 *     roadbook.docx
 *     roadbook.csv   — tabular roadbook view (open in Excel / Numbers / Sheets)
 *     map.pdf        — when a Map PDF blob is provided
 *   Source/
 *     stage.json     — full RouteMapper data (re-importable into the app)
 *     roadbook.json  — structured roadbook
 *     manifest.json  — export metadata
 *   Garmin/, Hema/, Gaia/  — tool-specific bundles
 *
 * The README.txt at the root tells the user which file to pick for which
 * tool, so casual users never need to read the folder structure.
 */
export async function buildRoutePackage(stage, options = {}) {
  validateStage(stage);

  const roadbook = stage?.roadbook ?? null;

  const config = {
    includeHema: true,
    includeGarmin: true,
    includeRallyNav: true,
    includeGoogleEarth: true,
    includeGaia: true,
    includePdf: false,
    // Optional printable map PDF blob captured from the live Leaflet map.
    // When provided, it's embedded in Printable/ so organisers/entrants get
    // the printable map alongside the track files.
    mapPdfBlob: null,
    exportedAt: new Date().toISOString(),
    appName: "RouteMapper",
    version: "0.1.0",
    ...options,
  };

  const zip = new JSZip();
  const safeBase = makeBaseName(stage, config);
  const stageName = stage?.meta?.stageName || "Stage";
  const dateStr = config.exportedAt.slice(0, 10);

  // ── README at root — the only place a casual user needs to look ──────
  zip.file("README.txt", buildReadme(stageName, dateStr, config, roadbook));

  // ── Universal/ — works in every modern mapping tool ──────────────────
  // route.gpx is the primary file (waypoints + track in one). Separate
  // track/waypoints variants kept alongside for any consumer that prefers
  // them, until the interop validation pass tells us they can be dropped.
  const universal = zip.folder("Universal");
  const combinedGpx = exportCombinedGpx(stage, config);
  universal.file("route.gpx", combinedGpx);
  universal.file("track.gpx", exportUniversalTrackGpx(stage, config));
  universal.file("waypoints.gpx", exportUniversalWaypointsGpx(stage, config));

  // Google Earth KML lives under Universal/ too — a single discoverable
  // location for any KML-compatible viewer (Google Earth, ArcGIS Earth,
  // many mobile mapping apps).
  const kmlBundle = exportGoogleEarthKml(stage, config, safeBase);
  const kmlContent = Object.values(kmlBundle)[0];
  universal.file("route.kml", kmlContent);

  // ── RallyNavigator/ — self-contained for RN users ────────────────────
  // Per design call: duplicate route.gpx here so RN users get a complete
  // bundle in one folder rather than having to look in Universal/ too.
  // The duplication is trivial in size; the UX win is real.
  if (config.includeRallyNav) {
    const rn = zip.folder("RallyNavigator");
    rn.file("route.gpx", combinedGpx);
  }

  // ── Printable/ — print-ready and spreadsheet outputs ─────────────────
  let printable = null;
  if (roadbook) {
    printable = zip.folder("Printable");
    const exportOpts = { author: config.author || null };
    printable.file("roadbook.html", await exportRoadbookHtml(stage, exportOpts));
    printable.file("roadbook.docx", await exportRoadbookDocx(stage, exportOpts));
    // Tabular roadbook view — useful for Excel/Numbers analysis. Note:
    // this is NOT a Rally Navigator native import format despite the
    // exporter being historically named exportRallyNavCsv.
    printable.file("roadbook.csv", exportRallyNavCsv(stage, { mode: "driver" }));
  }
  if (config.mapPdfBlob) {
    printable = printable || zip.folder("Printable");
    printable.file("map.pdf", config.mapPdfBlob);
  }

  // ── Source/ — for re-import to RouteMapper and build metadata ────────
  const source = zip.folder("Source");
  source.file("stage.json", exportMasterJson(stage, roadbook, config));
  if (roadbook) {
    source.file("roadbook.json", JSON.stringify(roadbook, null, 2));
  }
  const manifest = buildManifest(stage, config, safeBase, roadbook);
  source.file("manifest.json", JSON.stringify(manifest, null, 2));

  // ── Tool-specific bundles — kept until interop validation prunes them ─
  if (config.includeGarmin) {
    addFolderFiles(
      zip.folder("Garmin"),
      exportGarminFiles(stage, config, safeBase),
    );
  }
  if (config.includeHema) {
    addFolderFiles(
      zip.folder("Hema"),
      exportHemaFiles(stage, config, safeBase),
    );
  }
  if (config.includeGaia) {
    addFolderFiles(zip.folder("Gaia"), exportGaiaFiles(stage, config, safeBase));
  }

  return zip.generateAsync({ type: "blob" });
}

function addFolderFiles(folder, files) {
  Object.entries(files).forEach(([name, content]) => {
    folder.file(name, content);
  });
}

function validateStage(stage) {
  if (!stage || !Array.isArray(stage.trackPoints)) {
    throw new Error("buildRoutePackage: stage.trackPoints is required");
  }
}

function makeBaseName(stage, config) {
  const stageName = sanitize(stage?.meta?.stageName || "Stage");
  const date = (config.exportedAt || new Date().toISOString()).slice(0, 10);
  return `${config.appName}_${stageName}_${date}`;
}

function sanitize(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function buildReadme(stageName, dateStr, config, roadbook) {
  const lines = [
    `ROUTEMAPPER STAGE EXPORT`,
    `========================`,
    ``,
    `Stage:        ${stageName}`,
    `Generated:    ${dateStr}`,
    `App version:  ${config.appName} ${config.version}`,
    ``,
    `─────────────────────────────────────────────────────────`,
    `OPEN ONE OF THESE FILES`,
    `─────────────────────────────────────────────────────────`,
    ``,
    `Rally Navigator users`,
    `   →  RallyNavigator/route.gpx     (waypoints + track)`,
    ``,
    `Garmin, Hema, Guru Maps, Gaia GPS users`,
    `   →  Universal/route.gpx          (waypoints + track combined)`,
    ``,
    `Google Earth users`,
    `   →  Universal/route.kml`,
    ``,
  ];

  if (roadbook) {
    lines.push(
      `Printing the roadbook`,
      `   →  Printable/roadbook.html     (open in any browser, then print)`,
      `   →  Printable/roadbook.docx     (edit first in Word or Pages)`,
      `   →  Printable/roadbook.csv      (open in Excel / Numbers / Sheets)`,
      ``,
    );
  }

  if (config.mapPdfBlob) {
    lines.push(
      `Printing the map`,
      `   →  Printable/map.pdf`,
      ``,
    );
  }

  lines.push(
    `Re-import to RouteMapper`,
    `   →  Source/stage.json`,
    ``,
    `─────────────────────────────────────────────────────────`,
    `MORE`,
    `─────────────────────────────────────────────────────────`,
    ``,
    `Need help?  https://routemapper.net/guide`,
    ``,
    `Universal/ also includes alternative GPX layouts in case your`,
    `tool prefers them:`,
    `   route.gpx       — waypoints + track combined (recommended)`,
    `   track.gpx       — track only`,
    `   waypoints.gpx   — waypoints only`,
    ``,
    `Tool-specific folders (Garmin/, Hema/, Gaia/) hold bundles`,
    `pre-organised for those products' native folder conventions.`,
    ``,
    `Source/ contains the full RouteMapper data:`,
    `   stage.json      — importable back into RouteMapper`,
    `   roadbook.json   — structured roadbook data`,
    `   manifest.json   — export metadata`,
    ``,
  );

  return lines.join("\n");
}
