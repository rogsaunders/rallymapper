-- ============================================================================
-- Route Library — admin curation flag (applied to prod rfmvyachiypzvtxpdvma)
-- ============================================================================
-- Adds an is_admin flag to route_authors, gating the /library/admin review UI
-- and the admin-listings Netlify function (which re-checks it authoritatively
-- with the service role before publish/reject/unpublish). The existing
-- "route_authors read own" RLS policy lets a user read their own flag so the
-- client can show/hide the Admin link.

alter table public.route_authors
  add column if not exists is_admin boolean not null default false;

-- Grant the founder admin (roger@routemapper.net).
update public.route_authors
  set is_admin = true
  where user_id = 'c2a087c8-7ac3-4e28-8e79-428db99f7a20';
