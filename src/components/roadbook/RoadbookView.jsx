// src/components/roadbook/RoadbookView.jsx
//
// Scrolling list of all roadbook rows. Shared between Drive Mode and
// Review Mode.
//
// Two highlight pathways (consumers pick one):
//   • currentIndex (Drive) — the "you are here" auto-advancing pointer.
//     Renders amber band. Maintains a ref per row and auto-scrolls into
//     centre whenever it changes.
//   • selectedIndex (Review) — the row the user (or a map-marker click)
//     last selected. Renders yellow band. Also auto-scrolls so the
//     selected row is visible in the list pane.
//
// Both call scrollIntoView({block:"center"}); smooth-scroll by default,
// instant on first mount to avoid an awkward auto-scroll animation the
// moment the page loads.

import React, { useEffect, useRef } from "react";
import RoadbookRow from "./RoadbookRow";

export default function RoadbookView({
  rows,
  currentIndex,
  selectedIndex,
  onRowTap,
  // Edit-in-place (Review Mode, PR C). All four are opt-in — Drive
  // Mode doesn't pass them, so its rows render read-only as before.
  editable = false,
  editingIndex = null,
  onEditStart,
  onSaveEdit,
  onCancelEdit,
  // Increment from DriveMode to re-trigger scroll without changing
  // currentIndex (used by the ↺ Snap button so the user can re-centre
  // after scrolling away manually).
  scrollNonce = 0,
}) {
  const rowRefs = useRef([]);
  const firstScrollDone = useRef(false);

  // Auto-scroll target = whichever of currentIndex / selectedIndex is
  // active. selectedIndex (Review) wins if both somehow appear.
  const scrollTarget =
    selectedIndex != null ? selectedIndex : currentIndex;

  useEffect(() => {
    if (scrollTarget == null) return;
    const node = rowRefs.current[scrollTarget];
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
  }, [scrollTarget, scrollNonce]);

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
          const selected = selectedIndex != null && i === selectedIndex;
          const editing = editable && editingIndex != null && i === editingIndex;
          return (
            <RoadbookRow
              key={row.index ?? i}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              row={row}
              position={position}
              selected={selected}
              editable={editable}
              editing={editing}
              onTap={() => onRowTap?.(i)}
              onEditStart={() => onEditStart?.(i)}
              onSave={(_row, patch) => onSaveEdit?.(i, patch)}
              onCancel={() => onCancelEdit?.()}
              // Excel-style Tab: jump focus to the next row's inline
              // textarea (or wrap to the first row at the end). The
              // row only renders a single textarea in inline-edit
              // mode, so a CSS selector is enough.
              onTabNext={() => {
                const next = rowRefs.current[i + 1] ?? rowRefs.current[0];
                next?.querySelector?.("textarea")?.focus();
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
