// src/travel/lib/stageCache.js
//
// Best-effort persistence of the last-loaded Travel Mode stage in
// IndexedDB, so an installed PWA that is reopened mid-trip (or after an
// accidental reload in-vehicle) resumes the roadbook instead of dropping
// the user back on the source picker.
//
// Why IndexedDB and not localStorage: a normalised stage carries the full
// rows[] plus the recorded GPS trackPoints[], which routinely exceeds the
// ~5 MB localStorage ceiling on a long stage. IndexedDB has no practical
// limit here and stores structured objects without JSON.stringify.
//
// Dependency-free on purpose (no `idb` package) — one database, one object
// store, a single "last" record. Every call is best-effort: any failure
// (private-mode Safari, quota, blocked upgrade) resolves to a no-op rather
// than throwing, so persistence can never break the core reader.

const DB_NAME = "rm_travel";
const DB_VERSION = 1;
const STORE = "stage";
const KEY = "last";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/**
 * Persist the normalised stage. `record` is the plain object Travel Mode
 * already holds in state:
 *   { roadbook, trackPoints, stageMeta, startCoords, docxPatchCount }
 * Stored alongside a savedAt timestamp for future staleness decisions.
 * Resolves true on success, false on any failure (never rejects).
 */
export async function saveStage(record) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const store = tx(db, "readwrite");
      const put = store.put({ ...record, savedAt: Date.now() }, KEY);
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error);
    });
    db.close();
    return true;
  } catch (e) {
    console.warn("stageCache: saveStage failed", e);
    return false;
  }
}

/**
 * Read back the persisted stage, or null if none / on any failure.
 */
export async function loadStage() {
  try {
    const db = await openDb();
    const value = await new Promise((resolve, reject) => {
      const get = tx(db, "readonly").get(KEY);
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return value;
  } catch (e) {
    console.warn("stageCache: loadStage failed", e);
    return null;
  }
}

/**
 * Remove the persisted stage (called from Travel Mode's Exit / clear).
 */
export async function clearStage() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const del = tx(db, "readwrite").delete(KEY);
      del.onsuccess = () => resolve();
      del.onerror = () => reject(del.error);
    });
    db.close();
    return true;
  } catch (e) {
    console.warn("stageCache: clearStage failed", e);
    return false;
  }
}
