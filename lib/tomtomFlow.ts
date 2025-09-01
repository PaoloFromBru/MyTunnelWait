export type FlowDelay = {
  direction: "N" | "S";
  travelSeconds: number;
  raw?: any[];
};

const FLOW_BASE = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json";

async function fetchJson(url: string, attempts = 2, timeoutMs = 4000): Promise<any | null> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      const r = await fetch(url, { cache: "no-store", signal: controller.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function getFlowChain(
  coords: Array<{ lat: number; lon: number }>,
  apiKey: string,
  direction: "N" | "S"
): Promise<FlowDelay> {
  const results: any[] = [];
  let total = 0;

  for (const p of coords) {
    try {
      const url = `${FLOW_BASE}?key=${apiKey}&point=${p.lat},${p.lon}`;
      const data = await fetchJson(url);
      results.push(data);
      const seg = data?.flowSegmentData;
      const travel = Number(seg?.currentTravelTime ?? 0);
      total += travel;
    } catch {
      // skip point on failure
    }
  }

  return { direction, travelSeconds: total, raw: results };
}

