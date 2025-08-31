import { NextResponse } from "next/server";

export const runtime = 'nodejs';
export const revalidate = 0;

/**
 * Estrae un numero di minuti dall'intorno testo.
 * Accetta: "35 min", "35 minutes", "35 minuti", "35' ", "≈ 35 min."
 */
function extractMinutes(section: string): number | null {
  // Tolleriamo SOLO pattern chiaramente associati all'attesa
  const WAIT_RE = /(?:tempo\s+di\s+attesa|temps\s+d'attente|waiting\s+time|attesa|attente)[^\d]{0,60}?(\d{1,3})\s*(?:min(?:\.|utes?)?|minuti|')/i;
  const m = section.match(WAIT_RE);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return Number.isFinite(v) ? v : null;
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

  // trova primo indice forte per ciascun lato
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
    // fallback conservativo: nessuna divisione affidabile
    itToFr = text;
    frToIt = text;
  }

  return { itToFr, frToIt };
}

export async function GET() {
  // Più URL candidati: tunnelmb.net (IT/FR/EN) e pagina ATMB (fallback)
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

      // Rileva chiusura completa per messaggi tipo "Fermeture complète / Chiusura completa / Closed"
      const textAll = html.replace(/\s+/g, ' ').replace(/<[^>]+>/g, ' ').toLowerCase();
      const closed = /(fermeture\s+compl[eè]te|tunnel\s+ferm[eé]|chiusura\s+completa|tunnel\s+chiuso|closed\s+tunnel)/i.test(textAll);

      const { itToFr, frToIt } = splitSides(html);
      // Alcune pagine indicano "aucune attente" / "nessuna attesa" senza minuti; mappa a 0
      const ZERO_RE = /(aucun[e]?\s+attente|aucun\s+temps\s+d'attente|nessuna\s+attesa|no\s+waiting)/i;
      const east = ZERO_RE.test(frToIt) ? 0 : extractMinutes(frToIt);   // Francia -> Italia (est)
      const west = ZERO_RE.test(itToFr) ? 0 : extractMinutes(itToFr);   // Italia  -> Francia (ovest)

      if (closed) {
        return NextResponse.json({
          source: url.includes("tunnelmb") ? "tunnelmb.net" : "atmb.com",
          fetchedAt: new Date().toISOString(),
          east: null,
          west: null,
          closed: true,
        });
      }

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
