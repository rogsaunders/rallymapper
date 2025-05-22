// src/constants/icons.js
export const iconCategories = {
  "On Track": [
    { name: "Bump", src: "/icons/bump.svg" },
    { name: "Dip Hole", src: "/icons/dip-hole.svg" },
    { name: "Ditch", src: "/icons/ditch.svg" },
    { name: "Water Crossing", src: "/icons/wading.svg" },
    { name: "Fence Gate", src: "/icons/fence-gate.svg" },
  ],
  Abbreviations: [
    { name: "Left", src: "/icons/left.svg" },
    { name: "Right", src: "/icons/right.svg" },
    { name: "Keep Straight", src: "/icons/keep-straight.svg" },
  ],
  Controls: [
    { name: "Stop for Restart", src: "/icons/stop_for_restart.svg" },
    {
      name: "Arrive Selective Section",
      src: "/icons/arrive_selective_section_flag.svg",
    },
  ],
  Safety: [
    { name: "Danger 1", src: "/icons/danger-1.svg" },
    { name: "Danger 2", src: "/icons/danger-2.svg" },
    { name: "Stop", src: "/icons/stop.svg" },
  ],
};

export const allIcons = Object.values(iconCategories).flat();
