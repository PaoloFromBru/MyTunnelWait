// app/api/cron/gotthard-tomtom/route.ts
export const runtime = 'nodejs'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TOMTOM_KEY = process.env.TOMTOM_API_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

type Direction = 'N2S' | 'S2N'

// Portali tunnel (approssimati; perfezionabili in seguito)
const GOSCHENEN = { lat: 46.6680, lon: 8.5869 } // Nord
const AIROLO    = { lat: 46.5280, lon: 8.6080 } // Sud

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
function interpolatePoints(a: {lat:number;lon:number}, b: {lat:number;lon:number}, n: number) {
  // n punti inclusi gli estremi
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1)
    pts.push({ lat: lerp(a.lat, b.lat, t), lon: lerp(a.lon, b.lon, t) })
  }
  return pts
}

async function fetchFlowPoint(lat:number, lon:number) {
  // TomTom Flow Segment Data (absolute, zoom 10)
  const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${TOMTOM_KEY}&point=${lat},${lon}`
  const r = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent':'MyTunnelWait/1.0' } })
  if (!r.ok) throw new Error(`tomtom ${r.status}`)
  return r.json().catch(() => null)
}

function extraSeconds(flow:any): number | null {
  const seg = flow?.flowSegmentData
  if (!seg) return null
  const curr = seg.currentTravelTime   // seconds
  const free = seg.freeFlowTravelTime  // seconds
  if (typeof curr === 'number' && typeof free === 'number' && curr >= free) {
    return curr - free
  }
  return 0
}

// DOPO: (somma con trim 15%)
function summarizeExtras(extras:number[]) {
  const pos = extras.filter(x => Number.isFinite(x) && x! >= 0)
  if (!pos.length) return 0
  const sorted = pos.slice().sort((a,b)=>a-b)
  const cut = Math.floor(sorted.length * 0.15)
  const trimmed = sorted.slice(cut, sorted.length - cut || undefined)
  const sum = trimmed.reduce((s,x)=>s + x, 0)     // ← somma, non media
  return Math.max(0, Math.round(sum))
}

export async function GET() {
  try {
    if (!TOMTOM_KEY) return NextResponse.json({ error: 'Missing TOMTOM_API_KEY' }, { status: 500 })

    const now = new Date().toISOString()

    // Campiona più punti lungo il corridoio (8 punti ≈ copre bene l’approccio)
    const ptsN2S = interpolatePoints(GOSCHENEN, AIROLO, 8)
    const ptsS2N = ptsN2S.slice().reverse()

    // Fetch in parallelo
    const [flowsN2S, flowsS2N] = await Promise.all([
      Promise.all(ptsN2S.map(p => fetchFlowPoint(p.lat, p.lon).catch(() => null))),
      Promise.all(ptsS2N.map(p => fetchFlowPoint(p.lat, p.lon).catch(() => null))),
    ])

    const extrasN2S = flowsN2S.map(extraSeconds).filter((x): x is number => x != null)
    const extrasS2N = flowsS2N.map(extraSeconds).filter((x): x is number => x != null)

    // Stima finale (secondi → minuti, cap 0..600)
    const waitN2S = Math.min(600, Math.round(summarizeExtras(extrasN2S) / 60))
    const waitS2N = Math.min(600, Math.round(summarizeExtras(extrasS2N) / 60))

    const items: Array<{direction:Direction; wait_minutes:number; observed_at:string; raw:any}> = []
    items.push({ direction:'N2S', wait_minutes: waitN2S, observed_at: now, raw: { provider:'tomtom', points: ptsN2S, flows: flowsN2S } })
    items.push({ direction:'S2N', wait_minutes: waitS2N, observed_at: now, raw: { provider:'tomtom', points: ptsS2N, flows: flowsS2N } })

    // Se entrambi 0 e senza dati, non inserire
    const valid = items.filter(i => Number.isFinite(i.wait_minutes))
    if (!valid.length) return NextResponse.json({ inserted:0, note:'no-items' })

    const rows = valid.map(it => ({
      observed_at: it.observed_at,
      direction: it.direction,
      wait_minutes: it.wait_minutes,
      source: 'tomtom',              // ← ora che il CHECK è aggiornato
      confidence: 0.7,
      location: 'Gotthard',
      lane: 'A2',
      raw_payload: it.raw,
    }))

    const { data, error } = await supabase
      .from('queue_readings')
      .upsert(rows, { onConflict: 'observed_at,direction,source', ignoreDuplicates: true })
      .select('id')
    if (error) throw error

    const { error: refreshErr } = await supabase.rpc('refresh_queue_materialized')
    if (refreshErr) console.warn('[mv refresh]', refreshErr.message)
    return NextResponse.json({ inserted: data?.length ?? 0, n2s: waitN2S, s2n: waitS2N })
  } catch (e:any) {
    return NextResponse.json({ error: e.message?.slice(0,300) }, { status: 500 })
  }
}
