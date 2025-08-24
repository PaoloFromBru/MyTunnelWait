"use client";

import { useRef, useState } from "react";
import type { WaitItem, TunnelId } from "@/types";

const STORAGE_KEY = "mtw.waits.v1";

type Props = {
  onAfterImport?: (items: WaitItem[]) => void; // ti rimando i nuovi items
};

const TUNNEL_ALIASES: Record<string, TunnelId> = {
  "gottardo": "gottardo",
  "san gottardo": "gottardo",
  "s. gottardo": "gottardo",
  "monte bianco": "monte-bianco",
  "monte-bianco": "monte-bianco",
  "frejus": "frejus",
  "fréjus": "frejus",
  "brennero": "brennero",
};

function normalizeTunnel(v: string): TunnelId | null {
  const k = v.trim().toLowerCase().replace(/\s+/g, " ");
  if (TUNNEL_ALIASES[k]) return TUNNEL_ALIASES[k];
  // accetta già gli id
  if (["gottardo","monte-bianco","frejus","brennero"].includes(k)) return k as TunnelId;
  return null;
}

function parsePossiblyEUDate(s: string): Date | null {
  // prova ISO prima
  const tryISO = new Date(s);
  if (!isNaN(+tryISO)) return tryISO;

  // prova "DD/MM/YYYY HH:mm" o "DD/MM/YYYY"
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    const dd = parseInt(m[1], 10);
    const MM = parseInt(m[2], 10);
    const yyyy = parseInt(m[3].length === 2 ? "20"+m[3] : m[3], 10);
    const hh = m[4] ? parseInt(m[4], 10) : 0;
    const mm = m[5] ? parseInt(m[5], 10) : 0;
    const d = new Date(yyyy, MM - 1, dd, hh, mm, 0, 0);
    if (!isNaN(+d)) return d;
  }
  return null;
}

// CSV splitter molto semplice con supporto ai campi tra virgolette doppie
function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseCSV(raw: string): Partial<WaitItem>[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n").filter(l => l.trim() !== "");
  if (!lines.length) return [];
  const header = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());

  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iTunnel = idx("tunnel");
  const iDir = idx("direction", "dir");
  const iMin = idx("minutes", "minute", "mins", "min", "wait");
  const iNotedAt = idx("notedat", "datetime", "timestamp");
  const iDate = idx("date", "giorno", "data");
  const iTime = idx("time", "ora");
  const iSource = idx("source", "fonte");

  const out: Partial<WaitItem>[] = [];

  for (let li = 1; li < lines.length; li++) {
    const cols = splitCSVLine(lines[li]);
    if (cols.length === 1 && cols[0] === "") continue;

    const tRaw = iTunnel >= 0 ? cols[iTunnel] : "";
    const dRaw = iDir >= 0 ? cols[iDir] : "";
    const mRaw = iMin >= 0 ? cols[iMin] : "";
    const sRaw = iSource >= 0 ? cols[iSource] : "";

    const tunnel = normalizeTunnel(tRaw || "");
    const direction = (dRaw || "").toUpperCase() as "N" | "S" | "E" | "W";
    const minutes = parseInt((mRaw || "").replace(",", "."), 10);

    let notedAt: string | undefined;
    if (iNotedAt >= 0) {
      const dt = parsePossiblyEUDate(cols[iNotedAt]);
      if (dt) notedAt = dt.toISOString();
    } else if (iDate >= 0) {
      const datePart = cols[iDate];
      const timePart = iTime >= 0 ? cols[iTime] : "00:00";
      const dt = parsePossiblyEUDate(`${datePart} ${timePart}`);
      if (dt) notedAt = dt.toISOString();
    }

    if (!tunnel || !["N", "S", "E", "W"].includes(direction) || isNaN(minutes) || !notedAt) {
      // riga ignorata se mancano campi essenziali
      continue;
    }

    out.push({
      tunnel,
      direction,
      minutes,
      source: sRaw || undefined,
      notedAt,
    });
  }

  return out;
}

function loadExisting(): WaitItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function dedupMerge(base: WaitItem[], incoming: Partial<WaitItem>[]): WaitItem[] {
  const makeKey = (x: Partial<WaitItem>) =>
    `${x.tunnel}|${x.direction}|${x.minutes}|${x.notedAt}|${x.source ?? ""}`;

  const map = new Map<string, WaitItem>();
  for (const b of base) map.set(makeKey(b), b);

  for (const p of incoming) {
    if (!p.tunnel || !p.direction || !p.minutes || !p.notedAt) continue;
    const key = makeKey(p);
    if (!map.has(key)) {
      map.set(key, {
        id: (globalThis as any).crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
        tunnel: p.tunnel,
        direction: p.direction as any,
        minutes: p.minutes as number,
        source: p.source,
        notedAt: p.notedAt,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => +new Date(b.notedAt) - +new Date(a.notedAt));
}

export default function ImportExport({ onAfterImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [status, setStatus] = useState<string>("");

  const handleFile = async (f: File) => {
    const text = await f.text();
    let incoming: Partial<WaitItem>[] = [];

    try {
      if (f.name.toLowerCase().endsWith(".json") || text.trim().startsWith("[") || text.trim().startsWith("{")) {
        const parsed = JSON.parse(text);
        const arr: Partial<WaitItem>[] = Array.isArray(parsed) ? parsed : parsed?.items ?? [];
        incoming = arr.filter(Boolean);
      } else {
        incoming = parseCSV(text);
      }
    } catch (e: any) {
      setStatus(`Errore parsing: ${e?.message ?? String(e)}`);
      return;
    }

    const existing = loadExisting();
    const next = mode === "replace"
      ? dedupMerge([], incoming)
      : dedupMerge(existing, incoming);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setStatus(`Import OK: ${incoming.length} righe lette • Totale archivio = ${next.length}`);
    onAfterImport?.(next);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = ""; // reset per ri-selezione stesso file
  };

  const exportJSON = () => {
    const data = loadExisting();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tunnel-waits.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const data = loadExisting();
    const header = "notedAt,tunnel,direction,minutes,source\n";
    const rows = data.map(x => {
      const src = (x.source ?? "").replace(/"/g, '""');
      return `"${x.notedAt}","${x.tunnel}","${x.direction}",${x.minutes},"${src}"`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tunnel-waits.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm font-medium">Import dati (CSV/JSON)</div>
        <label className="text-sm flex items-center gap-2">
          <input
            type="radio"
            name="mode"
            value="merge"
            checked={mode === "merge"}
            onChange={() => setMode("merge")}
          />
          Merge (aggiungi & dedup)
        </label>
        <label className="text-sm flex items-center gap-2">
          <input
            type="radio"
            name="mode"
            value="replace"
            checked={mode === "replace"}
            onChange={() => setMode("replace")}
          />
          Replace (sostituisci tutto)
        </label>

        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-xl bg-black text-white px-4 py-2 text-sm hover:opacity-90"
        >
          Scegli file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,application/json,text/csv"
          className="hidden"
          onChange={onChange}
        />

        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportJSON} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">Export JSON</button>
          <button onClick={exportCSV} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">Export CSV</button>
        </div>
      </div>

      {status && <div className="text-xs text-gray-600">{status}</div>}

      <div className="text-xs text-gray-500">
        CSV attesi (minimo): <code>tunnel,direction,minutes,notedAt</code> oppure <code>date,time</code>.  
        Tunnel ammessi: <code>gottardo</code>, <code>monte-bianco</code>, <code>frejus</code>, <code>brennero</code> (o nomi equivalenti).
      </div>
    </div>
  );
}
