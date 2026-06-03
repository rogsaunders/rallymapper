// src/components/OverflowMenu.jsx
//
// A ··· (horizontal ellipsis) dropdown button for secondary header
// actions that don't earn permanent space in the top bar.
//
// Used by the layout header to house Account, Manage Billing, Support,
// Sign Out, and the build-stamp diagnostic — items that previously sat
// inline in the top bar and made it overflow on small screens.
//
// Behaviour:
//   • Click ··· to toggle.
//   • Click outside → closes.
//   • ESC → closes.
//   • Clicking any item inside the menu also closes the menu (since
//     menu items are typically actions that take the user elsewhere or
//     pop a modal — leaving the menu open would be visual noise).
//
// Use OverflowMenuItem for clickable rows; static content (e.g. an
// info-only "Signed in as ..." row, or the build stamp footer) can be
// passed as plain children — those won't trigger a close on click
// because the close-on-click is implemented via a wrapper that only
// fires when the click bubbles from a button/anchor.

import React, { useEffect, useRef, useState } from "react";

export default function OverflowMenu({ children, label = "More" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="p-2 rounded-full hover:bg-gray-100 text-gray-700"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        title={label}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-60 bg-white rounded-xl shadow-lg border py-1 z-40"
          onClick={(e) => {
            // Auto-close when a button/anchor inside is activated.
            // Static rows (divs/spans) won't match — they stay open.
            const tag = e.target?.closest?.("button, a");
            if (tag && ref.current?.contains(tag)) setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// Convenience item — onClick action OR href link. Either renders as a
// full-width left-aligned row that hovers grey. Use for the menu's
// actionable rows. For static info rows just pass a plain <div>.
export function OverflowMenuItem({
  children,
  onClick,
  href,
  target,
  rel,
  disabled = false,
}) {
  const cls = `block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700 ${
    disabled ? "opacity-50 pointer-events-none" : ""
  }`;
  if (href) {
    return (
      <a href={href} target={target} rel={rel} className={cls} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
