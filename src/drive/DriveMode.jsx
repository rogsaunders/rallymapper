// src/drive/DriveMode.jsx
//
// Top-level component for the /drive route.
//
// M1 — Source picker, scrolling roadbook display, header + footer.
// M2 — Live GPS subscription, current-row highlight + auto-scroll,
//      distance-to-current display, manual Prev/Next stepping.
// M3+ adds proximity-based auto-advance, voice readout, settings panel.

import React, { useMemo, useState } from "react";
import { distanceM } from "../roadbook/geo";
import { useRoadbook } from "./hooks/useRoadbook";
import { useGpsStream } from "./hooks/useGpsStream";
import { useDriveAdvance } from "./hooks/useDriveAdvance";
import SourcePicker from "./components/SourcePicker";
import HeaderBar from "./components/HeaderBar";
import FooterBar from "./components/FooterBar";
import RoadbookView from "./components/RoadbookView";

export default function DriveMode() {
  const { roadbook, stageMeta, error, isLoading, loadFile, clear } =
    useRoadbook();

  // GPS runs from page load — same behaviour as the recording side,
  // so the first fix is already cached by the time the user loads a
  // roadbook.
  const { gps, error: gpsError } = useGpsStream();

  const rows = roadbook?.rows || [];

  const { currentIndex, goPrev, goNext, jumpTo } = useDriveAdvance({
    rows,
    gps, // M3 will start using this for auto-advance
    autoAdvanceEnabled: false,
    triggerRadiusM: 30,
  });

  // Distance from current GPS to the currently-selected row. Memoised
  // so we don't recompute on every render (GPS updates frequently).
  const distanceToCurrentM = useMemo(() => {
    if (!gps || currentIndex == null) return null;
    const row = rows[currentIndex];
    if (
      !row ||
      !Number.isFinite(Number(row.lat)) ||
      !Number.isFinite(Number(row.lon))
    ) {
      return null;
    }
    return distanceM(
      { lat: gps.lat, lon: gps.lon },
      { lat: Number(row.lat), lon: Number(row.lon) },
    );
  }, [gps, currentIndex, rows]);

  // Snap-scroll trigger — increment to force RoadbookView's
  // scrollIntoView effect to re-fire even if currentIndex hasn't
  // changed (e.g. the user scrolled manually then wants to re-centre).
  const [scrollNonce, setScrollNonce] = useState(0);

  if (!roadbook) {
    return (
      <SourcePicker onPick={loadFile} error={error} isLoading={isLoading} />
    );
  }

  const snapToCurrent = () => setScrollNonce((n) => n + 1);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <HeaderBar
        stageMeta={stageMeta}
        rowCount={rows.length}
        onExit={clear}
      />
      <RoadbookView
        rows={rows}
        currentIndex={currentIndex}
        onRowTap={jumpTo}
        scrollNonce={scrollNonce}
      />
      <FooterBar
        gps={gps}
        gpsError={gpsError}
        distanceToCurrentM={distanceToCurrentM}
        onPrev={goPrev}
        onNext={goNext}
        onSnap={snapToCurrent}
        canPrev={currentIndex != null && currentIndex > 0}
        canNext={currentIndex != null && currentIndex < rows.length - 1}
      />
    </div>
  );
}
