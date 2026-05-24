// src/drive/DriveMode.jsx
//
// Top-level component for the /drive route. M1 (skeleton):
//   - Source picker if no roadbook loaded
//   - Otherwise: HeaderBar + RoadbookView + FooterBar
//
// State management is React-local; settings persistence and GPS
// integration arrive in M2+.

import React from "react";
import { useRoadbook } from "./hooks/useRoadbook";
import SourcePicker from "./components/SourcePicker";
import HeaderBar from "./components/HeaderBar";
import FooterBar from "./components/FooterBar";
import RoadbookView from "./components/RoadbookView";

export default function DriveMode() {
  const { roadbook, stageMeta, error, isLoading, loadFile, clear } =
    useRoadbook();

  if (!roadbook) {
    return (
      <SourcePicker onPick={loadFile} error={error} isLoading={isLoading} />
    );
  }

  const rows = roadbook.rows || [];

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <HeaderBar
        stageMeta={stageMeta}
        rowCount={rows.length}
        onExit={clear}
      />
      <RoadbookView rows={rows} currentIndex={null /* M2 */} />
      <FooterBar />
    </div>
  );
}
