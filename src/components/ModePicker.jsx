// src/components/ModePicker.jsx
//
// Top-level mode switcher used in the layout header.
//
// Renders two variants — only one is visible at a time based on viewport:
//   • Desktop / iPad-landscape (≥ md, ~768px): a centred segmented pill
//     inside the header bar.
//   • Phone / iPad-portrait (< md): a bottom tab bar fixed to the
//     viewport bottom (thumb-reachable, doesn't compete with the top bar
//     for vertical space).
//
// Both variants render simultaneously and are toggled via Tailwind
// responsive classes — no JS viewport hook required.
//
// Review tab — organiser workbench, side-by-side map + roadbook for
// verifying tulip accuracy and refining the captured stage.

import React from "react";
import { Link, useLocation } from "react-router-dom";

const TABS = [
  { to: "/", label: "Record", match: (p) => p === "/" },
  { to: "/drive", label: "Drive", match: (p) => p.startsWith("/drive") },
  { to: "/review", label: "Review", match: (p) => p.startsWith("/review") },
];

export default function ModePicker() {
  const { pathname } = useLocation();

  return (
    <>
      {/* Desktop / iPad landscape — segmented pill */}
      <div
        className="hidden md:inline-flex rounded-full bg-gray-100 p-1"
        role="tablist"
        aria-label="Mode"
      >
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.to}
              to={t.to}
              role="tab"
              aria-selected={active}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                active
                  ? "bg-white shadow text-gray-900"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Phone / iPad portrait — bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t flex justify-around"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        role="tablist"
        aria-label="Mode"
      >
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.to}
              to={t.to}
              role="tab"
              aria-selected={active}
              className={`flex-1 text-center py-3 text-sm font-medium ${
                active
                  ? "text-[#588233] font-semibold"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
