-- Storage guardrails for the Supabase free-tier database limit.
--
-- Run this once in the Supabase SQL editor after deploying the app changes
-- that stop writing raw provider payloads. It makes the database resilient if
-- an old function, manual insert, or future code path tries to store bulky
-- JSON/text payloads again.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Strip heavy payload columns at write time ------------------------------
-- These trigger functions are intentionally small and explicit. They keep the
-- useful normalized fields and discard provider response blobs.

create or replace function public.strip_queue_readings_payloads()
returns trigger language plpgsql as $$
begin
  if to_jsonb(new) ? 'raw_payload' then
    new.raw_payload := null;
  end if;

  if to_jsonb(new) ? 'raw' then
    new.raw := null;
  end if;

  return new;
end;
$$;

create or replace function public.strip_traffic_situations_payloads()
returns trigger language plpgsql as $$
begin
  if to_jsonb(new) ? 'raw' then
    new.raw := null;
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.queue_readings') is not null
     and (
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'queue_readings' and column_name = 'raw_payload'
       )
       or exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'queue_readings' and column_name = 'raw'
       )
     ) then
    drop trigger if exists strip_queue_readings_payloads_before_write on public.queue_readings;
    create trigger strip_queue_readings_payloads_before_write
      before insert or update on public.queue_readings
      for each row
      execute function public.strip_queue_readings_payloads();
  end if;

  if to_regclass('public.traffic_situations') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'traffic_situations' and column_name = 'raw'
     ) then
    drop trigger if exists strip_traffic_situations_payloads_before_write on public.traffic_situations;
    create trigger strip_traffic_situations_payloads_before_write
      before insert or update on public.traffic_situations
      for each row
      execute function public.strip_traffic_situations_payloads();
  end if;
end $$;

-- 2) Bounded retention ------------------------------------------------------
-- This function is safe to run repeatedly. It avoids manual_measurements.

create or replace function public.prune_storage_guardrails()
returns void language plpgsql as $$
begin
  if to_regclass('public.queue_readings') is not null then
    delete from public.queue_readings
    where observed_at < now() - interval '60 days';
  end if;

  if to_regclass('public.traffic_records') is not null then
    delete from public.traffic_records
    where validity_start < now() - interval '14 days';
  end if;

  if to_regclass('public.traffic_runs') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'traffic_runs' and column_name = 'created_at'
    ) then
      execute 'delete from public.traffic_runs where created_at < now() - interval ''30 days''';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'traffic_runs' and column_name = 'publication_time'
    ) then
      execute 'delete from public.traffic_runs where publication_time < now() - interval ''30 days''';
    end if;
  end if;

  if to_regclass('cron.job_run_details') is not null then
    delete from cron.job_run_details
    where start_time < now() - interval '7 days';
  end if;

  if to_regclass('net._http_response') is not null then
    delete from net._http_response
    where created < now() - interval '1 day';
  end if;
end;
$$;

-- 3) Size monitoring --------------------------------------------------------

create or replace function public.database_size_guardrail()
returns table(
  database_size text,
  database_bytes bigint,
  status text
) language sql stable as $$
  select
    pg_size_pretty(pg_database_size(current_database())),
    pg_database_size(current_database()),
    case
      when pg_database_size(current_database()) >= 1000 * 1024 * 1024 then 'danger'
      when pg_database_size(current_database()) >= 800 * 1024 * 1024 then 'warning'
      else 'ok'
    end;
$$;

