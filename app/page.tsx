"use client";

import { useEffect, useMemo, useState } from "react";
import Footer from "@/components/Footer";
import type { WaitItem, TunnelId } from "@/types";
import Link from "next/link";

const STORAGE_KEY = "mtw.waits.v1";

const TUNNELS: Record<TunnelId, string> = {
  "gottardo": "San Gottardo",
  "monte-bianco": "Monte Bianco",
  "frejus": "Frejus",
  "brennero": "Brennero",
};

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export default function Home() {
  const [items, setItems] = useState<WaitItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setItems(raw ? JSON.parse(raw) : []);
    } catch {
      setItems([]);
    }
  }, []);

  const kpis = useMemo(() => {
    const byDay = new Map<string, WaitItem[]>();
    for (const it of items) {
      const k = new Date(it.notedAt).toISOString().slice(0, 10);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push(it);
    }
    const today = byDay.get(todayKey()) ?? [];
    const last = [...items].sort((a,b) => +new Date(b.notedAt) - +new Date(a.notedAt))[0];

    const countToday = today.length;
    const avgToday = countToday
      ? Math.round(today.reduce((s,x) => s + x.minutes, 0) / countToday)
      : 0;

    return {
      total: items.length,
      countToday,
      avgToday,
      lastText: last
        ? `${TUNNELS[last.tunnel]} ${last.direction} • ${last.minutes} min • ${new Date(last.notedAt).toLocaleString()}`
        : "—",
    };
  }, [items]);

  const Card = ({
    title, href, desc, emoji,
  }: { title: string; href: string; desc: string; emoji: string }) => (
    <Link
      href={href}
      className="group rounded-2xl border bg-white p-5 shadow-sm hover:shadow transition flex flex-col"
    >
      <div className="text-3xl mb-2">{emoji}</div>
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm text-gray-600">{desc}</div>
      <div className="mt-3 text-indigo-600 text-sm opacity-0 group-hover:opacity-100">
        Apri →
      </div>
    </Link>
  );

  const Kpi = ({ label, value }: { label: string; value: string | number }) => (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs text-gray-600">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <main className="container-p py-8 flex-1 space-y-8">
        <section className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-3xl border p-6">
          <h2 className="text-xl font-semibold">Benvenuto 👋</h2>
          <p className="text-gray-700 mt-1">
            Scegli cosa vuoi fare: inserire nuove rilevazioni, pianificare il viaggio di domani o
            visualizzare grafici e storico.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
            <Kpi label="Rilevazioni totali" value={kpis.total} />
            <Kpi label="Oggi (conteggio / media min)" value={`${kpis.countToday} / ${kpis.avgToday}`} />
            <Kpi label="Ultima rilevazione" value={kpis.lastText} />
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Inserisci rilevazioni" href="/log" desc="Aggiungi tempi d’attesa e consulta la lista." emoji="📝" />
          <Card title="Pianifica" href="/plan" desc="Quando partire per minimizzare la coda domani." emoji="🧭" />
          <Card title="Grafico" href="/chart" desc="Andamento dell’attesa nel tempo." emoji="📈" />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Storico" href="/history" desc="Riepilogo per giorno, tunnel e direzione." emoji="🗂️" />
          <Card title="Sorgenti online" href="/sources" desc="Link rapidi a siti ufficiali e feed." emoji="🌐" />
          <Card
            title="Modalità aereo"
            href="/airplane-mode"
            desc="Ricevi un promemoria quando ti avvicini al confine svizzero."
            emoji="✈️"
          />
        </section>
      </main>
      <Footer />
    </div>
  );
}
