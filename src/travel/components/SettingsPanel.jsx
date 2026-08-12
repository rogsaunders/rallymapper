// src/travel/components/SettingsPanel.jsx
//
// Collapsible bottom-sheet-style overlay for Travel Mode settings.
//
// M3:
//   - Auto-advance on/off
//   - Trigger radius slider (5–100 m, default 30 m)
//   - Manual override duration (10–120 s, default 30 s)
// M4:
//   - Voice readout on/off + Test button

import React from "react";

export default function SettingsPanel({
  open,
  onClose,
  autoAdvanceEnabled,
  setAutoAdvanceEnabled,
  triggerRadiusM,
  setTriggerRadiusM,
  manualOverrideMs,
  setManualOverrideMs,
  voiceEnabled,
  setVoiceEnabled,
  voiceSupported,
  voiceTest,
  showDebug,
  setShowDebug,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-w-md w-full p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">Travel Mode settings</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        {/* Auto-advance toggle */}
        <div className="mb-5">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoAdvanceEnabled}
              onChange={(e) => setAutoAdvanceEnabled(e.target.checked)}
              className="w-5 h-5 accent-[#588233]"
            />
            <span className="font-medium text-gray-800">
              Auto-advance
            </span>
          </label>
          <p className="text-xs text-gray-500 mt-1 ml-8 leading-snug">
            Move to the next row automatically when you drive into its
            trigger zone. Turn off if you'd rather use ◀ ▶ manually.
          </p>
        </div>

        {/* Trigger radius slider */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-800">
              Trigger radius
            </label>
            <span className="text-sm text-gray-600 tabular-nums">
              {triggerRadiusM} m
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={triggerRadiusM}
            onChange={(e) => setTriggerRadiusM(Number(e.target.value))}
            className="w-full accent-[#588233]"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>5 m (tight)</span>
            <span>100 m (loose)</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1 leading-snug">
            How close you have to get to the next instruction's recorded
            GPS position before auto-advance fires.
          </p>
        </div>

        {/* Manual override duration */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-800">
              Manual override pause
            </label>
            <span className="text-sm text-gray-600 tabular-nums">
              {Math.round(manualOverrideMs / 1000)} s
            </span>
          </div>
          <input
            type="range"
            min={10000}
            max={120000}
            step={5000}
            value={manualOverrideMs}
            onChange={(e) => setManualOverrideMs(Number(e.target.value))}
            className="w-full accent-[#588233]"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>10 s</span>
            <span>2 min</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1 leading-snug">
            When you tap a row or ◀ ▶, auto-advance pauses for this
            long so it doesn't immediately re-advance you.
          </p>
        </div>

        {/* Voice readout (M4) */}
        <div className="mb-5 pt-4 border-t border-gray-200">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!voiceEnabled}
              disabled={!voiceSupported}
              onChange={(e) => setVoiceEnabled?.(e.target.checked)}
              className="w-5 h-5 accent-[#588233]"
            />
            <span className="font-medium text-gray-800">
              🔊 Voice readout
            </span>
          </label>
          <p className="text-xs text-gray-500 mt-1 ml-8 leading-snug">
            {voiceSupported
              ? "Announce the next turn as you reach each waypoint. Format: “Next, turn right, in 3.2 kilometres” — the upcoming instruction and how far to reach it."
              : "Not supported in this browser. Try Safari on iOS / iPadOS, or Chrome on desktop / Android."}
          </p>
          {voiceSupported && (
            <button
              type="button"
              onClick={voiceTest}
              className="mt-2 ml-8 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              🔊 Test voice
            </button>
          )}
        </div>

        {/* Diagnostics (debug HUD) */}
        <div className="mb-5 pt-4 border-t border-gray-200">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!showDebug}
              onChange={(e) => setShowDebug?.(e.target.checked)}
              className="w-5 h-5 accent-[#588233]"
            />
            <span className="font-medium text-gray-800">
              🛠 Show diagnostics
            </span>
          </label>
          <p className="text-xs text-gray-500 mt-1 ml-8 leading-snug">
            Overlay live GPS, track offset and auto-advance state while
            driving. For troubleshooting why the current row does or
            doesn't keep up — leave off for normal use.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-3 rounded-xl font-semibold text-white"
          style={{ backgroundColor: "#588233" }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
