// src/drive/components/FooterBar.jsx
//
// Bottom chrome. M1 just shows "GPS will appear in M2"; M3 will fill
// in Prev / Snap-to-current / Next buttons plus distance-to-next.

import React from "react";

export default function FooterBar() {
  return (
    <footer className="sticky bottom-0 bg-white border-t shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <div className="px-4 py-3 text-center text-xs text-gray-500">
        GPS auto-advance, Prev/Next controls, and 🔊 voice readout
        arrive in M2–M4.
      </div>
    </footer>
  );
}
