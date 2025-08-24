import { NextResponse } from "next/server";

/**
 * Estrae "X min" da una sezione di testo.
 */
function extractMinutes(section: string): number | null {
  const m = section.match(/(\d+)\s*min/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Prova a trovare le sezioni "Nord/Sud" in FR o EN.
 */
function splitSides(html: string) {
  // togli markup basilare
  const text = html
    .replace(/\s+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();

  // indici di sezioni (FR e EN)
  const iNorth = text.toLowerCase().indexOf("côté nord") >= 0
    ? text.toLowerCase().indexOf("côté nord")
    : text.toLowerCase().indexOf("north portal");
  const iSouth = text.toLowerCase().indexOf("côté sud") >= 0
    ? text.toLowerCase().indexOf("côté sud")
    : text.toLowerCase().indexOf("south portal");

  let north = "";
  let south = "";
  if (iNorth >= 0 && iSouth >= 0) {
    if (iNorth < iSouth) {
      north = text.slice(iNorth, iSouth);
      south = text.slice(iSouth);
    } else {
      south = text.slice(iSouth, iNorth);
      north = text.slice(iNorth);
    }
  } else {
    // fallback: cerca la prima/seconda occorrenza di "min"
    const mins = text.split(/min/i);
    if (mins.length >= 3) {
      north = mins[0] + "min";
      south = mins[1] + "min";
    } else {
      north = text;
      south = text;
    }
  }
  return { north, south };
}

export async function GET() {
  const urls = [
    "https://www.gotthard-traffic.ch/?lan=en",
    "https://www.gotthard-traffic.ch/?lan=fr",
  ];

  let lastErr: any = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        // evitiamo cache lato Vercel/Edge: vogliamo un valore fresco
        cache: "no-store",
        headers: {
          "user-agent":
            "MyTunnelWait/0.1 (+https://example.local) Next.js fetch",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const { north, south } = splitSides(html);
      const nMin = extractMinutes(north);
      const sMin = extractMinutes(south);

      if (nMin !== null || sMin !== null) {
        return NextResponse.json({
          source: "gotthard-traffic",
          fetchedAt: new Date().toISOString(),
          north: nMin,
          south: sMin,
        });
      }
    } catch (e) {
      lastErr = e;
    }
  }

  return NextResponse.json(
    { error: "Unable to fetch gotthard data", detail: String(lastErr) },
    { status: 502 }
  );
}
