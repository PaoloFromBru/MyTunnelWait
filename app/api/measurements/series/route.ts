// app/api/measurements/series/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tunnel = url.searchParams.get('tunnel'); // gotthard | monte_bianco | frejus | brenner
    const dir = url.searchParams.get('direction'); // northbound | southbound
    const days = clamp(parseInt(url.searchParams.get('days') || '7', 10) || 7, 1, 60);

    if (!tunnel || !dir) {
      return NextResponse.json({ error: 'missing tunnel/direction' }, { status: 400 });
    }

    const from = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    const sb = supabaseAdmin();
    let q = sb
      .from('manual_measurements')
      .select('observed_at, wait_minutes, source')
      .eq('tunnel', tunnel)
      .eq('direction', dir)
      .gte('observed_at', from)
      .order('observed_at', { ascending: true })
      .limit(5000);

    const { data, error } = await q;
    if (error) throw error;

    return NextResponse.json({
      from,
      days,
      rows: data ?? [],
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}

