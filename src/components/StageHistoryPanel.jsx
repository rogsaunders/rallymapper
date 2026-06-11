// src/components/StageHistoryPanel.jsx
//
// Slide-in panel that lists saved stages and lets the user open one for review.

import React, { useEffect, useState, useCallback } from "react";
import {
  listSavedStages,
  loadSavedStage,
  deleteStagePermanently,
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

function StageRow({
  entry,
  onOpen,
  onDelete,
  loading,
  deleting,
  selected,
  onToggleSelect,
  selectionLocked,
}) {
  const { meta, savedAt } = entry;

  const distLabel = formatKm(meta?.totalDistanceM ?? null);
  const wpCount = meta?.waypointCount ?? null;
  const busy = loading || deleting || selectionLocked;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 transition-colors ${
        selected ? "bg-blue-50" : "hover:bg-gray-50"
      }`}
    >
      {/* Selection checkbox — leftmost. Disabled mid-bulk-delete so
          the user can't desync the in-flight set. */}
      <label
        className="shrink-0 flex items-center cursor-pointer"
        title="Select for bulk delete"
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(entry.localId)}
          disabled={selectionLocked}
          className="w-4 h-4 accent-[#588233] cursor-pointer disabled:cursor-not-allowed"
          aria-label={`Select stage ${stageSummary(meta)}`}
        />
      </label>

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

  // ── Multi-select ──────────────────────────────────────────────────
  // Set of localIds the user has ticked. Cleared whenever the list
  // reloads so a successful bulk delete leaves no orphaned selection.
  // Using a Set keeps add/remove/has O(1) without filtering arrays on
  // every render.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Locks the per-row checkboxes while a bulk delete is in flight so
  // the user can't desync the in-flight set by toggling mid-loop.
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Reset selection whenever the list refreshes (after a delete, or
  // when switching users). Prevents an id that just got deleted from
  // staying ticked.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [reloadNonce, userId, owner]);

  const toggleSelect = useCallback((localId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(localId)) next.delete(localId);
      else next.add(localId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Select all currently-visible entries. We use the list shown on
  // screen rather than re-running listSavedStages so the count
  // matches what the user can see.
  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set((entries || []).map((e) => e.localId)));
  }, [entries]);

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

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (bulkDeleting) return;

    const targets = (entries || []).filter((e) => selectedIds.has(e.localId));
    if (targets.length === 0) return;

    const cloudWarning = userId
      ? " This removes them from this device AND from the cloud."
      : " This removes them from this device.";
    const confirmMsg = `Permanently delete ${targets.length} stage${
      targets.length === 1 ? "" : "s"
    }?\n\n${cloudWarning} The action cannot be undone.`;

    if (!window.confirm(confirmMsg)) return;

    setBulkDeleting(true);
    setError(null);

    // Walk through the selection sequentially. Parallel deletes would
    // be marginally faster but make error reporting tangled — we want
    // to know which ones failed and with what error. Sequential keeps
    // the failure path readable and is plenty fast for the realistic
    // worst case (a few dozen stages).
    const failures = [];
    for (const entry of targets) {
      try {
        const result = await deleteStagePermanently({
          userId,
          owner,
          localId: entry.localId,
          source: entry.source,
        });
        if (!result.ok) {
          failures.push({
            name: stageSummary(entry.meta),
            reason: result.error?.message || "Unknown error",
          });
        }
      } catch (err) {
        failures.push({
          name: stageSummary(entry.meta),
          reason: err?.message || "Unexpected error",
        });
      }
    }

    setBulkDeleting(false);

    if (failures.length > 0) {
      // Surface a compact summary. Cap at 3 explicit names to keep
      // the banner short; remainder rolled into "+N more".
      const shown = failures.slice(0, 3).map((f) => f.name).join(", ");
      const overflow = failures.length > 3 ? ` (+${failures.length - 3} more)` : "";
      const offlineHint = !navigator.onLine
        ? " You appear to be offline — reconnect and retry."
        : "";
      const succeeded = targets.length - failures.length;
      setError(
        succeeded > 0
          ? `${succeeded} stage${succeeded === 1 ? "" : "s"} deleted; ${failures.length} failed: ${shown}${overflow}.${offlineHint}`
          : `Failed to delete ${failures.length} stage${failures.length === 1 ? "" : "s"}: ${shown}${overflow}.${offlineHint}`,
      );
    }

    // Always reload — the cloud may have changed even if some local
    // deletes failed, and the surviving entries should re-appear.
    setReloadNonce((n) => n + 1);
  }, [bulkDeleting, entries, owner, selectedIds, userId]);

  const handleDelete = useCallback(
    async (entry) => {
      const name = stageSummary(entry.meta);
      const confirmMsg = userId
        ? `Permanently delete "${name}"?\n\nThis removes the stage from this device AND from the cloud. The action cannot be undone.`
        : `Permanently delete "${name}"?\n\nThis removes the stage from this device. The action cannot be undone.`;

      if (!window.confirm(confirmMsg)) return;

      setDeletingId(entry.localId);
      setError(null);
      try {
        const result = await deleteStagePermanently({
          userId,
          owner,
          localId: entry.localId,
          source: entry.source,
        });
        if (!result.ok) {
          // Cloud delete failed — surface the actual reason. The local
          // copy is intentionally left intact so the user sees the
          // entry stayed in the list (no half-deleted state).
          const msg = result.error?.message || "Failed to delete stage.";
          setError(
            navigator.onLine
              ? `Failed to delete from cloud: ${msg}`
              : "You appear to be offline. Reconnect and try again to permanently delete.",
          );
          return;
        }
        setReloadNonce((n) => n + 1);
      } catch (err) {
        console.error("StageHistoryPanel: delete failed", err);
        setError("Failed to delete stage.");
      } finally {
        setDeletingId(null);
      }
    },
    [userId, owner],
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

      {/* Multi-select toolbar — appears whenever there are entries to
          act on. Left side: master Select-all toggle (tri-state via
          ref attribute when partial). Right side: bulk action +
          Clear, only when at least one row is selected. */}
      {entries !== null && entries.length > 0 && (() => {
        const total = entries.length;
        const selectedCount = selectedIds.size;
        const allSelected = selectedCount > 0 && selectedCount === total;
        const someSelected = selectedCount > 0 && !allSelected;
        const setIndeterminate = (el) => {
          if (el) el.indeterminate = someSelected;
        };
        return (
          <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 bg-white text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                ref={setIndeterminate}
                checked={allSelected}
                onChange={() => {
                  if (allSelected || someSelected) clearSelection();
                  else selectAllVisible();
                }}
                disabled={bulkDeleting}
                className="w-4 h-4 accent-[#588233] cursor-pointer disabled:cursor-not-allowed"
                aria-label="Select all stages"
              />
              <span className="text-gray-600">
                {selectedCount > 0
                  ? `${selectedCount} of ${total} selected`
                  : "Select all"}
              </span>
            </label>

            {selectedCount > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={bulkDeleting}
                  className="px-2 py-1 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="px-3 py-1 rounded-md font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                >
                  {bulkDeleting ? (
                    "Deleting…"
                  ) : (
                    <>
                      <svg
                        className="w-3.5 h-3.5"
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
                      Delete {selectedCount}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        );
      })()}

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
              selected={selectedIds.has(entry.localId)}
              onToggleSelect={toggleSelect}
              selectionLocked={bulkDeleting}
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
