import { WaitItem } from "@/types";

export const SAMPLE_DATA: WaitItem[] = [
  {
    id: "seed-1",
    tunnel: "gottardo",
    direction: "S",
    minutes: 35,
    source: "TCS",
    notedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: "seed-2",
    tunnel: "gottardo",
    direction: "N",
    minutes: 10,
    source: "Manual",
    notedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
];
