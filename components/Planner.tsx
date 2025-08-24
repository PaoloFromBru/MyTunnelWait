"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
} from "recharts";
import type { TunnelId, WaitItem } from "@/types";
import {
  Dir,
  buildProfiles,
  binLabel,
  findMinInWindow,
  predictWait,
} from "@/lib/forecast";

const STORAGE_KEY = "mtw.waits.v1";

const TUNNELS: Record<TunnelId, string> = {
  gottardo: "San Gottardo",
  "monte-bianco": "Monte Bianco",
  frejus: "Frejus",
  brennero: "Brennero",
};

function tomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function timeToBin(timeHHMM: string): number {
  const [hh, mm] = timeHHMM.split(":").map((x) => parseInt(x, 10));
  const m = (hh || 0) * 60 + (mm || 0);
  return Math.max(0, Math.min(95, Math.floor(m / 15)));
}

function fmtTomorrow(): string {
  // usa la locale del browser DOPO il mount per evitare mismatch SSR/CSR
  return new Intl.DateTimeFormat(
    typeof navigator !== "undefined" ? navigator.language : "en-GB",
    { weekday: "long", day: "2-digit", month: "2-digit" }
  ).format(tomorrow());
}

export default function Planner() {
  const [items, setItems] = useState<WaitItem[]>([]);
  const [tunnel, setTunnel] = useState<TunnelId>("gottardo");
  const [dir, setDir] = useState<Dir>("S");

  // pannello 1: "miglior orario di arrivo" + "partenza" con tempo di viaggio
  const [arriveWindowStart, setArriveWindowStart] = useState("08:00");
  const [arriveWindowEnd, setArriveWindowEnd] = useState("18:00");
  const [travelMins, setTravelMins] = useState<number>(90);

  // pannello 2: “domani alle HH:MM…”
  const [arriveAt, setArriveAt] = useState("10:30");

  // label "Domani: lun 25/08" mostrata solo dopo mount (fix hydration)
  const [tomorrowLabel, setTomorrowLabel] = useState<string>("");

  useEffect(() => {
    setTomorrowLabel(fmtTomorrow());
  }, []);

  // carica storico
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setItems(raw ? JSON.parse(raw) : []);
    } catch {
      setItems([]);
    }
  }, []);

  const prof = useMemo(() => buildProfiles(items), [items]);

  // serie per grafico (domani)
  const chartData = useMemo(() => {
    const base = tomorrow();
    const out: { t: string; minutes: number | null }[] = [];
    for (let b = 0; b < 96; b++) {
      const at = new Date(base);
      at.setMinutes(b * 15);
      const r = predictWait(prof, tunnel, dir, at);
      out.push({ t: binLabel(b), minutes: r?.minutes ?? null });
    }
    return out;
  }, [prof, tunnel, dir]);

  // 1) trova best arrivo in finestra
  const bestArrival = useMemo(() => {
    const base = tomorrow();
    const s = timeToBin(arriveWindowStart);
    const e = timeToBin(arriveWindowEnd);
    return findMinInWindow(prof, tunnel, dir, base, s, e);
  }, [prof, tunnel, dir, arriveWindowStart, arriveWindowEnd]);

  const bestDeparture = useMemo(() => {
    if (!bestArrival) return null;
    const bestBin = bestArrival.bestBin;
    const arriveMinutes = bestBin * 15;
    const departMinutes = Math.max(0, arriveMinutes - Math.max(0, travelMins || 0));
    const departBin = Math.floor(departMinutes / 15);
    return {
      departBin,
      departTime: binLabel(departBin),
      arriveBin: bestBin,
      arriveTime: binLabel(bestBin),
      expected: bestArrival.result,
    };
  }, [bestArrival, travelMins]);

  // 2) stima attesa a orario specifico
  const expectedAt = useMemo(() => {
    const base = tomorrow();
    const b = timeToBin(arriveAt);
    base.setMinutes(b * 15);
    const r = predictWait(prof, tunnel, dir, base);
    return { bin: b, result: r };
  }, [prof, tunnel, dir, arriveAt]);

  const totalSamples = items.filter(
    (x) => x.tunnel === tunnel && x.direction === dir
  ).length;

  return (
    <div className="space-y-6">
      {/* Pannello impostazioni */}
      <section className="bg-white border rounded-2xl shadow-sm p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Tunnel</label>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={tunnel}
              onChange={(e) => setTunnel(e.target.value as TunnelId)}
            >
              {Object.entries(TUNNELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Direzione</label>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={dir}
              onChange={(e) => setDir(e.target.value as Dir)}
            >
              <option value="N">N</option>
              <option value="S">S</option>
              <option value="E">E</option>
              <option value="W">W</option>
            </select>
          </div>

          <div className="sm:col-span-3 flex items-end justify-end">
            {/* FIX hydration: render client-only + suppress warning */}
            <div className="text-xs text-gray-600" suppressHydrationWarning>
              Domani: {tomorrowLabel || "—"}
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-gray-50 p-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Blocco 1: miglior orario di arrivo/partenza */}
          <div className="space-y-2">
            <h3 className="font-medium">1) Miglior orario per minimizzare la coda</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Finestra arrivo (inizio)
                </label>
                <input
                  type="time"
                  className="w-full rounded-xl border px-3 py-2"
                  value={arriveWindowStart}
                  onChange={(e) => setArriveWindowStart(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Finestra arrivo (fine)
                </label>
                <input
                  type="time"
                  className="w-full rounded-xl border px-3 py-2"
                  value={arriveWindowEnd}
                  onChange={(e) => setArriveWindowEnd(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Tempo di viaggio (min)
                </label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-xl border px-3 py-2"
                  value={Number.isFinite(travelMins) ? travelMins : 0}
                  onChange={(e) => setTravelMins(parseInt(e.target.value, 10))}
                />
              </div>
            </div>

            <div className="text-sm">
              {bestDeparture ? (
                <div className="space-y-1">
                  <div>
                    Partenza consigliata: <b>{bestDeparture.departTime}</b> → Arrivo:{" "}
                    <b>{bestDeparture.arriveTime}</b>
                  </div>
                  <div>
                    Attesa stimata: <b>{bestDeparture.expected.minutes} min</b>{" "}
                    <span className="text-xs text-gray-600">
                      ({bestDeparture.expected.confidence} • n=
                      {bestDeparture.expected.count})
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-gray-500">
                  Dati insufficienti nella finestra scelta.
                </span>
              )}
            </div>
          </div>

          {/* Blocco 2: attesa a ora fissa */}
          <div className="space-y-2">
            <h3 className="font-medium">2) Domani sarò al tunnel alle…</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Orario di arrivo
                </label>
                <input
                  type="time"
                  className="w-full rounded-xl border px-3 py-2"
                  value={arriveAt}
                  onChange={(e) => setArriveAt(e.target.value)}
                />
              </div>
            </div>

            <div className="text-sm">
              {expectedAt.result ? (
                <>
                  Attesa stimata: <b>{expectedAt.result.minutes} min</b>{" "}
                  <span className="text-xs text-gray-600">
                    ({expectedAt.result.confidence} • n={expectedAt.result.count})
                  </span>
                </>
              ) : (
                <span className="text-gray-500">
                  Nessuna stima disponibile per quest’orario.
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="text-xs text-gray-600">
          Affidabilità: dipende dal numero di rilevazioni storiche (attuali:{" "}
          {totalSamples} per {TUNNELS[tunnel]} {dir}).
        </div>
      </section>

      {/* Grafico profilo domani */}
      <section
        className="bg-white border rounded-2xl shadow-sm p-3"
        style={{ height: 380 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" interval={7} />
            <YAxis allowDecimals={false} />
            <Tooltip
              formatter={(v, n) => [v ? `${v} min` : "—", "Attesa"]}
            />
            {/* evidenzia la finestra scelta */}
            <ReferenceArea
              x1={binLabel(timeToBin(arriveWindowStart))}
              x2={binLabel(timeToBin(arriveWindowEnd))}
              y1={0}
              y2={999}
              ifOverflow="discard"
              opacity={0.1}
            />
            <Line type="monotone" dataKey="minutes" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
