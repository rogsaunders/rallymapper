import React, { useState, useEffect, useRef } from "react";
import MapView from "./components/MapView";
import { iconCategories, allIcons } from "./data/icons"; // to be created
import startSound from "./assets/sounds/start.wav";
import stopSound from "./assets/sounds/stop.wav";
import { useMap } from "react-leaflet";
import PropTypes from "prop-types";

function RecenterMapToStart({ lat, lon }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lon) map.setView([lat, lon], 14);
  }, [lat, lon]);
  return null;
}

RecenterMapToStart.propTypes = {
  lat: PropTypes.number,
  lon: PropTypes.number,
};

function calculateDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const [poi, setPoi] = useState("");
const [recognitionActive, setRecognitionActive] = useState(false);
const poiRef = useRef(null);

// Rally icon categories
const iconCategories = {
  "On Track": [
    { name: "Bump", src: "/icons/bump.svg" },
    { name: "Dip Hole", src: "/icons/dip-hole.svg" },
    { name: "Ditch", src: "/icons/ditch.svg" },
    { name: "Water Crossing", src: "/icons/wading.svg" },
  ],
  Abbreviations: [
    { name: "Left", src: "/icons/left.svg" },
    { name: "Right", src: "/icons/right.svg" },
  ],
  Controls: [
    { name: "Stop", src: "/icons/stop.svg" },
    { name: "Checkpoint", src: "/icons/checkpoint.svg" },
  ],
  Safety: [
    { name: "Danger 1", src: "/icons/danger-1.svg" },
    { name: "Danger 2", src: "/icons/danger-2.svg" },
  ],
};

const allIcons = Object.values(iconCategories).flat();

