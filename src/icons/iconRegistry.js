import {
  NOTE_SVG,
  DANGER_1_SVG,
  DANGER_2_SVG,
  DANGER_3_SVG,
  NAV_SVG,
  CONTROL_SVG,
  LEFT_SVG,
  RIGHT_SVG,
  KEEP_L_SVG,
  KEEP_R_SVG,
  STRAIGHT_SVG,
  CAUTION_SVG,
  CONTROL_START_SVG,
  CONTROL_FINISH_SVG,
  CONTROL_STOP_SVG,
  CONTROL_CHECKPOINT_SVG,
  CONTROL_TIME_SVG,
  CONTROL_SERVICE_SVG,
  GATE_SVG,
  CATTLE_GATE_SVG,
  BUMP_SVG,
  BUMPS_SVG,
  RUTS_SVG,
  WASHOUT_SVG,
  DIP_SVG,
} from "./svgIcons";

export const ICON_ORDER = ["note", "hazard", "nav", "control"];

export const ICONS = {
  note: { label: "Note", svg: NOTE_SVG },

  hazard: {
    label: "Hazard",
    svg: DANGER_1_SVG,
    variants: {
      danger_1: { label: "Danger 1", svg: DANGER_1_SVG },
      danger_2: { label: "Danger 2", svg: DANGER_2_SVG },
      danger_3: { label: "Danger 3", svg: DANGER_3_SVG },
      bump: { label: "Bump", svg: BUMP_SVG },
      bumps: { label: "Bumps", svg: BUMPS_SVG },
      dip: { label: "Dip", svg: DIP_SVG },
      ruts: { label: "Ruts", svg: RUTS_SVG },
      washout: { label: "Washout", svg: WASHOUT_SVG },
    },
  },

  nav: {
    label: "Navigation",
    svg: NAV_SVG, // default if no variant chosen
    variants: {
      left: { label: "Left", svg: LEFT_SVG },
      right: { label: "Right", svg: RIGHT_SVG },
      keep_l: { label: "Keep L", svg: KEEP_L_SVG },
      keep_r: { label: "Keep R", svg: KEEP_R_SVG },
      straight: { label: "Straight", svg: STRAIGHT_SVG },
      caution: { label: "Caution", svg: CAUTION_SVG },
      gate: { label: "Gate", svg: GATE_SVG },
      cattle_gate: { label: "Cattle Gate", svg: CATTLE_GATE_SVG },
    },
  },

  control: {
    label: "Control",
    svg: CONTROL_SVG,
    variants: {
      start: { label: "Start", svg: CONTROL_START_SVG },
      finish: { label: "Finish", svg: CONTROL_FINISH_SVG },
      stop: { label: "Stop for Restart", svg: CONTROL_STOP_SVG },
      checkpoint: { label: "Checkpoint", svg: CONTROL_CHECKPOINT_SVG },
      time: { label: "Time Control", svg: CONTROL_TIME_SVG },
      service: { label: "Service", svg: CONTROL_SERVICE_SVG },
    },
  },
};
