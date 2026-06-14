// src/lib/wakeLock.js
//
// Thin wrapper around the Wake Lock API
// (https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).
// Built for issue #72 — multi-minute GPS recording gaps in iOS Safari
// PWA on remote-area surveys.
//
// What this gives us:
//   • The browser keeps the screen + processing context alive while
//     a sentinel is held, even if Auto-Lock is on. iOS Safari 16.4+
//     and modern Android Chrome both support it.
//   • Acquired on a user gesture (Start Stage), released on End
//     Stage. Best-effort: silently no-ops where the API doesn't
//     exist so unsupported browsers keep recording (just without
//     the extra liveness guarantee).
//
// Important iOS behaviour:
//   • iOS releases the wake-lock sentinel automatically when the
//     tab becomes hidden. The only way to keep it alive across an
//     accidental tab switch is to re-acquire whenever
//     `visibilitychange` fires `visible`. We do that here.
//   • Audio focus is NOT enough to keep GPS callbacks firing — the
//     wake lock targets the screen + processing context, which is
//     the thing we actually need.
//
// All acquire/release/fail events are routed through the lifecycle
// log so issue-#72 diagnostics carry a paper trail of whether the
// lock survived the stage.

import { logLifecycleEvent } from "./iosLifecycleLog.js";

let sentinel = null;
let visibilityListener = null;

function isSupported() {
  return (
    typeof navigator !== "undefined" &&
    navigator.wakeLock &&
    typeof navigator.wakeLock.request === "function"
  );
}

async function rawAcquire() {
  if (!isSupported()) return null;
  try {
    const next = await navigator.wakeLock.request("screen");
    // iOS / Chromium drop the sentinel when the page is hidden — log
    // that so we can correlate it with GPS gaps later.
    next.addEventListener("release", () => {
      logLifecycleEvent("wakelock_released_by_browser");
      sentinel = null;
    });
    return next;
  } catch (e) {
    logLifecycleEvent("wakelock_acquire_failed", {
      name: e?.name || "Error",
      message: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Acquire a screen wake lock if the API is available. Safe to call
 * multiple times — extra calls are no-ops while a sentinel is held.
 *
 * Also installs a visibilitychange listener that re-acquires the
 * lock whenever the page becomes visible again (iOS auto-releases
 * on hide). The listener is removed by releaseScreenWakeLock().
 *
 * Returns true if a sentinel is held after the call; false if the
 * API isn't supported or the request failed.
 */
export async function acquireScreenWakeLock() {
  if (!isSupported()) {
    logLifecycleEvent("wakelock_unsupported");
    return false;
  }
  if (sentinel) return true;

  sentinel = await rawAcquire();
  if (sentinel) logLifecycleEvent("wakelock_acquired");

  // Install the visibility re-acquire listener exactly once per
  // "session". Removed by releaseScreenWakeLock().
  if (!visibilityListener) {
    visibilityListener = async () => {
      if (document.visibilityState === "visible" && !sentinel) {
        sentinel = await rawAcquire();
        if (sentinel) logLifecycleEvent("wakelock_reacquired_on_visible");
      }
    };
    try {
      document.addEventListener("visibilitychange", visibilityListener);
    } catch (_) {
      // No-op — visibilitychange will continue to be logged by
      // iosLifecycleLog.js's own listener regardless.
    }
  }

  return !!sentinel;
}

/**
 * Release the held wake lock and stop the visibility re-acquire
 * listener. Safe to call when nothing is held.
 */
export async function releaseScreenWakeLock() {
  if (visibilityListener) {
    try {
      document.removeEventListener("visibilitychange", visibilityListener);
    } catch (_) {}
    visibilityListener = null;
  }
  if (!sentinel) return;
  const local = sentinel;
  sentinel = null;
  try {
    await local.release();
    logLifecycleEvent("wakelock_released");
  } catch (e) {
    logLifecycleEvent("wakelock_release_failed", {
      name: e?.name || "Error",
      message: e?.message || String(e),
    });
  }
}

/** Diagnostic — for tests or UI badges. */
export function hasActiveWakeLock() {
  return !!sentinel;
}
