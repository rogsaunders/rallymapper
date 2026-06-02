// src/voice/voiceCommandParser.js
//
// Parses a spoken phrase into a structured waypoint command.
//
// Grammar (case-insensitive):
//   [type] [icon] [— poi text]
//
// Examples:
//   "hazard danger two — big rocks on left"  → { type:"hazard", iconId:"danger_2", poi:"big rocks on left" }
//   "note — fuel stop ahead"                 → { type:"note",   iconId:null,        poi:"fuel stop ahead" }
//   "terrain washout"                         → { type:"terrain",iconId:"washout",   poi:"" }
//   "left — onto gravel road"                → { type:"nav",    iconId:"left",       poi:"onto gravel road" }
//   "bump"                                   → { type:"terrain",iconId:"bump",       poi:"" }

// ── Category keywords ────────────────────────────────────────────────
// Maps spoken words to the waypoint `type` value.
const TYPE_KEYWORDS = {
  // "cancel" must come first so it short-circuits before any other match.
  cancel: ["cancel", "discard", "abort"],
  note: ["note"],
  hazard: ["hazard", "danger"],
  nav: ["nav", "navigation", "turn"],
  control: ["control", "checkpoint"],
  terrain: ["terrain"],
  // "speed N" captures speed-limit signage. The number is resolved by
  // extractSpeedIcon() after this keyword is stripped; "speed" alone
  // falls through to the DEFAULT_ICON for the speed category (speed_50).
  speed: ["speed"],
};

// ── Icon aliases ─────────────────────────────────────────────────────
// Maps spoken phrases to icon IDs. Order matters — longer phrases first
// so "keep left" matches before "left".
const ICON_ALIASES = [
  // Hazard
  ["danger three", "danger_3"],
  ["danger 3", "danger_3"],
  ["danger two", "danger_2"],
  ["danger 2", "danger_2"],
  ["danger one", "danger_1"],
  ["danger 1", "danger_1"],

  // Nav (multi-word first)
  ["keep left", "keep_l"],
  ["keep right", "keep_r"],
  ["cattle gate", "cattle_gate"],
  ["give way", "give_way"],
  ["rail road", "Railroad"],
  ["railroad", "Railroad"],
  ["left", "left"],
  ["right", "right"],
  ["straight", "straight"],
  ["gate", "gate"],
  ["caution", "caution"],
  ["stop", "stop"],

  // Terrain
  ["up hill", "up_hill"],
  ["uphill", "up_hill"],
  ["down hill", "down_hill"],
  ["downhill", "down_hill"],
  ["washout", "washout"],
  ["bumps", "bumps"],
  ["bump", "bump"],
  ["twisty", "twisty"],
  ["ruts", "ruts"],
  ["dip", "dip"],

  // Control
  ["checkpoint", "checkpoint"],
  ["time control", "time"],
  ["fuel", "fuel"],
  ["service", "service"],
  ["start", "start"],
  ["finish", "finish"],

  // Speed icons (speed_25 … speed_110) are NOT listed here on purpose —
  // they are resolved inline by extractSpeedIcon() once the "speed" type
  // keyword has been stripped. That gives us word-form support
  // ("fifty"), arbitrary-number snapping ("speed 70" → speed_60), and
  // avoids cross-contaminating other types (a hypothetical "hazard 50
  // something" should not pick up a speed icon).
];

// Supported speed-limit icons, in km/h.
const SPEED_LIMITS = [25, 40, 50, 60, 80, 100, 110];

// English number words we expect speech-to-text to emit for speed
// limits. Multi-word entries must be probed longest-first so "one
// hundred and ten" doesn't get shortened to "one" before the long
// match has a chance. Values are km/h.
const SPEED_NUMBER_WORDS = {
  "one hundred and ten": 110,
  "one hundred ten":     110,
  "one hundred":         100,
  "one ten":             110,
  "twenty five":          25,
  "twenty-five":          25,
  forty:                  40,
  fifty:                  50,
  sixty:                  60,
  eighty:                 80,
  hundred:               100,
};

/**
 * After "speed" has been stripped from the command, try to read a
 * number from the leading edge of `remainder`. Snaps to the nearest
 * supported speed limit so unanticipated numbers ("speed 70") still
 * produce a useful icon (speed_60 in that case).
 *
 * @param {string} remainder
 * @returns {{ iconId: string, consumed: number } | null}
 */
function extractSpeedIcon(remainder) {
  if (!remainder) return null;

  let value = null;
  let consumed = 0;

  // 1. Digit form — "50", "110", etc.
  const digitMatch = remainder.match(/^(\d{1,3})\b/);
  if (digitMatch) {
    value = parseInt(digitMatch[1], 10);
    consumed = digitMatch[0].length;
  } else {
    // 2. Word form — probe longest-first.
    const keys = Object.keys(SPEED_NUMBER_WORDS).sort(
      (a, b) => b.length - a.length,
    );
    for (const word of keys) {
      if (
        remainder === word ||
        remainder.startsWith(word + " ") ||
        remainder.startsWith(word + ",")
      ) {
        value = SPEED_NUMBER_WORDS[word];
        consumed = word.length;
        break;
      }
    }
  }

  if (value == null) return null;

  // Snap to the nearest supported speed limit.
  const snapped = SPEED_LIMITS.reduce((best, n) =>
    Math.abs(n - value) < Math.abs(best - value) ? n : best,
  );
  return { iconId: `speed_${snapped}`, consumed };
}

