// src/RouteMapperLayout.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import rrmLogo from "./assets/RRMLogo_64x64.png";
import startflag from "/icons/start-flag.svg";
import MapView from "./components/MapView";
import { exportMapAsPdf } from "./export/exportMapPdf";
import { ICONS } from "./icons/iconRegistry";
import IconButton from "./components/IconButton";
import { ICON_ORDER } from "./icons/iconRegistry";
import { useAuth } from "./auth/AuthProvider";
import { upsertStageExport, flushPendingQueue } from "./lib/stageSync";
import { readPendingQueue, enqueueStage } from "./lib/pendingQueue";
import { buildRoutePackage } from "./export";
import { generateRoadbook, renderTulipSvg } from "./roadbook";
import { createVoiceCommandHandler } from "./voice/voiceCommandHandler";
import { createWakeWordListener } from "./voice/wakeWordListener";
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

function dynamicMinMoveMeters(gps) {
  const baseMeters = 6; // meters, beats normal GPS jitter
  const factor = 0.8;
  const maxMeters = 30;

  const v = Number.isFinite(gps?.speed) ? gps.speed : 0; // m/s
  const threshold = baseMeters + v * factor;
  return clamp(threshold, baseMeters, maxMeters);
}

function fmtKmNumber(meters) {
  const km = Number(meters || 0) / 1000;
  return km.toFixed(2); // "3.10"
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
    userId: user?.id,
    pendingCount,
  });

  const [currentGPS, setCurrentGPS] = useState(null); // ✅ LIVE GPS
  const currentGPSRef = useRef(null); // mirrors currentGPS for async/voice callbacks
  const [startGPS, setStartGPS] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [_stageArchive, setStageArchive] = useState([]);
  const [waypointType, setWaypointType] = useState("note");
  const [poi, setPoi] = useState("");
  const [followMap, setFollowMap] = useState(true);
  const [hazardIconId, setHazardIconId] = useState("danger_1");
  const [navIconId, setNavIconId] = useState("straight");
  const [controlIconId, setControlIconId] = useState("start");
  const [terrainIconId, setTerrainIconId] = useState("bump");
  const recognitionRef = useRef(null);
  // const localOwner = getGuestOwnerId();
  // const user = null;

  const [isListening, setIsListening] = useState(false);
  const [_dictationDraft, setDictationDraft] = useState("");
  const [handsFreeActive, setHandsFreeActive] = useState(false);
  const [handsFreeMode, setHandsFreeMode] = useState("off"); // "off" | "standby" | "command"
  const [_handsFreeListening, setHandsFreeListening] = useState(false);
  const [handsFreeTranscript, setHandsFreeTranscript] = useState("");
  const [handsFreeLastCommand, setHandsFreeLastCommand] = useState(null);
  const [handsFreeShowSettings, setHandsFreeShowSettings] = useState(false);
  const [handsFreeSilenceMs, setHandsFreeSilenceMs] = useState(
    () => Number(localStorage.getItem("rm_handsfree_silence_ms")) || 2500,
  );
  const [handsFreeToast, setHandsFreeToast] = useState(null); // { type, iconId, poi } for large toast
  const handsFreeRef = useRef(null); // voice command handler
  const wakeWordRef = useRef(null); // wake word listener
  const handsFreeActiveRef = useRef(false); // mirrors handsFreeActive for async callbacks
  const [showMap, setShowMap] = useState(true);
  const [mapMode, setMapMode] = useState("normal"); // "normal" | "review"
  const [mapSource, setMapSource] = useState("osm"); // "osm" | "esri_imagery" | "opentopo"
  const [leafletMap, setLeafletMap] = useState(null);
  const [exportingMapPdf, setExportingMapPdf] = useState(false);

  // Trip meta
  const [tripName, setTripName] = useState("");
  const [editingTripName, setEditingTripName] = useState(false);
  const tripNameRef = useRef(null);
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
      hazardIconId,
      navIconId,
      controlIconId,
      terrainIconId,
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
      setWaypointType(draft.waypointType ?? "note");
      setHazardIconId(draft.hazardIconId ?? "danger_1");
      setNavIconId(draft.navIconId ?? "straight");
      setControlIconId(draft.controlIconId ?? "start");
      setTerrainIconId(draft.terrainIconId ?? "bump");
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

  // ── Hands-free voice command mode (Phase 2 — wake word) ────────────
  //
  // Flow: Activate → Standby (listening for "Mapper") → Command (recording)
  //       → commit waypoint → back to Standby → … → Stop

  // Helper: add a waypoint from a parsed voice command
  const commitVoiceWaypoint = (cmd) => {
    // Use the ref to always get the latest GPS fix, not a stale closure value
    const gps = currentGPSRef.current;
    if (!gps) {
      console.warn("Hands-free: GPS not ready, command dropped:", cmd);
      return;
    }

    setWaypoints((prev) => {
      const curFix = {
        lat: Number(gps.lat),
        lon: Number(gps.lon),
      };

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
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        lat: gps.lat,
        lon: gps.lon,
        poi: cmd.poi,
        timestamp: new Date().toISOString(),
        kind: "waypoint",
        type: cmd.type,
        iconId: cmd.iconId,
        distanceFromStartM,
      };

      return [...prev, next];
    });
  };

  // Start wake word listening (Standby mode)
  const armWakeWord = () => {
    // Clean up any existing listener
    wakeWordRef.current?.stop();

    const listener = createWakeWordListener({
      wakeWord: "mapper",

      onWake: () => {
        // Wake word detected — switch to command mode
        setHandsFreeMode("command");
        startCommandListening();
      },

      onListening: () => {
        setHandsFreeMode("standby");
      },

      onStopped: () => {
        // Only update if we're still in standby (not transitioning to command)
      },

      onError: (msg) => {
        console.warn("Wake word error:", msg);
      },
    });

    listener.start();
    wakeWordRef.current = listener;
  };

  // Start command listening (after wake word detected)
  const startCommandListening = () => {
    // Clean up any existing command handler
    handsFreeRef.current?.stop();

    const handler = createVoiceCommandHandler({
      silenceMs: handsFreeSilenceMs,
      singleCommand: true,

      onListeningStart: () => {
        setHandsFreeListening(true);
        playStartSound();
      },

      onListeningStop: () => {
        setHandsFreeListening(false);
      },

      onInterim: (text) => {
        setHandsFreeTranscript(text);
      },

      onCommand: (cmd) => {
        playStopSound();
        setHandsFreeLastCommand(cmd);
        setHandsFreeTranscript("");
        commitVoiceWaypoint(cmd);

        // Show large driving toast
        setHandsFreeToast(cmd);
        setTimeout(() => setHandsFreeToast(null), 3000);

        // Clear inline confirmation after 4 seconds
        setTimeout(() => setHandsFreeLastCommand(null), 4000);
      },

      onComplete: () => {
        // Command cycle done — return to standby (re-arm wake word)
        handsFreeRef.current = null;
        if (handsFreeActiveRef.current) {
          armWakeWord();
        }
      },

      onError: (msg) => {
        console.warn("Hands-free command error:", msg);
      },

      onReady: () => {
        setHandsFreeTranscript("");
      },
    });

    handler.start();
    handsFreeRef.current = handler;
  };

  const startHandsFree = () => {
    if (handsFreeActive) return;
    // Stop manual dictation if running
    stopDictation();

    setHandsFreeActive(true);
    handsFreeActiveRef.current = true;
    setHandsFreeMode("standby");
    armWakeWord();
  };

  const stopHandsFree = () => {
    wakeWordRef.current?.stop();
    wakeWordRef.current = null;
    handsFreeRef.current?.stop();
    handsFreeRef.current = null;
    setHandsFreeActive(false);
    handsFreeActiveRef.current = false;
    setHandsFreeMode("off");
    setHandsFreeListening(false);
    setHandsFreeTranscript("");
  };

  // Clean up hands-free when stage ends
  useEffect(() => {
    if (!stageActive && handsFreeActive) {
      stopHandsFree();
    }
  }, [stageActive]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const startText = useMemo(() => {
    if (!startGPS) return "Not set";
    return `${startGPS.lat}, ${startGPS.lon}`;
  }, [startGPS]);

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

    setTrackPoints([]);
    trackLastRef.current = null;
    lastTrackTimeRef.current = 0; // reset time gate so first GPS fix records immediately

    // Optional defaults
    // setWaypointType("note");
    setHazardIconId("danger_1");
    setNavIconId("straight");
    setControlIconId("start");
    setTerrainIconId("bump");
  };

  // Add this state near your other state hooks (once):
  const [isEndingStage, setIsEndingStage] = useState(false);

  const handleEndStage = async () => {
    if (isEndingStage) return;
    if (!stageActive) return;

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
        const base = `${safeSlug(stage.meta.tripName)}_day${stage.meta.dayNumber}_route${stage.meta.routeNumber}_stage${stage.meta.stageNumber}`;

        const blob = await buildRoutePackage(stageWithRoadbook, {
          includeHema: true,
          includeGarmin: true,
          includeRallyNav: true,
          includeGoogleEarth: true,
          includeGaia: true,
          includePdf: false,
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
    } finally {
      setStageActive(false);
      setStageStartedAt(null);
      setWaypoints([]);
      setStartGPS(null);
      setPoi("");
      setHazardIconId("danger_1");
      setNavIconId("straight");
      setControlIconId("start");
      setStageNumber((n) => n + 1);
      setTrackPoints([]);
      trackLastRef.current = null;

      try {
        localStorage.removeItem(STAGE_DRAFT_KEY);
      } catch {
        // ignore
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

  useEffect(() => {
    if (waypointType !== "terrain") return;

    const variants = ICONS.terrain?.variants || {};
    const hasCurrent = Boolean(variants[terrainIconId]);

    if (!hasCurrent) {
      const fallback = variants.bump ? "bump" : Object.keys(variants)[0];
      setTerrainIconId(fallback || "bump");
    }
  }, [waypointType, terrainIconId]);

  const handleAddWaypoint = (typeOverride) => {
    if (typeOverride && typeof typeOverride !== "string") typeOverride = null;
    if (!currentGPS)
      return alert("GPS not ready yet — wait a moment and try again.");

    setWaypoints((prev) => {
      const last =
        [...prev]
          .reverse()
          .find(
            (p) =>
              Number.isFinite(Number(p?.lat)) &&
              Number.isFinite(Number(p?.lon)),
          ) || null;

      const curFix = {
        lat: Number(currentGPS.lat),
        lon: Number(currentGPS.lon),
      };

      if (last) {
        const lastFix = { lat: Number(last.lat), lon: Number(last.lon) };

        if (Number.isFinite(lastFix.lat) && Number.isFinite(lastFix.lon)) {
          const moved = haversineMeters(lastFix, curFix);
          const minMove = dynamicMinMoveMeters(currentGPS);

          console.log("📍 Waypoint Debug:", {
            speed: currentGPS?.speed,
            accuracy: currentGPS?.accuracy,
            movedMeters: Number.isFinite(moved)
              ? Number(moved.toFixed(2))
              : null,
            minMoveMeters: Number.isFinite(minMove)
              ? Number(minMove.toFixed(2))
              : null,
            lat: currentGPS?.lat,
            lon: currentGPS?.lon,
            ts: currentGPS?.timestamp,
          });

          if (
            Number.isFinite(moved) &&
            Number.isFinite(minMove) &&
            moved < minMove
          ) {
            console.log("⏳ Ignored due to threshold");
            return prev;
          }
        } else {
          console.log("⚠️ Invalid last waypoint fix", last);
        }
      }

      const typeToSave = typeOverride ?? waypointType;
      const iconId =
        typeToSave === "hazard"
          ? hazardIconId || "danger_1"
          : typeToSave === "nav"
            ? navIconId || "straight"
            : typeToSave === "control"
              ? controlIconId || "start"
              : typeToSave === "terrain"
                ? terrainIconId || "bump"
                : null;

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
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        lat: currentGPS.lat,
        lon: currentGPS.lon,
        poi: poi.trim(),
        timestamp: new Date().toISOString(),
        kind: "waypoint",
        type: typeToSave,
        iconId,
        distanceFromStartM,
      };

      return [...prev, next];
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
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          {/* Left: logo + title */}
          <div className="flex items-center gap-3">
            <img
              src={rrmLogo}
              alt="RouteMapper"
              className="h-10 w-10 rounded"
            />
            <div className="leading-tight">
              <div className="text-lg font-semibold">RouteMapper</div>
              <div className="text-sm font-medium text-gray-800">
                {tripName || "Untitled Trip / Event"}
              </div>
              <div className="text-xs text-gray-500">
                Day {dayNumber} • {routeName || `Route ${routeNumber}`} • Stage{" "}
                {stageNumber}
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
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center">
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-[#588233] text-white font-medium disabled:opacity-50 whitespace-nowrap"
                onClick={handleNewRoute}
                disabled={stageActive}
                title="Start a new route within this trip/event"
              >
                New Route
              </button>
              <input
                ref={routeNameRef}
                className="w-full px-3 py-2 rounded-xl border bg-gray-50 min-w-0"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                disabled={stageActive}
                placeholder="Route name (e.g. Barossa to Silverton)"
              />
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-[#588233] text-white font-medium disabled:opacity-50 whitespace-nowrap"
                onClick={handleNewStage}
                disabled={stageActive}
                title="Increment stage number within this route"
              >
                New Stage
              </button>
              <div className="px-3 py-2 rounded-xl border bg-white text-gray-900 font-semibold whitespace-nowrap">
                Stage {stageNumber}
              </div>
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-white font-semibold disabled:opacity-50 whitespace-nowrap"
                style={{
                  backgroundColor: stageActive ? "#dc2626" : "#588233",
                }}
                onClick={stageActive ? handleEndStage : handleStartStage}
                disabled={isEndingStage}
                title={stageActive ? "End current stage" : "Start a new stage"}
              >
                {isEndingStage
                  ? "Ending..."
                  : stageActive
                    ? "⏹ End Stage"
                    : "Start Stage"}
              </button>
            </div>

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
              startGPS={startGPS}
              waypoints={waypoints}
              trackPoints={trackPoints} // ✅ add
              followMap={followMap}
              mapMode={mapMode}
              mapSource={mapSource}
              resizeKey={showMap ? 1 : 0}
              onMapReady={setLeafletMap}
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
                trackPoints={trackPoints}
                followMap={followMap}
                mapMode={mapMode}
                mapSource={mapSource}
                resizeKey={showMap ? 1 : 0}
                onMapReady={setLeafletMap}
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
            disabled={!showMap || !leafletMap || exportingMapPdf}
            title="Export the current map view as a printable PDF. Tip: zoom/pan to frame the whole route before exporting."
            onClick={async () => {
              if (!leafletMap) return;
              setExportingMapPdf(true);
              try {
                const lastWp = waypoints?.[waypoints.length - 1];
                const totalKm = lastWp?.totalMeters
                  ? Number(lastWp.totalMeters) / 1000
                  : 0;

                // Build bounds from start + waypoints + track so fitBounds
                // captures the whole route on the PDF regardless of current pan/zoom.
                const pts = [];
                if (startGPS?.lat && startGPS?.lon) {
                  pts.push([Number(startGPS.lat), Number(startGPS.lon)]);
                }
                (trackPoints || []).forEach((p) => {
                  if (Number.isFinite(+p.lat) && Number.isFinite(+p.lon)) {
                    pts.push([Number(p.lat), Number(p.lon)]);
                  }
                });
                (waypoints || []).forEach((p) => {
                  if (Number.isFinite(+p.lat) && Number.isFinite(+p.lon)) {
                    pts.push([Number(p.lat), Number(p.lon)]);
                  }
                });

                const baseTitle =
                  `${tripName || ""} ${routeName || `Route ${routeNumber}`} Stage ${stageNumber}`.trim();

                await exportMapAsPdf(leafletMap, {
                  title: baseTitle,
                  date: new Date(),
                  totalDistanceKm: totalKm,
                  waypointCount: (waypoints || []).filter(
                    (w) => w.kind !== "start" && w.poi !== "START",
                  ).length,
                  tileAttribution:
                    mapSource === "esri_imagery"
                      ? "Tiles © Esri"
                      : mapSource === "opentopo"
                        ? "© OpenTopoMap (CC-BY-SA)"
                        : "© OpenStreetMap contributors",
                  fitBoundsTo: pts.length >= 2 ? pts : null,
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

            {waypointType === "terrain" && ICONS.terrain?.variants && (
              <div className="mt-3">
                <div className="text-sm mb-2">Terrain</div>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(ICONS.terrain.variants).map(([id, v]) => (
                    <IconButton
                      key={id}
                      svg={v.svg}
                      label={v.label}
                      active={terrainIconId === id}
                      onClick={() => setTerrainIconId(id)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 flex gap-2 items-center">
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
                className="flex-1 p-2 rounded bg-gray-100 resize-none"
                placeholder="Optional point of interest"
                rows={1}
                value={poi}
                onChange={(e) => setPoi(e.target.value)}
              />
            </div>

            {/* ── Hands-Free Voice Mode ─────────────────────────── */}
            <div
              className="mt-3 border-2 rounded-xl p-2"
              style={{
                borderColor:
                  handsFreeMode === "command"
                    ? "#dc2626"
                    : handsFreeMode === "standby"
                      ? "#2563eb"
                      : "#e5e7eb",
                backgroundColor:
                  handsFreeMode === "command"
                    ? "#fef2f2"
                    : handsFreeMode === "standby"
                      ? "#eff6ff"
                      : "white",
              }}
            >
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 mt-1">Hands-Free</span>
                  {handsFreeMode === "standby" && (
                    <>
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: "#2563eb" }}
                      />
                      <span className="text-sm text-blue-600 font-medium">
                        Say "Mapper"
                      </span>
                    </>
                  )}
                  {handsFreeMode === "command" && (
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
                </div>
                <div className="flex items-center gap-2">
                  {/* Settings cog — only when not actively listening for a command */}
                  {handsFreeMode !== "command" && (
                    <button
                      type="button"
                      onClick={() => setHandsFreeShowSettings((v) => !v)}
                      className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      title="Hands-free settings"
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
                  <button
                    type="button"
                    onClick={handsFreeActive ? stopHandsFree : startHandsFree}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      if (stageActive) {
                        handsFreeActive ? stopHandsFree() : startHandsFree();
                      }
                    }}
                    className="px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors min-w-[90px]"
                    style={{
                      backgroundColor: !stageActive
                        ? "#9ca3af"
                        : handsFreeActive
                          ? "#dc2626"
                          : "#2563eb",
                      opacity: !stageActive ? 0.5 : 1,
                    }}
                    disabled={!stageActive}
                  >
                    {handsFreeActive ? "Stop" : "Activate"}
                  </button>
                </div>
              </div>

              {/* Settings panel (collapsible) */}
              {handsFreeShowSettings && (
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-600">
                        Silence timeout
                      </label>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {(handsFreeSilenceMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1500}
                      max={5000}
                      step={250}
                      value={handsFreeSilenceMs}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setHandsFreeSilenceMs(val);
                        localStorage.setItem("rm_handsfree_silence_ms", val);
                      }}
                      className="w-full accent-blue-600"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                      <span>1.5s (fast)</span>
                      <span>5s (relaxed)</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-400 leading-snug">
                    A Bluetooth headset with mic improves accuracy in noisy
                    environments.
                  </div>
                </div>
              )}

              {/* Active state feedback */}
              {handsFreeActive && (
                <div className="mt-3 space-y-1.5">
                  {handsFreeTranscript && (
                    <div className="text-sm text-gray-700 italic bg-white/70 rounded-lg px-3 py-2 border border-gray-200">
                      {handsFreeTranscript}
                    </div>
                  )}
                  {handsFreeLastCommand && (
                    <div className="text-sm text-green-800 bg-green-50 rounded-lg px-3 py-2 border border-green-200 font-medium">
                      Added: {handsFreeLastCommand.type}
                      {handsFreeLastCommand.iconId
                        ? ` (${handsFreeLastCommand.iconId})`
                        : ""}
                      {handsFreeLastCommand.poi
                        ? ` — ${handsFreeLastCommand.poi}`
                        : ""}
                    </div>
                  )}
                  {!handsFreeTranscript &&
                    !handsFreeLastCommand &&
                    handsFreeMode !== "command" && (
                      <div className="text-xs text-gray-400">
                        Say "Mapper" then your command. E.g. "Mapper" ...
                        "hazard danger two — rocks on track"
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* ── Driving Toast (fixed overlay, visible at arm's length) ── */}
            {handsFreeToast && (
              <div
                className="fixed inset-x-0 top-8 mx-auto z-50 pointer-events-none flex justify-center"
                style={{ animation: "fadeInOut 3s ease-in-out forwards" }}
              >
                <div className="bg-green-600 text-white rounded-2xl shadow-2xl px-6 py-4 max-w-md text-center">
                  <div className="text-lg font-bold tracking-wide">
                    {handsFreeToast.type.toUpperCase()}
                    {handsFreeToast.iconId
                      ? ` — ${handsFreeToast.iconId.replace(/_/g, " ")}`
                      : ""}
                  </div>
                  {handsFreeToast.poi && (
                    <div className="text-sm mt-1 opacity-90">
                      {handsFreeToast.poi}
                    </div>
                  )}
                </div>
              </div>
            )}

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
