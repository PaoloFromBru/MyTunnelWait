"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { TunnelId } from "@/types";

const TUNNELS: Record<TunnelId, string> = {
  "gottardo": "San Gottardo",
  "monte-bianco": "Monte Bianco",
  "frejus": "Frejus",
  "brennero": "Brennero",
};

type Dir = "N" | "S" | "E" | "W";

export default function WaitsChart() {
  const [rowsManual, setRowsManual] = useState<Array<{ observed_at: string; wait_minutes: number; source?: string | null }>>([]);
  const [rowsOfficial, setRowsOfficial] = useState<Array<{ observed_at: string; wait_minutes: number; source?: string | null }>>([]);
  const [tunnel, setTunnel] = useState<TunnelId>("gottardo");
  const [direction, setDirection] = useState<Dir>("S");
  const [days, setDays] = useState<number>(7);
  const [loading, setLoading] = useState<boolean>(false);
  const [source, setSource] = useState<'manual' | 'official' | 'both'>('both');

  const AXIS: Record<TunnelId, 'NS' | 'EW'> = {
    "gottardo": 'NS',
    "brennero": 'NS',
    "monte-bianco": 'EW',
    "frejus": 'EW',
  };

  const toDbTunnel = (t: TunnelId) => (
    t === 'gottardo' ? 'gotthard' :
    t === 'monte-bianco' ? 'monte_bianco' :
    t === 'frejus' ? 'frejus' : 'brenner'
  );
  const toDbDir = (t: TunnelId, d: Dir) => {
    const axis = AXIS[t];
    return axis === 'NS'
      ? (d === 'N' ? 'southbound' : 'northbound')
      : (d === 'E' ? 'northbound' : 'southbound');
  };

  const load = async () => {
    setLoading(true);
    try {
      const dbTunnel = toDbTunnel(tunnel);
      const dbDir = toDbDir(tunnel, direction);
      const qs = new URLSearchParams({ tunnel: dbTunnel, direction: dbDir, days: String(days) });
      if (source === 'manual' || source === 'both') {
        const r = await fetch(`/api/measurements/series?${qs.toString()}`, { cache: 'no-store' });
        const j = await r.json();
        setRowsManual(j.rows ?? []);
      } else setRowsManual([]);
      if (source === 'official' || source === 'both') {
        const r2 = await fetch(`/api/official/series?${qs.toString()}`, { cache: 'no-store' });
        const j2 = await r2.json();
        setRowsOfficial(j2.rows ?? []);
      } else setRowsOfficial([]);
    } catch {
      setRowsManual([]);
      setRowsOfficial([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // ricarica quando cambiano parametri
  }, [tunnel, direction, days]);

  const data = useMemo(() => {
    const m = rowsManual.slice().sort((a,b)=>+new Date(a.observed_at)-+new Date(b.observed_at));
    const o = rowsOfficial.slice().sort((a,b)=>+new Date(a.observed_at)-+new Date(b.observed_at));

    const formatKey = (iso: string) => {
      const d = new Date(iso);
      if (days <= 3) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      if (days <= 30) return d.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit' });
      return d.toLocaleDateString();
    };

    const map = new Map<string, { t: string; minutesManual?: number; minutesOfficial?: number }>();
    for (const x of m) {
      const t = formatKey(x.observed_at);
      const cur = map.get(t) || { t };
      cur.minutesManual = x.wait_minutes;
      map.set(t, cur);
    }
    for (const x of o) {
      const t = formatKey(x.observed_at);
      const cur = map.get(t) || { t };
      cur.minutesOfficial = x.wait_minutes;
      map.set(t, cur);
    }
    return [...map.values()].sort((a,b)=>a.t.localeCompare(b.t));
  }, [rowsManual, rowsOfficial, days]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Tunnel</label>
          <select
            className="rounded-xl border px-3 py-2"
            value={tunnel}
            onChange={(e) => setTunnel(e.target.value as TunnelId)}
          >
            {Object.entries(TUNNELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Direzione</label>
          <select
            className="rounded-xl border px-3 py-2"
            value={direction}
            onChange={(e) => setDirection(e.target.value as Dir)}
          >
            {AXIS[tunnel] === 'NS' ? (
              <>
                <option value="N">N</option>
                <option value="S">S</option>
              </>
            ) : (
              <>
                <option value="E">E</option>
                <option value="W">W</option>
              </>
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Fonte</label>
          <select className="rounded-xl border px-3 py-2" value={source} onChange={(e)=>setSource(e.target.value as any)}>
            <option value="manual">Manuale</option>
            <option value="official">Ufficiale</option>
            <option value="both">Entrambi</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Giorni</label>
          <select
            className="rounded-xl border px-3 py-2"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
          >
            {[1,3,7,14,28].map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <button
          onClick={load}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
          title="Ricarica"
        >
          {loading ? 'Caricamento…' : 'Aggiorna'}
        </button>
      </div>

      <div className="bg-white border rounded-2xl shadow-sm p-3" style={{ height: 380 }}>
        {data.length === 0 ? (
          <div className="h-full grid place-items-center text-gray-500 text-sm">
            Nessun dato per {TUNNELS[tunnel]} ({direction}).
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" />
              <YAxis allowDecimals={false} domain={[0, (dataMax: number) => Math.max(10, dataMax + 5)]} />
              <Tooltip
                formatter={(val, name) => ([`${val} min`, name === 'minutesManual' ? 'Manuale' : 'Ufficiale'])}
                labelFormatter={(label) => `${label}`}
              />
              {(source === 'manual' || source === 'both') && (
                <Line type="monotone" dataKey="minutesManual" name="Manuale" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              )}
              {(source === 'official' || source === 'both') && (
                <Line type="monotone" dataKey="minutesOfficial" name="Ufficiale" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
