export function classifyCandidates(candidates) {
  return candidates.map((candidate) => {
    const eventType = classifyAngle(candidate.angle)
    return {
      ...candidate,
      eventType,
      tulipTemplate: eventType,
      notes: describeType(eventType),
    }
  })
}

export function classifyAngle(angle) {
  const absolute = Math.abs(angle)
  const right = angle > 0

  if (absolute >= 160) return right ? "hairpin_right" : "hairpin_left"
  if (absolute >= 110) return right ? "sharp_right" : "sharp_left"
  if (absolute >= 45) return right ? "right_90" : "left_90"
  if (absolute >= 25) return right ? "bear_right" : "bear_left"
  return "straight"
}

function describeType(type) {
  switch (type) {
    case "hairpin_right":
      return "Hairpin right"
    case "hairpin_left":
      return "Hairpin left"
    case "sharp_right":
      return "Sharp right"
    case "sharp_left":
      return "Sharp left"
    case "right_90":
      return "Right"
    case "left_90":
      return "Left"
    case "bear_right":
      return "Bear right"
    case "bear_left":
      return "Bear left"
    default:
      return ""
  }
}
