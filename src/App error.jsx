import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import startSound from "./assets/sounds/start.wav";
import stopSound from "./assets/sounds/stop.wav";

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

// Haversine distance calculator
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function App() {
  const [startGPS, setStartGPS] = useState(null);
  const [showMap, setShowMap] = useState(true);
  const [sectionSummaries, setSectionSummaries] = useState([]);
  const [sectionName, setSectionName] = useState("Section 1");
  const [waypoints, setWaypoints] = useState([]);
  const [activeCategory, setActiveCategory] = useState("On Track");
  const [selectedIcon, setSelectedIcon] = useState(null);
  const [poi, setPoi] = useState("");
  const [recognitionActive, setRecognitionActive] = useState(false);
  const [currentGPS, setCurrentGPS] = useState(null);
  const [todayDate, setTodayDate] = useState("");
  const [sectionCount, setSectionCount] = useState(1);
  const [fullScreenMap, setFullScreenMap] = useState(false);
  // Removed unused 'sectionSummaries' state variable
  const ISO_TIME = new Date().toISOString();
  //const [todayDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

  useEffect(() => {
    const geo = navigator.geolocation;
    if (geo) {
      geo.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const gps = { lat: latitude, lon: longitude };
          setStartGPS(gps);
          setCurrentGPS(gps);
        },
        (err) => console.error("❌ Could not access GPS", err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  useEffect(() => {
    const now = new Date();
    const formattedDate = now.toISOString().split("T")[0];
    setTodayDate(formattedDate);
  }, []);

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
      distance: distance.toFixed(2),
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
      { enableHighAccuracy: true, timeout: 10000 }
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

  const exportAsJSON = (data, name = "section") => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsGPX = async (data, name = "section") => {
    const formatToISO = (timestamp) => {
      const now = new Date();
      const [hours, minutes, seconds] = timestamp.split(":");
      now.setHours(hours, minutes, seconds, 0);
      return now.toISOString();
    };

    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="Rally Mapper" xmlns="http://www.topografix.com/GPX/1/1">
${data
  .map(
    (wp) => `<wpt lat="${wp.lat}" lon="${wp.lon}">
  <name>${wp.name}</name>
  <desc>${wp.poi || ""}</desc>
  <sym>Waypoint</sym>
  <time>${formatToISO(wp.timestamp)}</time>
</wpt>`
  )
  .join("\n")}
</gpx>`;

    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);

    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [new File([blob], `${name}.gpx`)] })
    ) {
      try {
        const file = new File([blob], `${name}.gpx`, {
          type: "application/gpx+xml",
        });
        await navigator.share({
          files: [file],
          title: "GPX Export",
          text: `Section export: ${name}`,
        });
        return;
      } catch (error) {
        console.error("Share failed", error);
      }
    }

    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.gpx`;
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
      pois: waypoints.map((wp) => wp.poi).filter(Boolean),
    };

    setSections((prev) => [...prev, currentSection]);
    setSectionSummaries((prev) => [...prev, summary]);
    exportAsJSON(waypoints, sectionNameFormatted);
    exportAsGPX(waypoints, sectionNameFormatted);
    setSectionCount((prev) => prev + 1);
    setWaypoints([]);
  };

  function RecenterMapToStart({ lat, lon }) {
    const map = useMap();
    useEffect(() => {
      if (lat && lon) {
        map.setView([lat, lon], 14);
      }
    }, [lat, lon]);
    return null;
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1>Rally Route Mapper</h1>
          <button onClick={handleEndSection}>End Section</button>
          <button onClick={() => exportAsJSON(waypoints, sectionName)}>
            Export JSON
          </button>
          <button onClick={() => exportAsGPX(waypoints, sectionName)}>
            Export GPX
          </button>
          {showMap && (
            <MapContainer
              center={[startGPS.lat, startGPS.lon]}
              zoom={13}
              className="h-[400px] w-full"
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={[startGPS.lat, startGPS.lon]}>
                <Popup>Start Point</Popup>
              </Marker>
            </MapContainer>
          )}
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
          <div className="mb-2">
            <label className="block text-sm font-medium mb-1">Category</label>
            <div className="flex flex-wrap gap-5">
              {Object.keys(iconCategories).map((category) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`px-3 py-1 rounded border transition duration-200 ease-in-out transform hover:scale-105 focus:outline-none ${
                    activeCategory === category
                      ? "bg-yellow-400 text-black shadow"
                      : "bg-gray-100 text-gray-800"
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
                onClick={() => setSelectedIcon(icon.name)}
                className={`p-2 border-2 rounded ${
                  selectedIcon === icon.name
                    ? "border-yellow-500"
                    : "border-transparent"
                }`}
              >
                <img
                  src={icon.src}
                  alt={icon.name}
                  className="w-8 h-8 mx-auto"
                />
                <p className="text-xs text-center mt-1">{icon.name}</p>
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
              onClick={exportAsJSON}
              className="bg-gray-700 text-white px-4 py-2 rounded"
            >
              Export JSON
            </button>
            <button
              className="bg-blue-700 text-white px-4 py-2 rounded"
              onClick={() => exportAsGPX(waypoints, sectionName)}
            >
              Export GPX
            </button>
          </div>
          {/* ✅ Current Section Waypoints */}
          <section className="mt-6">
            <h2 className="text-lg font-semibold mb-2">
              🧭 Current Section Waypoints
            </h2>
            {waypoints.length === 0 ? (
              <p className="text-gray-500">No waypoints added yet.</p>
            ) : (
              waypoints.map((wp, idx) => (
                <div key={idx} className="bg-gray-100 p-3 rounded mb-2">
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
          </section>
          <section className="mt-6">
            <h2 className="text-lg font-semibold mb-2">📋 Section Summaries</h2>
            {sectionSummaries.length === 0 ? (
              <p className="text-gray-500">No sections completed yet.</p>
            ) : (
              sectionSummaries.map((summary, idx) => (
                <div key={idx} className="bg-white shadow rounded p-3 mb-2">
                  <h3 className="font-bold text-blue-700">{summary.name}</h3>
                  <p>Waypoints: {summary.waypointCount}</p>
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
  );
}
