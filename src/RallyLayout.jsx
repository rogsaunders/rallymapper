// src/RallyLayout.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import MapView from "./components/MapView";
import { ICONS } from "./icons/iconRegistry";
import IconButton from "./components/IconButton";
import { ICON_ORDER } from "./icons/iconRegistry";
import JSZip from "jszip";
import { useAuth } from "./auth/AuthProvider";
import { upsertStageExport, flushPendingQueue } from "./lib/stageSync";
import { readPendingQueue, enqueueStage } from "./lib/pendingQueue";

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

function escXml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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

function bearingDeg(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const dLon = toRad(Number(b.lon) - Number(a.lon));

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return Math.round((toDeg(Math.atan2(y, x)) + 360) % 360);
}

function toGpx({ meta, startGPS, waypoints }) {
  const ptsRaw = [];

  // START first
  if (startGPS?.lat != null && startGPS?.lon != null) {
    ptsRaw.push({
      lat: startGPS.lat,
      lon: startGPS.lon,
      timestamp: startGPS.timestamp,
      poi: "START",
      type: "start",
      iconId: "start",
      totalMeters: 0,
    });
  }

  // Then stage waypoints
  for (const wp of waypoints || []) {
    const lat = Number(wp?.lat);
    const lon = Number(wp?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    ptsRaw.push({
      lat,
      lon,
      timestamp: wp.timestamp,
      poi: wp.poi || "",
      type: wp.type || "",
      iconId: wp.iconId || "",
      totalMeters: wp.totalMeters, // may exist; if not we’ll compute
    });
  }

  // Ensure totalMeters exists on every point (for OpenRally distance)
  const pts = ensureTotalsMeters(ptsRaw);

  // Root-level waypoints (this is what RN uses for roadbook entries)
  const wpts = pts
    .map((p, i) => {
      const name = p.poi?.trim() ? p.poi.trim() : `WP ${i + 1}`;

      // cap = bearing from previous point; for first point we can use 0 (or omit)
      const cap = i > 0 ? bearingDeg(pts[i - 1], p) : 0;

      // distance in km from start
      const km = (Number(p.totalMeters) / 1000).toFixed(2);

      return `
  <wpt lat="${p.lat}" lon="${p.lon}">
    <name>${escXml(name)}</name>
    ${p.timestamp ? `<time>${escXml(p.timestamp)}</time>` : ""}
    <extensions>
      <openrally:distance>${escXml(km)}</openrally:distance>
      <openrally:cap>${escXml(String(cap))}</openrally:cap>
      <openrally:show_coordinates/>
    </extensions>
  </wpt>`;
    })
    .join("");

  // Track line (RN/Guru will show this on the map)
  const trkpts = pts
    .map(
      (p) => `
      <trkpt lat="${p.lat}" lon="${p.lon}">
        ${p.timestamp ? `<time>${escXml(p.timestamp)}</time>` : ""}
      </trkpt>`,
    )
    .join("");

  // Total stage distance (meters) for RN metadata extension
  const totalMeters = pts.length ? Number(pts[pts.length - 1].totalMeters) : 0;

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<gpx
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:openrally="http://www.openrally.org/xmlschemas/GpxExtensions/v1.0.3"
  creator="Route Mapper"
  version="1.1"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd
                      http://www.openrally.org/xmlschemas/GpxExtensions/v1.0.3 openrally.xsd"
>
  <metadata>
    <name>${escXml(meta.tripName)}</name>
    <desc>Day ${meta.dayNumber} – ${escXml(meta.routeName)} – Stage ${meta.stageNumber}</desc>
    <time>${escXml(meta.endedAt)}</time>
    <extensions>
      <openrally:units>metric</openrally:units>
      <openrally:distance>${escXml(String(totalMeters.toFixed?.(2) ? totalMeters.toFixed(2) : totalMeters))}</openrally:distance>
    </extensions>
  </metadata>

  ${wpts}

  <trk>
    <name>Stage ${meta.stageNumber}</name>
    <trkseg>
      ${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

export default function RallyLayout() {
  const flushingRef = useRef(false);
  const { user, guestMode, loading, signOut } = useAuth();
  const signedInLabel =
    user?.email || user?.phone || user?.id?.slice(0, 8) || "Signed in";
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

  const [pendingCount, setPendingCount] = useState(
    () => readPendingQueue().length,
  );

  useEffect(() => {
    const refresh = () => setPendingCount(readPendingQueue().length);
    refresh();

    const onStorage = (e) => {
      if (e.key === PENDING_SYNC_KEY) refresh();
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    (async () => {
      if (flushingRef.current) return;
      flushingRef.current = true;

      try {
        const { remaining } = await flushPendingQueue(user);
        if (!cancelled) setPendingCount(remaining);
      } finally {
        flushingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const STAGE_DRAFT_KEY = "rm_stage_draft_v1";

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    (async () => {
      if (flushingRef.current) return;
      flushingRef.current = true;

      try {
        const { remaining } = await flushPendingQueue(user);
        if (!cancelled) setPendingCount(remaining);
      } finally {
        flushingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
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

  useEffect(() => {
    const refresh = () => setPendingCount(readPendingQueue().length);
    refresh();

    const onStorage = (e) => {
      if (e.key === PENDING_SYNC_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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
        const { latitude, longitude, accuracy } = pos.coords;
        setCurrentGPS({
          lat: latitude,
          lon: longitude,
          accuracy,
          timestamp: new Date(pos.timestamp).toISOString(),
        });
      },
      (err) => {
        // iOS will often fail until user grants permission
        console.warn("GPS watch error:", err);
      },
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
    setNavIconId("nav");
    setControlIconId("control");
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
      local_id: localId, // ✅ add
    };

    const payload = { meta, startGPS, waypoints };

    saveStageLocal(localOwner, localId, payload);
    exportStageFiles({ meta, startGPS, waypoints });

    const stage = {
      meta,
      startGPS,
      waypoints,
      local_id: localId,
      created_at: new Date().toISOString(),
    };

    let needsQueue = !user?.id;

    if (user?.id) {
      const { error } = await upsertStageExport({
        userId: user.id,
        localId,
        meta,
        payload,
      });
      if (error) {
        console.warn("Supabase sync failed (kept locally):", error);
        needsQueue = true;
      }
    }

    if (needsQueue) {
      enqueueStage(stage);
      setPendingCount(readPendingQueue().length);
    }

    if (user?.id) {
      const { remaining } = await flushPendingQueue(user);
      setPendingCount(remaining);
    } else {
      setPendingCount(readPendingQueue().length);
    }

    setStageArchive((prev) => [...prev, stage]);

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
    setNavIconId((v) => v || "straight");
  }, [waypointType]);

  useEffect(() => {
    if (waypointType !== "control") return;
    setControlIconId((v) => v || "start");
  }, [waypointType]);

  const handleAddWaypoint = (typeOverride) => {
    if (typeOverride && typeof typeOverride !== "string") typeOverride = null;

    if (!currentGPS)
      return alert("GPS not ready yet — wait a moment and try again.");

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
      iconId, // ✅ IMPORTANT
    };

    console.log(
      "Saving waypoint JSON:",
      JSON.stringify({ typeToSave, iconId, hazardIconId, navIconId }, null, 2),
    );

    setWaypoints((prev) => {
      const last = prev.length ? prev[prev.length - 1] : null;
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

  // --- Export helpers ---
  async function exportStageFiles({ meta, startGPS, waypoints }) {
    const base = `${safeSlug(meta.tripName)}_day${meta.dayNumber}_route${meta.routeNumber}_stage${meta.stageNumber}`;

    const payload = { meta, startGPS, waypoints };
    const jsonText = JSON.stringify(payload, null, 2);
    const gpxText = toGpx({ meta, startGPS, waypoints });

    const zip = new JSZip();
    zip.file(`${base}.json`, jsonText);
    zip.file(`${base}.gpx`, gpxText);

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`${base}.zip`, blob);
  }

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
    <div className="h-screen flex flex-col">
      <div className="px-3 py-2 border-b bg-gray-50">
        <div className="flex items-center gap-3 flex-nowrap">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <span className="text-xs text-gray-600">
              {user
                ? `Signed in as ${signedInLabel}`
                : guestMode
                  ? "Guest mode"
                  : "Not signed in"}

              {user && pendingCount > 0 && (
                <span className="ml-2 text-amber-700">
                  Pending sync: {pendingCount}
                </span>
              )}
            </span>

            {user && (
              <button
                type="button"
                onClick={signOut}
                className="text-xs underline text-gray-700 hover:text-black"
              >
                Sign out
              </button>
            )}
          </div>

          <div className="font-semibold whitespace-nowrap">
            🧭 {tripName}: Day {dayNumber} - {tripDate}
          </div>

          <button
            type="button"
            onClick={startNewDay}
            disabled={stageActive}
            className="px-3 py-2 rounded text-white whitespace-nowrap disabled:opacity-50"
            style={{ backgroundColor: "#588234" }}
          >
            📅 New Day
          </button>

          <div className="flex items-center flex-1 min-w-0">
            <input
              className="w-full min-w-0 p-2 rounded border bg-white"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              disabled={stageActive}
              placeholder="Route name"
            />
          </div>

          <button
            type="button"
            onClick={startNewRoute}
            disabled={stageActive}
            className="px-3 py-2 rounded text-white whitespace-nowrap disabled:opacity-50"
            style={{ backgroundColor: "#588234" }}
          >
            🛣️ New Route
          </button>

          <div className="ml-auto flex items-center gap-2 flex-nowrap">
            <div className="stage-label px-3 py-2 rounded border bg-white font-medium">
              Stage {stageNumber}
            </div>

            <button
              type="button"
              onClick={stageActive ? handleEndStage : handleStartStage}
              className="px-4 py-2 rounded text-white whitespace-nowrap transition-colors"
              style={{ backgroundColor: stageActive ? "#dc2626" : "#588234" }}
            >
              {stageActive ? "⏹ End Stage" : "▶️ Start Stage"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1">
        <div className="w-1/2 h-full">
          <MapView
            currentGPS={currentGPS}
            startGPS={startGPS}
            waypoints={waypoints}
            followMap={followMap}
            setFollowMap={setFollowMap}
          />
        </div>

        <div className="w-1/2 h-full overflow-y-auto p-4 space-y-4 bg-white border-l relative z-10">
          <section className="space-y-2">
            <h2 className="text-lg font-bold">🛰️ GPS</h2>

            <div className="text-sm">
              Live:{" "}
              {currentGPS
                ? `${currentGPS.lat}, ${currentGPS.lon}`
                : "Waiting for GPS…"}
            </div>

            <div className="text-sm">Start: {startText}</div>

            <button
              className="btn btn-primary"
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
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold">🗒️ POI</h2>
            <div className="flex gap-2 flex-wrap">
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
              <div className="space-y-2">
                <div className="text-sm">Hazard level</div>

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
              <div className="space-y-2">
                <div className="text-sm">Navigation</div>

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
              <div className="space-y-2">
                <div className="text-sm">Control</div>

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

            <button
              type="button"
              onClick={isListening ? stopDictation : startDictation}
              className="px-3 py-2 rounded text-white whitespace-nowrap transition-colors disabled:opacity-50"
              style={{ backgroundColor: isListening ? "#dc2626" : "#588234" }}
            >
              {isListening ? "🎙️ Listening…" : "🎙️ Dictate"}
            </button>

            <textarea
              disabled={!stageActive}
              className="w-full p-2 rounded bg-gray-100"
              placeholder="Optional point of interest"
              value={poi}
              onChange={(e) => setPoi(e.target.value)}
            />

            <button
              className="btn btn-primary"
              disabled={!stageActive}
              onClick={() => handleAddWaypoint(null)}
            >
              ➕ Add Waypoint (Current GPS)
            </button>
          </section>

          <section
            className="space-y-2"
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h2 style={{ fontSize: 22, margin: 0 }}>📏 Distances</h2>

            <div className="text-sm">
              Total distance: <strong>{totalText}</strong>
            </div>

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
          </section>

          <section
            className="space-y-2"
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h2 style={{ fontSize: 22, margin: 0 }}>
              🧭 Waypoints ({waypoints.length})
            </h2>
            {routePoints.length === 0 ? (
              <div style={{ color: "#6b7280" }}>No waypoints yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {routePoints.map((wp, idx) => {
                  const isStart = wp.kind === "start" || wp.poi === "START";
                  const wpNumber = isStart
                    ? null
                    : routePoints
                        .slice(0, idx + 1)
                        .filter((p) => p.kind !== "start" && p.poi !== "START")
                        .length;

                  return (
                    <div
                      key={wp.timestamp ?? `${wp.lat},${wp.lon},${idx}`}
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {isStart ? "START" : `Waypoint ${wpNumber}`}
                      </div>

                      {wp.type && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#6b7280",
                            marginTop: 2,
                          }}
                        >
                          Type: {wp.type.toUpperCase()}
                        </div>
                      )}

                      {wp.iconId && (
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          IconId: {wp.iconId}
                        </div>
                      )}

                      <div style={{ fontSize: 14, color: "#374151" }}>
                        {wp.lat}, {wp.lon}
                      </div>

                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {wp.timestamp}
                      </div>

                      {wp.poi && !isStart ? (
                        <div style={{ marginTop: 6 }}>{wp.poi}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
