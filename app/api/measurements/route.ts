// app/api/measurements/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BodySchema = z.object({
  tunnel: z.enum(["gotthard", "monte_bianco"]),
  direction: z.enum(["northbound", "southbound"]),
  wait_minutes: z.number().int().min(0).max(720),
  lanes_open: z.number().int().min(0).max(8).optional(),
  note: z.string().max(1000).optional(),
  observed_at: z.string().datetime().optional(), // ISO string
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  // opzionale se usi auth: il client NON la manda, la metteremo noi lato server leggendo il session cookie
});

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get("user-agent") ?? undefined;
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      (req as any).ip ||
      undefined;

    const json = await req.json();
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const b = parsed.data;

    // Se usi Supabase Auth lato app, puoi recuperare user id dai cookies session (opzionale)
    // In questo esempio lasciamo reporter_id null
    const { error, data } = await supabaseAdmin
      .from("manual_measurements")
      .insert([
        {
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
        },
      ])
      .select("id, observed_at")
      .single();

    if (error) {
      console.error("Insert error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id, observed_at: data.observed_at });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
