// src/export/exportMapPdf.js
//
// Phase A: capture the current Leaflet map view and wrap it in a titled,
// single-page PDF for rally organisers / entrants to print.
//
// Usage (from a component that has a ref to the Leaflet map instance):
//
//   import { exportMapAsPdf } from "../export/exportMapPdf";
//   await exportMapAsPdf(leafletMap, {
//     title: "Stirling Recce — Stage 1",
//     date: new Date(),
//     totalDistanceKm: 5.32,
//     waypointCount: 7,
//     tileAttribution: "© OpenStreetMap contributors",
//     fitBoundsTo: [[lat,lon], ...],   // optional; auto-fits before capture
//   });

import jsPDF from "jspdf";
import SimpleMapScreenshoter from "leaflet-simple-map-screenshoter";

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

/**
 * Build a printable map PDF from a Leaflet map instance.
 *
 * Returns `{ blob, filename }` — the caller decides whether to download it,
 * embed it in a ZIP, upload it, etc. Rejects if the screenshot / PDF build
 * fails.
 *
 * Shared by the user-facing "Export Map PDF" button (which downloads the
 * blob) and by the ZIP export path (which embeds the blob into the package).
 */
export async function buildMapPdfBlob(map, meta = {}) {
  if (!map) throw new Error("buildMapPdfBlob: map instance is required");

  const {
    title = "RouteMapper Map",
    date = new Date(),
    totalDistanceKm = 0,
    waypointCount = 0,
    tileAttribution = "© OpenStreetMap contributors",
    filename,
    fitBoundsTo = null,
  } = meta;

  // --- Temporarily resize the map container to A4-landscape proportions ----
  // The screenshot inherits the current DOM size of the map container, which
  // on a phone/portrait layout can be a very wide-and-short strip — producing
  // an unusable PDF. Force a sensible target size while we capture.
  const container = map.getContainer();
  const savedStyle = {
    width: container.style.width,
    height: container.style.height,
    position: container.style.position,
    top: container.style.top,
    left: container.style.left,
    zIndex: container.style.zIndex,
    background: container.style.background,
  };

  // Target: A4 landscape usable area (273×172 mm) rendered at ~150 DPI
  const TARGET_W = 1600;
  const TARGET_H = 1000;

  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "0";
  container.style.width = `${TARGET_W}px`;
  container.style.height = `${TARGET_H}px`;
  container.style.zIndex = "10000";
  container.style.background = "#fff";

  // Tell Leaflet the container size changed
  map.invalidateSize({ animate: false, pan: false });

  // If the caller supplies route points, fit the map to them at the new size.
  // Otherwise keep the current centre/zoom — the resize alone will give a
  // properly-shaped screenshot.
  if (Array.isArray(fitBoundsTo) && fitBoundsTo.length >= 2) {
    try {
      map.fitBounds(fitBoundsTo, { padding: [40, 40], animate: false });
    } catch (e) {
      console.warn("exportMapAsPdf: fitBounds failed, capturing current view", e);
    }
  }

  // Let the tiles settle before capture
  await new Promise((r) => setTimeout(r, 900));

  const screenshoter = new SimpleMapScreenshoter({ hidden: true }).addTo(map);

  let pngDataUrl;
  try {
    pngDataUrl = await screenshoter.takeScreen("image");
  } finally {
    // Always restore the container + detach the screenshoter, even on failure
    try {
      screenshoter.remove();
    } catch {
      /* no-op */
    }
    Object.assign(container.style, savedStyle);
    try {
      map.invalidateSize({ animate: false, pan: false });
    } catch {
      /* no-op */
    }
  }

  // Build the PDF: A4 landscape gives the best map aspect ratio for rally use.
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth(); // 297 mm
  const pageH = pdf.internal.pageSize.getHeight(); // 210 mm

  // ---- Header --------------------------------------------------------------
  pdf.setFontSize(14).setFont(undefined, "bold");
  pdf.text(String(title), 12, 13);

  pdf.setFontSize(10).setFont(undefined, "normal");
  pdf.text(formatDate(date), pageW - 12, 13, { align: "right" });

  // ---- Map image -----------------------------------------------------------
  // Measure the source screenshot so we can preserve its aspect ratio when
  // placing it on the page. Otherwise addImage stretches it to fill the box.
  const imgTop = 18;
  const imgBottom = pageH - 16;
  const boxH = imgBottom - imgTop; // available height in mm
  const boxW = pageW - 24; // available width in mm
  const boxX = 12;

  const srcImg = new Image();
  await new Promise((resolve, reject) => {
    srcImg.onload = resolve;
    srcImg.onerror = () =>
      reject(new Error("Could not measure the captured map image."));
    srcImg.src = pngDataUrl;
  });

  const srcRatio = srcImg.naturalWidth / srcImg.naturalHeight;
  const boxRatio = boxW / boxH;

  let drawW;
  let drawH;
  if (srcRatio >= boxRatio) {
    // Source is wider than (or same as) the box — fit to width
    drawW = boxW;
    drawH = boxW / srcRatio;
  } else {
    // Source is taller than the box — fit to height
    drawH = boxH;
    drawW = boxH * srcRatio;
  }

  // Centre within the available box so short/tall images don't hug one edge
  const drawX = boxX + (boxW - drawW) / 2;
  const drawY = imgTop + (boxH - drawH) / 2;

  try {
    pdf.addImage(pngDataUrl, "PNG", drawX, drawY, drawW, drawH, undefined, "FAST");
  } catch (e) {
    console.error("exportMapAsPdf: addImage failed", e);
    throw new Error(
      "Could not embed the map image. This can happen if the map " +
        "tiles blocked cross-origin access. Try switching to OpenStreetMap " +
        "and exporting again.",
    );
  }

  // ---- Footer --------------------------------------------------------------
  pdf.setFontSize(9).setFont(undefined, "normal");
  const footerY = pageH - 8;

  const distText = `Distance: ${Number(totalDistanceKm).toFixed(2)} km`;
  const wpText = `Waypoints: ${Number(waypointCount) || 0}`;
  pdf.text(distText, 12, footerY);
  pdf.text(wpText, 70, footerY);

  pdf.text("Generated by RouteMapper", pageW / 2, footerY, { align: "center" });

  // Strip any HTML entities from the attribution string before printing
  const safeAttr = String(tileAttribution).replace(/<[^>]*>/g, "").replace(/&copy;/gi, "©");
  pdf.text(safeAttr, pageW - 12, footerY, { align: "right" });

  // ---- Output --------------------------------------------------------------
  const blob = pdf.output("blob");
  const finalName = `${slugify(filename || title)}.pdf`;

  return { blob, filename: finalName };
}

/**
 * Capture the given Leaflet map instance and download it as a PDF.
 *
 * Thin wrapper around `buildMapPdfBlob` for the user-facing button. Returns
 * `{ filename, size }` once the download has been triggered.
 */
export async function exportMapAsPdf(map, meta = {}) {
  const { blob, filename } = await buildMapPdfBlob(map, meta);
  downloadBlob(filename, blob);
  return { filename, size: blob.size };
}