// Reverse lookup: iconId → category type
const ICON_TO_TYPE = {
  danger_1: "hazard",
  danger_2: "hazard",
  danger_3: "hazard",
  left: "nav",
  right: "nav",
  keep_l: "nav",
  keep_r: "nav",
  straight: "nav",
  gate: "nav",
  cattle_gate: "nav",
  Railroad: "nav",
  give_way: "nav",
  caution: "nav",
  stop: "control",
  start: "control",
  finish: "control",
  checkpoint: "control",
  time: "control",
  fuel: "control",
  service: "control",
  bump: "terrain",
  bumps: "terrain",
  dip: "terrain",
  ruts: "terrain",
  washout: "terrain",
  twisty: "terrain",
  up_hill: "terrain",
  down_hill: "terrain",
  speed_25: "speed",
  speed_40: "speed",
  speed_50: "speed",
  speed_60: "speed",
  speed_80: "speed",
  speed_100: "speed",
  speed_110: "speed",
};

// Default icon per type (matches RouteMapperLayout defaults)
const DEFAULT_ICON = {
  hazard: "danger_1",
  nav: "straight",
  control: "start",
  terrain: "bump",
  note: null,
  // If the user says just "speed" with no number, fall back to 50 km/h
  // — the single most-common limit on Australian rural roads. Any
  // explicit "speed N" matches before this default kicks in.
  speed: "speed_50",
};

/**
 * Parse a spoken command string into a waypoint descriptor.
 *
 * @param {string} raw — the recognised speech text
 * @returns {{ type: string, iconId: string|null, poi: string }}
 */
export function parseVoiceCommand(raw) {
  if (!raw || typeof raw !== "string") {
    return { type: "note", iconId: null, poi: "" };
  }

  // Fast-path: cancel / discard / abort — return immediately so the caller
  // can discard a pending snap without adding a waypoint.
  const trimmed = raw.toLowerCase().trim();
  if (["cancel", "discard", "abort"].some((w) => trimmed.startsWith(w))) {
    return { type: "cancel", iconId: null, poi: "" };
  }

  // Normalise: lowercase, collapse whitespace, strip leading/trailing junk
  const clean = raw.toLowerCase().replace(/\s+/g, " ").trim();

  // Split on dash / em-dash / spoken "dash" to separate command from POI text.
  // Speech engines sometimes produce "—", "--", " dash ", or " - ".
  const separatorRe = /\s*(?:—|--|–|\bdash\b|-)\s*/;
  const [commandPart, ...poiParts] = clean.split(separatorRe);
  const poi = poiParts.join(" ").trim();

  let type = null;
  let iconId = null;
  let remainder = commandPart.trim();

  // 1. Try to extract a type keyword from the start of the command
  for (const [t, keywords] of Object.entries(TYPE_KEYWORDS)) {
    for (const kw of keywords) {
      if (remainder.startsWith(kw)) {
        type = t;
        remainder = remainder.slice(kw.length).trim();
        break;
      }
    }
    if (type) break;
  }

  // 1.5. Speed icons are number-driven, so they don't fit the flat
  //      ICON_ALIASES table cleanly. Resolve them here only when the
  //      "speed" type keyword has actually been spoken, which keeps
  //      bare numbers in other categories from triggering speed_*.
  if (type === "speed" && !iconId) {
    const speedHit = extractSpeedIcon(remainder);
    if (speedHit) {
      iconId = speedHit.iconId;
      remainder = remainder.slice(speedHit.consumed).trim();
    }
  }

  // 2. Try to match an icon alias in whatever remains
  for (const [alias, id] of ICON_ALIASES) {
    if (remainder.startsWith(alias) || remainder === alias) {
      iconId = id;
      // If we matched an icon but had no explicit type, infer it
      if (!type) type = ICON_TO_TYPE[id] || "note";
      remainder = remainder.slice(alias.length).trim();
      break;
    }
  }

  // 3. If still no icon but we matched a type keyword alone (e.g. "hazard"),
  //    also scan the full command for an icon alias (handles "hazard — text")
  if (!iconId && !type) {
    // Last resort: scan entire command for any icon alias
    for (const [alias, id] of ICON_ALIASES) {
      if (commandPart.includes(alias)) {
        iconId = id;
        type = ICON_TO_TYPE[id] || "note";
        break;
      }
    }
  }

  // 4. Fallback: default to "note" if nothing matched
  if (!type) type = "note";
  if (!iconId) iconId = DEFAULT_ICON[type] || null;

  // 5. Any remaining text in the command part gets appended to POI
  const extraPoi = remainder.trim();
  const finalPoi = [extraPoi, poi].filter(Boolean).join(" ").trim();

  return { type, iconId, poi: finalPoi };
}
