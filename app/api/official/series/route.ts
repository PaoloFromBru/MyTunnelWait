// app/api/official/series/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const AXIS: Record<string, 'NS' | 'EW'> = {
  gotthard: 'NS',
  brenner: 'NS',
  monte_bianco: 'EW',
  frejus: 'EW',
};

function toDirLogical(tunnel: string, dirDb: 'northbound' | 'southbound'): 'N2S' | 'S2N' | 'E2W' | 'W2E' {
  const axis = AXIS[tunnel] || 'NS';
  if (axis === 'NS') return dirDb === 'northbound' ? 'S2N' : 'N2S';
  return dirDb === 'northbound' ? 'E2W' : 'W2E';
}

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tunnel = url.searchParams.get('tunnel'); // DB enum
    const dir = url.searchParams.get('direction'); // 'northbound' | 'southbound'
    const days = clamp(parseInt(url.searchParams.get('days') || '7', 10) || 7, 1, 60);

    if (!tunnel || !dir) return NextResponse.json({ error: 'missing tunnel/direction' }, { status: 400 });

    const from = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const to = new Date().toISOString();
    const dirLogical = toDirLogical(tunnel, dir as any);

    const sb = supabaseAdmin();
    const { data, error } = await sb.rpc('official_wait_bins_15min', { p_from: from, p_to: to });
    if (error) throw error;

    const rows = ((data as any[]) || [])
      .filter(r => r.tunnel === tunnel && r.dir === dirLogical)
      .map(r => ({ observed_at: r.time_bin as string, wait_minutes: Number(r.p50_wait) || 0, source: 'official' }));

    return NextResponse.json({ from, days, rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}

