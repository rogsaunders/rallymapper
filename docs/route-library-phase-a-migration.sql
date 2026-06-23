-- ============================================================================
-- Route Library — Phase A (free catalogue) schema migration
-- ============================================================================
-- Target: RouteMapper Supabase project (ref rfmvyachiypzvtxpdvma).
-- Apply via the Supabase SQL editor or `supabase db` once reviewed. This is
-- idempotent where practical (IF NOT EXISTS / CREATE OR REPLACE) so a re-run
-- is safe.
--
-- Conventions mirror the existing tables (profiles, stage_exports,
-- beta_users, event_passes):
--   • gen_random_uuid() primary keys
--   • timestamptz columns default now()
--   • RLS enabled on every table
--   • FKs reference auth.users(id)
--   • status columns guarded by CHECK ... = ANY(ARRAY[...])
--
-- Scope is the FREE catalogue only. Paid purchases (route_purchases),
-- author payouts (route_payouts) and reviews (route_reviews) arrive in
-- Phases B/D. PostGIS radius search is deferred to Phase D; Phase A stores
-- the bounding box as plain numerics.
-- ============================================================================

begin;

-- ── Extensions ──────────────────────────────────────────────────────────────
-- pg_trgm powers fuzzy title search. (PostGIS intentionally NOT enabled yet.)
create extension if not exists pg_trgm with schema extensions;

