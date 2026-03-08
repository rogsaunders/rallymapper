export function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

export function toDegrees(radians) {
  return (radians * 180) / Math.PI
}

export function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function distanceM(a, b) {
  return haversineM(a.lat, a.lon, b.lat, b.lon)
}

export function bearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRadians(lon2 - lon1)) * Math.cos(toRadians(lat2))
  const x =
    Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) -
    Math.sin(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.cos(toRadians(lon2 - lon1))

  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

export function bearingBetweenPoints(a, b) {
  return bearingDeg(a.lat, a.lon, b.lat, b.lon)
}

export function normalizeAngle(angle) {
  let normalized = angle
  while (normalized > 180) normalized -= 360
  while (normalized < -180) normalized += 360
  return normalized
}

export function circularMeanDeg(values) {
  if (!values.length) return 0

  const sum = values.reduce(
    (acc, deg) => {
      const radians = toRadians(deg)
      acc.x += Math.cos(radians)
      acc.y += Math.sin(radians)
      return acc
    },
    { x: 0, y: 0 }
  )

  const mean = toDegrees(Math.atan2(sum.y, sum.x))
  return (mean + 360) % 360
}
