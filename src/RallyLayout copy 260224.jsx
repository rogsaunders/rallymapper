// src/RallyLayout.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import rrmLogo from "./assets/RRMLogo_64x64.png";
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

function haversineMeters(a, b) {
  if (!a || !b) return 0;

  const lat1 = Number(a.lat),
    lon1 = Number(a.lon);
  const lat2 = Number(b.lat),
    lon2 = Number(b.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;

  const R = 6371000; // metres
  const toRad = (d) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);

  const aa = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(aa)));
}

// If a waypoint already has totalMeters, use it.
// Otherwise compute it (from previous point) so OpenRally distance works.
function ensureTotalsMeters(points) {
  let total = 0;

  return points
    .map((p, idx) => {
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      let totalMeters = Number(p.totalMeters);
      if (!Number.isFinite(totalMeters)) {
        if (idx > 0) {
          const prev = points[idx - 1];
          total += haversineMeters(prev, { lat, lon });
        }
        totalMeters = total;
      }

      return { ...p, lat, lon, totalMeters };
    })
    .filter(Boolean);
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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function dynamicMinMoveMeters(gps) {
  const base = 6; // meters, beats normal GPS jitter
  const factor = 0.8; // how aggressively speed increases threshold
  const max = 30; // cap

  const v = Number.isFinite(gps?.speed) ? gps.speed : 0; // m/s
  const threshold = base + v * factor; // assumes ~1s between fixes
  return clamp(threshold, base, max);
}

function makeLocalId(meta) {
  // stable enough + human readable; includes timestamp to avoid collisions
  return `${meta.tripDate}_d${meta.dayNumber}_r${meta.routeNumber}_s${meta.stageNumber}_${meta.endedAt}`;
}

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeSlug(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

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

function estimateSpeedMps(prevGPS, curGPS) {
  const t1 = prevGPS?.timestamp ? Date.parse(prevGPS.timestamp) : null;
  const t2 = curGPS?.timestamp ? Date.parse(curGPS.timestamp) : null;
  if (!t1 || !t2 || t2 <= t1) return 0;

  const dt = (t2 - t1) / 1000;
  const d = haversineMeters(prevGPS, curGPS);
  return d / dt;
}

function minDistanceForSpeed(mps) {
  // tune these
  if (mps >= 15) return 20; // ~54 km/h+
  if (mps >= 8) return 12; // ~29 km/h+
  return 5;
}

function fmtKmNum(m) {
  const km = (Number(m) || 0) / 1000;
  return km.toFixed(2);
}

function bearingDeg(a, b) {
  const lat1 = (Number(a.lat) * Math.PI) / 180;
  const lat2 = (Number(b.lat) * Math.PI) / 180;
  const dLon = ((Number(b.lon) - Number(a.lon)) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  let brng = (Math.atan2(y, x) * 180) / Math.PI; // -180..180
  brng = (brng + 360) % 360; // 0..359
  return Math.round(brng);
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
  const flushingRef = useRef(false);
  const { user, guestMode, loading, signOut } = useAuth();

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
  const cloudStatus = !online
    ? { label: "Offline", dot: "🔴" }
    : pendingCount > 0
      ? { label: `Pending (${pendingCount})`, dot: "🟡" }
      : { label: "Synced", dot: "🟢" };
  const localOwner = user?.id ?? "guest";
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
  const lastFixTsRef = useRef(null); // timestamp of GPS fix used for last waypoint
  const lastGpsRef = useRef(null); // latest GPS fix (optional, for speed gating)
  const canAddWaypoint = !!currentGPS && hasNewFix(currentGPS);
  function getFixTs(gps) {
    const t = gps?.timestamp ? Date.parse(gps.timestamp) : NaN;
    return Number.isFinite(t) ? t : null;
  }

  function hasNewFix(gps) {
    const t = getFixTs(gps);
    if (!t) return false;
    if (!lastFixTsRef.current) return true;
    return t > lastFixTsRef.current;
  }

  const [isListening, setIsListening] = useState(false);
  const [dictationDraft, setDictationDraft] = useState("");
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
  const [stageArchive, setStageArchive] = useState([]);
  // each item: { tripName, tripDate, dayNumber, routeName, stageNumber, startedAt, endedAt, waypoints }
  const [stageActive, setStageActive] = useState(false);
  const [stageStartedAt, setStageStartedAt] = useState(null);
  const stageWps = (waypoints || []).filter(
    (wp) => wp.kind !== "start" && wp.poi !== "START",
  );

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
    if (!user?.id) return;

    let ignore = false;

    (async () => {
      if (flushingRef.current) return;
      flushingRef.current = true;

      try {
        const { remaining } = await flushPendingQueue(user);
        if (!ignore) setPendingCount(remaining);
      } finally {
        flushingRef.current = false;
      }
    })();

    return () => {
      ignore = true;
    };
  }, [user?.id]);

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

      // Only restore if it was active
      if (!draft?.stageActive) return;

      // Option A: auto-resume
      // Option B: ask user (recommended)
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

  const handleEndStage = async () => {
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

    // 1️⃣ Save locally
    saveStageLocal(localOwner, localId, payload);

    // 2️⃣ Export ZIP (await this!)
    const base = `${safeSlug(meta.tripName)}_day${meta.dayNumber}_route${meta.routeNumber}_stage${meta.stageNumber}`;

    const blob = await makeStageZip({
      meta,
      startGPS,
      waypoints,
      baseName: base,
    });

    downloadBlob(`${base}.zip`, blob);

    const { flushed, remaining } = await flushPendingQueue(user);
    if (flushed > 0) {
      console.log(`✅ Flushed ${flushed} pending stage(s)`);
    }
    setPendingCount(remaining);

    // 3️⃣ Sync to Supabase
    let needsQueue = !user?.id;

    if (user?.id) {
      try {
        const { error } = await upsertStageExport({
          userId: user.id,
          localId: localId,
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

    // 4️⃣ Queue if needed
    if (needsQueue) {
      enqueueStage(stage);
    }

    // 5️⃣ 🔁 Flush queue if signed in
    if (user?.id) {
      const { remaining } = await flushPendingQueue(user);
      setPendingCount(remaining);
    } else {
      setPendingCount(readPendingQueue().length);
    }

    // 6️⃣ Archive
    setStageArchive((prev) => [...prev, stage]);

    // 7️⃣ Reset UI
    setStageActive(false);
    setStageStartedAt(null);
    setWaypoints([]);
    setStartGPS(null);
    setPoi("");
    setHazardIconId("danger_1");
    setNavIconId("straight");
    setControlIconId("start");
    setStageNumber((n) => n + 1);
    localStorage.removeItem(STAGE_DRAFT_KEY);
  };

  const handleSetStart = () => {
    if (!currentGPS)
      return alert("GPS not ready yet — wait a moment and try again.");

    const ts = new Date().toISOString();

    const start = { lat: currentGPS.lat, lon: currentGPS.lon, timestamp: ts };
    setStartGPS(start);

    // ALSO record as a waypoint (same timestamp)
    const wp = {
      lat: start.lat,
      lon: start.lon,
      poi: "START",
      timestamp: new Date().toISOString(),
      kind: "start",
      segmentMeters: 0,
      totalMeters: 0,
    };

    setWaypoints((prev) => [...prev, wp]);
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

    const variants = ICONS.control?.variants || {};
    const hasCurrent = Boolean(variants[controlIconId]);

    if (!hasCurrent) {
      const fallback = variants.start ? "straight" : Object.keys(variants)[0];
      setControlIconId(fallback || "straight");
    }
  }, [waypointType, controlIconId]);

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
    // const fixTs = currentGPS.fixTs ?? Date.parse(currentGPS.timestamp);
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
        const moved = haversineMeters(last, {
          lat: currentGPS.lat,
          lon: currentGPS.lon,
        });

        const minMove = dynamicMinMoveMeters(currentGPS);

        console.log("📍 Waypoint Debug:", {
          speed: currentGPS.speed,
          accuracy: currentGPS.accuracy,
          moved: moved.toFixed(2),
          minMove: minMove.toFixed(2),
          lat: currentGPS.lat,
          lon: currentGPS.lon,
          ts: currentGPS.timestamp,
        });

        if (moved < minMove) {
          console.log("⏳ Ignored due to threshold");
          return prev;
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
              : null;

      const next = {
        lat: currentGPS.lat,
        lon: currentGPS.lon,
        poi: poi.trim(),
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
      .filter((wp) => wp && wp.kind !== "start" && wp.poi !== "START")
      .map((wp) => ({
        ...wp,
        lat: Number(wp.lat),
        lon: Number(wp.lon),
        timestamp: wp.timestamp ?? "",
      }))
      .filter((wp) => Number.isFinite(wp.lat) && Number.isFinite(wp.lon))
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

    // 3) Avoid duplicate first point if it matches start
    for (const wp of rest) {
      pts.push(wp); // ✅ allow same-position waypoints
    }

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

  const totalText = useMemo(() => fmtKm(totalMeters), [totalMeters]);

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

  // --- New Day / New Route helpers ---
  const startNewDay = () => {
    setDayNumber((d) => d + 1);
    setRouteNumber(1);
    setRouteName("Route 1");
    setStageNumber(1);
  };

  const startNewRoute = () => {
    const next = routeNumber + 1;
    setRouteNumber(next);
    setRouteName(`Route ${next}`);
    setStageNumber(1);
  };

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
          </div>
        </section>
        {/* MAP: horizontal, not tall */}
        <section className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="h-[100px] sm:h-[180px] md:h-[200px]">
            <MapView
              currentGPS={currentGPS}
              startGPS={startGPS}
              waypoints={waypoints}
              followMap={followMap}
              setFollowMap={setFollowMap}
            />
          </div>
        </section>

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
              📍 Set Start Point
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
