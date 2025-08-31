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
  const dir = url.searchParams.get('dir') || undefined;  // 'both' | 'positive' | 'negative' (for heatmap events)
  const tunnel = url.searchParams.get('tunnel') || undefined; // gotthard | monte_bianco | frejus | brenner
  const directionDb = url.searchParams.get('direction') || undefined; // northbound | southbound for wait-mode
  const dirLogicalParam = url.searchParams.get('dir_logical') || undefined; // 'N2S' | 'S2N' | 'E2W' | 'W2E' for list-mode

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
        // heatmap_wait: aggregate median wait by dow/hour using manual_measurements (+ queue_readings if available)
        const sums = new Map<string, { sum: number; n: number }>();

        // Manual measurements
        {
          const { data, error } = await sb.rpc('measure_wait_bins_15min', { p_from: from, p_to: to, p_tunnel: tunnel ?? null, p_direction: directionDb ?? null });
          if (error) throw error;
          for (const r of (data as any[]) || []) {
            const dt = new Date(r.time_bin);
            const brussels = new Date(dt.toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
            const dow = brussels.getDay();
            const hour = brussels.getHours();
            const key = `${dow}:${hour}`;
            const v = Number(r.p50_wait) || 0;
            const cnt = Number(r.n) || 1;
            const cur = sums.get(key) || { sum: 0, n: 0 };
            cur.sum += v * cnt; cur.n += cnt;
            sums.set(key, cur);
          }
        }

        // Queue readings (TomTom) — optional
        {
          const { data, error } = await sb.rpc('queue_wait_bins_15min', { p_from: from, p_to: to, p_tunnel: tunnel ?? null, p_direction: directionDb ?? null });
          if (!error && Array.isArray(data)) {
            for (const r of data as any[]) {
              const dt = new Date(r.time_bin);
              const brussels = new Date(dt.toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
              const dow = brussels.getDay();
              const hour = brussels.getHours();
              const key = `${dow}:${hour}`;
              const v = Number(r.p50_wait) || 0;
              const cnt = Number(r.n) || 1;
              const cur = sums.get(key) || { sum: 0, n: 0 };
              cur.sum += v * cnt; cur.n += cnt;
              sums.set(key, cur);
            }
          }
        }

        const heat = [] as Array<{ dow: number; hour: number; minutes: number }>;
        for (let d = 0; d < 7; d++) {
          for (let h = 0; h < 24; h++) {
            const key = `${d}:${h}`;
            const agg = sums.get(key);
            const minutes = agg && agg.n ? Math.round(agg.sum / agg.n) : 0;
            heat.push({ dow: d, hour: h, minutes });
          }
        }
        return NextResponse.json({ from, to, heatmap: heat });
      }
    }

    // mode === 'list'
    // Use classified view to expose tunnel_id and dir_logical; hide cancelled events
    // Overlap condition: validity_start <= to AND (validity_end >= from OR validity_end IS NULL)
    let q = sb
      .from('traffic_records_classified')
      .select('id, record_type, subtype, is_cancelled, validity_start, validity_end, tunnel_id, dir_logical, length_m, carriageway')
      .lte('validity_start', to)
      .or(`validity_end.gte.${from},validity_end.is.null`)
      .eq('is_cancelled', false)
      .order('validity_end', { ascending: false, nullsFirst: false })
      .order('validity_start', { ascending: false })
      .limit(500);

    if (type) q = q.eq('record_type', type);
    if (tunnel) q = q.eq('tunnel_id', tunnel);
    if (dirLogicalParam) q = q.eq('dir_logical', dirLogicalParam);

    const { data, error } = await q;
    if (error) throw error;

    return NextResponse.json({ from, to, records: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown-error' }, { status: 500 });
  }
}
