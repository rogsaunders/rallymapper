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
  note: ["note"],
  hazard: ["hazard", "danger"],
  nav: ["nav", "navigation", "turn"],
  control: ["control", "checkpoint"],
  terrain: ["terrain"],
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
];

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
};

// Default icon per type (matches RouteMapperLayout defaults)
const DEFAULT_ICON = {
  hazard: "danger_1",
  nav: "straight",
  control: "start",
  terrain: "bump",
  note: null,
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
