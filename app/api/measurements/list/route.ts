// app/api/measurements/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "200", 10), 1000));
    const sourceParam = (url.searchParams.get("source") || "manual").toLowerCase();
    const includeManual = sourceParam === "manual" || sourceParam === "all";
    const includeAuto = sourceParam === "auto" || sourceParam === "all";

    const sb = supabaseAdmin();
    const rows: any[] = [];

    if (includeManual) {
      const { data, error } = await sb
        .from("manual_measurements")
        .select("id, observed_at, tunnel, direction, wait_minutes, note, source")
        .order("observed_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      if (data) rows.push(...data);
    }

    if (includeAuto) {
      const { data, error } = await sb
        .from("queue_readings")
        .select("id, observed_at, direction, wait_minutes, source, location")
        .order("observed_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const mapTunnel = (loc?: string | null): string | null => {
        const s = (loc || "").toLowerCase();
        if (s.includes("gott")) return "gotthard";
        if (s.includes("mont") || s.includes("blanc")) return "monte_bianco";
        if (s.includes("frejus") || s.includes("fréjus")) return "frejus";
        if (s.includes("brenner") || s.includes("brennero")) return "brenner";
        return null;
      };
      const axis: Record<string, 'NS'|'EW'> = { gotthard:'NS', brenner:'NS', monte_bianco:'EW', frejus:'EW' };
      const mapDir = (tunnel: string, raw: string): string | null => {
        const ax = axis[tunnel];
        if (!ax) return null;
        if (ax === 'NS') return raw === 'N2S' ? 'southbound' : raw === 'S2N' ? 'northbound' : null;
        return raw === 'E2W' ? 'northbound' : raw === 'W2E' ? 'southbound' : null;
      };
      if (data) {
        for (const r of data) {
          const t = mapTunnel(r.location);
          if (!t) continue;
          const d = mapDir(t, r.direction);
          if (!d) continue;
          rows.push({
            id: r.id,
            observed_at: r.observed_at,
            tunnel: t,
            direction: d,
            wait_minutes: r.wait_minutes,
            note: r.location || null,
            source: r.source || 'tomtom',
          });
        }
      }
    }

    // sort combined and apply overall limit
    rows.sort((a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime());
    const out = rows.slice(0, limit);
    return NextResponse.json({ rows: out }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown" }, { status: 500 });
  }
}
