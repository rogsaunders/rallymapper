// src/drive/DriveMode.jsx
//
// Top-level component for the /drive route.
//
// M1 — Source picker, scrolling roadbook display, header + footer.
// M2 — Live GPS subscription, current-row highlight + auto-scroll,
//      distance-to-current display, manual Prev/Next stepping.
// M3 — Along-track distance (matches roadbook kmPartial),
//      proximity-zone auto-advance, pause toggle, manual override
//      timer, settings panel (auto-advance / trigger radius /
//      override duration).
// M4+ — Voice readout, DOCX overlay.

import React, { useEffect, useMemo, useState } from "react";
import { useRoadbook } from "./hooks/useRoadbook";
import { useGpsStream } from "./hooks/useGpsStream";
import { useDriveAdvance } from "./hooks/useDriveAdvance";
import { annotateRowsWithTrackIdx } from "./lib/alongTrack";
import SourcePicker from "./components/SourcePicker";
import HeaderBar from "./components/HeaderBar";
import FooterBar from "./components/FooterBar";
import RoadbookView from "./components/RoadbookView";
import SettingsPanel from "./components/SettingsPanel";

// localStorage keys — settings persist across sessions
const LS_AUTO_ADVANCE = "rm_drive_auto_advance";
const LS_TRIGGER_RADIUS = "rm_drive_trigger_radius_m";
const LS_OVERRIDE_MS = "rm_drive_override_ms";

function readBool(key, fallback) {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "true";
}
function readNum(key, fallback) {
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export default function DriveMode() {
  const { roadbook, trackPoints, stageMeta, error, isLoading, loadFile, clear } =
    useRoadbook();

  const { gps, error: gpsError } = useGpsStream();

  // Settings (persisted)
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(() =>
    readBool(LS_AUTO_ADVANCE, true),
  );
  const [triggerRadiusM, setTriggerRadiusM] = useState(() =>
    readNum(LS_TRIGGER_RADIUS, 30),
  );
  const [manualOverrideMs, setManualOverrideMs] = useState(() =>
    readNum(LS_OVERRIDE_MS, 30000),
  );

  // Persist on change
  useEffect(() => {
    localStorage.setItem(LS_AUTO_ADVANCE, String(autoAdvanceEnabled));
  }, [autoAdvanceEnabled]);
  useEffect(() => {
    localStorage.setItem(LS_TRIGGER_RADIUS, String(triggerRadiusM));
  }, [triggerRadiusM]);
  useEffect(() => {
    localStorage.setItem(LS_OVERRIDE_MS, String(manualOverrideMs));
  }, [manualOverrideMs]);

  // Annotate rows with their nearest-track-index ONCE per roadbook
  // load. Without this, computeAlongTrackDistance can't find the
  // target row on the track.
  const annotatedRows = useMemo(() => {
    if (!roadbook?.rows) return [];
    if (!trackPoints || trackPoints.length === 0) return roadbook.rows;
    return annotateRowsWithTrackIdx(roadbook.rows, trackPoints);
  }, [roadbook, trackPoints]);

  const {
    currentIndex,
    isPaused,
    isOverriding,
    nextDistance,
    goPrev,
    goNext,
    jumpTo,
    togglePause,
  } = useDriveAdvance({
    rows: annotatedRows,
    trackPoints,
    gps,
    autoAdvanceEnabled,
    triggerRadiusM,
    manualOverrideMs,
  });

  // Snap-scroll trigger — increment to force RoadbookView's
  // scrollIntoView effect to re-fire even if currentIndex hasn't
  // changed (after manual scroll-away).
  const [scrollNonce, setScrollNonce] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!roadbook) {
    return (
      <SourcePicker onPick={loadFile} error={error} isLoading={isLoading} />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <HeaderBar
        stageMeta={stageMeta}
        rowCount={annotatedRows.length}
        onExit={clear}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <RoadbookView
        rows={annotatedRows}
        currentIndex={currentIndex}
        onRowTap={jumpTo}
        scrollNonce={scrollNonce}
      />
      <FooterBar
        gps={gps}
        gpsError={gpsError}
        nextDistance={nextDistance}
        isPaused={isPaused}
        isOverriding={isOverriding}
        onPrev={goPrev}
        onNext={goNext}
        onSnap={() => setScrollNonce((n) => n + 1)}
        onTogglePause={togglePause}
        canPrev={currentIndex != null && currentIndex > 0}
        canNext={currentIndex != null && currentIndex < annotatedRows.length - 1}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        autoAdvanceEnabled={autoAdvanceEnabled}
        setAutoAdvanceEnabled={setAutoAdvanceEnabled}
        triggerRadiusM={triggerRadiusM}
        setTriggerRadiusM={setTriggerRadiusM}
        manualOverrideMs={manualOverrideMs}
        setManualOverrideMs={setManualOverrideMs}
      />
    </div>
  );
}
