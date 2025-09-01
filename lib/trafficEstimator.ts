import { getRouteDelay } from "./tomtomRouting";
import { getFlowChain } from "./tomtomFlow";

export type Estimation = {
  direction: "N" | "S";
  waitMinutes: number | null;
  components: {
    routeDeltaSec: number | null;
    flowChainSec: number | null;
  };
  method: string;
  raw?: any;
};

const ORIGINS: Record<"N" | "S", string> = {
  N: process.env.TT_ROUTE_ORIGIN_SN ?? "46.6475,8.5920",
  S: process.env.TT_ROUTE_ORIGIN_NS ?? "46.6671,8.5866",
};

const DESTS: Record<"N" | "S", string> = {
  N: process.env.TT_ROUTE_DEST_SN ?? "46.6671,8.5866",
  S: process.env.TT_ROUTE_DEST_NS ?? "46.6475,8.5920",
};

const FLOW_POINTS: Record<"N" | "S", Array<{ lat: number; lon: number }>> = {
  N: [
    { lat: 46.6405, lon: 8.591 },
    { lat: 46.6445, lon: 8.5915 },
    { lat: 46.6485, lon: 8.592 },
  ],
  S: [
    { lat: 46.6605, lon: 8.5885 },
    { lat: 46.6645, lon: 8.5878 },
    { lat: 46.6685, lon: 8.5869 },
  ],
};

export async function estimateWait(direction: "N" | "S"): Promise<Estimation | null> {
  const apiKey = process.env.TOMTOM_API_KEY!;
  let route = null;
  let flow = null;

  try {
    route = await getRouteDelay(ORIGINS[direction], DESTS[direction], apiKey, direction);
  } catch {}
  try {
    flow = await getFlowChain(FLOW_POINTS[direction], apiKey, direction);
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

