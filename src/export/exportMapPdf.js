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
//     routePositions: [[lat,lon], ...] // optional; composited onto the capture
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
 * Composite the route polyline onto a captured map PNG.
 *
 * dom-to-image (used by SimpleMapScreenshoter) silently drops Leaflet's SVG
 * overlay pane, so the route polyline never appears in the raw capture.
 * This function draws the route directly onto a canvas using Leaflet's own
 * projection — map.latLngToContainerPoint() returns pixel coordinates that
 * match the captured image exactly when called while the container is still
 * at capture dimensions (1600 × 1000).
 *
 * Must be called BEFORE the container is restored to its original size.
 */
async function drawRouteOverlay(pngDataUrl, map, routePositions) {
  if (!Array.isArray(routePositions) || routePositions.length < 2) {
    return pngDataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");

      // Layer 1: the captured map (tiles + markers)
      ctx.drawImage(img, 0, 0);

      // Layer 2: the route polyline projected via Leaflet.
      //
      // Scale factor: dom-to-image captures at CSS-pixel resolution (scale=1),
      // but on high-DPR devices the canvas could be larger than the CSS pixel
      // grid.  Dividing canvas dimensions by the container's CSS dimensions
      // gives the scale that maps latLngToContainerPoint() output (CSS pixels)
      // onto physical canvas pixels, future-proofing against any DPR change.
      const containerEl = map.getContainer();
      const cssW = containerEl.offsetWidth  || img.naturalWidth;
      const cssH = containerEl.offsetHeight || img.naturalHeight;
      const scaleX = canvas.width  / cssW;
      const scaleY = canvas.height / cssH;

      ctx.save();
      ctx.scale(scaleX, scaleY);
      ctx.lineJoin = "round";
      ctx.lineCap  = "round";

      // Build the path once — we'll stroke it twice for a "casing" effect.
      // The outer white stroke acts as a halo that frames the route and keeps
      // waypoint badge labels readable where the line passes through them.
      ctx.beginPath();
      let started = false;
      for (const point of routePositions) {
        const lat = Array.isArray(point) ? point[0] : point.lat;
        const lon = Array.isArray(point) ? point[1] : point.lon ?? point.lng;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        const px = map.latLngToContainerPoint([lat, lon]);
        if (!started) {
          ctx.moveTo(px.x, px.y);
          started = true;
        } else {
          ctx.lineTo(px.x, px.y);
        }
      }

      if (!started) {
        ctx.restore();
        resolve(canvas.toDataURL("image/png"));
        return;
      }

      // Outer casing — white, slightly wider, drawn first (behind)
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth   = 8;
      ctx.globalAlpha = 1.0;
      ctx.stroke();

      // Inner route line — red-500, drawn on top
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth   = 4;
      ctx.globalAlpha = 0.9;
      ctx.stroke();

      ctx.restore();

      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = () => resolve(pngDataUrl); // fail gracefully — keep tiles
    img.src = pngDataUrl;
  });
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
    // routePositions: the [lat,lon] pairs to draw as the red route line.
    // Falls back to fitBoundsTo when not supplied explicitly (stage-end export).
    routePositions = null,
  } = meta;

  // --- Temporarily resize the map container to A4-landscape proportions ----
  // The screenshot inherits the current DOM size of the map container, which
  // on a phone/portrait layout can be a very wide-and-short strip — producing
  // an unusable PDF. Force a sensible target size while we capture.
  const container = map.getContainer();
  const savedStyle = {
    width:    container.style.width,
    height:   container.style.height,
    position: container.style.position,
    top:      container.style.top,
    left:     container.style.left,
    zIndex:   container.style.zIndex,
    background: container.style.background,
  };

  // Target: A4 landscape usable area (273×172 mm) rendered at ~150 DPI
  const TARGET_W = 1600;
  const TARGET_H = 1000;

  container.style.position = "fixed";
  container.style.top      = "0";
  container.style.left     = "0";
  container.style.width    = `${TARGET_W}px`;
  container.style.height   = `${TARGET_H}px`;
  container.style.zIndex   = "10000";
  container.style.background = "#fff";

  // Capture the user's current view before the resize distorts it.
  const savedCenter = map.getCenter();
  const savedZoom   = map.getZoom();

  // Tell Leaflet the container size changed
  map.invalidateSize({ animate: false, pan: false });

  if (Array.isArray(fitBoundsTo) && fitBoundsTo.length >= 2) {
    // Caller supplied route points → fit the full route into the larger canvas.
    // Used by the automatic stage-end export so the PDF always shows everything.
    try {
      map.fitBounds(fitBoundsTo, { padding: [40, 40], animate: false });
    } catch (e) {
      console.warn("exportMapAsPdf: fitBounds failed, restoring saved view", e);
      map.setView(savedCenter, savedZoom, { animate: false });
    }
  } else {
    // No bounds supplied → honour the view the user had before export.
    // Used by the mid-stage "Export Map PDF" button so manual zoom is preserved.
    map.setView(savedCenter, savedZoom, { animate: false });
  }

  // Let the tiles settle before capture.
  // 2 s gives mobile connections enough time to load the new viewport's
  // tiles after any re-zoom, reducing blank tile grid-lines in the PDF.
  await new Promise((r) => setTimeout(r, 2000));

  // Hide the Leaflet SVG overlay pane before capture.
  //
  // dom-to-image applies Leaflet's large translate3d() world-coordinate
  // offsets from the overlay pane's SVG incorrectly, so the route polyline
  // appears at a wrong, view-dependent position (the "phantom line" bug).
  //
  // Using `display: none` (not just opacity:0) is essential: dom-to-image
  // can still rasterise SVG elements that have opacity:0 inherited from a
  // parent div in some browser/engine combinations, producing the phantom.
  // `display: none` removes the element from the render tree entirely.
  //
  // drawRouteOverlay() re-draws the route correctly via canvas composite
  // while the container is still at 1600×1000 (before finally restores it).
  const overlayPane = map.getPane("overlayPane");
  const savedOverlayDisplay = overlayPane ? overlayPane.style.display : null;
  if (overlayPane) overlayPane.style.display = "none";

  // Zoom controls are handled by SimpleMapScreenshoter's own hide list.
  const screenshoter = new SimpleMapScreenshoter({
    hidden: true,
    hideElementsWithSelectors: [".leaflet-control-container"],
  }).addTo(map);

  let pngDataUrl;
  try {
    try {
      pngDataUrl = await screenshoter.takeScreen("image");
    } catch (captureErr) {
      // dom-to-image returns "data:," when the canvas is tainted by cross-origin
      // tile requests.  This is common on iOS/Safari: tiles already in the browser
      // cache may have been stored without the CORS response headers, so when
      // dom-to-image fetches them via XHR the browser rejects the cached entry as
      // a CORS violation and canvas.toDataURL() returns the empty "data:," URL,
      // which SimpleMapScreenshoter correctly detects and rejects as
      // "Base64 image generation error".
      //
      // Fix: retry with cacheBust=true so dom-to-image appends a timestamp to
      // every tile URL, bypassing the cache and forcing fresh CORS-valid responses.
      if (captureErr?.message?.includes("Base64 image generation error")) {
        console.warn(
          "exportMapAsPdf: first capture tainted by CORS — retrying with cache-bust",
        );
        pngDataUrl = await screenshoter.takeScreen("image", {
          domtoimageOptions: { cacheBust: true },
        });
      } else {
        throw captureErr;
      }
    }

    // Composite the route polyline while the container is STILL at 1600×1000.
    // map.latLngToContainerPoint() gives pixel coordinates matching the capture
    // exactly at this moment. Must happen before the finally block restores the
    // container — after that, coordinates would be for the wrong dimensions.
    // routePositions must contain track points only — NOT waypoints.
    // fitBoundsTo contains everything and must NOT be used as a fallback here,
    // or the overlay will draw spurious straight lines to each waypoint.
    pngDataUrl = await drawRouteOverlay(pngDataUrl, map, routePositions);

  } finally {
    // Always restore the overlay pane, container and screenshoter — even on failure.
    if (overlayPane && savedOverlayDisplay !== null) {
      overlayPane.style.display = savedOverlayDisplay;
    }
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
  const pageW = pdf.internal.pageSize.getWidth();  // 297 mm
  const pageH = pdf.internal.pageSize.getHeight(); // 210 mm

  // ---- Header --------------------------------------------------------------
  pdf.setFontSize(14).setFont(undefined, "bold");
  pdf.text(String(title), 12, 13);

  pdf.setFontSize(10).setFont(undefined, "normal");
  pdf.text(formatDate(date), pageW - 12, 13, { align: "right" });

  // ---- Map image -----------------------------------------------------------
  // Measure the source screenshot so we can preserve its aspect ratio when
  // placing it on the page. Otherwise addImage stretches it to fill the box.
  const imgTop    = 18;
  const imgBottom = pageH - 16;
  const boxH = imgBottom - imgTop; // available height in mm
  const boxW = pageW - 24;         // available width in mm
  const boxX = 12;

  const srcImg = new Image();
  await new Promise((resolve, reject) => {
    srcImg.onload  = resolve;
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
  const wpText   = `Waypoints: ${Number(waypointCount) || 0}`;
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
