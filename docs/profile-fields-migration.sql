-- ─────────────────────────────────────────────────────────────────────────────
-- profile-fields-migration.sql
--
-- Migration to support capturing full_name, username, and phone in profiles.
--
-- Run this in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- What it does:
--   1. Adds a case-insensitive UNIQUE INDEX on profiles.username
--   2. Replaces the new-user trigger so it populates full_name, phone, and
--      a unique username (email local-part with -2/-3 collision suffix)
--   3. Backfills username for existing rows from auth.users.email
-- ─────────────────────────────────────────────────────────────────────────────


-- 1. Unique, case-insensitive index on username ──────────────────────────────
-- Allows NULLs (existing rows before backfill won't break) and treats
-- "RogerS" and "rogers" as the same handle.

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;


-- 2. Helper: next available username given a base local-part ─────────────────
-- Returns base if free, otherwise base-2, base-3, ...

CREATE OR REPLACE FUNCTION public.next_available_username(base text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate text := base;
  suffix    int  := 2;
BEGIN
  WHILE EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(candidate)
  ) LOOP
    candidate := base || '-' || suffix;
    suffix := suffix + 1;
  END LOOP;
  RETURN candidate;
END;
$$;


-- 3. Trigger function for new auth.users rows ───────────────────────────────
-- Pulls full_name, phone from raw_user_meta_data (set during signUp options.data)
-- and assigns a unique username from the email's local-part.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_part text := lower(split_part(NEW.email, '@', 1));
  v_username   text;
BEGIN
  v_username := public.next_available_username(v_local_part);

  INSERT INTO public.profiles (id, full_name, username, phone, plan)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    v_username,
    NEW.raw_user_meta_data ->> 'phone',
    'free'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    phone     = COALESCE(EXCLUDED.phone,     public.profiles.phone),
    username  = COALESCE(public.profiles.username, EXCLUDED.username);

  RETURN NEW;
END;
$$;


-- 4. Re-bind the trigger to auth.users ───────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- 5. Backfill username for existing rows ────────────────────────────────────
-- For any profile row missing a username, derive it from auth.users.email
-- using the same collision logic. Done one-by-one so collisions resolve
-- deterministically.

DO $$
DECLARE
  r RECORD;
  v_base text;
BEGIN
  FOR r IN
    SELECT p.id, u.email
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.username IS NULL
      AND u.email IS NOT NULL
    ORDER BY p.created_at NULLS LAST
  LOOP
    v_base := lower(split_part(r.email, '@', 1));
    UPDATE public.profiles
       SET username = public.next_available_username(v_base)
     WHERE id = r.id;
  END LOOP;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries (optional — run separately to check results)
--
-- SELECT id, full_name, username, phone, plan FROM public.profiles ORDER BY created_at;
-- SELECT COUNT(*) FROM public.profiles WHERE username IS NULL;  -- should be 0
-- ─────────────────────────────────────────────────────────────────────────────
