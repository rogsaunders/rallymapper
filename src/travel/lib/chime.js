// src/travel/lib/chime.js
//
// A short two-tone attention chime, synthesised with the Web Audio API
// (no audio asset to bundle). Played when Travel Mode detects you've
// drifted off the recorded route, so you get an audible cue without
// looking at the screen.
//
// iOS/Safari gates AudioContext behind a user gesture: a context created
// or resumed outside a gesture starts "suspended" and stays silent. So
// primeChime() is called from the "Begin driving" tap (a real gesture),
// which unlocks the context for the later, non-gesture off-route cue.

let ctx = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

/**
 * Unlock the audio context from within a user gesture (e.g. the "Begin
 * driving" tap) so the off-route chime can play later without one.
 */
export function primeChime() {
  getCtx();
}

function tone(c, freq, startAt, dur) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // Quick attack, exponential release — a clean "beep", not a click.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.linearRampToValueAtTime(0.5, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.02);
}

/**
 * Play the off-route cue: a descending two-tone "uh-oh". Safe to call
 * even if audio is unavailable (no-op). Fire once on the on→off
 * transition — not every tick you remain off-route.
 */
export function playOffRouteChime() {
  const c = getCtx();
  if (!c) return;
  try {
    const now = c.currentTime;
    tone(c, 660, now, 0.15);
    tone(c, 494, now + 0.17, 0.22);
  } catch {
    /* ignore — audio best-effort */
  }
}
