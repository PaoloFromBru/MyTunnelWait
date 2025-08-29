import { NextResponse } from 'next/server';
import { getHistoryRowsSince } from '@/app/history/data';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // hours: minimo 1, massimo 30 giorni
  const hoursParam = Number(searchParams.get('hours') ?? '24');
  const hours = Number.isFinite(hoursParam)
    ? Math.max(1, Math.min(hoursParam, 24 * 30))
    : 24;

  // source: es. 'official' per forzare solo dati ufficiali
  const onlySource = searchParams.get('source') || undefined;

  // dir: 'N2S' | 'S2N' | default BOTH
  const dirParam = (searchParams.get('dir') || '').toUpperCase();
  const dir = dirParam === 'N2S' || dirParam === 'S2N' ? (dirParam as 'N2S' | 'S2N') : 'BOTH';

  const rows = await getHistoryRowsSince(hours, { onlySource, dir });
  return NextResponse.json({ rows });
}
