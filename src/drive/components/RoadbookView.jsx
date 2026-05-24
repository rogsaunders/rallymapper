// src/drive/components/RoadbookView.jsx
//
// Scrolling list of all roadbook rows.
//
// M2 changes:
//   - Accepts currentIndex and onRowTap.
//   - Maintains a ref per row and calls scrollIntoView({block:"center"})
//     when currentIndex changes, so the current row stays visible
//     without the user scrolling manually.
//   - Smooth-scroll by default; instant on first mount to avoid an
//     awkward auto-scroll animation the moment the page loads.

import React, { useEffect, useRef } from "react";
import RoadbookRow from "./RoadbookRow";

export default function RoadbookView({
  rows,
  currentIndex,
  onRowTap,
  // Increment from DriveMode to re-trigger scroll without changing
  // currentIndex (used by the ↺ Snap button so the user can re-centre
  // after scrolling away manually).
  scrollNonce = 0,
}) {
  const rowRefs = useRef([]);
  const firstScrollDone = useRef(false);

  useEffect(() => {
    if (currentIndex == null) return;
    const node = rowRefs.current[currentIndex];
    if (!node) return;

    try {
      node.scrollIntoView({
        block: "center",
        behavior: firstScrollDone.current ? "smooth" : "auto",
      });
    } catch (_) {
      // Older Safari may reject the options object — fall back.
      try {
        node.scrollIntoView();
      } catch (_e) {
        /* give up silently */
      }
    }
    firstScrollDone.current = true;
  }, [currentIndex, scrollNonce]);

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
          let position = "neutral";
          if (currentIndex != null) {
            if (i === currentIndex) position = "current";
            else if (i < currentIndex) position = "above";
            else position = "below";
          }
          return (
            <RoadbookRow
              key={row.index ?? i}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              row={row}
              position={position}
              onTap={() => onRowTap?.(i)}
            />
          );
        })}
      </div>
    </div>
  );
}
