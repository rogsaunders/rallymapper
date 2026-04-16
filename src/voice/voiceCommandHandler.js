// src/voice/voiceCommandHandler.js
//
// Hands-free voice command handler.
//
// Listens via the Web Speech API. The driver speaks a command
// (e.g. "hazard danger two — deep ruts ahead"). After a configurable silence
// timeout the command is parsed and a waypoint is automatically added.
//
// Two modes:
//   • continuous (default)  — re-arms for the next command automatically
//   • singleCommand: true   — stops after one command so the caller can
//                              re-arm a wake word listener
//
// Uses the browser Web Speech API (works in Safari / WKWebView on iPad).

import { parseVoiceCommand } from "./voiceCommandParser.js";

const DEFAULT_SILENCE_MS = 2500;

/**
 * Create a hands-free voice command session.
 *
 * @param {Object} opts
 * @param {function({ type, iconId, poi }): void} opts.onCommand  — called when a command is parsed & ready to commit
 * @param {function(): void}           opts.onListeningStart      — UI callback: mic is live
 * @param {function(): void}           opts.onListeningStop       — UI callback: mic stopped
 * @param {function(string): void}     opts.onInterim             — UI callback: interim transcript text
 * @param {function(string): void}     opts.onError               — UI callback: error message
 * @param {function(): void}           opts.onReady               — UI callback: ready for next command (after commit)
 * @param {function(): void}          [opts.onComplete]            — UI callback: command cycle finished (singleCommand mode)
 * @param {number}                    [opts.silenceMs=2500]        — ms of silence before auto-commit
 * @param {boolean}                   [opts.singleCommand=false]   — stop after one command instead of re-arming
 * @returns {{ start, stop, isActive }}
 */
export function createVoiceCommandHandler(opts) {
  const {
    onCommand,
    onListeningStart,
    onListeningStop,
    onInterim,
    onError,
    onReady,
    onComplete,
    silenceMs = DEFAULT_SILENCE_MS,
    singleCommand = false,
  } = opts;

  let recognition = null;
  let silenceTimer = null;
  let active = false;
  let accumulatedText = "";

  function getSR() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function clearSilenceTimer() {
    if (silenceTimer !== null) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function resetSilenceTimer() {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      // Silence exceeded — commit whatever we have
      commitAndFinish();
    }, silenceMs);
  }

  function commitAndFinish() {
    clearSilenceTimer();

    const text = accumulatedText.trim();
    accumulatedText = "";

    if (text) {
      const cmd = parseVoiceCommand(text);
      onCommand?.(cmd);
    }

    // Stop current recognition session
    try {
      recognition?.stop();
    } catch {
      // ignore
    }
  }

  function startListening() {
    const SR = getSR();
    if (!SR) {
      onError?.("Speech recognition not available in this browser.");
      return;
    }

    accumulatedText = "";

    const rec = new SR();
    rec.lang = "en-AU";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => {
      onListeningStart?.();
      resetSilenceTimer();
    };

    rec.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res?.[0]?.transcript || "";
        if (res.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (finalText.trim()) {
        accumulatedText += (accumulatedText ? " " : "") + finalText.trim();
        onInterim?.(accumulatedText);
        resetSilenceTimer();
      } else if (interimText.trim()) {
        onInterim?.(accumulatedText + (accumulatedText ? " " : "") + interimText.trim());
        resetSilenceTimer();
      }
    };

    rec.onerror = (e) => {
      const msg = e?.error || e?.message || "Unknown speech error";
      if (msg === "no-speech") {
        if (active) {
          try { rec.stop(); } catch { /* ignore */ }
        }
        return;
      }
      if (msg === "aborted") return;
      console.warn("Hands-free speech error:", msg);
      onError?.(msg);
    };

    rec.onend = () => {
      onListeningStop?.();

      if (!active) return;

      if (singleCommand) {
        // In single-command mode, signal completion so caller can re-arm wake word
        active = false;
        onComplete?.();
      } else {
        // Continuous mode — re-arm for the next command
        onReady?.();
        setTimeout(() => {
          if (active) startListening();
        }, 400);
      }
    };

    recognition = rec;

    try {
      rec.start();
    } catch (e) {
      console.warn("Hands-free start failed:", e);
      onError?.("Could not start speech recognition.");
    }
  }

  return {
    /**
     * Activate — starts listening immediately.
     */
    start() {
      if (active) return;
      active = true;
      startListening();
    },

    /**
     * Deactivate — stops listening and cleans up.
     */
    stop() {
      active = false;
      clearSilenceTimer();
      try {
        recognition?.stop();
      } catch {
        // ignore
      }
      recognition = null;
      accumulatedText = "";
      onListeningStop?.();
    },

    /** Whether the handler is currently active. */
    get isActive() {
      return active;
    },
  };
}
