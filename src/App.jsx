import {
  GoogleMap,
  Marker,
  InfoWindow,
  Polyline,
  Circle,
  useJsApiLoader,
} from "@react-google-maps/api";
import startSound from "./assets/sounds/start.wav";
import stopSound from "./assets/sounds/stop.wav";
import JSZip from "jszip";
import React, { useEffect, useRef, useState } from "react";
import ReplayRoute from "./ReplayRoute";

// Icon categories (merged cleanly)
const iconCategories = {
  Abbreviations: [
    { name: "Keep to the left", src: "/icons/keep-left.svg" },
    { name: "Keep to the right", src: "/icons/keep-right.svg" },
    { name: "Keep straight", src: "/icons/keep-straight.svg" },
    { name: "Left", src: "/icons/left.svg" },
    { name: "Right", src: "/icons/right.svg" },
    // { name: "Left and Right", src: "/icons/left_and_right.svg" },
    // { name: "Right and Left", src: "/icons/right_and_left.svg" },
    { name: "On Left", src: "/icons/on-left.svg" },
    { name: "On Right", src: "/icons/on-right.svg" },
    { name: "Bad", src: "/icons/bad.svg" },
  ],
  "On Track": [
    { name: "Bump", src: "/icons/bump.svg" },
    { name: "Bumpy", src: "/icons/bumpy.svg" },
    // { name: "Bumpy Broken", src: "/icons/bumpy_broken.svg" },
    { name: "Dip Hole", src: "/icons/dip-hole.svg" },
    { name: "Ditch", src: "/icons/ditch.svg" },
    { name: "Summit", src: "/icons/summit.svg" },
    { name: "Hole", src: "/icons/hole.svg" },
    { name: "Up hill", src: "/icons/uphill.svg" },
    { name: "Down hill", src: "/icons/downhill.svg" },
    { name: "Fence gate", src: "/icons/fence-gate.svg" },
    { name: "Water crossing", src: "/icons/wading.svg" },
    { name: "Grid", src: "/icons/grid.svg" },
    { name: "Fence", src: "/icons/fence.svg" },
    { name: "Rail road", src: "/icons/railroad.svg" },
    { name: "Twisty", src: "/icons/twisty.svg" },
    { name: "Tree", src: "/icons/tree_5.svg" },
    { name: "Petrol Station", src: "/icons/petrol_station.svg" },
  ],

  Controls: [
    { name: "Stop for Restart", src: "/icons/stop_for_restart.svg" },
    {
      name: "Arrive Selective Section",
      src: "/icons/arrive_selective_section_flag.svg",
    },
  ],
  Safety: [
    { name: "Danger 1", src: "/icons/danger-1.svg" },
    { name: "Danger 2", src: "/icons/danger-2.svg" },
    { name: "Danger 3", src: "/icons/danger-3.svg" },
    { name: "Stop", src: "/icons/stop.svg" },
    { name: "Caution", src: "/icons/caution.svg" },
  ],
};

// Flattened icon array for easier searching
const allIcons = Object.values(iconCategories).flat();

// Haversine distance calculator
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2);
}

// Calculate cumulative distance from section start
function calculateCumulativeDistance(waypoints, currentLat, currentLon) {
  if (waypoints.length === 0) return 0;

  let totalDistance = 0;
  let prevLat = waypoints[0].lat;
  let prevLon = waypoints[0].lon;

  // Sum distances between all previous waypoints
  for (let i = 1; i < waypoints.length; i++) {
    totalDistance += parseFloat(
      calculateDistance(prevLat, prevLon, waypoints[i].lat, waypoints[i].lon)
    );
    prevLat = waypoints[i].lat;
    prevLon = waypoints[i].lon;
  }

  // Add distance from last waypoint to current position
  if (waypoints.length > 0) {
    totalDistance += parseFloat(
      calculateDistance(prevLat, prevLon, currentLat, currentLon)
    );
  }

  return parseFloat(totalDistance.toFixed(2));
}

