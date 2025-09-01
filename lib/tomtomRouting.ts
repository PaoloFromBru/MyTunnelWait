export type RouteDelay = {
  direction: "N" | "S";
  delaySeconds: number;
  raw?: any;
};

const TT_BASE = "https://api.tomtom.com/routing/1/calculateRoute";

async function fetchJson(url: string, attempts = 2, timeoutMs = 4000): Promise<any> {
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

export async function getRouteDelay(
  origin: string,
  destination: string,
  apiKey: string,
  direction: "N" | "S"
): Promise<RouteDelay> {
  const url = `${TT_BASE}/${origin}:${destination}/json?key=${apiKey}&traffic=true&computeTravelTimeFor=all&routeType=fastest`;
  const data = await fetchJson(url);
  const summary = data?.routes?.[0]?.summary;
  const noTraffic = Number(summary?.noTrafficTravelTimeInSeconds ?? 0);
  const live = Number(summary?.liveTrafficIncidentsTravelTimeInSeconds ?? 0);
  const delay = Math.max(0, live - noTraffic);
  return { direction, delaySeconds: delay, raw: { summary } };
}

