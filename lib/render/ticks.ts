/**
 * Human-readable axis ticks: steps are 1, 2 or 5 times a power of ten (so 0.5, 1, 2, 5, 10, ...).
 */
import type { Range } from "../core/types";

/** The 1-2-5 step closest (in log scale) to the raw step. */
export function niceStep(rawStep: number): number {
  if (!(rawStep > 0) || !Number.isFinite(rawStep)) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const base = 10 ** exponent;
  let best = base;
  let bestDist = Infinity;
  for (const m of [1, 2, 5, 10]) {
    const candidate = m * base;
    const dist = Math.abs(Math.log(rawStep / candidate));
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

export function chooseTicks(range: Range, targetCount: number): number[] {
  const span = range.max - range.min;
  if (!(span > 0) || !Number.isFinite(span)) return [];
  const count = Math.max(1, targetCount);
  const step = niceStep(span / count);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const first = Math.ceil(range.min / step - 1e-9);
  const last = Math.floor(range.max / step + 1e-9);
  const ticks: number[] = [];
  for (let k = first; k <= last; k++) {
    const value = Number((k * step).toFixed(decimals));
    ticks.push(value === 0 ? 0 : value); // normalise -0
  }
  return ticks;
}
