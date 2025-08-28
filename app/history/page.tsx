'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

type Row = { observed_at: string; direction: 'N2S' | 'S2N'; source: string; wait_minutes: number };

function roundTo15m(d: Date) {
  const m = d.getMinutes();
  const bucket = Math.floor(m / 15) * 15;
  const nd = new Date(d);
  nd.setMinutes(bucket, 0, 0);
  return nd;
}
function fmtHM(d: Date) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function medianRobust(vals: number[]) {
  if (!vals.length) return 0;
  const nonZero = vals.filter(v => v > 0);
  const arr = (nonZero.length ? nonZero : vals).slice().sort((a,b)=>a-b);
  const mid = Math.floor(arr.length/2);
  return arr.length % 2 ? arr[mid] : Math.round((arr[mid-1] + arr[mid]) / 2);
}
const DOW = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];

export default function HistoryPage() {
  // Line chart (ultime ore)
  const [hours, setHours] = useState(24);
  const [rowsH, setRowsH] = useState<Row[]>([]);
  const [loadingH, setLoadingH] = useState(true);

  // Heatmap (ultime settimane)
  const [weeks, setWeeks] = useState(8);
  const [rowsW, setRowsW] = useState<Row[]>([]);
  const [loadingW, setLoadingW] = useState(true);

  // Filtri
  const [dir, setDir] = useState<'both' | 'N2S' | 'S2N'>('both');
  const [scaleMax, setScaleMax] = useState(120); // min per colore max

  // fetch per line chart
  useEffect(() => {
    let on = true;
    setLoadingH(true);
    fetch(`/api/history?hours=${hours}`).then(r=>r.json()).then(j=>{
      if (on) setRowsH(j.rows || []);
    }).finally(()=> on && setLoadingH(false));
    return ()=>{ on=false; };
  }, [hours]);

  // fetch per heatmap
  useEffect(() => {
    let on = true;
    setLoadingW(true);
    const h = weeks * 7 * 24;
    fetch(`/api/history?hours=${h}`).then(r=>r.json()).then(j=>{
      if (on) setRowsW(j.rows || []);
    }).finally(()=> on && setLoadingW(false));
    return ()=>{ on=false; };
  }, [weeks]);

  // ---------- Line chart (bucket 15′) ----------
  const chartData = useMemo(() => {
    const map = new Map<string, { t: string; n2sVals: number[]; s2nVals: number[] }>();
    for (const r of rowsH) {
      if (dir !== 'both' && r.direction !== dir) continue;
      const t = roundTo15m(new Date(r.observed_at)).toISOString();
      const m = map.get(t) ?? { t, n2sVals: [], s2nVals: [] };
      (r.direction === 'N2S' ? m.n2sVals : m.s2nVals).push(r.wait_minutes);
      map.set(t, m);
    }
    return [...map.values()]
      .sort((a,b)=>a.t.localeCompare(b.t))
      .map(e => {
        const d = new Date(e.t);
        return {
          time: fmtHM(d),
          'N→S': medianRobust(e.n2sVals),
          'S→N': medianRobust(e.s2nVals),
        };
      });
  }, [rowsH, dir]);

  // ---------- Heatmap settimanale ----------
  const heat = useMemo(() => {
    // matrice 7x24 (lun=0…dom=6)
    const cells: (number|null)[][] = Array.from({length:7}, ()=>Array(24).fill(null));
    const buckets: number[][][] = Array.from({length:7}, ()=>Array.from({length:24}, ()=>[] as number[]));

    for (const r of rowsW) {
      if (dir !== 'both' && r.direction !== dir) continue;
      const d = new Date(r.observed_at);
      const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
      const hour = d.getHours();
      buckets[dow][hour].push(r.wait_minutes);
    }
    for (let d=0; d<7; d++) {
      for (let h=0; h<24; h++) {
        const v = medianRobust(buckets[d][h]);
        cells[d][h] = (buckets[d][h].length ? v : null);
      }
    }
    return cells;
  }, [rowsW, dir]);

  function colorFor(v: number | null) {
    if (v == null) return '#eef2f7'; // no data
    const t = clamp(v / scaleMax, 0, 1);
    // 0 = green (120), 1 = red (0)
    const hue = Math.round((1 - t) * 120);
    const light = 50 - t * 8; // leggermente più scuro con l’aumentare
    return `hsl(${hue} 80% ${light}%)`;
  }

  const latest = useMemo(() => rowsH.slice(-10).reverse(), [rowsH]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">History – Gotthard</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Dir:</span>
          {(['both','N2S','S2N'] as const).map(k => (
            <button key={k}
              onClick={()=>setDir(k)}
              className={`px-3 py-1.5 rounded-xl border text-sm ${dir===k? 'bg-black text-white border-black':'bg-white border-gray-300 hover:bg-gray-50'}`}>
              {k==='both' ? 'N→S & S→N' : (k==='N2S' ? 'N→S' : 'S→N')}
            </button>
          ))}
        </div>
      </header>

      {/* Line chart */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Attesa (ultime ore, bucket 15′)</h2>
          <div className="flex items-center gap-2">
            {[24, 48, 24*7].map(h => (
              <button key={h} onClick={()=>setHours(h)}
                className={`px-3 py-1.5 rounded-xl border text-sm ${h===hours? 'bg-black text-white border-black':'bg-white border-gray-300 hover:bg-gray-50'}`}>
                {h===24?'24h':h===48?'48h':'7d'}
              </button>
            ))}
          </div>
        </div>
        <div className="h-80">
          {loadingH ? (
            <div className="flex h-full items-center justify-center text-gray-500">Caricamento…</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="time" minTickGap={24} />
                <YAxis width={40} unit="m" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="N→S" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="S→N" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Heatmap */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Heatmap settimanale</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">settimane:</span>
              {[4,8,12].map(w=>(
                <button key={w} onClick={()=>setWeeks(w)}
                  className={`px-3 py-1.5 rounded-xl border text-sm ${w===weeks?'bg-black text-white border-black':'bg-white border-gray-300 hover:bg-gray-50'}`}>
                  {w}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">scala:</span>
              {[60,120,240].map(m=>(
                <button key={m} onClick={()=>setScaleMax(m)}
                  className={`px-3 py-1.5 rounded-xl border text-sm ${m===scaleMax?'bg-black text-white border-black':'bg-white border-gray-300 hover:bg-gray-50'}`}>
                  {m}m
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* header ore */}
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid" style={{ gridTemplateColumns: '64px repeat(24, minmax(0,1fr))' }}>
              <div></div>
              {Array.from({length:24}, (_,h)=>(
                <div key={h} className="px-2 py-1 text-center text-[11px] text-gray-500">{h.toString().padStart(2,'0')}</div>
              ))}
              {heat.map((row, d) => (
                <>
                  <div key={`lbl-${d}`} className="px-2 py-1 text-right text-sm text-gray-600">{DOW[d]}</div>
                  {row.map((v, h) => (
                    <div key={`${d}-${h}`}
                         className="h-6 border border-white"
                         title={`${DOW[d]} ${h}:00 — ${v==null?'–':v+' min'}`}
                         style={{ background: colorFor(v) }} />
                  ))}
                </>
              ))}
            </div>
          </div>
        </div>

        {/* legenda */}
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
          <span>0</span>
          <div className="h-3 w-32 rounded bg-gradient-to-r from-[#5ad35a] via-[#ffd24d] to-[#e24c4c]" />
          <span>{scaleMax} min</span>
          <span className="ml-3 text-gray-400">valore = mediana per fascia oraria, ultimi {weeks} sett.</span>
        </div>

        {loadingW && <div className="mt-2 text-sm text-gray-500">Caricamento…</div>}
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-lg font-medium">Ultime letture</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="text-left text-gray-500">
              <th className="py-2 pr-4">Quando</th>
              <th className="py-2 pr-4">Dir</th>
              <th className="py-2 pr-4">Min</th>
              <th className="py-2 pr-4">Fonte</th>
            </tr></thead>
            <tbody>
              {latest.map((r,i)=>(
                <tr key={i} className="border-t">
                  <td className="py-2 pr-4">
                    {new Date(r.observed_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                  </td>
                  <td className="py-2 pr-4">{r.direction}</td>
                  <td className="py-2 pr-4">{r.wait_minutes} m</td>
                  <td className="py-2 pr-4">{r.source}</td>
                </tr>
              ))}
              {!latest.length && !loadingH && (
                <tr><td className="py-4 text-gray-500" colSpan={4}>Nessun dato disponibile.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
