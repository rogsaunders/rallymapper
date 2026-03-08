export function buildManifest(stage, config, baseName, roadbook) {
  return {
    app: config.appName || "RouteMapper",
    version: config.version || "0.1.0",
    exportedAt: config.exportedAt,
    stageName: stage?.meta?.stageName || "Stage",
    day: stage?.meta?.day || null,
    recorder: stage?.meta?.recorder || null,
    baseName,
    roadbookIncluded: Boolean(roadbook),
    stats: {
      trackPoints: stage?.trackPoints?.length || 0,
      waypoints: stage?.waypoints?.length || 0,
      roadbookRows: roadbook?.rows?.length || 0,
    },
    files: {
      core: [
        `${baseName}_stage.json`,
        `${baseName}_track.gpx`,
        `${baseName}_waypoints.gpx`,
        ...(roadbook ? [`${baseName}_roadbook.json`, `${baseName}_roadbook.csv`] : []),
      ],
      hema: [],
      garmin: [],
      rallynav: [],
      googleEarth: [],
      gaia: [],
    },
  }
}
