// src/export/exportMapPdf.js
//
// Build a printable PDF of a stage's recorded route + waypoints.
//
// History: previously this file took a live Leaflet `map` instance, resized
// its DOM container to A4 dimensions, ran html2canvas / dom-to-image to
// screenshot it, then jsPDF-embedded the resulting PNG.  That pipeline had
// chronic problems on iPad Safari — offsets, broken polylines, z-order bugs,
// service-worker caching — because it depended on faithfully serialising a
// live, GPU-composited DOM.  The PR #27 thread has the full story.
//
// Now: we render the map ourselves.  `staticMapRenderer.renderMapToCanvas()`
// fetches OSM/Esri/OpenTopo tiles, draws the polyline, draws the waypoint
// badges — all via canvas primitives, all using the same Web-Mercator
// projection.  Pixel-aligned by construction, no DOM screenshot, no Leaflet
// map instance required.  This file's job shrinks to: call the renderer, wrap
// the canvas in a jsPDF page with header/footer text, return the blob.
//
// Usage:
//
//   import { exportMapAsPdf, buildMapPdfBlob } from "../export/exportMapPdf";
//   await exportMapAsPdf({
//     routePositions: [[lat,lon], ...],          // start + track points
//     waypoints:      [{lat, lon, type, ...}],    // all waypoints incl. start
//     bounds:         [[s,w],[n,e]],              // or use computeBounds()
//     tileSource:     "osm" | "esri_imagery" | "opentopo",
//     title:          "Trip Stage 1",
//     date:           new Date(),
//     totalDistanceKm: 5.32,
//     waypointCount:   7,
//     filename:        "trip_stage1",
//   });

import jsPDF from "jspdf";
import {
  renderMapToCanvas,
  tileSourceAttribution,
  computeBounds,
  numberWaypoints,
} from "./staticMapRenderer";

// Re-export the helpers so callers can `import { ..., computeBounds } from
// "../export/exportMapPdf"` without knowing the internal module split.
export { computeBounds, numberWaypoints, tileSourceAttribution };

function slugify(s) {
  return String(s || "routemapper-map")
    .replace(/[^a-z0-9-_]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delay revoke a tick to avoid Safari weirdness
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function formatDate(d) {
  try {
    const date = d instanceof Date ? d : new Date(d || Date.now());
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return new Date().toLocaleDateString();
  }
}

// PDF canvas dimensions.  150 DPI on A4 landscape's usable area (273×172 mm).
// The renderer aligns tiles and polyline at this resolution; the jsPDF
// addImage call below preserves aspect ratio when placing it on the page.
const PDF_CANVAS_W = 1600;
const PDF_CANVAS_H = 1000;

/**
 * Render + assemble the PDF.  Returns `{ blob, filename }` — the caller
 * decides whether to download it, embed it in a ZIP, etc.
 */
export async function buildMapPdfBlob(meta = {}) {
  const {
    title = "RouteMapper Map",
    date = new Date(),
    totalDistanceKm = 0,
    waypointCount = 0,
    tileSource = "osm",
    tileAttribution,                  // optional override
    filename,
    routePositions = [],
    waypoints = [],
    bounds,
  } = meta;

  if (!bounds) {
    throw new Error(
      "buildMapPdfBlob: bounds is required.  Use computeBounds([startGPS, " +
        "...trackPoints, ...waypoints]) before calling.",
    );
  }

  // Render the map.  `numberWaypoints` assigns the 1-based WP numbers shown
  // on the badges — callers can pre-do this and pass numbered waypoints, or
  // we'll do it here if they didn't.
  const numberedWaypoints = waypoints.some((w) => w?.number != null)
    ? waypoints
    : numberWaypoints(waypoints);

  const canvas = await renderMapToCanvas({
    routePositions,
    waypoints: numberedWaypoints,
    bounds,
    tileSource,
    width:  PDF_CANVAS_W,
    height: PDF_CANVAS_H,
    padding: 40,
  });

  const pngDataUrl = canvas.toDataURL("image/png");

  // ── PDF assembly ───────────────────────────────────────────────────────
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();  // 297 mm
  const pageH = pdf.internal.pageSize.getHeight(); // 210 mm

  // Header
  pdf.setFontSize(14).setFont(undefined, "bold");
  pdf.text(String(title), 12, 13);

  pdf.setFontSize(10).setFont(undefined, "normal");
  pdf.text(formatDate(date), pageW - 12, 13, { align: "right" });

  // Map image, fit-to-box preserving aspect ratio
  const imgTop    = 18;
  const imgBottom = pageH - 16;
  const boxH = imgBottom - imgTop;
  const boxW = pageW - 24;
  const boxX = 12;

  const srcRatio = canvas.width / canvas.height;
  const boxRatio = boxW / boxH;

  let drawW;
  let drawH;
  if (srcRatio >= boxRatio) {
    drawW = boxW;
    drawH = boxW / srcRatio;
  } else {
    drawH = boxH;
    drawW = boxH * srcRatio;
  }
  const drawX = boxX + (boxW - drawW) / 2;
  const drawY = imgTop + (boxH - drawH) / 2;

  try {
    pdf.addImage(pngDataUrl, "PNG", drawX, drawY, drawW, drawH, undefined, "FAST");
  } catch (e) {
    console.error("buildMapPdfBlob: addImage failed", e);
    throw new Error(
      "Could not embed the map image.  This can happen if the tile server " +
        "blocked cross-origin access for some tiles.  Try switching to " +
        "OpenStreetMap and exporting again.",
    );
  }

  // Footer
  pdf.setFontSize(9).setFont(undefined, "normal");
  const footerY = pageH - 8;

  const distText = `Distance: ${Number(totalDistanceKm).toFixed(2)} km`;
  const wpText   = `Waypoints: ${Number(waypointCount) || 0}`;
  pdf.text(distText, 12, footerY);
  pdf.text(wpText, 70, footerY);

  pdf.text("Generated by RouteMapper", pageW / 2, footerY, { align: "center" });

  const attr = tileAttribution || tileSourceAttribution(tileSource);
  const safeAttr = String(attr)
    .replace(/<[^>]*>/g, "")
    .replace(/&copy;/gi, "©");
  pdf.text(safeAttr, pageW - 12, footerY, { align: "right" });

  const blob = pdf.output("blob");
  const finalName = `${slugify(filename || title)}.pdf`;

  return { blob, filename: finalName };
}

/**
 * Build the PDF and trigger a browser download.  Thin wrapper around
 * `buildMapPdfBlob` for the user-facing "Export Map PDF" button.
 */
export async function exportMapAsPdf(meta = {}) {
  const { blob, filename } = await buildMapPdfBlob(meta);
  downloadBlob(filename, blob);
  return { filename, size: blob.size };
}
