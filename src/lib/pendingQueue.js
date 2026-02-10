// src/lib/pendingQueue.js
const KEY = "rm_pending_queue_v1";

export function readPendingQueue() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const SIGNAL_KEY = "rm_pending_queue_signal_v1";

export function writePendingQueue(items) {
  localStorage.setItem(KEY, JSON.stringify(items || []));
  localStorage.setItem(SIGNAL_KEY, String(Date.now())); // nudge listeners
}

export function enqueueStage(stage) {
  const q = readPendingQueue();
  q.push(stage);
  writePendingQueue(q);
  return q.length;
}

export function clearPendingQueue() {
  writePendingQueue([]);
}
