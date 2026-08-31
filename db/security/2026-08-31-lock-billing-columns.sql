-- 2026-08-31 — Lock billing columns against client writes
--
-- The production Supabase schema is NOT under migration control, so this file
-- is a RECORD of a change applied directly to the database (project
-- rfmvyachiypzvtxpdvma), not a migration that runs automatically. It is kept
-- here so the change is auditable and reproducible.
--
-- WHY (critical, found in the 2026-08-31 checkout-funnel audit):
--   The `profiles` UPDATE RLS policy was `USING (auth.uid() = id)` with no
--   WITH CHECK and no column restriction, and the `authenticated`/`anon` roles
--   held table-level UPDATE — including the `plan` column. So any signed-in
--   user could grant themselves any plan for free, bypassing Stripe entirely:
--     supabase.from('profiles').update({ plan: 'pro_yearly' }).eq('id', myId)
--   Same exposure on `profiles.stripe_customer_id` and on `event_passes`.
--
-- FIX: revoke the blanket client write and re-grant ONLY the user-editable
--   columns, so only the service-role webhook (stripe-webhook.cjs) can set
--   billing state. The RLS row policies are unchanged; this is column-level
--   privilege tightening, which Postgres enforces in addition to RLS.
--
-- Verified after applying: has_column_privilege('authenticated','profiles',
--   'plan','UPDATE') = false; full_name/username/phone still writable; a
--   scan found zero profiles on a paid plan without a matching subscription
--   or event pass (i.e. it was never exploited).

BEGIN;

-- profiles: only full_name / username / phone / organization are user-editable.
REVOKE INSERT, UPDATE ON public.profiles FROM anon, authenticated;
GRANT  UPDATE (full_name, username, phone, organization, updated_at)
  ON public.profiles TO authenticated;
GRANT  INSERT (id, full_name, username, phone, organization, updated_at)
  ON public.profiles TO authenticated;

-- event_passes are entirely server-managed (created by the Stripe webhook,
-- consumed server-side). Users must not write their own passes.
DROP POLICY IF EXISTS "Users can update own event passes" ON public.event_passes;
REVOKE INSERT, UPDATE ON public.event_passes FROM anon, authenticated;

COMMIT;

-- ── Rollback (for reference only — re-opens the vulnerability) ──────────────
-- GRANT INSERT, UPDATE ON public.profiles     TO authenticated;
-- GRANT INSERT, UPDATE ON public.event_passes TO authenticated;
-- CREATE POLICY "Users can update own event passes" ON public.event_passes
--   FOR UPDATE TO public USING (auth.uid() = user_id);
