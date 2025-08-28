// app/api/history/route.ts
export const runtime = 'nodejs'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const hours = Math.max(1, Math.min(24 * 14, Number(url.searchParams.get('hours')) || 24)) // max 14 giorni
    const sinceIso = new Date(Date.now() - hours * 3600_000).toISOString()

    const { data, error } = await supabase
      .from('queue_readings')
      .select('observed_at, direction, source, wait_minutes')
      .gte('observed_at', sinceIso)
      .order('observed_at', { ascending: true })
      .limit(50000)

    if (error) throw error
    return NextResponse.json({ rows: data ?? [], hours })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
