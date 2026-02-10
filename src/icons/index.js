// src/icons/index.js
import { DANGER_1_SVG } from "./danger_1";
import { DANGER_2_BOX_SVG } from "./danger_2_box";

export * from "./iconRegistry";
export * from "./svgIcons";
export const ICONS = {
  hazard: { key: "hazard", label: "Hazard", svg: DANGER_1_SVG },
  hazard2: { key: "hazard2", label: "Hazard 2", svg: DANGER_2_BOX_SVG },

  // placeholders until you add more SVGs:
  note: {
    key: "note",
    label: "Note",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#16a34a" d="M4 4h16v16H4z"/></svg>`,
  },
  nav: {
    key: "nav",
    label: "Nav",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#7c3aed" d="M12 2l8 20-8-4-8 4z"/></svg>`,
  },
  control: {
    key: "control",
    label: "Control",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#f59e0b" d="M3 3h18v18H3z"/></svg>`,
  },
};

export const ICON_ORDER = ["note", "hazard", "nav", "control"]; // button order
