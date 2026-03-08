import {
  bearingBetweenPoints,
  circularMeanDeg,
  distanceM,
  normalizeAngle,
} from "./geo"

export function detectTurnCandidates(points, config) {
  const candidates = []
  if (!Array.isArray(points) || points.length < 7) return candidates

  for (let index = 3; index < points.length - 3; index += 1) {
    const point = points[index]

    const bearingIn = averageBearing(points, index, -3, -1)
    const bearingOut = averageBearing(points, index, 1, 3)
    const angle = normalizeAngle(bearingOut - bearingIn)
    const absAngle = Math.abs(angle)

    if (absAngle < (config.minTurnAngleDeg ?? 25)) continue

    candidates.push({
      id: `cand-${index}`,
      lat: point.lat,
      lon: point.lon,
      distanceM: point.distanceFromStartM,
      bearingIn,
      bearingOut,
      angle,
      absAngle,
      concentration: calculateTurnConcentration(points, index),
      source: "derived",
      confidence: scoreCandidate(absAngle, calculateTurnConcentration(points, index)),
    })
  }

  return dedupeNearbyCandidates(candidates, config.mergeRadiusM ?? 20)
}

function averageBearing(points, index, fromOffset, toOffset) {
  const bearings = []

  for (let offset = fromOffset; offset <= toOffset; offset += 1) {
    const current = points[index + offset]
    const next = points[index + offset + 1]
    if (!current || !next) continue
    bearings.push(bearingBetweenPoints(current, next))
  }

  return circularMeanDeg(bearings)
}

function calculateTurnConcentration(points, index) {
  const start = points[Math.max(0, index - 2)]
  const mid = points[index]
  const end = points[Math.min(points.length - 1, index + 2)]

  const spanDistance = distanceM(start, mid) + distanceM(mid, end)
  const straightDistance = distanceM(start, end)

  if (spanDistance === 0) return 0
  return 1 - straightDistance / spanDistance
}

function scoreCandidate(absAngle, concentration) {
  let score = 0.45

  if (absAngle >= 160) score += 0.35
  else if (absAngle >= 110) score += 0.28
  else if (absAngle >= 60) score += 0.2
  else if (absAngle >= 35) score += 0.12

  score += Math.min(0.2, concentration)
  return Math.min(1, score)
}

function dedupeNearbyCandidates(candidates, mergeRadiusM) {
  const kept = []

  for (const candidate of candidates) {
    const nearby = kept.find((item) => Math.abs(item.distanceM - candidate.distanceM) <= mergeRadiusM)

    if (!nearby) {
      kept.push(candidate)
      continue
    }

    if (candidate.confidence > nearby.confidence) {
      const idx = kept.indexOf(nearby)
      kept[idx] = candidate
    }
  }

  return kept
}
