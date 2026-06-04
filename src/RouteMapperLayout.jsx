// src/RouteMapperLayout.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import rrmLogo from "./assets/RRMLogo_64x64.png";
import MapView from "./components/MapView";
import {
  exportMapAsPdf,
  buildMapPdfBlob,
  computeBounds,
} from "./export/exportMapPdf";
import { ICONS, ICON_ORDER, ICON_CATEGORIES } from "./icons/iconRegistry";
import IconButton from "./components/IconButton";
import { useAuth } from "./auth/AuthProvider";
import {
  getLimits,
  countLocalStages,
  countRemoteStages,
  UPGRADE_REASONS,
} from "./lib/planLimits";
import { STRIPE_PRICES } from "./lib/stripePrices";
import { redirectToCheckout, redirectToPortal } from "./lib/checkout";
import { upsertStageExport, flushPendingQueue } from "./lib/stageSync";
import { readPendingQueue, enqueueStage } from "./lib/pendingQueue";
import { stageFilenameBase } from "./lib/stageNaming";
import { buildRoutePackage } from "./export";
import { generateRoadbook, renderTulipSvg } from "./roadbook";
import { createVoiceCommandHandler } from "./voice/voiceCommandHandler";
import { createRecordTrigger } from "./voice/recordTrigger";
import StageHistoryPanel from "./components/StageHistoryPanel";
import AccountModal from "./components/AccountModal";
import ModePicker from "./components/ModePicker";
import OverflowMenu, { OverflowMenuItem } from "./components/OverflowMenu";
import { getStorageStatus, formatBytes } from "./lib/storageCapacity";
import { findTrackpointGaps, summariseGaps } from "./lib/trackpointGaps";
import { initSounds, playStartSound, playStopSound } from "./utils/sounds";
import startSoundUrl from "./assets/sounds/start.wav";
import stopSoundUrl from "./assets/sounds/stop.wav";

const PENDING_SYNC_KEY = "rm_pending_queue_signal_v1";

function getGuestOwnerId() {
  const k = "rm_guest_owner";
  let v = localStorage.getItem(k);
  if (!v) {
    v = `guest_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    localStorage.setItem(k, v);
  }
  return v;
}

// Build a mailto: URL that opens the user's default mail client with the
// To/Subject pre-filled and the body pre-populated with diagnostic context
// (account, plan, app version, browser, current URL). The diagnostic block
// drastically cuts the back-and-forth of "what browser are you on?" and
// "what plan?" — most support tickets arrive with everything we need.
//
// Built on demand at click time so the URL always reflects current state
// (plan changes, navigation, etc.). Encodes both subject and body via
// encodeURIComponent so newlines and special characters survive intact.
function buildSupportMailto({ user, plan, guestMode }) {
  const version =
    typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown";
  const lines = [
    "Hi RouteMapper team,",
    "",
    "[Please describe the issue or question here.]",
    "",
    "",
    "---",
    "Diagnostic info (please leave this section as-is):",
    guestMode
      ? "Mode: Guest (not signed in)"
      : `Account: ${user?.email || "(unknown)"}`,
    `Plan: ${plan || "free"}`,
    `App version: ${version}`,
    `Browser: ${navigator.userAgent}`,
    `URL: ${window.location.href}`,
  ];
  const subject = `RouteMapper support — ${
    guestMode ? "guest" : user?.email || "user"
  }`;
  const body = lines.join("\n");
  return `mailto:hello@routemapper.net?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) return Infinity;
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lon)) return Infinity;

  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return R * c;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // delay revoke a tick to avoid Safari weirdness
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function fmtKm(meters) {
  const km = meters / 1000;
  return km >= 10 ? `${km.toFixed(1)} km` : `${km.toFixed(2)} km`;
}

function stageLocalKey(userIdOrGuest, localId) {
  return `rm_stage:${userIdOrGuest}:${localId}`;
}

function saveStageLocal(userIdOrGuest, localId, payload) {
  localStorage.setItem(
    stageLocalKey(userIdOrGuest, localId),
    JSON.stringify(payload),
  );
}

function toUtcIso(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isFinite(dt.getTime())
    ? dt.toISOString()
    : new Date().toISOString();
}

// Return a new waypoints array containing exactly one kind:"start" entry at
// the supplied GPS, removing any pre-existing start entry first.  Used to
// keep the start waypoint in sync with `startGPS` whenever the latter
// changes (Start Stage tap, auto-capture after GPS-arrived-late, or the
// manual Update Start button).
//
// The start waypoint is shaped to flow naturally through every downstream
// consumer:
//   • Map markers — `kind:"start"` triggers the blue-circle Start marker in
//     both the live map (MapView) and the static map renderer (PDF +
//     roadbook embed).  `numberWaypoints()` skips it, so the next
//     user-added waypoint becomes WP 1.
//   • Roadbook engine — `iconId:"start"` maps to event type "start" via
//     iconMappings, giving row 1 the proper Start tulip and "Start" note.
//   • GPX export — filtered out of the regular-waypoint list because the
//     exporters already build a synthetic START entry from `startGPS`.
//
// Passing a null/invalid `gps` returns the array with any existing start
// removed — used by handleEndStage where the stage-scoped state is being
// cleared.
function upsertStartWaypoint(prevWaypoints, gps) {
  const filtered = (prevWaypoints || []).filter(
    (w) => w.kind !== "start" && w.poi !== "START",
  );
  if (
    !gps ||
    !Number.isFinite(Number(gps.lat)) ||
    !Number.isFinite(Number(gps.lon))
  ) {
    return filtered;
  }
  const startWp = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `wp-start-${Date.now()}`,
    lat: Number(gps.lat),
    lon: Number(gps.lon),
    timestamp: gps.timestamp || new Date().toISOString(),
    kind: "start",
    poi: "START",
    type: "control",
    iconId: "start",
    distanceFromStartM: 0,
  };
  return [startWp, ...filtered];
}

// ── Capture-noise policy ────────────────────────────────────────────────
//
// Two patterns produce waypoints that pollute the GPX export and confuse
// downstream renderers (Rally Navigator's free-tier inter-waypoint
// connectors are particularly sensitive):
//
//   1. Empty-content notes — the user tapped Record but speech rec
//      transcribed nothing (timed out, background noise, accidental tap).
//      The pending-snap timer fires anyway and commits a waypoint with
//      empty POI and the default note type/icon.
//
//   2. Refinement-on-second-attempt — the user tapped Record, started
//      speaking, the snap window fired before they finished, then they
//      tapped Record again and said the full thing. Both captures land
//      as separate waypoints — e.g. "national" (kmTotal 6.031) and 20 s
//      later "national wine centre on left" (kmTotal 6.114).
//
// applyCapturePolicy() filters both at the moment of commit. Existing
// stages are unaffected — this only changes behaviour for new captures.
//
// Note types other than "note" (nav / control / hazard / terrain) always
// survive even with empty POI — the icon itself encodes intent (e.g. a
// "left" nav with no speech still means "left turn here").

const REFINEMENT_WINDOW_MS = 30_000;

function isEmptyContentNote(w) {
  if (w.type !== "note") return false;
  if ((w.poi || "").trim().length > 0) return false;
  // Default iconId for a fresh note is null or "note" — neither signals
  // user intent. Any other iconId means the user explicitly chose an
  // icon and meant to capture something.
  return !w.iconId || w.iconId === "note";
}

function shouldReplaceAsRefinement(prev, next) {
  if (prev.kind !== "waypoint") return false; // never replace START / finish

  const prevMs = Date.parse(prev.timestamp || "");
  const nextMs = Date.parse(next.timestamp || "");
  if (!Number.isFinite(prevMs) || !Number.isFinite(nextMs)) return false;
  if (nextMs - prevMs > REFINEMENT_WINDOW_MS) return false;

  const prevPoi = (prev.poi || "").trim().toLowerCase();
  const nextPoi = (next.poi || "").trim().toLowerCase();

  // Empty-previous → any non-empty next is a refinement
  if (prevPoi.length === 0 && nextPoi.length > 0) return true;
  // Non-empty-previous → next must extend it (prefix match)
  return (
    nextPoi.length > prevPoi.length && nextPoi.startsWith(prevPoi)
  );
}

function applyCapturePolicy(prev, next) {
  // A — drop empty-content note captures outright
  if (isEmptyContentNote(next)) return prev;

  // B — collapse refinements within the 30 s window onto the previous
  // waypoint. We replace rather than merge so the new POI / icon /
  // position (latest user intent) wins cleanly.
  const last = prev[prev.length - 1];
  if (last && shouldReplaceAsRefinement(last, next)) {
    return [...prev.slice(0, -1), next];
  }
  return [...prev, next];
}

function fmtKmNumber(meters) {
  const km = Number(meters || 0) / 1000;
  return km.toFixed(2); // "3.10"
}

function makeLocalId(meta) {
  // stable enough + human readable; includes timestamp to avoid collisions
  return `${meta.tripDate}_d${meta.dayNumber}_r${meta.routeNumber}_s${meta.stageNumber}_${meta.endedAt}`;
}

// First-icon-in-each-category map, derived from the registry. Used as the
// initial state for iconIdByCategory and as the reset value when a stage
// starts. The registry is JSON-manifest-driven, so adding a new category
// (or a new icon in an existing category) updates this automatically.
const DEFAULT_ICON_BY_CATEGORY = (() => {
  const out = {};
  for (const cat of ICON_CATEGORIES) {
    const key = cat.toLowerCase();
    const variants = ICONS[key]?.variants || {};
    out[key] = Object.keys(variants)[0] || null;
  }
  return out;
})();

