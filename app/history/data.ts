// Funzioni server-side per leggere la history da Supabase (dati ufficiali)
import type { PostgrestSingleResponse } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type Row = {
  observed_at: string;                 // ISO string
  direction: 'N2S' | 'S2N';
  source: string;                      // 'official' | 'tomtom' | 'manual' | ...
  wait_minutes: number;
};

type RawObs = {
  observed_at?: string | null;
  created_at?: string | null;
  dir?: string | null;                 // 'N2S' | 'S2N'
  wait_min?: number | null;
  source?: string | null;
};

function normalize(r: RawObs): Row | null {
  const observed_at = r.observed_at ?? r.created_at ?? null;
  const dir = (r.dir ?? '').toUpperCase();
  const wait = r.wait_min ?? null;
  const source = r.source ?? 'unknown';

  if (!observed_at || !dir || wait == null) return null;
  const direction = dir === 'S2N' ? 'S2N' : 'N2S'; // default safe

  return {
    observed_at,
    direction,
    source,
    wait_minutes: Math.max(0, Math.round(wait)),
  };
}

/**
 * Osservazioni nelle ultime `hours` ore.
 * Opzioni:
 *  - onlySource: filtra la fonte (es. 'official')
 *  - dir: limita alla direzione indicata ('N2S' | 'S2N' | 'BOTH')
 */
export async function getHistoryRowsSince(
  hours: number,
  opts?: { onlySource?: string; dir?: 'N2S' | 'S2N' | 'BOTH' }
): Promise<Row[]> {
  const sinceIso = new Date(Date.now() - hours * 3600_000).toISOString();
  const sb = supabaseAdmin;

  let q = sb
    .from('wait_observations')
    .select('observed_at, created_at, dir, wait_min, source')
    .gte('observed_at', sinceIso)
    .order('observed_at', { ascending: true });

  if (opts?.onlySource) q = q.eq('source', opts.onlySource);
  if (opts?.dir && opts.dir !== 'BOTH') q = q.eq('dir', opts.dir);

  const { data, error }: PostgrestSingleResponse<RawObs[]> = await q;
  if (error) throw error;

  return (data ?? [])
    .map(normalize)
    .filter((x): x is Row => !!x);
}

/**
 * Ultime N righe — utile per la tabella “Ultime letture”.
 */
export async function getLatest(
  limit = 50,
  onlySource?: string
): Promise<Row[]> {
  const sb = supabaseAdmin;

  let q = sb
    .from('wait_observations')
    .select('observed_at, created_at, dir, wait_min, source')
    .order('observed_at', { ascending: false })
    .limit(limit);

  if (onlySource) q = q.eq('source', onlySource);

  const { data, error }: PostgrestSingleResponse<RawObs[]> = await q;
  if (error) throw error;

  return (data ?? [])
    .map(normalize)
    .filter((x): x is Row => !!x)
    .sort((a, b) => a.observed_at.localeCompare(b.observed_at));
}
