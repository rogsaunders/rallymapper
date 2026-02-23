export function escXml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function kmFromMeters(meters) {
  const km = Number(meters || 0) / 1000;
  return km.toFixed(2);
}
