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
// Data sources:
//   • The active stage draft that RouteMapperLayout autosaves to
//     localStorage under `routemapper_stage_draft_v1`. This is what
//     Review opens by default whenever a stage is active in Record.
//   • Historical stages, fetched via listSavedStages / loadSavedStage
//     (Supabase for signed-in users, localStorage scan for guests).
//     The stage picker in the sub-header lets the organiser switch
//     between active and any past stage. Same waypoint/trackPoint
//     shape, so the rest of the pipeline is unchanged.
//
// Read-only in v1. PR C adds tap-to-edit on the row.

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MapView from "../components/MapView";
import RoadbookView from "../components/roadbook/RoadbookView";
import { generateRoadbook } from "../roadbook";
import { useAuth } from "../auth/AuthProvider";
import {
  listSavedStages,
  loadSavedStage,
  saveStageMutation,
} from "../lib/stageHistory";

const STAGE_DRAFT_KEY = "routemapper_stage_draft_v1";

// FEATURE FLAG — historical-stage selection in Review mode.
//
// Re-enabled 2026-06-09. The map-centring bugs that originally
// motivated turning this off were fixed upstream:
//   • FitBounds was firing before the async loadSavedStage payload
//     arrived (lengths still 0 → no valid points → silent skip).
//     Fixed by baking trackPoints.length + waypoints.length into
//     `fitBoundsKey` so FitBounds re-fires when data lands.
//   • Row-tap centring was getting clobbered by Leaflet's internal
//     size/tile activity during flyTo's 600 ms animation window.
//     Fixed by swapping flyTo for setView (instant, no race).
//
// Both fixes have shipped (PRs #51, #59, #60) and confirmed on
// real-device testing with the active stage. Re-enabling so the
// organiser can review historical stages too — needed for Lachie's
// upcoming multi-day survey.
//
// If new issues turn up that warrant another shutoff, flip back to
// `false` — all the historical-path code (picker UI, list/load
// effects, auto-pick logic, stageHistory write-back) stays in the
// file behind this guard, so it's a one-line revert.
const ENABLE_HISTORICAL_STAGES = true;

const MAP_SOURCES = [
  { id: "osm", label: "OSM" },
  { id: "opentopo", label: "Terrain" },
  { id: "esri_imagery", label: "Satellite" },
];

