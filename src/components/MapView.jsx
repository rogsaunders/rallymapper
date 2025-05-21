import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Helper component to re-center the map when startGPS changes
function RecenterMapToStart({ lat, lon }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lon) {
      map.setView([lat, lon], 14);
    }
  }, [lat, lon]);
  return null;
}

export default function MapView({ startGPS, waypoints }) {
  const defaultCenter = [-34.9285, 138.6007];

  return (
    <MapContainer
      center={startGPS ? [startGPS.lat, startGPS.lon] : defaultCenter}
      zoom={14}
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
          <Popup>
            <strong>Start Point</strong>
            <br />
            GPS: {startGPS.lat.toFixed(5)}, {startGPS.lon.toFixed(5)}
          </Popup>
        </Marker>
      )}

      {/* Automatically re-center when new startGPS is set */}
      {startGPS && <RecenterMapToStart lat={startGPS.lat} lon={startGPS.lon} />}

      {/* Start point marker */}
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
          <Popup>
            <strong>Start Point</strong>
            <br />
            GPS: {startGPS.lat.toFixed(5)}, {startGPS.lon.toFixed(5)}
          </Popup>
        </Marker>
      )}

      {/* Waypoint markers */}
      {waypoints.map((wp, idx) => (
        <Marker
          key={idx}
          position={[wp.lat, wp.lon]}
          icon={L.icon({ iconUrl: wp.iconSrc, iconSize: [32, 32] })}
        >
          <Popup>
            <strong>{wp.name}</strong>
            <br />
            GPS: {wp.lat.toFixed(5)}, {wp.lon.toFixed(5)}
            <br />
            Time: {wp.timestamp}
            <br />
            Distance: {wp.distance} km
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
