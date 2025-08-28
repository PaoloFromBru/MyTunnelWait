// app/api/cron/gotthard/route.ts
import { NextResponse } from "next/server";
import {
  fetchTrafficSituationsXML,
  parseDatex,
  extractSituations,
  filterForGotthard,
  type SituationLite,
} from "../../../../lib/opentransport/swissDatex";

// Evita qualsiasi caching lato Next
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // Protezione semplice con chiave (imposta CRON_KEY nell'env di produzione)
    const providedKey = url.searchParams.get("key");
    const requiredKey = process.env.CRON_KEY;
    if (requiredKey && providedKey !== requiredKey) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Query params
    const sinceParam = url.searchParams.get("since") || undefined;
    const wantAll = url.searchParams.has("all");

    // Se non passi "since", prendo le ultime 6 ore (UTC)
    const ifModifiedSince =
      sinceParam ??
      new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

    // (facoltativo) log minimale per debuggare i run del cron
    // console.log(`[cron] /api/cron/gotthard since=${ifModifiedSince} at=${new Date().toISOString()}`);

    // 1) Fetch SOAP XML
    const xml = await fetchTrafficSituationsXML({ ifModifiedSince });

    // 2) Parse XML -> JS
    const js = parseDatex(xml);

    // 3) Estrarre situazioni normalizzate
    const { situations, publicationTime } = extractSituations(js);

    // 4) Filtro Gottardo (a meno che non sia richiesto "all")
    const filtered: SituationLite[] = wantAll ? situations : filterForGotthard(situations);

    // 5) Risposta JSON pulita per la UI/cron
    return NextResponse.json(
      {
        publicationTime,          // string ISO, es: "2025-08-28T14:25:40.786413Z"
        count: filtered.length,
        since: ifModifiedSince,   // ISO usata per If-Modified-Since
        items: filtered.map((s) => ({
          id: s.id,
          version: s.version,
          severity: s.severity,       // stringa normalizzata (es. "real")
          comment: s.firstComment,
          roads: s.roadNames,
          location: s.locationSummary,
          // raw: s.raw, // scommenta se vuoi ispezionare lato client
        })),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  } catch (err: any) {
    const msg = (err?.message ?? "Unknown error").slice(0, 8000);
    // console.error("[cron] gotthard error:", msg);
    return NextResponse.json(
      { error: msg },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
