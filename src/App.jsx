import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import startSound from "./assets/sounds/start.wav";
import stopSound from "./assets/sounds/stop.wav";
import JSZip from "jszip";
import React, { useEffect, useRef, useState } from "react";
// ... other imports remain unchanged

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

function RecenterMapToStart({ lat, lon }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lon) {
      map.setView([lat, lon], 14);
    }
  }, [lat, lon]);
  return null;
}

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

  useEffect(() => {
    const saved = localStorage.getItem("unsavedWaypoints");
    if (saved) setWaypoints(JSON.parse(saved));
  }, []);

  useEffect(() => {
    const geo = navigator.geolocation;
    if (!geo) {
      console.error("Geolocation is not supported.");
      return;
    }

    const watchId = geo.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const gps = { lat: latitude, lon: longitude };
        setCurrentGPS(gps);
        console.log("📍 GPS Updated:", gps); // ✅ Confirm it's changing
      },
      (err) => {
        console.error("❌ GPS error", err);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
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
    if (!isTracking || !currentGPS?.lat || !currentGPS?.lon) return;

    const interval = setInterval(() => {
      const newPoint = {
        lat: currentGPS.lat,
        lon: currentGPS.lon,
        timestamp: new Date().toISOString(),
      };

      setTrackingPoints((prev) => {
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          const dist = parseFloat(
            calculateDistance(last.lat, last.lon, newPoint.lat, newPoint.lon)
          );
          setTotalDistance((td) => parseFloat((td + dist).toFixed(2)));
        }
        return [...prev, newPoint];
      });

      console.log("📍 Auto-tracked:", newPoint);
    }, 10000);

    return () => clearInterval(interval);
  }, [isTracking, currentGPS]);

  const handleAddWaypoint = () => {
    if (!currentGPS) return;
    const timestamp = new Date().toLocaleTimeString();
    const distance =
      waypoints.length > 0
        ? calculateDistance(
            waypoints[waypoints.length - 1].lat,
            waypoints[waypoints.length - 1].lon,
            currentGPS.lat,
            currentGPS.lon
          )
        : 0;
    const waypoint = {
      name: "Unnamed",
      // iconSrc: "",
      lat: currentGPS.lat,
      lon: currentGPS.lon,
      timestamp,
      distance,
      poi: "",
    };
    setWaypoints((prev) => [...prev, waypoint]);
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
    setSectionStarted(true);
    setIsTracking(true); // ✅ Start tracking immediately
    setTrackingPoints([]); // ✅ Reset previous tracking points
    setWaypoints([]); // Optional: also reset waypoints if needed
    setTotalDistance(0);

    const geo = navigator.geolocation;
    if (!geo) {
      console.error("❌ Geolocation not supported");
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

        console.log("✅ Start Section Initialized:", sectionName, newGPS);
      },
      (err) => {
        console.error("❌ Failed to get GPS:", err);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const containerStyle = {
    width: "100%",
    height: "100%",
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
          text: "Section data (waypoints + tracking)",
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

  function buildGPX(waypoints = [], trackingPoints = [], name = "Route") {
    const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
  <gpx version="1.1" creator="RallyMapper" xmlns="http://www.topografix.com/GPX/1/1">
    <metadata>
      <name>${name}</name>
      <time>${new Date().toISOString()}</time>
    </metadata>
  `;

    const exportAsGPX = (
      waypointsData = waypoints,
      trackingData = trackingPoints,
      name = "route"
    ) => {
      const gpxContent = buildGPX(waypointsData, trackingData, name);
      const blob = new Blob([gpxContent], { type: "application/octet-stream" });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `${name}.gpx`; // ✅ Ensure .gpx extension is present
      document.body.appendChild(a); // ✅ Append to DOM
      a.click(); // ✅ Trigger download
      document.body.removeChild(a); // ✅ Clean up
      window.URL.revokeObjectURL(url); // ✅ Free memory

      console.log("⬇️ Forced GPX download triggered");
    };

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

  const exportAsKML = (waypoints, name = "route") => {
    const kmlContent = buildKML(waypoints, name);
    const blob = new Blob([kmlContent], {
      type: "application/vnd.google-earth.kml+xml",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.kml`;
    a.click();
    URL.revokeObjectURL(url);
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
    exportAsJSON(waypoints, routeName || sectionNameFormatted);
    exportAsGPX(waypoints, routeName || sectionNameFormatted);
    exportAsKML(waypoints, routeName || sectionNameFormatted);
    //setSectionCount((prev) => prev + 1);
    //setWaypoints([]);
    //setSectionName(`Section ${sectionCount + 1}`);
    setRefreshKey((prev) => prev + 1);
    setIsTracking(false);
    localStorage.removeItem("unsavedWaypoints");

    // ✅ Confirm to console
    console.log("Section ended and unsaved waypoints cleared.");
    // Optional: export trackingPoints separately if needed
    console.log("Tracking points recorded:", trackingPoints);
  };

  //import React, { useEffect, useRef, useState } from "react";
  // ... other imports remain unchanged

  //export default function App() {
  // ... all your useState and useEffect hooks remain unchanged

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold text-blue-800 flex items-center gap-2">
          <img src="/RRM Logo 64x64.png" className="w-8 h-8" alt="RRM Logo" />
          Rally Route Mapper
        </h1>
      </div>

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
      </div>

      {showMap && (
        <div
          className={
            fullScreenMap ? "relative h-[80vh]" : "relative h-[260px] mb-4"
          }
        >
          {isLoaded && (
            <>
              <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={mapCenter}
                zoom={14}
              >
                {startGPS && (
                  <Marker
                    position={{ lat: startGPS.lat, lng: startGPS.lon }}
                    icon={{
                      url: "/icons/start-flag.svg",
                      scaledSize: new window.google.maps.Size(32, 32),
                    }}
                  />
                )}
                {currentGPS && (
                  <Marker
                    position={{ lat: currentGPS.lat, lng: currentGPS.lon }}
                    icon={{
                      url: "/icons/dot.svg",
                      scaledSize: new window.google.maps.Size(24, 24),
                    }}
                  />
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
            className="bg-red-600 text-white px-4 py-2 rounded"
            onClick={handleStartSection}
          >
            ▶️ Start Section
          </button>
          <button
            className="bg-red-600 text-white px-4 py-2 rounded"
            onClick={handleEndSection}
          >
            ⏹ End Section
          </button>
        </div>
      </div>

      {/* Waypoint Entry */}
      <div>
        {/* Centered button + meter container */}
        <div className="flex justify-center items-center gap-8 mx-auto">
          {/* Add Waypoint Button */}
          <button
            onClick={handleAddWaypoint}
            disabled={!currentGPS}
            style={{ color: "#16a34a", fontWeight: "800" }} // text-green-600 fallback
            className="flex flex-col items-center justify-center w-40 h-24 bg-white border-4 border-blue-900 rounded-md px-6 py-4 text-green-600 font-extrabold text-2xl text-center leading-tight transition-transform transform active:scale-95"
          >
            ADD
            <br />
            WAYPOINT
          </button>

          {/* Distance Meter */}
          <div className="flex flex-col items-center justify-center w-40 h-24 bg-white border-4 border-blue-900 text-black font-bold rounded shadow">
            <span className="text-xs tracking-widest">KILOMETERS</span>
            <span className="text-3xl">{totalDistance.toFixed(2)}</span>
          </div>
          {isTracking && (
            <p className="text-green-600 font-bold animate-pulse mt-2">
              📍 Tracking...
            </p>
          )}
        </div>

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
        <textarea
          placeholder="Point of Interest (POI)"
          className="w-full border p-2 rounded mb-2"
          value={poi}
          onChange={(e) => setPoi(e.target.value)}
        />
        <button
          className="bg-gray-300 hover:bg-gray-400 text-black px-3 py-1 rounded mt-2"
          onClick={startVoiceInput}
          type="button"
        >
          🎤 {recognitionActive ? "Listening..." : "Voice Input"}
        </button>

        {/* Waypoints List */}
        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-2">
            🧭 Current Section Waypoints
          </h2>
          <div
            ref={waypointListRef}
            className="max-h-[40vh] overflow-y-auto pr-1 space-y-2"
          >
            {waypoints.length === 0 ? (
              <p className="text-gray-500">No waypoints added yet.</p>
            ) : (
              waypoints.map((wp, idx) => (
                <div key={idx} className="bg-gray-100 p-3 rounded">
                  <div className="flex items-center gap-2">
                    <img src={wp.iconSrc} className="w-6 h-6" alt={wp.name} />
                    <p className="font-semibold">{wp.name}</p>
                  </div>
                  <p className="text-sm text-gray-600">Time: {wp.timestamp}</p>
                  <p className="text-sm text-gray-600">
                    GPS: {wp.lat}, {wp.lon}
                  </p>
                  <p className="text-sm text-gray-600">
                    Distance: {wp.distance} km
                  </p>
                  {wp.poi && (
                    <p className="text-sm text-gray-600">POI: {wp.poi}</p>
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
