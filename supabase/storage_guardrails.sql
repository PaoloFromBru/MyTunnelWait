-- Storage guardrails for the Supabase free-tier database limit.
--
-- Run this once in the Supabase SQL editor after deploying the app changes
-- that stop writing raw provider payloads. It makes the database resilient if
-- an old function, manual insert, or future code path tries to store bulky
-- JSON/text payloads again.

create extension if not exists pg_cron;

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
      'storage-guardrails-vacuum-situations'
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

select * from public.database_size_guardrail();
