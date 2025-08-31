-- Security hardening: use invoker on views and enable RLS with safe read policies
-- Run this after creating views/tables to address Supabase linter warnings.

-- 1) Views should run with caller privileges (not creator)
alter view if exists public.traffic_records_enriched  set (security_invoker = on);
alter view if exists public.traffic_records_classified set (security_invoker = on);

-- 2) Enable RLS on public tables flagged by the linter
alter table if exists public.queue_ingest_snapshots       enable row level security;
alter table if exists public.traffic_records              enable row level security;
alter table if exists public.official_wait_calibration    enable row level security;
alter table if exists public.official_wait_15min          enable row level security;
alter table if exists public.official_wait_hourly         enable row level security;
alter table if exists public.official_wait_daily          enable row level security;

-- 3) Public read-only access to aggregates; no writes
revoke all   on public.official_wait_15min   from anon, authenticated;
revoke all   on public.official_wait_hourly  from anon, authenticated;
revoke all   on public.official_wait_daily   from anon, authenticated;
grant select on public.official_wait_15min   to   anon, authenticated;
grant select on public.official_wait_hourly  to   anon, authenticated;
grant select on public.official_wait_daily   to   anon, authenticated;

-- 4) Keep raw/snapshots/calibration private to service role (no direct public access)
revoke all on public.queue_ingest_snapshots    from anon, authenticated;
revoke all on public.traffic_records           from anon, authenticated;
revoke all on public.official_wait_calibration from anon, authenticated;

-- 5) RLS policies: allow read for aggregates, nothing else by default
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='official_wait_15min' and policyname='read_all') then
    create policy read_all on public.official_wait_15min for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='official_wait_hourly' and policyname='read_all') then
    create policy read_all on public.official_wait_hourly for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='official_wait_daily' and policyname='read_all') then
    create policy read_all on public.official_wait_daily for select using (true);
  end if;
end$$;

-- Note: Service Role bypasses RLS and will continue to write/refresh aggregates
-- via cron and server-side routes. Keep raw tables without SELECT policies to
-- prevent exposure via PostgREST.

