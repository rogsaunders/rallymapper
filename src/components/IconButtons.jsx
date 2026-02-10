import React from "react";

export default function IconButton({ svg, label, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1 rounded border text-sm font-medium
        ${
          active
            ? "bg-blue-600 text-white border-blue-600"
            : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
        }`}
    >
      <span
        className="inline-flex"
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{ width: 20, height: 20 }}
      />
      {label}
    </button>
  );
}
