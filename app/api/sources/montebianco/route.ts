import { NextResponse } from "next/server";

/**
 * Estrae un numero di minuti dall'intorno testo.
 * Accetta: "35 min", "35 minutes", "35 minuti", "35' ", "≈ 35 min."
 */
function extractMinutes(section: string): number | null {
  const m = section.match(/(?:≈\s*)?(\d{1,3})\s*(?:min(?:\.|utes?)?|minuti|')/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Dato l'HTML in input, produce due stringhe "blocchi" per i due sensi:
 *  - itToFr: Entrata Italia → Francia (ovest, "W")
 *  - frToIt: Entrata Francia → Italia (est, "E")
 * Funziona con keyword in IT/FR/EN.
 */
function splitSides(html: string) {
  const text = html
    .replace(/\s+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();

  const low = text.toLowerCase();

  // keyword tipiche
  const kIt = ["italia", "italie", "italy", "entrée italie", "ingresso italia", "porto italia"];
  const kFr = ["francia", "france", "entrée france", "ingresso francia", "portail france", "porte de france"];

  // trova primo indice di un qualsiasi match per ciascun lato
  const iIt = kIt.map(k => low.indexOf(k)).filter(i => i >= 0).sort((a,b)=>a-b)[0] ?? -1;
  const iFr = kFr.map(k => low.indexOf(k)).filter(i => i >= 0).sort((a,b)=>a-b)[0] ?? -1;

  let itToFr = "", frToIt = "";

  if (iIt >= 0 && iFr >= 0) {
    if (iIt < iFr) {
      // [Italia ... ) [Francia ... end]
      itToFr = text.slice(iIt, iFr);
      frToIt = text.slice(iFr);
    } else {
      frToIt = text.slice(iFr, iIt);
      itToFr = text.slice(iIt);
    }
  } else {
    // fallback grezzo: spezza sul primo/secondo "min"
    const chunks = text.split(/min(?:\.|utes?)?|minuti/i);
    if (chunks.length >= 3) {
      itToFr = chunks[0] + "min";
      frToIt = chunks[1] + "min";
    } else {
      itToFr = text;
      frToIt = text;
    }
  }

  return { itToFr, frToIt };
}

export async function GET() {
  // Più URL candidati: tunnelmb.net (IT/FR/EN) e pagina ATMB (può aiutare come fallback)
  const urls = [
    "https://www.tunnelmb.net/it/",
    "https://www.tunnelmb.net/fr/",
    "https://www.tunnelmb.net/en/",
    "https://www.atmb.com/info-trafic-a40-rn205/",
  ];

  let lastErr: any = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: {
          "user-agent": "MyTunnelWait/0.1 (+local dev) Next.js",
          "accept-language": "it,en;q=0.8,fr;q=0.7",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      const { itToFr, frToIt } = splitSides(html);
      const east = extractMinutes(frToIt);  // Francia -> Italia (est)
      const west = extractMinutes(itToFr);  // Italia  -> Francia (ovest)

      if (east !== null || west !== null) {
        return NextResponse.json({
          source: url.includes("tunnelmb") ? "tunnelmb.net" : "atmb.com",
          fetchedAt: new Date().toISOString(),
          east, // Francia -> Italia
          west, // Italia  -> Francia
        });
      }
    } catch (e) {
      lastErr = e;
    }
  }

  return NextResponse.json(
    { error: "Unable to fetch Monte Bianco data", detail: String(lastErr) },
    { status: 502 }
  );
}
