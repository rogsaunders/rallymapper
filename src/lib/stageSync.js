// src/lib/stageSync.js
import { supabase } from "/Users/Roger/routemapper/src/lib/supabaseClient.js";
import { readPendingQueue, writePendingQueue } from "./pendingQueue";

// Optional helper if you want it in one place
export async function upsertStageExport({ userId, localId, meta, payload }) {
  return supabase.from("stage_exports").upsert(
    {
      user_id: userId,
      local_id: localId,
      meta,
      payload,
    },
    { onConflict: "user_id,local_id" },
  );
}

export async function flushPendingQueue(user) {
  if (!user?.id) return { flushed: 0, remaining: readPendingQueue().length };

  const pending = readPendingQueue();
  if (!pending.length) return { flushed: 0, remaining: 0 };

  const keep = [];
  let flushed = 0;

  for (const item of pending) {
    try {
      const localId = item.local_id || item?.meta?.local_id;
      const meta = item.meta;
      const payload = {
        meta,
        startGPS: item.startGPS,
        waypoints: item.waypoints,
      };

      const { error } = await upsertStageExport({
        userId: user.id,
        localId,
        meta,
        payload,
      });

      if (error) keep.push(item);
      else flushed += 1;
    } catch {
      keep.push(item);
    }
  }

  writePendingQueue(keep);
  return { flushed, remaining: keep.length };
}
