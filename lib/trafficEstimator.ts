import { getRouteDelay } from "./tomtomRouting";
import { getFlowChain } from "./tomtomFlow";

export type Direction = "N" | "S" | "E" | "W";
export type Tunnel = "gotthard" | "monte_bianco" | "frejus" | "brenner";

export type Estimation = {
  direction: Direction;
  waitMinutes: number | null;
  components: {
    routeDeltaSec: number | null;
    flowChainSec: number | null;
  };
  method: string;
  raw?: any;
};

type Coord = { lat: number; lon: number };
type TunnelCfg = { axis: "NS" | "EW"; a: Coord; b: Coord };

const TUNNELS: Record<Tunnel, TunnelCfg> = {
  gotthard: {
    axis: "NS",
    a: { lat: 46.6671, lon: 8.5866 }, // north portal
    b: { lat: 46.6475, lon: 8.592 }, // south portal
  },
  monte_bianco: {
    axis: "EW",
    a: { lat: 45.9286, lon: 6.8639 }, // west (France)
    b: { lat: 45.8206, lon: 6.9727 }, // east (Italy)
  },
  frejus: {
    axis: "EW",
    a: { lat: 45.1234, lon: 6.7032 }, // west
    b: { lat: 45.0865, lon: 6.7237 }, // east
  },
  brenner: {
    axis: "NS",
    a: { lat: 47.0027, lon: 11.5056 }, // north
    b: { lat: 46.8988, lon: 11.4828 }, // south
  },
};

function interpolate(a: Coord, b: Coord, n = 3): Coord[] {
  const pts: Coord[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    pts.push({
      lat: a.lat + (b.lat - a.lat) * t,
      lon: a.lon + (b.lon - a.lon) * t,
    });
  }
  return pts;
}

function cfgFor(tunnel: Tunnel, direction: Direction) {
  const t = TUNNELS[tunnel];
  if (!t) return null;
  if (t.axis === "NS") {
    if (direction === "N") {
      return {
        origin: `${t.b.lat},${t.b.lon}`,
        dest: `${t.a.lat},${t.a.lon}`,
        points: interpolate(t.b, t.a),
      };
    }
    if (direction === "S") {
      return {
        origin: `${t.a.lat},${t.a.lon}`,
        dest: `${t.b.lat},${t.b.lon}`,
        points: interpolate(t.a, t.b),
      };
    }
  } else {
    if (direction === "E") {
      return {
        origin: `${t.a.lat},${t.a.lon}`,
        dest: `${t.b.lat},${t.b.lon}`,
        points: interpolate(t.a, t.b),
      };
    }
    if (direction === "W") {
      return {
        origin: `${t.b.lat},${t.b.lon}`,
        dest: `${t.a.lat},${t.a.lon}`,
        points: interpolate(t.b, t.a),
      };
    }
  }
  return null;
}

export async function estimateWait(
  tunnel: Tunnel,
  direction: Direction,
): Promise<Estimation | null> {
  const apiKey = process.env.TOMTOM_API_KEY!;
  const cfg = cfgFor(tunnel, direction);
  if (!cfg) return null;

  let route = null;
  let flow = null;

  try {
    route = await getRouteDelay(cfg.origin, cfg.dest, apiKey, direction);
  } catch {}
  try {
    flow = await getFlowChain(cfg.points, apiKey, direction);
  } catch {}

  if (!route && !flow) return null;

  const routeDelta = route?.delaySeconds ?? 0;
  const flowChain = flow?.travelSeconds ?? 0;
  const fusedSec = Math.max(routeDelta, flowChain);
  const method = route && flow ? "max(routeDelta, flowChain)" : route ? "routing" : "flow";

  return {
    direction,
    waitMinutes: Math.round(fusedSec / 60),
    components: {
      routeDeltaSec: route ? route.delaySeconds : null,
      flowChainSec: flow ? flow.travelSeconds : null,
    },
    method,
    raw: { route: route?.raw, flow: flow?.raw },
  };
}

