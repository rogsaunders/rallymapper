export function renderTulipSvg(eventType, options = {}) {
  const size = options.size ?? 120
  const center = size / 2
  const stroke = options.strokeWidth ?? 7
  const angle = options.angle  // degrees; positive = right, negative = left; null for manual waypoints

  // When a precise angle is available, render the exit arm at the exact measured bearing.
  // The entry arm always comes from the bottom (south); the exit arm radiates from center
  // using: x2 = center + armLength·sin(angle°), y2 = center − armLength·cos(angle°)
  // armLength covers from center to near the top edge with a small margin.
  if (angle != null) {
    return renderAngleTulip(size, center, stroke, angle)
  }

  // Fallback: no angle data (manual waypoints) — use fixed category templates.
  switch (eventType) {
    case "right_90":
      return svgWrap(size, `
        <line x1="${center}" y1="${size}" x2="${center}" y2="${center}" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
        <line x1="${center}" y1="${center}" x2="${size}" y2="${center}" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
      `)
    case "left_90":
      return svgWrap(size, `
        <line x1="${center}" y1="${size}" x2="${center}" y2="${center}" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
        <line x1="${center}" y1="${center}" x2="0" y2="${center}" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
      `)
    case "sharp_right":
      return svgWrap(size, `
        <line x1="${center}" y1="${size}" x2="${center}" y2="${center + 10}" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
        <line x1="${center}" y1="${center + 10}" x2="${size - 10}" y2="20" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
      `)
    case "sharp_left":
      return svgWrap(size, `
        <line x1="${center}" y1="${size}" x2="${center}" y2="${center + 10}" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
        <line x1="${center}" y1="${center + 10}" x2="10" y2="20" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
      `)
    case "bear_right":
      return svgWrap(size, `
        <line x1="${center}" y1="${size}" x2="${center}" y2="${center + 10}" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
        <line x1="${center}" y1="${center + 10}" x2="${center + 35}" y2="20" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
      `)
    case "bear_left":
      return svgWrap(size, `
        <line x1="${center}" y1="${size}" x2="${center}" y2="${center + 10}" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
        <line x1="${center}" y1="${center + 10}" x2="${center - 35}" y2="20" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
      `)
    case "hairpin_right":
      return svgWrap(size, `
        <path d="M ${center} ${size} L ${center} ${center + 20} Q ${center} 20 ${size - 20} 20 L ${size - 20} ${center}" fill="none" stroke="black" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
      `)
    case "hairpin_left":
      return svgWrap(size, `
        <path d="M ${center} ${size} L ${center} ${center + 20} Q ${center} 20 20 20 L 20 ${center}" fill="none" stroke="black" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
      `)
    case "start":
    case "finish":
    case "straight":
    default:
      return svgWrap(size, `
        <line x1="${center}" y1="${size}" x2="${center}" y2="10" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
      `)
  }
}

// Renders a tulip using the precise measured angle.
// angle: degrees from straight-ahead, positive = right, negative = left.
// Handles hairpin turns (|angle| > 120°) with a looping curve instead of a straight arm.
function renderAngleTulip(size, center, stroke, angle) {
  const margin = 10
  const armLength = center - margin  // distance from center to exit tip
  const rad = angle * Math.PI / 180
  const exitX = center + armLength * Math.sin(rad)
  const exitY = center - armLength * Math.cos(rad)
  const absAngle = Math.abs(angle)

  // Hairpin: turn back on itself (> ~150°). Draw a rounded loop.
  if (absAngle > 150) {
    const loopDir = angle > 0 ? 1 : -1
    const loopX = center + loopDir * (armLength * 0.6)
    return svgWrap(size, `
      <path d="M ${center} ${size} L ${center} ${center + 20} Q ${center} ${margin} ${round2(exitX)} ${round2(exitY)} L ${round2(loopX)} ${center}" fill="none" stroke="black" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
    `)
  }

  // Standard turn: straight entry arm + angled exit arm meeting at center.
  return svgWrap(size, `
    <line x1="${center}" y1="${size}" x2="${center}" y2="${center}" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
    <line x1="${center}" y1="${center}" x2="${round2(exitX)}" y2="${round2(exitY)}" stroke="black" stroke-width="${stroke}" stroke-linecap="round"/>
  `)
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function svgWrap(size, inner) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect x="0" y="0" width="${size}" height="${size}" fill="white"/>
      ${inner}
    </svg>
  `.trim()
}
