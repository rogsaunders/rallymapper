export const iconCategories = {
  "On Track": [
    { name: "Bump", src: "/icons/bump.svg" },
    { name: "Dip Hole", src: "/icons/dip-hole.svg" },
    { name: "Ditch", src: "/icons/ditch.svg" },
    { name: "Hole", src: "/icons/hole.svg" },
    { name: "Summit", src: "/icons/summit.svg" },
    { name: "Up hill", src: "/icons/uphill.svg" },
    { name: "Down hill", src: "/icons/downhill.svg" },
    { name: "Fence gate", src: "/icons/fence-gate.svg" },
    { name: "Wading / water crossing", src: "/icons/wading.svg" },
  ],
  Abbreviations: [
    { name: "Left", src: "/icons/left.svg" },
    { name: "Right", src: "/icons/right.svg" },
    { name: "Keep to the left", src: "/icons/keep-left.svg" },
    { name: "Keep to the right", src: "/icons/keep-right.svg" },
    { name: "Keep straight", src: "/icons/keep-straight.svg" },
    { name: "On Left", src: "/icons/on-left.svg" },
    { name: "On Right", src: "/icons/on-right.svg" },
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
    { name: "Danger 3", src: "/icons/danger-3.svg" },
    { name: "Stop", src: "/icons/stop.svg" },
    { name: "Caution", src: "/icons/caution.svg" },
  ],
};

export const allIcons = Object.values(iconCategories).flat();
