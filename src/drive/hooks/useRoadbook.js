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

function normalise(parsed) {
  // Accept three shapes:
  //   (a) full stage.json: { meta, waypoints, trackPoints, roadbook, ... }
  //   (b) bare roadbook:   { rows, views?, ... }
  //   (c) wrapped:         { stage: { ... }, roadbook: { ... } }
  //
  // trackPoints is M3+: along-track distance computation needs the
  // recorded GPS track. Bare-roadbook input has no track → along-track
  // gracefully degrades to straight-line.
  if (parsed?.roadbook?.rows) {
    return {
      roadbook: parsed.roadbook,
      trackPoints: parsed.trackPoints || parsed.stage?.trackPoints || [],
      stageMeta: parsed.meta || parsed.stage?.meta || null,
    };
  }
  if (parsed?.rows) {
    return { roadbook: parsed, trackPoints: [], stageMeta: null };
  }
  if (parsed?.stage?.roadbook?.rows) {
    return {
      roadbook: parsed.stage.roadbook,
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
