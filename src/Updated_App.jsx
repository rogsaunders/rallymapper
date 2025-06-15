
import React, { useEffect, useRef, useState } from "react";
import {
  GoogleMap,
  Marker,
  InfoWindow,
  useJsApiLoader,
} from "@react-google-maps/api";
import startSound from "./assets/sounds/start.wav";
import stopSound from "./assets/sounds/stop.wav";
import JSZip from "jszip";

// Icon categories
const iconCategories = {
  Abbreviations: [
    { name: "Left", src: "/icons/left.svg" },
    { name: "Right", src: "/icons/right.svg" },
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

const containerStyle = {
  width: "100%",
  height: "100vh",
};

const App = () => {
  const [waypoints, setWaypoints] = useState([]);
  const [currentGPS, setCurrentGPS] = useState(null);
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: "YOUR_GOOGLE_MAPS_API_KEY", // replace with actual key
  });

  useEffect(() => {
    const saved = localStorage.getItem("unsavedWaypoints");
    if (saved) setWaypoints(JSON.parse(saved));
  }, []);

  useEffect(() => {
    const geo = navigator.geolocation;
    if (!geo) return;

    const watchId = geo.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const gps = { lat: latitude, lon: longitude };
        setCurrentGPS(gps);
        console.log("📍 GPS Updated:", gps);
      },
      (err) => console.error("❌ GPS error", err),
      { enableHighAccuracy: true, timeout: 10000 }
    );

    return () => geo.clearWatch(watchId);
  }, []);

  if (!isLoaded || !currentGPS) {
    return <div>Loading map…</div>;
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={{ lat: currentGPS.lat, lng: currentGPS.lon }}
      zoom={15}
    >
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
          />
        );
      })}

      {selectedWaypoint !== null && waypoints[selectedWaypoint] && (
        <InfoWindow
          position={{
            lat: waypoints[selectedWaypoint].lat,
            lng: waypoints[selectedWaypoint].lon,
          }}
          onCloseClick={() => setSelectedWaypoint(null)}
        >
          <div>
            <strong>Time:</strong> {waypoints[selectedWaypoint].timestamp}<br />
            <strong>GPS:</strong> {waypoints[selectedWaypoint].lat.toFixed(6)}, {waypoints[selectedWaypoint].lon.toFixed(6)}<br />
            <strong>Distance:</strong> {waypoints[selectedWaypoint].distance} km<br />
            {waypoints[selectedWaypoint].poi && (
              <><strong>POI:</strong> {waypoints[selectedWaypoint].poi}<br /></>
            )}
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
};

export default App;
