// src/RallyLayout.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import rrmLogo from "./assets/RRMLogo_64x64.png";
import startflag from "/icons/start-flag.svg";
import MapView from "./components/MapView";
import { ICONS } from "./icons/iconRegistry";
import IconButton from "./components/IconButton";
import { ICON_ORDER } from "./icons/iconRegistry";
import { useAuth } from "./auth/AuthProvider";
import { upsertStageExport, flushPendingQueue } from "./lib/stageSync";
import { readPendingQueue, enqueueStage } from "./lib/pendingQueue";
import { makeStageZip } from "./lib/exportStage";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";

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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function buildMetaHeader(meta, base) {
  const safeBase = typeof base === "string" && base.trim() ? base : "stage";

  return {
    name: meta?.stageName || safeBase,
    desc: `${meta?.tripName || ""} Day ${meta?.dayNumber ?? ""} Route ${meta?.routeNumber ?? ""} Stage ${meta?.stageNumber ?? ""}`.trim(),
    time: new Date().toISOString(),
    creator: "RouteMapper",
  };
}

function dynamicMinMoveMeters(gps) {
  const baseMeters = 6; // meters, beats normal GPS jitter
  const factor = 0.8;
  const maxMeters = 30;

  const v = Number.isFinite(gps?.speed) ? gps.speed : 0; // m/s
  const threshold = baseMeters + v * factor;
  return clamp(threshold, baseMeters, maxMeters);
}

