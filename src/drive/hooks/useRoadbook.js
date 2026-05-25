// src/drive/hooks/useRoadbook.js
//
// Load a roadbook into Drive Mode from a user-selected file.
//
// Two supported inputs for M1:
//   1. A RouteMapper export ZIP — we extract Source/stage.json
//      (or, as a courtesy fallback, the legacy top-level _stage.json)
//      and pull stage.roadbook from it.
//   2. A bare JSON file — must be a stage.json shape (with .roadbook)
//      or a raw roadbook (with .rows).
//
// M5 will add DOCX patch loading on top. M2 will add a "saved stages"
// picker for logged-in users.
//
// Returns: { roadbook, stageMeta, error, isLoading, loadFile, clear }.

import { useState } from "react";
import JSZip from "jszip";

const STAGE_JSON_CANDIDATES = [
  // Current layout
  "Source/stage.json",
  // Older layout (predates the use-case-folder reorganisation) — kept as
  // a courtesy so users with old export ZIPs aren't shut out.
  /_stage\.json$/,
];

function findStageJsonEntry(zip) {
  // Try exact match first
  if (zip.files["Source/stage.json"]) return zip.files["Source/stage.json"];

  // Then any *_stage.json at the top level
  for (const name of Object.keys(zip.files)) {
    if (STAGE_JSON_CANDIDATES[1].test(name)) return zip.files[name];
  }
  return null;
}

// Match the row-selection behaviour of the HTML/DOCX exporters
// (roadbookHtmlExport.js and exportRoadbookDocx.js). Both prefer the
// pre-filtered "driver" view that hides most auto-detected turns,
// keeping the rows a navigator actually needs to call out. Falling
// back to the raw .rows array would show every bend in the road —
// confusing and not what users see in their printed roadbook.
function selectDisplayRows(roadbook) {
  return roadbook?.views?.driver || roadbook?.rows || [];
}

// Mirror of ensureStartRow() in roadbookHtmlExport.js — prepends a
// synthetic START row when the first row isn't at km 0. Drive Mode
// shows the same artefact as the printed roadbook for consistency.
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

// Build a Reader-ready roadbook object: same shape as the input but
// with rows = the navigator's view (matches the HTML/DOCX exports).
function buildReaderRoadbook(roadbook) {
  if (!roadbook) return roadbook;
  const displayRows = ensureStartRow(selectDisplayRows(roadbook));
  return { ...roadbook, rows: displayRows };
}

function normalise(parsed) {
  // Accept three shapes:
  //   (a) full stage.json: { meta, waypoints, trackPoints, roadbook, ... }
  //   (b) bare roadbook:   { rows, views?, ... }
  //   (c) wrapped:         { stage: { ... }, roadbook: { ... } }
  //
  // trackPoints is M3+: along-track distance computation needs the
  // recorded GPS track. Bare-roadbook input has no track → along-track
  // gracefully degrades to straight-line.
  if (parsed?.roadbook?.rows || parsed?.roadbook?.views) {
    return {
      roadbook: buildReaderRoadbook(parsed.roadbook),
      trackPoints: parsed.trackPoints || parsed.stage?.trackPoints || [],
      stageMeta: parsed.meta || parsed.stage?.meta || null,
    };
  }
  if (parsed?.rows || parsed?.views) {
    return {
      roadbook: buildReaderRoadbook(parsed),
      trackPoints: [],
      stageMeta: null,
    };
  }
  if (parsed?.stage?.roadbook?.rows || parsed?.stage?.roadbook?.views) {
    return {
      roadbook: buildReaderRoadbook(parsed.stage.roadbook),
      trackPoints: parsed.stage.trackPoints || [],
      stageMeta: parsed.stage.meta || null,
    };
  }
  throw new Error(
    "File loaded but no roadbook found. Expected a RouteMapper export ZIP or a stage.json.",
  );
}

export function useRoadbook() {
  const [roadbook, setRoadbook] = useState(null);
  const [trackPoints, setTrackPoints] = useState([]);
  const [stageMeta, setStageMeta] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  async function loadFile(file) {
    if (!file) return;
    setIsLoading(true);
    setError(null);
    try {
      const lower = file.name.toLowerCase();
      let parsed;

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
      } else if (lower.endsWith(".json")) {
        const text = await file.text();
        parsed = JSON.parse(text);
      } else {
        throw new Error(
          "Unsupported file type. Drop a RouteMapper export ZIP or a stage.json file.",
        );
      }

      const { roadbook: rb, trackPoints: tp, stageMeta: meta } =
        normalise(parsed);
      setRoadbook(rb);
      setTrackPoints(Array.isArray(tp) ? tp : []);
      setStageMeta(meta);
    } catch (e) {
      console.warn("useRoadbook: load failed", e);
      setError(e?.message || String(e));
      setRoadbook(null);
      setTrackPoints([]);
      setStageMeta(null);
    } finally {
      setIsLoading(false);
    }
  }

  function clear() {
    setRoadbook(null);
    setTrackPoints([]);
    setStageMeta(null);
    setError(null);
  }

  return {
    roadbook,
    trackPoints,
    stageMeta,
    error,
    isLoading,
    loadFile,
    clear,
  };
}
