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

  const kN = ["nord", "north", "nördlich", "brenner", "brennero nord"]; // indicative
  const kS = ["sud", "south", "südlich", "modena", "brennero sud"]; // indicative

  const iN = kN.map(k => low.indexOf(k)).filter(i => i >= 0).sort((a,b)=>a-b)[0] ?? -1;
  const iS = kS.map(k => low.indexOf(k)).filter(i => i >= 0).sort((a,b)=>a-b)[0] ?? -1;

  let north = "", south = "";
  if (iN >= 0 && iS >= 0) {
    if (iN < iS) { north = text.slice(iN, iS); south = text.slice(iS); }
    else { south = text.slice(iS, iN); north = text.slice(iN); }
  } else {
    const chunks = text.split(/min(?:\.|utes?)?|minuti/i);
    if (chunks.length >= 3) { north = chunks[0] + 'min'; south = chunks[1] + 'min'; }
    else { north = text; south = text; }
  }
  return { north, south };
}

export async function GET() {
  const urls = [
    // A22 Italia (it)
    "https://www.a22.it/it/traffico",
    // Brenner Autobahn (it)
    "https://www.brennerautobahn.it/",
  ];

  let lastErr: any = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store', headers: { 'user-agent': 'MyTunnelWait/0.1 Next.js' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const { north, south } = splitSides(html);
      const nMin = extractMinutes(north);
      const sMin = extractMinutes(south);
      if (nMin !== null || sMin !== null) {
        return NextResponse.json({
          source: url.includes('a22.it') ? 'a22.it' : 'brennerautobahn.it',
          fetchedAt: new Date().toISOString(),
          north: nMin,
          south: sMin,
        });
      }
    } catch (e) {
      lastErr = e;
    }
  }
  return NextResponse.json({ error: 'Unable to fetch Brennero data', detail: String(lastErr) }, { status: 502 });
}

