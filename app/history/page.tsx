"use client";

import { useEffect, useState } from "react";

type HeatCell = { dow: number; hour: number; minutes?: number; count?: number };
type RecordRow = {
  id: string;
  record_type: string;
  subtype: string | null;
  direction: string | null;
  is_cancelled: boolean;
  length_km: number | null;
  validity_start_be: string;
  validity_end_be: string | null;
};

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
type TunnelUi = '' | 'gottardo' | 'monte-bianco' | 'frejus' | 'brennero';
const TUNNELS: Array<{ id: TunnelUi; label: string }> = [
  { id: '', label: 'Tutti' },
  { id: 'gottardo', label: 'San Gottardo' },
  { id: 'monte-bianco', label: 'Monte Bianco' },
  { id: 'frejus', label: 'Fréjus' },
  { id: 'brennero', label: 'Brennero' },
];
const AXIS: Record<Exclude<TunnelUi, ''>, 'NS' | 'EW'> = {
  'gottardo': 'NS',
  'brennero': 'NS',
  'monte-bianco': 'EW',
  'frejus': 'EW',
};
const toDbTunnel = (t: TunnelUi) => t === '' ? '' : (t === 'gottardo' ? 'gotthard' : t === 'monte-bianco' ? 'monte_bianco' : t === 'frejus' ? 'frejus' : 'brenner');
const toDbDir = (t: TunnelUi, d: 'N'|'S'|'E'|'W') => (t === 'gottardo' || t === 'brennero') ? (d === 'N' ? 'southbound' : 'northbound') : (d === 'E' ? 'northbound' : 'southbound');

