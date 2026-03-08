export function renderTulipSvg(eventType, options = {}) {
  const size = options.size ?? 120
  const center = size / 2
  const stroke = options.strokeWidth ?? 10

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

function svgWrap(size, inner) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect x="0" y="0" width="${size}" height="${size}" fill="white"/>
      ${inner}
    </svg>
  `.trim()
}
