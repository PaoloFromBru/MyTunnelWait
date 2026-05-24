# Supabase admin operations

## Official wait rollups (Option 1)
The repository includes SQL helpers and a CLI to keep the `official_wait_*` tables compact while
preserving historical trends. Keeping rollups refreshed requires **both** code and actions inside
your Supabase project:

1. **Deploy the SQL helpers**
   - Open the Supabase SQL editor and run [`supabase/official_rollups_retention.sql`](./official_rollups_retention.sql).
     This file creates the `refresh_official_wait_*` RPC functions plus `prune_old_data`.
   - If you need scheduled jobs, also run [`supabase/cron_setup.sql`](./cron_setup.sql) to install
     `setup_official_wait_cron()`.

2. **Backfill or re-run rollups from your machine**
   - Configure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` locally.
   - Run `npm run rollups:refresh -- --from=2023-01-01 --to=2023-02-01` (adjust the range). The
     script in `scripts/refresh-rollups.mjs` iterates through the requested window, calling the RPC
     functions created in step 1.

3. **(Optional) Schedule ongoing maintenance**
   - Call `select public.setup_official_wait_cron();` inside Supabase to register the pg_cron jobs.
     They will refresh 15-minute/hourly/daily rollups and prune old rows nightly.
   - You can re-run the setup if you edit the SQL files—jobs are recreated idempotently.

Following these steps keeps the operational database under the desired size while surfacing the new
CLI for manual backfills when needed.

## Emergency storage cleanup

If Supabase blocks the project because the database is over quota, run
[`supabase/emergency_storage_cleanup.sql`](./emergency_storage_cleanup.sql) in the Supabase SQL
editor. It reports the largest tables, backfills compact official wait rollups, removes old raw
DATEX/TomTom rows, strips historical JSON payload blobs, and analyzes the affected tables.

If the quota page still shows the old size after deletes, run the `vacuum (full, analyze)` statements
at the bottom of that file one by one. They reclaim physical disk space but take exclusive locks
while each table is processed.

## Storage guardrails

After cleanup, run [`supabase/storage_guardrails.sql`](./storage_guardrails.sql) once in the
Supabase SQL editor. It prevents recurrence by:

- installing triggers that strip `queue_readings.raw_payload`, `queue_readings.raw`, and
  `traffic_situations.raw` on future writes;
- scheduling nightly bounded retention for raw operational tables and extension logs;
- scheduling weekly `vacuum (analyze)` on the two tables that previously accumulated large TOAST;
- exposing `select * from public.database_size_guardrail();` for a quick size/status check.

The app should store normalized wait values and metadata only. Full provider responses are for
temporary debugging, not production persistence.
