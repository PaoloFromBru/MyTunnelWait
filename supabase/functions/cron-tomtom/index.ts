import { createClient } from "npm:@supabase/supabase-js@2";

type Direction = 'N2S' | 'S2N' | 'E2W' | 'W2E'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const TOMTOM_KEY   = Deno.env.get('TOMTOM_API_KEY') ?? ''
const CRON_KEY     = Deno.env.get('CRON_KEY') ?? '' // optional gate

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type':'application/json', 'cache-control':'no-store' } })
}

// Tunnel corridors (approx portals) and axis
const TUNNELS: Record<string, { axis:'NS'|'EW'; name:string; lane?:string; a:{lat:number;lon:number}; b:{lat:number;lon:number} }> = {
  gotthard:    { axis:'NS', name:'Gotthard', lane:'A2', a:{ lat:46.6680, lon:8.5869 }, b:{ lat:46.5280, lon:8.6080 } }, // Gösch / Airolo
  monte_bianco:{ axis:'EW', name:'Mont Blanc', lane:'RN205', a:{ lat:45.9286, lon:6.8639 }, b:{ lat:45.8206, lon:6.9727 } }, // FR->IT appross.
  frejus:      { axis:'EW', name:'Fréjus', lane:'T4', a:{ lat:45.1234, lon:6.7032 }, b:{ lat:45.0865, lon:6.7237 } }, // approx
  brenner:     { axis:'NS', name:'Brenner', lane:'A22', a:{ lat:47.0027, lon:11.5056 }, b:{ lat:46.8988, lon:11.4828 } }, // approx
}

function lerp(a:number, b:number, t:number) { return a + (b-a)*t }
function interpolate(a:{lat:number;lon:number}, b:{lat:number;lon:number}, n:number) {
  const pts: Array<{lat:number;lon:number}> = []
  for (let i=0;i<n;i++) { const t = n===1 ? 0 : i/(n-1); pts.push({ lat: lerp(a.lat,b.lat,t), lon: lerp(a.lon,b.lon,t) }) }
  return pts
}

async function fetchFlowPoint(lat:number, lon:number) {
  const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${TOMTOM_KEY}&point=${lat},${lon}`
  const r = await fetch(url, { headers: { 'Accept':'application/json', 'User-Agent':'MyTunnelWait/1.0' } })
  if (!r.ok) throw new Error(`tomtom ${r.status}`)
  return r.json().catch(() => null)
}

function extraSeconds(flow:any): number | null {
  const seg = flow?.flowSegmentData
  if (!seg) return null
  const curr = seg.currentTravelTime, free = seg.freeFlowTravelTime
  if (typeof curr==='number' && typeof free==='number' && curr>=free) return curr - free
  return 0
}

function summarizeExtras(extras:number[]) {
  const pos = extras.filter(x => Number.isFinite(x) && x! >= 0)
  if (!pos.length) return 0
  const sorted = pos.slice().sort((a,b)=>a-b)
  const cut = Math.floor(sorted.length * 0.15)
  const trimmed = sorted.slice(cut, sorted.length - cut || undefined)
  const sum = trimmed.reduce((s,x)=>s+x,0)
  return Math.max(0, Math.round(sum))
}

async function sampleTunnel(key: keyof typeof TUNNELS) {
  const cfg = TUNNELS[key]
  const now = new Date().toISOString()
  const nPts = 8
  const ptsAB = interpolate(cfg.a, cfg.b, nPts)
  const ptsBA = ptsAB.slice().reverse()
  const [flowsAB, flowsBA] = await Promise.all([
    Promise.all(ptsAB.map(p=>fetchFlowPoint(p.lat,p.lon).catch(()=>null))),
    Promise.all(ptsBA.map(p=>fetchFlowPoint(p.lat,p.lon).catch(()=>null)))
  ])
  const extrasAB = flowsAB.map(extraSeconds).filter((x): x is number => x!=null)
  const extrasBA = flowsBA.map(extraSeconds).filter((x): x is number => x!=null)
  const waitAB = Math.min(600, Math.round(summarizeExtras(extrasAB)/60))
  const waitBA = Math.min(600, Math.round(summarizeExtras(extrasBA)/60))

  let dirAB: Direction, dirBA: Direction
  if (cfg.axis==='NS') { dirAB='N2S'; dirBA='S2N' } else { dirAB='E2W'; dirBA='W2E' }

  const rows = [] as Array<any>
  rows.push({ observed_at: now, direction: dirAB, wait_minutes: waitAB, source:'tomtom', confidence:0.7, location: cfg.name, lane: cfg.lane ?? null, raw_payload: { provider:'tomtom', points: ptsAB, flows: flowsAB } })
  rows.push({ observed_at: now, direction: dirBA, wait_minutes: waitBA, source:'tomtom', confidence:0.7, location: cfg.name, lane: cfg.lane ?? null, raw_payload: { provider:'tomtom', points: ptsBA, flows: flowsBA } })
  return rows
}

Deno.serve( async (req: Request) => {
  try {
    if (!TOMTOM_KEY) return json({ ok:false, error:'Missing TOMTOM_API_KEY' }, 500)
    const key = new URL(req.url).searchParams.get('key') || req.headers.get('x-cron-key')
    if (CRON_KEY && key !== CRON_KEY) return json({ ok:false, error:'unauthorized' }, 401)

    const tunnels = Object.keys(TUNNELS) as (keyof typeof TUNNELS)[]
    const allRows = [] as any[]
    for (const t of tunnels) {
      const rows = await sampleTunnel(t).catch(()=>[])
      for (const r of rows) {
        if (!Number.isFinite(r.wait_minutes)) continue
        allRows.push({ ...r })
      }
    }
    if (!allRows.length) return json({ ok:true, inserted:0, note:'no-items' })

    const { data, error } = await sb
      .from('queue_readings')
      .upsert(allRows, { onConflict: 'observed_at,direction,source', ignoreDuplicates: true })
      .select('id')
    if (error) return json({ ok:false, error:error.message }, 500)

    return json({ ok:true, inserted: data?.length ?? 0 })
  } catch (e:any) {
    return json({ ok:false, error: e?.message || String(e) }, 500)
  }
})

