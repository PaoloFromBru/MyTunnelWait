import { NextResponse } from "next/server";

export const runtime = 'nodejs';
export const revalidate = 0;

async function fetchText(url: string, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; MyTunnelWait/1.0; +https://example.local)',
        'accept-language': 'it-IT,it;q=0.9,fr;q=0.9,en;q=0.8',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'upgrade-insecure-requests': '1',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function extractMinutes(section: string): number | null {
  const m = section.match(/(?:≈\s*)?(\d{1,3})\s*(?:min(?:\.|utes?)?|minuti|')/i);
  return m ? parseInt(m[1], 10) : null;
}

function splitSides(html: string) {
  const text = html
    .replace(/\s+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  const low = text.toLowerCase();

  const kIt = ["italia", "italie", "italy", "entrée italie", "ingresso italia", "porto italia"];
  const kFr = ["francia", "france", "entrée france", "ingresso francia", "portail france", "porte de france"];

  const iIt = kIt.map(k => low.indexOf(k)).filter(i => i >= 0).sort((a,b)=>a-b)[0] ?? -1;
  const iFr = kFr.map(k => low.indexOf(k)).filter(i => i >= 0).sort((a,b)=>a-b)[0] ?? -1;

  let itToFr = "", frToIt = "";
  if (iIt >= 0 && iFr >= 0) {
    if (iIt < iFr) { itToFr = text.slice(iIt, iFr); frToIt = text.slice(iFr); }
    else { frToIt = text.slice(iFr, iIt); itToFr = text.slice(iIt); }
  } else {
    const chunks = text.split(/min(?:\.|utes?)?|minuti/i);
    if (chunks.length >= 3) { itToFr = chunks[0] + "min"; frToIt = chunks[1] + "min"; }
    else { itToFr = text; frToIt = text; }
  }
  return { itToFr, frToIt };
}

export async function GET() {
  const urls = [
    // SFTRF (FR)
    "https://www.sftrf.fr/",
    // SITAF (IT)
    "https://www.sitaf.it/",
  ];

  let lastErr: any = null;
  for (const url of urls) {
    try {
      const html = await fetchText(url);
      const { itToFr, frToIt } = splitSides(html);
      const east = extractMinutes(frToIt);  // Francia -> Italia
      const west = extractMinutes(itToFr);  // Italia  -> Francia
      if (east !== null || west !== null) {
        return NextResponse.json({
          source: url.includes('sftrf') ? 'sftrf.fr' : 'sitaf.it',
          fetchedAt: new Date().toISOString(),
          east,
          west,
        });
      }
    } catch (e) {
      lastErr = e;
    }
  }
  return NextResponse.json({ error: 'Unable to fetch Frejus data', detail: String(lastErr) }, { status: 502 });
}
