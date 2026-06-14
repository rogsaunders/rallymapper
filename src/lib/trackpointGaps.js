// src/lib/trackpointGaps.js
//
// Detect gaps in the GPS trackpoint stream that indicate the recorder
// paused (rather than the user actually stopping). Used at End Stage
// to warn the surveyor before they drive away from a possibly-corrupt
// recording.
//
// Why this matters: when iOS suspends Safari (e.g. screen sleeps during
// a long passive stretch, or the user backgrounds the tab), the
// watchPosition callback stops firing. When the tab wakes again,
// recording resumes — leaving a long straight-line gap between two
// trackpoints in the otherwise smooth stream. By default normal
// trackpoint spacing is 5-10 s.
//
// Threshold history:
//   • Original: 60 s — fine on suburban / metro surveys where
//     mobile data is constant and the surveyor isn't far from
//     landmarks.
//   • 2026-06-15: raised to 300 s (5 min) after Lachie's outback
//     test surfaced a stage with 9 false-positive warnings.
//     Auto-Lock was off and the app was visible the whole time,
//     so the gaps were genuine remote-area GPS dropouts rather
//     than iOS suspension — exactly the kind of "real travel"
//     pause that shouldn't pop a warning. 300 s catches genuine
//     iOS sleeps and tab backgrounding while tolerating the
//     normal cadence of remote-area GPS hiccups.
//
// Pure function, no side effects, easy to unit-test.

const DEFAULT_THRESHOLD_MS = 300_000; // 5 min — see "Threshold history" above

/**
 * Find gaps in the trackpoint stream larger than the threshold.
 *
 * @param {Array<{ time?: string, timestamp?: string, lat: number, lon: number }>} trackPoints
 * @param {number} thresholdMs - minimum gap to report (default 300 s / 5 min)
 * @returns {Array<{ startIdx, endIdx, startTime, endTime, gapMs, gapSeconds }>}
 *          ordered by appearance in the stream
 */
export function findTrackpointGaps(trackPoints, thresholdMs = DEFAULT_THRESHOLD_MS) {
  const gaps = [];
  if (!Array.isArray(trackPoints) || trackPoints.length < 2) return gaps;

  for (let i = 1; i < trackPoints.length; i++) {
    const prevT = Date.parse(trackPoints[i - 1].time || trackPoints[i - 1].timestamp || "");
    const curT  = Date.parse(trackPoints[i].time || trackPoints[i].timestamp || "");
    if (!Number.isFinite(prevT) || !Number.isFinite(curT)) continue;

    const gapMs = curT - prevT;
    if (gapMs > thresholdMs) {
      gaps.push({
        startIdx: i - 1,
        endIdx: i,
        startTime: trackPoints[i - 1].time || trackPoints[i - 1].timestamp,
        endTime: trackPoints[i].time || trackPoints[i].timestamp,
        gapMs,
        gapSeconds: Math.round(gapMs / 1000),
      });
    }
  }

  return gaps;
}

/**
 * Format a gap duration in seconds as a human-readable string —
 * "45 s", "1 min 23 s", "12 min".
 */
export function formatGapDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0 s";
  if (seconds < 60) return `${seconds} s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) return `${mins} min`;
  return `${mins} min ${secs} s`;
}

/**
 * Format an ISO timestamp as a local clock time — "2:43 PM" / "14:43".
 * Falls back to the raw timestamp on parse failure.
 */
export function formatClockTime(isoString) {
  const t = Date.parse(isoString || "");
  if (!Number.isFinite(t)) return isoString || "";
  return new Date(t).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Build a human-readable summary of gaps, suitable for an alert dialog.
 * Returns null when there are no gaps.
 */
export function summariseGaps(gaps) {
  if (!gaps || gaps.length === 0) return null;
  const lines = gaps.map(
    (g) =>
      `  • ${formatClockTime(g.startTime)} – ${formatClockTime(g.endTime)} (${formatGapDuration(g.gapSeconds)})`,
  );
  const count = gaps.length;
  const plural = count === 1 ? "" : "s";
  return (
    `⚠️ Possible recording pause${plural} detected\n\n` +
    `Your stage has ${count} gap${plural} in the GPS track ` +
    `where recording paused for more than 5 minutes:\n\n` +
    lines.join("\n") +
    `\n\n` +
    `This usually happens when the iPad goes to sleep or the app is ` +
    `backgrounded. Open the stage in History to review whether the ` +
    `gaps affect the recorded path.`
  );
}
