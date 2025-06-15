import React, { useEffect, useRef, useState } from "react";
import { GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import ReplayRoute from "./ReplayRoute"; // ⬅️ Added import

const containerStyle = {
  width: "100%",
  height: "400px",
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
};

const App = () => {
  const [waypoints, setWaypoints] = useState([]);
  const [showReplay, setShowReplay] = useState(false);

  // Example waypoint loading
  useEffect(() => {
    const stored = localStorage.getItem("unsavedWaypoints");
    if (stored) {
      setWaypoints(JSON.parse(stored));
    }
  }, []);

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold">Rally Mapper</h1>

      <button
        onClick={() => setShowReplay((prev) => !prev)}
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
      >
        {showReplay ? "Hide" : "Show"} Route Replay
      </button>

      {showReplay && <ReplayRoute waypoints={waypoints} />}

      {/* Other app content here */}
    </div>
  );
};

export default App;
