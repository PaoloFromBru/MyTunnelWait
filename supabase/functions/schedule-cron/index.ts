import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SETUP_KEY = Deno.env.get("CRON_SETUP_KEY") ?? ""; // protezione endpoint

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function json(data: Json, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Setup-Key",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
  });
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") return json({ ok: true });

  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "Missing Supabase env" }, 500);
  if (!SETUP_KEY) return json({ ok: false, error: "Missing CRON_SETUP_KEY env" }, 500);

  const providedKey = req.headers.get("x-setup-key") || req.headers.get("X-Setup-Key");
  if (providedKey !== SETUP_KEY) return json({ ok: false, error: "Unauthorized" }, 401);

  try {
    const url = new URL(req.url);
    const action = (url.searchParams.get("action") || "setup").toLowerCase();

    if (action === "setup") {
      const { data, error } = await supabase.rpc("setup_official_wait_cron");
      if (error) return json({ ok: false, action, error: error.message }, 500);
      return json({ ok: true, action, data });
    }

    if (action === "teardown") {
      const { data, error } = await supabase.rpc("teardown_official_wait_cron");
      if (error) return json({ ok: false, action, error: error.message }, 500);
      return json({ ok: true, action, data });
    }

    return json({ ok: false, error: "Invalid action. Use ?action=setup|teardown" }, 400);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