// Mirror of getGuestOwnerId() in RouteMapperLayout — duplicated here
// to avoid coupling Review back into the big layout file. The id is
// random per browser; both places generate the same value because
// they read the same localStorage key.
function getGuestOwnerId() {
  const k = "rm_guest_owner";
  let v = localStorage.getItem(k);
  if (!v) {
    v = `guest_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    localStorage.setItem(k, v);
  }
  return v;
}

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

function formatStageOption(entry) {
  const m = entry.meta || {};
  const parts = [];
  if (m.tripName) parts.push(m.tripName);
  const sub = [];
  if (m.dayNumber != null) sub.push(`Day ${m.dayNumber}`);
  if (m.routeNumber != null) sub.push(`R${m.routeNumber}`);
  if (m.stageNumber != null) sub.push(`S${m.stageNumber}`);
  if (sub.length) parts.push(sub.join(" · "));
  if (entry.savedAt) {
    try {
      parts.push(new Date(entry.savedAt).toLocaleDateString());
    } catch (_) {}
  }
  return parts.join(" — ") || "Unnamed stage";
}

export default function ReviewMode() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const owner = userId ?? getGuestOwnerId();

  // Active draft (kept in sync with Record's autosave).
  const [draft, setDraft] = useState(() => loadStageDraft());
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STAGE_DRAFT_KEY) setDraft(loadStageDraft());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Historical stage list — fetched once on mount (and any time the
  // owner identity changes, e.g. sign-in).
  // Gated by ENABLE_HISTORICAL_STAGES so the network/localStorage scan
  // is skipped entirely when historical review is off.
  const [savedStages, setSavedStages] = useState([]);
  const [stagesLoading, setStagesLoading] = useState(
    ENABLE_HISTORICAL_STAGES,
  );
  useEffect(() => {
    if (!ENABLE_HISTORICAL_STAGES) return;
    let cancelled = false;
    setStagesLoading(true);
    listSavedStages(userId, owner)
      .then((list) => {
        if (!cancelled) setSavedStages(list || []);
      })
      .catch((err) => {
        console.warn("[ReviewMode] listSavedStages failed:", err);
        if (!cancelled) setSavedStages([]);
      })
      .finally(() => {
        if (!cancelled) setStagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, owner]);

  // Which stage is currently being reviewed.
  //   selectedStageId === null  → active draft (default when present)
  //   selectedStageId === "<localId>" → historical entry from savedStages
  // When `draft` is absent and at least one historical stage exists,
  // we auto-pick the most recent historical so Review is useful
  // straight away on a clean session.
  const [selectedStageId, setSelectedStageId] = useState(null);
  useEffect(() => {
    if (selectedStageId != null) return;
    if (!draft && savedStages.length > 0) {
      setSelectedStageId(savedStages[0].localId);
    }
  }, [draft, savedStages, selectedStageId]);

  // Historical payload — loaded on demand when the picker selects one.
  const [historicalPayload, setHistoricalPayload] = useState(null);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  useEffect(() => {
    if (selectedStageId == null) {
      setHistoricalPayload(null);
      return;
    }
    const entry = savedStages.find((s) => s.localId === selectedStageId);
    if (!entry) {
      setHistoricalPayload(null);
      return;
    }
    let cancelled = false;
    setHistoricalLoading(true);
    loadSavedStage(userId, owner, entry)
      .then((payload) => {
        if (!cancelled) setHistoricalPayload(payload || null);
      })
      .catch((err) => {
        console.warn("[ReviewMode] loadSavedStage failed:", err);
        if (!cancelled) setHistoricalPayload(null);
      })
      .finally(() => {
        if (!cancelled) setHistoricalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStageId, savedStages, userId, owner]);

  // What stage we're actually rendering — active draft or historical.
  const stage = selectedStageId == null ? draft : historicalPayload;

  const [selectedIndex, setSelectedIndex] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // View mode — declared up here (before the reset-selection effect
  // below) so the effect's dep array doesn't hit a temporal dead
  // zone on first render. Was previously declared further down by
  // `rows`, which crashed Review with "Cannot access 'A' before
  // initialization" the moment a user navigated from Record after
  // ending a stage. See PR #57 hotfix.
  //   • "driver" (default) = roadbook.views.driver — the same condensed
  //     row set the DOCX exporter uses. What the organiser sees in
  //     Review matches what the navigator gets in the printed roadbook.
  //   • "raw" = roadbook.rows (all manual waypoints + every detected
  //     turn between them). Useful when verifying tulip accuracy or
  //     debugging the turn-detection pass.
  const [viewMode, setViewMode] = useState("driver");

  // Reset selection whenever the source stage changes — or the view
  // mode toggles. Row indices differ between Driver and Raw views, so
  // a stale selectedIndex would point at the wrong row after the
  // switch.
  useEffect(() => {
    setSelectedIndex(null);
    setEditingIndex(null);
    setSaveError(null);
  }, [selectedStageId, stage, viewMode]);

  // Terrain is the most useful default for organiser review (task a),
  // since contour + landcover context is what they're looking for.
  const [mapSource, setMapSource] = useState("opentopo");

  const trackPoints = stage?.trackPoints ?? [];
  const waypoints = stage?.waypoints ?? [];
  const startGPS = stage?.startGPS ?? null;

  // Build the roadbook from whichever stage is loaded. Same engine
  // the export pipeline uses, so what the organiser sees here matches
  // what ends up in the .docx.
  const roadbook = useMemo(() => {
    if (!trackPoints.length && !waypoints.length) return null;
    try {
      return generateRoadbook({
        meta: {
          tripName: stage?.tripName ?? stage?.meta?.tripName,
          tripDate: stage?.tripDate ?? stage?.meta?.tripDate,
          dayNumber: stage?.dayNumber ?? stage?.meta?.dayNumber,
          routeName: stage?.routeName ?? stage?.meta?.routeName,
          stageNumber: stage?.stageNumber ?? stage?.meta?.stageNumber,
        },
        trackPoints,
        waypoints,
      });
    } catch (err) {
      console.warn("[ReviewMode] generateRoadbook failed:", err);
      return null;
    }
  }, [stage, trackPoints, waypoints]);

  // viewMode is declared up near the other useState calls (above the
  // reset-selection effect) to avoid the TDZ crash. See the block
  // there for the semantics of "driver" vs "raw".
  const rows =
    viewMode === "driver"
      ? (roadbook?.views?.driver ?? roadbook?.rows ?? [])
      : (roadbook?.rows ?? []);

  // Map waypoint-id → its row index (1-based) in the currently
  // displayed view. The map marker for that waypoint will be
  // labelled with the SAME number the Review list shows, instead of
  // its position in the raw waypoints array. Resolves the
  // "WP 8 on map / Row 23 in list" mismatch.
  //
  // Some waypoints (typically auto-derived turns that didn't survive
  // the driver-view filter) won't appear in `rows` — those fall back
  // to their original waypoint-array number via MapView's existing
  // logic so we never silently lose a marker number.
  const waypointRowNumberMap = useMemo(() => {
    const m = {};
    rows.forEach((row, i) => {
      const num = i + 1;
      for (const wpId of row.linkedWaypointIds || []) {
        if (wpId && m[wpId] == null) m[wpId] = num;
      }
    });
    return m;
  }, [rows]);

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

  // ── Edit-in-place flow (PR C) ─────────────────────────────────────
  // Identify which underlying source we're writing back to. Derived
  // from selectedStageId + savedStages so it stays consistent with
  // whatever the picker shows.
  const selectedEntry = selectedStageId
    ? savedStages.find((s) => s.localId === selectedStageId)
    : null;
  const stageSource =
    selectedStageId == null
      ? "active"
      : selectedEntry?.source === "supabase"
        ? "supabase"
        : "local";

  // Editable when (a) we have a stage to write to and (b) for the
  // Supabase source we have a signed-in user (the upsert needs it).
  // Editing the active draft works for both signed-in users and
  // guests (the autosave is local).
  const canEdit =
    !!stage &&
    (stageSource !== "supabase" || !!userId);

  const onEditStart = (idx) => {
    setSaveError(null);
    setEditingIndex(idx);
  };

  const onCancelEdit = () => {
    setEditingIndex(null);
    setSaveError(null);
  };

  const onSaveEdit = async (rowIndex, patch) => {
    if (savingEdit) return;
    const row = rows[rowIndex];
    if (!row) return;

    const linkedIds = row.linkedWaypointIds || [];
    if (linkedIds.length === 0) {
      // No waypoint to attach to — auto-detected turns don't have one.
      // Refuse and surface a hint rather than silently dropping the
      // edit.
      setSaveError(
        "This row was auto-detected from the track; it isn't tied to a waypoint, so edits can't be saved here. Add a waypoint at this location in Record mode instead.",
      );
      return;
    }

    // Patch every linked waypoint (usually just one) so a row stays
    // consistent if multiple waypoints got merged into it.
    const updatedWaypoints = (stage.waypoints || []).map((w) =>
      linkedIds.includes(w.id)
        ? {
            ...w,
            poi: patch.poi ?? "",
            iconId: patch.iconId ?? null,
            type: patch.type ?? w.type ?? "note",
          }
        : w,
    );

    const updatedStage = { ...stage, waypoints: updatedWaypoints };

    setSavingEdit(true);
    setSaveError(null);
    try {
      const result = await saveStageMutation({
        userId,
        owner,
        source: stageSource,
        localId: selectedStageId,
        payload: updatedStage,
      });
      if (!result.ok) {
        setSaveError(result.error?.message || "Save failed.");
        return;
      }
      // Optimistic local update so the row reflects the change
      // immediately (the next regenerateRoadbook picks it up via the
      // useMemo dependency on stage).
      if (stageSource === "active") {
        setDraft(updatedStage);
      } else {
        setHistoricalPayload(updatedStage);
      }
      setEditingIndex(null);
    } catch (err) {
      console.warn("[ReviewMode] saveStageMutation threw:", err);
      setSaveError(err?.message || "Save failed.");
    } finally {
      setSavingEdit(false);
    }
  };

  // Stage-meta strings for the sub-header.
  const stageTripName =
    stage?.tripName ?? stage?.meta?.tripName ?? "Untitled Trip";
  const stageDay = stage?.dayNumber ?? stage?.meta?.dayNumber;
  const stageRouteName =
    stage?.routeName ??
    stage?.meta?.routeName ??
    `Route ${stage?.routeNumber ?? stage?.meta?.routeNumber ?? "?"}`;
  const stageNumber = stage?.stageNumber ?? stage?.meta?.stageNumber;

  // Empty state — no active draft AND no historical stages found.
  const haveAnyStage =
    !!draft || savedStages.length > 0 || (stage && (trackPoints.length || waypoints.length));
  if (!stagesLoading && !haveAnyStage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold text-gray-900">
            Nothing to review yet
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Review mode shows a stage's roadbook side-by-side with the map.
            Start a stage in Record mode and capture some waypoints, then
            come back here.
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
      {/* Sub-header — stage picker (when historical enabled), identity,
          map source picker, Back. */}
      <div className="bg-white border-b">
        <div className="mx-auto max-w-7xl px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {ENABLE_HISTORICAL_STAGES && (
              <select
                value={selectedStageId ?? "__active__"}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedStageId(v === "__active__" ? null : v);
                }}
                className="text-sm px-2 py-1 rounded-lg border bg-white max-w-[24rem]"
                aria-label="Stage to review"
              >
                {draft && (
                  <option value="__active__">● Active stage{draft.tripName ? ` — ${draft.tripName}` : ""}</option>
                )}
                {savedStages.length > 0 && (
                  <optgroup label={draft ? "History" : "Saved stages"}>
                    {savedStages.map((s) => (
                      <option key={s.localId} value={s.localId}>
                        {formatStageOption(s)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">
                {stageTripName}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {stageDay != null && <>Day {stageDay} · </>}
                {stageRouteName}
                {stageNumber != null && <> · Stage {stageNumber}</>}
                {rows.length > 0 && <> · {rows.length} rows</>}
                {historicalLoading && <> · loading…</>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* View toggle — Driver (matches the .docx) vs Raw (all
                detected turns, useful for tulip-vs-track verification). */}
            <div
              className="inline-flex rounded-full bg-gray-100 p-1"
              role="tablist"
              aria-label="Roadbook view"
              title="Driver matches the printed roadbook; Raw shows every detected turn"
            >
              {[
                { id: "driver", label: "Driver" },
                { id: "raw", label: "Raw" },
              ].map((v) => {
                const active = viewMode === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setViewMode(v.id)}
                    role="tab"
                    aria-selected={active}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      active
                        ? "bg-white shadow text-gray-900"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>

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
            // resizeKey only needs to change when the panel size
            // could change — that's stage switch, not row selection.
            // Including selectedIndex here used to fire
            // map.invalidateSize() on every row tap, which raced
            // with FlyTo and could land the view off-target.
            resizeKey={`review-${selectedStageId ?? "active"}`}
            selectedWaypointId={selectedWaypointId}
            onMarkerClick={onMarkerClick}
            flyToTarget={flyToTarget}
            // Refit the map whenever (a) the stage selection
            // changes, or (b) the data finishes loading
            // asynchronously. For historical stages the payload
            // arrives via loadSavedStage AFTER first render —
            // including the array lengths in the key means
            // FitBounds re-fires when trackPoints/waypoints flip
            // from 0 → N.
            fitBoundsKey={`${selectedStageId ?? "active"}-${trackPoints.length}-${waypoints.length}`}
            // Re-label the waypoint markers to match the row index in
            // the Review list rather than the position in the raw
            // waypoints array. Fixes "WP 8 on map / Row 23 in list"
            // for the same physical waypoint.
            waypointNumberOverride={waypointRowNumberMap}
          />
        </div>

        {/* Roadbook pane. md:w-[44ch] keeps the list narrow enough that
            the map dominates on desktop, which matches what the
            organiser actually wants to look at. */}
        <div className="md:w-[44ch] md:border-l border-t md:border-t-0 flex flex-col min-h-0 bg-gray-50">
          {saveError && (
            <div className="px-3 py-2 text-xs bg-red-50 border-b border-red-200 text-red-800 flex items-start gap-2">
              <span className="font-semibold">Save failed:</span>
              <span className="min-w-0 break-words">{saveError}</span>
              <button
                type="button"
                onClick={() => setSaveError(null)}
                className="ml-auto shrink-0 text-red-700 hover:text-red-900 underline"
              >
                Dismiss
              </button>
            </div>
          )}
          {historicalLoading && !rows.length ? (
            <div className="flex-1 flex items-center justify-center p-8 text-gray-500 text-sm">
              Loading stage…
            </div>
          ) : (
            <RoadbookView
              rows={rows}
              selectedIndex={selectedIndex}
              onRowTap={(i) => {
                // Tapping any row while another is in edit mode
                // cancels that edit — prevents accidental discard
                // surprises by behaving as a navigation gesture.
                if (editingIndex != null && editingIndex !== i) {
                  setEditingIndex(null);
                }
                setSelectedIndex(i);
              }}
              editable={canEdit}
              editingIndex={editingIndex}
              onEditStart={onEditStart}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
            />
          )}
        </div>
      </div>
    </div>
  );
}
