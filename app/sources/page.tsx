"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import type { WaitItem } from "@/types";

const STORAGE_KEY = "mtw.waits.v1";

type GData = { north: number | null; south: number | null; fetchedAt?: string } | null;
type MBData = { east: number | null; west: number | null; fetchedAt?: string } | null;

export default function SourcesPage() {
  // ---- Stato widget Gottardo ----
  const [gData, setGData] = useState<GData>(null);
  const [gStatus, setGStatus] = useState("");

  // ---- Stato widget Monte Bianco ----
  const [mbData, setMbData] = useState<MBData>(null);
  const [mbStatus, setMbStatus] = useState("");

  // ---- Pianificatore ----
  const [cfg, setCfg] = useState<{ gotthard: boolean; montebianco: boolean; intervalMin: number; autoAdd: boolean }>({
    gotthard: true,
    montebianco: true,
    intervalMin: 10, // minuti
    autoAdd: true,
  });
  const [running, setRunning] = useState(false);
  const [nextAt, setNextAt] = useState<number | null>(null); // timestamp ms
  const [remainingSec, setRemainingSec] = useState<number | null>(null);

  const timerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  // -------------------- UTIL --------------------
  const nowIso = () => new Date().toISOString();

  function loadExisting(): WaitItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveWithDedup(entries: WaitItem[], intervalMin: number) {
    const existing = loadExisting();
    const next = [...existing];

    const shouldAdd = (e: WaitItem) => {
      // prendi la PRIMA occorrenza con stesso tunnel/direzione (le nostre liste tengono il più recente all'inizio)
      const last = existing.find((x) => x.tunnel === e.tunnel && x.direction === e.direction);
      if (!last) return true;
      const lastT = new Date(last.notedAt).getTime();
      const curT = new Date(e.notedAt).getTime();
      const deltaMin = (curT - lastT) / 60000;
      // aggiungi se minuti sono cambiati oppure è passato abbastanza tempo
      return e.minutes !== last.minutes || deltaMin >= Math.max(5, intervalMin - 1);
    };

    for (const e of entries) {
      if (shouldAdd(e)) next.unshift(e);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next.length - existing.length; // numero di righe aggiunte
  }

  const makeId = () =>
    (globalThis as any).crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());

  // -------------------- GOTTHARD --------------------
  const fetchG = async () => {
    setGStatus("Caricamento…");
    try {
      const res = await fetch("/api/sources/gotthard", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "HTTP error");
      setGData({ north: j.north ?? null, south: j.south ?? null, fetchedAt: j.fetchedAt });
      setGStatus("OK");
      return { north: j.north ?? null, south: j.south ?? null, fetchedAt: j.fetchedAt as string | undefined };
    } catch (e: any) {
      setGStatus(`Errore: ${e?.message ?? String(e)}`);
      setGData(null);
      return null;
    }
  };

  const addG = () => {
    if (!gData) return;
    const now = nowIso();
    const entries: WaitItem[] = [];
    if (typeof gData.north === "number") {
      entries.push({ id: makeId(), tunnel: "gottardo", direction: "N", minutes: gData.north, source: "gotthard-traffic", notedAt: now });
    }
    if (typeof gData.south === "number") {
      entries.push({ id: makeId(), tunnel: "gottardo", direction: "S", minutes: gData.south, source: "gotthard-traffic", notedAt: now });
    }
    const added = saveWithDedup(entries, cfg.intervalMin);
    setGStatus(added ? `Aggiunto allo storico (+${added})` : "Niente di nuovo da aggiungere");
  };

  // -------------------- MONTE BIANCO --------------------
  const fetchMB = async () => {
    setMbStatus("Caricamento…");
    try {
      const res = await fetch("/api/sources/montebianco", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "HTTP error");
      setMbData({ east: j.east ?? null, west: j.west ?? null, fetchedAt: j.fetchedAt });
      setMbStatus("OK");
      return { east: j.east ?? null, west: j.west ?? null, fetchedAt: j.fetchedAt as string | undefined };
    } catch (e: any) {
      setMbStatus(`Errore: ${e?.message ?? String(e)}`);
      setMbData(null);
      return null;
    }
  };

  const addMB = () => {
    if (!mbData) return;
    const now = nowIso();
    const entries: WaitItem[] = [];
    // Convenzione: Francia->Italia = "E"; Italia->Francia = "W"
    if (typeof mbData.east === "number") {
      entries.push({ id: makeId(), tunnel: "monte-bianco", direction: "E", minutes: mbData.east, source: "tunnelmb.net", notedAt: now });
    }
    if (typeof mbData.west === "number") {
      entries.push({ id: makeId(), tunnel: "monte-bianco", direction: "W", minutes: mbData.west, source: "tunnelmb.net", notedAt: now });
    }
    const added = saveWithDedup(entries, cfg.intervalMin);
    setMbStatus(added ? `Aggiunto allo storico (+${added})` : "Niente di nuovo da aggiungere");
  };

  // -------------------- SCHEDULER --------------------
  async function doSampleOnce() {
    const now = Date.now();
    const entries: WaitItem[] = [];

    if (cfg.gotthard) {
      const g = await fetchG();
      if (g) {
        const notedAt = nowIso();
        if (typeof g.north === "number")
          entries.push({ id: makeId(), tunnel: "gottardo", direction: "N", minutes: g.north, source: "gotthard-traffic", notedAt });
        if (typeof g.south === "number")
          entries.push({ id: makeId(), tunnel: "gottardo", direction: "S", minutes: g.south, source: "gotthard-traffic", notedAt });
      }
    }
    if (cfg.montebianco) {
      const m = await fetchMB();
      if (m) {
        const notedAt = nowIso();
        if (typeof m.east === "number")
          entries.push({ id: makeId(), tunnel: "monte-bianco", direction: "E", minutes: m.east, source: "tunnelmb.net", notedAt });
        if (typeof m.west === "number")
          entries.push({ id: makeId(), tunnel: "monte-bianco", direction: "W", minutes: m.west, source: "tunnelmb.net", notedAt });
      }
    }

    if (cfg.autoAdd && entries.length) {
      saveWithDedup(entries, cfg.intervalMin);
    }
    // programma prossimo tick
    const next = now + cfg.intervalMin * 60_000;
    setNextAt(next);
    setRemainingSec(Math.ceil((next - Date.now()) / 1000));
  }

  const start = async () => {
    if (running) return;
    setRunning(true);
    // esegui subito un campione
    await doSampleOnce();

    // timer ogni "intervalMin"
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(doSampleOnce, cfg.intervalMin * 60_000) as unknown as number;

    // countdown 1s
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      if (nextAt) {
        const s = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
        setRemainingSec(s);
      }
    }, 1000) as unknown as number;
  };

  const stop = () => {
    setRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    timerRef.current = null;
    tickRef.current = null;
    setNextAt(null);
    setRemainingSec(null);
  };

  useEffect(() => {
    // carica entrambi i widget al primo accesso
    fetchG();
    fetchMB();
    return () => stop();
  }, []);

  // se cambia l'intervallo mentre gira, riavvia
  useEffect(() => {
    if (running) {
      stop();
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.intervalMin, cfg.gotthard, cfg.montebianco, cfg.autoAdd]);

  // pausa se la tab va in background (facoltativo ma utile)
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && running) stop();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [running]);

  // -------------------- UI --------------------
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="container-p py-6 flex-1 space-y-8">
        <h2 className="text-lg font-semibold">Sorgenti online</h2>

        {/* Pianificatore di campionamento */}
        <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-base font-semibold">Pianificatore</div>

            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={cfg.gotthard}
                onChange={(e) => setCfg((c) => ({ ...c, gotthard: e.target.checked }))}
              />
              Gottardo
            </label>
            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={cfg.montebianco}
                onChange={(e) => setCfg((c) => ({ ...c, montebianco: e.target.checked }))}
              />
              Monte Bianco
            </label>

            <label className="text-sm flex items-center gap-2">
              Intervallo
              <input
                type="number"
                min={2}
                className="w-20 rounded-xl border px-2 py-1"
                value={cfg.intervalMin}
                onChange={(e) => setCfg((c) => ({ ...c, intervalMin: Math.max(2, parseInt(e.target.value || "10", 10)) }))}
              />
              min
            </label>

            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={cfg.autoAdd}
                onChange={(e) => setCfg((c) => ({ ...c, autoAdd: e.target.checked }))}
              />
              Salva automaticamente nello storico
            </label>

            {!running ? (
              <button onClick={start} className="rounded-xl bg-black text-white px-4 py-2 text-sm">
                Avvia campionamento
              </button>
            ) : (
              <button onClick={stop} className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50">
                Ferma
              </button>
            )}

            <div className="ml-auto text-xs text-gray-600">
              {running && remainingSec !== null
                ? `Prossimo campione tra ${remainingSec}s`
                : "Inattivo"}
            </div>
          </div>

          <div className="text-xs text-gray-500">
            Il campionamento resta attivo finché questa pagina è aperta. Dedup automatico: aggiunge solo se i minuti
            cambiano oppure è passato un po’ di tempo dall’ultimo salvataggio della stessa direzione.
          </div>
        </section>

        {/* WIDGET GOTTARDO */}
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold">Gottardo — minuti live</div>
              <div className="text-xs text-gray-600">Fonte: gotthard-traffic.ch</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchG} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">Aggiorna</button>
              <button onClick={addG} disabled={!gData} className="rounded-xl bg-black text-white px-4 py-2 text-sm disabled:opacity-50">
                Aggiungi allo storico
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600">Nord → Sud</div>
              <div className="text-2xl font-semibold">{typeof gData?.north === "number" ? `${gData.north} min` : "—"}</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600">Sud → Nord</div>
              <div className="text-2xl font-semibold">{typeof gData?.south === "number" ? `${gData.south} min` : "—"}</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600">Aggiornato</div>
              <div className="text-sm">{gData?.fetchedAt ? new Date(gData.fetchedAt).toLocaleString() : "—"}</div>
            </div>
          </div>
          {gStatus && <div className="mt-2 text-xs text-gray-600">{gStatus}</div>}
        </section>

        {/* WIDGET MONTE BIANCO */}
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold">Monte Bianco — minuti live</div>
              <div className="text-xs text-gray-600">Fonte: tunnelmb.net / ATMB (parsing pagina pubblica)</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchMB} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">Aggiorna</button>
              <button onClick={addMB} disabled={!mbData} className="rounded-xl bg-black text-white px-4 py-2 text-sm disabled:opacity-50">
                Aggiungi allo storico
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600">Francia → Italia (E)</div>
              <div className="text-2xl font-semibold">{typeof mbData?.east === "number" ? `${mbData.east} min` : "—"}</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600">Italia → Francia (W)</div>
              <div className="text-2xl font-semibold">{typeof mbData?.west === "number" ? `${mbData.west} min` : "—"}</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600">Aggiornato</div>
              <div className="text-sm">{mbData?.fetchedAt ? new Date(mbData.fetchedAt).toLocaleString() : "—"}</div>
            </div>
          </div>
          {mbStatus && <div className="mt-2 text-xs text-gray-600">{mbStatus}</div>}
        </section>

        {/* Link utili extra */}
        <section className="space-y-2">
          <div className="text-sm font-medium">Altri collegamenti utili</div>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li><a className="text-indigo-600 underline" href="https://www.tcs.ch/it/" target="_blank" rel="noreferrer">TCS (CH)</a></li>
            <li><a className="text-indigo-600 underline" href="https://www.astra.admin.ch/" target="_blank" rel="noreferrer">USTRA/ASTRA (CH)</a></li>
            <li><a className="text-indigo-600 underline" href="https://www.autostrade.it/" target="_blank" rel="noreferrer">Autostrade per l’Italia (IT)</a></li>
            <li><a className="text-indigo-600 underline" href="https://traffico.viaggiareinformati.it/" target="_blank" rel="noreferrer">Viaggiare Informati (IT)</a></li>
            <li><a className="text-indigo-600 underline" href="https://www.atmb.com/info-trafic-a40-rn205/" target="_blank" rel="noreferrer">ATMB – Info traffico (MB)</a></li>
            <li><a className="text-indigo-600 underline" href="https://www.brennerautobahn.it/" target="_blank" rel="noreferrer">A22 Brennero (IT)</a></li>
          </ul>
        </section>
      </main>
      <Footer />
    </div>
  );
}
