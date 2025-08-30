-- Official wait-time estimation from DATEX traffic_records
-- This script adds:
-- 1) Calibration table (min = a + b * queue_km)
-- 2) Classified view with tunnel_id, dir_logical, queue_km
-- 3) Function official_wait_bins_15min(p_from, p_to) → p50 wait per 15' bin
--
-- Prerequisites:
-- - Existing table public.traffic_records populated by your external cron
-- - Function public.traffic_bins_15min(p_from, p_to) from traffic_setup.sql

-- 1) Calibration table per tunnel
create table if not exists public.official_wait_calibration (
  tunnel text primary key,   -- 'gotthard' | 'monte_bianco' | 'frejus' | 'brenner'
  a numeric not null default 0,
  b numeric not null default 2
);

insert into public.official_wait_calibration(tunnel,a,b)
values ('gotthard', 0, 2), ('monte_bianco', 0, 2), ('frejus', 0, 2), ('brenner', 0, 2)
on conflict (tunnel) do nothing;

-- 2) Classified view based on traffic_records
-- Heuristics:
-- - tunnel_id: derived from location/roads strings (adjust as needed)
-- - dir_logical: derived from ALERT-C start/end geometry (lat/lon deltas)
-- - queue_km: from length_m (kilometers)
create or replace view public.traffic_records_classified as
with base as (
  select
    tr.*,
    ts.location as ts_location,
    ts.roads    as ts_roads,
    case
      when position('GOTTHARD' in upper(coalesce(ts.location, array_to_string(ts.roads, ' '), ''))) > 0
        or position('SAN GOTTARDO' in upper(coalesce(ts.location, array_to_string(ts.roads, ' '), ''))) > 0
        then 'gotthard'
      when position('MONT' in upper(coalesce(ts.location, array_to_string(ts.roads, ' '), ''))) > 0
        or position('BIANCO' in upper(coalesce(ts.location, array_to_string(ts.roads, ' '), ''))) > 0
        or position('BLANC' in upper(coalesce(ts.location, array_to_string(ts.roads, ' '), ''))) > 0
        then 'monte_bianco'
      when position('FREJUS' in upper(coalesce(ts.location, array_to_string(ts.roads, ' '), ''))) > 0
        or position('FRÉJUS' in upper(coalesce(ts.location, array_to_string(ts.roads, ' '), ''))) > 0
        then 'frejus'
      when position('BRENN' in upper(coalesce(ts.location, array_to_string(ts.roads, ' '), ''))) > 0
        then 'brenner'
      else null
    end as tunnel_id
  from public.traffic_records tr
  left join public.traffic_situations ts on ts.id = tr.situation_id
)
select
  b.*,
  -- Map 'positive'/'negative' to a logical direction by tunnel axis
  case
    when b.tunnel_id in ('gotthard','brenner') and b.direction is not null then
      case when lower(b.direction) = 'positive' then 'S2N' else 'N2S' end
    when b.tunnel_id in ('monte_bianco','frejus') and b.direction is not null then
      case when lower(b.direction) = 'positive' then 'E2W' else 'W2E' end
    else null
  end as dir_logical,
  (b.length_m::numeric / 1000.0) as queue_km
from base b;

create index if not exists idx_trc_type_time on public.traffic_records(record_type, validity_start, validity_end);

-- 3) 15-minute bins with median estimated wait (minutes)
-- Uses calibration a,b per tunnel: wait = max(0, a + b * queue_km)
create or replace function public.official_wait_bins_15min(p_from timestamptz, p_to timestamptz)
returns table(
  time_bin timestamptz,
  tunnel text,
  dir text,           -- 'N2S' | 'S2N' | 'E2W' | 'W2E'
  p50_wait numeric    -- minutes
) language sql stable as $$
  with recs as (
    select tbe.time_bin,
           cls.tunnel_id as tunnel,
           cls.dir_logical as dir,
           cls.queue_km,
           coalesce(cal.a,0) as a,
           coalesce(cal.b,2) as b
    from public.traffic_bins_15min(p_from, p_to) tbe
    join public.traffic_records_classified cls on cls.id = tbe.record_id
    left join public.official_wait_calibration cal on cal.tunnel = cls.tunnel_id
    where cls.tunnel_id is not null
      and cls.dir_logical is not null
      and cls.record_type = 'AbnormalTraffic'
      and cls.is_cancelled = false
  ), est as (
    select time_bin, tunnel, dir, greatest(0, a + b * queue_km) as wait_min
    from recs
  )
  select time_bin, tunnel, dir,
         percentile_disc(0.5) within group (order by wait_min) as p50_wait
  from est
  group by 1,2,3
$$;
