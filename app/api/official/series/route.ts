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

    let rows: Array<{ observed_at: string; wait_minutes: number; source: string }> = [];
    if (days <= 7) {
      // 15-min resolution
      const { data, error } = await sb
        .from('official_wait_15min')
        .select('time_bin,tunnel,dir,p50_wait')
        .eq('tunnel', tunnel)
        .eq('dir', dirLogical)
        .gte('time_bin', from)
        .lte('time_bin', to)
        .order('time_bin', { ascending: true });
      if (error) throw error;
      rows = (data || []).map((r: any) => ({ observed_at: r.time_bin, wait_minutes: Number(r.p50_wait) || 0, source: 'official' }));
    } else if (days <= 90) {
      // hourly resolution
      const { data, error } = await sb
        .from('official_wait_hourly')
        .select('hour,tunnel,dir,p50_wait')
        .eq('tunnel', tunnel)
        .eq('dir', dirLogical)
        .gte('hour', from)
        .lte('hour', to)
        .order('hour', { ascending: true });
      if (error) throw error;
      rows = (data || []).map((r: any) => ({ observed_at: r.hour, wait_minutes: Number(r.p50_wait) || 0, source: 'official' }));
    } else {
      // daily resolution
      const { data, error } = await sb
        .from('official_wait_daily')
        .select('day,tunnel,dir,p50_wait')
        .eq('tunnel', tunnel)
        .eq('dir', dirLogical)
        .gte('day', from.slice(0, 10))
        .lte('day', new Date().toISOString().slice(0, 10))
        .order('day', { ascending: true });
      if (error) throw error;
      rows = (data || []).map((r: any) => ({
        observed_at: new Date(r.day + 'T00:00:00Z').toISOString(),
        wait_minutes: Number(r.p50_wait) || 0,
        source: 'official',
      }));
    }

    return NextResponse.json({ from, days, rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}
