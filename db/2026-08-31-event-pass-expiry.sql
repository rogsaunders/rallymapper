-- 2026-08-31 — Event Pass expiry enforcement (applied directly to prod;
-- schema is not under migration control, so this file is a RECORD).
--
-- Event Pass model: a purchased pass is 'unused' until the buyer ACTIVATES it
-- (see netlify/functions/activate-event-pass.cjs), which sets status='active',
-- activated_at=now, expires_at=now+60 days, and profiles.plan='event_pass'.
-- This hourly job closes the loop: it expires elapsed passes and reverts the
-- user to 'free' when they have no other active pass and no active paid sub.

create extension if not exists pg_cron;

create or replace function public.expire_event_passes()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.event_passes
     set status = 'expired'
   where status = 'active'
     and expires_at is not null
     and expires_at < now();

  update public.profiles p
     set plan = 'free'
   where p.plan = 'event_pass'
     and not exists (
       select 1 from public.event_passes e
        where e.user_id = p.id and e.status = 'active'
          and (e.expires_at is null or e.expires_at > now()))
     and not exists (
       select 1 from public.subscriptions s
        where s.user_id = p.id
          and s.status not in ('canceled','cancelled','incomplete_expired','unpaid','past_due'));
end;
$$;

-- Revoke from PUBLIC too — functions are EXECUTE-able by PUBLIC by default,
-- which authenticated/anon inherit; revoking only those roles isn't enough.
revoke all on function public.expire_event_passes() from public, anon, authenticated;

-- Hourly. cron.schedule upserts by job name (pg_cron >= 1.4).
select cron.schedule('expire-event-passes', '0 * * * *', $$select public.expire_event_passes();$$);

-- Unschedule (for reference): select cron.unschedule('expire-event-passes');
