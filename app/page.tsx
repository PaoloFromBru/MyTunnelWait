"use client";
import { useState } from "react";

export default function Home() {
  const [queueKm, setQueueKm] = useState(5);
  const [lambda, setLambda] = useState(1200);
  const [mu, setMu] = useState(1000);
  const [lanes, setLanes] = useState(1);
  const [result, setResult] = useState<string>("");

  async function estimate() {
    const r = await fetch("/api/estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queueKm, lambda, mu, lanes })
    }).then(r => r.json());
    setResult(r.readable);
  }

  return (
    <main className="mx-auto max-w-xl p-4 space-y-5">
      <h1 className="text-2xl font-semibold">Attesa al tunnel</h1>

      <NumberField label="Coda (km)" value={queueKm} onChange={setQueueKm} step={0.5} />
      <NumberField label="Arrivi λ (veh/h)" value={lambda} onChange={setLambda} step={100} />
      <NumberField label="Capacità μ (veh/h)" value={mu} onChange={setMu} step={100} />
      <NumberField label="Corsie verso il collo" value={lanes} onChange={setLanes} step={1} min={1} />

      <button onClick={estimate} className="w-full rounded bg-black text-white py-3">Stima ora</button>

      {result && (
        <div className="rounded border p-4 text-lg">⏱️ Attesa stimata: <b>{result}</b></div>
      )}

      <p className="text-sm opacity-70">Nota: se λ ≥ μ la coda cresce; la stima risulta “in incremento”.</p>
    </main>
  );
}

function NumberField({ label, value, onChange, step=1, min=0 }:{ label:string; value:number; onChange:(v:number)=>void; step?:number; min?:number; }) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input type="number" value={value} step={step} min={min}
        onChange={e=>onChange(parseFloat(e.target.value))}
        className="mt-1 w-full rounded border p-2" />
    </label>
  );
}
