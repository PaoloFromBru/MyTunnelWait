create type tunnel_id as enum ('gotthard', 'monte_bianco');
create type traffic_direction as enum ('northbound', 'southbound');
create type measurement_source as enum ('manual', 'sensor', 'api');

create table if not exists public.manual_measurements (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  observed_at       timestamptz not null default now(),

  tunnel            tunnel_id not null,
  direction         traffic_direction not null,

  wait_minutes      integer not null check (wait_minutes >= 0 and wait_minutes <= 720),
  lanes_open        smallint check (lanes_open >= 0 and lanes_open <= 8),

  note              text,
  lat               double precision,
  lon               double precision,

  -- opzionale: collega l’utente se autenticato
  reporter_id       uuid references auth.users(id) on delete set null,

  -- tracciabilità di base
  client_ip         inet,
  user_agent        text,

  source            measurement_source not null default 'manual'
);

comment on table public.manual_measurements is 'Manual tunnel wait measurements submitted by users';
comment on column public.manual_measurements.observed_at is 'Time the queue was observed (not just when submitted)';

-- Indici utili
create index if not exists idx_manual_measurements_tunnel_obs
  on public.manual_measurements (tunnel, observed_at desc);
create index if not exists idx_manual_measurements_dir_obs
  on public.manual_measurements (direction, observed_at desc);

-- Abilita RLS
alter table public.manual_measurements enable row level security;

-- POLITICHE:
-- 1) Lettura pubblica (se vuoi far vedere subito i dati aggregati/cronologia)
create policy "Public can read manual measurements"
  on public.manual_measurements for select
  using (true);

-- 2) Inserimento: SOLO tramite il backend (service role) -> nessuna policy insert per i client
--    (così non esponi l'anon key a scritture dirette)
--    Se un domani vuoi permettere insert da utenti loggati direttamente dal client:
--    create policy "Authenticated can insert their own measurements"
--      on public.manual_measurements for insert
--      with check (auth.uid() = reporter_id);
