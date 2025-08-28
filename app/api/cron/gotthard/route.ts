// app/api/cron/gotthard/route.ts
import { NextResponse } from "next/server";
import {
  fetchTrafficSituationsXML,
  parseDatex,
  extractSituations,
  filterForGotthard,
  type SituationLite,
} from "../../../../lib/opentransport/swissDatex";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function toRecord(s: SituationLite) {
  return {
    id: s.id!,
    version: typeof s.version === "number" ? s.version : Number(s.version ?? 0),
    publication_time: s.raw?.publicationTime ? new Date(s.raw.publicationTime as any).toISOString() : null,
    severity: s.severity ?? null,
    comment: s.firstComment ?? null,
    roads: s.roadNames ?? null,
    location: s.locationSummary ?? null,
    source: "opentransport",
    raw: s.raw,
  };
}

// upsert in chunk per non superare limiti payload
async function upsertSituations(recs: ReturnType<typeof toRecord>[]) {
  const CHUNK = 500;
  let saved = 0;
  for (let i = 0; i < recs.length; i += CHUNK) {
    const slice = recs.slice(i, i + CHUNK);
    const { error, data } = await supabaseAdmin
      .from("traffic_situations")
      .upsert(slice, { onConflict: "id,version", ignoreDuplicates: false })
      .select("id,version");
    if (error) throw error;
    saved += data?.length ?? 0;
  }
  return saved;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  try {
    // protezione cron
    const providedKey = url.searchParams.get("key");
    const requiredKey = process.env.CRON_KEY;
    if (requiredKey && providedKey !== requiredKey) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const sinceParam = url.searchParams.get("since") || undefined;
    const wantAll = url.searchParams.has("all");
    const dryRun = url.searchParams.has("dryRun"); // utile per test: non salva

    const ifModifiedSince =
      sinceParam ??
      new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

    // 1) fetch + parse
    const xml = await fetchTrafficSituationsXML({ ifModifiedSince });
    const js = parseDatex(xml);
    const { situations, publicationTime } = extractSituations(js);

    // 2) filtro
    const filtered: SituationLite[] = wantAll ? situations : filterForGotthard(situations);

    // 3) salva su Supabase (a meno di dryRun)
    let savedCount = 0;
    if (!dryRun && filtered.length) {
      const records = filtered
        .filter((s) => s.id) // robustezza
        .map(toRecord);
      savedCount = await upsertSituations(records);
    }

    // 4) logga il run
    if (!dryRun) {
      await supabaseAdmin.from("traffic_runs").insert({
        since_param: new Date(ifModifiedSince).toISOString(),
        publication_time: publicationTime ? new Date(publicationTime).toISOString() : null,
        fetched_count: situations.length,
        saved_count: savedCount,
        note: wantAll ? "all=1" : null,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        publicationTime,
        since: ifModifiedSince,
        fetched: situations.length,
        saved: savedCount,
        count: filtered.length,
        sample: filtered.slice(0, 3).map((s) => ({
          id: s.id,
          version: s.version,
          severity: s.severity,
          comment: s.firstComment,
          roads: s.roadNames,
          location: s.locationSummary,
        })),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    const msg = (err?.message ?? String(err)).slice(0, 8000);
    // prova a loggare comunque il run fallito
    try {
      await supabaseAdmin.from("traffic_runs").insert({
        note: `ERROR: ${msg}`,
      });
    } catch {}
    // dopo aver calcolato savedCount e inserito traffic_runs
    try {
      await supabaseAdmin.rpc("refresh_heatmap_weekly");
    } catch (e) {
      // non bloccare il cron se fallisce il refresh
      console.warn("refresh_heatmap_weekly failed:", (e as any)?.message);
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
