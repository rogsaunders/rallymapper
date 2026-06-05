// src/components/roadbook/RoadbookRow.jsx
//
// One row of the scrolling roadbook. Shared between Drive Mode and
// Review Mode.
//
// Highlight modes (mutually exclusive in practice; selected wins if
// both happen to be set):
//   • position="current"   — Drive Mode's "you are here" amber band.
//   • position="above"     — Drive Mode's faded already-passed style.
//   • selected={true}      — Review Mode's "you tapped this" yellow band.
//
// Edit-in-place (Review Mode):
//   When `editable={true}` the notes are always shown as an inline
//   textarea — the organiser can type directly without first tapping
//   anything. Auto-saves on blur if the text changed. Tab moves focus
//   to the next row's textarea (Excel-style for fast batch edits).
//   Clicking anywhere on the row that isn't the textarea or a button
//   still calls onTap (which flies the map to the row).
//
//   For the heavier icon-change flow, the ✎ Edit button on the
//   selected row still opens the full inline form (textarea + icon
//   picker + Save/Cancel) — the inline textarea is for quick note
//   tweaks, the ✎ form is for switching icons or making bigger edits.
//
//   Drive Mode never passes editable so its row stays a single tap-
//   target button as before.
//
// Save / cancel callbacks:
//   • onTap(row)            row click (also fires on textarea focus).
//   • onEditStart(row)      ✎ button tapped (full inline form).
//   • onSave(row, patch)    commit. patch = { poi, iconId, type }.
//                           For inline note auto-save, only poi
//                           changes — iconId/type echo the row's
//                           current values.
//   • onCancel()            ✗ Cancel on the full inline form / ESC.
//   • onTabNext()           Tab from the inline textarea — caller is
//                           expected to focus the next row's
//                           textarea.

import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { tulipFor } from "./tulipAdapter";
import { ICON_DEFS, ICON_BY_ID } from "../../icons/iconRegistry";

function fmtKmFromKm(km) {
  if (km == null || !Number.isFinite(Number(km))) return "—";
  return Number(km).toFixed(2);
}

function fmtCap(bearing) {
  if (bearing == null || !Number.isFinite(Number(bearing))) return "—";
  const b = ((Number(bearing) % 360) + 360) % 360;
  return `${Math.round(b)}°`;
}

// SVG icons used by the edit-affordance buttons. Kept inline to match
// the rest of the codebase's no-icon-library convention.
function PencilIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

