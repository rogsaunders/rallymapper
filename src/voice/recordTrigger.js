// src/voice/recordTrigger.js
//
// Phase B — external trigger for the 🎙 Record button.
//
// Listens for events that external hardware (Bluetooth headsets, foot
// pedals, presenter clickers, Bluetooth keyboards) can send, and fires
// a single onTrigger callback when any of them request a record
// button press.
//
// Two channels:
//
//   1. MediaSession API — captures the standard media-key actions that
//      Bluetooth audio devices send: play, pause, nexttrack,
//      previoustrack, togglemicrophone. Works for many BT headsets
//      out of the box; some require a silent audio loop to be playing
//      (not implemented here yet — added if field testing shows it's
//      needed).
//
//   2. KeyboardEvent — captures key presses from foot pedals,
//      presenter clickers, and Bluetooth keyboards, which typically
//      send standard keyboard events.
//
// Tested-safe key set: MediaPlayPause, MediaTrackNext,
// MediaTrackPrevious, PageDown, PageUp, F8 are always intercepted.
// Space and Enter are intercepted only when no UI element has focus
// (avoids interfering with button activation and form input).

const ALWAYS_KEYS = new Set([
  "MediaPlayPause",
  "MediaTrackNext",
  "MediaTrackPrevious",
  "MediaPlay",
  "MediaPause",
  "MediaStop",
  "PageDown",
  "PageUp",
  "F8",
]);

const SAFE_KEYS = new Set([" ", "Enter"]);

const SKIP_FOCUS_TAGS = new Set([
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "BUTTON",
  "A",
]);

function targetWantsKeys(target) {
  if (!target) return false;
  if (SKIP_FOCUS_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Create an external-trigger listener.
 *
 * @param {Object}   opts
 * @param {Function} opts.onTrigger — called when any recognised
 *                                    external event fires
 * @returns {{ start, stop, isActive }}
 */
export function createRecordTrigger({ onTrigger }) {
  let active = false;
  let lastFireMs = 0;

  // Debounce — some hardware sends two events per press (down + up,
  // or duplicated through both MediaSession + keyboard channels).
  // 250 ms is faster than any realistic double-tap.
  const DEBOUNCE_MS = 250;

  function fire(_source) {
    const now = Date.now();
    if (now - lastFireMs < DEBOUNCE_MS) return;
    lastFireMs = now;
    try {
      onTrigger?.();
    } catch (e) {
      console.warn("recordTrigger onTrigger threw:", e);
    }
  }

  function keyboardHandler(e) {
    if (!active) return;
    if (e.repeat) return; // ignore key auto-repeat

    if (ALWAYS_KEYS.has(e.code) || ALWAYS_KEYS.has(e.key)) {
      e.preventDefault();
      fire("keyboard:" + (e.code || e.key));
      return;
    }

    if (SAFE_KEYS.has(e.key) && !targetWantsKeys(e.target)) {
      e.preventDefault();
      fire("keyboard:" + e.key);
      return;
    }
  }

  function mediaSessionAction(name) {
    return () => fire("mediasession:" + name);
  }

  return {
    start() {
      if (active) return;
      active = true;
      lastFireMs = 0;

      document.addEventListener("keydown", keyboardHandler);

      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        const ms = navigator.mediaSession;
        const handlers = [
          "play",
          "pause",
          "nexttrack",
          "previoustrack",
        ];
        for (const h of handlers) {
          try {
            ms.setActionHandler(h, mediaSessionAction(h));
          } catch (e) {
            console.warn(`MediaSession setActionHandler("${h}") failed:`, e);
          }
        }
        // togglemicrophone is the most semantically-correct action for
        // our use case but isn't supported in all browsers — wrap
        // separately so a failure here doesn't break the others.
        try {
          ms.setActionHandler("togglemicrophone", mediaSessionAction("togglemicrophone"));
        } catch (_) {
          // not supported in this browser; not fatal
        }
      }
    },

    stop() {
      if (!active) return;
      active = false;

      document.removeEventListener("keydown", keyboardHandler);

      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        const ms = navigator.mediaSession;
        const handlers = [
          "play",
          "pause",
          "nexttrack",
          "previoustrack",
          "togglemicrophone",
        ];
        for (const h of handlers) {
          try {
            ms.setActionHandler(h, null);
          } catch (_) {
            // ignore
          }
        }
      }
    },

    isActive() {
      return active;
    },
  };
}
