// src/drive/hooks/useRoadbook.js
//
// Load a roadbook into Drive Mode from a user-selected file.
//
// Supported inputs:
//   1. A RouteMapper export ZIP — extracts Source/stage.json (or the
//      legacy top-level *_stage.json). Also auto-detects an edited
//      roadbook.docx inside the ZIP and applies its per-row note
//      overrides on top of the JSON (M5 — see docxPatch.js).
//   2. A bare JSON file — stage.json or raw roadbook shape.
//
// Returns:
//   {
//     roadbook,         // normalised roadbook with rows[]
//     trackPoints,      // recorded GPS track (M3+ along-track)
//     stageMeta,        // { stageName, day, routeName, ... } | null
//     startCoords,      // {lat, lon} of the recorded start, or null —
//                       //   surfaced from parsed.startGPS / parsed.
//                       //   stage.startGPS; falls back to roadbook
//                       //   row 0 / first track point in pickStartCoords
//     docxPatchCount,   // M5 — number of notes overridden from DOCX
//     error,
//     isLoading,
//     loadFile,
//     clear,
//   }

import { useState } from "react";
import JSZip from "jszip";
import { extractDocxNotePatches, applyNotePatches } from "../lib/docxPatch";

const STAGE_JSON_LEGACY = /_stage\.json$/;
// Where the DOCX lives inside the current export layout (see
// buildRoutePackage.js — Printable/roadbook.docx). Legacy layouts
// may have it at the top level as *_roadbook.docx, so we accept both.
const DOCX_PATH_PRIMARY = "Printable/roadbook.docx";
const DOCX_PATH_LEGACY = /_roadbook\.docx$/;

function findStageJsonEntry(zip) {
  if (zip.files["Source/stage.json"]) return zip.files["Source/stage.json"];
  for (const name of Object.keys(zip.files)) {
    if (STAGE_JSON_LEGACY.test(name)) return zip.files[name];
  }
  return null;
}

function findDocxEntry(zip) {
  if (zip.files[DOCX_PATH_PRIMARY]) return zip.files[DOCX_PATH_PRIMARY];
  for (const name of Object.keys(zip.files)) {
    if (DOCX_PATH_LEGACY.test(name)) return zip.files[name];
  }
  return null;
}

// Match the row-selection behaviour of the HTML/DOCX exporters
// (roadbookHtmlExport.js and exportRoadbookDocx.js). Both prefer the
// pre-filtered "driver" view that hides most auto-detected turns,
// keeping the rows a navigator actually needs to call out.
function selectDisplayRows(roadbook) {
  return roadbook?.views?.driver || roadbook?.rows || [];
}

// Mirror of ensureStartRow() in roadbookHtmlExport.js — prepends a
// synthetic START row when the first row isn't at km 0.
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

/**
 * Pull the recording-side start GPS out of the parsed stage data.
 * Stage JSONs put it on `startGPS` (or `stage.startGPS` when wrapped).
 * Returns `{lat, lon}` if both coords are finite, otherwise null —
 * the PreStart screen falls back to `roadbook.rows[0]` or
 * `trackPoints[0]` via pickStartCoords() when this is null.
 */
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
 * display.  Order of preference:
 *   1. Explicit `startGPS` from the saved stage (most authoritative —
 *      the moment the user tapped Start Stage).
 *   2. First roadbook row that has finite lat/lon (legacy / synthetic
 *      stages without a separately-stored startGPS).
 *   3. First valid track point (very-legacy stages where roadbook
 *      row 0 has null coords).
 * Returns `{lat, lon}` or null if none of those have usable coords.
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

export function useRoadbook() {
  const [roadbook, setRoadbook] = useState(null);
  const [trackPoints, setTrackPoints] = useState([]);
  const [stageMeta, setStageMeta] = useState(null);
  const [startCoords, setStartCoords] = useState(null);
  const [docxPatchCount, setDocxPatchCount] = useState(0);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  async function loadFile(file) {
    if (!file) return;
    setIsLoading(true);
    setError(null);
    try {
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
        const text = await entry.async("string");
        parsed = JSON.parse(text);

        // M5: look for an edited roadbook.docx inside the same ZIP.
        // If present, we'll apply per-row note overrides after the
        // base roadbook is normalised. Best-effort — any parse
        // failure logs a warning and proceeds without overrides.
        const docxEntry = findDocxEntry(zip);
        if (docxEntry) {
          try {
            docxBlob = await docxEntry.async("blob");
          } catch (e) {
            console.warn("useRoadbook: failed to read DOCX from ZIP", e);
          }
        }
      } else if (lower.endsWith(".json")) {
        const text = await file.text();
        parsed = JSON.parse(text);
      } else {
        throw new Error(
          "Unsupported file type. Drop a RouteMapper export ZIP or a stage.json file.",
        );
      }

      const {
        roadbook: rb,
        trackPoints: tp,
        stageMeta: meta,
        startCoords: sc,
      } = normalise(parsed);

      // Apply DOCX overlay if we found one
      let finalRoadbook = rb;
      let patchCount = 0;
      if (docxBlob && rb?.rows?.length) {
        try {
          const patches = await extractDocxNotePatches(docxBlob, rb.rows);
          if (patches.size > 0) {
            finalRoadbook = {
              ...rb,
              rows: applyNotePatches(rb.rows, patches),
            };
            patchCount = patches.size;
          }
        } catch (e) {
          console.warn("useRoadbook: DOCX patch extraction failed", e);
        }
      }

      setRoadbook(finalRoadbook);
      setTrackPoints(Array.isArray(tp) ? tp : []);
      setStageMeta(meta);
      setStartCoords(sc);
      setDocxPatchCount(patchCount);
    } catch (e) {
      console.warn("useRoadbook: load failed", e);
      setError(e?.message || String(e));
      setRoadbook(null);
      setTrackPoints([]);
      setStageMeta(null);
      setStartCoords(null);
      setDocxPatchCount(0);
    } finally {
      setIsLoading(false);
    }
  }

  function clear() {
    setRoadbook(null);
    setTrackPoints([]);
    setStageMeta(null);
    setStartCoords(null);
    setDocxPatchCount(0);
    setError(null);
  }

  return {
    roadbook,
    trackPoints,
    stageMeta,
    startCoords,
    docxPatchCount,
    error,
    isLoading,
    loadFile,
    clear,
  };
}
