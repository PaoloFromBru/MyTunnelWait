export type Inputs = {
  queueKm?: number;
  lanes?: number;
  densityVehPerKm?: number;
  lambda: number;
  mu: number;
};

export function estimateWaitMinutes(i: Inputs) {
  const lanes = i.lanes ?? 1;
  const dens = i.densityVehPerKm ?? 120;
  const λ = i.lambda / 60;
  const μ = i.mu / 60;
  if (μ <= 0) return Infinity;

  const Q0 = i.queueKm != null ? Math.max(0, i.queueKm) * lanes * dens : undefined;

  if (Q0 != null && Q0 > 0) {
    const net = μ - λ;
    if (net <= 0) return Infinity;
    return Q0 / net;
  }

  if (λ >= μ) return Infinity;
  const Wq = (λ / (μ - λ));
  return Math.max(0, Wq);
}
