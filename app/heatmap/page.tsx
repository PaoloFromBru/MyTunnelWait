// app/heatmap/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Heatmap from "../../components/Heatmap";

export const dynamic = "force-dynamic"; // niente cache

type Row = {
  dow: number;      // 0=Sun ... 6=Sat (da Postgres)
  hour: number;     // 0..23
  category: "incident" | "wait";
  events: number;
};

function emptyMatrix(): number[][] {
  // 7 (Mon..Sun) x 24
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

function pgDowToMonFirst(pgDow: number): number {
  // Postgres: 0=Sun..6=Sat -> Mon-first: 0=Mon..6=Sun
  // map: Sun(0)->6, Mon(1)->0, Tue(2)->1, ..., Sat(6)->5
  return pgDow === 0 ? 6 : pgDow - 1;
}

export default async function Page() {
  // Legge tutta la MV (poche righe: 7*24*2)
  const { data, error } = await supabaseAdmin
    .from("mv_traffic_heatmap_weekly")
    .select("dow,hour,category,events");

  if (error) {
    return (
      <div className="p-6 text-red-600">
        Errore nel caricamento heatmap: {error.message}
      </div>
    );
  }

  const rows = (data ?? []) as Row[];

  const incident = emptyMatrix();
  const wait = emptyMatrix();

  let maxIncident = 0;
  let maxWait = 0;

  for (const r of rows) {
    const d = pgDowToMonFirst(r.dow);
    if (r.category === "incident") {
      incident[d][r.hour] = r.events;
      if (r.events > maxIncident) maxIncident = r.events;
    } else if (r.category === "wait") {
      wait[d][r.hour] = r.events;
      if (r.events > maxWait) maxWait = r.events;
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Weekly Heatmap</h1>
          <p className="text-sm text-gray-500">
            Eventi aggregati per fascia oraria (Mon→Sun, 0–23). Categorie: Incidenti e Attese (Wait).
          </p>
        </div>
      </header>

      <Heatmap
        title="Wait (queues / delays)"
        matrix={wait}
        max={Math.max(1, maxWait)}
        legendNote="Numero eventi/h"
      />

      <Heatmap
        title="Incident"
        matrix={incident}
        max={Math.max(1, maxIncident)}
        legendNote="Numero eventi/h"
      />
    </div>
  );
}
