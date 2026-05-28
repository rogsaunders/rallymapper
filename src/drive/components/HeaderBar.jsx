// src/drive/components/HeaderBar.jsx
//
// Top chrome for Drive Mode.
//
// M3 adds a ⚙️ settings cog.
// M4 adds a 🔊/🔇 quick toggle for voice readout.

import React from "react";

export default function HeaderBar({
  stageMeta,
  onExit,
  rowCount,
  docxPatchCount = 0,
  onOpenSettings,
  voiceEnabled,
  voiceSupported,
  onToggleVoice,
}) {
  const stageName = stageMeta?.stageName || "Drive Mode";
  const subtitle =
    stageMeta &&
    [
      stageMeta.day != null ? `Day ${stageMeta.day}` : null,
      stageMeta.routeName ||
        (stageMeta.routeNumber != null ? `Route ${stageMeta.routeNumber}` : null),
      stageMeta.stageNumber != null ? `Stage ${stageMeta.stageNumber}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <header className="sticky top-0 z-10 bg-white border-b shadow-sm">
      <div className="px-4 py-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-gray-900 truncate">
            {stageName}
          </div>
          {subtitle && (
            <div className="text-xs text-gray-500 truncate">{subtitle}</div>
          )}
        </div>
        <div className="text-xs text-gray-500 whitespace-nowrap">
          {rowCount} row{rowCount === 1 ? "" : "s"}
        </div>
        {docxPatchCount > 0 && (
          <div
            className="text-xs px-2 py-1 rounded-full font-medium bg-blue-500 bg-opacity-15 text-blue-800 whitespace-nowrap"
            title={`${docxPatchCount} note${
              docxPatchCount === 1 ? " was" : "s were"
            } overridden from the edited roadbook.docx inside the ZIP`}
          >
            📝 {docxPatchCount} edit{docxPatchCount === 1 ? "" : "s"}
          </div>
        )}

        {/* Voice quick toggle — hidden if the browser has no
            speechSynthesis support at all */}
        {voiceSupported && (
          <button
            type="button"
            onClick={onToggleVoice}
            className={`p-2 rounded-lg border text-base leading-none ${
              voiceEnabled
                ? "border-[#588233] bg-[#588233]/10 text-[#588233]"
                : "border-gray-300 text-gray-400 bg-white hover:bg-gray-50"
            }`}
            title={
              voiceEnabled
                ? "Voice readout on — tap to mute"
                : "Voice readout off — tap to enable"
            }
            aria-label={
              voiceEnabled ? "Mute voice readout" : "Enable voice readout"
            }
          >
            {voiceEnabled ? "🔊" : "🔇"}
          </button>
        )}

        <button
          type="button"
          onClick={onOpenSettings}
          className="p-2 rounded-lg border border-gray-300 text-gray-600 bg-white hover:bg-gray-50"
          title="Drive Mode settings"
          aria-label="Open settings"
        >
          ⚙️
        </button>
        <button
          type="button"
          onClick={onExit}
          className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 text-sm font-medium"
          title="Close roadbook and pick a new one"
        >
          ✕ Close
        </button>
      </div>
    </header>
  );
}