function makeLocalId(meta) {
  // stable enough + human readable; includes timestamp to avoid collisions
  return `${meta.tripDate}_d${meta.dayNumber}_r${meta.routeNumber}_s${meta.stageNumber}_${meta.endedAt}`;
}

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function safeSlug(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// --- Utilities ---
function xmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Your icon mapping (unchanged)
function mapIconToRNSymbol(wp) {
  const type = String(wp?.type || "").toLowerCase();
  const iconId = String(wp?.iconId || "").toLowerCase();

  if (type === "hazard") {
    if (iconId === "danger_3") return "Danger 3";
    if (iconId === "danger_2") return "Danger 2";
    return "Danger 1";
  }

  if (type === "nav") {
    if (iconId === "left") return "Left";
    if (iconId === "right") return "Right";
    if (iconId === "keep_l") return "Keep Left";
    if (iconId === "keep_r") return "Keep Right";
    if (iconId === "straight") return "Straight";
    if (iconId === "caution") return "Caution";
    return "Navigation";
  }

  if (type === "control") return "Control";
  if (type === "note") return "Note";

  return "Waypoint";
}

/**
 * exportOpenRallyGpx
 *
 * @param {Object} args
 * @param {Array}  args.waypoints - your stored waypoint objects
 * @param {string} [args.name] - track/route name
 * @param {boolean} [args.includeTrack] - include <trk> breadcrumb for non-rally apps
 * @param {string} [args.creator] - GPX creator attribute
 * @param {Function} [args.getTulipDataUrl] - optional (wp)=> "data:image/png;base64,..." (or null)
 *
 * Returns: GPX XML string
 */
function exportOpenRallyGpx(
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

  const points = (routePoints || [])
    .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p, idx) => ({
      ...p,
      lat: Number(p.lat),
      lon: Number(p.lon),
      timeIso: p.time ? toUtcIso(p.time) : null,
      name: (p.name ?? `WP ${idx + 1}`).toString(),
      desc: (p.desc ?? "").toString(),
      segmentMeters: Number.isFinite(p.segmentMeters)
        ? Number(p.segmentMeters)
        : 0,
      totalMeters: Number.isFinite(p.totalMeters) ? Number(p.totalMeters) : 0,
    }));

  // Normalize track points ONCE, early
  const trkPts = (trackPoints && trackPoints.length ? trackPoints : [])
    .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => ({
      lat: Number(p.lat),
      lon: Number(p.lon),
      timeIso: p.time ? toUtcIso(p.time) : null,
    }));

  const hasWpt = includeWaypoints && points.length > 0;
  const hasTrk = includeTrack && trkPts.length > 0;
  if (!hasWpt && !hasTrk) return "";

  // Only do CAP work if we will output WPTs
  const caps = hasWpt
    ? (() => {
        const toRad = (d) => (d * Math.PI) / 180;
        const haversineMeters = (a, b) => {
          const R = 6371000;
          const dLat = toRad(b.lat - a.lat);
          const dLon = toRad(b.lon - a.lon);
          const s1 = Math.sin(dLat / 2);
          const s2 = Math.sin(dLon / 2);
          const aa =
            s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
          const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
          return R * c;
        };
        const computeCapDeg = (prev, cur) => {
          const y =
            Math.sin(toRad(cur.lon - prev.lon)) * Math.cos(toRad(cur.lat));
          const x =
            Math.cos(toRad(prev.lat)) * Math.sin(toRad(cur.lat)) -
            Math.sin(toRad(prev.lat)) *
              Math.cos(toRad(cur.lat)) *
              Math.cos(toRad(cur.lon - prev.lon));
          const brng = (Math.atan2(y, x) * 180) / Math.PI;
          return (brng + 360) % 360;
        };

        return points.map((p, i) => {
          if (i === 0) return 0;
          for (let j = i - 1; j >= 0; j--) {
            const d = haversineMeters(points[j], p);
            if (d >= Math.max(minCapDistanceMeters, 0.001)) {
              return Math.round(computeCapDeg(points[j], p));
            }
          }
          return 0;
        });
      })()
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
      ? `      <openrally:distance>${fmtKm(totalMetersForHeader)}</openrally:distance>`
      : null,
    `    </extensions>`,
    `  </metadata>`,
  ].filter(Boolean);

  if (hasWpt) {
    points.forEach((p, i) => {
      const cap = caps[i] ?? 0;
      const pngB64 = dataUrlToPngBase64(p.tulipDataUrl || p.tulipPngDataUrl);

      xmlLines.push(
        `  <wpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">`,
        `    <name>${xmlEscape(p.name)}</name>`,
        p.desc ? `    <desc>${xmlEscape(p.desc)}</desc>` : null,
        p.timeIso ? `    <time>${p.timeIso}</time>` : null,
        `    <extensions>`,
        `      <openrally:distance>${fmtKm(p.totalMeters)}</openrally:distance>`,
        `      <openrally:cap>${cap}</openrally:cap>`,
        `      <openrally:show_coordinates>0</openrally:show_coordinates>`,
        pngB64
          ? `      <openrally:tulip><![CDATA[data:image/png;base64,${pngB64}]]></openrally:tulip>`
          : null,
        `    </extensions>`,
        `  </wpt>`,
      );
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

export default function RallyLayout() {
  const { user, signOut } = useAuth();
  const localOwner = user?.id ?? getGuestOwnerId();
  const [pendingCount, setPendingCount] = useState(
    () => readPendingQueue().length,
  );
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

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

  useEffect(() => {
    const refresh = () => setPendingCount(readPendingQueue().length);
    refresh();
    const onStorage = (e) => {
      if (e.key === PENDING_SYNC_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const cloud = getCloudStatus({
    online,
    userId: null,
    pendingCount,
  });
  const cloudStatus = !online
    ? { label: "Offline", dot: "🔴" }
    : pendingCount > 0
      ? { label: `Pending (${pendingCount})`, dot: "🟡" }
      : { label: "Synced", dot: "🟢" };

  const [currentGPS, setCurrentGPS] = useState(null); // ✅ LIVE GPS
  const [startGPS, setStartGPS] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [waypointType, setWaypointType] = useState("note");
  const [poi, setPoi] = useState("");
  const [followMap, setFollowMap] = useState(true);
  const [hazardIconId, setHazardIconId] = useState("danger_1");
  const [navIconId, setNavIconId] = useState("straight");
  const [controlIconId, setControlIconId] = useState("start"); // pick a sensible default
  const recognitionRef = useRef(null);
  // const localOwner = getGuestOwnerId();
  // const user = null;

  const [isListening, setIsListening] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [mapMode, setMapMode] = useState("normal"); // "normal" | "review"
  const [mapSource, setMapSource] = useState("osm"); // "osm" | "esri_imagery" | "opentopo"

  // Trip meta
  const [tripName, setTripName] = useState("Survey Trip");
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

  const STAGE_DRAFT_KEY = "rm_stage_draft_v1";

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
      waypoints,
      waypointType,
      hazardIconId,
      navIconId,
      controlIconId,
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
    waypointType,
    hazardIconId,
    navIconId,
    controlIconId,
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

      setTripName(draft.tripName ?? "Survey Trip");
      setTripDate(draft.tripDate ?? new Date().toISOString().slice(0, 10));
      setDayNumber(draft.dayNumber ?? 1);
      setRouteNumber(draft.routeNumber ?? 1);
      setRouteName(draft.routeName ?? "Route 1");
      setStageNumber(draft.stageNumber ?? 1);

      setStageActive(true);
      setStageStartedAt(draft.stageStartedAt ?? null);

      setStartGPS(draft.startGPS ?? null);
      setWaypoints(Array.isArray(draft.waypoints) ? draft.waypoints : []);

      setWaypointType(draft.waypointType ?? "note");
      setHazardIconId(draft.hazardIconId ?? "danger_1");
      setNavIconId(draft.navIconId ?? "straight");
      setControlIconId(draft.controlIconId ?? "start");
      setPoi(draft.poi ?? "");
    } catch (e) {
      console.warn("Stage restore failed:", e);
    }
  }, []);

  const startDictation = () => {
    const SR = getSpeechRecognition();
    if (!SR) {
      alert("Speech recognition not available in this browser.");
      return;
    }

    // If already listening, ignore repeat tap
    if (isListening) return;

    // Create once
    if (!recognitionRef.current) {
      const rec = new SR();
      rec.lang = "en-AU";
      rec.continuous = false;
      rec.interimResults = true;

      rec.onstart = () => {
        setIsListening(true);
        setDictationDraft("");
      };

      rec.onresult = (event) => {
        let finalText = "";
        let interimText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res?.[0]?.transcript || "";
          if (res.isFinal) finalText += transcript;
          else interimText += transcript;
        }

        if (finalText.trim()) {
          setPoi((prev) => (prev ? prev + " " : "") + finalText.trim());
          setDictationDraft("");
        } else {
          setDictationDraft(interimText.trim());
        }
      };

      rec.onerror = (e) => {
        console.warn("Speech error:", e);
        setIsListening(false);
        setDictationDraft("");
      };

      rec.onend = () => {
        setIsListening(false);
        setDictationDraft("");
      };

      recognitionRef.current = rec;
    }

    try {
      recognitionRef.current.start();
    } catch (e) {
      // Some browsers throw if called twice / too quickly
      console.warn("Speech start failed:", e);
    }
  };

  const stopDictation = () => {
    try {
      recognitionRef.current?.stop?.();
    } catch (e) {
      console.warn("Speech stop failed:", e);
    } finally {
      setIsListening(false);
      setDictationDraft("");
    }
  };

  // ✅ Start GPS automatically
  useEffect(() => {
    const geo = navigator.geolocation;
    if (!geo) {
      alert("Geolocation not supported in this browser.");
      return;
    }

    const watchId = geo.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed } = pos.coords;

        setCurrentGPS({
          lat: latitude,
          lon: longitude,
          accuracy,
          speed: Number.isFinite(speed) ? speed : null, // m/s (may be null)
          fixTs: pos.timestamp, // ms epoch
          timestamp: new Date(pos.timestamp).toISOString(),
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
  }, []);

  const startText = useMemo(() => {
    if (!startGPS) return "Not set";
    return `${startGPS.lat}, ${startGPS.lon}`;
  }, [startGPS]);

  const WAYPOINT_TYPES = [
    { id: "note", label: "Note" },
    { id: "hazard", label: "Hazard" },
    { id: "nav", label: "Navigation" },
    { id: "control", label: "Control" },
  ];

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

  const handleStartStage = () => {
    // Stage starts: clear current stage data and "arm" the UI
    setStageActive(true);
    setStageStartedAt(new Date().toISOString());

    // Clear stage-scoped data
    setWaypoints([]);
    setStartGPS(null);
    setPoi("");

    // Optional defaults
    // setWaypointType("note");
    setHazardIconId("danger_1");
    setNavIconId("straight");
    setControlIconId("start");
  };

  // Add this state near your other state hooks (once):
  const [isEndingStage, setIsEndingStage] = useState(false);

  const handleEndStage = async () => {
    // ✅ prevent double-taps / re-entry
    if (isEndingStage) return;
    if (!stageActive) return;

    setIsEndingStage(true);

    // ✅ yield so the UI can repaint (button can show "Ending…") before heavy work/download UI
    await new Promise((r) => setTimeout(r, 0));

    // We'll build these early so we can still queue/archive/reset in finally even if something fails
    const endedAt = new Date().toISOString();

    const localId = makeLocalId({
      tripName,
      tripDate,
      dayNumber,
      routeNumber,
      stageNumber,
      endedAt,
    });

    const meta = {
      tripName,
      tripDate,
      dayNumber,
      routeNumber,
      routeName,
      stageNumber,
      startedAt: stageStartedAt,
      endedAt,
      local_id: localId,
    };

    const payload = { meta, startGPS, waypoints };

    // Build stage object ONCE
    const stage = {
      meta,
      startGPS,
      waypoints,
      local_id: localId,
      created_at: new Date().toISOString(),
    };

    // Decide cloud capability once
    const canCloudSync = Boolean(user?.id) && navigator.onLine;

    // If we can't cloud sync, we should queue (offline/guest)
    let needsQueue = !canCloudSync;

    try {
      // 1️⃣ Save locally (local-first, always)
      saveStageLocal(localOwner, localId, payload);

      // 2️⃣ Export ZIP (await this!)
      try {
        const base = `${safeSlug(meta.tripName)}_day${meta.dayNumber}_route${meta.routeNumber}_stage${meta.stageNumber}`;

        const metaHeader = buildMetaHeader(meta, base);

        const openRallyGpxXml = exportOpenRallyGpx(
          routePoints,
          meta?.stageName || base,
          metaHeader,
          {
            includeTrack: false,
            includeWaypoints: true,
          },
        );

        const blob = await makeStageZip({
          meta,
          startGPS,
          waypoints,
          openRallyGpxXml,
          baseName: base,
        });

        downloadBlob(`${base}.zip`, blob);
      } catch (e) {
        console.error("Export/ZIP failed", e);
        alert("Stage saved locally, but export failed. Check console.");
      }

      // 3️⃣ Sync to Supabase (only if signed in AND online)
      if (canCloudSync) {
        try {
          const { error } = await upsertStageExport({
            userId: user.id,
            localId,
            meta,
            payload,
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

      // 4️⃣ Queue if needed (guest/offline OR supabase failed)
      if (needsQueue) {
        try {
          enqueueStage(stage);
        } catch (e) {
          console.warn("Enqueue failed:", e);
        }
      }

      // 5️⃣ 🔁 Flush queue if signed in & online (never block UI reset)
      if (canCloudSync) {
        try {
          const { flushed, remaining } = await flushPendingQueue(user);
          if (flushed > 0)
            console.log(`✅ Flushed ${flushed} pending stage(s)`);
          setPendingCount(remaining);
        } catch (err) {
          console.warn("Queue flush failed:", err);
          setPendingCount(readPendingQueue().length);
        }
      } else {
        setPendingCount(readPendingQueue().length);
      }

      // 6️⃣ Archive (local UI history)
      setStageArchive((prev) => [...prev, stage]);
    } finally {
      // 7️⃣ Reset UI (ALWAYS runs, even if Supabase is blocked by Safari)
      setStageActive(false);
      setStageStartedAt(null);
      setWaypoints([]);
      setStartGPS(null);
      setPoi("");
      setHazardIconId("danger_1");
      setNavIconId("straight");
      setControlIconId("start");
      setStageNumber((n) => n + 1);

      try {
        localStorage.removeItem(STAGE_DRAFT_KEY);
      } catch {
        // Silently ignore errors when clearing draft
      }

      setIsEndingStage(false);
    }
  };

  const handleSetStart = () => {
    if (
      !Number.isFinite(currentGPS?.lat) ||
      !Number.isFinite(currentGPS?.lon)
    ) {
      return alert("GPS not ready yet — wait a moment and try again.");
    }

    const ts = new Date().toISOString();

    setStartGPS({
      lat: currentGPS.lat,
      lon: currentGPS.lon,
      timestamp: ts,
    });

    // ✅ Option A: do NOT add a START waypoint to waypoints.
    // The exporter will prepend startGPS automatically.
  };

  useEffect(() => {
    if (waypointType !== "hazard") return;

    const variants = ICONS.hazard?.variants || {};
    const hasCurrent = Boolean(variants[hazardIconId]);

    if (!hasCurrent) {
      // fallback to danger_1 or first variant
      const fallback = variants.danger_1
        ? "danger_1"
        : Object.keys(variants)[0];
      setHazardIconId(fallback || "danger_1");
    }
  }, [waypointType, hazardIconId]);

  useEffect(() => {
    if (waypointType !== "nav") return;

    const variants = ICONS.nav?.variants || {};
    const hasCurrent = Boolean(variants[navIconId]);

    if (!hasCurrent) {
      const fallback = variants.straight
        ? "straight"
        : Object.keys(variants)[0];
      setNavIconId(fallback || "straight");
    }
  }, [waypointType, navIconId]);

  useEffect(() => {
    if (waypointType !== "control") return;

    const variants = ICONS.control?.variants || {};
    const hasCurrent = Boolean(variants[controlIconId]);

    if (!hasCurrent) {
      const fallback = variants.start ? "start" : Object.keys(variants)[0];
      setControlIconId(fallback || "start");
    }
  }, [waypointType, controlIconId]);

  const handleAddWaypoint = (typeOverride) => {
    if (typeOverride && typeof typeOverride !== "string") typeOverride = null;
    if (!currentGPS)
      return alert("GPS not ready yet — wait a moment and try again.");

    // Optional freshness guard (recommended if you store fixTs)
    // const now = Date.now();
    // if (!Number.isFinite(fixTs) || now - fixTs > 2000) {
    //  alert("Waiting for a fresh GPS fix…");
    //  return;
    // }

    setWaypoints((prev) => {
      const last =
        [...prev]
          .reverse()
          .find(
            (p) =>
              Number.isFinite(Number(p?.lat)) &&
              Number.isFinite(Number(p?.lon)),
          ) || null;

      if (last) {
        // ✅ Guard before using currentGPS.lat/lon
        if (
          !Number.isFinite(currentGPS?.lat) ||
          !Number.isFinite(currentGPS?.lon)
        ) {
          console.log("⚠️ Ignored: invalid GPS fix");
          return prev;
        }

        const moved = haversineMeters(last, {
          lat: currentGPS.lat,
          lon: currentGPS.lon,
        });

        const minMove = dynamicMinMoveMeters(currentGPS);

        console.log("📍 Waypoint Debug:", {
          speed: currentGPS.speed,
          accuracy: currentGPS.accuracy,
          movedMeters: Number(moved.toFixed(2)),
          minMoveMeters: Number(minMove.toFixed(2)),
          lat: currentGPS.lat,
          lon: currentGPS.lon,
          ts: currentGPS.timestamp,
        });

        if (moved < minMove) {
          console.log("⏳ Ignored due to threshold");
          return prev;
        }
      }

      // ✅ Also guard for the "first waypoint" case (when last is null)
      if (
        !Number.isFinite(currentGPS?.lat) ||
        !Number.isFinite(currentGPS?.lon)
      ) {
        console.log("⚠️ Ignored: invalid GPS fix (no last)");
        return prev;
      }

      const typeToSave = typeOverride ?? waypointType;

      const iconId =
        typeToSave === "hazard"
          ? hazardIconId || "danger_1"
          : typeToSave === "nav"
            ? navIconId || "straight"
            : typeToSave === "control"
              ? controlIconId || "start"
              : null;

      const next = {
        lat: currentGPS.lat,
        lon: currentGPS.lon,
        poi: (poi ?? "").trim(),
        timestamp: new Date().toISOString(),
        kind: "waypoint",
        type: typeToSave,
        iconId,
      };

      const segmentMeters = last ? haversineMeters(last, next) : 0;
      const totalMeters = (Number(last?.totalMeters) || 0) + segmentMeters;

      return [...prev, { ...next, segmentMeters, totalMeters }];
    });

    setPoi("");
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
    return pts;
  }, [startGPS, waypoints]);

  const totalMeters = useMemo(() => {
    // Prefer the last waypoint with a valid totalMeters (your Add Waypoint sets this)
    for (let i = waypoints.length - 1; i >= 0; i--) {
      const t = Number(waypoints[i]?.totalMeters);
      if (Number.isFinite(t)) return t;
    }
    return 0;
  }, [waypoints]);

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

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          {/* Left: logo + title */}
          <div className="flex items-center gap-3">
            <img
              src={rrmLogo}
              alt="Route Mapper"
              className="h-10 w-10 rounded"
            />
            <div className="leading-tight">
              <div className="text-lg font-semibold">Route Mapper</div>
              <div className="text-xs text-gray-500">
                {tripName} • Day {dayNumber} •{" "}
                {routeName || `Route ${routeNumber}`}
              </div>
            </div>
          </div>

          {/* Right: cloud badge + signed-in */}
          <div className="flex items-center gap-3">
            <div
              className={`text-sm px-3 py-1 rounded-full font-medium
                ${cloud.color} bg-opacity-15 text-green-700`}
            >
              <span className="mr-1">{cloud.dot}</span>
              <span className="font-medium">{cloud.label}</span>
            </div>

            <div className="text-sm text-gray-700">
              {user?.email ? (
                <span>
                  Signed in as <span className="font-medium">{user.email}</span>
                </span>
              ) : (
                <span className="text-gray-500">Guest mode</span>
              )}
            </div>

            {user?.id && (
              <button
                className="text-sm underline text-gray-700 hover:text-gray-900"
                onClick={signOut}
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="mx-auto max-w-6xl px-3 py-3 space-y-3">
        {/* TOP CONTROLS STRIP */}
        <section className="bg-white rounded-2xl shadow-sm border p-3">
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center">
            <button
              type="button"
              className="px-3 py-2 rounded-xl text-white font-semibold disabled:opacity-50"
              style={{ backgroundColor: "#588233" }}
              onClick={handleNewDay}
              disabled={!canChangeMeta}
              title={
                stageActive
                  ? "End stage first"
                  : "Increment day and reset route/stage"
              }
            >
              📅 New Day
            </button>
            <div className="flex flex-wrap gap-2 items-center">
              {/* NEW ROUTE (before name) */}
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-[#588233] text-white font-medium disabled:opacity-50"
                onClick={handleNewRoute}
                disabled={stageActive}
                title="Increment route, reset stage to 1"
              >
                🛣️ New Route
              </button>
              {/* ROUTE NAME (primary) */}
              <input
                className="min-w-[260px] flex-1 px-3 py-2 rounded-xl border bg-gray-50"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                disabled={stageActive}
                placeholder="Route name (e.g., Barossa to Silverton)"
              />

              {/* NEW STAGE (replaces 'Stage' label) */}
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-[#588233] text-white font-medium disabled:opacity-50"
                onClick={handleNewStage}
                disabled={stageActive}
                title="Increment stage number"
              >
                ➕ New Stage
              </button>
              {/* STAGE NUMBER DISPLAY (readable, compact) */}
              <div className="px-3 py-2 rounded-xl border bg-white text-gray-900 font-semibold">
                Stage {stageNumber}
              </div>
            </div>

            <button
              type="button"
              className="px-3 py-2 rounded-xl text-white font-semibold disabled:opacity-50"
              style={{
                backgroundColor: stageActive ? "#dc2626" : "#588233",
              }}
              onClick={stageActive ? handleEndStage : handleStartStage}
              title={stageActive ? "End current stage" : "Start a new stage"}
            >
              {stageActive ? "⏹ End Stage" : "▶️ Start Stage"}
            </button>
            <button
              disabled={!stageActive || isEndingStage}
              onClick={handleEndStage}
            >
              {isEndingStage ? "Ending…" : "End Stage"}
            </button>
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
              startGPS={startGPS}
              waypoints={waypoints}
              followMap={followMap}
              mapMode="review"
              mapSource={mapSource}
            />
          </div>
        ) : (
          <section className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div
              className={
                "transition-all duration-300 overflow-hidden " +
                (showMap ? "h-[100px] sm:h-[180px] md:h-[200px]" : "h-0")
              }
            >
              <MapView
                currentGPS={currentGPS}
                startGPS={startGPS}
                waypoints={waypoints}
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
        </div>

        {/* INPUT CONTROLS ROW (above the two columns) */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* GPS / Start */}
          <div className="bg-white rounded-2xl shadow-sm border p-3">
            <h2 className="font-semibold mb-2">GPS</h2>

            <div className="text-sm">
              Live:{" "}
              {currentGPS
                ? `${currentGPS.lat}, ${currentGPS.lon}`
                : "Waiting for GPS…"}
            </div>

            <div className="text-sm mt-1">Start: {startText}</div>

            <button
              className="btn btn-primary mt-3 w-full"
              disabled={!stageActive}
              onClick={handleSetStart}
            >
              <img
                src={startflag}
                alt="Start Flag"
                className="h-6 w-6 rounded"
              />
              Start Set (tap to update)
            </button>

            <label className="flex items-center gap-3 mt-3 select-none">
              <input
                type="checkbox"
                checked={followMap}
                onChange={(e) => setFollowMap(e.target.checked)}
              />
              <span className="text-sm font-medium">
                Follow map (auto recenter)
              </span>
            </label>
          </div>

          {/* POI / Icons / Add waypoint */}
          <div className="bg-white rounded-2xl shadow-sm border p-3 md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">Input Controls</h2>
              <div className="text-xs text-gray-500">
                {stageActive ? "Stage active" : "Stage not started"}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap mb-2">
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

            <select
              disabled={!stageActive}
              className="w-full p-2 rounded bg-gray-100"
              value={waypointType}
              onChange={(e) => setWaypointType(e.target.value)}
            >
              {Object.keys(ICONS).map((k) => (
                <option key={k} value={k}>
                  {ICONS[k].label}
                </option>
              ))}
            </select>

            {waypointType === "hazard" && ICONS.hazard?.variants && (
              <div className="mt-3">
                <div className="text-sm mb-2">Hazard level</div>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(ICONS.hazard.variants).map(([id, v]) => (
                    <IconButton
                      key={id}
                      svg={v.svg}
                      label={v.label}
                      active={hazardIconId === id}
                      onClick={() => setHazardIconId(id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {waypointType === "nav" && ICONS.nav?.variants && (
              <div className="mt-3">
                <div className="text-sm mb-2">Navigation</div>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(ICONS.nav.variants).map(([id, v]) => (
                    <IconButton
                      key={id}
                      svg={v.svg}
                      label={v.label}
                      active={navIconId === id}
                      onClick={() => setNavIconId(id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {waypointType === "control" && ICONS.control?.variants && (
              <div className="mt-3">
                <div className="text-sm mb-2">Control</div>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(ICONS.control.variants).map(([id, v]) => (
                    <IconButton
                      key={id}
                      svg={v.svg}
                      label={v.label}
                      active={controlIconId === id}
                      onClick={() => setControlIconId(id)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 flex gap-2 items-start">
              <button
                type="button"
                onClick={isListening ? stopDictation : startDictation}
                className="px-3 py-2 rounded text-white whitespace-nowrap transition-colors disabled:opacity-50"
                style={{ backgroundColor: isListening ? "#dc2626" : "#588234" }}
                disabled={!stageActive}
              >
                {isListening ? "🎙️ Listening…" : "🎙️ Dictate"}
              </button>

              <textarea
                disabled={!stageActive}
                className="flex-1 p-2 rounded bg-gray-100"
                placeholder="Optional point of interest"
                value={poi}
                onChange={(e) => setPoi(e.target.value)}
              />
            </div>

            <button
              className="btn btn-primary mt-3 w-full"
              disabled={!stageActive}
              onClick={() => handleAddWaypoint(null)}
            >
              ➕ Add Waypoint (Current GPS)
            </button>
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

                      <div className="text-right text-[11px] text-gray-600 whitespace-nowrap">
                        <div>seg {segKm} km</div>
                        <div>tot {totKm} km</div>
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
    </div>
  );
}