-- Alert configuration. Set webhook_url after running this file, for example:
--
-- update public.storage_alert_config
-- set webhook_url = 'https://hooks.slack.com/services/...',
--     enabled = true
-- where id = 1;
--
-- Any HTTPS endpoint that accepts a JSON POST works. The alert payload is:
-- {
--   "content": "MyTunnelWait DB size alert: ...",
--   "embeds": [{ "title": "Database size warning", ... }]
-- }
create table if not exists public.storage_alert_config (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  webhook_url text,
  threshold_bytes bigint not null default 350 * 1024 * 1024,
  cooldown_hours integer not null default 24,
  last_alert_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.storage_alert_config enable row level security;
revoke all on public.storage_alert_config from anon, authenticated;

insert into public.storage_alert_config(id)
values (1)
on conflict (id) do nothing;

create or replace function public.check_database_size_alert()
returns table(
  database_size text,
  database_bytes bigint,
  threshold_size text,
  alert_sent boolean,
  reason text
) language plpgsql
security definer
set search_path = public, net, pg_catalog
as $$
declare
  cfg public.storage_alert_config%rowtype;
  db_bytes bigint;
  req_id bigint;
begin
  select * into cfg
  from public.storage_alert_config
  where id = 1;

  db_bytes := pg_database_size(current_database());

  database_size := pg_size_pretty(db_bytes);
  database_bytes := db_bytes;
  threshold_size := pg_size_pretty(cfg.threshold_bytes);
  alert_sent := false;

  if not cfg.enabled then
    reason := 'disabled';
    return next;
    return;
  end if;

  if coalesce(cfg.webhook_url, '') = '' then
    reason := 'missing_webhook_url';
    return next;
    return;
  end if;

  if db_bytes < cfg.threshold_bytes then
    reason := 'below_threshold';
    return next;
    return;
  end if;

  if cfg.last_alert_at is not null
     and cfg.last_alert_at > now() - make_interval(hours => cfg.cooldown_hours) then
    reason := 'cooldown';
    return next;
    return;
  end if;

  select net.http_post(
    url := cfg.webhook_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'content',
        format(
          'MyTunnelWait DB size alert: %s is above the %s threshold.',
          pg_size_pretty(db_bytes),
          pg_size_pretty(cfg.threshold_bytes)
        ),
      'embeds',
        jsonb_build_array(
          jsonb_build_object(
            'title', 'Database size warning',
            'color', case
              when db_bytes >= 1000 * 1024 * 1024 then 15158332
              else 16776960
            end,
            'fields', jsonb_build_array(
              jsonb_build_object('name', 'Database', 'value', current_database(), 'inline', true),
              jsonb_build_object('name', 'Current size', 'value', pg_size_pretty(db_bytes), 'inline', true),
              jsonb_build_object('name', 'Threshold', 'value', pg_size_pretty(cfg.threshold_bytes), 'inline', true),
              jsonb_build_object('name', 'Bytes', 'value', db_bytes::text, 'inline', true)
            ),
            'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          )
        )
    )
  ) into req_id;

  update public.storage_alert_config
  set last_alert_at = now(),
      updated_at = now()
  where id = 1;

  alert_sent := true;
  reason := 'sent';
  return next;
end;
$$;

revoke all on function public.check_database_size_alert() from public, anon, authenticated;

-- 4) Scheduled maintenance --------------------------------------------------
-- Idempotently recreate only the jobs managed by this file.

do $$
declare
  job_id bigint;
begin
  for job_id in
    select jobid
    from cron.job
    where jobname in (
      'storage-guardrails-prune',
      'storage-guardrails-vacuum-queue',
      'storage-guardrails-vacuum-situations',
      'storage-guardrails-size-alert'
    )
  loop
    perform cron.unschedule(job_id);
  end loop;
end $$;

select cron.schedule(
  'storage-guardrails-prune',
  '15 3 * * *',
  $$select public.prune_storage_guardrails();$$
);

-- These are intentionally weekly. They keep TOAST from accumulating after
-- accidental large payload writes, without doing expensive maintenance daily.
select cron.schedule(
  'storage-guardrails-vacuum-queue',
  '30 4 * * 0',
  $$vacuum (analyze) public.queue_readings;$$
);

select cron.schedule(
  'storage-guardrails-vacuum-situations',
  '45 4 * * 0',
  $$vacuum (analyze) public.traffic_situations;$$
);

select cron.schedule(
  'storage-guardrails-size-alert',
  '0 * * * *',
  $$select public.check_database_size_alert();$$
);

select * from public.database_size_guardrail();
select * from public.check_database_size_alert();
