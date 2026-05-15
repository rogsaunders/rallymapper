// src/voice/wakeWordListener.js
//
// Continuously listens via the Web Speech API for a wake word (default: "tag").
// When detected, fires the onWake callback and stops listening.
// The caller is responsible for re-arming after the command cycle completes.
//
// Safari/WKWebView compatible — uses continuous mode with interim results
// so the wake word is caught quickly without waiting for a full sentence.

const DEFAULT_WAKE_WORD = "tag";

/**
 * Create a wake word listener.
 *
 * @param {Object} opts
 * @param {string}           [opts.wakeWord="tag"]  — the trigger word (case-insensitive)
 * @param {function(): void}  opts.onWake              — called when the wake word is detected
 * @param {function(): void} [opts.onListening]         — called when mic starts
 * @param {function(): void} [opts.onStopped]           — called when mic stops
 * @param {function(string): void} [opts.onError]       — called on error
 * @returns {{ start, stop, isListening }}
 */
export function createWakeWordListener(opts) {
  const {
    wakeWord = DEFAULT_WAKE_WORD,
    onWake,
    onListening,
    onStopped,
    onError,
  } = opts;

  const wakeWordLower = wakeWord.toLowerCase();
  let recognition = null;
  let active = false;
  let wakeDetected = false;

  function getSR() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function startListening() {
    const SR = getSR();
    if (!SR) {
      onError?.("Speech recognition not available in this browser.");
      return;
    }

    wakeDetected = false;

    const rec = new SR();
    rec.lang = "en-AU";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => {
      onListening?.();
    };

    rec.onresult = (event) => {
      if (wakeDetected) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = (event.results[i]?.[0]?.transcript || "").toLowerCase().trim();

        // Match the wake word as a standalone word in the transcript.
        // Word-boundary check avoids false-triggers from "tagged", "tagging",
        // "stagger", etc. that would otherwise match a substring search.
        const words = transcript.split(/\s+/);
        const matched = words.includes(wakeWordLower);

        if (matched) {
          wakeDetected = true;

          try {
            rec.stop();
          } catch {
            /* ignore */
          }

          onWake?.();
          return;
        }
      }
    };

    rec.onerror = (e) => {
      const msg = e?.error || e?.message || "Unknown error";
      if (msg === "no-speech") {
        return;
      }
      if (msg === "aborted") return;

      console.warn("Wake word listener error:", msg);
      onError?.(msg);
    };

    rec.onend = () => {
      onStopped?.();

      // If still active and we didn't detect the wake word, re-arm
      if (active && !wakeDetected) {
        setTimeout(() => {
          if (active && !wakeDetected) {
            startListening();
          }
        }, 300);
      }
    };

    recognition = rec;

    try {
      rec.start();
    } catch (e) {
      console.warn("Wake word start failed:", e);
      // Retry after a pause
      if (active) {
        setTimeout(() => {
          if (active) startListening();
        }, 500);
      }
    }
  }

  return {
    /** Begin listening for the wake word. */
    start() {
      if (active) return;
      active = true;
      wakeDetected = false;
      startListening();
    },

    /** Stop listening entirely. */
    stop() {
      active = false;
      wakeDetected = false;
      try {
        recognition?.stop();
      } catch {
        /* ignore */
      }
      recognition = null;
      onStopped?.();
    },

    /** Whether the listener is active (may be between re-arms). */
    get isActive() {
      return active;
    },
  };
}
