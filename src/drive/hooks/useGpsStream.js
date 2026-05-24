// src/drive/hooks/useGpsStream.js
//
// Subscribe to the device's GPS via watchPosition and expose the
// latest fix as React state. Self-contained — doesn't depend on the
// recording side's track state.
//
// Matches the recording side's accuracy filter (drop fixes worse
// than 80 m, since those are usually network-location estimates
// rather than real GPS). The recording side uses 80 m because
// network fixes regularly come back at 100 m+; mirroring that
// threshold here keeps Drive Mode's distance-to-row numbers honest.
//
// Returns:
//   {
//     gps: { lat, lon, accuracy, speed, fixTs, timestamp } | null,
//     error: string | null,
//     supported: boolean,
//   }

import { useEffect, useState } from "react";

const TRACK_MAX_ACCURACY_M = 80;

export function useGpsStream() {
  const [gps, setGps] = useState(null);
  const [error, setError] = useState(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const geo =
      typeof navigator !== "undefined" ? navigator.geolocation : null;

    if (!geo) {
      setSupported(false);
      setError("Geolocation not supported in this browser.");
      return;
    }

    const watchId = geo.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords;
        if (
          Number.isFinite(accuracy) &&
          accuracy > TRACK_MAX_ACCURACY_M
        ) {
          // Drop low-quality fix; keep the previous one in state.
          return;
        }
        setGps({
          lat,
          lon,
          accuracy,
          speed: Number.isFinite(speed) ? speed : null,
          fixTs: pos.timestamp,
          timestamp: new Date(pos.timestamp).toISOString(),
        });
        setError(null);
      },
      (err) => {
        // Don't blow away an existing fix on a transient error; just
        // surface the message.
        const msg = err?.message || "GPS error";
        console.warn("useGpsStream:", msg);
        setError(msg);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000,
      },
    );

    return () => {
      try {
        geo.clearWatch(watchId);
      } catch (_) {
        // ignore
      }
    };
  }, []);

  return { gps, error, supported };
}
