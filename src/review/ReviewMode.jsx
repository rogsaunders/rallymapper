// src/review/ReviewMode.jsx
//
// Review Mode — laptop-first split view for the event organiser to:
//   (a) eyeball the topography around each waypoint and decide whether
//       the row notes / icon need refining for the navigator-facing
//       roadbook, and
//   (b) verify that the tulip rendered for each row matches the actual
//       corner geometry on the map.
//
// Layout:
//   ┌──────────────────────────┬─────────────────────────┐
//   │                          │  WP 1   tulip  "…"      │
//   │       MAP                │  WP 2   tulip  "…"      │
//   │   (terrain / sat /       │ ▶ WP 3  tulip  "…" ◀ sel│
//   │    OSM, toggleable)      │  WP 4   tulip  "…"      │
//   │                          │  …                      │
//   └──────────────────────────┴─────────────────────────┘
//
// Bidirectional selection:
//   • Tap a row     → map flies to that row's (lat,lon) and the linked
//                     waypoint marker gets a yellow ring.
//   • Tap a marker  → the row whose linkedWaypointIds includes that
//                     waypoint id scrolls into the list pane and gets
//                     the yellow band.
//
// Data source for v1:
//   Reads the active stage draft that RouteMapperLayout autosaves to
//   localStorage under `routemapper_stage_draft_v1`. This keeps the
//   MVP small and avoids touching the waypoint state pathway. PR C
//   will extract a waypoint store and let Review work against saved
//   stages too. If no active draft is present, Review shows a small
//   placeholder card with a link back to Record.
//
// Read-only in v1. PR C adds tap-to-edit on the row.

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MapView from "../components/MapView";
import RoadbookView from "../components/roadbook/RoadbookView";
import { generateRoadbook } from "../roadbook";

const STAGE_DRAFT_KEY = "routemapper_stage_draft_v1";

const MAP_SOURCES = [
  { id: "osm", label: "OSM" },
  { id: "opentopo", label: "Terrain" },
  { id: "esri_imagery", label: "Satellite" },
];

function loadStageDraft() {
  try {
    const raw = localStorage.getItem(STAGE_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft) return null;
    return draft;
  } catch (_) {
    return null;
  }
}

export default function ReviewMode() {
  const [draft, setDraft] = useState(() => loadStageDraft());
  const [selectedIndex, setSelectedIndex] = useState(null);
  // Terrain is the most useful default for organiser review (task a),
  // since contour + landcover context is what they're looking for.
  const [mapSource, setMapSource] = useState("opentopo");

  // Re-read draft if another tab updates it (Record mode autosaves on
  // every waypoint commit / track-point append, debounced 250ms).
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STAGE_DRAFT_KEY) {
        setDraft(loadStageDraft());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const trackPoints = draft?.trackPoints ?? [];
  const waypoints = draft?.waypoints ?? [];
  const startGPS = draft?.startGPS ?? null;

  // Build the roadbook from the in-memory stage. Same engine the
  // export pipeline uses, so what the organiser sees here matches
  // what ends up in the .docx.
  const roadbook = useMemo(() => {
    if (!trackPoints.length && !waypoints.length) return null;
    try {
      return generateRoadbook({
        meta: {
          tripName: draft?.tripName,
          tripDate: draft?.tripDate,
          dayNumber: draft?.dayNumber,
          routeName: draft?.routeName,
          stageNumber: draft?.stageNumber,
        },
        trackPoints,
        waypoints,
      });
    } catch (err) {
      console.warn("[ReviewMode] generateRoadbook failed:", err);
      return null;
    }
  }, [trackPoints, waypoints, draft?.tripName, draft?.tripDate, draft?.dayNumber, draft?.routeName, draft?.stageNumber]);

  const rows = roadbook?.rows ?? [];

  // Selection plumbing —
  //   • selectedIndex is the canonical state.
  //   • Selected row → its first linked waypoint id is the marker we
  //     highlight on the map; the row's (lat,lon) is the flyTo target.
  //   • Marker click → find the row whose linkedWaypointIds includes
  //     the tapped id, set selectedIndex.
  const selectedRow = selectedIndex != null ? rows[selectedIndex] : null;
  const selectedWaypointId = selectedRow?.linkedWaypointIds?.[0] ?? null;
  const flyToTarget = selectedRow
    ? { lat: selectedRow.lat, lon: selectedRow.lon }
    : null;

  const onMarkerClick = (waypointId) => {
    const idx = rows.findIndex((r) =>
      (r.linkedWaypointIds || []).includes(waypointId),
    );
    if (idx >= 0) setSelectedIndex(idx);
  };

  // Empty-state — no active stage draft to review.
  if (!draft || (!trackPoints.length && !waypoints.length)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold text-gray-900">
            Nothing to review yet
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Review mode shows the current stage's roadbook side-by-side with
            the map. Start a stage in Record mode and capture some
            waypoints, then come back here.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block px-4 py-2 rounded-xl bg-[#588233] text-white font-medium hover:bg-[#476a29]"
          >
            Go to Record
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Sub-header — stage identity + map source picker. Sits below the
          main header (which is in App-level layout via React Router's
          layout pattern — for /review specifically the main header
          isn't rendered, so this is the only header). */}
      <div className="bg-white border-b">
        <div className="mx-auto max-w-7xl px-3 py-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">
              {draft.tripName || "Untitled Trip"}
            </div>
            <div className="text-xs text-gray-500 truncate">
              Day {draft.dayNumber} · {draft.routeName || `Route ${draft.routeNumber}`} · Stage {draft.stageNumber}
              {rows.length > 0 && <> · {rows.length} rows</>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:inline-flex rounded-full bg-gray-100 p-1">
              {MAP_SOURCES.map((s) => {
                const active = s.id === mapSource;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setMapSource(s.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      active
                        ? "bg-white shadow text-gray-900"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <select
              value={mapSource}
              onChange={(e) => setMapSource(e.target.value)}
              className="sm:hidden text-sm px-2 py-1 rounded-lg border bg-white"
              aria-label="Map source"
            >
              {MAP_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <Link
              to="/"
              className="text-sm px-3 py-1 rounded-full font-medium text-gray-700 hover:bg-gray-100"
              title="Back to Record"
            >
              Back
            </Link>
          </div>
        </div>
      </div>

      {/* Split view — map left, roadbook right.
          Stacks vertically on phone (just-works, not the v1 target). */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Map pane. mapMode="fill" makes MapView size to its parent
            container instead of using the small inline heights it
            applies in Record/Edit mode. */}
        <div className="md:flex-1 h-[50vh] md:h-auto min-h-0">
          <MapView
            currentGPS={null}
            startGPS={startGPS}
            waypoints={waypoints}
            trackPoints={trackPoints}
            followMap={false}
            showMap={true}
            mapMode="fill"
            mapSource={mapSource}
            resizeKey={`review-${selectedIndex}`}
            selectedWaypointId={selectedWaypointId}
            onMarkerClick={onMarkerClick}
            flyToTarget={flyToTarget}
          />
        </div>

        {/* Roadbook pane. md:w-[44ch] keeps the list narrow enough that
            the map dominates on desktop, which matches what the
            organiser actually wants to look at. */}
        <div className="md:w-[44ch] md:border-l border-t md:border-t-0 flex flex-col min-h-0 bg-gray-50">
          <RoadbookView
            rows={rows}
            selectedIndex={selectedIndex}
            onRowTap={(i) => setSelectedIndex(i)}
          />
        </div>
      </div>
    </div>
  );
}
