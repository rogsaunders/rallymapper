import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import MapView from "./components/MapView";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import startSound from "./assets/sounds/start.wav";
import stopSound from "./assets/sounds/stop.wav";
import JSZip from "jszip";

// Icon categories (merged cleanly)
const iconCategories = {
  Abbreviations: [
    { name: "Left", src: "/icons/left.svg" },
    { name: "Right", src: "/icons/right.svg" },
    { name: "Left and Right", src: "/icons/left_and_right.svg" },
    { name: "Right and Left", src: "/icons/right_and_left.svg" },
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
    { name: "Bumpy Broken", src: "/icons/bumpy_broken.svg" },
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

function buildGPX(waypoints, name = "Route") {
  const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RallyMapper" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>`;

  const gpxPoints = waypoints
    .map(
      (wp) => `
      <trkpt lat="${wp.lat}" lon="${wp.lon}">
        <time>${new Date().toISOString()}</time>
        <desc>${wp.name}${wp.poi ? ` - ${wp.poi}` : ""}</desc>
      </trkpt>`
    )
    .join("");

  const gpxFooter = `
    </trkseg>
  </trk>
</gpx>`;

  return gpxHeader + gpxPoints + gpxFooter;
}

export default function App() {
  const [routeName, setRouteName] = useState("");
  const [startGPS, setStartGPS] = useState(null);
  const [sections, setSections] = useState([]);
  const [sectionSummaries, setSectionSummaries] = useState([]);
  const [sectionName, setSectionName] = useState("Section 1");
  const [waypoints, setWaypoints] = useState([]);
  const [activeCategory, setActiveCategory] = useState("Abbreviations");
  const [selectedIcon, setSelectedIcon] = useState(null);
  const [poi, setPoi] = useState("");
  const [recognitionActive, setRecognitionActive] = useState(false);
  const [currentGPS, setCurrentGPS] = useState(null);
  const [showMap, setShowMap] = useState(true);
  const [todayDate, setTodayDate] = useState("");
  const [sectionCount, setSectionCount] = useState(1);
  const [fullScreenMap, setFullScreenMap] = useState(false);
  //const poiRef = useRef(null);

  //const ISO_TIME = new Date().toISOString();
  const [refreshKey, setRefreshKey] = useState(0);
  //const [todayDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

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
    const now = new Date();
    const formattedDate = now.toISOString().split("T")[0];
    setTodayDate(formattedDate);
  }, []);

  useEffect(() => {
    if (waypoints.length > 0) {
      localStorage.setItem("unsavedWaypoints", JSON.stringify(waypoints));
    }
  }, [waypoints]);

  useEffect(() => {
    console.log("Waypoints changed:", waypoints);
  }, [waypoints]);

  const handleAddWaypoint = () => {
    if (!selectedIcon || !currentGPS) return;

    const icon = allIcons.find((i) => i.name === selectedIcon);
    const { lat, lon } = currentGPS;
    const timestamp = new Date().toLocaleTimeString();

    const distance =
      waypoints.length > 0
        ? calculateDistance(
            waypoints[waypoints.length - 1].lat,
            waypoints[waypoints.length - 1].lon,
            lat,
            lon
          )
        : 0;

    const waypoint = {
      name: icon?.name || selectedIcon,
      iconSrc: icon?.src,
      lat,
      lon,
      timestamp,
      distance: distance,
      poi,
    };

    console.log("Waypoint added:", waypoint); // ✅ add this line
    setWaypoints((prev) => [...prev, waypoint]);
    setPoi("");
  };

  const handleStartSection = () => {
    const geo = navigator.geolocation;
    if (!geo) {
      console.error("❌ Geolocation not supported");
      setWaypoints([]);
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

  const exportAsJSON = async (data, name = "section") => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    const file = new File([blob], `${name}.json`, {
      type: "application/json",
    });

    // Try using native share if supported
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Rally Mapper Export",
          text: "Section data as JSON",
        });
        console.log("✅ Shared via iOS share sheet");
        return;
      } catch (err) {
        console.warn("Share failed or cancelled", err);
      }
    }

    // Fallback for desktop
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${routeName || name}.json`;
    a.click();
    URL.revokeObjectURL(url);
    console.log("⬇️ Download triggered (fallback)");
  };

  const exportAsGPX = (waypoints, name = "route") => {
    const gpxContent = buildGPX(waypoints, name);
    const blob = new Blob([gpxContent], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  function buildGPX(waypoints, name = "Route") {
    const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
  <gpx version="1.1" creator="RallyMapper" xmlns="http://www.topografix.com/GPX/1/1">
    <trk>
      <name>${name}</name>
      <trkseg>`;

    const gpxPoints = waypoints
      .map(
        (wp) => `
        <trkpt lat="${wp.lat}" lon="${wp.lon}">
          <time>${new Date().toISOString()}</time>
          <desc>${wp.name}${wp.poi ? ` - ${wp.poi}` : ""}</desc>
        </trkpt>`
      )
      .join("");

    const gpxFooter = `
      </trkseg>
    </trk>
  </gpx>`;

    return gpxHeader + gpxPoints + gpxFooter;
  }

  function buildKML(waypoints, name = "Route") {
    const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
  <kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
      <name>${name}</name>`;

    const kmlPoints = waypoints
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

    const kmlFooter = `
    </Document>
  </kml>`;

    return kmlHeader + kmlPoints + kmlFooter;
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
    setSectionCount((prev) => prev + 1);
    setWaypoints([]);
    setSectionName(`Section ${sectionCount + 1}`);
    setRefreshKey((prev) => prev + 1);
    localStorage.removeItem("unsavedWaypoints");

    // ✅ Confirm to console
    console.log("Section ended and unsaved waypoints cleared.");
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Top Area: Map + Route Info + Icons */}
      <div
        className={`flex-none ${
          showMap ? "h-[75vh]" : "h-[45vh]"
        } overflow-hidden`}
      >
        <div className="p-4">
          {/* Your existing Map + Route Info + Icon Picker */}
        </div>
      </div>

      <div className="flex gap-4 mb-4">
        <button
          className="bg-gray-700 text-white px-4 py-2 rounded"
          onClick={() => setShowMap((prev) => !prev)}
        >
          {showMap ? "Hide Map" : "Show Map"}
        </button>
        <button onClick={() => setFullScreenMap((prev) => !prev)}>
          {fullScreenMap ? "Exit Full Screen" : "Full Screen Map"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {showMap && (
          <div className={fullScreenMap ? "h-[80vh]" : "h-[260px] mb-4"}>
            <MapContainer
              center={currentGPS ? [currentGPS.lat, currentGPS.lon] : [0, 0]}
              zoom={currentGPS ? 14 : 2}
              scrollWheelZoom
              className="h-full w-full"
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
              {startGPS && (
                <Marker
                  position={[startGPS.lat, startGPS.lon]}
                  icon={L.icon({
                    iconUrl: "/icons/start-flag.svg",
                    iconSize: [32, 32],
                    iconAnchor: [16, 32],
                    popupAnchor: [0, -32],
                  })}
                >
                  <RecenterMapToStart lat={startGPS.lat} lon={startGPS.lon} />
                  <Popup>
                    <strong>Start Point</strong>
                    <br />
                    GPS: {startGPS.lat.toFixed(5)}, {startGPS.lon.toFixed(5)}
                  </Popup>
                </Marker>
              )}
              {currentGPS && (
                <Marker
                  position={[currentGPS.lat, currentGPS.lon]}
                  icon={L.icon({
                    iconUrl: "/icons/current-position.svg", // use a different icon than the start flag
                    iconSize: [24, 24],
                    iconAnchor: [12, 12],
                  })}
                >
                  <Popup>
                    <strong>Current Location</strong>
                    <br />
                    GPS: {currentGPS.lat.toFixed(5)},{" "}
                    {currentGPS.lon.toFixed(5)}
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold mb-2">📝 Route Info</h2>
            <div className="flex gap-4 mb-4">
              <input
                className="p-2 border rounded"
                placeholder="Section Number"
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
              />
              <button
                className="bg-red-1200 text-white px-4 py-2 rounded"
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
            <p className="text-sm text-gray-500">📅 {todayDate}</p>
          </div>

          <div className="flex flex-wrap gap-2 mb-2">
            <input
              className="flex-1 p-2 rounded bg-gray-100"
              placeholder="Route Name"
            />
            <input
              className="flex-1 p-2 rounded bg-gray-100"
              placeholder="Start Location"
            />
            <input
              className="flex-1 p-2 rounded bg-gray-100"
              placeholder="End Location"
            />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Waypoint Entry</h2>
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
          <div className="grid grid-cols-6 gap-2 mb-4">
            {iconCategories[activeCategory].map((icon) => (
              <button
                key={icon.name}
                onClick={() => {
                  setSelectedIcon(icon.name);
                  if (navigator.vibrate) navigator.vibrate(30); // 30ms vibration
                }}
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
          <button
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
            onClick={handleAddWaypoint}
            disabled={!selectedIcon}
          >
            ➕ Add Waypoint
          </button>
          <p></p>
          <div className="flex gap-4 mt-4">
            <button
              className="bg-gray-700 text-white px-4 py-2 rounded"
              onClick={exportAsJSON}
            >
              Export JSON
            </button>
            <button
              className="bg-blue-700 text-white px-4 py-2 rounded"
              onClick={() => exportAsGPX(waypoints, routeName || sectionName)}
            >
              Export GPX
            </button>

            <button
              className="bg-green-700 text-white px-4 py-2 rounded"
              onClick={() => exportAsKML(waypoints, routeName || sectionName)}
            >
              Export KML
            </button>
          </div>

          {/* Scrollable Waypoints + Summaries */}
          <div className="flex-1 overflow-y-auto p-4 bg-white">
            <section>
              <h2 className="text-lg font-semibold mb-2">
                🧭 Current Section Waypoints
              </h2>
              <div className="space-y-2">
                {waypoints.length === 0 ? (
                  <p className="text-gray-500">No waypoints added yet.</p>
                ) : (
                  waypoints.map((wp, idx) => (
                    <div key={idx} className="bg-gray-100 p-3 rounded">
                      <div className="flex items-center gap-2">
                        <img
                          src={wp.iconSrc}
                          className="w-6 h-6"
                          alt={wp.name}
                        />
                        <p className="font-semibold">{wp.name}</p>
                      </div>
                      <p className="text-sm text-gray-600">
                        Time: {wp.timestamp}
                      </p>
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
              <h2 className="text-lg font-semibold mb-2">
                📋 Section Summaries
              </h2>
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
      </div>
    </div>
  );
}
