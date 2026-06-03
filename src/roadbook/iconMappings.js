// src/shared/iconMappings.js

// openRallyType uses the OpenRally standard vocabulary for the GPX <type> field.
// Reference: https://openrally.org
export const ICON_EXPORT_MAP = {
  note: {
    label: "Note",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
    openRallyType: "WP",
  },

  danger_1: {
    label: "Danger 1",
    roadbookEvent: "danger_1",
    gpxSymbol: "Danger Area",
    openRallyType: "DANGER",
  },
  danger_2: {
    label: "Danger 2",
    roadbookEvent: "danger_2",
    gpxSymbol: "Danger Area",
    openRallyType: "DANGER",
  },
  danger_3: {
    label: "Danger 3",
    roadbookEvent: "danger_3",
    gpxSymbol: "Danger Area",
    openRallyType: "DANGER",
  },
  bump: {
    label: "Bump",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
    openRallyType: "CAUTION",
  },
  bumps: {
    label: "Bumps",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
    openRallyType: "CAUTION",
  },
  dip: {
    label: "Dip",
    roadbookEvent: "dip",
    gpxSymbol: "Valley",
    openRallyType: "CAUTION",
  },
  ruts: {
    label: "Ruts",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
    openRallyType: "CAUTION",
  },
  washout: {
    label: "Washout",
    roadbookEvent: "note",
    gpxSymbol: "Danger Area",
    openRallyType: "DANGER",
  },

  left: {
    label: "Left",
    roadbookEvent: "left_90",
    gpxSymbol: "Waypoint",
    openRallyType: "TULIP",
  },
  right: {
    label: "Right",
    roadbookEvent: "right_90",
    gpxSymbol: "Waypoint",
    openRallyType: "TULIP",
  },
  keep_l: {
    label: "Keep L",
    roadbookEvent: "bear_left",
    gpxSymbol: "Waypoint",
    openRallyType: "TULIP",
  },
  keep_r: {
    label: "Keep R",
    roadbookEvent: "bear_right",
    gpxSymbol: "Waypoint",
    openRallyType: "TULIP",
  },
  straight: {
    label: "Straight",
    roadbookEvent: "straight",
    gpxSymbol: "Waypoint",
    openRallyType: "TULIP",
  },
  caution: {
    label: "Caution",
    roadbookEvent: "note",
    gpxSymbol: "Danger Area",
    openRallyType: "CAUTION",
  },
  gate: {
    label: "Gate",
    roadbookEvent: "gate",
    gpxSymbol: "Gate",
    openRallyType: "WP",
  },
  cattle_gate: {
    label: "Cattle Gate",
    roadbookEvent: "gate",
    gpxSymbol: "Gate",
    openRallyType: "WP",
  },

  start: {
    label: "Start",
    roadbookEvent: "start",
    gpxSymbol: "Flag, Blue",
    openRallyType: "START",
  },
  finish: {
    label: "Finish",
    roadbookEvent: "finish",
    gpxSymbol: "Flag, Red",
    openRallyType: "FINISH",
  },
  stop: {
    label: "Stop for Restart",
    roadbookEvent: "control",
    gpxSymbol: "Stop Sign",
    openRallyType: "CONTROL",
  },
  checkpoint: {
    label: "Checkpoint",
    roadbookEvent: "control",
    gpxSymbol: "Pin, Blue",
    openRallyType: "CONTROL",
  },
  time: {
    label: "Time Control",
    roadbookEvent: "control",
    gpxSymbol: "Pin, Blue",
    openRallyType: "CONTROL",
  },
  service: {
    label: "Service",
    roadbookEvent: "control",
    gpxSymbol: "Pin, Blue",
    openRallyType: "ASSISTANCE",
  },

  speed_25: {
    label: "Speed 25",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
    openRallyType: "CAUTION",
  },
  speed_40: {
    label: "Speed 40",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
    openRallyType: "CAUTION",
  },
  speed_50: {
    label: "Speed 50",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
    openRallyType: "CAUTION",
  },
  speed_60: {
    label: "Speed 60",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
    openRallyType: "CAUTION",
  },
  speed_80: {
    label: "Speed 80",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
    openRallyType: "CAUTION",
  },
  speed_100: {
    label: "Speed 100",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
    openRallyType: "CAUTION",
  },
  speed_110: {
    label: "Speed 110",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
    openRallyType: "CAUTION",
  },

  hazard: {
    label: "Hazard",
    roadbookEvent: "note",
    gpxSymbol: "Danger Area",
    openRallyType: "DANGER",
  },
  nav: {
    label: "Navigation",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
    openRallyType: "TULIP",
  },
  control: {
    label: "Control",
    roadbookEvent: "control",
    gpxSymbol: "Pin, Blue",
    openRallyType: "CONTROL",
  },
};

export function getIconExportMeta(iconId) {
  return (
    ICON_EXPORT_MAP[iconId] || {
      label: iconId || "Waypoint",
      roadbookEvent: "note",
      gpxSymbol: "Waypoint",
      openRallyType: "WP",
    }
  );
}
