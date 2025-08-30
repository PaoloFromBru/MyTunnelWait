// app/api/measurements/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "200", 10), 1000));

    const sb = supabaseAdmin();
    const q = sb
      .from("manual_measurements")
      .select("id, observed_at, tunnel, direction, wait_minutes, note, source")
      .order("observed_at", { ascending: false })
      .limit(limit);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ rows: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown" }, { status: 500 });
  }
}

