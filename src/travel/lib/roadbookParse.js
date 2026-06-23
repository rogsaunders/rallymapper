// src/travel/lib/roadbookParse.js
//
// Plain (non-React) parsing of a RouteMapper export ZIP / stage.json into a
// normalised roadbook. Extracted from useRoadbook so it can run outside a
// component — notably the Route Library submission flow, which parses an
// upload to derive listing metadata before it ever hits Travel Mode.
//
// useRoadbook.js is now a thin React wrapper over parseRouteFile().
//
// Supported inputs:
//   1. A RouteMapper export ZIP — extracts Source/stage.json (or the legacy
//      top-level *_stage.json), and applies an edited Printable/roadbook.docx
//      overlay if present (M5 note patches).
//   2. A bare JSON file — stage.json or raw roadbook shape.

import JSZip from "jszip";
import { extractDocxNotePatches, applyNotePatches } from "./docxPatch";

const STAGE_JSON_LEGACY = /_stage\.json$/;
const DOCX_PATH_PRIMARY = "Printable/roadbook.docx";
const DOCX_PATH_LEGACY = /_roadbook\.docx$/;

// Files to always ignore in a user-supplied ZIP (macOS re-zip noise).
function isArchiveNoise(name) {
  if (!name) return true;
  if (name.startsWith("__MACOSX/") || name.includes("/__MACOSX/")) return true;
  const base = name.slice(name.lastIndexOf("/") + 1);
  if (base.startsWith("._")) return true;
  if (base === ".DS_Store" || base === "Thumbs.db") return true;
  return false;
}

function baseName(name) {
  return name.slice(name.lastIndexOf("/") + 1);
}

function findStageJsonEntry(zip) {
  const direct = zip.files["Source/stage.json"];
  if (direct && !direct.dir && !isArchiveNoise("Source/stage.json")) {
    return direct;
  }
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir || isArchiveNoise(name)) continue;
    if (baseName(name) === "stage.json") return entry;
  }
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir || isArchiveNoise(name)) continue;
    if (STAGE_JSON_LEGACY.test(name)) return entry;
  }
  return null;
}

function findDocxEntry(zip) {
  const direct = zip.files[DOCX_PATH_PRIMARY];
  if (direct && !direct.dir && !isArchiveNoise(DOCX_PATH_PRIMARY)) {
    return direct;
  }
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir || isArchiveNoise(name)) continue;
    if (baseName(name) === "roadbook.docx") return entry;
  }
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir || isArchiveNoise(name)) continue;
    if (DOCX_PATH_LEGACY.test(name)) return entry;
  }
  return null;
}

function selectDisplayRows(roadbook) {
  return roadbook?.views?.driver || roadbook?.rows || [];
}

function ensureStartRow(rows) {
  if (!rows.length) return rows;
  if (Math.abs(rows[0].kmTotal || 0) < 0.01) return rows;
  return [
    {
      index: 0,
      kmTotal: 0,
      kmPartial: 0,
      icon: "start",
      eventType: "straight",
      angle: null,
      notes: "Start",
      lat: null,
      lon: null,
      confidence: 1,
      source: "synthetic",
    },
    ...rows,
  ];
}

function buildReaderRoadbook(roadbook) {
  if (!roadbook) return roadbook;
  const displayRows = ensureStartRow(selectDisplayRows(roadbook));
  return { ...roadbook, rows: displayRows };
}

function extractStartCoords(parsed) {
  const candidates = [parsed?.startGPS, parsed?.stage?.startGPS];
  for (const c of candidates) {
    if (!c) continue;
    const lat = Number(c.lat);
    const lon = Number(c.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }
  return null;
}

function normalise(parsed) {
  const startCoords = extractStartCoords(parsed);
  if (parsed?.roadbook?.rows || parsed?.roadbook?.views) {
    return {
      roadbook: buildReaderRoadbook(parsed.roadbook),
      trackPoints: parsed.trackPoints || parsed.stage?.trackPoints || [],
      stageMeta: parsed.meta || parsed.stage?.meta || null,
      startCoords,
    };
  }
  if (parsed?.rows || parsed?.views) {
    return {
      roadbook: buildReaderRoadbook(parsed),
      trackPoints: [],
      stageMeta: null,
      startCoords,
    };
  }
  if (parsed?.stage?.roadbook?.rows || parsed?.stage?.roadbook?.views) {
    return {
      roadbook: buildReaderRoadbook(parsed.stage.roadbook),
      trackPoints: parsed.stage.trackPoints || [],
      stageMeta: parsed.stage.meta || null,
      startCoords,
    };
  }
  throw new Error(
    "File loaded but no roadbook found. Expected a RouteMapper export ZIP or a stage.json.",
  );
}

/**
 * Choose the best-available start coordinate for proximity / pre-start
 * display. Preference: explicit startGPS → first roadbook row with coords →
 * first valid track point. Returns {lat, lon} or null.
 */
export function pickStartCoords(startCoords, roadbookRows, trackPoints) {
  if (startCoords) return startCoords;
  const firstRow = (roadbookRows || []).find(
    (r) => Number.isFinite(Number(r?.lat)) && Number.isFinite(Number(r?.lon)),
  );
  if (firstRow) return { lat: Number(firstRow.lat), lon: Number(firstRow.lon) };
  const firstTrack = (trackPoints || []).find(
    (p) => Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lon)),
  );
  if (firstTrack) {
    return { lat: Number(firstTrack.lat), lon: Number(firstTrack.lon) };
  }
  return null;
}

/**
 * Parse a File (ZIP or JSON) into a normalised roadbook bundle:
 *   { roadbook, trackPoints, stageMeta, startCoords, docxPatchCount }
 * Throws on unsupported types or when no roadbook is found.
 */
export async function parseRouteFile(file) {
  if (!file) throw new Error("No file provided.");
  const lower = file.name.toLowerCase();
  let parsed;
  let docxBlob = null;

  if (lower.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(file);
    const entry = findStageJsonEntry(zip);
    if (!entry) {
      throw new Error(
        "ZIP doesn't contain a stage.json. Re-export the stage from RouteMapper and try again.",
      );
    }
    parsed = JSON.parse(await entry.async("string"));

    const docxEntry = findDocxEntry(zip);
    if (docxEntry) {
      try {
        docxBlob = await docxEntry.async("blob");
      } catch (e) {
        console.warn("parseRouteFile: failed to read DOCX from ZIP", e);
      }
    }
  } else if (lower.endsWith(".json")) {
    parsed = JSON.parse(await file.text());
  } else {
    throw new Error(
      "Unsupported file type. Drop a RouteMapper export ZIP or a stage.json file.",
    );
  }

  const { roadbook: rb, trackPoints, stageMeta, startCoords } = normalise(parsed);

  // Apply the DOCX note overlay, if present (best-effort).
  let roadbook = rb;
  let docxPatchCount = 0;
  if (docxBlob && rb?.rows?.length) {
    try {
      const patches = await extractDocxNotePatches(docxBlob, rb.rows);
      if (patches.size > 0) {
        roadbook = { ...rb, rows: applyNotePatches(rb.rows, patches) };
        docxPatchCount = patches.size;
      }
    } catch (e) {
      console.warn("parseRouteFile: DOCX patch extraction failed", e);
    }
  }

  return {
    roadbook,
    trackPoints: Array.isArray(trackPoints) ? trackPoints : [],
    stageMeta: stageMeta ?? null,
    startCoords: startCoords ?? null,
    docxPatchCount,
  };
}
