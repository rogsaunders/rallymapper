import { haversineM, distanceM } from "./geo"

export function preprocessTrack(trackPoints, config) {
  const minPointSpacingM = config.minPointSpacingM ?? 5
  const simplifyToleranceM = config.simplifyToleranceM ?? 12

  const spaced = removeDensePoints(trackPoints, minPointSpacingM)
  const smoothed = smoothTrack(spaced)
  const simplified = simplifyTrack(smoothed, simplifyToleranceM)
  const withDistance = ensureDistanceFromStart(simplified)

  return withDistance
}

function removeDensePoints(points, minSpacingM) {
  if (!Array.isArray(points) || !points.length) return []

  const kept = [points[0]]

  for (let i = 1; i < points.length; i += 1) {
    const previous = kept[kept.length - 1]
    const current = points[i]
    const spacing = haversineM(previous.lat, previous.lon, current.lat, current.lon)
    if (spacing >= minSpacingM) kept.push(current)
  }

  return kept
}

function smoothTrack(points) {
  if (points.length < 5) return points

  return points.map((point, index) => {
    const window = points.slice(Math.max(0, index - 2), Math.min(points.length, index + 3))
    const lat = window.reduce((sum, item) => sum + item.lat, 0) / window.length
    const lon = window.reduce((sum, item) => sum + item.lon, 0) / window.length

    return {
      ...point,
      lat,
      lon,
    }
  })
}

function simplifyTrack(points, toleranceM) {
  if (points.length < 3) return points
  return douglasPeucker(points, toleranceM)
}

function douglasPeucker(points, toleranceM) {
  if (points.length <= 2) return points

  let maxDistance = 0
  let index = 0

  const start = points[0]
  const end = points[points.length - 1]

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistanceMeters(points[i], start, end)
    if (distance > maxDistance) {
      maxDistance = distance
      index = i
    }
  }

  if (maxDistance <= toleranceM) {
    return [start, end]
  }

  const left = douglasPeucker(points.slice(0, index + 1), toleranceM)
  const right = douglasPeucker(points.slice(index), toleranceM)

  return [...left.slice(0, -1), ...right]
}

function perpendicularDistanceMeters(point, start, end) {
  if (start.lat === end.lat && start.lon === end.lon) {
    return distanceM(point, start)
  }

  const latScale = 111320
  const lonScale = 111320 * Math.cos(((start.lat + end.lat) / 2) * (Math.PI / 180))

  const x0 = point.lon * lonScale
  const y0 = point.lat * latScale
  const x1 = start.lon * lonScale
  const y1 = start.lat * latScale
  const x2 = end.lon * lonScale
  const y2 = end.lat * latScale

  const numerator = Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
  const denominator = Math.sqrt((y2 - y1) ** 2 + (x2 - x1) ** 2)

  return denominator === 0 ? 0 : numerator / denominator
}

function ensureDistanceFromStart(points) {
  if (!points.length) return []

  let runningDistance = 0

  return points.map((point, index) => {
    if (typeof point.distanceFromStartM === "number") {
      runningDistance = point.distanceFromStartM
      return point
    }

    if (index > 0) {
      runningDistance += distanceM(points[index - 1], point)
    }

    return {
      ...point,
      distanceFromStartM: runningDistance,
    }
  })
}
