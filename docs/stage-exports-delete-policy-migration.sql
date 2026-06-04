-- Applied to production 2026-06-04.
-- See PR fix(history): trash icon now permanently deletes (cloud + device)
-- and the follow-up that wired this in.
--
-- The stage_exports table already had RLS policies for INSERT, SELECT,
-- and UPDATE (all filtered by auth.uid() = user_id), but no DELETE
-- policy. With RLS enabled, that means every DELETE was silently
-- denied: Postgres returned success with zero rows affected and no
-- error. The client thought the delete worked, the local copy was
-- removed, and the cloud row reappeared on next list load — making
-- the trash icon in Stage History look like a no-op.
--
-- This adds the symmetric DELETE policy so signed-in users can
-- delete their own rows.

CREATE POLICY "Users can delete own stages"
  ON public.stage_exports
  FOR DELETE
  USING (auth.uid() = user_id);