-- ── Shared updated_at trigger helper ────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. route_authors — who may publish (mirrors the beta_users gating pattern)
--    Authorship is granted explicitly (trusted). The app additionally checks
--    the user is a current subscriber before allowing submission.
-- ============================================================================
create table if not exists public.route_authors (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  status       text not null default 'active'
               check (status = any (array['active','paused','removed'])),
  display_name text,
  notes        text,
  approved_at  timestamptz default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.route_authors enable row level security;

-- A user can see their own authorship status (so the UI can show/hide the
-- "Submit a route" affordance). Grants/changes are admin-only (service role,
-- which bypasses RLS) — no INSERT/UPDATE policy for end users on purpose.
drop policy if exists "route_authors read own" on public.route_authors;
create policy "route_authors read own"
  on public.route_authors for select to authenticated
  using (user_id = auth.uid());

drop trigger if exists trg_route_authors_updated on public.route_authors;
create trigger trg_route_authors_updated
  before update on public.route_authors
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2. route_listings — the catalogue
-- ============================================================================
create table if not exists public.route_listings (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'draft'
                  check (status = any (array[
                    'draft','submitted','in_review','published',
                    'unpublished','rejected'
                  ])),
  -- Descriptive
  title           text not null,
  summary         text,
  description     text,                      -- long form, markdown
  activity        text,                      -- car|rally|4wd|moto|cycle|walk
  sub_type        text,                      -- trail|adventure|road|...
  region          text,
  country         text,                      -- ISO-3166 alpha-2
  language        text default 'en',
  tags            text[] not null default '{}',
  surface         text,                      -- sealed|gravel|sand|mixed|technical
  difficulty      int check (difficulty between 1 and 5),
  elevation_gain_m int,
  duration_min    int,
  -- Bounding box (Phase A: plain numerics; PostGIS in Phase D)
  min_lat numeric, min_lon numeric, max_lat numeric, max_lon numeric,
  center_lat numeric, center_lon numeric,
  -- Complexity inputs — auto-derived from stage.json at submission; drive the
  -- Phase B sliding-scale price.
  stage_count     int not null default 1,
  distance_km     numeric,
  waypoint_count  int,
  -- Commerce (Phase A: everything free → price_cents = 0)
  price_cents     int not null default 0 check (price_cents >= 0),
  currency        text not null default 'aud',
  license         text,
  -- Presentation / metrics
  preview_path    text,                      -- object in route-previews bucket
  rating_avg      numeric,
  rating_count    int not null default 0,
  download_count  int not null default 0,
  rejected_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  published_at    timestamptz,
  -- Generated full-text vector over the human-facing text fields. Two
  -- immutability constraints a generated column enforces:
  --   • the config must be cast to regconfig — to_tsvector('english', ...)
  --     with a text literal is only STABLE; the ::regconfig form is IMMUTABLE.
  --   • array_to_string() is STABLE, so `tags` is deliberately NOT folded in
  --     here — tags are filtered via their own GIN index (exact match), which
  --     is the right tool for them anyway.
  search_tsv tsvector generated always as (
    to_tsvector('english'::regconfig,
      coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' ||
      coalesce(description,'') || ' ' || coalesce(region,''))
  ) stored
);

alter table public.route_listings enable row level security;

-- Anyone (incl. anonymous) may read PUBLISHED listings.
drop policy if exists "route_listings read published" on public.route_listings;
create policy "route_listings read published"
  on public.route_listings for select
  using (status = 'published');

-- Authors may read all of their OWN listings (any status).
drop policy if exists "route_listings read own" on public.route_listings;
create policy "route_listings read own"
  on public.route_listings for select to authenticated
  using (author_id = auth.uid());

-- Active authors may create listings for themselves — but only in an author-
-- controlled state. Without the status guard an author could insert a row
-- already `published`, bypassing curation; restrict inserts to draft/submitted
-- (publishing is a service-role/curation transition only).
drop policy if exists "route_listings insert own" on public.route_listings;
create policy "route_listings insert own"
  on public.route_listings for insert to authenticated
  with check (
    author_id = auth.uid()
    and status = any (array['draft','submitted'])
    and exists (
      select 1 from public.route_authors a
      where a.user_id = auth.uid() and a.status = 'active'
    )
  );

-- Authors may edit their own listings, but only while in author-controlled
-- states, and may only move them between draft/submitted. Curation
-- transitions (in_review/published/unpublished/rejected) are performed by the
-- service role (admin), which bypasses RLS — so authors cannot self-publish.
drop policy if exists "route_listings update own" on public.route_listings;
create policy "route_listings update own"
  on public.route_listings for update to authenticated
  using (author_id = auth.uid() and status = any (array['draft','submitted']))
  with check (author_id = auth.uid() and status = any (array['draft','submitted']));

create index if not exists route_listings_status_idx
  on public.route_listings (status);
create index if not exists route_listings_published_idx
  on public.route_listings (status, published_at desc);
create index if not exists route_listings_activity_idx
  on public.route_listings (activity, sub_type);
create index if not exists route_listings_country_idx
  on public.route_listings (country);
create index if not exists route_listings_tags_idx
  on public.route_listings using gin (tags);
create index if not exists route_listings_tsv_idx
  on public.route_listings using gin (search_tsv);
create index if not exists route_listings_title_trgm_idx
  on public.route_listings using gin (title extensions.gin_trgm_ops);

drop trigger if exists trg_route_listings_updated on public.route_listings;
create trigger trg_route_listings_updated
  before update on public.route_listings
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3. route_versions — a listing can be re-published; downloaders get latest
-- ============================================================================
create table if not exists public.route_versions (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.route_listings(id) on delete cascade,
  version       int not null default 1,
  storage_path  text not null,               -- object in private route-files bucket
  file_bytes    bigint,
  format_version text,
  stage_json_meta jsonb,                      -- snapshot of derived metadata
  created_at    timestamptz not null default now(),
  unique (listing_id, version)
);

alter table public.route_versions enable row level security;

-- Readable when the parent listing is published, or owned by the requester.
-- (Actual file bytes are served by a server function via signed URL, not by
-- this row — this just exposes version metadata.)
drop policy if exists "route_versions read" on public.route_versions;
create policy "route_versions read"
  on public.route_versions for select
  using (
    exists (
      select 1 from public.route_listings l
      where l.id = listing_id
        and (l.status = 'published' or l.author_id = auth.uid())
    )
  );

-- Active authors may add versions to their own listings.
drop policy if exists "route_versions insert own" on public.route_versions;
create policy "route_versions insert own"
  on public.route_versions for insert to authenticated
  with check (
    exists (
      select 1 from public.route_listings l
      join public.route_authors a on a.user_id = auth.uid() and a.status = 'active'
      where l.id = listing_id and l.author_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. route_downloads — log downloads (download_count + "My library")
-- ============================================================================
create table if not exists public.route_downloads (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.route_listings(id) on delete cascade,
  version_id  uuid references public.route_versions(id) on delete set null,
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.route_downloads enable row level security;

-- A user records and sees their own downloads (the basis of "My routes").
-- Anonymous/free downloads are counted via download_count by the server
-- function instead of a row here.
drop policy if exists "route_downloads insert own" on public.route_downloads;
create policy "route_downloads insert own"
  on public.route_downloads for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "route_downloads read own" on public.route_downloads;
create policy "route_downloads read own"
  on public.route_downloads for select to authenticated
  using (user_id = auth.uid());

create index if not exists route_downloads_user_idx
  on public.route_downloads (user_id, created_at desc);
create index if not exists route_downloads_listing_idx
  on public.route_downloads (listing_id);

-- ============================================================================
-- 5. Storage buckets
-- ============================================================================
-- The downloadable export ZIPs. PUBLIC-read for Phase A (free catalogue) so
-- the storefront is fully client-side — no signed-URL function / service-role
-- key needed. Phase B reverts this to private + short-lived signed URLs minted
-- by a server function (where the purchase/entitlement check will live).
insert into storage.buckets (id, name, public)
values ('route-files', 'route-files', true)
on conflict (id) do update set public = true;

-- Public: preview thumbnails (world-readable via the public URL).
insert into storage.buckets (id, name, public)
values ('route-previews', 'route-previews', true)
on conflict (id) do nothing;

-- Authenticated users upload route files into a folder named by their user
-- id, e.g. "<uid>/<listing>/route.zip". NB: we deliberately do NOT gate this
-- on an active route_authors row — a cross-schema EXISTS subquery here is
-- evaluated unreliably by the storage service (it rejected valid author
-- uploads in practice). Folder-ownership is the real guard; author-gating is
-- enforced where it matters, on the route_listings INSERT (an upload with no
-- matching listing is an inert orphan that can't surface in the catalogue).
drop policy if exists "route-files authors upload" on storage.objects;
create policy "route-files authors upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'route-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "route-files authors manage own" on storage.objects;
create policy "route-files authors manage own"
  on storage.objects for update to authenticated
  using (bucket_id = 'route-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'route-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "route-files authors delete own" on storage.objects;
create policy "route-files authors delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'route-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Previews: authors upload into their own folder; reads are public via the
-- bucket's public flag (no select policy needed).
drop policy if exists "route-previews authors upload" on storage.objects;
create policy "route-previews authors upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'route-previews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;

-- ============================================================================
-- Notes for later phases (NOT applied here):
--   • route_purchases  — model on event_passes (stripe_payment_intent_id
--     unique, status). Entitlement → signed download URL.
--   • route_payouts    — ledger: gross/fee(40%)/net(60%) per purchase.
--   • route_reviews    — rating + body; recompute route_listings.rating_avg.
--   • PostGIS          — add geography(Point/Polygon) + GiST index for radius
--     search; backfill from the bbox numerics.
-- ============================================================================
