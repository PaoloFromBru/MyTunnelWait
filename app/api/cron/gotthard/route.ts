import { NextResponse } from "next/server";
import {
  fetchTrafficSituationsXML,
  parseDatex,
  extractSituations,
  filterForGotthard,
} from "../../../../lib/opentransport/swissDatex";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // Protezione cron (opzionale ma consigliata)
    const cronKey = url.searchParams.get("key");
    const needKey = process.env.CRON_KEY;
    if (needKey && cronKey !== needKey) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const since = url.searchParams.get("since") || undefined;
    const showAll = url.searchParams.has("all");

    const ifModifiedSince =
      since ?? new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

    const xml = await fetchTrafficSituationsXML({ ifModifiedSince });
    const js = parseDatex(xml);
    const { situations, publicationTime } = extractSituations(js);

    const filtered = showAll ? situations : filterForGotthard(situations);

    return NextResponse.json(
      {
        publicationTime,
        count: filtered.length,
        since: ifModifiedSince,
        items: filtered.map((s) => ({
          id: s.id,
          version: s.version,
          severity: s.severity,     // <-- ora è semplice stringa
          comment: s.firstComment,
          roads: s.roadNames,
          location: s.locationSummary,
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
    return NextResponse.json({ error: msg }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
