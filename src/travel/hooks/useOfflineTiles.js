// src/travel/hooks/useOfflineTiles.js
//
// Phase 2b — state machine for pre-caching a stage's route-corridor tiles
// for offline use. Computes the corridor once per stage, downloads on
// demand (explicit user opt-in) with live progress, and remembers per
// (stage × source) that it was saved so the UI can show "saved ✓".

import { useEffect, useMemo, useRef, useState } from "react";
import { corridorTiles, downloadCorridor, stageKey } from "../lib/offlineTiles";
import { TILE_SOURCES } from "../../export/staticMapRenderer";

const LS_PREFIX = "rm_drive_offline_";

function flagKey(key, sourceKey) {
  return `${LS_PREFIX}${sourceKey}_${key}`;
}
function readCached(key, sourceKey) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(flagKey(key, sourceKey));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useOfflineTiles({ trackPoints, sourceKey }) {
  const key = useMemo(() => stageKey(trackPoints), [trackPoints]);
  const corridor = useMemo(() => corridorTiles(trackPoints), [trackPoints]);

  const [state, setState] = useState("idle"); // idle | downloading | done | error
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [cached, setCached] = useState(() => readCached(key, sourceKey));
  const abortRef = useRef(null);

  // Reset when the stage or the selected source changes (cache is
  // per-source — satellite saved doesn't mean street is).
  useEffect(() => {
    setState("idle");
    setProgress({ done: 0, total: 0, failed: 0 });
    setCached(readCached(key, sourceKey));
  }, [key, sourceKey]);

  // Abort an in-flight download if the component goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    if (!corridor.count) return;
    const cfg = TILE_SOURCES[sourceKey] || TILE_SOURCES.esri_imagery;
    const controller = new AbortController();
    abortRef.current = controller;
    setState("downloading");
    setProgress({ done: 0, total: corridor.count, failed: 0 });
    try {
      const res = await downloadCorridor(corridor.tiles, cfg, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (controller.signal.aborted) {
        setState("idle");
        return;
      }
      const record = {
        count: res.done - res.failed,
        failed: res.failed,
        zooms: corridor.zooms,
        ts: Date.now(),
      };
      try {
        localStorage.setItem(flagKey(key, sourceKey), JSON.stringify(record));
      } catch {
        /* storage full / disabled — the tiles are still cached */
      }
      setCached(record);
      setState(res.failed > res.total / 2 ? "error" : "done");
    } catch {
      setState("error");
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState("idle");
  };

  return { corridor, state, progress, cached, start, cancel };
}
