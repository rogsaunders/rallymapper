// src/travel/hooks/useVoiceReadout.js
//
// Announce row-change events using the Web Speech API's
// speechSynthesis. Fires on every currentIndex change while enabled.
//
// Format:  "<icon/event words>. <user notes>. then <km> to the next."
//   - icon/event words come from a small dictionary mapping the row's
//     icon ID or eventType to a plain spoken phrase ("left", "keep
//     left", "T-junction right", "danger two", etc.)
//   - user notes are appended only if they add information beyond the
//     icon word (avoids "left. left.")
//   - distance-to-next is the next row's kmPartial (the navigator's
//     standard lead-in distance)
//
// iOS Safari quirk: the very first speechSynthesis.speak() call after
// page load must originate from a user gesture. If a row auto-advances
// before the user has interacted, that first announcement is silent.
// Workaround: when the user toggles the voice setting ON, we speak a
// short "voice ready" priming utterance — that activates the synth
// for subsequent calls without requiring a tap on the row.
//
// Returns:
//   { supported, speak(text), stop() }
//
//   - supported: false in browsers without speechSynthesis (rare)
//   - speak(text): manual trigger, used by the settings "Test" button
//                  and the priming utterance
//   - stop(): cancel any pending utterance (called when disabled and
//             on unmount)

import { useEffect, useRef } from "react";

// Spoken phrases for derived eventType values (from the roadbook
// engine — see src/roadbook/roadbookTypes.js RoadbookEventType).
const EVENT_TYPE_WORDS = {
  straight: "straight",
  bear_left: "bear left",
  bear_right: "bear right",
  left_90: "left",
  right_90: "right",
  sharp_left: "sharp left",
  sharp_right: "sharp right",
  hairpin_left: "hairpin left",
  hairpin_right: "hairpin right",
  fork_left: "fork left",
  fork_right: "fork right",
  tjunction_left: "T-junction left",
  tjunction_right: "T-junction right",
  crossroad: "crossroad",
  gate: "gate",
  water: "water crossing",
  crest: "crest",
  dip: "dip",
  control: "control",
  danger_1: "danger one",
  danger_2: "danger two",
  danger_3: "danger three",
  note: "note",
  start: "start",
  finish: "finish",
};

// Spoken phrases for manual-waypoint icon IDs (from src/icons/
// iconManifest.json). Keep in sync as new icons are added.
const ICON_WORDS = {
  // Nav
  left: "left",
  right: "right",
  keep_l: "keep left",
  keep_r: "keep right",
  straight: "straight",
  gate: "gate",
  cattle_gate: "cattle gate",
  railroad: "railroad",
  give_way: "give way",
  caution: "caution",
  // Control
  start: "start",
  finish: "finish",
  stop: "stop",
  checkpoint: "checkpoint",
  time: "time control",
  fuel: "fuel",
  service: "service",
  // Hazard
  danger_1: "danger one",
  danger_2: "danger two",
  danger_3: "danger three",
  // Terrain
  bump: "bump",
  bumps: "bumps",
  dip: "dip",
  twisty: "twisty",
  ruts: "ruts",
  washout: "washout",
  up_hill: "uphill",
  down_hill: "downhill",
  // Note
  note: "note",
};

function wordsFor(row) {
  if (!row) return "next";
  if (row.icon && ICON_WORDS[row.icon]) return ICON_WORDS[row.icon];
  if (row.eventType && EVENT_TYPE_WORDS[row.eventType])
    return EVENT_TYPE_WORDS[row.eventType];
  // Fallback: humanise an unknown id (drop underscores)
  if (row.icon) return row.icon.replace(/_/g, " ");
  if (row.eventType) return row.eventType.replace(/_/g, " ");
  return "next";
}

function composeAnnouncement(row, nextRow) {
  if (!row) return "";
  const headline = wordsFor(row);
  const parts = [headline];

  const notes = (row.notes || "").trim();
  if (notes && notes.toLowerCase() !== headline.toLowerCase()) {
    // Cap at 100 chars to keep the utterance bounded
    parts.push(notes.length > 100 ? notes.slice(0, 100) + "…" : notes);
  }

  if (nextRow && Number.isFinite(Number(nextRow.kmPartial))) {
    const km = Number(nextRow.kmPartial);
    if (km >= 0.1) {
      parts.push(`then ${km.toFixed(1)} to the next`);
    }
  }

  return parts.join(". ");
}

export function useVoiceReadout({ enabled, currentIndex, rows }) {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const synthRef = useRef(supported ? window.speechSynthesis : null);
  const lastSpokenIdxRef = useRef(null);

  // Announce on currentIndex change (when enabled and a real row)
  useEffect(() => {
    if (!enabled || !supported) return;
    if (currentIndex == null) return;
    if (currentIndex === lastSpokenIdxRef.current) return;

    const row = rows?.[currentIndex];
    if (!row) return;
    const nextRow = rows?.[currentIndex + 1] || null;
    const text = composeAnnouncement(row, nextRow);
    if (!text) return;

    try {
      synthRef.current.cancel(); // drop any pending utterance
      const u = new window.SpeechSynthesisUtterance(text);
      u.lang = "en-AU";
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      synthRef.current.speak(u);
      lastSpokenIdxRef.current = currentIndex;
    } catch (e) {
      console.warn("useVoiceReadout: speak failed", e);
    }
  }, [enabled, supported, currentIndex, rows]);

  // Stop any pending utterance when disabled / on unmount
  useEffect(() => {
    if (!enabled && supported) {
      try {
        synthRef.current?.cancel();
      } catch (_) {
        /* ignore */
      }
    }
    return () => {
      try {
        synthRef.current?.cancel();
      } catch (_) {
        /* ignore */
      }
    };
  }, [enabled, supported]);

  // Manual speak — used by the SettingsPanel "Test" button and by
  // the priming utterance when the user first enables voice (iOS
  // user-gesture activation).
  const speak = (text) => {
    if (!supported || !text) return;
    try {
      synthRef.current.cancel();
      const u = new window.SpeechSynthesisUtterance(text);
      u.lang = "en-AU";
      synthRef.current.speak(u);
    } catch (e) {
      console.warn("useVoiceReadout: manual speak failed", e);
    }
  };

  const stop = () => {
    if (!supported) return;
    try {
      synthRef.current?.cancel();
    } catch (_) {
      /* ignore */
    }
  };

  return { supported, speak, stop };
}