export default function RallyLayout() {
  const [date, setDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [routeName, setRouteName] = useState("");
  const [startGPS, setStartGPS] = useState(null);
  const [currentGPS, setCurrentGPS] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [selectedIcon, setSelectedIcon] = useState(null);
  const [activeCategory, setActiveCategory] = useState("On Track");
  const [poi, setPoi] = useState("");
  const [recognitionActive, setRecognitionActive] = useState(false);
  const poiRef = useRef(null);
  

  // Get current GPS location
  const handleSetStart = () => {
    const geo = navigator.geolocation;
    if (!geo) return alert("Geolocation not supported");

    geo.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const coords = { lat: latitude, lon: longitude };
        setStartGPS(coords);
        setCurrentGPS(coords);
      },
      (err) => alert("❌ Could not access GPS\n" + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleAddWaypoint = () => {
    if (!currentGPS || !selectedIcon) return;
  
    const { lat, lon } = currentGPS;
    const timestamp = new Date().toLocaleTimeString();
  
    const distance = startGPS
      ? calculateDistance(startGPS.lat, startGPS.lon, lat, lon)
      : 0;
  
    const waypoint = {
      name: selectedIcon.name,
      iconSrc: selectedIcon.src,
      lat,
      lon,
      timestamp,
      distance: distance.toFixed(2),
    };
  
    setWaypoints((prev) => [...prev, waypoint]);
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

    recognition.onstart = () => setRecognitionActive(true);
    recognition.onend = () => setRecognitionActive(false);
    recognition.onerror = (event) =>
      console.error("Voice input error:", event.error);
    recognition.onresult = (event) => {
      const spokenText = event.results[0][0].transcript;
      setPoi(spokenText);
      poiRef.current?.focus();
    };

    recognition.start();
  };


  return (
    <div className="flex h-screen">
      {/* Left: Map */}
      <div className="w-1/2 h-full">
        <MapView startGPS={startGPS} waypoints={waypoints} />
      </div>

      {/* Right: Controls */}

      <button
        className="bg-blue-600 text-white px-4 py-2 rounded mb-2"
        onClick={() => {
          const geo = navigator.geolocation;
          if (!geo) {
            console.error("❌ Geolocation not supported");
            return;
          }

          geo.getCurrentPosition(
            (pos) => {
              const { latitude, longitude } = pos.coords;
              setStartGPS({ lat: latitude, lon: longitude });
              setCurrentGPS({ lat: latitude, lon: longitude });
            },
            (err) => console.error("❌ Could not access GPS", err),
            { enableHighAccuracy: true, timeout: 10000 }
          );
        }}
      >
        📍 Set Start Point
      </button>

      <div className="w-1/2 h-full overflow-y-auto p-4 space-y-4 bg-white border-l">
        {/* Route Info */}
        <section>
          <h2 className="text-lg font-bold">📝 Route Info</h2>
          <input
            type="date"
            className="w-full p-2 rounded border"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            className="w-full p-2 mt-2 rounded border"
            placeholder="Route Name"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
          />
          <button
            className="w-full mt-2 px-4 py-2 bg-blue-600 text-white rounded"
            onClick={handleSetStart}
          >
            📍 Set Start Point
          </button>
        </section>
        import {(iconCategories, allIcons)} from "@/constants/icons"; // Add
        this at the top of RallyLayout.jsx ... // Inside the return JSX:
        <section>
          <h2 className="text-lg font-semibold">📍 Select Waypoint Icon</h2>

          {/* Category Tabs */}
          <div className="flex gap-2 flex-wrap mb-2">
            {Object.keys(iconCategories).map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-3 py-1 rounded ${
                  activeCategory === category
                    ? "bg-yellow-400 text-black"
                    : "bg-gray-300"
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <section>
            <h2 className="text-lg font-semibold">📍 Select Waypoint Icon</h2>
            <div className="flex gap-2 flex-wrap mb-2">
              {Object.keys(iconCategories).map((category) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`px-3 py-1 rounded ${
                    activeCategory === category ? "bg-yellow-400 text-black" : "bg-gray-300"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {iconCategories[activeCategory].map((icon) => (
                <button
                  key={icon.name}
                  onClick={() => setSelectedIcon(icon)}
                  className={`p-2 rounded border-2 ${
                    selectedIcon?.name === icon.name ? "border-yellow-400" : "border-transparent"
                  } bg-white`}
                >
                  <img src={icon.src} alt={icon.name} className="w-8 h-8 mx-auto" />
                  <p className="text-xs text-center mt-1">{icon.name}</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mt-4">🗒️ Point of Interest (POI)</h2>
            <textarea
              className="w-full p-2 rounded bg-gray-100"
              placeholder="Optional point of interest"
              value={poi}
              onChange={(e) => setPoi(e.target.value)}
            />
          </section>

          {/* Icon Buttons */}
          <div className="grid grid-cols-5 gap-2 mb-2">
            {iconCategories[activeCategory].map((icon) => (
              <button
                key={icon.name}
                onClick={() => setSelectedIcon(icon)}
                className={`p-2 rounded border-2 ${
                  selectedIcon?.name === icon.name
                    ? "border-yellow-500"
                    : "border-transparent"
                } bg-white`}
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
            ref={poiRef}
            placeholder="Point of Interest"
            value={poi}
            onChange={(e) => setPoi(e.target.value)}
            className="w-full p-2 rounded bg-gray-100"
          />
          <button
            className="bg-gray-300 hover:bg-gray-400 text-black px-3 py-1 rounded mt-2"
            onClick={startVoiceInput}
            type="button"
          >
            🎤 {recognitionActive ? "Listening..." : "Voice Input"}
          </button>

          {/* Add Waypoint Button */}
          <button
            onClick={handleAddWaypoint}
            className="bg-green-600 text-white w-full py-2 rounded"
            disabled={!selectedIcon || !currentGPS}
          >
            ➕ Add Waypoint
          </button>
        </section>
        {/* Waypoint Icons */}
        <section>
          <h2 className="text-lg font-bold">📍 Select Waypoint Icon</h2>
          <div className="flex gap-2 flex-wrap mb-2">
            {Object.keys(iconCategories).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1 rounded ${
                  activeCategory === cat
                    ? "bg-yellow-400 text-black"
                    : "bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-6 gap-2">
            {iconCategories[activeCategory].map((icon) => (
              <button
                key={icon.name}
                onClick={() => setSelectedIcon(icon.name)}
                className={`p-2 rounded border-2 ${
                  selectedIcon === icon.name
                    ? "border-yellow-400"
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
        </section>
        
        const waypoint = {
          name: selectedIcon.name,
          iconSrc: selectedIcon.src,
          lat,
          lon,
          timestamp,
          distance: distance.toFixed(2),
          poi, // <-- add this
        };



        {/* POI input and Waypoint Add */}
        <section>
          <h2 className="text-lg font-bold">🗒️ Waypoint</h2>
          <textarea
            ref={poiRef}
            value={poi}
            onChange={(e) => setPoi(e.target.value)}
            className="w-full p-2 rounded border bg-gray-50"
            placeholder="Point of Interest"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={startVoiceInput}
              className="w-1/2 px-4 py-2 bg-gray-300 rounded"
            >
              🎤 {recognitionActive ? "Listening..." : "Voice Input"}
            </button>
            <button
              onClick={handleAddWaypoint}
              disabled={!selectedIcon}
              className="w-1/2 px-4 py-2 bg-green-600 text-white rounded"
            >
              Add Waypoint
            </button>
          </div>
        </section>
        {/* Waypoint List */}
        <section>
          <h2 className="text-lg font-bold">🧭 Waypoints</h2>
          {waypoints.map((wp, idx) => (
            <div key={idx} className="p-2 border rounded mb-2">
              <div className="flex items-center gap-2">
                <img src={wp.iconSrc} className="w-5 h-5" />
                <strong>{wp.name}</strong>
              </div>
              <p className="text-sm text-gray-600">Time: {wp.timestamp}</p>
              <p className="text-sm text-gray-600">
                GPS: {wp.lat}, {wp.lon}
              </p>
              <p className="text-sm text-gray-600">
                Distance: {wp.distance} km
              </p>
              {wp.poi && <p className="text-sm text-gray-600">POI: {wp.poi}</p>}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

// Helper: Calculate distance using haversine
function calculateDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2);
}
