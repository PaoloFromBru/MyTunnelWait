-- Schema for storing traffic reports and model estimates

-- User reports (crowd input)
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  direction text check (direction in ('N','S')),
  queue_km numeric,
  wait_min integer,
  lambda_est numeric,
  mu_assumed numeric,
  user_id uuid references auth.users(id)
);

-- Estimates saved by the system (for QA and stats)
create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  direction text,
  input jsonb,
  minutes numeric,
  source text
);

-- Aggregated statistics by hour
create materialized view public.hourly_stats as
select date_trunc('hour', created_at) as hour,
       direction,
       avg(queue_km) as avg_queue_km,
       percentile_disc(0.5) within group (order by wait_min) as p50_wait,
       count(*) as n
from reports
group by 1,2;