function buildGPX(waypoints = [], trackingPoints = [], name = "Route") {
  const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RallyMapper" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
`;

  const waypointEntries = waypoints
    .map(
      (wp) => `
  <wpt lat="${wp.lat}" lon="${wp.lon}">
    <name>${wp.name}</name>
    <desc>${wp.poi || ""}</desc>
    <time>${wp.timestamp || new Date().toISOString()}</time>
  </wpt>`
    )
    .join("");

  const trackingSegment =
    trackingPoints.length > 0
      ? `
  <trk>
    <name>${name} - Auto Track</name>
    <trkseg>
      ${trackingPoints
        .map(
          (pt) => `
      <trkpt lat="${pt.lat}" lon="${pt.lon}">
        <time>${pt.timestamp}</time>
      </trkpt>`
        )
        .join("")}
    </trkseg>
  </trk>`
      : "";

  const gpxFooter = `
</gpx>`;

  return gpxHeader + waypointEntries + trackingSegment + gpxFooter;
}

// KML export function (was missing)
function buildKML(waypoints = [], trackingPoints = [], name = "Route") {
  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <description>Rally route created with RallyMapper</description>
`;

  const waypointPlacemarks = waypoints
    .map(
      (wp) => `
    <Placemark>
      <name>${wp.name}</name>
      <description>${wp.poi || ""}</description>
      <Point>
        <coordinates>${wp.lon},${wp.lat},0</coordinates>
      </Point>
    </Placemark>`
    )
    .join("");

  const trackingPath =
    trackingPoints.length > 0
      ? `
    <Placemark>
      <name>${name} - Track</name>
      <LineString>
        <coordinates>
          ${trackingPoints
            .map((pt) => `${pt.lon},${pt.lat},0`)
            .join("\n          ")}
        </coordinates>
      </LineString>
    </Placemark>`
      : "";

  const kmlFooter = `
  </Document>
</kml>`;

  return kmlHeader + waypointPlacemarks + trackingPath + kmlFooter;
}
const libraries = []; // declared outside the component or at top level
export default function App() {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: "AIzaSyCYZchsHu_Sd4KMNP1b6Dq30XzWWOuFPO8",
    libraries,
  });
  const [routeName, setRouteName] = useState("");
  const [startGPS, setStartGPS] = useState(null);
  const [sections, setSections] = useState([]);
  const [sectionSummaries, setSectionSummaries] = useState([]);
  const [sectionName, setSectionName] = useState("Section 1");
  const [trackingPoints, setTrackingPoints] = useState([]);
  const [waypoints, setWaypoints] = useState([]);
  const [showReplay, setShowReplay] = useState(false);
  const waypointListRef = useRef(null);
  const [activeCategory, setActiveCategory] = useState("Abbreviations");
  const [selectedIcon, setSelectedIcon] = useState(null);
  const [poi, setPoi] = useState("");
  const [recognitionActive, setRecognitionActive] = useState(false);
  const [currentGPS, setCurrentGPS] = useState(null);
  const [showMap, setShowMap] = useState(true);
  const [todayDate, setTodayDate] = useState("");
  const [sectionCount, setSectionCount] = useState(1);
  const [fullScreenMap, setFullScreenMap] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [sectionStarted, setSectionStarted] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);
  const [showEndSectionConfirm, setShowEndSectionConfirm] = useState(false);
  const [showStartSectionConfirm, setShowStartSectionConfirm] = useState(false);
  // Add these new state variables for inline editing
  const [editingWaypoint, setEditingWaypoint] = useState(null); // Index of waypoint being edited
  const [editValues, setEditValues] = useState({ name: "", poi: "" }); // Temporary edit values
  const [selectedWaypoints, setSelectedWaypoints] = useState(new Set()); // Set of selected waypoint indices
  const [bulkSelectMode, setBulkSelectMode] = useState(false); // Whether bulk selection is active

  // Visual feedback states
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [gpsError, setGpsError] = useState(null);
  const [waypointAdded, setWaypointAdded] = useState(false);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  const [undoTimeLeft, setUndoTimeLeft] = useState(5);

  // Map enhancement states
  const [mapType, setMapType] = useState("roadmap");
  const [showRouteStats, setShowRouteStats] = useState(false);
  const [mapZoom, setMapZoom] = useState(15);

  useEffect(() => {
    const stored = localStorage.getItem("unsavedWaypoints");
    if (stored) {
      setWaypoints(JSON.parse(stored));
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("unsavedWaypoints");
    if (saved) setWaypoints(JSON.parse(saved));
  }, []);

  useEffect(() => {
    const geo = navigator.geolocation;
    if (!geo) {
      console.error("Geolocation is not supported.");
      setGpsError("Geolocation is not supported by this device");
      setGpsLoading(false);
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    const handleSuccess = (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const gps = { lat: latitude, lon: longitude };
      setCurrentGPS(gps);
      setGpsAccuracy(accuracy);
      setGpsLoading(false);
      setGpsError(null);
      console.log("📍 GPS Updated:", gps, "Accuracy:", accuracy + "m");
    };

    const handleError = (err) => {
      console.error("❌ GPS error", err);
      setGpsLoading(false);

      // User-friendly error messages
      switch (err.code) {
        case err.PERMISSION_DENIED:
          setGpsError("GPS access denied. Please enable location permissions.");
          break;
        case err.POSITION_UNAVAILABLE:
          setGpsError("GPS signal unavailable. Try moving to an open area.");
          break;
        case err.TIMEOUT:
          setGpsError("GPS timeout. Retrying...");
          break;
        default:
          setGpsError("GPS error occurred. Check your location settings.");
      }
    };

    const watchId = geo.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
    });

    return () => geo.clearWatch(watchId);
  }, []);

  console.log("📍 GPS updated:", currentGPS?.lat, currentGPS?.lon);

  useEffect(() => {
    setTodayDate(new Date().toISOString().split("T")[0]);
  }, []);

  useEffect(() => {
    if (waypoints.length > 0) {
      localStorage.setItem("unsavedWaypoints", JSON.stringify(waypoints));
    }
  }, [waypoints]);

  useEffect(() => {
    console.log("Waypoints changed:", waypoints);
  }, [waypoints]);

  useEffect(() => {
    if (waypointListRef.current) {
      waypointListRef.current.scrollTop = waypointListRef.current.scrollHeight;
    }
  }, [waypoints]);

  useEffect(() => {
    if (!isTracking) return;

    const interval = setInterval(() => {
      if (currentGPS?.lat && currentGPS?.lon) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const newPoint = {
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              timestamp: new Date().toISOString(),
            };

            setTrackingPoints((prev) => {
              if (prev.length > 0) {
                const last = prev[prev.length - 1];
                const dist = parseFloat(
                  calculateDistance(
                    last.lat,
                    last.lon,
                    newPoint.lat,
                    newPoint.lon
                  )
                );
                setTotalDistance((td) => parseFloat((td + dist).toFixed(2)));
              }
              return [...prev, newPoint];
            });

            setCurrentGPS({ lat: newPoint.lat, lon: newPoint.lon }); // update live
            console.log("📍 Auto-tracked:", newPoint);
          },
          (err) => console.error("❌ GPS error", err),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [isTracking]);

  useEffect(() => {
    if (!showUndo) return;

    const interval = setInterval(() => {
      setUndoTimeLeft((prev) => {
        if (prev <= 1) {
          setShowUndo(false);
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showUndo]);

  const handleAddWaypoint = () => {
    if (!currentGPS) {
      setGpsError("No GPS signal available. Please wait for GPS to be ready.");
      return;
    }

    const timestamp = new Date().toLocaleTimeString();

    // Calculate cumulative distance from section start (or from start GPS if no waypoints)
    const cumulativeDistance = startGPS
      ? calculateCumulativeDistance(waypoints, currentGPS.lat, currentGPS.lon)
      : 0;

    const waypoint = {
      name: "Unnamed",
      lat: currentGPS.lat, // ✅ Store coordinates directly
      lon: currentGPS.lon, // ✅ Store coordinates directly
      timestamp,
      distance: cumulativeDistance, // ✅ Use cumulative distance
      poi: "",
      iconSrc: "",
    };
    setWaypoints((prev) => [...prev, waypoint]);

    // Visual feedback for successful waypoint addition
    setWaypointAdded(true);
    setTimeout(() => setWaypointAdded(false), 2000);

    // Haptic feedback if available
    if (navigator.vibrate) navigator.vibrate([50, 100, 50]);

    console.log("✅ Waypoint added:", waypoint);

    setShowUndo(true);
    setUndoTimeLeft(5);
  };

  const handleIconSelect = (iconName) => {
    setSelectedIcon(iconName);
    setWaypoints((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const icon = allIcons.find((i) => i.name === iconName);
      const last = { ...updated[updated.length - 1] };
      last.name = icon?.name || iconName;
      last.iconSrc = icon?.src || "";
      updated[updated.length - 1] = last;
      return updated;
    });
    if (navigator.vibrate) navigator.vibrate(30);
  };

  const updateLastWaypointIcon = (iconName) => {
    const icon = allIcons.find((i) => i.name === iconName);
    setWaypoints((prev) => {
      const updated = [...prev];
      const last = updated.length - 1;
      if (last >= 0) {
        updated[last] = {
          ...updated[last],
          name: icon?.name || iconName,
          iconSrc: icon?.src,
        };
      }
      return updated;
    });
  };

  const handleStartSection = () => {
    setSectionLoading(true);
    setSectionStarted(true);
    setIsTracking(true); // ✅ Start tracking immediately
    setTrackingPoints([]); // ✅ Reset previous tracking points
    setWaypoints([]); // Optional: also reset waypoints if needed
    setTotalDistance(0);

    const geo = navigator.geolocation;
    if (!geo) {
      console.error("❌ Geolocation not supported");
      setGpsError("Geolocation not supported on this device");
      setSectionLoading(false);
      setRefreshKey((prev) => prev + 1);
      return;
    }

    geo.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const newGPS = { lat: latitude, lon: longitude };
        setStartGPS(newGPS);
        setCurrentGPS(newGPS);

        const sectionName = `${todayDate}/Section ${sectionCount}`;
        setSections((prev) => [...prev, { name: sectionName, waypoints: [] }]);
        setSectionName(sectionName);
        setSectionCount((prev) => prev + 1);
        setSectionLoading(false);

        console.log("✅ Start Section Initialized:", sectionName, newGPS);
      },
      (err) => {
        console.error("❌ Failed to get GPS:", err);
        setGpsError("Failed to get starting GPS position. Please try again.");
        setSectionLoading(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  const mapCenter = currentGPS
    ? { lat: currentGPS.lat, lng: currentGPS.lon }
    : { lat: -35.0, lng: 138.75 }; // fallback if GPS isn't ready

  const startVoiceInput = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech Recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-AU";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setRecognitionActive(true);
      new Audio(startSound).play();
    };

    recognition.onend = () => {
      setRecognitionActive(false);
      new Audio(stopSound).play();
    };

    recognition.onresult = (event) => {
      const spokenText = event.results[0][0].transcript;
      setPoi(spokenText);

      // Add POI to the most recent waypoint
      setWaypoints((prevWaypoints) => {
        if (prevWaypoints.length === 0) return prevWaypoints;
        const updated = [...prevWaypoints];
        updated[updated.length - 1].poi = spokenText;
        return updated;
      });

      // Clear the POI field
      setPoi("");
    };

    recognition.onerror = (event) => {
      console.error("Voice input error:", event.error);
    };

    recognition.start();
  };

  const exportAsJSON = async (
    waypointsData = waypoints,
    trackingData = trackingPoints,
    name = "section"
  ) => {
    const data = {
      routeName: routeName || name,
      date: new Date().toISOString(),
      waypoints: waypointsData,
      tracking: trackingData,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    const file = new File([blob], `${name}.json`, {
      type: "application/json",
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Rally Mapper Export",
          // text: "Section data (waypoints + tracking)",
        });
        console.log("✅ Shared via iOS share sheet");
        return;
      } catch (err) {
        console.warn("Share failed or cancelled", err);
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
    console.log("⬇️ Download triggered (fallback)");
  };

  const exportAsGPX = (
    waypointsData = waypoints,
    trackingData = trackingPoints,
    name = "route"
  ) => {
    const gpxContent = buildGPX(waypointsData, trackingData, name);
    const blob = new Blob([gpxContent], { type: "application/gpx+xml" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `${name}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    console.log("⬇️ Forced GPX download triggered");
  };

  const handleUndoLastWaypoint = () => {
    if (waypoints.length === 0) return;

    // Remove last waypoint
    setWaypoints((prev) => prev.slice(0, -1));

    // Hide undo option
    setShowUndo(false);
    setUndoTimeLeft(10);

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);

    console.log("↩️ Last waypoint undone");
  };

  const startEditingWaypoint = (index) => {
    setEditingWaypoint(index);
    setEditValues({
      name: waypoints[index].name,
      poi: waypoints[index].poi || "",
    });
  };

  const saveWaypointEdit = () => {
    if (editingWaypoint === null) return;

    setWaypoints((prev) => {
      const updated = [...prev];
      updated[editingWaypoint] = {
        ...updated[editingWaypoint],
        name: editValues.name.trim() || "Unnamed",
        poi: editValues.poi.trim(),
      };
      return updated;
    });

    setEditingWaypoint(null);
    setEditValues({ name: "", poi: "" });

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate([30]);

    console.log("✅ Waypoint edited");
  };

  const cancelWaypointEdit = () => {
    setEditingWaypoint(null);
    setEditValues({ name: "", poi: "" });
  };

  const handleEditKeyPress = (e) => {
    if (e.key === "Enter") {
      saveWaypointEdit();
    } else if (e.key === "Escape") {
      cancelWaypointEdit();
    }
  };

  const toggleBulkSelectMode = () => {
    setBulkSelectMode(!bulkSelectMode);
    setSelectedWaypoints(new Set()); // Clear selections when toggling mode
  };

  const toggleWaypointSelection = (index) => {
    setSelectedWaypoints((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const selectAllWaypoints = () => {
    if (selectedWaypoints.size === waypoints.length) {
      // If all selected, deselect all
      setSelectedWaypoints(new Set());
    } else {
      // Select all waypoints
      setSelectedWaypoints(new Set(waypoints.map((_, index) => index)));
    }
  };

  const deleteSelectedWaypoints = () => {
    if (selectedWaypoints.size === 0) return;

    // Show confirmation
    const confirmDelete = window.confirm(
      `Delete ${selectedWaypoints.size} selected waypoint${
        selectedWaypoints.size !== 1 ? "s" : ""
      }? This cannot be undone.`
    );

    if (!confirmDelete) return;

    // Remove selected waypoints (in reverse order to maintain indices)
    const indicesToDelete = Array.from(selectedWaypoints).sort((a, b) => b - a);

    setWaypoints((prev) => {
      let updated = [...prev];
      indicesToDelete.forEach((index) => {
        updated.splice(index, 1);
      });
      return updated;
    });

    // Clear selections and exit bulk mode
    setSelectedWaypoints(new Set());
    setBulkSelectMode(false);

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate([50, 100, 50]);

    console.log(`🗑️ Deleted ${selectedWaypoints.size} waypoints`);
  };

  const exportAsKML = (
    waypointsData = waypoints,
    trackingData = trackingPoints,
    name = "route"
  ) => {
    const kmlContent = buildKML(waypointsData, trackingData, name);
    const blob = new Blob([kmlContent], {
      type: "application/vnd.google-earth.kml+xml",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `${name}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    console.log("⬇️ KML download triggered");
  };

  const handleEndSection = () => {
    setSectionStarted(false);
    const sectionNameFormatted = `${todayDate}/Section ${sectionCount}`;
    const currentSection = { name: sectionNameFormatted, waypoints };

    const summary = {
      name: sectionNameFormatted,
      waypointCount: waypoints.length,
      startTime: waypoints[0]?.timestamp || "N/A",
      endTime: waypoints[waypoints.length - 1]?.timestamp || "N/A",
      totalDistance: waypoints
        .reduce((sum, wp) => sum + parseFloat(wp.distance || 0), 0)
        .toFixed(2),
      pois: [...new Set(waypoints.map((wp) => wp.poi).filter(Boolean))],
      startCoords: waypoints[0]
        ? `${waypoints[0].lat.toFixed(5)}, ${waypoints[0].lon.toFixed(5)}`
        : "N/A",
      endCoords: waypoints[waypoints.length - 1]
        ? `${waypoints[waypoints.length - 1].lat.toFixed(5)}, ${waypoints[
            waypoints.length - 1
          ].lon.toFixed(5)}`
        : "N/A",
      routeName: routeName || "Unnamed Route",
    };

    setSections((prev) => [...prev, currentSection]);
    setSectionSummaries((prev) => [...prev, summary]);

    exportAsJSON(waypoints, trackingPoints, routeName || sectionNameFormatted);
    exportAsGPX(waypoints, trackingPoints, routeName || sectionNameFormatted);
    exportAsKML(waypoints, trackingPoints, routeName || sectionNameFormatted);

    setRefreshKey((prev) => prev + 1);
    setIsTracking(false);
    localStorage.removeItem("unsavedWaypoints");

    console.log("Section ended and unsaved waypoints cleared.");
    console.log("Tracking points recorded:", trackingPoints);
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Loading Rally Mapper...</p>
        </div>
      </div>
    );
  }

  if (gpsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-pulse rounded-full h-12 w-12 bg-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Acquiring GPS signal...</p>
          <p className="text-sm text-gray-500">
            Please ensure location services are enabled
          </p>
        </div>
      </div>
    );
  }

  // Create polyline path from waypoints for route visualization
  const routePath = waypoints.map((wp) => ({
    lat: wp.lat,
    lng: wp.lon,
  }));

  // Calculate route statistics
  const routeDistance =
    waypoints.length > 0 ? waypoints[waypoints.length - 1].distance : 0;
  const routeStats = {
    totalWaypoints: waypoints.length,
    routeDistance: routeDistance,
    avgSpeed:
      isTracking && trackingPoints.length > 1
        ? (
            routeDistance /
            ((Date.now() - new Date(trackingPoints[0].timestamp).getTime()) /
              3600000)
          ).toFixed(1)
        : 0,
    duration:
      trackingPoints.length > 0
        ? (
            (Date.now() - new Date(trackingPoints[0].timestamp).getTime()) /
            60000
          ).toFixed(1)
        : 0,
  };

  // Map type options
  const mapTypes = [
    { key: "roadmap", label: "Road", icon: "🗺️" },
    { key: "satellite", label: "Satellite", icon: "🛰️" },
    { key: "terrain", label: "Terrain", icon: "⛰️" },
    { key: "hybrid", label: "Hybrid", icon: "🔀" },
  ];

  // GPS Status Component
  const GPSStatus = () => {
    if (gpsError) {
      return (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <div className="flex items-center">
            <span className="text-red-500 mr-2">⚠️</span>
            <div>
              <strong>GPS Error:</strong> {gpsError}
              <button
                onClick={() => window.location.reload()}
                className="ml-2 text-red-600 underline hover:text-red-800"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (!currentGPS) {
      return (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-2"></div>
            <span>Waiting for GPS signal...</span>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-green-500 mr-2">📍</span>
            <span>GPS Active:</span>
          </div>
          <div className="text-sm">
            Accuracy: ±{gpsAccuracy ? Math.round(gpsAccuracy) : "?"}m
            <span
              className={`ml-2 px-2 py-1 rounded text-xs ${
                gpsAccuracy <= 10
                  ? "bg-green-200 text-green-800"
                  : gpsAccuracy <= 50
                  ? "bg-yellow-200 text-yellow-800"
                  : "bg-red-200 text-red-800"
              }`}
            >
              {gpsAccuracy <= 10
                ? "Excellent"
                : gpsAccuracy <= 50
                ? "Good"
                : "Poor"}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Success notification for waypoint addition
  const WaypointSuccessNotification = () => {
    if (!waypointAdded) return null;

    return (
      <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-bounce">
        <div className="flex items-center">
          <span className="text-xl mr-2">✅</span>
          <span>Waypoint Added!</span>
        </div>
      </div>
    );
  };

  const EndSectionConfirmDialog = () => {
    if (!showEndSectionConfirm) return null;

    return (
      <div
        style={{
          position: "fixed",
          top: "0",
          left: "0",
          right: "0",
          bottom: "0",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: "999",
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "24px",
            width: "320px",
            maxWidth: "90vw",
            boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)",
            margin: "20px",
          }}
        >
          <h3
            style={{
              fontSize: "1.125rem",
              fontWeight: "bold",
              color: "#1F2937",
              marginBottom: "16px",
            }}
          >
            End Section?
          </h3>
          <p
            style={{
              color: "#6B7280",
              marginBottom: "24px",
              lineHeight: "1.5",
            }}
          >
            This will export your route data and clear current waypoints. This
            action cannot be undone.
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => setShowEndSectionConfirm(false)}
              style={{
                flex: "1",
                padding: "10px 16px",
                backgroundColor: "#D1D5DB",
                color: "#374151",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowEndSectionConfirm(false);
                handleEndSection();
              }}
              style={{
                flex: "1",
                padding: "10px 16px",
                backgroundColor: "#DC2626",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              End Section
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Start Section Confirmation Dialog
  const StartSectionConfirmDialog = () => {
    if (!showStartSectionConfirm) return null;

    return (
      <div
        style={{
          position: "fixed",
          top: "0",
          left: "0",
          right: "0",
          bottom: "0",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: "999",
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "24px",
            width: "320px",
            maxWidth: "90vw",
            boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)",
            margin: "20px",
          }}
        >
          <h3
            style={{
              fontSize: "1.125rem",
              fontWeight: "bold",
              color: "#1F2937",
              marginBottom: "16px",
            }}
          >
            Start New Section?
          </h3>
          <p
            style={{
              color: "#6B7280",
              marginBottom: "24px",
              lineHeight: "1.5",
            }}
          >
            This will clear your current {waypoints.length} waypoint
            {waypoints.length !== 1 ? "s" : ""} and start fresh. Make sure
            you've exported your current data first.
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => setShowStartSectionConfirm(false)}
              style={{
                flex: "1",
                padding: "10px 16px",
                backgroundColor: "#D1D5DB",
                color: "#374151",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowStartSectionConfirm(false);
                handleStartSection();
              }}
              style={{
                flex: "1",
                padding: "10px 16px",
                backgroundColor: "#DC2626",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Start New Section
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Map Controls Component
  const MapControls = () => (
    <>
      {/* Map Type Selector - Top Left */}
      <div
        style={{ position: "absolute", top: "8px", left: "8px", zIndex: 10 }}
      >
        <div className="bg-white rounded-lg shadow-lg p-2">
          <div className="grid grid-cols-4 gap-1">
            {mapTypes.map((type) => (
              <button
                key={type.key}
                onClick={() => setMapType(type.key)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  mapType === type.key
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                <span className="mr-1">{type.icon}</span>
                {type.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Route Stats Toggle - Top Right */}
      <div
        style={{ position: "absolute", top: "8px", right: "8px", zIndex: 10 }}
      >
        <button
          onClick={() => setShowRouteStats(!showRouteStats)}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            showRouteStats
              ? "bg-blue-500 text-white"
              : "bg-white text-gray-700 hover:bg-gray-100"
          } shadow-lg`}
        >
          📊 Stats
        </button>
      </div>
    </>
  );

  const RouteStatsOverlay = () => {
    if (!showRouteStats || waypoints.length === 0) {
      return null;
    }

    return (
      <div className="absolute bottom-4 left-4 bg-white bg-opacity-95 rounded-lg shadow-lg p-4 z-50 min-w-48">
        <h3 className="font-bold text-gray-800 mb-2">Route Statistics</h3>
        <div className="space-y-1 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Waypoints:</span>
            <span className="font-medium">{routeStats.totalWaypoints}</span>
          </div>
          <div className="flex justify-between">
            <span>Distance:</span>
            <span className="font-medium">{routeStats.routeDistance} km</span>
          </div>
          {isTracking && (
            <>
              <div className="flex justify-between">
                <span>Duration:</span>
                <span className="font-medium">{routeStats.duration} min</span>
              </div>
              <div className="flex justify-between">
                <span>Avg Speed:</span>
                <span className="font-medium">{routeStats.avgSpeed} km/h</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4">
      {/* Success notification overlay */}
      <WaypointSuccessNotification />
      {/* End Section Confirmation Dialog */}
      <EndSectionConfirmDialog />
      {/* Start Section Confirmation Dialog */}
      <StartSectionConfirmDialog />

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold text-blue-800 flex items-center gap-2">
          <img src="/RRM Logo 64x64.png" className="w-8 h-8" alt="RRM Logo" />
          Rally Route Mapper
        </h1>
      </div>

      {/* GPS Status Display */}
      <GPSStatus />

      <div className="flex gap-4 mb-4">
        <button
          className="bg-gray-700 text-white px-4 py-2 rounded"
          onClick={() => setShowMap((prev) => !prev)}
        >
          {showMap ? "Hide Map" : "Show Map"}
        </button>
        <button
          className="bg-gray-700 text-white px-4 py-2 rounded"
          onClick={() => setFullScreenMap((prev) => !prev)}
        >
          {fullScreenMap ? "Exit Full Screen" : "Full Screen Map"}
        </button>
        <button
          onClick={() => setShowReplay((prev) => !prev)}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          {showReplay ? "Hide" : "Show"} Route Replay
        </button>

        {showReplay && <ReplayRoute waypoints={waypoints} />}
      </div>

      {showMap && (
        <div
          className={`relative w-full mb-2 ${
            fullScreenMap ? "h-screen" : "h-[200px]"
          }`}
        >
          {isLoaded && currentGPS && (
            <>
              {/* Map overlay controls */}
              <MapControls />
              <RouteStatsOverlay />

              <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={{ lat: currentGPS.lat, lng: currentGPS.lon }}
                zoom={mapZoom}
                mapTypeId={mapType}
                onZoomChanged={() => {
                  // Update zoom state if needed for other features
                }}
                options={{
                  zoomControl: true,
                  mapTypeControl: false, // We have our custom control
                  streetViewControl: false,
                  fullscreenControl: true,
                  gestureHandling: "greedy",
                }}
              >
                {/* Current location marker with enhanced styling */}
                <Marker
                  position={{ lat: currentGPS.lat, lng: currentGPS.lon }}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: "#4285F4",
                    fillOpacity: 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 3,
                  }}
                  title="Current Location"
                />

                {/* GPS accuracy circle */}
                {gpsAccuracy && (
                  <Circle
                    center={{ lat: currentGPS.lat, lng: currentGPS.lon }}
                    radius={gpsAccuracy}
                    options={{
                      fillColor: "#4285F4",
                      fillOpacity: 0.1,
                      strokeColor: "#4285F4",
                      strokeOpacity: 0.3,
                      strokeWeight: 1,
                    }}
                  />
                )}

                {/* Waypoint markers with custom icons */}
                {waypoints.map((wp, index) => {
                  if (!wp.lat || !wp.lon) {
                    console.warn(
                      `⚠️ Skipping invalid waypoint at index ${index}`,
                      wp
                    );
                    return null;
                  }

                  return (
                    <Marker
                      key={index}
                      position={{ lat: wp.lat, lng: wp.lon }}
                      onClick={() => setSelectedWaypoint(index)}
                      icon={
                        wp.iconSrc
                          ? {
                              url: wp.iconSrc,
                              scaledSize: new google.maps.Size(40, 40),
                              anchor: new google.maps.Point(20, 20),
                            }
                          : {
                              path: google.maps.SymbolPath.CIRCLE,
                              scale: 8,
                              fillColor: "#FF0000",
                              fillOpacity: 0.8,
                              strokeColor: "#ffffff",
                              strokeWeight: 2,
                            }
                      }
                      title={`${wp.name} (${wp.timestamp})`}
                      label={{
                        text: (index + 1).toString(),
                        color: "white",
                        fontSize: "12px",
                        fontWeight: "bold",
                      }}
                    />
                  );
                })}

                {/* Enhanced route polyline */}
                {routePath.length > 1 && (
                  <Polyline
                    path={routePath}
                    options={{
                      strokeColor: "#FF0000",
                      strokeOpacity: 0.8,
                      strokeWeight: 4,
                      geodesic: true,
                    }}
                  />
                )}

                {/* Tracking polyline (auto-recorded GPS points) */}
                {trackingPoints.length > 1 && (
                  <Polyline
                    path={trackingPoints.map((pt) => ({
                      lat: pt.lat,
                      lng: pt.lon,
                    }))}
                    options={{
                      strokeColor: "#00FF00",
                      strokeOpacity: 0.6,
                      strokeWeight: 2,
                      geodesic: true,
                    }}
                  />
                )}

                {/* Enhanced info window */}
                {selectedWaypoint !== null && waypoints[selectedWaypoint] && (
                  <InfoWindow
                    position={{
                      lat: waypoints[selectedWaypoint].lat,
                      lng: waypoints[selectedWaypoint].lon,
                    }}
                    onCloseClick={() => setSelectedWaypoint(null)}
                  >
                    <div className="p-2 max-w-xs">
                      <div className="flex items-center mb-2">
                        {waypoints[selectedWaypoint].iconSrc && (
                          <img
                            src={waypoints[selectedWaypoint].iconSrc}
                            alt={waypoints[selectedWaypoint].name}
                            className="w-6 h-6 mr-2"
                          />
                        )}
                        <strong className="text-lg">
                          {waypoints[selectedWaypoint].name}
                        </strong>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div>
                          <strong>Time:</strong>{" "}
                          {waypoints[selectedWaypoint].timestamp}
                        </div>
                        <div>
                          <strong>Position:</strong>{" "}
                          {waypoints[selectedWaypoint].lat.toFixed(6)},{" "}
                          {waypoints[selectedWaypoint].lon.toFixed(6)}
                        </div>
                        <div>
                          <strong>Distance from start:</strong>{" "}
                          {waypoints[selectedWaypoint].distance} km
                        </div>
                        {waypoints[selectedWaypoint].poi && (
                          <div>
                            <strong>Notes:</strong>{" "}
                            {waypoints[selectedWaypoint].poi}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          // Future: Add edit functionality
                          alert("Edit functionality coming soon!");
                        }}
                        className="mt-2 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                      >
                        Edit
                      </button>
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>
            </>
          )}
        </div>
      )}

      <p></p>

      {/* Route Info */}
      <div>
        <h2 className="text-lg font-semibold mb-2">
          📝 Route Info: {todayDate}
        </h2>
        <div className="flex flex-wrap gap-2 mb-2">
          <input
            className="flex-1 p-2 rounded bg-gray-100"
            placeholder="Route Name"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
          />
          <input
            className="p-2 border rounded"
            placeholder="Section Number"
            value={sectionName}
            onChange={(e) => setSectionName(e.target.value)}
          />
          <button
            className="bg-red-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            onClick={() => {
              if (waypoints.length > 0) {
                setShowStartSectionConfirm(true);
              } else {
                handleStartSection();
              }
            }}
            disabled={sectionLoading || !currentGPS || sectionStarted}
          >
            {sectionLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Starting...
              </>
            ) : (
              <>▶️ Start Section</>
            )}
          </button>
          <button
            className="bg-red-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
            onClick={() => setShowEndSectionConfirm(true)}
            disabled={!sectionStarted || waypoints.length === 0}
          >
            ⏹ End Section
          </button>
        </div>
      </div>

      {/* Waypoint Entry */}
      <div>
        {/* Centered button + meter container */}
        <div className="flex justify-center items-center gap-8 my-4">
          {/* KM Display */}
          <div
            style={{
              width: "72px",
              height: "18px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "white",
              border: "2px solid #1e3a8a",
              borderRadius: "8px",
              fontWeight: "bold",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              padding: "4px",
            }}
          >
            <span
              style={{
                fontSize: "1.2rem",
                textAlign: "center",
                lineHeight: "1.2",
                padding: "4px",
              }}
            >
              {totalDistance.toFixed(2)} km
            </span>
          </div>

          {/* Add Waypoint Button */}
          <button
            onClick={handleAddWaypoint}
            type="button"
            disabled={!currentGPS || !sectionStarted}
            style={{
              padding: "4px 16px",
              borderRadius: "8px",
              // fontWeight: "600",
              fontSize: "1.0rem",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor:
                !currentGPS || !sectionStarted
                  ? "#9CA3AF"
                  : waypointAdded
                  ? "#059669"
                  : "#2563EB",
              color: "white",
              cursor:
                !currentGPS || !sectionStarted ? "not-allowed" : "pointer",
              border: "none",
            }}
          >
            {waypointAdded ? <>✅ Added!</> : <>📍 Add Waypoint</>}
          </button>

          {showUndo && (
            <button
              onClick={handleUndoLastWaypoint}
              type="button"
              style={{
                padding: "4px 16px",
                borderRadius: "8px",
                // fontWeight: "600",
                fontSize: "1rem",
                backgroundColor: "#EF4444",
                color: "white",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              ↩️ Undo ({undoTimeLeft}s)
            </button>
          )}

          <button
            style={{
              padding: "4px 16px",
              borderRadius: "6px",
              fontSize: "1.0rem",
              color: "black",
              backgroundColor: recognitionActive ? "#FCA5A5" : "#D1D5DB",
              border: "none",
              cursor: "pointer",
            }}
            onClick={startVoiceInput}
            type="button"
            disabled={!sectionStarted || waypoints.length === 0}
          >
            🎤 {recognitionActive ? "Listening..." : "Voice Input"}
          </button>

          <button
            style={{
              padding: "4px 16px",
              borderRadius: "6px",
              fontSize: "1.0rem",
              backgroundColor: !sectionStarted ? "#E5E7EB" : "#D1D5DB",
              color: "black",
              border: "none",
              cursor: !sectionStarted ? "not-allowed" : "pointer",
            }}
            onClick={() => alert("Photo feature not yet implemented")}
            type="button"
            disabled={!sectionStarted}
          >
            📷 Photo
          </button>

          {isTracking && (
            <div className="flex items-center text-green-600 font-bold">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-ping mr-2"></div>
              📍 Tracking...
            </div>
          )}
        </div>

        <textarea
          placeholder="Point of Interest (POI)"
          className="w-full border p-2 rounded mb-2"
          value={poi}
          onChange={(e) => setPoi(e.target.value)}
        />

        <div className="flex flex-wrap gap-2 mb-2">
          <div className="flex flex-wrap gap-5">
            {Object.keys(iconCategories).map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-3 py-1 rounded border-2 font-semibold transition duration-200 ease-in-out transform hover:scale-105 focus:outline-none ${
                  activeCategory === category
                    ? "bg-yellow-300 border-yellow-500 text-black shadow"
                    : "bg-white border-gray-300 text-gray-600"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-10 gap-2 mb-4">
          {iconCategories[activeCategory].map((icon) => (
            <button
              key={icon.name}
              onClick={() => handleIconSelect(icon.name)}
              className={`w-20 h-20 flex flex-col items-center justify-center border-2 rounded-lg transition transform hover:scale-105 active:scale-95 ${
                selectedIcon === icon.name
                  ? "border-yellow-500 bg-yellow-100"
                  : "border-gray-300 bg-white"
              }`}
            >
              <img src={icon.src} alt={icon.name} className="w-8 h-8 mb-1" />
              <p className="text-xs text-center font-medium">{icon.name}</p>
            </button>
          ))}
        </div>

        {/* Waypoints List */}
        <section className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">
              🧭 Current Section Waypoints
            </h2>

            {waypoints.length > 0 && (
              <div className="flex items-center gap-2">
                {bulkSelectMode && (
                  <>
                    <span className="text-sm text-gray-600">
                      {selectedWaypoints.size} selected
                    </span>
                    <button
                      onClick={selectAllWaypoints}
                      className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                    >
                      {selectedWaypoints.size === waypoints.length
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                    {selectedWaypoints.size > 0 && (
                      <button
                        onClick={deleteSelectedWaypoints}
                        className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                      >
                        Delete ({selectedWaypoints.size})
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={toggleBulkSelectMode}
                  className={`px-3 py-1 rounded text-sm ${
                    bulkSelectMode
                      ? "bg-gray-500 text-white hover:bg-gray-600"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {bulkSelectMode ? "Exit Select" : "Select Multiple"}
                </button>
              </div>
            )}
          </div>
          <div
            ref={waypointListRef}
            className="max-h-[40vh] overflow-y-auto pr-1 space-y-2"
          >
            {waypoints.length === 0 ? (
              <p className="text-gray-500">No waypoints added yet.</p>
            ) : (
              waypoints.map((wp, idx) => (
                <div key={idx} className="bg-gray-100 p-3 rounded">
                  {/* Add checkbox for bulk selection */}
                  {bulkSelectMode && (
                    <div className="flex items-center mb-2">
                      <input
                        type="checkbox"
                        checked={selectedWaypoints.has(idx)}
                        onChange={() => toggleWaypointSelection(idx)}
                        className="mr-2 w-4 h-4"
                      />
                      <span className="text-sm text-gray-600">
                        Select for bulk operations
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <img
                      src={wp.iconSrc || "/icons/default.svg"}
                      className="w-6 h-6"
                      alt={wp.name}
                    />
                    {editingWaypoint === idx ? (
                      <div className="flex-1 flex gap-2">
                        <input
                          value={editValues.name}
                          onChange={(e) =>
                            setEditValues((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                          onKeyDown={handleEditKeyPress}
                          className="flex-1 px-2 py-1 border rounded text-sm"
                          placeholder="Waypoint name"
                          autoFocus
                        />
                        <button
                          onClick={saveWaypointEdit}
                          className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                        >
                          ✓
                        </button>
                        <button
                          onClick={cancelWaypointEdit}
                          className="px-2 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
                        >
                          ✗
                        </button>
                      </div>
                    ) : (
                      <p
                        className="font-semibold cursor-pointer hover:bg-yellow-100 px-1 rounded flex-1"
                        onClick={() => startEditingWaypoint(idx)}
                        title="Click to edit"
                      >
                        {wp.name}
                      </p>
                    )}
                  </div>

                  <p className="text-sm text-gray-600">Time: {wp.timestamp}</p>
                  <p className="text-sm text-gray-600">
                    GPS: {wp.lat.toFixed(6)}, {wp.lon.toFixed(6)}
                  </p>
                  <p className="text-sm text-gray-600">
                    Distance: {wp.distance} km
                  </p>

                  {editingWaypoint === idx ? (
                    <div className="mt-2">
                      <textarea
                        value={editValues.poi}
                        onChange={(e) =>
                          setEditValues((prev) => ({
                            ...prev,
                            poi: e.target.value,
                          }))
                        }
                        onKeyDown={handleEditKeyPress}
                        className="w-full px-2 py-1 border rounded text-sm"
                        placeholder="POI notes (optional)"
                        rows="2"
                      />
                    </div>
                  ) : (
                    wp.poi && (
                      <p
                        className="text-sm text-gray-600 cursor-pointer hover:bg-yellow-100 px-1 rounded mt-1"
                        onClick={() => startEditingWaypoint(idx)}
                        title="Click to edit"
                      >
                        POI: {wp.poi}
                      </p>
                    )
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-2">📋 Section Summaries</h2>
          {sectionSummaries.length === 0 ? (
            <p className="text-gray-500">No sections completed yet.</p>
          ) : (
            sectionSummaries.map((summary, idx) => (
              <div key={idx} className="bg-white shadow rounded p-3 mb-2">
                <h3 className="font-bold text-blue-700">{summary.name}</h3>
                {summary.routeName && (
                  <p className="text-sm text-gray-600">
                    Route: {summary.routeName}
                  </p>
                )}
                <p>Waypoints: {summary.waypointCount}</p>
                <p>Start GPS: {summary.startCoords}</p>
                <p>End GPS: {summary.endCoords}</p>
                <p>Start: {summary.startTime}</p>
                <p>End: {summary.endTime}</p>
                <p>Total Distance: {summary.totalDistance} km</p>
                {summary.pois.length > 0 && (
                  <p>POIs: {summary.pois.join(", ")}</p>
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
