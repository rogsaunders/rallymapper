export function renderTulipSvg(eventType, options = {}) {
  const size = options.size ?? 120
  const c = size / 2
  const s = options.strokeWidth ?? 7
  const angle = options.angle  // degrees; positive = right, negative = left; null for manual waypoints

  if (angle != null) {
    return renderAngleTulip(size, c, s, angle)
  }

  switch (eventType) {
    case "right_90":
      return svgWrap(size,
        seg(c,size,c,c,s) + exitSeg(c,c,size,c,s))
    case "left_90":
      return svgWrap(size,
        seg(c,size,c,c,s) + exitSeg(c,c,0,c,s))
    case "sharp_right":
      return svgWrap(size,
        seg(c,size,c,c+10,s) + exitSeg(c,c+10,size-10,20,s))
    case "sharp_left":
      return svgWrap(size,
        seg(c,size,c,c+10,s) + exitSeg(c,c+10,10,20,s))
    case "bear_right":
      return svgWrap(size,
        seg(c,size,c,c+10,s) + exitSeg(c,c+10,c+35,20,s))
    case "bear_left":
      return svgWrap(size,
        seg(c,size,c,c+10,s) + exitSeg(c,c+10,c-35,20,s))
    case "hairpin_right":
      return svgWrap(size,
        `<path d="M ${c} ${size} L ${c} ${c+20} Q ${c} 20 ${size-20} 20 L ${size-20} ${c}" fill="none" stroke="black" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round"/>` +
        arrowHead(size-20, 20, size-20, c, s))
    case "hairpin_left":
      return svgWrap(size,
        `<path d="M ${c} ${size} L ${c} ${c+20} Q ${c} 20 20 20 L 20 ${c}" fill="none" stroke="black" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round"/>` +
        arrowHead(20, 20, 20, c, s))
    case "start":
    case "finish":
    case "straight":
    default:
      return svgWrap(size,
        exitSeg(c,size,c,10,s))
  }
}

function renderAngleTulip(size, c, s, angle) {
  const arm = c - 10
  const rad = angle * Math.PI / 180
  const ex  = round2(c + arm * Math.sin(rad))
  const ey  = round2(c - arm * Math.cos(rad))
  const abs = Math.abs(angle)

  if (abs > 150) {
    const lx = round2(c + (angle > 0 ? 1 : -1) * arm * 0.6)
    return svgWrap(size,
      `<path d="M ${c} ${size} L ${c} ${c+20} Q ${c} 10 ${ex} ${ey} L ${lx} ${c}" fill="none" stroke="black" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round"/>` +
      arrowHead(ex, ey, lx, c, s))
  }

  return svgWrap(size,
    seg(c,size,c,c,s) + exitSeg(c,c,ex,ey,s))
}

// Plain line segment (entry arm — no arrowhead)
function seg(x1, y1, x2, y2, s) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="${s}" stroke-linecap="round"/>`
}

// Exit arm: line + arrowhead at tip
function exitSeg(x1, y1, x2, y2, s) {
  return seg(x1, y1, x2, y2, s) + arrowHead(x1, y1, x2, y2, s)
}

// Filled triangle arrowhead at (x2,y2) pointing in direction (x1,y1)→(x2,y2)
function arrowHead(x1, y1, x2, y2, s) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const sz = s * 1.8        // leg length of arrowhead
  const b  = 2.45           // ~140° back from forward direction
  const p1x = round2(x2 + sz * Math.cos(angle + b))
  const p1y = round2(y2 + sz * Math.sin(angle + b))
  const p2x = round2(x2 + sz * Math.cos(angle - b))
  const p2y = round2(y2 + sz * Math.sin(angle - b))
  return `<polygon points="${round2(x2)},${round2(y2)} ${p1x},${p1y} ${p2x},${p2y}" fill="black"/>`
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function svgWrap(size, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect x="0" y="0" width="${size}" height="${size}" fill="white"/>${inner}</svg>`
}