const RoadbookRow = forwardRef(function RoadbookRow(
  {
    row,
    position,
    selected = false,
    editable = false,
    editing = false,
    onTap,
    onEditStart,
    onSave,
    onCancel,
    onTabNext,
  },
  ref,
) {
  const tulipSvg = useMemo(() => tulipFor(row, { size: 96 }), [row]);

  const isCurrent = position === "current";

  const containerCls = selected
    ? "bg-yellow-50 border-l-4 border-yellow-500 pl-3"
    : isCurrent
      ? "bg-amber-50 border-l-4 border-amber-500 pl-3"
      : position === "above"
        ? "opacity-60"
        : "";

  // ── Edit-mode form state ──────────────────────────────────────────
  // Local draft so the textarea/select are responsive without each
  // keystroke round-tripping through the parent. The parent's onSave
  // receives the final patch when the user commits.
  const [draftPoi, setDraftPoi] = useState(row.notes || "");
  const [draftIconId, setDraftIconId] = useState(row.icon || "");
  // Inline-notes auto-save: a separate draft so the inline textarea
  // (read-mode-when-editable) doesn't fight with the full-edit-mode
  // textarea above. The inline draft tracks row.notes when not focused
  // so external changes flow in.
  const [inlineDraft, setInlineDraft] = useState(row.notes || "");
  const inlineFocused = useRef(false);
  useEffect(() => {
    if (!inlineFocused.current) setInlineDraft(row.notes || "");
  }, [row.notes]);

  useEffect(() => {
    if (editing) {
      setDraftPoi(row.notes || "");
      setDraftIconId(row.icon || "");
    }
  }, [editing, row.notes, row.icon]);

  // ESC cancels while editing.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing, onCancel]);

  // Auto-save the inline notes on blur if the text changed.
  const commitInlineIfChanged = () => {
    inlineFocused.current = false;
    const trimmed = inlineDraft.trim();
    const current = (row.notes || "").trim();
    if (trimmed === current) return;
    const iconDef = row.icon ? ICON_BY_ID[row.icon] : null;
    const type = iconDef?.category?.toLowerCase() || row.type || "note";
    onSave?.(row, {
      poi: trimmed,
      iconId: row.icon || null,
      type,
    });
  };

  // ── FULL EDIT MODE (the ✎ Edit button path) ───────────────────────
  if (editable && editing) {
    const commit = () => {
      const trimmed = draftPoi.trim();
      const iconDef = draftIconId ? ICON_BY_ID[draftIconId] : null;
      const type = iconDef?.category?.toLowerCase() || row.type || "note";
      onSave?.(row, {
        poi: trimmed,
        iconId: draftIconId || null,
        type,
      });
    };

    return (
      <div
        ref={ref}
        className={`flex items-start gap-3 py-3 border-b border-gray-100 ${containerCls}`}
      >
        <div className="text-xs font-semibold text-gray-500 w-10 pt-1 text-right tabular-nums shrink-0">
          {row.index ?? "—"}
        </div>

        <div
          className="shrink-0 w-24 h-24 flex items-center justify-center bg-white rounded border border-gray-200"
          dangerouslySetInnerHTML={{ __html: tulipSvg }}
          aria-hidden="true"
        />

        <div className="flex-1 min-w-0 space-y-2">
          <textarea
            value={draftPoi}
            onChange={(e) => setDraftPoi(e.target.value)}
            placeholder="Note (e.g. Sharp left after crest)"
            className="w-full px-2 py-1 text-sm rounded border border-gray-300 bg-white focus:outline-none focus:border-yellow-500"
            rows={2}
            autoFocus
            onKeyDown={(e) => {
              // ⌘/Ctrl+Enter commits — matches macOS conventions for
              // multiline inputs.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
              }
            }}
          />
          <select
            value={draftIconId}
            onChange={(e) => setDraftIconId(e.target.value)}
            className="w-full px-2 py-1 text-sm rounded border border-gray-300 bg-white"
            aria-label="Icon"
          >
            <option value="">— No icon —</option>
            {ICON_DEFS.map((def) => (
              <option key={def.id} value={def.id}>
                {def.category}: {def.label || def.id}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={commit}
              className="px-3 py-1 text-xs font-semibold rounded bg-[#588233] text-white hover:bg-[#476a29]"
            >
              ✓ Save
            </button>
            <button
              type="button"
              onClick={() => onCancel?.()}
              className="px-3 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              ✗ Cancel
            </button>
            <span className="text-[10px] text-gray-400 ml-auto">
              ⌘⏎ to save, Esc to cancel
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── READ MODE — Drive Mode (editable=false) ───────────────────────
  // A single tap-target button. Unchanged from the original design.
  if (!editable) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={() => onTap?.(row)}
        className={`block w-full text-left flex items-start gap-3 py-3 border-b border-gray-100 hover:bg-gray-50 ${containerCls}`}
      >
        <div className="text-xs font-semibold text-gray-500 w-10 pt-1 text-right tabular-nums">
          {row.index ?? "—"}
        </div>

        <div
          className="shrink-0 w-24 h-24 flex items-center justify-center bg-white rounded border border-gray-200"
          dangerouslySetInnerHTML={{ __html: tulipSvg }}
          aria-hidden="true"
        />

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 break-words">
            {row.notes || row.eventType || "—"}
          </div>
          {row.icon && (
            <div className="text-[11px] mt-0.5 inline-block px-2 py-0.5 rounded-full bg-gray-100 border text-gray-700">
              {row.icon}
            </div>
          )}
        </div>

        <div className="text-right text-xs text-gray-600 whitespace-nowrap tabular-nums">
          <div className="font-semibold text-gray-900">
            {fmtKmFromKm(row.kmPartial)} km
          </div>
          <div>tot {fmtKmFromKm(row.kmTotal)} km</div>
          <div className="mt-1">CAP {fmtCap(row.bearingOut)}</div>
        </div>
      </button>
    );
  }

  // ── READ MODE — Review Mode (editable=true, not editing) ──────────
  // Notes are an inline textarea. Clicking anywhere else on the row
  // still selects (flies the map to this row). We can't use a <button>
  // wrapper because it would swallow the textarea's interactions, so
  // it's a <div> with a click handler that ignores clicks landing on
  // form controls.
  const handleRowClick = (e) => {
    if (e.target.closest("textarea, button, a, input, select")) return;
    onTap?.(row);
  };

  return (
    <div
      ref={ref}
      onClick={handleRowClick}
      className={`flex items-start gap-3 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${containerCls}`}
    >
      <div className="text-xs font-semibold text-gray-500 w-10 pt-1 text-right tabular-nums shrink-0">
        {row.index ?? "—"}
      </div>

      <div
        className="shrink-0 w-24 h-24 flex items-center justify-center bg-white rounded border border-gray-200"
        dangerouslySetInnerHTML={{ __html: tulipSvg }}
        aria-hidden="true"
      />

      <div className="flex-1 min-w-0">
        <textarea
          value={inlineDraft}
          onChange={(e) => setInlineDraft(e.target.value)}
          onFocus={() => {
            inlineFocused.current = true;
            onTap?.(row);
          }}
          onBlur={commitInlineIfChanged}
          onKeyDown={(e) => {
            if (e.key === "Tab" && !e.shiftKey) {
              e.preventDefault();
              commitInlineIfChanged();
              onTabNext?.();
            }
            // ⌘/Ctrl+Enter also commits without changing focus order.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.blur(); // triggers commitInlineIfChanged
            }
          }}
          placeholder="Add a note…"
          rows={2}
          className="w-full px-2 py-1 text-sm rounded border border-gray-200 bg-white resize-y focus:outline-none focus:border-yellow-500"
        />
        {row.icon && (
          <div className="text-[11px] mt-1 inline-block px-2 py-0.5 rounded-full bg-gray-100 border text-gray-700">
            {row.icon}
          </div>
        )}
      </div>

      <div className="text-right text-xs text-gray-600 whitespace-nowrap tabular-nums">
        <div className="font-semibold text-gray-900">
          {fmtKmFromKm(row.kmPartial)} km
        </div>
        <div>tot {fmtKmFromKm(row.kmTotal)} km</div>
        <div className="mt-1">CAP {fmtCap(row.bearingOut)}</div>
        {selected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditStart?.(row);
            }}
            className="mt-1 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-white border border-yellow-400 text-yellow-700 hover:bg-yellow-50"
            aria-label="Edit row (full form with icon picker)"
            title="Edit icon + note (full form)"
          >
            <PencilIcon /> Edit
          </button>
        )}
      </div>
    </div>
  );
});

export default RoadbookRow;
