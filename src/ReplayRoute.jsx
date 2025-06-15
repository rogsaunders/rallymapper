import React, { useEffect, useRef, useState } from "react";
import { GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";

const containerStyle = {
  width: "100%",
  height: "400px",
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
};

const ReplayRoute = ({ waypoints = [], intervalMs = 1000 }) => {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  });

  const mapRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const polylinePath = waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lon }));

  useEffect(() => {
    if (!isPlaying || waypoints.length === 0) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev + 1 < waypoints.length) {
          return prev + 1;
        } else {
          clearInterval(timer);
          setIsPlaying(false);
          return prev;
        }
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, waypoints, intervalMs]);

  useEffect(() => {
    if (waypoints.length > 0 && mapRef.current) {
      mapRef.current.panTo({
        lat: waypoints[currentIndex].lat,
        lng: waypoints[currentIndex].lon,
      });
    }
  }, [currentIndex]);

  const handlePlay = () => {
    setCurrentIndex(0);
    setIsPlaying(true);
  };

  if (!isLoaded || waypoints.length === 0) return <div>Loading map...</div>;

  return (
    <div className="space-y-4">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={{ lat: waypoints[0].lat, lng: waypoints[0].lon }}
        zoom={14}
        options={mapOptions}
        onLoad={(map) => (mapRef.current = map)}
      >
        <Polyline
          path={polylinePath}
          options={{ strokeColor: "#FF0000", strokeOpacity: 0.8, strokeWeight: 2 }}
        />

        {waypoints.map((wp, idx) => (
          <Marker
            key={idx}
            position={{ lat: wp.lat, lng: wp.lon }}
            label={`${idx + 1}`}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 4,
              fillColor: "#00f",
              fillOpacity: 0.6,
              strokeWeight: 0,
            }}
          />
        ))}

        {waypoints[currentIndex] && (
          <Marker
            position={{
              lat: waypoints[currentIndex].lat,
              lng: waypoints[currentIndex].lon,
            }}
            icon={{
              url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
            }}
          />
        )}
      </GoogleMap>

      <div className="flex gap-2">
        <button
          onClick={handlePlay}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          ▶️ Replay Route
        </button>
      </div>
    </div>
  );
};

export default ReplayRoute;
