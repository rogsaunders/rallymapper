// src/voice/recordTrigger.js
//
// Phase B — external trigger for the 🎙 Record button.
//
// Listens for events that external hardware (Bluetooth headsets, foot
// pedals, presenter clickers, Bluetooth keyboards) can send, and fires
// a single onTrigger callback when any of them request a record
// button press.
//
// Three coordinated channels:
//
//   1. **MediaSession API** — captures the standard media-key actions
//      that Bluetooth audio devices send (play, pause, nexttrack,
//      previoustrack, togglemicrophone). Requires the page to "own"
//      the active media session — see point 3.
//
//   2. **KeyboardEvent** — captures key presses from foot pedals,
//      presenter clickers, and Bluetooth keyboards (which typically
//      send standard keyboard events). Always-intercept set:
//      MediaPlayPause, MediaTrackNext, MediaTrackPrevious, MediaPlay,
//      MediaPause, MediaStop, PageDown, PageUp, F8. Focus-aware set:
//      Space, Enter (only fire when no input/button has focus).
//
//   3. **Silent audio loop** — iOS routes media-key events to whichever
//      app currently "owns" the now-playing media session. Without
//      this loop, Spotify / Apple Music / any other audio app gets
//      our button presses instead. Looping a tiny silent WAV at
//      volume 0 makes iOS treat RouteMapper as the active media
//      source, so Bluetooth media buttons are routed here while a
//      stage is recording. The loop pauses automatically when the
//      page is backgrounded or the stage ends.
//
// A 250 ms debounce coalesces duplicate events (some hardware fires
// both a MediaSession event and a keyboard event for the same press).

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

// ── Silent WAV generator ────────────────────────────────────────────
// Build a tiny (100 ms, 8 kHz, 8-bit mono PCM) silent WAV at runtime
// and expose it as a base64 data URL. Avoids shipping a separate asset
// file. Result is ~1.1 KB — looped, this satisfies iOS's "active media
// session" requirement without any audible output.

function buildSilentWavDataUrl() {
  const sampleRate = 8000;
  const durationS = 0.1;
  const numSamples = Math.floor(sampleRate * durationS);
  const dataSize = numSamples; // 8-bit mono → 1 byte per sample
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);

  // RIFF chunk
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true); // file size - 8
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate (8-bit mono = sampleRate)
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample

  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  // 0x80 is the midpoint for unsigned 8-bit PCM — silence.
  new Uint8Array(buf, 44, dataSize).fill(128);

  // ArrayBuffer → base64
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return "data:audio/wav;base64," + btoa(binary);
}

let _silentWavUrl = null;
function getSilentWavUrl() {
  if (!_silentWavUrl) _silentWavUrl = buildSilentWavDataUrl();
  return _silentWavUrl;
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
  let silentAudio = null;

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

  function startSilentLoop() {
    try {
      const audio = new Audio(getSilentWavUrl());
      audio.loop = true;
      audio.volume = 0;
      // iOS Safari requires audio.play() to be triggered by a user
      // gesture. The trigger.start() call chain originates from the
      // user tapping Start Stage, which qualifies. If iOS rejects
      // anyway (different browsers, edge cases), the Promise rejects
      // — we log and fall back gracefully to keyboard-only behaviour.
      audio.play().catch((e) => {
        console.warn(
          "recordTrigger silent loop: audio.play() rejected — Bluetooth media-key events may route to other apps:",
          e?.message || e,
        );
      });
      silentAudio = audio;
    } catch (e) {
      console.warn("recordTrigger silent loop setup failed:", e);
    }
  }

  function stopSilentLoop() {
    if (!silentAudio) return;
    try {
      silentAudio.pause();
      silentAudio.src = "";
      silentAudio.load(); // force release of the audio resource on iOS
    } catch (_) {
      // ignore
    }
    silentAudio = null;
  }

  function setMediaSessionMetadata(playing) {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    try {
      navigator.mediaSession.metadata = playing
        ? new window.MediaMetadata({
            title: "RouteMapper",
            artist: "Voice trigger ready",
            album: "Tap 🎙 Record or your Bluetooth button",
          })
        : null;
      navigator.mediaSession.playbackState = playing ? "playing" : "none";
    } catch (e) {
      console.warn("MediaSession metadata setup failed:", e);
    }
  }

  return {
    start() {
      if (active) return;
      active = true;
      lastFireMs = 0;

      document.addEventListener("keydown", keyboardHandler);

      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        const ms = navigator.mediaSession;
        const handlers = ["play", "pause", "nexttrack", "previoustrack"];
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
          ms.setActionHandler(
            "togglemicrophone",
            mediaSessionAction("togglemicrophone"),
          );
        } catch (_) {
          // not supported in this browser; not fatal
        }
      }

      // Claim the active media session so Bluetooth media-key presses
      // route to this page rather than to whatever else (Spotify etc.)
      // was previously the active media source.
      startSilentLoop();
      setMediaSessionMetadata(true);
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

      stopSilentLoop();
      setMediaSessionMetadata(false);
    },

    isActive() {
      return active;
    },
  };
}
