export function haversineMeters(a, b) {
  if (!a || !b) return 0;

  const lat1 = Number(a.lat),
    lon1 = Number(a.lon);
  const lat2 = Number(b.lat),
    lon2 = Number(b.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;

  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);

  const aa = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(aa)));
}

// Bearing (CAP) in degrees 0..359 from point A to B
export function bearingDegrees(a, b) {
  const lat1 = Number(a?.lat),
    lon1 = Number(a?.lon);
  const lat2 = Number(b?.lat),
    lon2 = Number(b?.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;

  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const brng = toDeg(Math.atan2(y, x));
  return (Math.round(brng) + 360) % 360;
}
