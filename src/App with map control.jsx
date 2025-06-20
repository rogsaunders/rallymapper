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
    { name: "Left", src: "/icons/left.svg" },
    { name: "Right", src: "/icons/right.svg" },
    // { name: "Left and Right", src: "/icons/left_and_right.svg" },
    // { name: "Right and Left", src: "/icons/right_and_left.svg" },
    { name: "Keep to the left", src: "/icons/keep-left.svg" },
    { name: "Keep to the right", src: "/icons/keep-right.svg" },
    { name: "Keep straight", src: "/icons/keep-straight.svg" },
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
    totalDistance += parseFloat(calculateDistance(prevLat, prevLon, waypoints[i].lat, waypoints[i].lon));
    prevLat = waypoints[i].lat;
    prevLon = waypoints[i].lon;
  }
  
  // Add distance from last waypoint to current position
  if (waypoints.length > 0) {
    totalDistance += parseFloat(calculateDistance(prevLat, prevLon, currentLat, currentLon));
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
          ${trackingPoints.map(pt => `${pt.lon},${pt.lat},0`).join('\n          ')}
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
  
  // Visual feedback states
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [gpsError, setGpsError] = useState(null);
  const [waypointAdded, setWaypointAdded] = useState(false);
  const [sectionLoading, setSectionLoading] = useState(false);
  
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
      switch(err.code) {
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

    const watchId = geo.watchPosition(
      handleSuccess,
      handleError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

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
    }, 10000);

    return () => clearInterval(interval);
  }, [isTracking]);

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
      lat: currentGPS.lat,  // ✅ Store coordinates directly
      lon: currentGPS.lon,  // ✅ Store coordinates directly  
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
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
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

  // ✅ Added missing KML export function
  const exportAsKML = (
    waypointsData = waypoints,
    trackingData = trackingPoints,
    name = "route"
  ) => {
    const kmlContent = buildKML(waypointsData, trackingData, name);
    const blob = new Blob([kmlContent], { type: "application/vnd.google-earth.kml+xml" });
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
    exportAsKML(waypoints, trackingPoints, routeName || sectionNameFormatted); // ✅ Now works

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
          <p className="text-sm text-gray-500">Please ensure location services are enabled</p>
        </div>
      </div>
    );
  }

  // Create polyline path from waypoints for route visualization
  const routePath = waypoints.map(wp => ({
    lat: wp.lat,
    lng: wp.lon
  }));

  // Calculate route statistics
  const routeStats = {
    totalWaypoints: waypoints.length,
    routeDistance: waypoints.length > 0 ? waypoints[waypoints.length - 1].distance : 0,
    avgSpeed: isTracking && trackingPoints.length > 1 ? 
      (routeStats?.routeDistance / ((Date.now() - new Date(trackingPoints[0].timestamp).getTime()) / 3600000)).toFixed(1) : 0,
    duration: trackingPoints.length > 0 ? 
      ((Date.now() - new Date(trackingPoints[0].timestamp).getTime()) / 60000).toFixed(1) : 0
  };

  // Map type options
  const mapTypes = [
    { key: "roadmap", label: "Road", icon: "🗺️" },
    { key: "satellite", label: "Satellite", icon: "🛰️" },
    { key: "terrain", label: "Terrain", icon: "⛰️" },
    { key: "hybrid", label: "Hybrid", icon: "🔀" }
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
            <span>GPS Active</span>
          </div>
          <div className="text-sm">
            Accuracy: ±{gpsAccuracy ? Math.round(gpsAccuracy) : '?'}m
            <span className={`ml-2 px-2 py-1 rounded text-xs ${
              gpsAccuracy <= 10 ? 'bg-green-200 text-green-800' :
              gpsAccuracy <= 50 ? 'bg-yellow-200 text-yellow-800' :
              'bg-red-200 text-red-800'
            }`}>
              {gpsAccuracy <= 10 ? 'Excellent' : gpsAccuracy <= 50 ? 'Good' : 'Poor'}
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

  // Map Controls Component
  const MapControls = () => (
    <>
      {/* Map Type Selector - Top Left */}
      <div className="absolute top-4 left-4 z-50">
        <div className="bg-white rounded-lg shadow-lg p-2">
          <div className="grid grid-cols-4 gap-1">
            {mapTypes.map(type => (
              <button
                key={type.key}
                onClick={() => setMapType(type.key)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  mapType === type.key 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
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
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={() => setShowRouteStats(!showRouteStats)}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            showRouteStats 
              ? 'bg-blue-500 text-white' 
              : 'bg-white text-gray-700 hover:bg-gray-100'
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
        <div className="relative">
          {/* Map Controls - Positioned outside but overlaying the map */}
          <div className="relative z-50">
            <MapControls />
            <RouteStatsOverlay />
          </div>
          
          {/* Map Container */}
          <div className="h-[200px] w-full mb-2 -mt-16">
            {isLoaded && currentGPS && (
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
                  gestureHandling: 'greedy'
                }}
              >
                {/* Current location marker with enhanced styling */}
                <Marker
                  position={{ lat: currentGPS.lat, lng: currentGPS.lon }}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: '#4285F4',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
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
                      fillColor: '#4285F4',
                      fillOpacity: 0.1,
                      strokeColor: '#4285F4',
                      strokeOpacity: 0.3,
                      strokeWeight: 1,
                    }}
                  />
                )}

                {/* Waypoint markers with custom icons */}
                {waypoints.map((wp, index) => {
                  if (!wp.lat || !wp.lon) {
                    console.warn(`⚠️ Skipping invalid waypoint at index ${index}`, wp);
                    return null;
                  }
                  
                  return (
                    <Marker
                      key={index}
                      position={{ lat: wp.lat, lng: wp.lon }}
                      onClick={() => setSelectedWaypoint(index)}
                      icon={wp.iconSrc ? {
                        url: wp.iconSrc,
                        scaledSize: new google.maps.Size(40, 40),
                        anchor: new google.maps.Point(20, 20),
                      } : {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: '#FF0000',
                        fillOpacity: 0.8,
                        strokeColor: '#ffffff',
                        strokeWeight: 2,
                      }}
                      title={`${wp.name} (${wp.timestamp})`}
                      label={{
                        text: (index + 1).toString(),
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}
                    />
                  );
                })}

                {/* Enhanced route polyline */}
                {routePath.length > 1 && (
                  <Polyline
                    path={routePath}
                    options={{
                      strokeColor: '#FF0000',
                      strokeOpacity: 0.8,
                      strokeWeight: 4,
                      geodesic: true,
                    }}
                  />
                )}

                {/* Tracking polyline (auto-recorded GPS points) */}
                {trackingPoints.length > 1 && (
                  <Polyline
                    path={trackingPoints.map(pt => ({ lat: pt.lat, lng: pt.lon }))}
                    options={{
                      strokeColor: '#00FF00',
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
                        <strong className="text-lg">{waypoints[selectedWaypoint].name}</strong>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div><strong>Time:</strong> {waypoints[selectedWaypoint].timestamp}</div>
                        <div><strong>Position:</strong> {waypoints[selectedWaypoint].lat.toFixed(6)}, {waypoints[selectedWaypoint].lon.toFixed(6)}</div>
                        <div><strong>Distance from start:</strong> {waypoints[selectedWaypoint].distance} km</div>
                        {waypoints[selectedWaypoint].poi && (
                          <div><strong>Notes:</strong> {waypoints[selectedWaypoint].poi}</div>
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
            )}
          </div>
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
            onClick={handleStartSection}
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
            onClick={handleEndSection}
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
          <div className="w-32 h-32 flex flex-col items-center justify-center bg-white border-2 border-blue-900 text-black font-bold rounded-lg shadow">
            <span className="text-2xl">{totalDistance.toFixed(2)} km</span>
          </div>

          {/* Add Waypoint Button */}
          <button 
            onClick={handleAddWaypoint} 
            type="button"
            disabled={!currentGPS || !sectionStarted}
            className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 ${
              !currentGPS || !sectionStarted 
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                : waypointAdded 
                  ? 'bg-green-600 text-white animate-pulse' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
            }`}
          >
            {waypointAdded ? (
              <>✅ Added!</>
            ) : (
              <>📍 Add Waypoint</>
            )}
          </button>

          <button
            className="bg-gray-300 hover:bg-gray-400 text-black px-3 py-1 rounded disabled:bg-gray-200 disabled:cursor-not-allowed"
            onClick={() => alert("Photo feature not yet implemented")}
            type="button"
            disabled={!sectionStarted}
          >
            📷 Photo
          </button>

          <button
            className={`px-3 py-1 rounded text-black transition-colors ${
              recognitionActive 
                ? 'bg-red-300 animate-pulse' 
                : 'bg-gray-300 hover:bg-gray-400'
            } disabled:bg-gray-200 disabled:cursor-not-allowed`}
            onClick={startVoiceInput}
            type="button"
            disabled={!sectionStarted || waypoints.length === 0}
          >
            🎤 {recognitionActive ? "Listening..." : "Voice Input"}
          </button>

          {isTracking && (
            <div className="flex items-center text-green-600 font-bold">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-ping mr-2"></div>
              📍 Tracking...
            </div>
          )}
        </div>