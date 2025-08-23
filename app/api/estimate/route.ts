import { NextRequest, NextResponse } from "next/server";
import { estimateWaitMinutes } from "@/lib/queue";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const minutes = estimateWaitMinutes(body);
  return NextResponse.json({ minutes, readable: toHHMM(minutes) });
}

function toHHMM(min: number) {
  if (!isFinite(min)) return "In incremento (nessuna stima affidabile)";
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? `${h}h ${mm}m` : `${mm} min`;
}
