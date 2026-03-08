export function exportMasterJson(stage, roadbook, config = {}) {
  return JSON.stringify(
    {
      app: config.appName || "RouteMapper",
      version: config.version || "0.1.0",
      exportedAt: config.exportedAt || new Date().toISOString(),
      stage,
      roadbook: roadbook || null,
    },
    null,
    2
  )
}
