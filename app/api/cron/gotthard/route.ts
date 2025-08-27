export const runtime = 'nodejs'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseStringPromise } from 'xml2js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const OPENDATA_API_KEY = process.env.OPENDATA_API_KEY || ''
const CRON_SECRET = process.env.CRON_SECRET || ''
const FORCE_STUB = process.env.FORCE_STUB === '1' // per test locali facili

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

type Direction = 'N2S' | 'S2N'

function inferDirectionFromRecord(rec: any): Direction | null {
  const text = JSON.stringify(rec).toLowerCase()
  if (text.includes('airolo') || text.includes('ticino')) return 'N2S'
  if (text.includes('göschenen') || text.includes('goschenen') || text.includes('uri')) return 'S2N'
  return null
}

function extractDelayMinutes(rec: any): number | null {
  const seconds =
    rec?.delays?.delayTimeValue ??
    rec?.impact?.delays?.delayTimeValue ??
    rec?.delayTimeValue ??
    null
  if (typeof seconds === 'number') return Math.max(0, Math.round(seconds / 60))

  // fallback euristico: "X km" di coda ≈ 10 min/km
  const txt = JSON.stringify(rec)
  const m = txt.match(/(\d+(?:\.\d+)?)\s*km/i)
  if (m) return Math.round(parseFloat(m[1]) * 10)
  return null
}

async function fetchOfficialWaits(): Promise<Array<{
  direction: Direction; wait_minutes: number; observed_at: string; raw: any
}>> {
    // ➜ chiamata alla fonte reale
    const url = 'https://api.opentransportdata.swiss/TDP/Soap_Datex2/TrafficSituations/Pull'

    let res: Response
    try {
    res = await fetch(url, {
        method: 'GET',
        headers: {
        Authorization: `Bearer ${OPENDATA_API_KEY}`,
        'User-Agent': 'MyTunnelWait/1.0',
        Accept: '*/*',
        },
    })
    } catch (err: any) {
    // snapshot anche in caso di errore di rete
    await supabase.from('queue_ingest_snapshots').insert({
        status: -1,
        content_type: 'network-error',
        note: String(err?.message || 'fetch failed').slice(0, 200),
        body: '',
    })
    return []
    }

    const contentType = res.headers.get('content-type') || ''
    const bodyText = await res.text()

    // 📌 salva SEMPRE uno snapshot (anche se non-200)
    await supabase.from('queue_ingest_snapshots').insert({
    status: res.status,
    content_type: contentType,
    note: res.ok ? 'ok' : 'non-ok',
    body: bodyText.slice(0, 200000),
    })

    // Se non-200 → esci senza rompere il cron
    if (!res.ok) return []

    // Se arriva JSON (o inizia con "{") → non tentare XML
    const trimmed = bodyText.trim()
    if (contentType.includes('application/json') || trimmed.startsWith('{')) {
    return []
    }

    // Parse XML → JSON
    let json: any
    try {
    json = await parseStringPromise(bodyText, { explicitArray: false, mergeAttrs: true })
    } catch (e: any) {
    // snapshot già salvato sopra; qui esci in modo pulito
    return []
    }

    // …poi il tuo codice che attraversa pub/situation/situationRecord
    const pub = json?.d2LogicalModel?.payloadPublication
    const situations = pub?.situation ? (Array.isArray(pub.situation) ? pub.situation : [pub.situation]) : []

    const out: Array<{ direction: Direction; wait_minutes: number; observed_at: string; raw: any }> = []
    const nowIso = new Date().toISOString()

    for (const s of situations) {
    const recs = s?.situationRecord
        ? (Array.isArray(s.situationRecord) ? s.situationRecord : [s.situationRecord])
        : []

    for (const rec of recs) {
        const txt = JSON.stringify(rec).toLowerCase()
        const isGotthard = txt.includes('gotthard') || txt.includes('gottardo') || txt.includes('a2')
        if (!isGotthard) continue

        const dir = inferDirectionFromRecord(rec)
        const delay = extractDelayMinutes(rec)
        if (!dir || delay == null) continue

        out.push({
        direction: dir,
        wait_minutes: Math.min(600, Math.max(0, delay)),
        observed_at: s?.overallStartTime ?? nowIso,
        raw: rec,
        })
    }
}

    return out
}

export async function GET(req: Request) {
  try {
    // Protezione endpoint con secret (se impostato)
    const url = new URL(req.url)
    
    // 🩺 probe rapido: /api/cron/gotthard?probe=1
    if (url.searchParams.get('probe') === '1') {
      return NextResponse.json({
        ok: true,
        hasKey: !!process.env.OPENDATA_API_KEY,
        forceStub: process.env.FORCE_STUB === '1'
      })
    }
    
    if (CRON_SECRET && url.searchParams.get('secret') !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const items = await fetchOfficialWaits()

    if (!items.length) {
      // nessun dato valido – non è un errore, ma utile per logs
      return NextResponse.json({ inserted: 0, note: 'no-items' })
    }

    const rows = items.map(it => ({
      observed_at: it.observed_at,
      direction: it.direction,
      wait_minutes: it.wait_minutes,
      source: 'official',
      confidence: 0.9,
      location: 'Gotthard',
      lane: 'A2',
      raw_payload: it.raw,
    }))

    const { data, error } = await supabase.from('queue_readings').insert(rows).select('id')
    if (error && !String(error.message).includes('duplicate key')) throw error

    await supabase.rpc('refresh_queue_materialized')

    return NextResponse.json({ inserted: data?.length ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 500) }, { status: 500 })
  }
}
