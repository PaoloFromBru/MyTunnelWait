export const runtime = "nodejs";
import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const proj = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1] || "unknown";

  // sanity check REST con le stesse env della route
  let restStatus = 0;
  let restBody = "";
  try {
    const r = await fetch(`${url}/rest/v1/manual_measurements?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    restStatus = r.status;
    restBody = await r.text();
  } catch (e: any) {
    restStatus = -1;
    restBody = e?.message || String(e);
  }

  return NextResponse.json({
    supabase_url: url,
    project_ref: proj,
    key_prefix: key.slice(0, 6),
    rest_status: restStatus,
    rest_preview: restBody.slice(0, 120),
  });
}
