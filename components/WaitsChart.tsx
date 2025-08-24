"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { TunnelId, WaitItem } from "@/types";

const STORAGE_KEY = "mtw.waits.v1";

const TUNNELS: Record<TunnelId, string> = {
  "gottardo": "San Gottardo",
  "monte-bianco": "Monte Bianco",
  "frejus": "Frejus",
  "brennero": "Brennero",
};

type Dir = "N" | "S" | "E" | "W";

export default function WaitsChart() {
  const [items, setItems] = useState<WaitItem[]>([]);
  const [tunnel, setTunnel] = useState<TunnelId>("gottardo");
  const [direction, setDirection] = useState<Dir>("S");

  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return setItems([]);
      setItems(JSON.parse(raw));
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    load();
    // opzionale: aggiorna se cambi scheda/finestra
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const data = useMemo(() => {
    const filtered = items
      .filter((x) => x.tunnel === tunnel && x.direction === direction)
      .sort((a, b) => new Date(a.notedAt).getTime() - new Date(b.notedAt).getTime());

    return filtered.map((x) => ({
      t: new Date(x.notedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      minutes: x.minutes,
      source: x.source ?? "—",
    }));
  }, [items, tunnel, direction]);

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
            <option value="N">N</option>
            <option value="S">S</option>
            <option value="E">E</option>
            <option value="W">W</option>
          </select>
        </div>

        <button
          onClick={load}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
          title="Ricarica i dati da localStorage"
        >
          Aggiorna
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
