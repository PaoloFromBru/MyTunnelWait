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
