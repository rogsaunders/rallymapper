export function prettyLabelFromTypeIcon(p) {
  const nav = {
    left: "Left",
    right: "Right",
    keep_l: "Keep Left",
    keep_r: "Keep Right",
    straight: "Straight",
    caution: "Caution",
  };

  const hazard = {
    danger_1: "Danger 1",
    danger_2: "Danger 2",
    danger_3: "Danger 3",
  };

  const control = {
    start: "Start",
    finish: "Finish",
    checkpoint: "Checkpoint",
  };

  if (p?.type === "nav")
    return nav[p?.iconId] || `Navigation (${p?.iconId || "?"})`;
  if (p?.type === "hazard")
    return hazard[p?.iconId] || `Hazard (${p?.iconId || "?"})`;
  if (p?.type === "control")
    return control[p?.iconId] || `Control (${p?.iconId || "?"})`;
  if (p?.type === "note") return "Note";

  return `${p?.type || "waypoint"}${p?.iconId ? ` (${p.iconId})` : ""}`;
}
