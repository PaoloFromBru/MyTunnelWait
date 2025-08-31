"use client";

import { useEffect, useMemo, useState } from "react";
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

// Assi validi per tunnel: NS = Nord/Sud, EW = Est/Ovest
const AXIS: Record<TunnelId, 'NS' | 'EW'> = {
  "gottardo": 'NS',
  "brennero": 'NS',
  "monte-bianco": 'EW',
  "frejus": 'EW',
};

const ALLOWED_DIRS: Record<'NS' | 'EW', Array<WaitItem["direction"]>> = {
  NS: ['N','S'],
  EW: ['E','W'],
};

const TUNNEL_TO_DB: Record<TunnelId, 'gotthard' | 'monte_bianco' | 'frejus' | 'brenner'> = {
  'gottardo': 'gotthard',
  'monte-bianco': 'monte_bianco',
  'frejus': 'frejus',
  'brennero': 'brenner',
};

export default function LogPage() {
  const [items, setItems] = useState<WaitItem[]>([]);
  const [includeAuto, setIncludeAuto] = useState(false);
  const [filterTunnel, setFilterTunnel] = useState<"" | TunnelId>("");
  const [sortKey, setSortKey] = useState<SortKey>("notedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [tunnel, setTunnel] = useState<TunnelId>("gottardo");
  const [direction, setDirection] = useState<"N" | "S" | "E" | "W">("S");
  const [minutes, setMinutes] = useState<number>(0);
  const [source, setSource] = useState<string>("");
  const [submitInfo, setSubmitInfo] = useState<null | {
    ok: boolean;
    status: number;
    summary: string;
    payload?: any;
    response?: any;
  }>(null);

  const [editing, setEditing] = useState<null | {
    id: string;
    tunnel: TunnelId;
    direction: WaitItem['direction'];
    minutes: number;
    note?: string;
    observedAt?: string;
  }>(null);

  async function loadFromDB() {
    try {
      const src = includeAuto ? 'all' : 'manual';
      const r = await fetch(`/api/measurements/list?limit=500&source=${src}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const rows: Array<{ id:string; observed_at:string; tunnel:string; direction:string; wait_minutes:number; note?:string|null; source?:string|null }>
        = j.rows || [];
      // Map DB → UI shape
      const out: WaitItem[] = rows.map((row) => {
        const tunnelDb = row.tunnel as any;
        const tunnelUi: TunnelId = tunnelDb === 'gotthard' ? 'gottardo'
          : tunnelDb === 'monte_bianco' ? 'monte-bianco'
          : tunnelDb === 'frejus' ? 'frejus'
          : 'brennero';
        const axis = AXIS[tunnelUi];
        const d = row.direction;
        const dirUi: WaitItem["direction"] = axis === 'NS'
          ? (d === 'southbound' ? 'N' : 'S')
          : (d === 'northbound' ? 'E' : 'W');
        return {
          id: row.id,
          tunnel: tunnelUi,
          direction: dirUi,
          minutes: row.wait_minutes,
          source: row.source || undefined,
          notedAt: row.observed_at,
        };
      });
      setItems(out);
    } catch (e) {
      // fallback: lascia eventuale cache locale oppure sample
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try { setItems(JSON.parse(raw)); return; } catch {}
      }
      setItems(SAMPLE_DATA);
    }
  }

  useEffect(() => { loadFromDB(); }, [includeAuto]);

  // Se cambia tunnel, forza una direzione valida per l'asse relativo
  useEffect(() => {
    const axis = AXIS[tunnel];
    const allowed = ALLOWED_DIRS[axis];
    if (!allowed.includes(direction)) setDirection(allowed[0]);
  }, [tunnel]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = async () => {
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
    // Prova a inviare a Supabase tramite API server
    try {
      const dbTunnel = TUNNEL_TO_DB[tunnel];
      const axis = AXIS[tunnel];
      // Validazione direzione per tunnel
      if (axis === 'NS' && !(direction === 'N' || direction === 'S')) {
        setSubmitInfo({ ok: false, status: 0, summary: `Direzione non valida per ${TUNNELS[tunnel]}: usa N/S`, payload: newItem });
        return;
      }
      if (axis === 'EW' && !(direction === 'E' || direction === 'W')) {
        setSubmitInfo({ ok: false, status: 0, summary: `Direzione non valida per ${TUNNELS[tunnel]}: usa E/W`, payload: newItem });
        return;
      }
      const dbDir = axis === 'NS'
        ? (direction === 'N' ? 'southbound' : 'northbound')
        : (direction === 'E' ? 'northbound' : 'southbound');

      if (!dbTunnel) {
        setSubmitInfo({ ok: false, status: 0, summary: `Tunnel non supportato dall'enum DB: ${tunnel}`, payload: newItem });
      } else {
        const body = {
          tunnel: dbTunnel,
          direction: dbDir,
          wait_minutes: Math.round(minutes),
          note: source?.trim() || undefined,
          observed_at: new Date().toISOString(),
        };
        const res = await fetch("/api/measurements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        }).catch((e) => {
          setSubmitInfo({ ok: false, status: -1, summary: `Errore rete: ${e?.message || String(e)}`, payload: body });
          throw e;
        });

        let resp: any = null;
        const ct = res.headers.get("content-type") || "";
        try { resp = ct.includes("application/json") ? await res.json() : await res.text(); } catch {}

        if (!res.ok) {
          const summary = `Supabase: ${res.status} ${res.statusText || ""}`.trim();
          setSubmitInfo({ ok: false, status: res.status, summary, payload: body, response: resp });
          console.warn("[log->manual_measurements] insert failed", res.status, resp);
        } else {
          setSubmitInfo({ ok: true, status: res.status, summary: `Inserito su Supabase`, payload: body, response: resp });
          // Dopo successo, ricarica lista dal DB per coerenza
          await loadFromDB();
          setMinutes(0);
          setSource("");
        }
      }
    } catch (e) {
      console.warn("[log->manual_measurements] unexpected", e);
    }
  };

  function toDbDirection(t: TunnelId, d: WaitItem['direction']): 'northbound' | 'southbound' {
    const axis = AXIS[t];
    return axis === 'NS'
      ? (d === 'N' ? 'southbound' : 'northbound')
      : (d === 'E' ? 'northbound' : 'southbound');
  }

  const startEdit = (row: WaitItem) => {
    setEditing({ id: row.id, tunnel: row.tunnel, direction: row.direction, minutes: row.minutes, note: row.source, observedAt: row.notedAt });
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const body: any = {
        tunnel: TUNNEL_TO_DB[editing.tunnel],
        direction: toDbDirection(editing.tunnel, editing.direction),
        wait_minutes: Math.round(editing.minutes),
        note: editing.note ?? null,
      };
      if (editing.observedAt) body.observed_at = new Date(editing.observedAt).toISOString();

      const r = await fetch(`/api/measurements/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const ct = r.headers.get('content-type') || '';
      const resp = ct.includes('application/json') ? await r.json().catch(()=>null) : await r.text().catch(()=>null);
      if (!r.ok) {
        setSubmitInfo({ ok: false, status: r.status, summary: 'Modifica fallita', payload: body, response: resp });
      } else {
        setSubmitInfo({ ok: true, status: r.status, summary: 'Modifica salvata', payload: body, response: resp });
        await loadFromDB();
        setEditing(null);
      }
    } catch (e: any) {
      setSubmitInfo({ ok: false, status: -1, summary: `Errore rete: ${e?.message || String(e)}` });
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Eliminare questa rilevazione dal database?")) return;
    try {
      const r = await fetch(`/api/measurements/${id}`, { method: 'DELETE' });
      const ct = r.headers.get('content-type') || '';
      const resp = ct.includes('application/json') ? await r.json().catch(()=>null) : await r.text().catch(()=>null);
      if (!r.ok) {
        setSubmitInfo({ ok: false, status: r.status, summary: `Eliminazione fallita`, response: resp });
      } else {
        setSubmitInfo({ ok: true, status: r.status, summary: `Eliminazione riuscita`, response: resp });
        await loadFromDB();
      }
    } catch (e: any) {
      setSubmitInfo({ ok: false, status: -1, summary: `Errore rete: ${e?.message || String(e)}` });
    }
  };

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
      <main className="container-p py-6 flex-1">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Rilevazioni</h2>
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
                {ALLOWED_DIRS[AXIS[tunnel]].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
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

        {submitInfo && (
          <section className={`rounded-xl border p-3 mb-6 text-sm ${submitInfo.ok ? 'bg-green-50 border-green-300 text-green-900' : 'bg-red-50 border-red-300 text-red-900'}`}>
            <div className="font-medium mb-1">{submitInfo.ok ? 'Salvataggio riuscito' : 'Salvataggio fallito'}</div>
            <div className="mb-2">{submitInfo.summary}{submitInfo.status ? ` (status ${submitInfo.status})` : ''}</div>
            <details className="mt-1">
              <summary className="cursor-pointer select-none">Dettagli</summary>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                <pre className="whitespace-pre-wrap break-words bg-white/60 p-2 rounded border"><strong>Payload</strong>
{JSON.stringify(submitInfo.payload, null, 2)}</pre>
                {submitInfo.response !== undefined && (
                  <pre className="whitespace-pre-wrap break-words bg-white/60 p-2 rounded border"><strong>Response</strong>
{typeof submitInfo.response === 'string' ? submitInfo.response : JSON.stringify(submitInfo.response, null, 2)}</pre>
                )}
              </div>
            </details>
          </section>
        )}

        {editing && (
          <section className="rounded-2xl border bg-white p-4 shadow-sm mb-6">
            <h3 className="text-base font-semibold mb-3">Modifica rilevazione</h3>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Tunnel</label>
                <select className="w-full rounded-xl border px-3 py-2"
                  value={editing.tunnel}
                  onChange={(e)=> setEditing(prev => prev && ({...prev, tunnel: e.target.value as TunnelId}))}
                >
                  {Object.entries(TUNNELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Direzione</label>
                <select className="w-full rounded-xl border px-3 py-2"
                  value={editing.direction}
                  onChange={(e)=> setEditing(prev => prev && ({...prev, direction: e.target.value as any}))}
                >
                  {ALLOWED_DIRS[AXIS[editing.tunnel]].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Attesa (min)</label>
                <input type="number" min={0} className="w-full rounded-xl border px-3 py-2"
                  value={Number.isFinite(editing.minutes) ? editing.minutes : ''}
                  onChange={(e)=> setEditing(prev => prev && ({...prev, minutes: parseInt(e.target.value||'0', 10)}))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-600 mb-1">Nota</label>
                <input type="text" className="w-full rounded-xl border px-3 py-2"
                  value={editing.note || ''}
                  onChange={(e)=> setEditing(prev => prev && ({...prev, note: e.target.value}))}
                  placeholder="Fonte / commento"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={saveEdit} className="rounded-xl bg-black text-white px-4 py-2 text-sm hover:opacity-90">Salva</button>
              <button onClick={cancelEdit} className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50">Annulla</button>
            </div>
          </section>
        )}

        {/* Controls */}
        <section className="flex flex-wrap items-center gap-3 mb-4">
          <select className="rounded-xl border px-3 py-2" value={filterTunnel} onChange={(e) => setFilterTunnel(e.target.value as any)}>
            <option value="">Tutti i tunnel</option>
            {Object.entries(TUNNELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={includeAuto} onChange={(e)=>setIncludeAuto(e.target.checked)} />
            Includi automatiche (TomTom)
          </label>
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
                  <td className="p-3">
                    {row.source === 'tomtom' ? (
                      <span className="inline-flex items-center rounded-lg bg-yellow-100 text-yellow-900 px-2 py-1 text-xs font-medium" title="Misura automatica (TomTom)">AUTO</span>
                    ) : (
                      row.source ?? "—"
                    )}
                  </td>
                  <td className="p-3">{new Date(row.notedAt).toLocaleString()}</td>
                  <td className="p-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => startEdit(row)} className="rounded-lg border px-3 py-1 hover:bg-gray-50">Modifica</button>
                      <button onClick={() => deleteItem(row.id)} className="rounded-lg border px-3 py-1 hover:bg-gray-50">Elimina</button>
                    </div>
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
