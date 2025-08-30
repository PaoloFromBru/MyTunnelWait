-- 1.1 View arricchita per traffic_records
create or replace view public.traffic_records_enriched as
select
  tr.id,
  tr.situation_id,
  tr.record_type,
  tr.subtype,
  tr.is_cancelled,
  tr.direction,
  tr.carriageway,
  tr.lane,
  tr.length_m,
  (tr.length_m::numeric / 1000.0) as length_km,
  tr.alertc_start_loc,
  tr.alertc_end_loc,
  tr.probability,
  tr.record_created_at,
  tr.record_versioned_at,
  tr.validity_start,
  tr.validity_end,
  ((now() at time zone 'utc') between tr.validity_start and coalesce(tr.validity_end, now())) and not tr.is_cancelled as is_active_now,
  (tr.validity_start at time zone 'Europe/Brussels')::timestamp as validity_start_be,
  (tr.validity_end   at time zone 'Europe/Brussels')::timestamp as validity_end_be,
  extract(dow  from (tr.validity_start at time zone 'Europe/Brussels'))::int as start_dow,
  extract(hour from (tr.validity_start at time zone 'Europe/Brussels'))::int as start_hour
from public.traffic_records tr;

create index if not exists idx_tre_time on public.traffic_records(validity_start, validity_end);
create index if not exists idx_tre_type on public.traffic_records(record_type, is_cancelled);

-- 1.2 Funzione per bucket da 15 minuti
create or replace function public.traffic_bins_15min(p_from timestamptz, p_to timestamptz)
returns table(
  time_bin timestamptz,
  record_id text,
  record_type text,
  direction text,
  is_cancelled boolean,
  length_km numeric
) language sql stable as $$
  select
    gs as time_bin,
    tr.id as record_id,
    tr.record_type,
    tr.direction,
    tr.is_cancelled,
    (tr.length_m::numeric/1000.0) as length_km
  from public.traffic_records tr
  join lateral generate_series(
    greatest(tr.validity_start, p_from),
    least(coalesce(tr.validity_end, p_to), p_to),
    interval '15 min'
  ) gs on gs <= coalesce(tr.validity_end, p_to)
  where tr.validity_start <= p_to
    and coalesce(tr.validity_end, p_to) >= p_from;
$$;

create index if not exists idx_tr_validity on public.traffic_records(validity_start, validity_end);

-- 1.3 (opzionale) MV heatmap settimanale
-- drop materialized view if exists public.traffic_weekly_heatmap;
-- create materialized view public.traffic_weekly_heatmap as
-- select
--   extract(dow  from (time_bin at time zone 'Europe/Brussels'))::int as dow,
--   extract(hour from (time_bin at time zone 'Europe/Brussels'))::int as hour,
--   count(*) as bin_count
-- from public.traffic_bins_15min(now() - interval '28 days', now())
-- group by 1,2;
-- create index if not exists idx_heatmap_dow_hour on public.traffic_weekly_heatmap(dow, hour);
-- refresh materialized view concurrently public.traffic_weekly_heatmap;

