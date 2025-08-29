export type ManualMeasurementInput = {
  tunnel: "gotthard" | "monte_bianco";
  direction: "northbound" | "southbound";
  wait_minutes: number;
  lanes_open?: number;
  note?: string;
  observed_at?: string; // new Date().toISOString()
  lat?: number;
  lon?: number;
};

export async function submitManualMeasurement(input: ManualMeasurementInput) {
  const res = await fetch("/api/measurements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Submit failed");
  }
  return (await res.json()) as { ok: true; id: string; observed_at: string };
}
