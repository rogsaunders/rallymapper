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
// Edit-in-place (Review Mode, PR C):
//   • editable={true}  enables the ✎ affordance on the selected row.
//     When the row is both `selected` AND `editing`, it swaps from
//     a single-tap button to a small inline form: a <textarea> for
//     the note text and a <select> for the icon, with ✓ Save / ✗
//     Cancel buttons.
//   • onEditStart(row)    fired when the ✎ is tapped.
//   • onSave(row, patch)  fired when ✓ is tapped; patch contains the
//                         editable fields ({poi, iconId, type}).
//   • onCancel()          fired when ✗ is tapped or ESC pressed.
//
// Drive Mode never passes editable so its row stays unchanged.
//
// (Originally lived in src/drive/components/ — moved here when the
// roadbook list was lifted to a shared location so /review could
// reuse it without depending on /drive.)

import React, { forwardRef, useEffect, useMemo, useState } from "react";
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

  // ── EDIT MODE ─────────────────────────────────────────────────────
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

  // ── READ MODE ─────────────────────────────────────────────────────
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
        {editable && selected && (
          <button
            type="button"
            onClick={(e) => {
              // Don't bubble — would re-fire the row's onTap (no-op
              // since we're already selected, but cleaner to stop it).
              e.stopPropagation();
              onEditStart?.(row);
            }}
            className="mt-1 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-white border border-yellow-400 text-yellow-700 hover:bg-yellow-50"
            aria-label="Edit row"
            title="Edit note + icon"
          >
            <PencilIcon /> Edit
          </button>
        )}
      </div>
    </button>
  );
});

export default RoadbookRow;
