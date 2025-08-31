import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_KEY = Deno.env.get("CRON_KEY") ?? ""; // optional protection

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function extractMinutes(section: string): number | null {
  const m = section.match(/(\d+)\s*min/i);
  return m ? parseInt(m[1], 10) : null;
}

function splitSides(html: string) {
  const text = html
    .replace(/\s+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();

  const low = text.toLowerCase();
  const iNorth = low.indexOf("côté nord") >= 0 ? low.indexOf("côté nord") : low.indexOf("north portal");
  const iSouth = low.indexOf("côté sud") >= 0 ? low.indexOf("côté sud") : low.indexOf("south portal");

  let north = "";
  let south = "";
  if (iNorth >= 0 && iSouth >= 0) {
    if (iNorth < iSouth) { north = text.slice(iNorth, iSouth); south = text.slice(iSouth); }
    else { south = text.slice(iSouth, iNorth); north = text.slice(iNorth); }
  } else {
    const mins = text.split(/min/i);
    if (mins.length >= 3) { north = mins[0] + "min"; south = mins[1] + "min"; }
    else { north = text; south = text; }
  }
  return { north, south };
}

async function fetchGotthard() {
  const urls = [
    "https://www.gotthard-traffic.ch/?lan=en",
    "https://www.gotthard-traffic.ch/?lan=fr",
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: {
          "user-agent": "MyTunnelWait-cron/1.0 (supabase edge)",
          "accept-language": "it,en;q=0.8,fr;q=0.7",
        },
        cache: "no-store",
      });
      if (!r.ok) continue;
      const html = await r.text();
      const { north, south } = splitSides(html);
      const n = extractMinutes(north);
      const s = extractMinutes(south);
      if (n !== null || s !== null) return { north: n, south: s };
    } catch {}
  }
  return { north: null as number | null, south: null as number | null };
}

Deno.serve(async (req: Request) => {
  // Optional simple protection for manual trigger
  const key = new URL(req.url).searchParams.get("key") || req.headers.get("x-cron-key");
  if (CRON_KEY && key !== CRON_KEY) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    const { north, south } = await fetchGotthard();
    if (north === null && south === null) return json({ ok: true, note: "no-data" });

    const nowIso = new Date().toISOString();
    const rows: any[] = [];
    // Mapping: N portal -> S direction => southbound
    if (typeof north === 'number') {
      rows.push({ tunnel: 'gotthard', direction: 'southbound', wait_minutes: north, observed_at: nowIso, note: 'gotthard-traffic' });
    }
    if (typeof south === 'number') {
      rows.push({ tunnel: 'gotthard', direction: 'northbound', wait_minutes: south, observed_at: nowIso, note: 'gotthard-traffic' });
    }

    const { data, error } = await sb.from('manual_measurements')
      .insert(rows)
      .select('id, observed_at');
    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, inserted: data?.length ?? 0, rows: data });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

