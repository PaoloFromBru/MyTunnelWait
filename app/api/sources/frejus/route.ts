import { NextResponse } from "next/server";

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
      const res = await fetch(url, { cache: 'no-store', headers: { 'user-agent': 'MyTunnelWait/0.1 Next.js' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
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

