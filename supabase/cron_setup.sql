-- Idempotent cron setup for official wait rollups
-- Requires extension pg_cron enabled.

create or replace function public.setup_official_wait_cron()
returns json language plpgsql security definer as $$
declare
  names text[] := array['ow15-refresh','ow-hourly-refresh','ow-daily-refresh','prune-old-data'];
  r record;
  created jsonb := '[]'::jsonb;
begin
  -- Unschedule existing jobs with the same names
  for r in select jobid, jobname from cron.job where jobname = any(names)
  loop
    perform cron.unschedule(r.jobid);
  end loop;

  -- Schedule fresh jobs
  perform cron.schedule('ow15-refresh', '*/15 * * * *', $cron$
    SELECT public.refresh_official_wait_15min(now() - interval '1 hour', now());
  $cron$);
  created := created || jsonb_build_object('job','ow15-refresh','status','scheduled');

  perform cron.schedule('ow-hourly-refresh', '5 * * * *', $cron$
    SELECT public.refresh_official_wait_hourly(now() - interval '2 hours', now());
  $cron$);
  created := created || jsonb_build_object('job','ow-hourly-refresh','status','scheduled');

  perform cron.schedule('ow-daily-refresh', '20 0 * * *', $cron$
    SELECT public.refresh_official_wait_daily((now() - interval '7 days')::date, now()::date);
  $cron$);
  created := created || jsonb_build_object('job','ow-daily-refresh','status','scheduled');

  perform cron.schedule('prune-old-data', '0 3 * * *', $cron$
    SELECT public.prune_old_data();
  $cron$);
  created := created || jsonb_build_object('job','prune-old-data','status','scheduled');

  return json_build_object('ok', true, 'jobs', created);
end;
$$;

-- Optional: teardown helper
create or replace function public.teardown_official_wait_cron()
returns json language plpgsql security definer as $$
declare
  names text[] := array['ow15-refresh','ow-hourly-refresh','ow-daily-refresh','prune-old-data'];
  r record;
  removed int := 0;
begin
  for r in select jobid from cron.job where jobname = any(names)
  loop
    perform cron.unschedule(r.jobid);
    removed := removed + 1;
  end loop;
  return json_build_object('ok', true, 'removed', removed);
end;
$$;
