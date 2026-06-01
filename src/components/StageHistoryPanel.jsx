// src/components/StageHistoryPanel.jsx
//
// Slide-in panel that lists saved stages and lets the user open one for review.

import React, { useEffect, useState, useCallback } from "react";
import {
  listSavedStages,
  loadSavedStage,
  deleteLocalStage,
  STAGE_HISTORY_LIMIT,
} from "../lib/stageHistory.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatKm(meters) {
  if (!Number.isFinite(Number(meters))) return null;
  const km = Number(meters) / 1000;
  return km >= 10 ? `${km.toFixed(1)} km` : `${km.toFixed(2)} km`;
}

function stageSummary(meta) {
  const parts = [];
  if (meta?.tripName) parts.push(meta.tripName);
  if (meta?.stageName && meta.stageName !== meta.tripName)
    parts.push(meta.stageName);
  return parts.join(" · ") || "Unnamed stage";
}

function stageSubline(meta) {
  const parts = [];
  if (meta?.dayNumber != null) parts.push(`Day ${meta.dayNumber}`);
  if (meta?.routeNumber != null) parts.push(`Route ${meta.routeNumber}`);
  if (meta?.stageNumber != null) parts.push(`Stage ${meta.stageNumber}`);
  return parts.join(" · ");
}

// ── Row ───────────────────────────────────────────────────────────────────────

function StageRow({ entry, onOpen, onDelete, loading, deleting }) {
  const { meta, savedAt } = entry;

  const distLabel = formatKm(meta?.totalDistanceM ?? null);
  const wpCount = meta?.waypointCount ?? null;
  const busy = loading || deleting;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
      {/* Date column */}
      <div className="shrink-0 w-16 text-center">
        <div className="text-xs font-semibold text-gray-700 leading-tight">
          {formatDate(savedAt)}
        </div>
        <div className="text-[10px] text-gray-400 leading-tight">
          {formatTime(savedAt)}
        </div>
      </div>

      {/* Info column */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">
          {stageSummary(meta)}
        </div>
        <div className="flex flex-wrap gap-x-2 text-[11px] text-gray-400 mt-0.5">
          {stageSubline(meta) && <span>{stageSubline(meta)}</span>}
          {distLabel && <span>{distLabel}</span>}
          {wpCount != null && (
            <span>
              {wpCount} wp{wpCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Open button */}
      <button
        type="button"
        onClick={() => onOpen(entry)}
        disabled={busy}
        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-300 text-blue-600 bg-white hover:bg-blue-50 disabled:opacity-40 transition-colors"
      >
        {loading ? "Loading…" : "Open"}
      </button>

      {/* Delete-from-device button. Removes only the local copy; any
          Supabase backup persists and the stage will still appear in
          History next time the list loads (served from the cloud).
          Use case: free up iPad localStorage during a multi-day survey
          once stages are confirmed synced. */}
      <button
        type="button"
        onClick={() => onDelete(entry)}
        disabled={busy}
        title="Remove this stage from the device (cloud copy is kept)"
        aria-label="Remove from device"
        className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
          />
        </svg>
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function StageHistoryPanel({ userId, owner, onOpenStage, onClose }) {
  const [entries, setEntries] = useState(null); // null = loading
  const [loadingId, setLoadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  // Bump to force a list reload after a delete.
  const [reloadNonce, setReloadNonce] = useState(0);

  // Load list on mount, and again after any delete.
  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);

    listSavedStages(userId, owner)
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("StageHistoryPanel: list failed", err);
          setError("Could not load stage history.");
          setEntries([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId, owner, reloadNonce]);

  const handleOpen = useCallback(
    async (entry) => {
      setLoadingId(entry.localId);
      try {
        const stage = await loadSavedStage(userId, owner, entry);
        if (stage) {
          onOpenStage(stage);
        } else {
          setError("Could not load that stage — it may have been deleted.");
        }
      } catch (err) {
        console.error("StageHistoryPanel: load failed", err);
        setError("Failed to open stage.");
      } finally {
        setLoadingId(null);
      }
    },
    [userId, owner, onOpenStage],
  );

  const handleDelete = useCallback(
    (entry) => {
      // The delete only removes the local copy. If the stage was synced
      // to Supabase it will continue to appear in History (sourced from
      // the cloud on next list load). For a "local"-source entry we
      // can't tell whether a cloud backup exists, so we warn more
      // strongly.
      const isLocalOnly = entry.source === "local";
      const name = stageSummary(entry.meta);
      const confirmMsg = isLocalOnly
        ? `Remove "${name}" from this device?\n\nThis stage has not been confirmed as synced to the cloud — if there is no cloud copy, the data will be lost permanently.`
        : `Remove "${name}" from this device?\n\nThe cloud copy will be kept and the stage will still appear in History.`;

      if (!window.confirm(confirmMsg)) return;

      setDeletingId(entry.localId);
      try {
        deleteLocalStage(owner, entry.localId);
        setReloadNonce((n) => n + 1);
      } catch (err) {
        console.error("StageHistoryPanel: delete failed", err);
        setError("Failed to remove stage from device.");
      } finally {
        setDeletingId(null);
      }
    },
    [owner],
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          {/* Clock icon */}
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">Stage History</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
          aria-label="Close history"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-xs border-b border-red-100">
          {error}
        </div>
      )}

      {/* Body */}
      <div className="max-h-72 overflow-y-auto">
        {entries === null && (
          <div className="px-4 py-6 text-center text-sm text-gray-400">
            Loading…
          </div>
        )}

        {entries !== null && entries.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-400">
            No saved stages yet. Complete a stage to see it here.
          </div>
        )}

        {entries !== null &&
          entries.length > 0 &&
          entries.map((entry) => (
            <StageRow
              key={entry.localId}
              entry={entry}
              onOpen={handleOpen}
              onDelete={handleDelete}
              loading={loadingId === entry.localId}
              deleting={deletingId === entry.localId}
            />
          ))}
      </div>

      {entries !== null && entries.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-400">
          {entries.length >= STAGE_HISTORY_LIMIT
            ? `Showing the ${STAGE_HISTORY_LIMIT} most recent stages — older stages are saved but not listed here`
            : `Showing ${entries.length} stage${entries.length === 1 ? "" : "s"}`}
        </div>
      )}
    </div>
  );
}
