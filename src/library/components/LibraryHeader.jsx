// src/library/components/LibraryHeader.jsx
//
// Slim brand header for the Route Library, with a link back to Travel Mode.

import React from "react";
import { Link } from "react-router-dom";
import logo from "../../assets/routemapper-logo.png";

export default function LibraryHeader() {
  return (
    <header className="sticky top-0 z-10 bg-white border-b shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src={logo} alt="RouteMapper" className="h-9 w-auto" />
        </Link>
        <div className="flex-1" />
        <Link
          to="/"
          className="text-sm font-medium text-[#588233] hover:underline"
        >
          🧭 Open Travel
        </Link>
      </div>
    </header>
  );
}
