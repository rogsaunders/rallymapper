// src/travel/TravelMode.jsx
//
// Top-level component for the /travel route. Originally called
// "Travel Mode" (vehicle-centric); renamed to Travel Mode in
// 2026-06-10 to cover cyclists, motorbike riders and trekkers
// as well as drivers. The /drive route is preserved as a redirect
// to /travel so any bookmarks or prior shares keep working.
// localStorage keys still use the rm_drive_* prefix so existing
// users don't lose their saved settings.
//
// M1 — Source picker, scrolling roadbook display, header + footer.
// M2 — Live GPS subscription, current-row highlight + auto-scroll,
//      distance-to-current display, manual Prev/Next stepping.
// M3 — Along-track distance (matches roadbook kmPartial),
//      proximity-zone auto-advance, pause toggle, manual override
//      timer, settings panel (auto-advance / trigger radius /
//      override duration).
// M4 — Voice readout via Web Speech API speechSynthesis. Auto-
//      announce on every currentIndex change. 🔊/🔇 quick toggle
//      in the header. Voice on/off + test button in settings.
// M5+ — DOCX overlay, iPhone polish.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRoadbook, pickStartCoords } from "./hooks/useRoadbook";
import { useGpsStream } from "./hooks/useGpsStream";
import { useTravelAdvance } from "./hooks/useTravelAdvance";
import { useVoiceReadout } from "./hooks/useVoiceReadout";
import { annotateRowsWithTrackIdx } from "./lib/alongTrack";
import SourcePicker from "./components/SourcePicker";
import HeaderBar from "./components/HeaderBar";
import FooterBar from "./components/FooterBar";
import RoadbookView from "../components/roadbook/RoadbookView";
import SettingsPanel from "./components/SettingsPanel";
import PreStart from "./components/PreStart";

// localStorage keys — settings persist across sessions
const LS_AUTO_ADVANCE = "rm_drive_auto_advance";
const LS_TRIGGER_RADIUS = "rm_drive_trigger_radius_m";
const LS_OVERRIDE_MS = "rm_drive_override_ms";
const LS_VOICE_ENABLED = "rm_drive_voice_enabled";

