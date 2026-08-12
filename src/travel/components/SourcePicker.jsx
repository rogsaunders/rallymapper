// src/travel/components/SourcePicker.jsx
//
// M1: load a roadbook from disk (ZIP or JSON). M2 will add a
// "saved stages" list for logged-in users.

import React, { useRef } from "react";
import brandLogo from "../../assets/routemapper-logo.png";

export default function SourcePicker({ onPick, error, isLoading, libraryHref }) {
  const inputRef = useRef(null);

  const onFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (file) onPick(file);
    // Reset so re-selecting the same file fires onChange again
    e.target.value = "";
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-sm border max-w-md w-full p-6">
        {/* RouteMapper brand lockup — gives the standalone landing screen
            (the first thing a go.routemapper.net visitor sees) a clear
            identity. Same asset as the HeaderBar so branding is consistent
            across the app. */}
        <img
          src={brandLogo}
          alt="RouteMapper"
          className="h-16 w-auto mx-auto mb-4"
        />
        <h1 className="text-xl font-bold text-gray-900 mb-2 text-center">
          🧭 Travel Mode
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Load a roadbook to follow on the road, trail, or track.
          RouteMapper export ZIP, a standalone <code>stage.json</code>,
          or a <code>.gpx</code> track.
        </p>

        <button
          type="button"
          disabled={isLoading}
          onClick={() => inputRef.current?.click()}
          className="w-full px-4 py-3 rounded-xl text-white font-semibold disabled:opacity-50"
          style={{ backgroundColor: "#588233" }}
        >
          {isLoading ? "Loading…" : "📂 Load roadbook (ZIP, JSON or GPX)"}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".zip,.json,.gpx,application/zip,application/json,application/gpx+xml"
          onChange={onFileSelected}
          className="hidden"
        />

        {error && (
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}

        {/* Route Library entry — only rendered on the standalone app, which
            passes libraryHref. The editor's in-app /travel route leaves it
            null so no (would-be broken) link appears there. */}
        {libraryHref && (
          <a
            href={libraryHref}
            className="mt-3 block w-full text-center px-4 py-2.5 rounded-xl border border-[#588233] text-[#588233] font-semibold hover:bg-[#588233]/5"
          >
            📚 Browse the Route Library
          </a>
        )}

        <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500 leading-relaxed">
          <p>
            <a href={__EDITOR_HOME__} className="text-[#588233] underline">
              ← Back to the recording app
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
