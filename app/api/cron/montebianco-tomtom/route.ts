import { NextResponse } from "next/server";
import { supabaseAdmin as createClient } from "@/lib/supabaseAdmin";
import { estimateWait } from "@/lib/trafficEstimator";

export const dynamic = "force-dynamic";

async function insertWithFallback(rows: any[]) {
  const supabase = createClient();
  let current = rows;
  while (true) {
    const { error } = await supabase.from("queue_readings").insert(current);
    if (!error) return;
    const m = /column "([^"]+)"/.exec(error.message);
    if (!m) throw error;
    const col = m[1];
    current = current.map((r) => {
      const { [col]: value, raw, ...rest } = r as any;
      return { ...rest, raw: { ...(raw ?? {}), [col]: value } };
    });
  }
}

export async function GET(req: Request) {
  try {
    const [east, west] = await Promise.all([
      estimateWait("monte_bianco", "E"),
      estimateWait("monte_bianco", "W"),
    ]);
    const rows: any[] = [];
    if (east) {
      rows.push({
        tunnel: "monte_bianco",
        direction: "E",
        source: "tomtom:fusion",
        wait_minutes: east.waitMinutes,
        method: east.method,
        raw: east.raw,
      });
    }
    if (west) {
      rows.push({
        tunnel: "monte_bianco",
        direction: "W",
        source: "tomtom:fusion",
        wait_minutes: west.waitMinutes,
        method: west.method,
        raw: west.raw,
      });
    }

    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "no data" }, { status: 500 });
    }

    await insertWithFallback(rows);
    return NextResponse.json({ ok: true, inserted: rows.length, sample: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