function readBool(key, fallback) {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "true";
}
function readNum(key, fallback) {
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export default function TravelMode({ initialFile = null } = {}) {
  const {
    roadbook,
    trackPoints,
    stageMeta,
    startCoords: stageStartCoords,
    docxPatchCount,
    error,
    isLoading,
    restoring,
    loadFile,
    clear,
  } = useRoadbook();

  const { gps, error: gpsError } = useGpsStream();

  // File hand-off (standalone PWA): when launched via the OS file handler
  // — e.g. the user opens a downloaded RouteMapper export ZIP — the entry
  // passes the launched File here. Load it once; guarded by a ref so a
  // re-render with the same File reference doesn't reload it. Takes
  // precedence over any IndexedDB-restored stage, since an explicit open
  // is a clear "use this one" signal.
  const loadedInitialRef = useRef(null);
  useEffect(() => {
    if (initialFile && loadedInitialRef.current !== initialFile) {
      loadedInitialRef.current = initialFile;
      loadFile(initialFile);
    }
    // loadFile is stable enough for our purpose; intentionally keyed on the
    // File reference only to avoid reload loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

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
  const [voiceEnabled, setVoiceEnabled] = useState(() =>
    readBool(LS_VOICE_ENABLED, true),
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
  useEffect(() => {
    localStorage.setItem(LS_VOICE_ENABLED, String(voiceEnabled));
  }, [voiceEnabled]);

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
  } = useTravelAdvance({
    rows: annotatedRows,
    trackPoints,
    gps,
    autoAdvanceEnabled,
    triggerRadiusM,
    manualOverrideMs,
  });

  const {
    supported: voiceSupported,
    speak: voiceSpeak,
    stop: voiceStop,
  } = useVoiceReadout({
    enabled: voiceEnabled,
    currentIndex,
    rows: annotatedRows,
  });

  // Toggle wrapper that also primes iOS Safari's speech synth on
  // enable (Safari requires the first speak() to be triggered from a
  // user gesture; a row auto-advance later wouldn't qualify).
  const toggleVoice = (next) => {
    const target = typeof next === "boolean" ? next : !voiceEnabled;
    setVoiceEnabled(target);
    if (target && voiceSupported) {
      // Inside the click handler → counts as a user gesture on iOS
      voiceSpeak("Voice ready");
    } else if (!target) {
      voiceStop();
    }
  };

  // Snap-scroll trigger — increment to force RoadbookView's
  // scrollIntoView effect to re-fire even if currentIndex hasn't
  // changed (after manual scroll-away).
  const [scrollNonce, setScrollNonce] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // PreStart gate.  Loaded but not yet driving — show the "head to
  // the start" screen with map + proximity indicator.  Resolved to
  // null when there's no usable start coordinate anywhere in the
  // loaded data (legacy stages); in that case we skip PreStart and
  // drop straight into the Drive UI.  Cleared back to false whenever
  // the source picker hands us a fresh roadbook.
  const [hasStarted, setHasStarted] = useState(false);
  const startCoords = useMemo(
    () =>
      pickStartCoords(stageStartCoords, roadbook?.rows, trackPoints),
    [stageStartCoords, roadbook?.rows, trackPoints],
  );

  // Reset hasStarted whenever a new roadbook is loaded.  The roadbook
  // reference itself is the stable "I'm a new stage" signal — every
  // load creates a fresh object via setRoadbook in useRoadbook.
  useEffect(() => {
    setHasStarted(false);
  }, [roadbook]);

  // Hold the source picker back while the one-shot IndexedDB restore is
  // still resolving, so a resumable stage doesn't flash the picker first.
  if (restoring && !roadbook) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 text-gray-500 text-sm">
        Loading…
      </div>
    );
  }

  if (!roadbook) {
    return (
      <SourcePicker onPick={loadFile} error={error} isLoading={isLoading} />
    );
  }

  // PreStart sits between SourcePicker and the running Drive UI.
  // Shown whenever the loaded stage has a usable start coordinate AND
  // the user hasn't yet tapped Begin.  Skipped entirely for legacy
  // stages where pickStartCoords couldn't recover any coords.
  if (startCoords && !hasStarted) {
    return (
      <div className="flex flex-col h-screen bg-gray-50">
        <HeaderBar
          stageMeta={stageMeta}
          rowCount={annotatedRows.length}
          docxPatchCount={docxPatchCount}
          onExit={clear}
          onOpenSettings={() => setSettingsOpen(true)}
          voiceEnabled={voiceEnabled}
          voiceSupported={voiceSupported}
          onToggleVoice={() => toggleVoice()}
        />
        <PreStart
          startCoords={startCoords}
          gps={gps}
          gpsError={gpsError}
          triggerRadiusM={triggerRadiusM}
          onBegin={() => setHasStarted(true)}
          onCancel={clear}
          voiceSpeak={voiceSpeak}
          voiceEnabled={voiceEnabled && voiceSupported}
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
          voiceEnabled={voiceEnabled}
          setVoiceEnabled={toggleVoice}
          voiceSupported={voiceSupported}
          voiceTest={() =>
            voiceSpeak("Voice readout test. Next row in 0.4 kilometres.")
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <HeaderBar
        stageMeta={stageMeta}
        rowCount={annotatedRows.length}
        docxPatchCount={docxPatchCount}
        onExit={clear}
        onOpenSettings={() => setSettingsOpen(true)}
        voiceEnabled={voiceEnabled}
        voiceSupported={voiceSupported}
        onToggleVoice={() => toggleVoice()}
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
        voiceEnabled={voiceEnabled}
        setVoiceEnabled={toggleVoice}
        voiceSupported={voiceSupported}
        voiceTest={() =>
          voiceSpeak("Voice readout test. Next row in 0.4 kilometres.")
        }
      />
    </div>
  );
}
