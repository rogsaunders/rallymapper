export function renderTulipSvg(row) {
  const key = row?.tulipTemplate || row?.icon || row?.eventType || "straight";

  switch (key) {
    case "left":
    case "left_90":
      return tulip("left_90");

    case "right":
    case "right_90":
      return tulip("right_90");

    case "bear_left":
      return tulip("bear_left");

    case "bear_right":
      return tulip("bear_right");

    case "sharp_left":
      return tulip("sharp_left");

    case "sharp_right":
      return tulip("sharp_right");

    case "hairpin_left":
      return tulip("hairpin_left");

    case "hairpin_right":
      return tulip("hairpin_right");

    case "keep_l":
      return tulip("bear_left");

    case "keep_r":
      return tulip("bear_right");

    case "gate":
      return tulip("gate");

    case "start":
      return tulip("start");

    case "finish":
      return tulip("finish");

    case "note":
    case "straight":
    default:
      return tulip("straight");
  }
}

function tulip(type) {
  const road = `stroke="#0a22ff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  const dot = `<circle cx="92" cy="92" r="5" fill="#000" />`;

  let path = `<path d="M92 112 L92 72" ${road} />`;
  let extra = "";

  switch (type) {
    case "left_90":
      path += `<path d="M92 72 L52 72" ${road} />`;
      break;

    case "right_90":
      path += `<path d="M92 72 L132 72" ${road} />`;
      break;

    case "bear_left":
      path += `<path d="M92 72 L62 48" ${road} />`;
      break;

    case "bear_right":
      path += `<path d="M92 72 L122 48" ${road} />`;
      break;

    case "sharp_left":
      path += `<path d="M92 72 L42 42" ${road} />`;
      break;

    case "sharp_right":
      path += `<path d="M92 72 L142 42" ${road} />`;
      break;

    case "hairpin_left":
      path = `<path d="M92 112 L92 82 L52 82 Q32 82 32 62 Q32 42 52 42 L92 42" ${road} />`;
      break;

    case "hairpin_right":
      path = `<path d="M92 112 L92 82 L132 82 Q152 82 152 62 Q152 42 132 42 L92 42" ${road} />`;
      break;

    case "gate":
      path += `<path d="M92 72 L132 72" ${road} />`;
      extra = `
        <line x1="112" y1="58" x2="112" y2="86" stroke="#000" stroke-width="3"/>
        <line x1="118" y1="58" x2="118" y2="86" stroke="#000" stroke-width="3"/>
      `;
      break;

    case "start":
      path = `<path d="M92 112 L92 40" ${road} />`;
      extra = `<polygon points="92,20 80,44 104,44" fill="#0a22ff" />`;
      break;

    case "finish":
      path = `<path d="M92 112 L92 40" ${road} />`;
      extra = `
        <rect x="106" y="26" width="22" height="16" fill="#fff" stroke="#000" stroke-width="2"/>
        <path d="M106 26 L128 42 M128 26 L106 42" stroke="#000" stroke-width="2"/>
      `;
      break;

    case "straight":
    default:
      path = `<path d="M92 112 L92 34" ${road} />`;
      extra = `<polygon points="92,18 80,40 104,40" fill="#0a22ff" />`;
      break;
  }

  return `
<svg width="220" height="110" viewBox="0 0 184 128">
  <rect x="0" y="0" width="184" height="128" fill="#f3f3f3"/>
  ${path}
  ${dot}
  ${extra}
</svg>
`;
}
