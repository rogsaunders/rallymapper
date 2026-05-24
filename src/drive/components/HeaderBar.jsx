// src/drive/components/HeaderBar.jsx
//
// Top chrome for Drive Mode.
//
// M3 adds a ⚙️ settings cog that opens the settings overlay.

import React from "react";

export default function HeaderBar({
  stageMeta,
  onExit,
  rowCount,
  onOpenSettings,
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
      <div className="px-4 py-3 flex items-center gap-3">
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
