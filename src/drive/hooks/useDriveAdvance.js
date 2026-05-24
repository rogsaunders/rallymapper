// src/drive/hooks/useDriveAdvance.js
//
// Owns the "which row is current" state for Drive Mode.
//
// M2: manual advancement only — user taps a row to jump to it, or
//     uses Prev/Next buttons in the footer. Auto-initialised to row 0
//     once a roadbook is loaded.
//
// M3 will add proximity-zone auto-advancement on top of this hook
// without changing the public API: useDriveAdvance({ rows, gps,
// autoAdvanceEnabled, triggerRadiusM }) — the same currentIndex etc.
// will be returned, just computed automatically when conditions are
// met. For now the gps/autoAdvanceEnabled/triggerRadiusM args are
// accepted-but-unused so callers don't have to change in M3.

import { useEffect, useState, useCallback } from "react";

// eslint-disable-next-line no-unused-vars
export function useDriveAdvance({ rows, gps, autoAdvanceEnabled, triggerRadiusM }) {
  const total = rows?.length ?? 0;
  const [currentIndex, setCurrentIndex] = useState(total > 0 ? 0 : null);

  // Reset when the roadbook itself changes (different stage loaded)
  useEffect(() => {
    setCurrentIndex(total > 0 ? 0 : null);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => {
      if (i == null) return 0;
      return Math.max(0, i - 1);
    });
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => {
      if (i == null) return 0;
      return Math.min(total - 1, i + 1);
    });
  }, [total]);

  const jumpTo = useCallback(
    (i) => {
      if (i == null) return;
      const clamped = Math.max(0, Math.min(total - 1, i));
      setCurrentIndex(clamped);
    },
    [total],
  );

  return { currentIndex, goPrev, goNext, jumpTo };
}
