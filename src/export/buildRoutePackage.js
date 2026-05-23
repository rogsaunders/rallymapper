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
import { exportRoadbookHtml } from ".././roadbook/roadbookHtmlExport";
import { exportRoadbookDocx } from "./exporters/exportRoadbookDocx";
import {
  renderMapToCanvas,
  computeBounds,
  numberWaypoints,
} from "./staticMapRenderer";

export async function buildRoutePackage(stage, options = {}) {
  validateStage(stage);

  const roadbook = stage?.roadbook ?? null;
  console.log("buildRoutePackage roadbook?", roadbook);
  console.log("buildRoutePackage roadbook rows:", roadbook?.rows?.length);

  const config = {
    includeHema: true,
    includeGarmin: true,
    includeRallyNav: true,
    includeGoogleEarth: true,
    includeGaia: true,
    includePdf: false,
    // Optional printable map PDF blob captured from the live Leaflet map.
    // When provided, it's embedded in the ZIP as `${safeBase}_map.pdf` so
    // organisers/entrants get the printable map alongside the track files.
    mapPdfBlob: null,
    exportedAt: new Date().toISOString(),
    appName: "RouteMapper",
    version: "0.1.0",
    ...options,
  };

  const zip = new JSZip();
  const safeBase = makeBaseName(stage, config);

  const coreFiles = {};
  coreFiles[`${safeBase}_stage.json`] = exportMasterJson(
    stage,
    roadbook,
    config,
  );
  coreFiles[`${safeBase}_track.gpx`] = exportUniversalTrackGpx(stage, config);
  coreFiles[`${safeBase}_waypoints.gpx`] = exportUniversalWaypointsGpx(
    stage,
    config,
  );
  coreFiles[`${safeBase}_combined.gpx`] = exportCombinedGpx(stage, config);

  if (roadbook) {
    // Pre-render the stage-overview map ONCE and hand the same image to
    // both roadbook exporters.  This keeps HTML and DOCX visually identical,
    // and amortises ~30 OSM tile fetches across both files.
    //
    // Best-effort: any failure (offline, blocked tile server, no GPS data)
    // skips the map silently and ships the roadbook unchanged.
    let mapImage = null;
    try {
      mapImage = await renderRoadbookMap(stage, config);
    } catch (e) {
      console.warn(
        "buildRoutePackage: roadbook map render failed — embedding skipped",
        e,
      );
    }

    const exportOpts = {
      author: config.author || null,
      mapImageDataUrl: mapImage?.dataUrl ?? null,
      mapImageBytes:   mapImage?.bytes   ?? null,
    };
    coreFiles[`${safeBase}_roadbook.json`] = JSON.stringify(roadbook, null, 2);
    coreFiles[`${safeBase}_roadbook.html`] = await exportRoadbookHtml(stage, exportOpts);
    coreFiles[`${safeBase}_roadbook.docx`] = await exportRoadbookDocx(stage, exportOpts);
  }

  // Embed the printable map PDF (captured while the map was still visible)
  // so the ZIP is a complete, share-ready package.
  if (config.mapPdfBlob) {
    coreFiles[`${safeBase}_map.pdf`] = config.mapPdfBlob;
  }

  Object.entries(coreFiles).forEach(([name, content]) =>
    zip.file(name, content),
  );

  const manifest = buildManifest(stage, config, safeBase, roadbook);

  if (config.includeHema) {
    addFolderFiles(
      zip.folder("hema"),
      exportHemaFiles(stage, config, safeBase),
      manifest.files.hema,
    );
  }

  if (config.includeGarmin) {
    addFolderFiles(
      zip.folder("garmin"),
      exportGarminFiles(stage, config, safeBase),
      manifest.files.garmin,
    );
  }

  if (config.includeRallyNav) {
    addFolderFiles(
      zip.folder("rallynav"),
      {
        [`${safeBase}_rallynav_track.gpx`]: exportUniversalTrackGpx(
          stage,
          config,
        ),
        [`${safeBase}_rallynav_waypoints.gpx`]: exportUniversalWaypointsGpx(
          stage,
          config,
        ),
      },
      manifest.files.rallynav,
    );
  }

  if (config.includeGoogleEarth) {
    addFolderFiles(
      zip.folder("google-earth"),
      exportGoogleEarthKml(stage, config, safeBase),
      manifest.files.googleEarth,
    );
  }

  if (config.includeGaia) {
    addFolderFiles(
      zip.folder("gaia"),
      exportGaiaFiles(stage, config, safeBase),
      manifest.files.gaia,
    );
  }

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("README.md", buildReadme(config));

  return zip.generateAsync({ type: "blob" });
}

function addFolderFiles(folder, files, manifestArray) {
  Object.entries(files).forEach(([name, content]) => {
    folder.file(name, content);
    manifestArray.push(`${folder.name}/${name}`);
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

/**
 * Render the stage's overview map for embedding in the roadbook (HTML + DOCX).
 * Returns `{ dataUrl, bytes }`:
 *   - `dataUrl`: base64 PNG data URL, ready to drop into `<img src="…">`
 *   - `bytes`:   Uint8Array of the same PNG, for docx's `ImageRun`
 *
 * Returns `null` if there isn't enough data to draw a meaningful map
 * (no start, no track points, no waypoints).
 */
async function renderRoadbookMap(stage, config) {
  const trackPoints = Array.isArray(stage.trackPoints) ? stage.trackPoints : [];
  const waypoints   = Array.isArray(stage.waypoints)   ? stage.waypoints   : [];

  // routePositions: start (first track point or explicit start) + track only.
  // Waypoints become markers, not vertices in the polyline.
  const routePts = [];
  trackPoints.forEach((p) => {
    const lat = Number(p?.lat);
    const lon = Number(p?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      routePts.push([lat, lon]);
    }
  });

  // bounds covers everything the map should fit (track + waypoints).
  const allPts = [...routePts];
  waypoints.forEach((w) => {
    const lat = Number(w?.lat);
    const lon = Number(w?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      allPts.push([lat, lon]);
    }
  });
  const bounds = computeBounds(allPts);
  if (!bounds || routePts.length < 2) return null;

  // Stage saves don't currently retain the user's last tileSource pick;
  // for the roadbook we default to OSM (most legible in print) and accept
  // an override via config.mapTileSource if a caller wants Esri/OpenTopo.
  const tileSource = config.mapTileSource || "osm";

  const canvas = await renderMapToCanvas({
    routePositions: routePts,
    waypoints:      numberWaypoints(waypoints),
    bounds,
    tileSource,
    width:   1600,
    height:  1000,
    padding: 40,
  });

  const dataUrl = canvas.toDataURL("image/png");

  // docx's ImageRun wants raw bytes (Uint8Array).  Cheapest path is to
  // decode the base64 portion of the data URL we already have, rather than
  // round-tripping through Blob/arrayBuffer.
  const b64 = dataUrl.split(",", 2)[1] || "";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  return { dataUrl, bytes };
}

function buildReadme(config) {
  return `# ${config.appName} Export Package

This ZIP was generated by ${config.appName} ${config.version}.

Core files:
- stage JSON
- universal track GPX
- universal waypoints GPX
- roadbook JSON/CSV when available

Target folders may include Hema, Garmin, Rally Navigator, Google Earth, and Gaia GPS exports.
`;
}
