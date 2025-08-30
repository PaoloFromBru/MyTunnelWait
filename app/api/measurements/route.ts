// app/api/measurements/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Tunnel = "gotthard" | "monte_bianco";
type Direction = "northbound" | "southbound";

interface Body {
  tunnel: Tunnel;
  direction: Direction;
  wait_minutes: number;
  lanes_open?: number;
  note?: string;
  observed_at?: string;
  lat?: number;
  lon?: number;
}

function isEnum<T extends string>(value: any, options: readonly T[]): value is T {
  return typeof value === "string" && options.includes(value as T);
}

function isValidBody(data: any): data is Body {
  if (!data || typeof data !== "object") return false;
  if (!isEnum<Tunnel>(data.tunnel, ["gotthard", "monte_bianco"])) return false;
  if (!isEnum<Direction>(data.direction, ["northbound", "southbound"])) return false;
  if (
    typeof data.wait_minutes !== "number" ||
    !Number.isInteger(data.wait_minutes) ||
    data.wait_minutes < 0 ||
    data.wait_minutes > 720
  )
    return false;
  if (data.lanes_open !== undefined) {
    if (
      typeof data.lanes_open !== "number" ||
      !Number.isInteger(data.lanes_open) ||
      data.lanes_open < 0 ||
      data.lanes_open > 8
    )
      return false;
  }
  if (data.note !== undefined) {
    if (typeof data.note !== "string" || data.note.length > 1000) return false;
  }
  if (data.observed_at !== undefined) {
    if (typeof data.observed_at !== "string" || isNaN(Date.parse(data.observed_at)))
      return false;
  }
  if (data.lat !== undefined) {
    if (typeof data.lat !== "number" || data.lat < -90 || data.lat > 90) return false;
  }
  if (data.lon !== undefined) {
    if (typeof data.lon !== "number" || data.lon < -180 || data.lon > 180) return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get("user-agent") ?? undefined;
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      (req as any).ip ||
      undefined;

    const json = await req.json();
    if (!isValidBody(json)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const b = json;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // NB: return=representation + ?select=... per farti restituire l'id come con .select("id,observed_at")
    const res = await fetch(
      `${url}/rest/v1/manual_measurements?select=id,observed_at`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          tunnel: b.tunnel,
          direction: b.direction,
          wait_minutes: b.wait_minutes,
          lanes_open: b.lanes_open ?? null,
          note: b.note ?? null,
          observed_at: b.observed_at ?? new Date().toISOString(),
          lat: b.lat ?? null,
          lon: b.lon ?? null,
          reporter_id: null,
          client_ip: ip ?? null,
          user_agent: ua ?? null,
          source: "manual",
        }),
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      console.error("[measurements] REST insert failed", res.status, txt);
      return NextResponse.json(
        { error: "REST insert failed", status: res.status, details: txt },
        { status: 500 }
      );
    }

    const rows = await res.json(); // array con una riga
    return NextResponse.json({ ok: true, id: rows[0].id, observed_at: rows[0].observed_at });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
