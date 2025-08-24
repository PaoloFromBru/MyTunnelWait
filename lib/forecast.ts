import type { TunnelId, WaitItem } from "@/types";

export type Dir = "N" | "S" | "E" | "W";
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Dom, 6=Sab

const BINS_PER_DAY = 96; // 24h * 4 (15 minuti)
const MIN_SAMPLES = 3;   // soglia minima per considerare “affidabile” un bin

export interface DayProfile {
  median: number[]; // lunghezza 96, NaN se non stimabile
  count: number[];  // campioni
}

export interface Profiles {
  // chiave: `${tunnel}|${dir}|${weekday}` o `${tunnel}|${dir}|all`
  [key: string]: DayProfile;
}

export function toWeekday(d: Date): Weekday {
  return d.getDay() as Weekday; // 0..6
}

export function toBinIndex(d: Date): number {
  const m = d.getHours() * 60 + d.getMinutes();
  return Math.floor(m / 15);
}

export function binLabel(i: number): string {
  const totalM = i * 15;
  const hh = Math.floor(totalM / 60);
  const mm = totalM % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function median(nums: number[]): number {
  if (nums.length === 0) return NaN;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function emptyProfile(): DayProfile {
  return {
    median: Array.from({ length: BINS_PER_DAY }, () => NaN),
    count: Array.from({ length: BINS_PER_DAY }, () => 0),
  };
}

function key(tunnel: TunnelId, dir: Dir, wd: Weekday | "all") {
  return `${tunnel}|${dir}|${wd}`;
}

/**
 * Crea profili per (tunnel,direzione,settimana) + un profilo “all” per fallback.
 */
export function buildProfiles(items: WaitItem[]): Profiles {
  // bucket temporaneo: per ogni chiave, per ogni bin, accumula i valori
  const buckets = new Map<string, number[][]>();

  const ensure = (k: string) => {
    if (!buckets.has(k)) {
      buckets.set(k, Array.from({ length: BINS_PER_DAY }, () => []));
    }
    return buckets.get(k)!;
  };

  for (const it of items) {
    const d = new Date(it.notedAt);
    const wd = toWeekday(d);
    const bin = toBinIndex(d);

    const kDay = key(it.tunnel, it.direction as Dir, wd);
    const kAll = key(it.tunnel, it.direction as Dir, "all");

    ensure(kDay)[bin].push(it.minutes);
    ensure(kAll)[bin].push(it.minutes);
  }

  const profiles: Profiles = {};

  for (const [k, arr] of buckets.entries()) {
    const prof = emptyProfile();
    for (let i = 0; i < BINS_PER_DAY; i++) {
      const values = arr[i];
      prof.count[i] = values.length;
      prof.median[i] = values.length ? median(values) : NaN;
    }
    profiles[k] = prof;
  }

  return profiles;
}

function nearestWithData(p: DayProfile, bin: number, radius = 4): number {
  // cerca il bin più vicino (±1..±radius) con count >= MIN_SAMPLES
  for (let r = 0; r <= radius; r++) {
    const candidates = [bin - r, bin + r];
    for (const c of candidates) {
      const i = (c + BINS_PER_DAY) % BINS_PER_DAY;
      if (p.count[i] >= MIN_SAMPLES && Number.isFinite(p.median[i])) {
        return i;
      }
    }
  }
  // altrimenti, qualunque bin con dati
  let best = -1, bestCount = 0;
  for (let i = 0; i < BINS_PER_DAY; i++) {
    if (p.count[i] > bestCount && Number.isFinite(p.median[i])) {
      best = i;
      bestCount = p.count[i];
    }
  }
  return best;
}

export interface PredictResult {
  minutes: number;     // stima minuti
  binUsed: number;     // bin usato
  count: number;       // numerosità
  confidence: "low" | "medium" | "high";
}

/**
 * Stima l'attesa per (tunnel,dir,datetime).
 * 1) usa profilo del giorno della settimana
 * 2) fallback su bin vicini
 * 3) fallback su profilo “all”
 */
export function predictWait(
  profiles: Profiles,
  tunnel: TunnelId,
  dir: Dir,
  at: Date
): PredictResult | null {
  const wd = toWeekday(at);
  const bin = toBinIndex(at);

  const kDay = key(tunnel, dir, wd);
  const kAll = key(tunnel, dir, "all");
  const pDay = profiles[kDay];
  const pAll = profiles[kAll];

  let usedProfile: DayProfile | undefined = pDay;
  let usedBin = -1;

  if (pDay) {
    const b = pDay.count[bin] >= MIN_SAMPLES && Number.isFinite(pDay.median[bin])
      ? bin
      : nearestWithData(pDay, bin);
    if (b >= 0) {
      usedProfile = pDay;
      usedBin = b;
    }
  }

  if (usedBin < 0 && pAll) {
    const b = pAll.count[bin] >= MIN_SAMPLES && Number.isFinite(pAll.median[bin])
      ? bin
      : nearestWithData(pAll, bin);
    if (b >= 0) {
      usedProfile = pAll;
      usedBin = b;
    }
  }

  if (!usedProfile || usedBin < 0 || !Number.isFinite(usedProfile.median[usedBin])) {
    return null;
  }

  const c = usedProfile.count[usedBin];
  const confidence = c >= 12 ? "high" : c >= 6 ? "medium" : "low";
  return {
    minutes: Math.round(usedProfile.median[usedBin]),
    binUsed: usedBin,
    count: c,
    confidence,
  };
}

/**
 * Trova l’orario (bin) con minima attesa prevista dentro una finestra [startBin, endBin].
 */
export function findMinInWindow(
  profiles: Profiles,
  tunnel: TunnelId,
  dir: Dir,
  date: Date,          // giorno target (usiamo solo weekday)
  startBin: number,
  endBin: number
): { bestBin: number; result: PredictResult } | null {
  let best: { bestBin: number; result: PredictResult } | null = null;

  const normalize = (i: number) => (i + BINS_PER_DAY) % BINS_PER_DAY;
  const length = (endBin - startBin + BINS_PER_DAY) % BINS_PER_DAY + 1;

  for (let k = 0; k < length; k++) {
    const b = normalize(startBin + k);
    const at = new Date(date);
    at.setHours(0, 0, 0, 0);
    const minutesFromMidnight = b * 15;
    at.setMinutes(minutesFromMidnight);

    const r = predictWait(profiles, tunnel, dir, at);
    if (!r) continue;
    if (!best || r.minutes < best.result.minutes) {
      best = { bestBin: b, result: r };
    }
  }

  return best;
}
