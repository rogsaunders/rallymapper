export function buildRoadbookViews(rows, options = {}) {
  const rawRows = Array.isArray(rows) ? rows : [];

  const driverRows = filterDriverRoadbook(rawRows, options);

  return {
    raw: rawRows,
    driver: driverRows,
  };
}

export function filterDriverRoadbook(rows, options = {}) {
  const minConfidence = options.minConfidence ?? 0.85;
  const minGapM = options.minGapM ?? 130;
  const clusterRadiusM = options.clusterRadiusM ?? 100;
  const manualExclusionRadiusM = options.manualExclusionRadiusM ?? 140;

  const sorted = [...(rows || [])].sort(
    (a, b) => getDistanceM(a) - getDistanceM(b),
  );

  const clustered = collapseDerivedClusters(sorted, clusterRadiusM);

  const manualRows = clustered.filter(isManualRow);

  const kept = [];
  let lastKeptDistance = -Infinity;

  for (const row of clustered) {
    const distanceM = getDistanceM(row);
    const manual = isManualRow(row);
    const alwaysKeep = isAlwaysKeepRow(row);
    const strongDerived = isStrongDerivedRow(row, minConfidence);
    const tooCloseToPreviousKept = distanceM - lastKeptDistance < minGapM;
    const tooCloseToManual = isTooCloseToManualRow(
      row,
      manualRows,
      manualExclusionRadiusM,
    );

    if (manual || alwaysKeep) {
      kept.push(row);
      lastKeptDistance = distanceM;
      continue;
    }

    if (!strongDerived) {
      continue;
    }

    if (tooCloseToPreviousKept) {
      continue;
    }

    if (tooCloseToManual) {
      continue;
    }

    kept.push(row);
    lastKeptDistance = distanceM;
  }

  return recalculatePartials(kept);
}

function collapseDerivedClusters(rows, clusterRadiusM) {
  const result = [];

  for (const row of rows) {
    if (isManualRow(row)) {
      result.push(row);
      continue;
    }

    const distanceM = getDistanceM(row);
    const last = result[result.length - 1];

    if (!last) {
      result.push(row);
      continue;
    }

    const lastDistanceM = getDistanceM(last);
    const sameEventType =
      String(last.eventType || "") === String(row.eventType || "");
    const bothDerived = !isManualRow(last) && !isManualRow(row);
    const closeEnough = Math.abs(distanceM - lastDistanceM) <= clusterRadiusM;

    if (sameEventType && bothDerived && closeEnough) {
      const lastScore = scoreRow(last);
      const rowScore = scoreRow(row);

      if (rowScore > lastScore) {
        result[result.length - 1] = row;
      }
    } else {
      result.push(row);
    }
  }

  return result;
}

function isTooCloseToManualRow(row, manualRows, manualExclusionRadiusM) {
  if (isManualRow(row)) return false;

  const rowDistanceM = getDistanceM(row);
  const eventType = String(row.eventType || "");

  if (eventType.startsWith("hairpin") || eventType.startsWith("sharp")) {
    return false;
  }

  return manualRows.some((manualRow) => {
    const manualDistanceM = getDistanceM(manualRow);
    return Math.abs(rowDistanceM - manualDistanceM) <= manualExclusionRadiusM;
  });
}

function isManualRow(row) {
  return Boolean(row.icon);
}

function isAlwaysKeepRow(row) {
  const eventType = String(row.eventType || "");

  return (
    eventType === "start" ||
    eventType === "finish" ||
    eventType === "gate" ||
    eventType === "control" ||
    eventType === "water" ||
    eventType === "crest" ||
    eventType === "dip" ||
    eventType.startsWith("danger_") ||
    eventType.startsWith("hairpin") ||
    eventType.startsWith("sharp")
  );
}

function isStrongDerivedRow(row, minConfidence) {
  const confidence = Number(row.confidence ?? 0);
  const eventType = String(row.eventType || "");

  if (eventType.startsWith("hairpin") || eventType.startsWith("sharp")) {
    return true;
  }

  if (eventType === "left_90" || eventType === "right_90") {
    return confidence >= Math.max(minConfidence - 0.1, 0.75);
  }

  if (eventType === "bear_left" || eventType === "bear_right") {
    return confidence >= minConfidence;
  }

  return confidence >= minConfidence;
}

function scoreRow(row) {
  const confidence = Number(row.confidence ?? 0);
  const angleWeight = Math.abs(Number(row.angle ?? 0)) / 180;
  const manualWeight = row.icon ? 1 : 0;
  return confidence + angleWeight + manualWeight;
}

function recalculatePartials(rows) {
  let prevKmTotal = 0;

  return rows.map((row, index) => {
    const kmTotal = Number(row.kmTotal ?? 0);
    const kmPartial =
      index === 0 ? kmTotal : Math.max(0, kmTotal - prevKmTotal);
    prevKmTotal = kmTotal;

    return {
      ...row,
      index: index + 1,
      kmPartial: round3(kmPartial),
    };
  });
}

function getDistanceM(row) {
  if (Number.isFinite(Number(row.distanceM))) {
    return Number(row.distanceM);
  }

  const kmTotal = Number(row.kmTotal ?? 0);
  return Number.isFinite(kmTotal) ? kmTotal * 1000 : 0;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
