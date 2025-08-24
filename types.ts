export type TunnelId = "gottardo" | "monte-bianco" | "frejus" | "brennero";

export interface WaitItem {
  id: string;
  tunnel: TunnelId;
  direction: "N" | "S" | "E" | "W";
  minutes: number;        // minuti di attesa
  source?: string;        // es: "TCS", "Cameras", "Manual"
  notedAt: string;        // ISO string
}
