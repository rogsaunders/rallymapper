// src/shared/iconMappings.js

export const ICON_EXPORT_MAP = {
  note: {
    label: "Note",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
  },

  danger_1: {
    label: "Danger 1",
    roadbookEvent: "danger_1",
    gpxSymbol: "Danger Area",
  },
  danger_2: {
    label: "Danger 2",
    roadbookEvent: "danger_2",
    gpxSymbol: "Danger Area",
  },
  danger_3: {
    label: "Danger 3",
    roadbookEvent: "danger_3",
    gpxSymbol: "Danger Area",
  },
  bump: {
    label: "Bump",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
  },
  bumps: {
    label: "Bumps",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
  },
  dip: {
    label: "Dip",
    roadbookEvent: "dip",
    gpxSymbol: "Valley",
  },
  ruts: {
    label: "Ruts",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
  },
  washout: {
    label: "Washout",
    roadbookEvent: "note",
    gpxSymbol: "Danger Area",
  },

  left: {
    label: "Left",
    roadbookEvent: "left_90",
    gpxSymbol: "Waypoint",
  },
  right: {
    label: "Right",
    roadbookEvent: "right_90",
    gpxSymbol: "Waypoint",
  },
  keep_l: {
    label: "Keep L",
    roadbookEvent: "bear_left",
    gpxSymbol: "Waypoint",
  },
  keep_r: {
    label: "Keep R",
    roadbookEvent: "bear_right",
    gpxSymbol: "Waypoint",
  },
  straight: {
    label: "Straight",
    roadbookEvent: "straight",
    gpxSymbol: "Waypoint",
  },
  caution: {
    label: "Caution",
    roadbookEvent: "note",
    gpxSymbol: "Danger Area",
  },
  gate: {
    label: "Gate",
    roadbookEvent: "gate",
    gpxSymbol: "Gate",
  },
  cattle_gate: {
    label: "Cattle Gate",
    roadbookEvent: "gate",
    gpxSymbol: "Gate",
  },

  start: {
    label: "Start",
    roadbookEvent: "start",
    gpxSymbol: "Flag, Blue",
  },
  finish: {
    label: "Finish",
    roadbookEvent: "finish",
    gpxSymbol: "Flag, Red",
  },
  stop: {
    label: "Stop for Restart",
    roadbookEvent: "control",
    gpxSymbol: "Stop Sign",
  },
  checkpoint: {
    label: "Checkpoint",
    roadbookEvent: "control",
    gpxSymbol: "Pin, Blue",
  },
  time: {
    label: "Time Control",
    roadbookEvent: "control",
    gpxSymbol: "Pin, Blue",
  },
  service: {
    label: "Service",
    roadbookEvent: "control",
    gpxSymbol: "Pin, Blue",
  },

  hazard: {
    label: "Hazard",
    roadbookEvent: "note",
    gpxSymbol: "Danger Area",
  },
  nav: {
    label: "Navigation",
    roadbookEvent: "note",
    gpxSymbol: "Waypoint",
  },
  control: {
    label: "Control",
    roadbookEvent: "control",
    gpxSymbol: "Pin, Blue",
  },
};

export function getIconExportMeta(iconId) {
  return (
    ICON_EXPORT_MAP[iconId] || {
      label: iconId || "Waypoint",
      roadbookEvent: "note",
      gpxSymbol: "Waypoint",
    }
  );
}
