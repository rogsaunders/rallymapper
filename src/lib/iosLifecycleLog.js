// src/lib/iosLifecycleLog.js
//
// Tiny diagnostic log that records iOS / browser-lifecycle events to
// localStorage, so when a stage ends with suspicious GPS gaps the
// surveyor can paste a paper trail back to us. Built specifically for
// issue #72 (multi-minute GPS recording gaps in iOS Safari PWA on
// remote-area surveys).
//
// What we capture:
//   • visibilitychange  — `hidden` / `visible` transitions. The
//     strongest signal that iOS suspended the tab.
//   • pagehide / pageshow / freeze / resume — the modern page-
//     lifecycle events. freeze fires when the browser fully suspends
//     the page in memory; resume when it wakes again.
//   • wake-lock acquire / release / fail (logged by wakeLock.js).
//   • stage start / end markers (logged by RouteMapperLayout) so the
//     timeline is anchored to the user's actions.
//   • online / offline.
//
// Storage strategy:
//   • Single localStorage key, JSON-encoded ring buffer of up to
//     CAP entries. Older entries fall off the front when CAP is hit.
//   • Each entry is { t: ISO-string, e: event-type, d?: optional
//     detail }. Tiny on the wire so even a long survey day fits well
//     under localStorage's per-key budget.
//   • Survives tab refresh, app backgrounding, and even (modern iOS)
//     PWA freeze — which is the whole point.
//
// Lifecycle event listeners are installed exactly once on first
// import. Calling installListeners() repeatedly is a no-op.

const STORAGE_KEY = "rm_ios_lifecycle_v1";
const CAP = 200;

function safeNow() {
  try {
    return new Date().toISOString();
  } catch (_) {
    return String(Date.now());
  }
}

function readBuffer() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function writeBuffer(arr) {
  try {
    const trimmed = arr.length > CAP ? arr.slice(arr.length - CAP) : arr;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (_) {
    // localStorage full / disabled — silently drop. The log is
    // best-effort diagnostic, not a correctness guarantee.
  }
}

/**
 * Append a lifecycle event to the log. `type` is a short string
 * (visibility, pagehide, wakelock_acquire, …). `detail` is optional
 * and should be a small JSON-serialisable value.
 */
export function logLifecycleEvent(type, detail) {
  if (!type) return;
  const buf = readBuffer();
  const entry = { t: safeNow(), e: type };
  if (detail !== undefined) entry.d = detail;
  buf.push(entry);
  writeBuffer(buf);
}

/** Return the current log as an array of entries (oldest first). */
export function getIosLifecycleLog() {
  return readBuffer();
}

/** Wipe the log. Used after a successful gap-free stage so the
 *  next session starts fresh. */
export function clearIosLifecycleLog() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

/**
 * Format the recent log as a human-readable string suitable for the
 * tail of an alert dialog. Caps at the last `max` entries so the
 * dialog stays scrollable on mobile.
 *
 * Output shape per line:
 *   09:14:02 visibility hidden
 *   09:14:03 wakelock_release
 *   09:31:08 visibility visible
 */
export function formatIosLifecycleLogText(max = 30) {
  const buf = readBuffer();
  if (buf.length === 0) return "(no lifecycle events recorded)";
  const recent = buf.slice(Math.max(0, buf.length - max));
  return recent
    .map((entry) => {
      const t = (() => {
        try {
          return new Date(entry.t).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
        } catch (_) {
          return entry.t;
        }
      })();
      const detail = entry.d != null ? " " + JSON.stringify(entry.d) : "";
      return `${t} ${entry.e}${detail}`;
    })
    .join("\n");
}

// ── Auto-install listeners ───────────────────────────────────────────
//
// One-shot install. We install on module load rather than on demand
// because the events we care about (especially pageshow / pagehide /
// freeze) only fire once per page lifecycle and we don't want to miss
// the first one. Safe to import this module from anywhere — repeat
// calls to installListeners() are no-ops via the module-level flag.

let installed = false;

function installListeners() {
  if (installed) return;
  installed = true;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  try {
    document.addEventListener("visibilitychange", () => {
      logLifecycleEvent("visibility", document.visibilityState);
    });
  } catch (_) {}

  // pagehide / pageshow — the "Back/Forward Cache" lifecycle events.
  // `persisted: true` on pagehide means the page is going into bfcache;
  // pageshow with persisted: true means it came back out.
  try {
    window.addEventListener("pagehide", (e) => {
      logLifecycleEvent("pagehide", { persisted: !!e.persisted });
    });
    window.addEventListener("pageshow", (e) => {
      logLifecycleEvent("pageshow", { persisted: !!e.persisted });
    });
  } catch (_) {}

  // freeze / resume — Chromium's page-lifecycle proposal. iOS Safari
  // doesn't fire these today; harmless to listen anyway in case it
  // ever does.
  try {
    document.addEventListener("freeze", () => logLifecycleEvent("freeze"));
    document.addEventListener("resume", () => logLifecycleEvent("resume"));
  } catch (_) {}

  try {
    window.addEventListener("online", () => logLifecycleEvent("online"));
    window.addEventListener("offline", () => logLifecycleEvent("offline"));
  } catch (_) {}

  // Module-load marker — anchors the timeline.
  logLifecycleEvent("module_loaded");
}

installListeners();
