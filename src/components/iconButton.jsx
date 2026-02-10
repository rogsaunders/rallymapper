// src/components/IconButton.jsx
import React from "react";

export default function IconButton({
  svg,
  label,
  onClick,
  active,
  className = "",
  ...buttonProps // ✅ forwards id, disabled, aria-*, etc
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...buttonProps}
      className={`flex items-center gap-2 px-3 py-1 rounded border
        text-[1rem] font-normal
        ${
          active
            ? "text-white"
            : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
        }
        ${className}
      `}
      style={
        active
          ? {
              backgroundColor: "rgb(220, 70, 1, 0.7)",
              borderColor: "rgb(220, 70, 1, 0.7)",
            }
          : undefined
      }
    >
      <span className="rm-icon" dangerouslySetInnerHTML={{ __html: svg }} />
      {label}
    </button>
  );
}
