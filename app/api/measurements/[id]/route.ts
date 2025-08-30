// app/api/measurements/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function isInt(n: any) { return typeof n === 'number' && Number.isInteger(n); }

function isDir(val: any): val is 'northbound' | 'southbound' {
  return val === 'northbound' || val === 'southbound';
}

function isTunnel(val: any): val is 'gotthard' | 'monte_bianco' | 'frejus' | 'brenner' {
  return val === 'gotthard' || val === 'monte_bianco' || val === 'frejus' || val === 'brenner';
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "missing-id" }, { status: 400 });
    }
    const sb = supabaseAdmin();
    const { error } = await sb.from("manual_measurements").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "missing-id" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({} as any));

    const patch: Record<string, any> = {};
    if (body.tunnel !== undefined) {
      if (!isTunnel(body.tunnel)) return NextResponse.json({ error: 'invalid tunnel' }, { status: 400 });
      patch.tunnel = body.tunnel;
    }
    if (body.direction !== undefined) {
      if (!isDir(body.direction)) return NextResponse.json({ error: 'invalid direction' }, { status: 400 });
      patch.direction = body.direction;
    }
    if (body.wait_minutes !== undefined) {
      if (!isInt(body.wait_minutes) || body.wait_minutes < 0 || body.wait_minutes > 720) return NextResponse.json({ error: 'invalid wait_minutes' }, { status: 400 });
      patch.wait_minutes = body.wait_minutes;
    }
    if (body.note !== undefined) {
      if (body.note !== null && typeof body.note !== 'string') return NextResponse.json({ error: 'invalid note' }, { status: 400 });
      if (typeof body.note === 'string' && body.note.length > 1000) return NextResponse.json({ error: 'note too long' }, { status: 400 });
      patch.note = body.note;
    }
    if (body.observed_at !== undefined) {
      if (typeof body.observed_at !== 'string' || isNaN(Date.parse(body.observed_at))) return NextResponse.json({ error: 'invalid observed_at' }, { status: 400 });
      patch.observed_at = body.observed_at;
    }

    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, updated: 0 });

    const sb = supabaseAdmin();
    const { error, data } = await sb.from('manual_measurements').update(patch).eq('id', id).select('id');
    if (error) throw error;
    return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}
