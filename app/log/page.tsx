"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import { SAMPLE_DATA } from "@/lib/sample";
import type { TunnelId, WaitItem } from "@/types";

type SortKey = "notedAt" | "minutes";
type SortDir = "asc" | "desc";

const TUNNELS: Record<TunnelId, string> = {
  "gottardo": "San Gottardo",
  "monte-bianco": "Monte Bianco",
  "frejus": "Frejus",
  "brennero": "Brennero",
};

const STORAGE_KEY = "mtw.waits.v1";

export default function LogPage() {
  const [items, setItems] = useState<WaitItem[]>([]);
  const [filterTunnel, setFilterTunnel] = useState<"" | TunnelId>("");
  const [sortKey, setSortKey] = useState<SortKey>("notedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [tunnel, setTunnel] = useState<TunnelId>("gottardo");
  const [direction, setDirection] = useState<"N" | "S" | "E" | "W">("S");
  const [minutes, setMinutes] = useState<number>(0);
  const [source, setSource] = useState<string>("");

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { setItems(JSON.parse(raw)); return; } catch {}
    }
    setItems(SAMPLE_DATA);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = () => {
    if (!Number.isFinite(minutes) || minutes < 0) return;
    const id = (globalThis as any).crypto?.randomUUID
      ? (globalThis as any).crypto.randomUUID()
      : String(Date.now());
    const newItem: WaitItem = {
      id,
      tunnel,
      direction,
      minutes: Math.round(minutes),
      source: source?.trim() || undefined,
      notedAt: new Date().toISOString(),
    };
    setItems((prev) => [newItem, ...prev]);
    setMinutes(0);
    setSource("");
  };

  const deleteItem = (id: string) => setItems((prev) => prev.filter((x) => x.id !== id));

  const clearAll = () => {
    if (confirm("Cancellare tutte le rilevazioni?")) setItems([]);
  };

  const filtered = useMemo(() => {
    let out = [...items];
    if (filterTunnel) out = out.filter((x) => x.tunnel === filterTunnel);
    out.sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "minutes") return (a.minutes - b.minutes) * mul;
      return (new Date(a.notedAt).getTime() - new Date(b.notedAt).getTime()) * mul;
    });
    return out;
  }, [items, filterTunnel, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="container-p py-6 flex-1">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Rilevazioni</h2>
          <Link href="/" className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">← Home</Link>
        </div>

        {/* Form */}
        <section className="bg-white border rounded-2xl shadow-sm p-4 mb-6">
          <h3 className="text-base font-semibold mb-3">Aggiungi rilevazione</h3>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Tunnel</label>
              <select className="w-full rounded-xl border px-3 py-2"
                value={tunnel} onChange={(e) => setTunnel(e.target.value as TunnelId)}>
                {Object.entries(TUNNELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Direzione</label>
              <select className="w-full rounded-xl border px-3 py-2"
                value={direction} onChange={(e) => setDirection(e.target.value as any)}>
                <option value="N">N</option><option value="S">S</option><option value="E">E</option><option value="W">W</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Attesa (min)</label>
              <input type="number" min={0} className="w-full rounded-xl border px-3 py-2"
                value={Number.isFinite(minutes) ? minutes : ""} onChange={(e) => setMinutes(parseInt(e.target.value, 10))}
                placeholder="es. 35" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Fonte (opz.)</label>
              <input type="text" className="w-full rounded-xl border px-3 py-2"
                value={source} onChange={(e) => setSource(e.target.value)} placeholder="TCS / Telecamere / Manual" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={addItem} className="rounded-xl bg-black text-white px-4 py-2 text-sm hover:opacity-90">Aggiungi</button>
            <button onClick={clearAll} className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50">Svuota</button>
          </div>
        </section>

        {/* Controls */}
        <section className="flex flex-wrap items-center gap-3 mb-4">
          <select className="rounded-xl border px-3 py-2" value={filterTunnel} onChange={(e) => setFilterTunnel(e.target.value as any)}>
            <option value="">Tutti i tunnel</option>
            {Object.entries(TUNNELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">Ordina per:</span>
            <button className={`rounded-xl border px-3 py-1 ${sortKey === "notedAt" ? "bg-gray-100" : ""}`}
              onClick={() => toggleSort("notedAt")}>Data {sortKey === "notedAt" ? (sortDir === "asc" ? "↑" : "↓") : ""}</button>
            <button className={`rounded-xl border px-3 py-1 ${sortKey === "minutes" ? "bg-gray-100" : ""}`}
              onClick={() => toggleSort("minutes")}>Minuti {sortKey === "minutes" ? (sortDir === "asc" ? "↑" : "↓") : ""}</button>
          </div>
          <Link href="/chart" className="rounded-xl bg-indigo-600 text-white px-3 py-2 text-sm">Apri grafico</Link>
        </section>

        {/* Table */}
        <section className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left p-3">Tunnel</th>
                <th className="text-left p-3">Dir</th>
                <th className="text-left p-3">Attesa</th>
                <th className="text-left p-3">Fonte</th>
                <th className="text-left p-3">Rilevato</th>
                <th className="text-right p-3">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-4 text-center text-gray-500">Nessuna rilevazione</td></tr>
              ) : filtered.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-3">{TUNNELS[row.tunnel]}</td>
                  <td className="p-3">{row.direction}</td>
                  <td className="p-3"><span className="inline-flex items-center rounded-lg bg-gray-100 px-2 py-1">{row.minutes} min</span></td>
                  <td className="p-3">{row.source ?? "—"}</td>
                  <td className="p-3">{new Date(row.notedAt).toLocaleString()}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => deleteItem(row.id)} className="rounded-lg border px-3 py-1 hover:bg-gray-50">Elimina</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
      <Footer />
    </div>
  );
}
