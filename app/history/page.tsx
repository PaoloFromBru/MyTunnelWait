"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import type { WaitItem, TunnelId } from "@/types";
import ImportExport from "@/components/ImportExport";

const STORAGE_KEY = "mtw.waits.v1";

const TUNNELS: Record<TunnelId, string> = {
  "gottardo": "San Gottardo",
  "monte-bianco": "Monte Bianco",
  "frejus": "Frejus",
  "brennero": "Brennero",
};

type DayRow = {
  dateKey: string;                 // YYYY-MM-DD
  count: number;
  median: number;
  byTD: Record<string, { count: number; median: number }>;
  items: WaitItem[];
};

function median(nums: number[]) {
  if (!nums.length) return NaN;
  const a = [...nums].sort((x,y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m-1] + a[m]) / 2;
}

export default function HistoryPage() {
  const [items, setItems] = useState<WaitItem[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setItems(raw ? JSON.parse(raw) : []);
    } catch {
      setItems([]);
    }
  }, []);

  const rows = useMemo<DayRow[]>(() => {
    const map = new Map<string, WaitItem[]>();
    for (const it of items) {
      const k = new Date(it.notedAt).toISOString().slice(0,10);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    const out: DayRow[] = [];
    for (const [dateKey, arr] of map) {
      const byTD: DayRow["byTD"] = {};
      for (const it of arr) {
        const key = `${it.tunnel}|${it.direction}`;
        if (!byTD[key]) byTD[key] = { count: 0, median: NaN };
        // accumuliamo minuti in un array temporaneo
      }
      // ricalcola mediana per chiave tunnel+dir
      const tmp: Record<string, number[]> = {};
      for (const it of arr) {
        const key = `${it.tunnel}|${it.direction}`;
        if (!tmp[key]) tmp[key] = [];
        tmp[key].push(it.minutes);
      }
      for (const k of Object.keys(tmp)) {
        byTD[k] = { count: tmp[k].length, median: Math.round(median(tmp[k])) };
      }

      out.push({
        dateKey,
        count: arr.length,
        median: Math.round(median(arr.map(x => x.minutes))),
        byTD,
        items: arr.sort((a,b) => +new Date(a.notedAt) - +new Date(b.notedAt)),
      });
    }
    return out.sort((a,b) => a.dateKey < b.dateKey ? 1 : -1);
  }, [items]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="container-p py-6 flex-1 space-y-4">
        <h2 className="text-lg font-semibold">Storico per giorno</h2>
        
        <ImportExport onAfterImport={(next) => setItems(next)} />
        <section className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left p-3">Data</th>
                <th className="text-left p-3">Rilevazioni</th>
                <th className="text-left p-3">Mediana (min)</th>
                <th className="text-left p-3">Dettaglio</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="p-4 text-center text-gray-500">Nessun dato disponibile</td></tr>
              ) : rows.map((r) => (
                <>
                  <tr key={r.dateKey} className="border-t hover:bg-gray-50 cursor-pointer"
                      onClick={() => setOpen(open === r.dateKey ? null : r.dateKey)}>
                    <td className="p-3">{new Date(r.dateKey).toLocaleDateString(undefined, { weekday:"short", day:"2-digit", month:"2-digit" })}</td>
                    <td className="p-3">{r.count}</td>
                    <td className="p-3">{r.median}</td>
                    <td className="p-3">{open === r.dateKey ? "▲" : "▼"}</td>
                  </tr>
                  {open === r.dateKey && (
                    <tr className="bg-gray-50">
                      <td colSpan={4} className="p-3">
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs text-gray-600 mb-1">Per tunnel/direzione</div>
                            <ul className="text-sm list-disc pl-5">
                              {Object.entries(r.byTD).map(([k, v]) => {
                                const [t, d] = k.split("|") as [TunnelId, string];
                                return (
                                  <li key={k}>
                                    {TUNNELS[t]} {d}: <b>{v.median} min</b> ({v.count} rilev.)
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                          <div>
                            <div className="text-xs text-gray-600 mb-1">Timeline del giorno</div>
                            <ul className="text-sm space-y-1">
                              {r.items.map((x) => (
                                <li key={x.id} className="flex justify-between">
                                  <span>{new Date(x.notedAt).toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" })} • {TUNNELS[x.tunnel]} {x.direction}</span>
                                  <span className="font-medium">{x.minutes} min</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </section>
      </main>
      <Footer />
    </div>
  );
}
