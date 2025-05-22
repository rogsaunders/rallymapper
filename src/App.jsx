import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import startSound from "../assets/sounds/start.wav";
import stopSound from "../assets/sounds/stop.wav";

// App logic and component (placeholder for actual logic previously developed)
export default function App() {
  const [startGPS, setStartGPS] = useState({ lat: -34.9285, lon: 138.6007 });
  const [showMap, setShowMap] = useState(true);

  useEffect(() => {
    const geo = navigator.geolocation;
    if (geo) {
      geo.getCurrentPosition(
        (pos) => {
          setStartGPS({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        (err) => console.error("GPS error", err)
      );
    }
  }, []);

  return (
    <div>
      <h1>Rally Route Mapper</h1>
      <button onClick={() => setShowMap((prev) => !prev)}>
        {showMap ? "Hide Map" : "Show Map"}
      </button>
      {showMap && (
        <MapContainer center={[startGPS.lat, startGPS.lon]} zoom={13} className="h-[400px] w-full">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={[startGPS.lat, startGPS.lon]}>
            <Popup>Start Point</Popup>
          </Marker>
        </MapContainer>
      )}
    </div>
  );
}