-- Bins 15' per manual_measurements e queue_readings

-- Manual measurements (DB enums: tunnel: gotthard|monte_bianco|frejus|brenner; direction: northbound|southbound)
create or replace function public.measure_wait_bins_15min(
  p_from timestamptz,
  p_to   timestamptz,
  p_tunnel public.tunnel_id default null,
  p_direction public.traffic_direction default null
) returns table(
  time_bin timestamptz,
  tunnel   text,
  direction text,
  p50_wait numeric,
  n int
) language sql stable as $$
  with src as (
    select 
      (date_trunc('minute', observed_at) - (extract(minute from observed_at)::int % 15) * interval '1 minute') as time_bin,
      tunnel,
      direction,
      wait_minutes
    from public.manual_measurements
    where observed_at >= p_from
      and observed_at <= p_to
      and (p_tunnel is null or tunnel = p_tunnel)
      and (p_direction is null or direction = p_direction)
  )
  select time_bin, tunnel, direction,
         percentile_disc(0.5) within group (order by wait_minutes) as p50_wait,
         count(*) as n
  from src
  group by 1,2,3
$$;

-- Queue readings (TomTom) — al momento solo 'Gotthard' via location
-- Normalizza la direzione su northbound/southbound per asse NS
create or replace function public.queue_wait_bins_15min(
  p_from timestamptz,
  p_to   timestamptz,
  p_tunnel text default null,
  p_direction text default null
) returns table(
  time_bin timestamptz,
  tunnel   text,
  direction text,
  p50_wait numeric,
  n int
) language sql stable as $$
  with src as (
    select 
      (date_trunc('minute', observed_at) - (extract(minute from observed_at)::int % 15) * interval '1 minute') as time_bin,
      case when location ilike 'Gotthard%' then 'gotthard' else null end as tunnel,
      -- Asse NS per Gotthard: N2S -> southbound; S2N -> northbound
      case when location ilike 'Gotthard%'
           then case when direction = 'N2S' then 'southbound' when direction = 'S2N' then 'northbound' else null end
           else null end as direction_norm,
      wait_minutes
    from public.queue_readings
    where observed_at >= p_from
      and observed_at <= p_to
  )
  select time_bin, tunnel, direction_norm as direction,
         percentile_disc(0.5) within group (order by wait_minutes) as p50_wait,
         count(*) as n
  from src
  where tunnel is not null
    and direction_norm is not null
    and (p_tunnel is null or tunnel = p_tunnel)
    and (p_direction is null or direction_norm = p_direction)
  group by 1,2,3
$$;
