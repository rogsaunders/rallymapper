export function buildRoadbookViews(rows, options = {}) {
  const rawRows = Array.isArray(rows) ? rows : [];

  const driverRows = filterDriverRoadbook(rawRows, options);

  return {
    raw: rawRows,
    driver: driverRows,
  };
}

export function filterDriverRoadbook(rows, options = {}) {
  const minConfidence = options.minConfidence ?? 0.8;
  const minGapM = options.minGapM ?? 80;
  const clusterRadiusM = options.clusterRadiusM ?? 60;

  const sorted = [...(rows || [])].sort(
    (a, b) =>
      (a.distanceM ?? kmToM(a.kmTotal)) - (b.distanceM ?? kmToM(b.kmTotal)),
  );

  const clustered = collapseDerivedClusters(sorted, clusterRadiusM);

  const kept = [];
  let lastKeptDistance = -Infinity;

  for (const row of clustered) {
    const distanceM = row.distanceM ?? kmToM(row.kmTotal);
    const hasManualIcon = Boolean(row.icon);
    const isAlwaysKeep = isAlwaysKeepRow(row);
    const isStrongDerived = isStrongDerivedRow(row, minConfidence);
    const farEnough = distanceM - lastKeptDistance >= minGapM;

    if (hasManualIcon || isAlwaysKeep) {
      kept.push(row);
      lastKeptDistance = distanceM;
      continue;
    }

    if (isStrongDerived && farEnough) {
      kept.push(row);
      lastKeptDistance = distanceM;
    }
  }

  return recalculatePartials(kept);
}

function collapseDerivedClusters(rows, clusterRadiusM) {
  const result = [];

  for (const row of rows) {
    const distanceM = row.distanceM ?? kmToM(row.kmTotal);
    const hasManualIcon = Boolean(row.icon);

    if (hasManualIcon) {
      result.push(row);
      continue;
    }

    const last = result[result.length - 1];
    if (!last) {
      result.push(row);
      continue;
    }

    const lastDistanceM = last.distanceM ?? kmToM(last.kmTotal);
    const sameEventType = last.eventType === row.eventType;
    const bothDerived = !last.icon && !row.icon;
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
    return confidence >= Math.max(minConfidence - 0.1, 0.65);
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

function kmToM(km) {
  const n = Number(km ?? 0);
  return Number.isFinite(n) ? n * 1000 : 0;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
