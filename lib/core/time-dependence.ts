/**
 * Numerical probe for time dependence of a planar system x' = f(x, y, t), y' = g(x, y, t).
 *
 * Why it exists: the parser accepts t and the kernel's eval(p, t) supports it, so a student can
 * write x' = y, y' = -x + sin(t). Such a system is non-autonomous: its vector field changes with
 * time, a picture of it is only a snapshot at one instant, and equilibrium points, Jacobian
 * eigenvalues and stability classes are not defined for it. The callers use this verdict to
 * withhold those claims and to label the picture with its snapshot time.
 *
 * Method: F is evaluated at 13 irrational-fraction points of the box (the detect-form style, off
 * the axes and off the diagonals), each at the 5 probe times PROBE_TIMES. At every point the
 * largest change of the vector between the probe times and t = 0 is measured. The deviation is
 * relative to the field's typical magnitude, the 75th percentile of |F| over all finite samples
 * (so one sample next to a pole does not set the scale), with a rounding floor of 1e3·eps times
 * that magnitude below which a change counts as zero. The verdict is `dependsOnT` when the largest
 * relative deviation exceeds TIME_DEPENDENCE_TOL = 1e-9.
 *
 * About the threshold: it is a probe threshold, not a mathematical statement. A system whose time
 * dependence is smaller than one part in 1e9 of its magnitude on the box passes as autonomous; the
 * rounding floor is ~2e-13, so the band between the two is where a deliberately minuscule term
 * would still be detected while genuine rounding noise (x + t - t) is not. Scaling f and g by a
 * common constant changes nothing, because both the deviation and the scale are measured.
 *
 * A point where F is finite at some probe times and undefined at others has a domain that moves
 * with t (sqrt(t)·y, log(t)): that too is time dependence, reported with an infinite deviation.
 * Points undefined at every probe time (1/x on x = 0 for all t) are dropped. With no usable point
 * the verdict is "not time-dependent" with 0 samples, which callers may treat as untested.
 *
 * A "ty" system (a first-order equation reduced to a planar system) ignores the time argument by
 * construction, so it measures a deviation of exactly 0 here; no special case is needed.
 */
import type { CompiledSystem } from "./parse";
import type { Box, Vec2 } from "./types";

export type TimeDependence = {
  /** Largest relative deviation above TIME_DEPENDENCE_TOL at some usable sample point. */
  dependsOnT: boolean;
  /** Largest change of F between probe times, relative to the typical magnitude of |F|; Infinity when the domain moves with t. */
  maxRelDeviation: number;
  /** Sample points that took part (finite at every probe time, or finite at some and not others). */
  samples: number;
};

export type TimeDependenceOptions = {
  /** Called once per sample point (wall-clock budgets). */
  checkpoint?: () => void;
};

/** Probe threshold on the relative deviation; see the header. */
export const TIME_DEPENDENCE_TOL = 1e-9;
/** Probe times: 0 and four irrational-looking values on both sides of 0, no two commensurate with a round period. */
export const PROBE_TIMES: readonly number[] = [0, 0.7183, 1.4142, 3.1416, -2.7183];

// Irrational-looking fractions of the box (detect-form's style): no integer coordinates, no
// symmetry axes, and no pair with FX = FY or FX + FY = 1 (the diagonals of a centred box).
const FX = [0.2137, 0.3819, 0.5773, 0.7071, 0.866, 0.4472, 0.6281, 0.1618, 0.9271, 0.0729, 0.3183, 0.7853, 0.5236];
const FY = [0.6281, 0.1618, 0.9271, 0.4472, 0.3183, 0.7853, 0.2137, 0.866, 0.5773, 0.7071, 0.0729, 0.3819, 0.4472];

const EPS = 2.220446049250313e-16;
const finiteVec = (v: Vec2) => Number.isFinite(v.x) && Number.isFinite(v.y);

/** Value at a quantile of a list (0..1); 0 for an empty list. */
function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))];
}

/** Whether, and how much, F changes with t on the box. Never throws (eval never throws). */
export function detectTimeDependence(sys: CompiledSystem, box: Box, opts: TimeDependenceOptions = {}): TimeDependence {
  const w = box.x.max - box.x.min;
  const h = box.y.max - box.y.min;
  const magnitudes: number[] = [];
  const perPoint: Array<{ deviation: number } | { mixed: true } | null> = [];
  for (let i = 0; i < FX.length; i++) {
    opts.checkpoint?.();
    const p: Vec2 = { x: box.x.min + FX[i] * w, y: box.y.min + FY[i] * h };
    const values = PROBE_TIMES.map((t) => sys.eval(p, t));
    const finiteCount = values.filter(finiteVec).length;
    for (const v of values) if (finiteVec(v)) magnitudes.push(Math.hypot(v.x, v.y));
    if (finiteCount === 0) {
      perPoint.push(null);
    } else if (finiteCount < values.length) {
      perPoint.push({ mixed: true });
    } else {
      const base = values[0];
      let deviation = 0;
      for (const v of values) deviation = Math.max(deviation, Math.hypot(v.x - base.x, v.y - base.y));
      perPoint.push({ deviation });
    }
  }
  const typical = percentile(magnitudes, 0.75);
  const floor = 1e3 * EPS * typical;
  let maxRelDeviation = 0;
  let samples = 0;
  for (const r of perPoint) {
    if (r === null) continue;
    samples++;
    if ("mixed" in r) {
      maxRelDeviation = Infinity;
      continue;
    }
    // Below the rounding floor the change is zero to working precision. When the field is zero at
    // every sample (typical = 0) every deviation is 0 as well, and the ratio is 0, not NaN.
    const d = r.deviation <= floor ? 0 : r.deviation;
    const rel = d === 0 ? 0 : d / typical;
    maxRelDeviation = Math.max(maxRelDeviation, rel);
  }
  return { dependsOnT: maxRelDeviation > TIME_DEPENDENCE_TOL, maxRelDeviation, samples };
}
