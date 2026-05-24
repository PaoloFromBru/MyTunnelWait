-- Emergency storage cleanup for Supabase quota pressure.
--
-- Run from the Supabase SQL editor as the project owner.
-- The defaults favor getting below the free-tier limit quickly:
-- - keep raw official DATEX rows for 14 days
-- - keep TomTom queue_readings rows for 60 days
-- - keep 15-minute official rollups for 90 days
-- - keep hourly official rollups for 365 days
-- - keep daily official rollups indefinitely
--
-- This script intentionally does not delete manual_measurements.

-- 0) Size report before cleanup --------------------------------------------
create or replace function public.storage_size_report()
returns table(
  schema_name text,
  relation_name text,
  total_size text,
  table_size text,
  index_size text,
  total_bytes bigint
) language sql stable as $$
  select
    schemaname::text as schema_name,
    relname::text as relation_name,
    pg_size_pretty(pg_total_relation_size(relid)) as total_size,
    pg_size_pretty(pg_relation_size(relid)) as table_size,
    pg_size_pretty(pg_indexes_size(relid)) as index_size,
    pg_total_relation_size(relid) as total_bytes
  from pg_catalog.pg_statio_user_tables
  order by pg_total_relation_size(relid) desc;
$$;

select * from public.storage_size_report() limit 20;

-- Index-level report. Use this after deletes when table_only_size is small
-- but indexes_size remains large.
select
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  pg_relation_size(indexrelid) as index_bytes
from pg_catalog.pg_stat_user_indexes
order by pg_relation_size(indexrelid) desc
limit 30;

-- 1) Backfill compact rollups before deleting raw official records ----------
select public.refresh_official_wait_15min(now() - interval '90 days', now());
select public.refresh_official_wait_hourly(now() - interval '365 days', now());
select public.refresh_official_wait_daily((now() - interval '365 days')::date, now()::date);

-- 2) Drop heavy raw JSON blobs that are not used by the app -----------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'queue_readings'
      and column_name = 'raw_payload'
  ) then
    execute 'update public.queue_readings
             set raw_payload = null
             where raw_payload is not null
               and observed_at < now() - interval ''1 day''';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'queue_readings'
      and column_name = 'raw'
  ) then
    execute 'update public.queue_readings
             set raw = null
             where raw is not null
               and observed_at < now() - interval ''1 day''';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'traffic_situations'
      and column_name = 'raw'
  ) then
    execute 'update public.traffic_situations
             set raw = null
             where raw is not null';
  end if;
end $$;

-- 3) Delete rows beyond the retention windows ------------------------------
delete from public.traffic_records
where validity_start < now() - interval '14 days';

delete from public.queue_readings
where observed_at < now() - interval '60 days';

do $$
begin
  if to_regclass('public.traffic_runs') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'traffic_runs'
        and column_name = 'created_at'
    ) then
      execute 'delete from public.traffic_runs
               where created_at < now() - interval ''30 days''';
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'traffic_runs'
        and column_name = 'publication_time'
    ) then
      execute 'delete from public.traffic_runs
               where publication_time < now() - interval ''30 days''';
    end if;
  end if;
end $$;

delete from public.official_wait_15min
where time_bin < now() - interval '90 days';

delete from public.official_wait_hourly
where hour < now() - interval '365 days';

-- 4) Refresh planner statistics after large deletes -------------------------
do $$
declare
  rel_name text;
  rel regclass;
begin
  foreach rel_name in array array[
    'public.traffic_records',
    'public.queue_readings',
    'public.traffic_situations',
    'public.traffic_runs',
    'public.official_wait_15min',
    'public.official_wait_hourly',
    'public.official_wait_daily'
  ] loop
    rel := to_regclass(rel_name);
    if rel is not null then
      execute format('analyze %s', rel);
    end if;
  end loop;
end $$;

select * from public.storage_size_report() limit 20;

-- 5) Optional physical shrink ------------------------------------------------
-- Your report may show table_only_size is already small while indexes_size is
-- still large. In that case, reindex first. Run these one by one because
-- Supabase SQL editor timeouts are common on large maintenance statements.
--
-- reindex table public.queue_readings;
-- reindex table public.traffic_situations;
-- reindex table public.manual_measurements;
-- reindex table public.traffic_records;
--
-- If the quota page still reports the old size after reindexing, run these
-- one by one. They reclaim table heap space but take exclusive locks.
--
-- vacuum (full, analyze) public.queue_readings;
-- vacuum (full, analyze) public.traffic_records;
-- vacuum (full, analyze) public.traffic_situations;
-- vacuum (full, analyze) public.traffic_runs;
-- vacuum (full, analyze) public.official_wait_15min;
-- vacuum (full, analyze) public.official_wait_hourly;

-- 6) Timeout-safe batch delete helpers --------------------------------------
-- If a single DELETE times out, use these patterns repeatedly. Each invocation
-- deletes a limited batch and returns the number of rows removed.
--
-- Queue readings: oldest rows first, keep the most recent 60 days.
create or replace function public.delete_old_queue_readings_batch(
  p_before timestamptz default now() - interval '60 days',
  p_limit integer default 500
) returns integer language plpgsql as $$
declare
  deleted_count integer;
begin
  with doomed as (
    select id
    from public.queue_readings
    where observed_at < p_before
    order by observed_at asc
    limit p_limit
  )
  delete from public.queue_readings q
  using doomed
  where q.id = doomed.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Traffic runs: supports either created_at or publication_time.
create or replace function public.delete_old_traffic_runs_batch(
  p_before timestamptz default now() - interval '30 days',
  p_limit integer default 1000
) returns integer language plpgsql as $$
declare
  deleted_count integer := 0;
begin
  if to_regclass('public.traffic_runs') is null then
    return 0;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'traffic_runs'
      and column_name = 'created_at'
  ) then
    execute '
      with doomed as (
        select id
        from public.traffic_runs
        where created_at < $1
        order by created_at asc
        limit $2
      )
      delete from public.traffic_runs tr
      using doomed
      where tr.id = doomed.id'
    using p_before, p_limit;
    get diagnostics deleted_count = row_count;
    return deleted_count;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'traffic_runs'
      and column_name = 'publication_time'
  ) then
    execute '
      with doomed as (
        select id
        from public.traffic_runs
        where publication_time < $1
        order by publication_time asc
        limit $2
      )
      delete from public.traffic_runs tr
      using doomed
      where tr.id = doomed.id'
    using p_before, p_limit;
    get diagnostics deleted_count = row_count;
  end if;

  return deleted_count;
end;
$$;

-- Example repeated calls:
-- select public.delete_old_queue_readings_batch(now() - interval '60 days', 500);
-- select public.delete_old_traffic_runs_batch(now() - interval '30 days', 1000);
