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
  const [rows, setRows] = useState<Array<{ observed_at: string; wait_minutes: number; source?: string | null }>>([]);
  const [tunnel, setTunnel] = useState<TunnelId>("gottardo");
  const [direction, setDirection] = useState<Dir>("S");
  const [days, setDays] = useState<number>(7);
  const [loading, setLoading] = useState<boolean>(false);

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
      const r = await fetch(`/api/measurements/series?${qs.toString()}`, { cache: 'no-store' });
      const j = await r.json();
      setRows(j.rows ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // ricarica quando cambiano parametri
  }, [tunnel, direction, days]);

  const data = useMemo(() => {
    const sorted = rows.slice().sort((a,b) => +new Date(a.observed_at) - +new Date(b.observed_at));
    return sorted.map((x) => ({
      t: new Date(x.observed_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      minutes: x.wait_minutes,
      source: x.source ?? "—",
    }));
  }, [rows]);

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
                formatter={(val, name) => (name === "minutes" ? [`${val} min`, "Attesa"] : [String(val), name])}
                labelFormatter={(label) => `Ora: ${label}`}
              />
              <Line type="monotone" dataKey="minutes" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
