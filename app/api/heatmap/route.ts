// app/api/heatmap/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function empty(): number[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}
function pgDowToMonFirst(pgDow: number) { return pgDow === 0 ? 6 : pgDow - 1; }

export async function GET() {
  const supabase = supabaseAdmin;
  const { data, error } = await supabase
    .from("mv_traffic_heatmap_weekly")
    .select("dow,hour,category,events");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  const incident = empty();
  const wait = empty();
  let maxIncident = 0, maxWait = 0;

  for (const r of (data ?? []) as any[]) {
    const d = pgDowToMonFirst(r.dow);
    if (r.category === "incident") {
      incident[d][r.hour] = r.events;
      if (r.events > maxIncident) maxIncident = r.events;
    } else if (r.category === "wait") {
      wait[d][r.hour] = r.events;
      if (r.events > maxWait) maxWait = r.events;
    }
  }

  return NextResponse.json({
    incident, wait,
    max: { incident: maxIncident || 1, wait: maxWait || 1 }
  }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
