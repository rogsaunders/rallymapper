/**
 * Build a small metadata blob for the export ZIP.
 *
 * The manifest is informational only — it captures what was exported and
 * when, plus basic stats. The previous version listed file paths but they
 * drifted as the ZIP layout evolved; file discovery now happens via the
 * README.txt and the folder structure itself.
 */
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
  };
}