// --- Utilities ---
function xmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function _exportOpenRallyGpx(
  routePoints,
  trackName = "Route",
  meta = {},
  opts = {},
) {
  const {
    includeTrack = false,
    includeWaypoints = true,
    trackPoints = null,
    minCapDistanceMeters = 5,
  } = opts || {};

  console.log("🧩 exportOpenRallyGpx opts", {
    includeTrack,
    includeWaypoints,
    trackPointsLen: Array.isArray(trackPoints) ? trackPoints.length : null,
    firstTrackPoint: Array.isArray(trackPoints) ? trackPoints[0] : null,
  });

  const points = (routePoints || [])
    .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p, idx) => ({
      ...p,
      lat: Number(p.lat),
      lon: Number(p.lon),
      timeIso: p.time
        ? String(p.time).includes("T")
          ? String(p.time)
          : toUtcIso(p.time)
        : null,
      name: (p.name ?? `WP ${idx + 1}`).toString(),
      desc: (p.desc ?? "").toString(),
      segmentMeters: Number.isFinite(p.segmentMeters)
        ? Number(p.segmentMeters)
        : 0,
      totalMeters: Number.isFinite(p.totalMeters) ? Number(p.totalMeters) : 0,
    }));

  // Normalize track points ONCE, early (accept numbers OR numeric strings)
  const trkPts = (Array.isArray(trackPoints) ? trackPoints : [])
    .map((p) => ({
      lat: Number(p?.lat),
      lon: Number(p?.lon),
      timeIso: p?.time
        ? String(p.time).includes("T")
          ? String(p.time)
          : toUtcIso(p.time)
        : null,
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  const hasWpt = includeWaypoints && points.length > 0;
  const hasTrk = includeTrack && trkPts.length > 0;
  if (!hasWpt && !hasTrk) return "";

  console.log("🧩 exportOpenRallyGpx trkPts", {
    trkPtsLen: trkPts.length,
    firstTrkPt: trkPts[0] ?? null,
  });

  // Only do CAP work if we will output WPTs
  const caps = hasWpt
    ? points.map((p, i) => {
        if (i === 0) return 0;

        // If we have track points, use them for a more accurate bearing
        if (trkPts.length >= 2) {
          // Find the track point closest to this waypoint
          let closestIdx = 0;
          let closestDist = Infinity;
          trkPts.forEach((tp, ti) => {
            const d = haversineMeters(p, tp);
            if (d < closestDist) {
              closestDist = d;
              closestIdx = ti;
            }
          });

          // Use the track point before and after the closest one for bearing
          const fromIdx = Math.max(0, closestIdx - 1);
          const toIdx = Math.min(trkPts.length - 1, closestIdx + 1);

          if (fromIdx !== toIdx) {
            const from = trkPts[fromIdx];
            const to = trkPts[toIdx];
            const toRad = (d) => (d * Math.PI) / 180;
            const y =
              Math.sin(toRad(to.lon - from.lon)) * Math.cos(toRad(to.lat));
            const x =
              Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
              Math.sin(toRad(from.lat)) *
                Math.cos(toRad(to.lat)) *
                Math.cos(toRad(to.lon - from.lon));
            return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
          }
        }

        // Fallback: waypoint-to-waypoint bearing
        for (let j = i - 1; j >= 0; j--) {
          const d = haversineMeters(points[j], p);
          if (d >= Math.max(minCapDistanceMeters, 0.001)) {
            const toRad = (d) => (d * Math.PI) / 180;
            const y =
              Math.sin(toRad(p.lon - points[j].lon)) * Math.cos(toRad(p.lat));
            const x =
              Math.cos(toRad(points[j].lat)) * Math.sin(toRad(p.lat)) -
              Math.sin(toRad(points[j].lat)) *
                Math.cos(toRad(p.lat)) *
                Math.cos(toRad(p.lon - points[j].lon));
            return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
          }
        }
        return 0;
      })
    : [];

  const totalMetersForHeader = hasWpt
    ? points[points.length - 1]?.totalMeters || 0
    : 0;

  const headerName = xmlEscape(meta.name || trackName);
  const headerDesc = xmlEscape(meta.desc || "");
  const headerTime =
    meta.time ||
    (hasWpt ? points[0].timeIso : null) ||
    new Date().toISOString();

  const xmlLines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx creator="${xmlEscape(meta.creator || "RouteMapper")}" version="1.1"`,
    `  xmlns="http://www.topografix.com/GPX/1/1"`,
    `  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`,
    `  xmlns:openrally="http://www.openrally.org/xmlschemas/OpenRally/1.0"`,
    `  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.openrally.org/xmlschemas/OpenRally/1.0 http://www.openrally.org/xmlschemas/OpenRally/1.0/OpenRally.xsd">`,
    `  <metadata>`,
    `    <name>${headerName}</name>`,
    headerDesc ? `    <desc>${headerDesc}</desc>` : null,
    `    <time>${headerTime}</time>`,
    `    <extensions>`,
    `      <openrally:units>metric</openrally:units>`,
    hasWpt
      ? `      <openrally:distance>${fmtKmNumber(totalMetersForHeader)}</openrally:distance>`
      : null,
    `    </extensions>`,
    `  </metadata>`,
  ].filter(Boolean);

  if (hasWpt) {
    points.forEach((p, i) => {
      const cap = caps[i] ?? 0;

      const pngB64 =
        dataUrlToPngBase64(p.tulipDataUrl || p.tulipPngDataUrl) ||
        BLANK_PNG_1X1_B64;

      xmlLines.push(
        `  <wpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">`,
        `    <name>${xmlEscape(p.name)}</name>`,
        p.desc ? `    <desc>${xmlEscape(p.desc)}</desc>` : null,
        p.timeIso ? `    <time>${p.timeIso}</time>` : null,
        `    <extensions>`,
        `      <openrally:distance>${fmtKmNumber(p.totalMeters)}</openrally:distance>`,
        `      <openrally:cap>${cap}</openrally:cap>`,
        `      <openrally:show_coordinates>0</openrally:show_coordinates>`,
        `      <openrally:tulip><![CDATA[data:image/png;base64,${pngB64}]]></openrally:tulip>`,
        `    </extensions>`,
        `  </wpt>`,
      );
      if (!pngB64) console.warn("No pngB64 for waypoint", p);
    });
  }

  if (hasTrk) {
    xmlLines.push(`  <trk>`, `    <name>${headerName}</name>`, `    <trkseg>`);
    trkPts.forEach((p) => {
      xmlLines.push(
        `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">`,
        p.timeIso ? `        <time>${p.timeIso}</time>` : null,
        `      </trkpt>`,
      );
    });
    xmlLines.push(`    </trkseg>`, `  </trk>`);
  }

  xmlLines.push(`</gpx>`);
  return xmlLines.filter(Boolean).join("\n");
}
const BLANK_PNG_1X1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X0pQAAAAASUVORK5CYII=";

// Convert a data URL (data:image/png;base64,...) into just the base64 payload.
// Accepts null/undefined and returns null.
function dataUrlToPngBase64(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  return m ? m[1] : null;
}

function getCloudStatus({ online, userId, pendingCount }) {
  if (!userId) return { color: "bg-gray-500", label: "Guest", dot: "⚪️" };
  if (!online) return { color: "bg-red-500", label: "Offline", dot: "🔴" };
  if (pendingCount > 0)
    return {
      color: "bg-yellow-500",
      label: `Pending (${pendingCount})`,
      dot: "🟡",
    };
  return { color: "bg-green-500", label: "Synced", dot: "🟢" };
}

export default function RouteMapperLayout() {
  const { user, session, signOut, plan, profile, guestMode, refreshProfile } =
    useAuth();
  const localOwner = user?.id ?? getGuestOwnerId();
  const planLimits = getLimits(plan);
  const [pendingCount, setPendingCount] = useState(
    () => readPendingQueue().length,
  );
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [showAccount, setShowAccount] = useState(false);
  const [profileBannerDismissed, setProfileBannerDismissed] = useState(
    () => sessionStorage.getItem("rm_profile_banner_dismissed") === "1",
  );

  // Show the "Complete your profile" banner only for signed-in users whose
  // profile row is loaded but missing full_name (i.e. existing beta testers
  // who pre-date the signup-form changes). Dismissal is per-session.
  const showProfileBanner =
    !!user?.id && !!profile && !profile.full_name && !profileBannerDismissed;

  useEffect(() => {
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
    };
  }, []);

  // ── Handle Stripe Checkout return ──────────────────────────────────────────
  // Stripe redirects back to /?billing=success|cancelled after checkout.
  // Refresh the profile so the new plan takes effect immediately, then
  // clean the param from the URL so a reload doesn't re-trigger this.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    if (!billing) return;

    // Remove the param from the URL without a page reload
    params.delete("billing");
    params.delete("plan");
    const clean =
      window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState({}, "", clean);

    if (billing === "success") {
      setBillingToast("success");
      // Refresh the profile so planLimits updates immediately
      refreshProfile?.();
      setTimeout(() => setBillingToast(null), 6000);
    } else if (billing === "cancelled") {
      setBillingToast("cancelled");
      setTimeout(() => setBillingToast(null), 4000);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const refresh = () => setPendingCount(readPendingQueue().length);
    refresh();
    const onStorage = (e) => {
      if (e.key === PENDING_SYNC_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Auto-flush the pending queue when the user is signed in AND online.
  // Fires from three triggers, all using the same guarded helper:
  //   1. Mount + (user.id, online) becoming truthy — drains a queue stuck
  //      from a previous session, or after sign-in / reconnect.
  //   2. visibilitychange → visible — covers the iPad PWA case where the
  //      Stop-Stage flush was throttled by iOS while the app was in a
  //      transitional state. As soon as the user backgrounds and returns,
  //      the queue drains.
  //   3. A 30-second retry timer that runs only while the queue is
  //      non-empty — covers the user who stays foregrounded watching the
  //      "Pending" badge. Self-stops when pendingCount hits 0.
  const flushingRef = useRef(false);
  const tryFlush = useCallback(() => {
    if (!user?.id || !online) return;
    if (flushingRef.current) return;
    if (readPendingQueue().length === 0) return;

    flushingRef.current = true;
    flushPendingQueue(user)
      .then(({ flushed, remaining }) => {
        if (flushed > 0) {
          console.log(`✅ Auto-flushed ${flushed} pending stage(s)`);
        }
        setPendingCount(remaining);
      })
      .catch((err) => {
        console.warn("Auto-flush failed:", err);
        setPendingCount(readPendingQueue().length);
      })
      .finally(() => {
        flushingRef.current = false;
      });
  }, [user, online]);

  // Trigger 1: deps change (sign-in / reconnect / mount).
  useEffect(() => {
    tryFlush();
  }, [tryFlush]);

  // Trigger 2: tab/app becomes visible.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") tryFlush();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [tryFlush]);

  // Trigger 3: periodic retry while queue is non-empty.
  useEffect(() => {
    if (pendingCount === 0) return;
    const id = setInterval(tryFlush, 30000);
    return () => clearInterval(id);
  }, [pendingCount, tryFlush]);

  // Marketing-site deep-link: SignIn captured ?plan=<id> on mount and stored
  // it in localStorage. Once the user is signed in and on the free plan,
  // auto-open the upgrade panel so they can confirm and pay without
  // hunting for the upgrade button. One-shot — clear the flag immediately.
  useEffect(() => {
    if (!user?.id || !profile) return;
    if (profile.plan && profile.plan !== "free") return;
    let pending;
    try {
      pending = localStorage.getItem("rm_pending_plan");
    } catch {
      pending = null;
    }
    if (!pending) return;
    try {
      localStorage.removeItem("rm_pending_plan");
    } catch {
      /* ignore */
    }
    setUpgradePrompt(UPGRADE_REASONS.browse);
  }, [user?.id, profile]);

  const cloud = getCloudStatus({
    online,
    userId: user?.id,
    pendingCount,
  });

  const [currentGPS, setCurrentGPS] = useState(null); // ✅ LIVE GPS
  const currentGPSRef = useRef(null); // mirrors currentGPS for async/voice callbacks
  const [startGPS, setStartGPS] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [_stageArchive, setStageArchive] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reviewStage, setReviewStage] = useState(null); // full stage object when reviewing history
  // Default selected category is "nav" — navigation waypoints (turn left,
  // turn right, keep left/right…) are by far the most common tap during a
  // stage, so seeding the UI on Nav avoids an unnecessary category change
  // for the first waypoint the user adds.
  const [waypointType, setWaypointType] = useState("nav");
  const [poi, setPoi] = useState("");
  const [followMap, setFollowMap] = useState(true);
  // One state object per category — auto-extends as the icon manifest
  // grows. Replaces hazardIconId / navIconId / controlIconId / terrainIconId.
  const [iconIdByCategory, setIconIdByCategory] = useState(
    DEFAULT_ICON_BY_CATEGORY,
  );
  const setIconForCategory = (category, iconId) =>
    setIconIdByCategory((prev) => ({ ...prev, [category]: iconId }));
  // const localOwner = getGuestOwnerId();
  // const user = null;

  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceMode, setVoiceMode] = useState("off"); // "off" | "snap" | "command"
  const [_voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceLastCommand, setVoiceLastCommand] = useState(null);
  const [voiceShowSettings, setVoiceShowSettings] = useState(false);
  const [voiceSilenceMs, setVoiceSilenceMs] = useState(
    () => Number(localStorage.getItem("rm_handsfree_silence_ms")) || 2500,
  );
  const [snapWindowMs, setSnapWindowMs] = useState(
    () => Number(localStorage.getItem("rm_snap_window_ms")) || 5000,
  );
  // Waypoint capture lookback (seconds) — shifts the export-time
  // snap-to-track target backwards by this amount to compensate for
  // human reaction time between seeing a landmark and tapping Record.
  // Default 0 = strict PR #43 behaviour (no compensation). Read by the
  // GPX exporter via readWaypointLookbackMs() in exportUniversalGpx.js.
  const [waypointLookbackS, setWaypointLookbackS] = useState(() => {
    const raw = Number(localStorage.getItem("rm_waypoint_lookback_s"));
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  });
  const [pendingWaypoint, setPendingWaypoint] = useState(null);
  const [pendingRemainingMs, setPendingRemainingMs] = useState(0);
  const pendingWaypointRef = useRef(null);
  const pendingTimerRef = useRef(null);
  const [voiceToast, setVoiceToast] = useState(null); // { type, iconId, poi } for large toast
  const [voiceError, setVoiceError] = useState(null); // friendly message when speech-rec startup fails
  const voiceRef = useRef(null); // voice command handler
  const voiceActiveRef = useRef(false); // mirrors voiceActive for async callbacks
  const recordTriggerRef = useRef(null); // external Bluetooth / pedal / keyboard trigger
  const [externalTriggerEnabled, setExternalTriggerEnabled] = useState(() => {
    const stored = localStorage.getItem("rm_external_trigger_enabled");
    return stored === null ? true : stored === "true";
  });

  // ── Waypoint edit / delete state ──────────────────────────────────
  // editDraft  — open the edit modal with a working copy of one waypoint
  // deleteId   — ask the confirm modal to delete this waypoint
  const [editDraft, setEditDraft] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  // ── Snap-on-tap state ─────────────────────────────────────────────
  // GPS is locked the instant 🎙 Record is tapped; the user then has
  // snapTimeoutSec seconds to speak a command before the pending
  // waypoint auto-commits as a plain note.
  const [snapCountdown, setSnapCountdown] = useState(0);
  const [snapTimeoutSec, setSnapTimeoutSec] = useState(
    () => Number(localStorage.getItem("rm_handsfree_snap_sec")) || 5,
  );
  const snapTimerRef = useRef(null); // setInterval handle
  const snapTimeoutSecRef = useRef(5); // always-fresh copy for async callbacks
  // Live remaining-seconds counter for the snap countdown. Held in a ref so
  // onInterim (firing in another closure) can reset it back to the full
  // window when speech is detected, pausing the auto-commit timeout.
  const snapRemainingRef = useRef(0);
  // Always-fresh copy of the current type/icon selection for async callbacks.
  // Updated by a useEffect whenever the selection changes.
  const currentDefaultsRef = useRef({ type: "note", iconId: null });
  const [showMap, setShowMap] = useState(true);
  const [mapMode, setMapMode] = useState("normal"); // "normal" | "review"
  const [mapSource, setMapSource] = useState("osm"); // "osm" | "esri_imagery" | "opentopo"
  const [exportingMapPdf, setExportingMapPdf] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState(null); // null | reason string
  const [billingToast, setBillingToast] = useState(null); // null | 'success' | 'cancelled'

  // Trip meta
  const [tripName, setTripName] = useState("");
  const [editingTripName, setEditingTripName] = useState(false);
  const tripNameRef = useRef(null);
  // Header trip-info popover (the ⓘ next to the trip name) — replaces
  // the old 3-line title block that ate vertical space on iPad/phone.
  const [showTripInfo, setShowTripInfo] = useState(false);
  const tripInfoRef = useRef(null);
  useEffect(() => {
    if (!showTripInfo) return;
    const onDown = (e) => {
      if (!tripInfoRef.current?.contains(e.target)) setShowTripInfo(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setShowTripInfo(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showTripInfo]);
  const [tripDate, setTripDate] = useState(
    new Date().toISOString().slice(0, 10),
  ); // YYYY-MM-DD

  // Day/Route/Stage meta
  const [dayNumber, setDayNumber] = useState(1);

  const [routeName, setRouteName] = useState("Route 1");
  const [routeNumber, setRouteNumber] = useState(1); // optional if you want "Route 2" button behaviour

  const [stageNumber, setStageNumber] = useState(1);

  // Archive completed stages in-memory (so you can export a whole day/route later)
  // each item: { tripName, tripDate, dayNumber, routeName, stageNumber, startedAt, endedAt, waypoints }
  const [stageActive, setStageActive] = useState(false);
  const [stageStartedAt, setStageStartedAt] = useState(null);
  const [showRoadbookPreview, setShowRoadbookPreview] = useState(false);
  const [trackPoints, setTrackPoints] = useState([]); // {lat, lon, ts}

  // Initialise audio feedback (once)
  useEffect(() => {
    initSounds(startSoundUrl, stopSoundUrl);
  }, []);

  const handleNewStage = () => {
    if (stageActive) {
      alert("End the current stage before starting a new stage.");
      return;
    }
    setStageNumber((n) => n + 1);
  };

  useEffect(() => {
    const refresh = () => setPendingCount(readPendingQueue().length);
    refresh();

    const onStorage = (e) => {
      if (e.key === PENDING_SYNC_KEY) refresh();
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const STAGE_DRAFT_KEY = "routemapper_stage_draft_v1";

  // Keep async-callback refs in sync with React state.
  useEffect(() => {
    const iconId = iconIdByCategory[waypointType] ?? null;
    currentDefaultsRef.current = { type: waypointType, iconId };
  }, [waypointType, iconIdByCategory]);

  useEffect(() => {
    snapTimeoutSecRef.current = snapTimeoutSec;
  }, [snapTimeoutSec]);

  useEffect(() => {}, []);

  useEffect(() => {
    if (!stageActive) return;

    const draft = {
      savedAt: new Date().toISOString(),
      tripName,
      tripDate,
      dayNumber,
      routeNumber,
      routeName,
      stageNumber,
      stageActive,
      stageStartedAt,
      startGPS,
      trackPoints,
      waypoints,
      waypointType,
      iconIdByCategory,
      poi,
    };

    const t = setTimeout(() => {
      try {
        localStorage.setItem(STAGE_DRAFT_KEY, JSON.stringify(draft));
      } catch (e) {
        console.warn("Stage autosave failed:", e);
      }
    }, 250); // debounce

    return () => clearTimeout(t);
  }, [
    stageActive,
    tripName,
    tripDate,
    dayNumber,
    routeNumber,
    routeName,
    stageNumber,
    stageStartedAt,
    startGPS,
    waypoints,
    trackPoints,
    waypointType,
    iconIdByCategory,
    poi,
  ]);

  // 2) Restore on load (once)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STAGE_DRAFT_KEY);
      if (!raw) return;

      const draft = JSON.parse(raw);

      if (!draft?.stageActive) return;

      const ok = confirm(
        `Resume unsaved stage?\nDay ${draft.dayNumber} • ${draft.routeName} • Stage ${draft.stageNumber}`,
      );
      if (!ok) return;

      setTripName(draft.tripName ?? "");
      setTripDate(draft.tripDate ?? new Date().toISOString().slice(0, 10));
      setDayNumber(draft.dayNumber ?? 1);
      setRouteNumber(draft.routeNumber ?? 1);
      setRouteName(draft.routeName ?? "Route 1");
      setStageNumber(draft.stageNumber ?? 1);

      setStageActive(true);
      setStageStartedAt(draft.stageStartedAt ?? null);

      setStartGPS(draft.startGPS ?? null);
      setWaypoints(Array.isArray(draft.waypoints) ? draft.waypoints : []);
      setTrackPoints(Array.isArray(draft.trackPoints) ? draft.trackPoints : []);
      setWaypointType(draft.waypointType ?? "nav");
      // New-shape drafts have iconIdByCategory; legacy drafts have
      // individual *IconId fields. Merge either onto the defaults so
      // missing/added categories don't break the restore.
      const restoredIcons = draft.iconIdByCategory
        ? { ...DEFAULT_ICON_BY_CATEGORY, ...draft.iconIdByCategory }
        : {
            ...DEFAULT_ICON_BY_CATEGORY,
            ...(draft.hazardIconId ? { hazard: draft.hazardIconId } : {}),
            ...(draft.navIconId ? { nav: draft.navIconId } : {}),
            ...(draft.controlIconId ? { control: draft.controlIconId } : {}),
            ...(draft.terrainIconId ? { terrain: draft.terrainIconId } : {}),
          };
      setIconIdByCategory(restoredIcons);
      setPoi(draft.poi ?? "");
    } catch (e) {
      console.warn("Stage restore failed:", e);
    }
  }, []);

  // ── Waypoint edit / delete helpers ────────────────────────────────
  // openEditWaypoint  — populates the modal with a working copy of the
  //                     selected waypoint; user can adjust type/icon/poi.
  // saveEdit          — writes the modal's draft back into the waypoints
  //                     array, preserving id, lat, lon, timestamp.
  // requestDelete     — shows the confirm modal for a waypoint id.
  // confirmDelete     — actually removes the waypoint from state.
  // deleteWaypointsAfter(index) — exposed for a future "rewind N" feature
  //                     (Medium → Large promotion path). Removes every
  //                     non-START waypoint after the given index in the
  //                     visible routePoints list.

  const openEditWaypoint = (wp) => {
    setEditDraft({
      id: wp.id,
      type: wp.type || "note",
      iconId: wp.iconId || null,
      poi: wp.poi || "",
    });
  };

  const saveEdit = () => {
    if (!editDraft) return;
    setWaypoints((prev) =>
      prev.map((w) =>
        w.id === editDraft.id
          ? {
              ...w,
              type: editDraft.type,
              iconId: editDraft.iconId,
              poi: editDraft.poi.trim(),
            }
          : w,
      ),
    );
    setEditDraft(null);
  };

  const requestDelete = (wp) => setDeleteId(wp.id);

  const confirmDelete = () => {
    if (!deleteId) return;
    setWaypoints((prev) => prev.filter((w) => w.id !== deleteId));
    setDeleteId(null);
  };

  // Future "Delete last N" / rewind support — call this with the index
  // (in routePoints terms) of the LAST waypoint you want to keep. Skips
  // the START point and any null ids.
  // eslint-disable-next-line no-unused-vars
  const deleteWaypointsAfter = (keepThroughIndex) => {
    const toDelete = routePoints
      .slice(keepThroughIndex + 1)
      .filter((p) => p.kind !== "start" && p.id)
      .map((p) => p.id);
    if (toDelete.length === 0) return;
    setWaypoints((prev) => prev.filter((w) => !toDelete.includes(w.id)));
  };

  // ── Push-to-talk voice command mode ───────────────────────────────
  //
  // Flow: tap 🎙 Record → GPS snap + start recording → user speaks →
  //       silence timeout → commit waypoint → back to off.
  // No wake word; the button is the trigger. Phase B will add a
  // Bluetooth/media-key trigger that emulates the button tap.

  // ── Pending waypoint (snap-first) helpers — manual "Add Waypoint" tap ─

  const clearPendingTimer = () => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  };

  // Helper: add a waypoint from a parsed voice command.
  // gpsOverride — when provided (HF snap-on-wake-word), uses the GPS position
  // captured at wake-word time and commits the waypoint directly without going
  // through the pending-waypoint timer. When null, falls through to the
  // pending-waypoint flow (Roger's manual snap path).
  const commitVoiceWaypoint = (cmd, gpsOverride = null) => {
    const gps = gpsOverride ?? currentGPSRef.current;
    if (!gps) {
      console.warn("Hands-free: GPS not ready, command dropped:", cmd);
      return;
    }

    // ── Free / guest tier: max waypoints per stage ────────────────────────────
    if (planLimits.waypoints !== Infinity) {
      const nonStartCount = waypoints.filter(
        (w) => w.kind !== "start" && w.poi !== "START",
      ).length;
      if (nonStartCount >= planLimits.waypoints) {
        // Can't show a blocking modal while driving — log silently and return.
        console.warn(
          "planLimits: waypoint limit reached, voice command dropped",
        );
        return;
      }
    }

    // Sync UI type / icon selections to match the voice command in both paths.
    if (cmd.type) setWaypointType(cmd.type);
    if (cmd.type && cmd.iconId && cmd.type in iconIdByCategory) {
      setIconForCategory(cmd.type, cmd.iconId);
    }
    if (cmd.poi) setPoi(cmd.poi);

    if (gpsOverride) {
      // ── HF snap path: GPS was locked at wake-word time; commit immediately ──
      setWaypoints((prev) => {
        const curFix = { lat: Number(gps.lat), lon: Number(gps.lon) };

        const lastWaypointDistance =
          prev.length > 0
            ? Number(prev[prev.length - 1]?.distanceFromStartM || 0)
            : 0;

        const segmentFromLastWaypoint =
          prev.length > 0
            ? haversineMeters(
                {
                  lat: Number(prev[prev.length - 1].lat),
                  lon: Number(prev[prev.length - 1].lon),
                },
                curFix,
              )
            : startGPS &&
                Number.isFinite(Number(startGPS.lat)) &&
                Number.isFinite(Number(startGPS.lon))
              ? haversineMeters(
                  { lat: Number(startGPS.lat), lon: Number(startGPS.lon) },
                  curFix,
                )
              : 0;

        const distanceFromStartM =
          prev.length > 0
            ? lastWaypointDistance +
              (Number.isFinite(segmentFromLastWaypoint)
                ? segmentFromLastWaypoint
                : 0)
            : Number.isFinite(segmentFromLastWaypoint)
              ? segmentFromLastWaypoint
              : 0;

        const next = {
          id:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          lat: gps.lat,
          lon: gps.lon,
          poi: (cmd.poi || "").trim(),
          timestamp: new Date().toISOString(),
          kind: "waypoint",
          type: cmd.type,
          iconId: cmd.iconId,
          distanceFromStartM,
        };

        return applyCapturePolicy(prev, next);
      });
      setPoi("");
      return;
    }

    // ── Manual snap path (no gpsOverride): pending-waypoint flow ────────────
    // If a pending waypoint already exists, voice refines it in place
    // (type/iconId/POI update the pending slot; timer resets via useEffect).
    if (pendingWaypointRef.current) {
      return; // UI state already synced above; let the existing timer fire.
    }

    // No pending — create a new pending snapshot from the current live GPS.
    const pending = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      lat: gps.lat,
      lon: gps.lon,
      timestamp: new Date().toISOString(),
      type: cmd.type,
      iconId: cmd.iconId,
      poi: cmd.poi || "",
      expiresAt: Date.now() + snapWindowMs,
    };
    pendingWaypointRef.current = pending;
    setPendingWaypoint(pending);
    startPendingTimer(snapWindowMs);
  };

  const startPendingTimer = (ms) => {
    clearPendingTimer();
    pendingTimerRef.current = setTimeout(
      () => {
        commitPendingWaypoint();
      },
      Math.max(500, ms ?? snapWindowMs),
    );
  };

  const commitPendingWaypoint = () => {
    clearPendingTimer();
    const pending = pendingWaypointRef.current;
    if (!pending) return;

    pendingWaypointRef.current = null;
    setPendingWaypoint(null);

    setWaypoints((prev) => {
      const curFix = { lat: Number(pending.lat), lon: Number(pending.lon) };

      const lastWaypointDistance =
        prev.length > 0
          ? Number(prev[prev.length - 1]?.distanceFromStartM || 0)
          : 0;

      const segmentFromLastWaypoint =
        prev.length > 0
          ? haversineMeters(
              {
                lat: Number(prev[prev.length - 1].lat),
                lon: Number(prev[prev.length - 1].lon),
              },
              curFix,
            )
          : startGPS &&
              Number.isFinite(Number(startGPS.lat)) &&
              Number.isFinite(Number(startGPS.lon))
            ? haversineMeters(
                {
                  lat: Number(startGPS.lat),
                  lon: Number(startGPS.lon),
                },
                curFix,
              )
            : 0;

      const distanceFromStartM =
        prev.length > 0
          ? lastWaypointDistance +
            (Number.isFinite(segmentFromLastWaypoint)
              ? segmentFromLastWaypoint
              : 0)
          : Number.isFinite(segmentFromLastWaypoint)
            ? segmentFromLastWaypoint
            : 0;

      const next = {
        id: pending.id,
        lat: pending.lat,
        lon: pending.lon,
        poi: (pending.poi || "").trim(),
        timestamp: pending.timestamp,
        kind: "waypoint",
        type: pending.type,
        iconId: pending.iconId,
        distanceFromStartM,
      };

      return applyCapturePolicy(prev, next);
    });

    setPoi("");
  };

  const discardPendingWaypoint = () => {
    clearPendingTimer();
    pendingWaypointRef.current = null;
    setPendingWaypoint(null);
    setPoi("");
  };

  // Stop the active recording cycle and return to off — used both as the
  // explicit Stop button handler and as the in-progress Cancel handler.
  const stopVoice = () => {
    clearInterval(snapTimerRef.current);
    snapTimerRef.current = null;
    setSnapCountdown(0);
    voiceRef.current?.stop();
    voiceRef.current = null;
    setVoiceActive(false);
    voiceActiveRef.current = false;
    setVoiceMode("off");
    setVoiceListening(false);
    setVoiceTranscript("");
  };

  // Speech recognition handler — armed by startVoice at the moment of
  // the snap. Owns the silence-timeout commit path and the "cancel" voice
  // command; the snap-timeout path is owned by startVoice's interval.
  const startCommandListening = (snappedGps = null) => {
    voiceRef.current?.stop();

    const handler = createVoiceCommandHandler({
      silenceMs: voiceSilenceMs,
      singleCommand: true,

      onListeningStart: () => {
        setVoiceListening(true);
      },

      onListeningStop: () => {
        setVoiceListening(false);
      },

      onInterim: (text) => {
        setVoiceTranscript(text);
        // Transition to "command" state on first interim speech so the UI
        // shows the user is being heard.
        setVoiceMode("command");
        // Reset the snap countdown — the driver is clearly still speaking,
        // so the auto-commit-as-note fallback should not fire mid-sentence.
        if (snapTimerRef.current) {
          snapRemainingRef.current = snapTimeoutSecRef.current;
          setSnapCountdown(snapRemainingRef.current);
        }
      },

      onCommand: (cmd) => {
        // Cancel the snap countdown — user spoke in time.
        clearInterval(snapTimerRef.current);
        snapTimerRef.current = null;
        setSnapCountdown(0);

        setVoiceTranscript("");

        // "cancel" / "discard" / "abort" — discard the snap and return to off.
        if (cmd.type === "cancel") {
          setVoiceActive(false);
          voiceActiveRef.current = false;
          setVoiceMode("off");
          return;
        }

        playStopSound();
        setVoiceLastCommand(cmd);
        // Commit at the GPS position locked when the user tapped Record.
        commitVoiceWaypoint(cmd, snappedGps);

        // Driving toast
        setVoiceToast(cmd);
        setTimeout(() => setVoiceToast(null), 3000);
        setTimeout(() => setVoiceLastCommand(null), 4000);

        // Return to off — push-to-talk is per-tap, not persistent.
        setVoiceActive(false);
        voiceActiveRef.current = false;
        setVoiceMode("off");
      },

      onComplete: () => {
        // Speech recognition session done — clean up the handler ref.
        // Mode/active state transitions are owned by onCommand or the
        // snap-timeout path in startVoice.
        voiceRef.current = null;
      },

      onError: (msg) => {
        console.warn("Voice command error:", msg);

        // Friendly translation of the most common iOS Safari errors so
        // users understand WHY Record stopped working (rather than
        // staring at a zombie "wait 0s" snap mode).
        const lower = String(msg || "").toLowerCase();
        let friendly = msg || "Voice capture failed.";
        if (lower.includes("not-allowed") || lower.includes("denied")) {
          friendly =
            "Microphone or speech recognition permission denied. On iPhone / iPad check BOTH: (a) Settings → Safari → Microphone is set to Ask or Allow, AND (b) Settings → Privacy & Security → Speech Recognition is ON and Safari is allowed. On Mac / PC: tap the address-bar lock icon for app.routemapper.net and allow microphone. Then reload.";
        } else if (
          lower.includes("not available") ||
          lower.includes("no-speech-recognition")
        ) {
          friendly =
            "Speech recognition isn't available in this browser. Use Safari on iOS / iPadOS, or Chrome on Android / desktop.";
        } else if (lower.includes("could not start")) {
          friendly =
            "Couldn't start the microphone. Close any other tab using the mic, then try again.";
        } else if (lower.includes("audio-capture")) {
          friendly =
            "No microphone detected. Check your headset connection or system audio settings.";
        } else if (lower.includes("network")) {
          // Browser-specific guidance: Edge's speech-rec service
          // (Microsoft's, not Google's) is notoriously flaky and
          // produces this same "network" error even when Chrome
          // works fine on the same machine. Call it out specifically
          // so Edge users don't go hunting through their DNS settings.
          const isEdge =
            typeof navigator !== "undefined" &&
            /Edg\//.test(navigator.userAgent || "");
          friendly = isEdge
            ? "Microsoft Edge's speech recognition service is failing. This is a known Edge issue and isn't caused by anything in RouteMapper — Chrome and Safari use different services and usually work. Try Chrome or Safari on this machine. (Or in Windows: Settings → Privacy & Security → Speech → turn on Online speech recognition.)"
            : "Speech recognition service unreachable. Common causes: an ad-blocking DNS (pi-hole, NextDNS, AdGuard, Cloudflare for Families) blocking Google or Apple speech endpoints, a browser extension intercepting the request, or a VPN. To confirm, try this Google test page in the same browser: google.com/intl/en/chrome/demos/speech.html — if that fails too, the block is at network or browser level, not in RouteMapper.";
        } else if (lower.includes("service-not-allowed")) {
          friendly =
            "Speech recognition disabled by browser policy. Some browsers (Brave, Vivaldi, hardened Firefox) disable Web Speech for privacy. Try Safari (iOS / iPadOS / macOS) or Chrome / Edge.";
        }

        setVoiceError(friendly);
        // Surface for 8 s — long enough to read at a glance, short
        // enough not to clutter the panel if the user fixes it and
        // tries again.
        setTimeout(() => setVoiceError(null), 8000);

        // Full cleanup — the previous version only cleared the snap
        // timer and left voiceMode === "snap" / voiceActive === true,
        // producing a zombie UI stuck at "wait 0s".
        stopVoice();
      },

      onReady: () => {
        setVoiceTranscript("");
      },
    });

    handler.start();
    voiceRef.current = handler;
  };

  // 🎙 Record — tap to capture one waypoint via voice. GPS locks at the
  // instant of the tap; user speaks within the snap window; silence
  // timeout commits the command; if no speech, snap timer commits a
  // plain note. Either path returns us to "off" — push-to-talk is
  // per-tap, no persistent listening state.
  const startVoice = () => {
    if (voiceActive) return;

    // SNAP at the instant the button is tapped — before any speech.
    const snappedGps = currentGPSRef.current;

    setVoiceActive(true);
    voiceActiveRef.current = true;
    setVoiceMode("snap");
    playStartSound();
    setSnapCountdown(snapTimeoutSecRef.current);

    // Snap timer — auto-commits as a plain note when it expires with no
    // speech. Reset by onInterim while the driver is speaking.
    clearInterval(snapTimerRef.current);
    snapRemainingRef.current = snapTimeoutSecRef.current;
    snapTimerRef.current = setInterval(() => {
      snapRemainingRef.current -= 1;
      setSnapCountdown(snapRemainingRef.current);
      if (snapRemainingRef.current <= 0) {
        clearInterval(snapTimerRef.current);
        snapTimerRef.current = null;
        setSnapCountdown(0);

        if (!voiceActiveRef.current) return;

        // Wrap the commit in try/finally so the off-state cleanup
        // ALWAYS runs, even if playStopSound, commitVoiceWaypoint,
        // or a downstream effect throws. The earlier version skipped
        // the cleanup on throw, leaving the UI stuck in snap mode at
        // "wait 0s" with no way out other than tapping Stop.
        try {
          voiceRef.current?.stop();
          voiceRef.current = null;

          // Generic note is the safest fallback — avoids inheriting the
          // previous waypoint's icon type when the user is silent.
          const cmd = { type: "note", iconId: null, poi: "" };
          playStopSound();
          commitVoiceWaypoint(cmd, snappedGps);
          setVoiceLastCommand(cmd);
          setVoiceToast(cmd);
          setTimeout(() => setVoiceLastCommand(null), 4000);
          setTimeout(() => setVoiceToast(null), 3000);
        } catch (e) {
          console.warn("Voice snap-timeout commit failed:", e);
        } finally {
          // Return to off — guaranteed regardless of any throw above
          setVoiceActive(false);
          voiceActiveRef.current = false;
          setVoiceMode("off");
        }
      }
    }, 1000);

    startCommandListening(snappedGps);
  };

  // Panic timeout — if voiceMode is stuck in "snap" for more than
  // snapTimeoutSec + 10 s (i.e. well past when the snap timer SHOULD
  // have fired and reset us), force a stop. This is a defensive
  // backstop for any code path that leaves the UI in the zombie
  // "wait 0s" state without a clean reset — the kind of bug that
  // surfaces on a specific user's device but never in our own tests.
  useEffect(() => {
    if (voiceMode !== "snap") return;
    const ceilingMs = (snapTimeoutSecRef.current + 10) * 1000;
    const panicId = setTimeout(() => {
      console.warn(
        "Voice panel stuck in snap mode beyond expected window — forcing reset",
      );
      stopVoice();
    }, ceilingMs);
    return () => clearTimeout(panicId);
  }, [voiceMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up active voice capture when stage ends
  useEffect(() => {
    if (!stageActive && voiceActive) {
      stopVoice();
    }
  }, [stageActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // External trigger (Phase B) — Bluetooth headset / foot pedal /
  // presenter clicker / Bluetooth keyboard fires the 🎙 Record button
  // remotely.
  //
  // armRecordTrigger() MUST be called from within a user-gesture event
  // handler (Start Stage tap, External-trigger checkbox toggle).
  // iOS Safari requires the silent audio loop's audio.play() call to
  // originate from a gesture, otherwise it's rejected and the iOS
  // media session stays owned by whichever app was playing audio
  // before (Music, Spotify) — meaning the user's Bluetooth button
  // opens THAT app rather than firing our Record.
  const armRecordTrigger = () => {
    if (recordTriggerRef.current) return; // already armed
    const trigger = createRecordTrigger({
      onTrigger: () => {
        if (voiceActiveRef.current) {
          stopVoice();
        } else {
          startVoice();
        }
      },
    });
    trigger.start();
    recordTriggerRef.current = trigger;
  };

  const disarmRecordTrigger = () => {
    recordTriggerRef.current?.stop();
    recordTriggerRef.current = null;
  };

  // Cleanup-only effect — disarms when stage ends. Arming happens in
  // handleStartStage (gesture context).
  useEffect(() => {
    if (!stageActive) disarmRecordTrigger();
  }, [stageActive]);

  // ── Silent-loop audio-status indicator ────────────────────────────
  // Polls the trigger's audioStatus() so the Voice panel header can
  // show "🎧 ✓" (loop playing — BT triggers will work) vs "🎧 ⚠️"
  // (loop rejected — BT triggers will hit other apps). Diagnostic
  // value: users don't have to swipe down to Control Center to know
  // whether their setup is working.
  const [triggerAudioStatus, setTriggerAudioStatus] = useState("idle");
  useEffect(() => {
    if (!stageActive || !externalTriggerEnabled) {
      setTriggerAudioStatus("idle");
      return;
    }
    const tick = () => {
      const s = recordTriggerRef.current?.audioStatus?.() || "idle";
      setTriggerAudioStatus(s);
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => clearInterval(id);
  }, [stageActive, externalTriggerEnabled]);

  // Track recording config
  const TRACK_INTERVAL_MS = 5000; // minimum ms between recorded points
  const TRACK_MIN_MOVE_M = 5; // minimum movement in metres to record a point

  // Refs used inside the GPS callback (refs avoid stale closure issues)
  const trackLastRef = useRef(null); // last accepted track point
  const stageActiveRef = useRef(false); // mirrors stageActive for use inside watchPosition
  const lastTrackTimeRef = useRef(0); // ms timestamp of last recorded track point

  useEffect(() => {
    stageActiveRef.current = stageActive;
  }, [stageActive]);

  // ✅ Start GPS automatically — track recording is done here rather than in a
  // setInterval, because iOS throttles/suspends timers when the screen dims or
  // Safari goes to the background. The watchPosition callback remains active.
  useEffect(() => {
    const geo = navigator.geolocation;
    if (!geo) {
      alert("Geolocation not supported in this browser.");
      return;
    }

    const watchId = geo.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords;

        const gpsFix = {
          lat,
          lon,
          accuracy,
          speed: Number.isFinite(speed) ? speed : null,
          fixTs: pos.timestamp,
          timestamp: new Date(pos.timestamp).toISOString(),
        };
        setCurrentGPS(gpsFix);
        currentGPSRef.current = gpsFix;

        // ── Track point recording ────────────────────────────────────────────
        if (!stageActiveRef.current) return;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        // Discard fixes with very poor accuracy — these are usually network-
        // location guesses (Wi-Fi / cell tower) that iOS returns before GPS
        // satellites are fully acquired. Such fixes can be hundreds of metres
        // to kilometres off the true position and create phantom lines on
        // the map and in the PDF that don't follow any road.
        // 80 m covers good GPS (5–15 m), GPS in light forest (30–50 m), and
        // marginal satellite fixes (50–80 m) while rejecting network-only
        // location estimates (typically >100 m, often >>200 m).
        const TRACK_MAX_ACCURACY_M = 80;
        if (Number.isFinite(accuracy) && accuracy > TRACK_MAX_ACCURACY_M) {
          return;
        }

        const now = Date.now();
        if (now - lastTrackTimeRef.current < TRACK_INTERVAL_MS) return; // time gate

        const curFix = { lat, lon };
        const lastAccepted = trackLastRef.current;

        if (lastAccepted) {
          const lastFix = {
            lat: Number(lastAccepted.lat),
            lon: Number(lastAccepted.lon),
          };
          if (!Number.isFinite(lastFix.lat) || !Number.isFinite(lastFix.lon)) {
            trackLastRef.current = null;
          } else {
            const moved = haversineMeters(lastFix, curFix);
            if (!Number.isFinite(moved) || moved < TRACK_MIN_MOVE_M) return;
          }
        }

        lastTrackTimeRef.current = now;
        setTrackPoints((prev) => {
          const lastPoint = prev.length ? prev[prev.length - 1] : null;
          const segMeters = lastPoint
            ? haversineMeters(
                { lat: Number(lastPoint.lat), lon: Number(lastPoint.lon) },
                curFix,
              )
            : 0;
          const totalMeters =
            (lastPoint?.distanceFromStartM || 0) +
            (Number.isFinite(segMeters) ? segMeters : 0);
          const pt = {
            lat,
            lon,
            time: new Date().toISOString(),
            distanceFromStartM: totalMeters,
          };
          trackLastRef.current = pt;
          return [...prev, pt];
        });
      },
      (err) => console.warn("GPS watch error:", err),
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 20000,
      },
    );

    return () => geo.clearWatch(watchId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // const [stageStartedAt, setStageStartedAt] = useState(null);

  const canChangeMeta = !stageActive; // lock meta while stage is active (recommended)

  const handleNewDay = () => {
    if (stageActive) {
      alert("End the current stage before starting a new day.");
      return;
    }
    setDayNumber((d) => d + 1);
    setRouteNumber(1);
    setRouteName("Route 1");
    setStageNumber(1);
    // optional: clear archive, or keep it
    // setStageArchive([]);
  };

  const routeNameRef = useRef(null);

  const handleNewRoute = () => {
    if (stageActive)
      return alert("End the current stage before starting a new route.");
    setRouteNumber((n) => n + 1);
    setRouteName("");
    setStageNumber(1);
    setTimeout(() => routeNameRef.current?.focus(), 0);
  };

  const handleStartStage = async () => {
    // ── Free / guest tier: max 1 saved stage ─────────────────────────────────
    if (planLimits.stages !== Infinity) {
      const localCount = countLocalStages(localOwner);
      // Also check Supabase for authenticated free users (async, best-effort)
      const remoteCount = user?.id ? await countRemoteStages(user.id) : 0;
      const totalSaved = Math.max(localCount, remoteCount);
      if (totalSaved >= planLimits.stages) {
        setUpgradePrompt(UPGRADE_REASONS.stage_limit);
        return;
      }
    }

    // If the previous (just-ended) stage is still on-screen when the user
    // taps Start Stage to begin the next one, bump the stage counter so we
    // don't overwrite the last stage's numbering. Start Stage is now the
    // single entry point — the explicit "Start New Stage" button was
    // removed since this auto-bump covers the same case.
    const resumingAfterSavedStage =
      trackPoints?.length > 0 || waypoints?.length > 0 || Boolean(startGPS);
    if (resumingAfterSavedStage) {
      setStageNumber((n) => n + 1);
      setShowRoadbookPreview(false);
    }

    // Stage starts: clear current stage data and "arm" the UI
    setStageActive(true);
    setStageStartedAt(new Date().toISOString());

    // Clear stage-scoped data
    setWaypoints([]);
    setPoi("");

    setTrackPoints([]);
    trackLastRef.current = null;
    lastTrackTimeRef.current = 0; // reset time gate so first GPS fix records immediately

    // Capture start GPS at the moment of the tap. If GPS isn't ready yet, the
    // useEffect below will set it the instant a valid fix arrives.  Mirror
    // the start into the waypoints array as a kind:"start" entry so it
    // becomes the canonical row 1 of the roadbook (and any waypoints the
    // user adds immediately after are WP 2, WP 3, … — preventing the bug
    // where a Bump tapped at the same location became row 1 itself).
    if (
      currentGPS &&
      Number.isFinite(currentGPS.lat) &&
      Number.isFinite(currentGPS.lon)
    ) {
      const startGps = {
        lat: currentGPS.lat,
        lon: currentGPS.lon,
        timestamp: new Date().toISOString(),
      };
      setStartGPS(startGps);
      setWaypoints((prev) => upsertStartWaypoint(prev, startGps));
    } else {
      setStartGPS(null);
    }

    // Reset all per-category icon selections to their first variant.
    // setWaypointType("note");
    setIconIdByCategory(DEFAULT_ICON_BY_CATEGORY);

    // Arm the external trigger HERE inside the click handler — this
    // is the user-gesture context iOS Safari needs for the silent
    // audio loop's audio.play() to succeed. Doing it from a useEffect
    // later (after render) makes iOS reject the play() and the iOS
    // media session stays owned by whatever was playing before (Music,
    // Spotify), so the user's Bluetooth media button opens THAT app
    // instead of firing 🎙 Record.
    if (externalTriggerEnabled) {
      armRecordTrigger();
    }
  };

  // Add this state near your other state hooks (once):
  const [isEndingStage, setIsEndingStage] = useState(false);

  // ── Storage capacity gauge ───────────────────────────────────────────
  // Safari iOS silently drops localStorage writes once the ~5 MB
  // per-origin cap is hit — including the autosave draft, which would
  // mean an in-progress stage could be lost on a reload without warning.
  // For a multi-day survey (Lachie's 24-day rally) the surveyor will
  // accumulate dozens of saved stages, so we surface a banner once usage
  // crosses 80% so they know to back up + clear old stages.
  const [storageStatus, setStorageStatus] = useState(() => getStorageStatus());
  useEffect(() => {
    // Refresh on every stage end (largest single write) and once per
    // minute while a stage is recording (autosave keeps growing).
    const tick = () => setStorageStatus(getStorageStatus());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [stageActive, isEndingStage]);

  // ── Auto-Lock onboarding tip ─────────────────────────────────────────
  // iPadOS Auto-Lock defaults to 2-5 min. When the screen sleeps mid-drive
  // iOS suspends Safari and watchPosition stops firing — surveyors get
  // long straight-line gaps in their GPS track. The trackpoint-gap
  // detector at end-stage catches it after the fact; this banner heads
  // it off by reminding the user once, on first load, to set Auto-Lock
  // to Never while surveying. Dismissal persists across reloads.
  const AUTOLOCK_TIP_KEY = "rm_autolock_tip_dismissed_v1";
  const [autolockTipDismissed, setAutolockTipDismissed] = useState(() => {
    try {
      return localStorage.getItem(AUTOLOCK_TIP_KEY) === "true";
    } catch {
      return true; // fail closed — don't pester users if storage is broken
    }
  });
  const dismissAutolockTip = () => {
    setAutolockTipDismissed(true);
    try {
      localStorage.setItem(AUTOLOCK_TIP_KEY, "true");
    } catch {
      // localStorage full or blocked — the in-memory dismiss still
      // hides it for this session, which is enough.
    }
  };

  const handleEndStage = async () => {
    if (isEndingStage) return;
    if (!stageActive) return;

    // Commit any pending waypoint before ending so it isn't lost.
    if (pendingWaypointRef.current) {
      commitPendingWaypoint();
    }

    setIsEndingStage(true);

    await new Promise((r) => setTimeout(r, 0));

    const endedAt = new Date().toISOString();

    const localId = makeLocalId({
      tripName,
      tripDate,
      dayNumber,
      routeNumber,
      stageNumber,
      endedAt,
    });

    const stage = {
      meta: {
        appName: "RouteMapper",
        appVersion: "1.0.0",
        tripName,
        tripDate,
        dayNumber,
        routeNumber,
        routeName,
        stageNumber,
        stageName: `${routeName || `Route ${routeNumber}`} - Stage ${stageNumber}`,
        startedAt: stageStartedAt,
        endedAt,
        local_id: localId,
        // Summary fields stored in meta so history list can display them
        // without loading the full payload.
        waypointCount: waypoints.length,
        totalDistanceM: trackPoints.at?.(-1)?.distanceFromStartM ?? 0,
      },
      startGPS,
      trackPoints: Array.isArray(trackPoints) ? trackPoints : [],
      waypoints: Array.isArray(waypoints) ? waypoints : [],
      routePoints: Array.isArray(routePoints) ? routePoints : [],
      roadbook: null,
      local_id: localId,
      created_at: new Date().toISOString(),
    };

    let roadbook = null;

    // Always capture raw stage data BEFORE roadbook generation so we have it even if generation throws
    try {
      localStorage.setItem("stage_debug", JSON.stringify(stage));
      console.log(
        "[stage_debug] saved to localStorage — trackPoints:",
        stage.trackPoints?.length,
        "waypoints:",
        stage.waypoints?.length,
      );
    } catch (storageErr) {
      console.warn("[stage_debug] localStorage save failed:", storageErr);
    }

    try {
      roadbook = generateRoadbook(stage);
    } catch (err) {
      console.error("Roadbook generation failed", err);
    }

    const stageWithRoadbook = {
      ...stage,
      roadbook,
    };

    const canCloudSync = Boolean(user?.id) && navigator.onLine;
    let needsQueue = !canCloudSync;

    try {
      saveStageLocal(localOwner, localId, stageWithRoadbook);

      try {
        // Filename format: TripName_DayN_RouteName_StageName.zip
        // Falls back to Route{N} / Stage{N} when the user never typed a
        // name.  Centralised in stageNaming.js so Drive can construct
        // the same identifier from the loaded stage's meta.
        const base = stageFilenameBase(stage.meta);

        // Render the printable map PDF BEFORE the ZIP is built.  The new
        // pipeline (staticMapRenderer) draws tiles + polyline + markers from
        // scratch onto a canvas — no Leaflet map instance required, so this
        // runs even if the user has Hide Map active.  Best-effort: any
        // failure (network blip, blocked tile server) drops the PDF and
        // ships the rest of the ZIP.
        let mapPdfBlob = null;
        try {
          const lastTrackPt = stageWithRoadbook.trackPoints?.at(-1);
          const totalKm = (lastTrackPt?.distanceFromStartM ?? 0) / 1000;

          const stageWaypoints = stageWithRoadbook.waypoints || [];
          const wpCount = stageWaypoints.filter(
            (w) => w.kind !== "start" && w.poi !== "START",
          ).length;

          // routePositions: start + track points only.  Waypoints are drawn
          // as markers, NOT joined into the polyline.
          const routePts = [];
          if (startGPS?.lat && startGPS?.lon) {
            routePts.push([Number(startGPS.lat), Number(startGPS.lon)]);
          }
          (stageWithRoadbook.trackPoints || []).forEach((p) => {
            if (Number.isFinite(+p.lat) && Number.isFinite(+p.lon)) {
              routePts.push([Number(p.lat), Number(p.lon)]);
            }
          });

          // bounds: every point that should be visible — start + track +
          // waypoints — so fitBounds covers the whole stage.
          const allPts = [...routePts];
          stageWaypoints.forEach((p) => {
            if (Number.isFinite(+p.lat) && Number.isFinite(+p.lon)) {
              allPts.push([Number(p.lat), Number(p.lon)]);
            }
          });
          const bounds = computeBounds(allPts);

          const baseTitle =
            `${tripName || ""} ${routeName || `Route ${routeNumber}`} Stage ${stageNumber}`.trim();

          if (bounds && routePts.length >= 2) {
            const result = await buildMapPdfBlob({
              title: baseTitle,
              date: new Date(),
              totalDistanceKm: totalKm,
              waypointCount: wpCount,
              tileSource: mapSource,
              routePositions: routePts,
              waypoints: stageWaypoints,
              bounds,
              filename: baseTitle || "routemapper-map",
            });
            mapPdfBlob = result?.blob ?? null;
          }
        } catch (mapErr) {
          console.warn(
            "Map PDF render failed — continuing with ZIP without it",
            mapErr,
          );
        }

        // Free / guest: core GPX files only. Paid plans get the full package.
        const fullExport = planLimits.fullExport;
        const blob = await buildRoutePackage(stageWithRoadbook, {
          includeHema: fullExport,
          includeGarmin: fullExport,
          includeRallyNav: fullExport,
          includeGoogleEarth: fullExport,
          includeGaia: fullExport,
          includePdf: false,
          author: profile?.full_name || null,
          mapPdfBlob,
        });

        downloadBlob(`${base}.zip`, blob);
      } catch (e) {
        console.error("Export/ZIP failed", e);
        alert("Stage saved locally, but export failed. Check console.");
      }

      if (canCloudSync) {
        try {
          const { error } = await upsertStageExport({
            userId: user.id,
            localId,
            meta: stageWithRoadbook.meta,
            payload: stageWithRoadbook,
          });

          if (error) {
            console.warn("Supabase sync failed:", error);
            needsQueue = true;
          }
        } catch (err) {
          console.error("Supabase crashed:", err);
          needsQueue = true;
        }
      }

      if (needsQueue) {
        try {
          enqueueStage(stageWithRoadbook);
        } catch (e) {
          console.warn("Enqueue failed:", e);
        }
      }

      if (canCloudSync) {
        try {
          const { flushed, remaining } = await flushPendingQueue(user);
          if (flushed > 0) {
            console.log(`✅ Flushed ${flushed} pending stage(s)`);
          }
          setPendingCount(remaining);
        } catch (err) {
          console.warn("Queue flush failed:", err);
          setPendingCount(readPendingQueue().length);
        }
      } else {
        setPendingCount(readPendingQueue().length);
      }

      setStageArchive((prev) => [...prev, stageWithRoadbook]);

      // Trackpoint-gap detector — surfaces recording pauses (iOS
      // background-tab suspension, screen sleep) before the surveyor
      // drives away from the site. Catches the one data-quality risk
      // that Starlink/network reliability can't fix. Pure data check;
      // does not block stage save.
      try {
        const gaps = findTrackpointGaps(stageWithRoadbook.trackPoints);
        if (gaps.length > 0) {
          const message = summariseGaps(gaps);
          if (message) alert(message);
        }
      } catch (e) {
        console.warn("trackpoint gap detection failed:", e);
      }
    } finally {
      // Stage is complete. We intentionally DO NOT clear the on-screen
      // state (trackPoints, waypoints, startGPS, roadbook, map view) here —
      // the user can still review the route on-screen after saving.
      // Cleanup happens when they tap Start Stage to begin the next one
      // (handleStartStage detects the leftover state and bumps the stage
      // number before clearing).
      setStageActive(false);
      setStageStartedAt(null);

      try {
        // Don't wipe the draft on end-stage — leave the just-ended
        // stage's data in the slot so Review can open it ("review
        // what I just finished"). The Resume-unsaved-stage prompt at
        // startup filters on `stageActive` (line 894), so it
        // correctly ignores ended drafts. Starting a new stage
        // overwrites this slot via the autosave the moment
        // `stageActive` flips back to true. Matches the autosave
        // shape so Review's loadStageDraft reads it identically to
        // a live draft.
        const endedDraft = {
          savedAt: new Date().toISOString(),
          tripName,
          tripDate,
          dayNumber,
          routeNumber,
          routeName,
          stageNumber,
          stageActive: false,
          stageStartedAt,
          startGPS,
          trackPoints,
          waypoints,
          waypointType,
          iconIdByCategory,
          poi,
        };
        localStorage.setItem(STAGE_DRAFT_KEY, JSON.stringify(endedDraft));
      } catch {
        // ignore
      }

      setIsEndingStage(false);
    }
  };

  // ── Stage History ────────────────────────────────────────────────────────────

  // Open a historical stage in read-only review mode.
  const handleOpenHistoryStage = (stage) => {
    setReviewStage(stage);
    setHistoryOpen(false);
  };

  // Exit review mode — returns to the normal (post-save or idle) screen.
  const handleCloseReview = () => {
    setReviewStage(null);
  };

  // Re-export the currently reviewed stage as a ZIP.
  //
  // Warns first when a roadbook is present — re-export regenerates
  // roadbook.docx from stage.json, which silently discards any edits
  // the user has made to their copy of the previous DOCX. The
  // Drive Mode reader can overlay an edited DOCX (M5), but only the
  // ZIP-internal copy; a re-export starts that overlay from a fresh
  // unedited DOCX. Better to ask once than to surprise the user later.
  const handleReExportStage = async () => {
    if (!reviewStage) return;

    if (reviewStage.roadbook) {
      const ok = window.confirm(
        "Re-export this stage?\n\n" +
          "This regenerates roadbook.docx from the saved stage data. " +
          "Any edits you have made to your existing copy of the DOCX " +
          "(typo fixes, custom prose, formatting) will NOT be in the new ZIP — " +
          "they live only in the file on your device.\n\n" +
          "Continue?",
      );
      if (!ok) return;
    }

    try {
      const blob = await buildRoutePackage(reviewStage, {
        includeHema: true,
        includeGarmin: true,
        includeRallyNav: true,
        includeGoogleEarth: true,
        includeGaia: true,
        includePdf: false,
        author: profile?.full_name || null,
      });
      // Same filename format as the stage-end export — see stageNaming.js
      const base = stageFilenameBase(reviewStage.meta || {});
      downloadBlob(`${base}.zip`, blob);
    } catch (err) {
      console.error("Re-export failed", err);
      alert("Re-export failed — see console for details.");
    }
  };

  // Data to display on the map: historical stage overrides live session.
  const displayWaypoints = reviewStage
    ? reviewStage.waypoints || []
    : waypoints;
  const displayTrackPoints = reviewStage
    ? reviewStage.trackPoints || []
    : trackPoints;
  const displayStartGPS = reviewStage ? reviewStage.startGPS : startGPS;

  // Update the start position to the current GPS — used by the 🚩 Update
  // Start auxiliary button when the user notices the stage actually starts
  // a little further on than where they first tapped Start Stage.
  //
  // Also offers to discard any non-start waypoints recorded BEFORE the new
  // start time. Without this cleanup, voice-rec tests done immediately
  // after the original Start Stage tap survive as orphaned 03:53-style
  // waypoints in the saved stage. Rally Navigator's free-tier renderer
  // then connects them with straight diagonals, producing a visible
  // zigzag at the start of the route. Confirm-rather-than-silent so we
  // don't surprise the user who deliberately added waypoints first and
  // corrected the start position afterwards.
  const handleUpdateStart = () => {
    if (
      !Number.isFinite(currentGPS?.lat) ||
      !Number.isFinite(currentGPS?.lon)
    ) {
      return alert("GPS not ready yet — wait a moment and try again.");
    }

    const startGps = {
      lat: currentGPS.lat,
      lon: currentGPS.lon,
      timestamp: new Date().toISOString(),
    };
    const startMs = Date.parse(startGps.timestamp);

    const isStale = (w) => {
      if (w.kind === "start" || w.poi === "START") return false;
      const t = Date.parse(w.timestamp || w.time || "");
      return Number.isFinite(t) && t < startMs;
    };

    const staleCount = (waypoints || []).filter(isStale).length;
    if (staleCount > 0) {
      const ok = confirm(
        `Update start to current position?\n\n` +
          `This will remove ${staleCount} waypoint${
            staleCount === 1 ? "" : "s"
          } recorded before the new start time ` +
          `(typically leftover voice tests).`,
      );
      if (!ok) return;
    }

    setStartGPS(startGps);
    // Keep the kind:"start" entry in the waypoints array in sync with the
    // new start position, and drop any non-start entries that predate it.
    setWaypoints((prev) =>
      upsertStartWaypoint(
        (prev || []).filter((w) => !isStale(w)),
        startGps,
      ),
    );
  };

  // Auto-capture start GPS the moment a valid fix arrives, if the user
  // tapped Start Stage before GPS was ready.
  useEffect(() => {
    if (!stageActive) return;
    if (startGPS) return;
    if (
      currentGPS &&
      Number.isFinite(currentGPS.lat) &&
      Number.isFinite(currentGPS.lon)
    ) {
      const startGps = {
        lat: currentGPS.lat,
        lon: currentGPS.lon,
        timestamp: new Date().toISOString(),
      };
      setStartGPS(startGps);
      // Mirror into the waypoints array — see upsertStartWaypoint.
      setWaypoints((prev) => upsertStartWaypoint(prev, startGps));
    }
  }, [stageActive, startGPS, currentGPS]);

  // When the current category's stored icon is missing from the manifest
  // (e.g. the user upgraded and a previously-saved icon id was removed),
  // fall back to the first variant for that category. Generic across all
  // categories — no per-category branches required.
  useEffect(() => {
    const variants = ICONS[waypointType]?.variants || {};
    if (Object.keys(variants).length === 0) return; // e.g. "note" has no variants
    const currentId = iconIdByCategory[waypointType];
    if (!variants[currentId]) {
      const fallback = Object.keys(variants)[0];
      if (fallback) setIconForCategory(waypointType, fallback);
    }
  }, [waypointType, iconIdByCategory]);

  // While a waypoint is pending, apply user edits (type/icon/poi) to the
  // pending slot and reset the auto-commit timer so the user gets a fresh
  // edit window after each change.
  useEffect(() => {
    const pending = pendingWaypointRef.current;
    if (!pending) return;

    const iconId = iconIdByCategory[waypointType] ?? null;

    const updated = {
      ...pending,
      type: waypointType,
      iconId,
      poi: poi.trim(),
      expiresAt: Date.now() + snapWindowMs,
    };
    pendingWaypointRef.current = updated;
    setPendingWaypoint(updated);
    startPendingTimer(snapWindowMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypointType, iconIdByCategory, poi, snapWindowMs]);

  // Tick the countdown display while a waypoint is pending.
  useEffect(() => {
    if (!pendingWaypoint) {
      setPendingRemainingMs(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(
        0,
        (pendingWaypoint.expiresAt ?? 0) - Date.now(),
      );
      setPendingRemainingMs(remaining);
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [pendingWaypoint?.expiresAt, pendingWaypoint]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    };
  }, []);

  const handleAddWaypoint = (typeOverride) => {
    if (typeOverride && typeof typeOverride !== "string") typeOverride = null;
    if (!currentGPS)
      return alert("GPS not ready yet — wait a moment and try again.");

    // ── Free / guest tier: max waypoints per stage ────────────────────────────
    if (planLimits.waypoints !== Infinity) {
      const nonStartCount = waypoints.filter(
        (w) => w.kind !== "start" && w.poi !== "START",
      ).length;
      if (nonStartCount >= planLimits.waypoints) {
        setUpgradePrompt(UPGRADE_REASONS.waypoint_limit);
        return;
      }
    }

    // Snap-first: a tap that arrives while another pending is still open
    // commits the previous pending immediately, then snaps a new one.
    if (pendingWaypointRef.current) {
      commitPendingWaypoint();
    }

    // Min-move guard — still useful to suppress accidental double-taps while
    // Min-move guard REMOVED (was here as the "stationary" check).
    // It blocked legitimate multi-waypoint scenarios where users want
    // several icons at one GPS position:
    //   - rally controls (control + fuel + service all at the same spot)
    //   - trail intersections (danger + caution + note)
    //   - testing at the desk
    //   - stationary at lights flagging a hazard ahead
    // Genuine accidental double-taps are already handled by the snap-
    // first flow — the second tap commits the first pending and opens
    // a new one with a Discard button. Users see both and can act,
    // rather than wondering why their tap did nothing.

    const typeToSave = typeOverride ?? waypointType;
    const iconId =
      iconIdByCategory[typeToSave] ??
      DEFAULT_ICON_BY_CATEGORY[typeToSave] ??
      null;

    // If a typeOverride was passed, sync the UI selection so the panel
    // reflects the pending waypoint's type.
    if (typeOverride && typeOverride !== waypointType) {
      setWaypointType(typeOverride);
    }

    const pending = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      lat: currentGPS.lat,
      lon: currentGPS.lon,
      timestamp: new Date().toISOString(),
      type: typeToSave,
      iconId,
      poi: poi.trim(),
      expiresAt: Date.now() + snapWindowMs,
    };

    pendingWaypointRef.current = pending;
    setPendingWaypoint(pending);
    startPendingTimer(snapWindowMs);
  };

  const routePoints = useMemo(() => {
    const pts = [];

    // 1) Always start with startGPS if available
    if (startGPS) {
      const lat = Number(startGPS.lat);
      const lon = Number(startGPS.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        pts.push({
          lat,
          lon,
          timestamp: startGPS.timestamp ?? "",
          poi: "START",
          kind: "start",
          segmentMeters: 0,
          totalMeters: 0,
        });
      }
    }

    // 2) Then add all NON-start waypoints sorted by timestamp
    const rest = (waypoints || [])
      .filter((wp) => wp.kind !== "start" && wp.poi !== "START")
      .sort((a, b) => {
        const aTime = a.timestamp ? Date.parse(a.timestamp) : 0;
        const bTime = b.timestamp ? Date.parse(b.timestamp) : 0;
        return aTime - bTime;
      });

    pts.push(...rest);

    // ✅ NEW: calculate cumulative distances so the exporter has correct values
    let cumulativeMeters = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) {
        pts[i] = { ...pts[i], segmentMeters: 0, totalMeters: 0 };
      } else {
        const seg = haversineMeters(pts[i - 1], pts[i]);
        const segM = Number.isFinite(seg) ? seg : 0;
        cumulativeMeters += segM;
        pts[i] = {
          ...pts[i],
          segmentMeters: segM,
          totalMeters: cumulativeMeters,
        };
      }
    }
    console.log(
      "routePoints distances:",
      pts.map((p) => p.totalMeters),
    );
    return pts;
  }, [startGPS, waypoints]);

  const distanceRows = useMemo(() => {
    // routePoints is already ordered and has START included
    const pts = routePoints || [];
    if (pts.length === 0) return { legs: [], totalMeters: 0 };

    let total = 0;
    const legs = [];

    // Helper: give points a friendly label
    const labelFor = (p, idx) => {
      const isStart = p.kind === "start" || p.poi === "START";
      if (isStart) return "START";

      // "Waypoint N" counting only non-start points
      const n = pts
        .slice(0, idx + 1)
        .filter((x) => x.kind !== "start" && x.poi !== "START").length;

      return `Waypoint ${n}`;
    };

    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];

      const seg = haversineMeters(a, b);
      total += seg;

      legs.push({
        key: `${b.timestamp ?? i}`,
        from: labelFor(a, i - 1),
        to: labelFor(b, i),
        segmentMeters: seg,
        totalMeters: total,
        // optional: show POI text on the "to" point
        poi: b.poi && b.poi !== "START" ? b.poi : "",
      });
    }

    return { legs, totalMeters: total };
  }, [routePoints]);

  const roadbookPreviewStage = useMemo(() => {
    return {
      meta: {
        appName: "RouteMapper",
        appVersion: "1.0.0",
        tripName,
        tripDate,
        dayNumber,
        routeNumber,
        routeName,
        stageNumber,
        stageName: `${routeName || `Route ${routeNumber}`} - Stage ${stageNumber}`,
        startedAt: stageStartedAt,
        endedAt: null,
        local_id: "preview",
      },
      startGPS,
      trackPoints: Array.isArray(trackPoints) ? trackPoints : [],
      waypoints: Array.isArray(waypoints) ? waypoints : [],
      routePoints: Array.isArray(routePoints) ? routePoints : [],
      roadbook: null,
      local_id: "preview",
      created_at: new Date().toISOString(),
    };
  }, [
    tripName,
    tripDate,
    dayNumber,
    routeNumber,
    routeName,
    stageNumber,
    stageStartedAt,
    startGPS,
    trackPoints,
    waypoints,
    routePoints,
  ]);

  const roadbookPreview = useMemo(() => {
    const hasEnoughData =
      (trackPoints?.length || 0) >= 3 || (waypoints?.length || 0) >= 1;

    if (!hasEnoughData) return null;

    try {
      return generateRoadbook(roadbookPreviewStage);
    } catch (err) {
      console.error("Roadbook preview generation failed", err);
      return null;
    }
  }, [roadbookPreviewStage, trackPoints, waypoints]);

  const previewRows =
    roadbookPreview?.views?.driver?.slice(0, 25) ||
    roadbookPreview?.rows?.slice(0, 25) ||
    [];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* ── Upgrade prompt modal ───────────────────────────────────────────── */}
      {upgradePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 flex flex-col gap-4">
            <h2 className="text-lg font-bold text-gray-900">
              {upgradePrompt === UPGRADE_REASONS.browse
                ? "Upgrade your plan"
                : "Upgrade Required"}
            </h2>
            <p className="text-sm text-gray-600 whitespace-pre-line">
              {upgradePrompt}
            </p>

            {/* Guest users must sign up before paying */}
            {guestMode ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-gray-500">
                  Create a free account to upgrade to a paid plan.
                </p>
                <button
                  className="btn btn-rally btn-green"
                  onClick={() => {
                    setUpgradePrompt(null);
                  }}
                >
                  Sign Up
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {/* Event Pass */}
                <button
                  className="w-full text-left border rounded-xl p-3 hover:bg-gray-50 transition"
                  onClick={() => {
                    setUpgradePrompt(null);
                    redirectToCheckout(
                      STRIPE_PRICES.event_pass,
                      "event_pass",
                      session,
                    ).catch((e) => alert(e.message));
                  }}
                >
                  <div className="font-semibold text-sm">Event Pass — A$39</div>
                  <div className="text-xs text-gray-500">
                    1 trip · unlimited stages · 60 days · one-time
                  </div>
                </button>

                {/* Solo */}
                <div className="border rounded-xl p-3 flex flex-col gap-1">
                  <div className="font-semibold text-sm">Solo</div>
                  <button
                    className="w-full text-xs bg-gray-100 rounded-lg p-2 hover:bg-gray-200 transition"
                    onClick={() => {
                      setUpgradePrompt(null);
                      redirectToCheckout(
                        STRIPE_PRICES.solo_monthly,
                        "solo_monthly",
                        session,
                      ).catch((e) => alert(e.message));
                    }}
                  >
                    A$9.99 / month
                  </button>
                  <div className="text-xs text-gray-500">
                    Unlimited · non-commercial · single user
                  </div>
                </div>

                {/* Pro */}
                <div className="border rounded-xl p-3 flex flex-col gap-1">
                  <div className="font-semibold text-sm">Pro</div>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 text-xs bg-gray-100 rounded-lg p-2 hover:bg-gray-200 transition"
                      onClick={() => {
                        setUpgradePrompt(null);
                        redirectToCheckout(
                          STRIPE_PRICES.pro_monthly,
                          "pro_monthly",
                          session,
                        ).catch((e) => alert(e.message));
                      }}
                    >
                      A$29.99 / month
                    </button>
                    <button
                      className="flex-1 text-xs bg-gray-100 rounded-lg p-2 hover:bg-gray-200 transition"
                      onClick={() => {
                        setUpgradePrompt(null);
                        redirectToCheckout(
                          STRIPE_PRICES.pro_yearly,
                          "pro_yearly",
                          session,
                        ).catch((e) => alert(e.message));
                      }}
                    >
                      A$249 / year
                    </button>
                  </div>
                  <div className="text-xs text-gray-500">
                    Unlimited · commercial use · up to 10 users
                  </div>
                </div>
              </div>
            )}

            <button
              className="text-sm text-gray-400 hover:text-gray-600 text-center"
              onClick={() => setUpgradePrompt(null)}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* ── Billing result toast ───────────────────────────────────────────── */}
      {billingToast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${
            billingToast === "success" ? "bg-green-600" : "bg-gray-500"
          }`}
        >
          {billingToast === "success"
            ? "✓ Payment successful — your plan has been upgraded!"
            : "Checkout cancelled — no payment was taken."}
        </div>
      )}

      {/* ── Auto-Lock onboarding tip (one-time) ────────────────────────────
          iPadOS Auto-Lock defaults to 2-5 min; when the screen sleeps the
          tab is suspended and GPS recording silently pauses. Dismissed
          state persists in localStorage so the user only sees it once. */}
      {!autolockTipDismissed && (
        <div
          className="px-4 py-2 text-sm border-b bg-blue-50 border-blue-200 text-blue-800"
          role="note"
        >
          <div className="mx-auto max-w-6xl flex items-start gap-2">
            <span className="text-base leading-none mt-0.5">💡</span>
            <div className="flex-1">
              <div className="font-medium">
                Before you start surveying, turn off Auto-Lock
              </div>
              <div className="text-xs mt-0.5 opacity-90">
                On the iPad: Settings → Display & Brightness → Auto-Lock →
                Never. If the screen sleeps mid-drive, GPS recording pauses
                until you wake it again.
              </div>
            </div>
            <button
              type="button"
              onClick={dismissAutolockTip}
              className="shrink-0 px-3 py-1 rounded-lg text-xs font-semibold border border-blue-300 text-blue-700 bg-white hover:bg-blue-100 transition-colors"
              aria-label="Dismiss Auto-Lock tip"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Storage capacity warning ───────────────────────────────────────
          Safari iOS silently drops localStorage writes once the per-origin
          cap (~5 MB) is hit — including the autosave draft — so we surface
          a banner as the user approaches the limit. Stays visible (no
          dismiss) until usage actually falls below the threshold; the
          intended action is to export and delete old saved stages from
          History. */}
      {storageStatus.isWarning && (
        <div
          className={`px-4 py-2 text-sm border-b ${
            storageStatus.isCritical
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
          role="alert"
        >
          <div className="mx-auto max-w-6xl flex items-start gap-2">
            <span className="text-base leading-none mt-0.5">
              {storageStatus.isCritical ? "🛑" : "⚠️"}
            </span>
            <div className="flex-1">
              <div className="font-medium">
                {storageStatus.isCritical
                  ? `Device storage is almost full (${formatBytes(storageStatus.bytes)} of ~${formatBytes(storageStatus.limitBytes)}).`
                  : `Device storage is filling up (${formatBytes(storageStatus.bytes)} of ~${formatBytes(storageStatus.limitBytes)} used).`}
              </div>
              <div className="text-xs mt-0.5 opacity-90">
                {storageStatus.isCritical
                  ? "New stages may fail to save. Open History, export any stages you want to keep, then delete them from this device."
                  : "Open History and export + delete older stages once they're safe in the cloud, so the next stage has room to save."}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER
          Redesigned (feat/nav-redesign) to reclaim vertical real estate
          on iPad/phone:
            • Single-line title block (logo + trip name + ⓘ popover for
              Day/Route/Stage metadata) instead of the old 3-line stack.
            • ModePicker centred on desktop (segmented pill) / fixed
              bottom tabs on phone & iPad-portrait.
            • Status badges (cloud sync, plan) stay visible; secondary
              actions (Account, Manage billing, Support, Sign out, build
              stamp) move into the ··· OverflowMenu.
          Behaviour of every existing action is preserved. */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b">
        <div className="mx-auto max-w-6xl px-3 py-2 flex items-center justify-between gap-3">
          {/* LEFT — logo + trip name + ⓘ trip-details popover */}
          <div className="relative flex items-center gap-2 min-w-0" ref={tripInfoRef}>
            <img
              src={rrmLogo}
              alt="RouteMapper"
              className="h-9 w-9 rounded shrink-0"
            />
            <div className="font-semibold text-gray-900 truncate min-w-0" title={tripName || "Untitled Trip / Event"}>
              {tripName || (
                <span className="text-gray-400 font-normal">
                  Untitled Trip / Event
                </span>
              )}
            </div>
            <button
              type="button"
              className="shrink-0 p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              onClick={() => setShowTripInfo((v) => !v)}
              aria-label="Trip details"
              aria-expanded={showTripInfo}
              title="Trip details"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </button>
            {showTripInfo && (
              <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-lg border px-3 py-2 text-xs text-gray-700 whitespace-nowrap z-40">
                Day {dayNumber} · {routeName || `Route ${routeNumber}`} · Stage{" "}
                {stageNumber}
              </div>
            )}
          </div>

          {/* CENTER — mode picker (segmented on ≥md, bottom tabs <md) */}
          <ModePicker />

          {/* RIGHT — status badges + overflow */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Cloud sync — dot always visible; label hides on tiny screens */}
            <div
              className={`text-xs sm:text-sm px-2 sm:px-3 py-1 rounded-full font-medium
                ${cloud.color} bg-opacity-15 text-green-700`}
              title={`Sync: ${cloud.label}`}
            >
              <span className="mr-1">{cloud.dot}</span>
              <span className="hidden sm:inline font-medium">{cloud.label}</span>
            </div>

            {/* Plan badge — hidden on tiny viewports; still shown in overflow info */}
            {(() => {
              const planLabels = {
                free: { label: "Free", cls: "bg-gray-100 text-gray-600" },
                event_pass: {
                  label: "Event Pass",
                  cls: "bg-amber-100 text-amber-700",
                },
                solo_monthly: {
                  label: "Solo",
                  cls: "bg-blue-100 text-blue-700",
                },
                pro_monthly: {
                  label: "Pro",
                  cls: "bg-purple-100 text-purple-700",
                },
                pro_yearly: {
                  label: "Pro",
                  cls: "bg-purple-100 text-purple-700",
                },
              };
              const p = planLabels[plan] ?? planLabels.free;
              return (
                <span
                  className={`hidden sm:inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${p.cls}`}
                >
                  {p.label}
                </span>
              );
            })()}

            {/* Overflow menu — secondary actions previously inline */}
            <OverflowMenu>
              {/* Identity (info row, non-clickable) */}
              <div className="px-3 py-2 text-xs text-gray-500 border-b">
                {user?.email ? (
                  <>
                    Signed in as{" "}
                    <span className="font-medium text-gray-800">
                      {user.email}
                    </span>
                  </>
                ) : (
                  <span>Guest mode</span>
                )}
              </div>

              {user?.id && (
                <OverflowMenuItem onClick={() => setShowAccount(true)}>
                  Account
                </OverflowMenuItem>
              )}

              {user?.id && plan !== "free" && (
                <OverflowMenuItem
                  onClick={() =>
                    redirectToPortal(session).catch((e) => alert(e.message))
                  }
                >
                  Manage billing
                </OverflowMenuItem>
              )}

              {/* Support — opens the user's default mail client pre-filled
                  with diagnostic context (account / plan / version / UA / URL).
                  Path 1 of the stacked plan; Path 2 (in-app form + Resend)
                  tracked in MEMORY backlog for when support volume justifies. */}
              {(user?.id || guestMode) && (
                <OverflowMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = buildSupportMailto({
                      user,
                      plan,
                      guestMode,
                    });
                  }}
                >
                  Support
                </OverflowMenuItem>
              )}

              {user?.id && (
                <OverflowMenuItem onClick={signOut}>Sign out</OverflowMenuItem>
              )}

              {/* Build stamp — short commit SHA + deploy context.  Lets a
                  non-technical user confirm at a glance which build they're
                  on, e.g. when a Netlify deploy preview has updated but the
                  iPad PWA service worker is still serving the prior bundle.
                  Defined by Vite at build time (see __COMMIT_SHA__ in
                  vite.config.js). */}
              <div
                className="px-3 py-2 text-[10px] font-mono text-gray-400 border-t select-all"
                title={`v${
                  typeof __APP_VERSION__ !== "undefined"
                    ? __APP_VERSION__
                    : "?"
                } · ${
                  typeof __BUILD_CONTEXT__ !== "undefined"
                    ? __BUILD_CONTEXT__
                    : "dev"
                } · commit ${
                  typeof __COMMIT_SHA__ !== "undefined" ? __COMMIT_SHA__ : "?"
                }`}
              >
                {typeof __COMMIT_SHA__ !== "undefined" ? __COMMIT_SHA__ : "dev"}
                {typeof __APP_VERSION__ !== "undefined" &&
                  ` · v${__APP_VERSION__}`}
              </div>
            </OverflowMenu>
          </div>
        </div>
      </header>

      {showProfileBanner && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="mx-auto max-w-6xl px-3 py-2 flex items-center gap-3 text-sm">
            <span className="font-semibold text-amber-800">
              Complete your profile
            </span>
            <span className="text-amber-700 hidden sm:inline">
              Please add your full name and (optional) phone to finish setting
              up your account.
            </span>
            <button
              className="ml-auto px-3 py-1 rounded-lg font-semibold text-white"
              style={{ backgroundColor: "#588233" }}
              onClick={() => setShowAccount(true)}
            >
              Open Account
            </button>
            <button
              className="text-amber-700 hover:text-amber-900 underline"
              onClick={() => {
                sessionStorage.setItem("rm_profile_banner_dismissed", "1");
                setProfileBannerDismissed(true);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* MAIN — extra bottom padding on <md viewports so the fixed
          bottom tab bar (ModePicker) doesn't obscure the last section. */}
      <main className="mx-auto max-w-6xl px-3 py-3 pb-20 md:pb-3 space-y-3">
        {/* TOP CONTROLS STRIP */}
        <section className="bg-white rounded-2xl shadow-sm border p-3">
          <div className="grid grid-cols-1 gap-2">
            {/* Row 1: Trip / Event + Day */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
              {editingTripName && !stageActive ? (
                <input
                  ref={tripNameRef}
                  className="w-full px-3 py-2 rounded-xl border bg-gray-50 min-w-0"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  onBlur={() => setEditingTripName(false)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && setEditingTripName(false)
                  }
                  placeholder="Trip Name (e.g. Barossa to Palm Cove)"
                />
              ) : (
                <div
                  className={`w-full px-3 py-2 rounded-xl border min-w-0 font-medium truncate ${stageActive ? "text-gray-400 cursor-default" : "cursor-pointer hover:bg-gray-50"}`}
                  onClick={() => {
                    if (stageActive) return;
                    setEditingTripName(true);
                    setTimeout(() => {
                      tripNameRef.current?.focus();
                      tripNameRef.current?.select();
                    }, 0);
                  }}
                >
                  {tripName || (
                    <span className="text-gray-400 font-normal">Trip Name</span>
                  )}
                </div>
              )}
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-[#588233] text-white font-medium disabled:opacity-50 whitespace-nowrap"
                onClick={handleNewDay}
                disabled={!canChangeMeta}
                title={
                  stageActive
                    ? "End stage first"
                    : "Start a new day within this trip/event"
                }
              >
                New Day
              </button>
              <div className="px-3 py-2 rounded-xl border bg-white text-gray-900 font-semibold whitespace-nowrap">
                Day {dayNumber}
              </div>
            </div>

            {/* Row 2: Route + Stage + Start/End */}
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-[#588233] text-white font-medium disabled:opacity-50 whitespace-nowrap shrink-0"
                onClick={handleNewRoute}
                disabled={stageActive}
                title="Start a new route within this trip/event"
              >
                New Route
              </button>
              <input
                ref={routeNameRef}
                className="flex-1 min-w-[8rem] max-w-[16rem] landscape:max-w-none px-3 py-2 rounded-xl border bg-gray-50 min-w-0"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                disabled={stageActive}
                placeholder="Route name"
              />
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-[#588233] text-white font-medium disabled:opacity-50 whitespace-nowrap shrink-0"
                onClick={handleNewStage}
                disabled={stageActive}
                title="Increment stage number within this route"
              >
                New Stage
              </button>
              <div className="px-3 py-2 rounded-xl border bg-white text-gray-900 font-semibold whitespace-nowrap shrink-0">
                Stage {stageNumber}
              </div>
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-white font-semibold disabled:opacity-50 whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: stageActive ? "#dc2626" : "#588233",
                }}
                onClick={stageActive ? handleEndStage : handleStartStage}
                disabled={isEndingStage}
                title={
                  stageActive
                    ? "End current stage"
                    : "Start a new stage — captures current GPS as the start"
                }
              >
                {isEndingStage
                  ? "Ending..."
                  : stageActive
                    ? "⏹ End Stage"
                    : "Start Stage"}
              </button>
              {stageActive && (
                <button
                  type="button"
                  onClick={handleUpdateStart}
                  className="px-3 py-2 rounded-xl border border-[#588233] text-[#588233] font-semibold bg-white hover:bg-[#588233] hover:text-white whitespace-nowrap shrink-0 transition-colors"
                  title="Capture the current GPS as the new start position for this stage"
                >
                  🚩 Update Start
                </button>
              )}
              {/* History button — always visible when not recording */}
              {!stageActive && (
                <button
                  type="button"
                  onClick={() => {
                    setHistoryOpen((v) => !v);
                    setReviewStage(null);
                  }}
                  className="ml-auto px-3 py-2 rounded-xl border border-[#588233] text-[#588233] font-semibold bg-white hover:bg-[#588233] hover:text-white shrink-0 flex items-center gap-1.5 text-sm transition-colors"
                  title="Browse and re-open saved stages"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6v6l4 2"
                    />
                  </svg>
                  History
                </button>
              )}
            </div>

            {/* ── Stage History panel ───────────────────────────────── */}
            {historyOpen && !stageActive && (
              <div className="mt-3">
                <StageHistoryPanel
                  userId={user?.id ?? null}
                  owner={localOwner}
                  onOpenStage={handleOpenHistoryStage}
                  onClose={() => setHistoryOpen(false)}
                />
              </div>
            )}

            {/* ── Review mode banner ────────────────────────────────── */}
            {reviewStage && (
              <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                    Reviewing saved stage
                  </p>
                  <p className="text-sm text-amber-900 font-medium truncate mt-0.5">
                    {reviewStage.meta?.stageName ||
                      reviewStage.meta?.tripName ||
                      "Unnamed stage"}
                    {reviewStage.meta?.endedAt && (
                      <span className="font-normal text-amber-700 ml-2">
                        {new Date(reviewStage.meta.endedAt).toLocaleDateString(
                          undefined,
                          { day: "numeric", month: "short", year: "numeric" },
                        )}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleReExportStage}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-400 text-amber-800 bg-white hover:bg-amber-100 transition-colors"
                >
                  ↓ Re-export ZIP
                </button>
                <button
                  type="button"
                  onClick={handleCloseReview}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-600 bg-white hover:bg-gray-100 transition-colors"
                >
                  Close Review
                </button>
              </div>
            )}

            {/* Roadbook toggle */}
          </div>
        </section>
        {/* MAP: horizontal, not tall */}

        {mapMode === "review" ? (
          <div className="fixed inset-0 z-50 bg-black">
            {/* EXIT FULLSCREEN BUTTON */}
            <div className="absolute top-4 right-4 z-[60]">
              <button
                onClick={() => setMapMode("normal")}
                className="px-4 py-2 rounded-xl bg-white text-gray-900 shadow-md border"
              >
                Exit Full Screen
              </button>
            </div>
            <MapView
              currentGPS={currentGPS}
              startGPS={displayStartGPS}
              waypoints={displayWaypoints}
              pendingWaypoint={pendingWaypoint}
              trackPoints={displayTrackPoints}
              followMap={followMap}
              mapMode={mapMode}
              mapSource={mapSource}
              resizeKey={showMap ? 1 : 0}
            />
          </div>
        ) : (
          <section className="bg-white rounded-2xl shadow-sm border overflow-hidden isolate">
            <div
              className={
                "transition-all duration-300 overflow-hidden " +
                (showMap ? "h-[100px] sm:h-[180px] md:h-[200px]" : "h-0")
              }
            >
              <MapView
                currentGPS={reviewStage ? null : currentGPS}
                startGPS={displayStartGPS}
                waypoints={displayWaypoints}
                pendingWaypoint={reviewStage ? null : pendingWaypoint}
                trackPoints={displayTrackPoints}
                followMap={followMap}
                mapMode={mapMode}
                mapSource={mapSource}
                resizeKey={showMap ? 1 : 0}
              />
            </div>
          </section>
        )}

        <div className="flex gap-2 items-center">
          <button
            onClick={() => setShowMap((v) => !v)}
            className="px-3 py-2 rounded-xl border"
          >
            {showMap ? "Hide Map" : "Show Map"}
          </button>

          <button
            onClick={() =>
              setMapMode((m) => (m === "review" ? "normal" : "review"))
            }
            className="px-3 py-2 rounded-xl border"
            disabled={!showMap}
          >
            {mapMode === "review" ? "Exit Full Screen" : "Full Screen"}
          </button>

          <select
            value={mapSource}
            onChange={(e) => setMapSource(e.target.value)}
            className="px-3 py-2 rounded-xl border"
            disabled={!showMap}
          >
            <option value="osm">OSM</option>
            <option value="opentopo">OpenTopoMap</option>
            <option value="esri_imagery">Esri Imagery</option>
          </select>

          <button
            type="button"
            className="px-3 py-2 rounded-xl border bg-white text-gray-900 disabled:opacity-50"
            onClick={() => setShowRoadbookPreview((v) => !v)}
            disabled={!stageActive && !(roadbookPreview?.rows?.length > 0)}
            title="Show generated roadbook preview"
          >
            {showRoadbookPreview ? "Hide Roadbook" : "Roadbook Preview"}
          </button>

          <button
            type="button"
            className="px-3 py-2 rounded-xl border bg-white text-gray-900 disabled:opacity-50"
            disabled={exportingMapPdf || !startGPS}
            title="Export the route + waypoints recorded so far as a printable PDF.  Renders the map from scratch (tiles fetched, polyline + markers drawn) — no Leaflet screenshot, so it works even with the map hidden."
            onClick={async () => {
              setExportingMapPdf(true);
              try {
                const lastTrackPt = trackPoints?.[trackPoints.length - 1];
                const totalKm = (lastTrackPt?.distanceFromStartM ?? 0) / 1000;

                // routePositions: start + track points only.  Waypoints are
                // drawn as markers, NOT joined into the polyline.
                const routePts = [];
                if (startGPS?.lat && startGPS?.lon) {
                  routePts.push([Number(startGPS.lat), Number(startGPS.lon)]);
                }
                (trackPoints || []).forEach((p) => {
                  if (Number.isFinite(+p.lat) && Number.isFinite(+p.lon)) {
                    routePts.push([Number(p.lat), Number(p.lon)]);
                  }
                });

                // bounds: every point we want visible (start + track + every
                // waypoint), so the rendered map fits the whole stage.
                // v1 always fit-bounds; mid-stage "honour current zoom" is a
                // potential follow-up.
                const allPts = [...routePts];
                (waypoints || []).forEach((p) => {
                  if (Number.isFinite(+p.lat) && Number.isFinite(+p.lon)) {
                    allPts.push([Number(p.lat), Number(p.lon)]);
                  }
                });
                const bounds = computeBounds(allPts);

                const baseTitle =
                  `${tripName || ""} ${routeName || `Route ${routeNumber}`} Stage ${stageNumber}`.trim();

                if (!bounds || routePts.length < 2) {
                  alert(
                    "Not enough recorded data yet to render a map — start a stage and record at least one track point first.",
                  );
                  return;
                }

                await exportMapAsPdf({
                  title: baseTitle,
                  date: new Date(),
                  totalDistanceKm: totalKm,
                  waypointCount: (waypoints || []).filter(
                    (w) => w.kind !== "start" && w.poi !== "START",
                  ).length,
                  tileSource: mapSource,
                  routePositions: routePts,
                  waypoints: waypoints || [],
                  bounds,
                  filename: baseTitle || "routemapper-map",
                });
              } catch (err) {
                console.error("Export Map PDF failed", err);
                alert(
                  `Could not export map PDF.\n\n${err?.message || err}\n\nIf you're using satellite or topo tiles, try switching to OSM and exporting again.`,
                );
              } finally {
                setExportingMapPdf(false);
              }
            }}
          >
            {exportingMapPdf ? "Exporting…" : "Export Map PDF"}
          </button>

          {/* Right-side cluster: Follow Map toggle + GPS traffic light */}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFollowMap((v) => !v)}
              className={`px-3 py-2 rounded-xl border text-sm font-medium ${
                followMap
                  ? "bg-[#588233] text-white border-[#588233]"
                  : "bg-white text-gray-700"
              }`}
              title={
                followMap
                  ? "Map follows you — tap to stop auto-recentre"
                  : "Map is free — tap to auto-recentre on your position"
              }
            >
              🎯 Follow
            </button>

            {(() => {
              const hasGpsFix =
                currentGPS &&
                Number.isFinite(Number(currentGPS.lat)) &&
                Number.isFinite(Number(currentGPS.lon));
              const gpsTitle = hasGpsFix
                ? `GPS fix: ${Number(currentGPS.lat).toFixed(5)}, ${Number(currentGPS.lon).toFixed(5)}`
                : "Waiting for GPS fix…";
              return (
                <div
                  className={`text-sm px-3 py-1 rounded-full font-medium ${
                    hasGpsFix ? "bg-green-500" : "bg-red-500"
                  } bg-opacity-15`}
                  title={gpsTitle}
                >
                  <span className="mr-1">{hasGpsFix ? "🟢" : "🔴"}</span>
                  <span className="font-medium">GPS</span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* INPUT CONTROLS ROW (above the two columns) */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {showRoadbookPreview && (
            <section className="bg-white rounded-2xl shadow-sm border p-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-semibold">Roadbook Preview</h2>
                  <div className="text-xs text-red-500">
                    {roadbookPreview?.rows?.length || 0} rows
                  </div>
                </div>

                {roadbookPreview?.stats && (
                  <div className="text-xs text-gray-500 text-right">
                    <div>Track pts: {roadbookPreview.stats.rawTrackPoints}</div>
                    <div>
                      Candidates: {roadbookPreview.stats.candidateCount}
                    </div>
                  </div>
                )}
              </div>

              {!roadbookPreview?.rows?.length ? (
                <div className="text-sm text-gray-500">
                  No roadbook rows yet. Start recording track points and add a
                  few waypoints.
                </div>
              ) : (
                <div className="space-y-2">
                  {previewRows.map((row) => (
                    <div
                      key={`${row.index}-${row.kmTotal}-${row.eventType}`}
                      className="border rounded-xl p-3 flex items-center gap-3"
                    >
                      <div
                        className="shrink-0 rounded border bg-white"
                        style={{ width: 72, height: 72 }}
                        dangerouslySetInnerHTML={{
                          __html: renderTulipSvg(
                            row.tulipTemplate || row.eventType,
                            {
                              size: 72,
                              strokeWidth: 8,
                            },
                          ),
                        }}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">
                            {row.eventType}
                          </span>

                          {row.icon && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 border text-gray-700">
                              {row.icon}
                            </span>
                          )}

                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 border text-gray-700">
                            {row.source}
                          </span>
                        </div>

                        <div className="text-sm text-gray-700 mt-1">
                          {row.notes || "—"}
                        </div>

                        <div className="text-xs text-gray-500 mt-1">
                          Total {Number(row.kmTotal || 0).toFixed(2)} km •
                          Partial {Number(row.kmPartial || 0).toFixed(2)} km
                        </div>
                      </div>

                      <div className="text-right text-xs text-gray-500 shrink-0">
                        <div>
                          Confidence{" "}
                          {typeof row.confidence === "number"
                            ? row.confidence.toFixed(2)
                            : "—"}
                        </div>
                        <div>
                          Angle{" "}
                          {typeof row.angle === "number"
                            ? `${Math.round(row.angle)}°`
                            : "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* POI / Icons / Add waypoint */}
          <div className="bg-white rounded-2xl shadow-sm border p-3 md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">Input Controls</h2>
              <div className="text-xs text-gray-500">
                {stageActive ? "Stage active" : "Stage not started"}
              </div>
            </div>

            {/* Snap-first: tap lands first, refinement below */}
            <button
              className="btn btn-primary w-full"
              disabled={!stageActive}
              onClick={() => handleAddWaypoint(null)}
            >
              {pendingWaypoint
                ? "➕ Snap Another Waypoint"
                : "➕ Add Waypoint (Current GPS)"}
            </button>

            <div className="mt-3 flex gap-2 flex-wrap mb-2">
              {ICON_ORDER.map((type) => (
                <IconButton
                  key={type}
                  id={`btn-${type}`}
                  svg={ICONS[type].svg}
                  label={ICONS[type].label}
                  active={waypointType === type}
                  onClick={() => stageActive && setWaypointType(type)}
                  disabled={!stageActive}
                />
              ))}
            </div>

            {/* Variant icons for the currently-selected category — generic
                over all categories. Adding a new category to iconManifest.json
                surfaces its variants here automatically. */}
            {(() => {
              const variants = ICONS[waypointType]?.variants;
              if (!variants || Object.keys(variants).length === 0) return null;
              return (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(variants).map(([id, v]) => (
                      <IconButton
                        key={id}
                        svg={v.svg}
                        label={v.label}
                        active={iconIdByCategory[waypointType] === id}
                        onClick={() => setIconForCategory(waypointType, id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Pending Waypoint dialogue — sits beneath the category +
                variant rows so the user can review the snapped GPS and
                refine icon/type immediately above the Voice panel,
                without the dialogue obscuring the icon picker. */}
            {pendingWaypoint && (
              <div
                className="mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-sm font-semibold text-amber-900">
                      Pending waypoint
                    </span>
                  </div>
                  <span className="text-xs tabular-nums text-amber-700">
                    {(pendingRemainingMs / 1000).toFixed(1)}s
                  </span>
                </div>
                <div className="h-1.5 w-full bg-amber-100 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-amber-500 transition-[width] duration-100 ease-linear"
                    style={{
                      width: `${Math.min(100, (pendingRemainingMs / Math.max(1, snapWindowMs)) * 100)}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-amber-800 mb-2">
                  GPS snapped at{" "}
                  <span className="tabular-nums">
                    {Number(pendingWaypoint.lat).toFixed(5)},{" "}
                    {Number(pendingWaypoint.lon).toFixed(5)}
                  </span>
                  . Refine icon / type / note above — commits automatically.
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={commitPendingWaypoint}
                    className="flex-1 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700"
                  >
                    ✓ Done
                  </button>
                  <button
                    type="button"
                    onClick={discardPendingWaypoint}
                    className="flex-1 px-3 py-2 rounded-lg bg-gray-200 text-gray-800 text-sm font-semibold hover:bg-gray-300"
                  >
                    ✕ Discard
                  </button>
                </div>
              </div>
            )}

            {/* ── Voice (push-to-talk) ──────────────────────────── */}
            <div
              className="mt-3 border-2 rounded-xl p-2"
              style={{
                borderColor:
                  voiceMode === "command"
                    ? "#dc2626"
                    : voiceMode === "snap"
                      ? "#f59e0b"
                      : "#e5e7eb",
                backgroundColor:
                  voiceMode === "command"
                    ? "#fef2f2"
                    : voiceMode === "snap"
                      ? "#fffbeb"
                      : "white",
              }}
            >
              {/* Header row.  LHS: the green Record Voice button, flex-1
                  so it fills the available row width to a generous touch
                  target while its height matches the Add Waypoint button
                  above.  RHS: persistent 🎧 external-trigger status (when
                  armed) and ⚙ settings cog, pinned to the right so they
                  always sit in the same place.  Any voice-mode indicator
                  (📍 GPS locked / Listening) sits between the button and
                  the 🎧/⚙ cluster — visually closer to the button that
                  caused it. */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={voiceActive ? stopVoice : startVoice}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    if (stageActive) {
                      voiceActive ? stopVoice() : startVoice();
                    }
                  }}
                  // Width: flex-1 so the button expands across the rest of
                  // the row beside the compact 🎧/⚙ cluster — easy touch
                  // target.
                  // Height: py-3 (12 px vertical padding) matches the Add
                  // Waypoint button above, giving a consistent rhythm
                  // down the Input Controls column.
                  className="flex-1 px-5 py-3 rounded-xl text-white text-base font-semibold transition-colors min-w-[160px]"
                  style={{
                    backgroundColor: !stageActive
                      ? "#9ca3af"
                      : voiceActive
                        ? "#dc2626"
                        : "#588233",
                    opacity: !stageActive ? 0.5 : 1,
                  }}
                  disabled={!stageActive}
                >
                  {voiceActive ? "⏹ Stop" : "🎙 Record Voice"}
                </button>
                <div className="flex items-center gap-2 flex-wrap">
                  {voiceMode === "snap" && (
                    <>
                      <span
                        className="inline-block w-3 h-3 rounded-full animate-pulse"
                        style={{ backgroundColor: "#f59e0b" }}
                      />
                      <span
                        className="text-sm font-semibold"
                        style={{ color: "#b45309" }}
                      >
                        📍 GPS locked — speak or wait {snapCountdown}s
                      </span>
                    </>
                  )}
                  {voiceMode === "command" && (
                    <>
                      <span
                        className="inline-block w-3 h-3 rounded-full animate-pulse"
                        style={{ backgroundColor: "#dc2626" }}
                      />
                      <span className="text-sm text-red-600 font-medium">
                        Listening...
                      </span>
                    </>
                  )}
                  {externalTriggerEnabled && stageActive && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        triggerAudioStatus === "playing"
                          ? "bg-green-100 text-green-700"
                          : triggerAudioStatus === "rejected"
                            ? "bg-amber-100 text-amber-700"
                            : "text-gray-400"
                      }`}
                      title={
                        triggerAudioStatus === "playing"
                          ? "External trigger armed and audio loop is playing — Bluetooth media buttons WILL route here. Now Playing on iOS Control Center should show 'RouteMapper'."
                          : triggerAudioStatus === "rejected"
                            ? "External trigger armed BUT silent audio loop was rejected by the browser. Bluetooth media buttons will route to whatever app last owned the iOS media session (Music, Spotify…). To fix: tap End Stage, then Start Stage again — the silent loop is started inside that tap's gesture context. If this persists, your iOS Settings → Privacy → Speech Recognition may need to be re-enabled."
                            : "External trigger armed, silent audio loop initialising…"
                      }
                    >
                      🎧
                      {triggerAudioStatus === "playing" && " ✓"}
                      {triggerAudioStatus === "rejected" && " ⚠️"}
                    </span>
                  )}
                  {/* Settings cog — only when idle.  Pinned next to 🎧 on
                      the RHS so the persistent controls sit together. */}
                  {!voiceActive && (
                    <button
                      type="button"
                      onClick={() => setVoiceShowSettings((v) => !v)}
                      className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      title="Voice settings"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Settings panel (collapsible) */}
              {voiceShowSettings && (
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-600">
                        Silence timeout
                      </label>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {(voiceSilenceMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1500}
                      max={5000}
                      step={250}
                      value={voiceSilenceMs}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setVoiceSilenceMs(val);
                        localStorage.setItem("rm_handsfree_silence_ms", val);
                      }}
                      className="w-full accent-blue-600"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                      <span>1.5s (fast)</span>
                      <span>5s (relaxed)</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-600">
                        Snap window (edit after tap)
                      </label>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {(snapWindowMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={2000}
                      max={10000}
                      step={500}
                      value={snapWindowMs}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSnapWindowMs(val);
                        localStorage.setItem("rm_snap_window_ms", val);
                      }}
                      className="w-full accent-blue-600"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                      <span>2s (fast)</span>
                      <span>10s (relaxed)</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-600">
                        Waypoint capture lookback
                      </label>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {waypointLookbackS.toFixed(1)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={0.5}
                      value={waypointLookbackS}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setWaypointLookbackS(val);
                        localStorage.setItem(
                          "rm_waypoint_lookback_s",
                          String(val),
                        );
                      }}
                      className="w-full accent-blue-600"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                      <span>0s (off)</span>
                      <span>3s (slow reactions)</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                      If your waypoints consistently land past their
                      landmarks in Rally Navigator, raise this. Each 0.5 s
                      shifts pins about 11 m back at highway speed. Applied
                      at export time only — no effect on already-exported
                      stages.
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-600">
                        Voice snap window
                      </label>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {snapTimeoutSec}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={3}
                      max={10}
                      step={1}
                      value={snapTimeoutSec}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSnapTimeoutSec(val);
                        localStorage.setItem("rm_handsfree_snap_sec", val);
                      }}
                      className="w-full accent-blue-600"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                      <span>3s (quick)</span>
                      <span>10s (relaxed)</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                      How long after tapping 🎙 Record to wait for a voice
                      command before auto-committing as a plain note.
                    </p>
                  </div>
                  <div className="pt-3 border-t border-gray-200">
                    <label className="flex items-center gap-2 select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={externalTriggerEnabled}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setExternalTriggerEnabled(next);
                          localStorage.setItem(
                            "rm_external_trigger_enabled",
                            String(next),
                          );
                          // Arm/disarm RIGHT HERE inside the click
                          // gesture so iOS Safari accepts the silent
                          // audio loop's audio.play(). Same reason
                          // handleStartStage arms inline.
                          if (next && stageActive) {
                            armRecordTrigger();
                          } else if (!next) {
                            disarmRecordTrigger();
                          }
                        }}
                        className="accent-[#588233]"
                      />
                      <span className="text-xs font-medium text-gray-600">
                        🎧 External trigger
                      </span>
                    </label>
                    <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                      Let external hardware fire the 🎙 Record button: Bluetooth
                      headset (Play/Pause), foot pedal, presenter clicker, or
                      Bluetooth keyboard (Space, PageUp, PageDown, F8). A second
                      press while recording cancels.
                    </p>
                  </div>
                  <div className="text-[11px] text-gray-400 leading-snug">
                    A Bluetooth headset with mic improves accuracy in noisy
                    environments.
                  </div>
                </div>
              )}

              {/* Error feedback — shown even when not voiceActive, so the
                  user sees WHY their Record tap failed (e.g. mic
                  permission denied, browser unsupported). Auto-clears
                  after a few seconds via setTimeout in onError. */}
              {voiceError && (
                <div className="mt-3 text-sm text-red-800 bg-red-50 rounded-lg px-3 py-2 border border-red-200 leading-snug">
                  ⚠️ {voiceError}
                </div>
              )}

              {/* Active state feedback */}
              {voiceActive && (
                <div className="mt-3 space-y-1.5">
                  {voiceTranscript && (
                    <div className="text-sm text-gray-700 italic bg-white/70 rounded-lg px-3 py-2 border border-gray-200">
                      {voiceTranscript}
                    </div>
                  )}
                  {voiceLastCommand && (
                    <div className="text-sm text-green-800 bg-green-50 rounded-lg px-3 py-2 border border-green-200 font-medium">
                      Added: {voiceLastCommand.type}
                      {voiceLastCommand.iconId
                        ? ` (${voiceLastCommand.iconId})`
                        : ""}
                      {voiceLastCommand.poi ? ` — ${voiceLastCommand.poi}` : ""}
                    </div>
                  )}
                  {!voiceTranscript &&
                    !voiceLastCommand &&
                    voiceMode !== "command" && (
                      <div className="text-xs text-gray-400">
                        Speak your command, e.g. "hazard danger two — rocks on
                        track" or "left onto Forbes Road".
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* ── Optional typed POI for the manual Add Waypoint flow ── */}
            <div className="mt-3">
              <textarea
                disabled={!stageActive}
                className="w-full p-2 rounded bg-gray-100 resize-none"
                placeholder="Optional point of interest (typed)"
                rows={1}
                value={poi}
                onChange={(e) => setPoi(e.target.value)}
              />
            </div>

            {/* ── Driving Toast (fixed overlay, visible at arm's length) ── */}
            {voiceToast && (
              <div
                className="fixed inset-x-0 top-8 mx-auto z-50 pointer-events-none flex justify-center"
                style={{ animation: "fadeInOut 3s ease-in-out forwards" }}
              >
                <div className="bg-green-600 text-white rounded-2xl shadow-2xl px-6 py-4 max-w-md text-center">
                  <div className="text-lg font-bold tracking-wide">
                    {voiceToast.type.toUpperCase()}
                    {voiceToast.iconId
                      ? ` — ${voiceToast.iconId.replace(/_/g, " ")}`
                      : ""}
                  </div>
                  {voiceToast.poi && (
                    <div className="text-sm mt-1 opacity-90">
                      {voiceToast.poi}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* BELOW MAP: 2 columns */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* LEFT: Waypoints */}
          <div className="bg-white rounded-2xl shadow-sm border p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">Waypoints</h2>
              <div className="text-xs text-gray-500">
                {waypoints.length} total
              </div>
            </div>

            {/* WAYPOINT LOG (compact) */}
            <div className="divide-y">
              {routePoints.length === 0 ? (
                <div className="text-sm text-gray-500 py-3">
                  No waypoints yet.
                </div>
              ) : (
                routePoints.map((wp, idx) => {
                  const isStart = wp.kind === "start" || wp.poi === "START";
                  const wpNumber = isStart
                    ? "START"
                    : routePoints
                        .slice(0, idx + 1)
                        .filter((p) => p.kind !== "start" && p.poi !== "START")
                        .length;

                  const label = isStart
                    ? "START"
                    : wp.poi?.trim() || `WP ${wpNumber}`;

                  const segKm = (Number(wp.segmentMeters || 0) / 1000).toFixed(
                    2,
                  );
                  const totKm = (Number(wp.totalMeters || 0) / 1000).toFixed(2);

                  return (
                    <div
                      key={wp.timestamp ?? `${wp.lat},${wp.lon},${idx}`}
                      className="py-2 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold text-gray-500">
                            {isStart ? "START" : `WP ${wpNumber}`}
                          </span>

                          {wp.type && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 border text-gray-700">
                              {wp.type}
                              {wp.iconId ? `:${wp.iconId}` : ""}
                            </span>
                          )}

                          <span className="truncate text-sm text-gray-900">
                            {label}
                          </span>
                        </div>

                        {wp.timestamp && (
                          <div className="text-[11px] text-gray-500">
                            {new Date(wp.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex items-start gap-2 whitespace-nowrap">
                        <div className="text-right text-[11px] text-gray-600">
                          <div>seg {segKm} km</div>
                          <div>tot {totKm} km</div>
                        </div>
                        {!isStart && wp.id && (
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => openEditWaypoint(wp)}
                              className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                              title={`Edit WP ${wpNumber}`}
                              aria-label={`Edit waypoint ${wpNumber}`}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => requestDelete(wp)}
                              className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                              title={`Delete WP ${wpNumber}`}
                              aria-label={`Delete waypoint ${wpNumber}`}
                            >
                              🗑
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT: Distances */}
          <div className="bg-white rounded-2xl shadow-sm border p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">Distances</h2>
              <div className="text-xs text-gray-500">
                {waypoints.length
                  ? `${(Number(waypoints.at(-1)?.totalMeters || 0) / 1000).toFixed(2)} km`
                  : "0.00 km"}
              </div>
            </div>

            {/* Put your existing “distance / metrics” UI here */}

            {!distanceRows?.legs?.length ? (
              <div style={{ color: "#6b7280" }}>
                Add at least one waypoint after START to see segment distances.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {distanceRows.legs.map((leg) => (
                  <div
                    key={leg.key}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      {leg.from} → {leg.to}
                    </div>

                    {leg.poi ? (
                      <div
                        style={{ marginTop: 4, fontSize: 13, color: "#374151" }}
                      >
                        {leg.poi}
                      </div>
                    ) : null}

                    <div
                      style={{ fontSize: 13, color: "#111827", marginTop: 6 }}
                    >
                      <div>Segment: {fmtKm(leg.segmentMeters)}</div>
                      <div>Total: {fmtKm(leg.totalMeters)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <AccountModal
        open={showAccount}
        onClose={() => setShowAccount(false)}
        onUpgradeRequest={() => {
          // Close the Account modal and open the existing upgrade panel —
          // the same one users see when they hit a free-plan limit, but in
          // "browse" mode (no limit-specific message).
          setShowAccount(false);
          setUpgradePrompt(UPGRADE_REASONS.browse);
        }}
        onManagePlan={() => {
          setShowAccount(false);
          redirectToPortal(session).catch((e) => alert(e.message));
        }}
      />

      {/* ── Waypoint Edit Modal ─────────────────────────────────────── */}
      {editDraft &&
        (() => {
          const draftVariants = ICONS[editDraft.type]?.variants || {};
          const setDraft = (patch) => setEditDraft((d) => ({ ...d, ...patch }));
          return (
            <div
              className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
              onClick={() => setEditDraft(null)}
            >
              <div
                className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-lg">Edit waypoint</h3>
                  <button
                    type="button"
                    onClick={() => setEditDraft(null)}
                    className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>

                {/* Type picker */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {ICON_ORDER.map((type) => (
                      <IconButton
                        key={type}
                        svg={ICONS[type].svg}
                        label={ICONS[type].label}
                        active={editDraft.type === type}
                        onClick={() => {
                          const newVariants = ICONS[type]?.variants || {};
                          setDraft({
                            type,
                            // Reset iconId to first variant when changing category
                            iconId: newVariants[editDraft.iconId]
                              ? editDraft.iconId
                              : Object.keys(newVariants)[0] || null,
                          });
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Variant picker — only when category has variants */}
                {Object.keys(draftVariants).length > 0 && (
                  <div className="mb-3 pt-3 border-t border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Icon
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(draftVariants).map(([id, v]) => (
                        <IconButton
                          key={id}
                          svg={v.svg}
                          label={v.label}
                          active={editDraft.iconId === id}
                          onClick={() => setDraft({ iconId: id })}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* POI text */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Point of interest (optional)
                  </label>
                  <textarea
                    className="w-full p-2 rounded bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#588233]"
                    rows={2}
                    value={editDraft.poi}
                    onChange={(e) => setDraft({ poi: e.target.value })}
                    placeholder="e.g. onto Forbes Road"
                  />
                </div>

                {/* Footer */}
                <div className="flex gap-2 pt-3 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setEditDraft(null)}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="ml-auto px-4 py-2 rounded-lg font-semibold text-white"
                    style={{ backgroundColor: "#588233" }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ── Delete Confirm Modal ────────────────────────────────────── */}
      {deleteId &&
        (() => {
          const wp = waypoints.find((w) => w.id === deleteId);
          const label =
            (wp?.poi || "").trim() ||
            (wp?.iconId ? wp.iconId.toUpperCase() : null) ||
            (wp?.type ? wp.type.toUpperCase() : "this waypoint");
          return (
            <div
              className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
              onClick={() => setDeleteId(null)}
            >
              <div
                className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="font-semibold text-lg mb-2">Delete waypoint?</h3>
                <p className="text-sm text-gray-700 mb-4">
                  Delete <strong>{label}</strong>? This can't be undone — but
                  the GPS track is unaffected.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteId(null)}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    className="ml-auto px-4 py-2 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
