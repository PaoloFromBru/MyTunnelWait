import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function parseRange(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const days = url.searchParams.get('days');
  const now = new Date();

  if (from && to) {
    return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  }
  const d = days ? parseInt(days, 10) : 7;
  const fromDate = new Date(now.getTime() - d * 24 * 3600 * 1000);
  return { from: fromDate.toISOString(), to: now.toISOString() };
}

export async function GET(req: NextRequest) {
  const { from, to } = parseRange(req);
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') || 'list'; // 'list' | 'heatmap'
  const type = url.searchParams.get('type') || undefined; // es. 'AbnormalTraffic'
  const dir = url.searchParams.get('dir') || undefined;  // 'both' | 'positive' | 'negative'
  const tunnel = url.searchParams.get('tunnel') || undefined; // gotthard | monte_bianco | frejus | brenner
  const directionDb = url.searchParams.get('direction') || undefined; // northbound | southbound for wait-mode

  try {
    const sb = supabaseAdmin();

    if (mode === 'heatmap' || mode === 'heatmap_wait') {
      if (mode === 'heatmap') {
        const { data, error } = await sb.rpc('traffic_bins_15min', { p_from: from, p_to: to });
        if (error) throw error;
        const buckets = new Map<string, number>();
        for (const r of (data as any[]) || []) {
          if (type && r.record_type !== type) continue;
          if (dir && r.direction !== dir) continue;
          const dt = new Date(r.time_bin);
          const brussels = new Date(dt.toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
          const dow = brussels.getDay();
          const hour = brussels.getHours();
          const key = `${dow}:${hour}`;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
        const heat = [] as Array<{ dow: number; hour: number; count: number }>;
        for (let d = 0; d < 7; d++) {
          for (let h = 0; h < 24; h++) {
            const key = `${d}:${h}`;
            heat.push({ dow: d, hour: h, count: buckets.get(key) ?? 0 });
          }
        }
        return NextResponse.json({ from, to, heatmap: heat });
      } else {
        // heatmap_wait: aggregate official wait p50 by dow/hour (average across days)
        const { data, error } = await sb.rpc('official_wait_bins_15min', { p_from: from, p_to: to });
        if (error) throw error;
        const sums = new Map<string, { sum: number; n: number }>();
        // map directionDb to dir_logical per tunnel axis
        const axis: Record<string, 'NS' | 'EW'> = { gotthard: 'NS', brenner: 'NS', monte_bianco: 'EW', frejus: 'EW' };
        const dirLogical = (tunnel && directionDb)
          ? (axis[tunnel] === 'NS' ? (directionDb === 'northbound' ? 'S2N' : 'N2S') : (directionDb === 'northbound' ? 'E2W' : 'W2E'))
          : undefined;
        for (const r of (data as any[]) || []) {
          if (tunnel && r.tunnel !== tunnel) continue;
          if (dirLogical && r.dir !== dirLogical) continue;
          const dt = new Date(r.time_bin);
          const brussels = new Date(dt.toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
          const dow = brussels.getDay();
          const hour = brussels.getHours();
          const key = `${dow}:${hour}`;
          const v = Number(r.p50_wait) || 0;
          const cur = sums.get(key) || { sum: 0, n: 0 };
          cur.sum += v; cur.n += 1;
          sums.set(key, cur);
        }
        const heat = [] as Array<{ dow: number; hour: number; minutes: number }>;
        for (let d = 0; d < 7; d++) {
          for (let h = 0; h < 24; h++) {
            const key = `${d}:${h}`;
            const agg = sums.get(key);
            const minutes = agg ? Math.round(agg.sum / agg.n) : 0;
            heat.push({ dow: d, hour: h, minutes });
          }
        }
        return NextResponse.json({ from, to, heatmap: heat });
      }
    }

    // mode === 'list'
    let q = sb
      .from('traffic_records_enriched')
      .select('*')
      .gte('validity_start', from)
      .lte('validity_start', to)
      .order('validity_start', { ascending: false })
      .limit(500);

    if (type) q = q.eq('record_type', type);
    if (dir) q = q.eq('direction', dir);

    const { data, error } = await q;
    if (error) throw error;

    return NextResponse.json({ from, to, records: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown-error' }, { status: 500 });
  }
}
