// src/library/LibraryBrowse.jsx
//
// Route Library browse + search surface (Phase A — free catalogue).

import React, { useEffect, useState } from "react";
import { listPublishedRoutes } from "./lib/libraryApi";
import ListingCard from "./components/ListingCard";
import LibraryHeader from "./components/LibraryHeader";

const ACTIVITIES = [
  { id: "", label: "All" },
  { id: "car", label: "Car" },
  { id: "rally", label: "Rally" },
  { id: "4wd", label: "4WD" },
  { id: "moto", label: "Motorbike" },
  { id: "cycle", label: "Cycle" },
  { id: "walk", label: "Walk" },
];

export default function LibraryBrowse() {
  const [search, setSearch] = useState("");
  const [activity, setActivity] = useState("");
  const [listings, setListings] = useState(null); // null = loading
  const [error, setError] = useState(null);

  // Debounce the search box; re-query when the filters change.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setError(null);
      setListings(null);
      try {
        const rows = await listPublishedRoutes({ search, activity });
        if (!cancelled) setListings(rows);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || String(e));
          setListings([]);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, activity]);

  return (
    <div className="min-h-screen bg-gray-50">
      <LibraryHeader />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900">Route Library</h1>
        <p className="mt-1 text-sm text-gray-600">
          Browse community routes and open them straight into Travel Mode.
        </p>

        <div className="mt-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search routes…"
            className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#588233]/40"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {ACTIVITIES.map((a) => {
              const active = a.id === activity;
              return (
                <button
                  key={a.id || "all"}
                  type="button"
                  onClick={() => setActivity(a.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                    active
                      ? "text-white border-transparent"
                      : "bg-white text-gray-700 hover:bg-gray-100"
                  }`}
                  style={active ? { backgroundColor: "#588233" } : undefined}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              Couldn’t load the library: {error}
            </div>
          )}

          {listings === null && !error && (
            <div className="py-16 text-center text-gray-500 text-sm">Loading…</div>
          )}

          {listings !== null && listings.length === 0 && !error && (
            <div className="py-16 text-center text-gray-500">
              <div className="text-4xl mb-3">🧭</div>
              <p className="font-medium text-gray-700">No routes yet</p>
              <p className="text-sm">
                {search || activity
                  ? "Try a different search or filter."
                  : "The library is just getting started — check back soon."}
              </p>
            </div>
          )}

          {listings && listings.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
