-- Schedule Edge Function calls via pg_cron + pg_net
-- This lets you trigger an Edge Function every N minutes even se la UI "Schedules" non è disponibile.

-- Requisiti: estensioni pg_cron e pg_net abilitate
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Crea/ricrea il job che chiama l'Edge "cron-gotthard" ogni 15 minuti
create or replace function public.setup_edge_cron_gotthard(p_url text, p_cron_key text default null)
returns json language plpgsql security definer as $$
declare
  v_jobname text := 'edge-gotthard-15m';
  v_sql     text;
  r         record;
begin
  -- Unschedule existing with the same name
  for r in select jobid from cron.job where cron.job.jobname = v_jobname loop
    perform cron.unschedule(r.jobid);
  end loop;

  -- Build SQL to call the Edge Function with optional header
  if coalesce(p_cron_key, '') <> '' then
    v_sql := format('select net.http_get(url := %L, headers := jsonb_build_object(''X-CRON-KEY'', %L));', p_url, p_cron_key);
  else
    v_sql := format('select net.http_get(url := %L);', p_url);
  end if;

  -- Schedule every 15 minutes
  perform cron.schedule(v_jobname, '*/15 * * * *', v_sql);

  return json_build_object('ok', true, 'job', v_jobname, 'url', p_url);
end;
$$;

-- Schedule TomTom aggregator (all tunnels) every 15 minutes
create or replace function public.setup_edge_cron_tomtom_with_url(p_url text, p_cron_key text)
returns json language plpgsql security definer as $$
declare
  v_jobname text := 'edge-tomtom-15m';
  v_sql     text;
  v_url     text;
  r         record;
begin
  for r in select jobid from cron.job where cron.job.jobname = v_jobname loop
    perform cron.unschedule(r.jobid);
  end loop;

  v_url := p_url || case when position('?' in p_url) > 0 then '&' else '?' end || 'key=' || p_cron_key;
  v_sql := format('select net.http_get(url := %L);', v_url);
  perform cron.schedule(v_jobname, '*/15 * * * *', v_sql);
  return json_build_object('ok', true, 'job', v_jobname, 'url', v_url);
end;
$$;

create or replace function public.teardown_edge_cron_tomtom()
returns json language plpgsql security definer as $$
declare
  v_jobname text := 'edge-tomtom-15m';
  removed int := 0;
  r record;
begin
  for r in select jobid from cron.job where cron.job.jobname = v_jobname loop
    perform cron.unschedule(r.jobid);
    removed := removed + 1;
  end loop;
  return json_build_object('ok', true, 'removed', removed);
end;
$$;

-- Variante: usa query param ?key= invece delle headers (compatibilità)
create or replace function public.setup_edge_cron_gotthard_with_url(p_url text, p_cron_key text)
returns json language plpgsql security definer as $$
declare
  v_jobname text := 'edge-gotthard-15m';
  v_sql     text;
  v_url     text;
  r         record;
begin
  for r in select jobid from cron.job where cron.job.jobname = v_jobname loop
    perform cron.unschedule(r.jobid);
  end loop;

  v_url := p_url || case when position('?' in p_url) > 0 then '&' else '?' end || 'key=' || p_cron_key;
  v_sql := format('select net.http_get(url := %L);', v_url);
  perform cron.schedule(v_jobname, '*/15 * * * *', v_sql);
  return json_build_object('ok', true, 'job', v_jobname, 'url', v_url);
end;
$$;

-- Rimuove il job edge-gotthard-15m
create or replace function public.teardown_edge_cron_gotthard()
returns json language plpgsql security definer as $$
declare
  v_jobname text := 'edge-gotthard-15m';
  removed int := 0;
  r record;
begin
  for r in select jobid from cron.job where cron.job.jobname = v_jobname loop
    perform cron.unschedule(r.jobid);
    removed := removed + 1;
  end loop;
  return json_build_object('ok', true, 'removed', removed);
end;
$$;

-- Variante: headers completi (Authorization Bearer + X-CRON-KEY)
create or replace function public.setup_edge_cron_gotthard_with_headers(p_url text, p_anon text, p_cron_key text default null)
returns json language plpgsql security definer as $$
declare
  v_jobname text := 'edge-gotthard-15m';
  v_sql     text;
  v_headers jsonb;
  r         record;
begin
  for r in select jobid from cron.job where cron.job.jobname = v_jobname loop
    perform cron.unschedule(r.jobid);
  end loop;

  v_headers := jsonb_build_object('Authorization', 'Bearer ' || p_anon);
  if coalesce(p_cron_key,'') <> '' then
    v_headers := v_headers || jsonb_build_object('X-CRON-KEY', p_cron_key);
  end if;

  v_sql := format('select net.http_get(url := %L, headers := %L::jsonb);', p_url, v_headers::text);
  perform cron.schedule(v_jobname, '*/15 * * * *', v_sql);
  return json_build_object('ok', true, 'job', v_jobname, 'url', p_url, 'headers', v_headers);
end;
$$;
