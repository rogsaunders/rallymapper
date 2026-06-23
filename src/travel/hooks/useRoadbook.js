// src/travel/hooks/useRoadbook.js
//
// React wrapper around parseRouteFile() (src/travel/lib/roadbookParse.js):
// holds the loaded roadbook in state, persists/restores the last stage via
// IndexedDB (resume-on-reopen), and exposes loadFile/clear to the UI.
//
// The parsing itself lives in roadbookParse.js so it can also run outside
// React (the Route Library submission flow uses it to derive metadata).

import { useEffect, useState } from "react";
import { parseRouteFile, pickStartCoords } from "../lib/roadbookParse";
import { saveStage, loadStage, clearStage } from "../lib/stageCache";

// Re-exported for existing importers (e.g. TravelMode).
export { pickStartCoords };

export function useRoadbook() {
  const [roadbook, setRoadbook] = useState(null);
  const [trackPoints, setTrackPoints] = useState([]);
  const [stageMeta, setStageMeta] = useState(null);
  const [startCoords, setStartCoords] = useState(null);
  const [docxPatchCount, setDocxPatchCount] = useState(0);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  // True until the one-shot IndexedDB restore attempt resolves, so the UI
  // doesn't flash the source picker before swapping in a restored stage.
  const [restoring, setRestoring] = useState(true);

  // On mount, restore the last-loaded stage from IndexedDB (best-effort).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadStage();
      if (!cancelled && cached?.roadbook?.rows?.length) {
        setRoadbook(cached.roadbook);
        setTrackPoints(Array.isArray(cached.trackPoints) ? cached.trackPoints : []);
        setStageMeta(cached.stageMeta ?? null);
        setStartCoords(cached.startCoords ?? null);
        setDocxPatchCount(cached.docxPatchCount ?? 0);
      }
      if (!cancelled) setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadFile(file) {
    if (!file) return;
    setIsLoading(true);
    setError(null);
    try {
      const {
        roadbook: rb,
        trackPoints: tp,
        stageMeta: meta,
        startCoords: sc,
        docxPatchCount: patchCount,
      } = await parseRouteFile(file);

      setRoadbook(rb);
      setTrackPoints(tp);
      setStageMeta(meta);
      setStartCoords(sc);
      setDocxPatchCount(patchCount);

      // Persist for resume-on-reopen. Fire-and-forget — a cache write
      // failure must never surface to the user.
      saveStage({
        roadbook: rb,
        trackPoints: tp,
        stageMeta: meta,
        startCoords: sc,
        docxPatchCount: patchCount,
      });
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
    // Drop the persisted stage so Exit returns to the source picker on the
    // next reopen rather than silently resuming.
    clearStage();
  }

  return {
    roadbook,
    trackPoints,
    stageMeta,
    startCoords,
    docxPatchCount,
    error,
    isLoading,
    restoring,
    loadFile,
    clear,
  };
}
