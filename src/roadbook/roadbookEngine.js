import { preprocessTrack } from "./trackPreprocessor";
import { detectTurnCandidates } from "./turnDetection";
import { classifyCandidates } from "./eventClassifier";
import { mergeWithWaypoints } from "./waypointMerger";
import { buildRoadbookViews } from "./roadbookFilter";

export function generateRoadbook(stage, options = {}) {
  validateStage(stage);

  const config = {
    minPointSpacingM: 5,
    simplifyToleranceM: 12,
    headingWindowM: 40,
    minTurnAngleDeg: 25,
    mergeRadiusM: 20,
    ...options,
  };

  const preprocessedTrack = preprocessTrack(stage.trackPoints, config);
  const candidates = detectTurnCandidates(preprocessedTrack, config);
  const classified = classifyCandidates(candidates, config);
  const mergedEvents = mergeWithWaypoints(
    classified,
    stage.waypoints || [],
    preprocessedTrack,
    config,
  );
  const rows = buildRoadbookRows(mergedEvents);
  const views = buildRoadbookViews(rows, {
    minConfidence: options.minConfidence ?? 0.85,
    minGapM: options.minGapM ?? 130,
    clusterRadiusM: options.clusterRadiusM ?? 100,
  });

  return {
    meta: stage.meta,
    config,
    stats: {
      rawTrackPoints: stage.trackPoints.length,
      processedTrackPoints: preprocessedTrack.length,
      candidateCount: candidates.length,
      roadbookRowCount: rows.length,
      driverRowCount: views.driver.length,
    },
    rows,
    views,
  };
}

function validateStage(stage) {
  if (!stage || !Array.isArray(stage.trackPoints)) {
    throw new Error("generateRoadbook: stage.trackPoints is required");
  }
}

function buildRoadbookRows(events) {
  const ordered = [...events].sort((a, b) => a.distanceM - b.distanceM);
  let previousDistanceM = 0;

  return ordered.map((event, index) => {
    const kmTotal = round3(event.distanceM / 1000);
    const kmPartial = round3((event.distanceM - previousDistanceM) / 1000);
    previousDistanceM = event.distanceM;

    return {
      index: index + 1,
      kmTotal,
      kmPartial,
      lat: event.lat,
      lon: event.lon,
      eventType: event.eventType,
      tulipTemplate: event.tulipTemplate || event.eventType,
      bearingIn: event.bearingIn ?? null,
      bearingOut: event.bearingOut ?? null,
      angle: event.angle ?? null,
      icon: event.icon ?? null,
      notes: event.notes || "",
      source: event.source || "derived",
      confidence: event.confidence ?? 0,
      linkedWaypointIds: event.linkedWaypointIds || [],
    };
  });
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
