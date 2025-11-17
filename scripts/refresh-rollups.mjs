#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=", 2);
    opts[key] = value ?? "true";
  }
  return opts;
}

function parseDate(value, fallback) {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) fail(`Invalid date: ${value}`);
  return d;
}

const args = parseArgs(process.argv.slice(2));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required");

const supabase = createClient(url, key, { auth: { persistSession: false } });

const now = new Date();
const defaultDays = Number(args.days || 7);
const defaultFrom = new Date(now.getTime() - (Number.isFinite(defaultDays) ? defaultDays : 7) * 24 * 3600 * 1000);
const from = parseDate(args.from, defaultFrom);
const to = parseDate(args.to, now);
if (from >= to) fail("'from' must be before 'to'");

const parsedChunk = Number(args.chunkHours || args["chunk-hours"] || 24);
const chunkHours = Number.isFinite(parsedChunk) && parsedChunk > 0 ? parsedChunk : 24;

function iso(d) { return d.toISOString(); }
function ymd(d) { return d.toISOString().slice(0, 10); }

async function refresh15min(rangeStart, rangeEnd) {
  console.log(`→ 15-min rollup ${iso(rangeStart)} → ${iso(rangeEnd)}`);
  const { error } = await supabase.rpc("refresh_official_wait_15min", { p_from: iso(rangeStart), p_to: iso(rangeEnd) });
  if (error) throw new Error(`15-min refresh failed: ${error.message}`);
}

async function refreshHourly(rangeStart, rangeEnd) {
  console.log(`→ hourly rollup ${iso(rangeStart)} → ${iso(rangeEnd)}`);
  const { error } = await supabase.rpc("refresh_official_wait_hourly", { p_from: iso(rangeStart), p_to: iso(rangeEnd) });
  if (error) throw new Error(`Hourly refresh failed: ${error.message}`);
}

async function refreshDaily(rangeStart, rangeEnd) {
  console.log(`→ daily rollup ${ymd(rangeStart)} → ${ymd(rangeEnd)}`);
  const { error } = await supabase.rpc("refresh_official_wait_daily", { p_from: ymd(rangeStart), p_to: ymd(rangeEnd) });
  if (error) throw new Error(`Daily refresh failed: ${error.message}`);
}

(async () => {
  try {
    console.log(`Refreshing rollups from ${iso(from)} to ${iso(to)} (chunk ${chunkHours}h)`);
    let cursor = new Date(from);
    while (cursor < to) {
      const next = new Date(Math.min(cursor.getTime() + chunkHours * 3600 * 1000, to.getTime()));
      await refresh15min(cursor, next);
      cursor = next;
    }

    await refreshHourly(from, to);
    await refreshDaily(from, to);

    console.log("Done.");
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
})();
