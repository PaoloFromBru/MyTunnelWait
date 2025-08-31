-- Rollups and retention for sustainable storage
--
-- Creates compact aggregate tables and maintenance functions to keep
-- storage growth under control while preserving useful history.
--
-- Prereq: public.official_wait_bins_15min(p_from, p_to)

-- 1) Aggregate tables -------------------------------------------------------
create table if not exists public.official_wait_15min (
  time_bin timestamptz not null,
  tunnel   text not null,
  dir      text not null,              -- 'N2S' | 'S2N' | 'E2W' | 'W2E'
  p50_wait numeric not null,
  primary key (time_bin, tunnel, dir)
);
create index if not exists idx_ow15_tunnel_dir_time on public.official_wait_15min(tunnel, dir, time_bin);

create table if not exists public.official_wait_hourly (
  hour     timestamptz not null,
  tunnel   text not null,
  dir      text not null,
  p50_wait numeric not null,
  primary key (hour, tunnel, dir)
);
create index if not exists idx_owh_tunnel_dir_hour on public.official_wait_hourly(tunnel, dir, hour);

create table if not exists public.official_wait_daily (
  day      date not null,
  tunnel   text not null,
  dir      text not null,
  p50_wait numeric not null,
  primary key (day, tunnel, dir)
);
create index if not exists idx_owd_tunnel_dir_day on public.official_wait_daily(tunnel, dir, day);

-- 2) Refresh helpers --------------------------------------------------------
create or replace function public.refresh_official_wait_15min(p_from timestamptz, p_to timestamptz)
returns integer language sql as $$
  with src as (
    select * from public.official_wait_bins_15min(p_from, p_to)
  ), up as (
    insert into public.official_wait_15min(time_bin, tunnel, dir, p50_wait)
    select time_bin, tunnel, dir, p50_wait from src
    on conflict (time_bin, tunnel, dir) do update set p50_wait = excluded.p50_wait
    returning 1
  )
  select count(*) from up;
$$;

create or replace function public.refresh_official_wait_hourly(p_from timestamptz, p_to timestamptz)
returns integer language sql as $$
  with agg as (
    select date_trunc('hour', time_bin) as hour,
           tunnel, dir,
           percentile_disc(0.5) within group (order by p50_wait) as p50
    from public.official_wait_15min
    where time_bin >= p_from and time_bin < p_to
    group by 1,2,3
  ), up as (
    insert into public.official_wait_hourly(hour, tunnel, dir, p50_wait)
    select hour, tunnel, dir, p50 from agg
    on conflict (hour, tunnel, dir) do update set p50_wait = excluded.p50_wait
    returning 1
  )
  select count(*) from up;
$$;

create or replace function public.refresh_official_wait_daily(p_from date, p_to date)
returns integer language sql as $$
  with agg as (
    select (date_trunc('day', hour))::date as day,
           tunnel, dir,
           percentile_disc(0.5) within group (order by p50_wait) as p50
    from public.official_wait_hourly
    where hour >= p_from::timestamptz and hour < (p_to + 1)::timestamptz
    group by 1,2,3
  ), up as (
    insert into public.official_wait_daily(day, tunnel, dir, p50_wait)
    select day, tunnel, dir, p50 from agg
    on conflict (day, tunnel, dir) do update set p50_wait = excluded.p50_wait
    returning 1
  )
  select count(*) from up;
$$;

-- 3) Retention jobs ---------------------------------------------------------
create or replace function public.prune_old_data(
  keep_raw_days integer default 120,
  keep_15min_days integer default 270,
  keep_hourly_days integer default 730
) returns void language plpgsql as $$
begin
  -- Raw DATEX records: traffic_records + optional snapshots tables
  delete from public.traffic_records
  where validity_start < now() - make_interval(days => keep_raw_days);

  -- 15-min aggregates
  delete from public.official_wait_15min
  where time_bin < now() - make_interval(days => keep_15min_days);

  -- hourly aggregates
  delete from public.official_wait_hourly
  where hour < now() - make_interval(days => keep_hourly_days);
end;
$$;