export default function HistoryPage() {
  const [days, setDays] = useState(7);
  const [type, setType] = useState<string>("");
  const [dir, setDir] = useState<string>("");
  const [heat, setHeat] = useState<HeatCell[]>([]);
  const [mode, setMode] = useState<'events' | 'wait'>('wait');
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tunnel, setTunnel] = useState<TunnelUi>('');
  const [dirUi, setDirUi] = useState<'N'|'S'|'E'|'W'|''>('');

  const load = async () => {
    setLoading(true);
    const qs = new URLSearchParams({ days: String(days), mode: mode === 'wait' ? 'heatmap_wait' : 'heatmap' });
    if (type) qs.set("type", type);
    if (mode === 'events') {
      if (dir) qs.set('dir', dir);
    } else {
      if (tunnel) qs.set('tunnel', toDbTunnel(tunnel));
      if (tunnel && dirUi) qs.set('direction', toDbDir(tunnel, dirUi));
    }
    const h = await fetch(`/api/history?${qs.toString()}`).then(r => r.json());

    const qs2 = new URLSearchParams({ days: String(days), mode: "list" });
    if (type) qs2.set("type", type);
    if (dir)  qs2.set("dir", dir);
    const l = await fetch(`/api/history?${qs2.toString()}`).then(r => r.json());

    setHeat(h.heatmap ?? []);
    setRows(l.records ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mode, days, type, dir, tunnel, dirUi]);

  return (
    <div className="p-4 space-y-6">
      <section className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm">Range (giorni)</label>
          <input type="number" min={1} max={60} value={days}
            onChange={e => setDays(parseInt(e.target.value || "7", 10))}
            className="border rounded px-2 py-1 w-28" />
        </div>
        <div>
          <label className="block text-sm">Tipo</label>
          <select className="border rounded px-2 py-1"
            value={type} onChange={e => setType(e.target.value)}>
            <option value="">Tutti</option>
            <option value="AbnormalTraffic">AbnormalTraffic</option>
            <option value="MaintenanceWorks">MaintenanceWorks</option>
            <option value="RoadOrCarriagewayOrLaneManagement">LaneManagement</option>
          </select>
        </div>
        <div>
          <label className="block text-sm">Direzione</label>
          <select className="border rounded px-2 py-1"
            value={dir} onChange={e => setDir(e.target.value)}>
            <option value="">Tutte</option>
            <option value="both">both</option>
            <option value="positive">positive</option>
            <option value="negative">negative</option>
          </select>
        </div>
        <button onClick={load} className="rounded-xl px-4 py-2 border shadow-sm">
          {loading ? "Loading…" : "Aggiorna"}
        </button>
      </section>

      {/* Heatmap 7x24 */}
      <section>
        <h2 className="font-semibold mb-2">Heatmap {mode==='wait' ? '(attesa stimata, min)' : '(eventi)'} — ultimi {days} giorni</h2>
        <div className="mb-2">
          <label className="text-xs text-gray-600 mr-2">Modalità</label>
          <select className="border rounded px-2 py-1 text-sm" value={mode} onChange={(e)=>setMode(e.target.value as any)}>
            <option value="wait">Attesa stimata</option>
            <option value="events">Conteggio eventi</option>
          </select>
        </div>
        {mode === 'wait' && (
          <div className="mb-2 flex items-end gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Tunnel</label>
              <select className="border rounded px-2 py-1 text-sm" value={tunnel} onChange={(e)=>{ const v = e.target.value as TunnelUi; setTunnel(v); setDirUi(''); }}>
                {TUNNELS.map(t => (<option key={t.id} value={t.id}>{t.label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Direzione</label>
              <select className="border rounded px-2 py-1 text-sm" value={dirUi} onChange={(e)=>setDirUi(e.target.value as any)} disabled={!tunnel}>
                {!tunnel && <option value="">—</option>}
                {tunnel && AXIS[tunnel as Exclude<TunnelUi,''>] === 'NS' && (<>
                  <option value="N">N</option>
                  <option value="S">S</option>
                </>)}
                {tunnel && AXIS[tunnel as Exclude<TunnelUi,''>] === 'EW' && (<>
                  <option value="E">E</option>
                  <option value="W">W</option>
                </>)}
              </select>
            </div>
          </div>
        )}
        <div className="grid grid-cols-[80px_repeat(24,1fr)] gap-1 text-xs">
          <div></div>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center">{h}</div>
          ))}
          {Array.from({ length: 7 }, (_, d) => (
            <div key={d} className="contents">
              <div className="font-medium pr-2">{DOW[d]}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const cell = heat.find(c => c.dow === d && c.hour === h);
                const v = mode === 'wait' ? Math.round(cell?.minutes ?? 0) : (cell?.count ?? 0);
                const cls = mode === 'wait'
                  ? (v === 0 ? 'bg-gray-100' : v < 15 ? 'bg-green-100' : v < 30 ? 'bg-yellow-200' : v < 60 ? 'bg-orange-300' : 'bg-red-500 text-white')
                  : (v === 0 ? 'bg-gray-100' : v < 5 ? 'bg-green-100' : v < 15 ? 'bg-green-300' : v < 30 ? 'bg-green-500' : 'bg-green-700 text-white');
                return (
                  <div key={`${d}-${h}`} className={`h-6 rounded ${cls} text-center`} title={mode==='wait' ? `${v} min` : String(v)}>
                    {v ? v : ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* Lista */}
      <section>
        <h2 className="font-semibold mb-2">Eventi (max 500)</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Start</th>
                <th className="p-2 text-left">End</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Dir</th>
                <th className="p-2 text-right">Km</th>
                <th className="p-2 text-left">Cancelled</th>
                <th className="p-2 text-left">ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.validity_start_be?.replace("T"," ").slice(0,16)}</td>
                  <td className="p-2">{r.validity_end_be ? r.validity_end_be.replace("T"," ").slice(0,16) : ""}</td>
                  <td className="p-2">{r.record_type}{r.subtype ? ` / ${r.subtype}` : ""}</td>
                  <td className="p-2">{r.direction || ""}</td>
                  <td className="p-2 text-right">{r.length_km?.toFixed(1) ?? ""}</td>
                  <td className="p-2">{r.is_cancelled ? "yes" : ""}</td>
                  <td className="p-2">{r.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
