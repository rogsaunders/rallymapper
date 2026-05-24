// src/drive/components/RoadbookView.jsx
//
// Scrolling list of all roadbook rows. M1 has no "current" — every
// row renders in its default style. M2 will pass currentIndex and
// trigger auto-scroll to centre that row in the visible area.

import React from "react";
import RoadbookRow from "./RoadbookRow";

export default function RoadbookView({ rows, currentIndex = null }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-gray-500">
        Roadbook loaded but no rows were generated.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto p-3">
        {rows.map((row, i) => {
          let position = "below";
          if (currentIndex == null) {
            position = "neutral";
          } else if (i === currentIndex) {
            position = "current";
          } else if (i < currentIndex) {
            position = "above";
          }
          return (
            <RoadbookRow
              key={row.index ?? i}
              row={row}
              position={position}
            />
          );
        })}
      </div>
    </div>
  );
}
