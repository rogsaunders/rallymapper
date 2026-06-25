// src/library/components/LibraryHeader.jsx
//
// Slim brand header for the Route Library, with a link back to Travel Mode.

import React from "react";
import { Link } from "react-router-dom";
import logo from "../../assets/routemapper-logo.png";
import { useLibraryAuth } from "../lib/libraryAuth";

export default function LibraryHeader() {
  const { isAdmin } = useLibraryAuth();
  return (
    <header className="sticky top-0 z-10 bg-white border-b shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src={logo} alt="RouteMapper" className="h-9 w-auto" />
        </Link>
        <div className="flex-1" />
        {isAdmin && (
          <Link
            to="/library/admin"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Review
          </Link>
        )}
        <Link
          to="/library/submit"
          className="text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          Submit a route
        </Link>
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
