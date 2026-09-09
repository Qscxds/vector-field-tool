/**
 * Time dependence of a planar system x' = f(x, y, t), y' = g(x, y, t).
 *
 * Why it exists: the parser accepts t and the kernel's eval(p, t) supports it, so a student can
 * write x' = y, y' = -x + sin(t). Such a system is non-autonomous: its vector field changes with
 * time, a picture of it is only a snapshot at one instant, and equilibrium points, Jacobian
 * eigenvalues and stability classes are tools for autonomous systems that this tool does not
 * attempt for it. The callers use the verdict to withhold those claims and to label the picture
 * with its snapshot time.
 *
 * THE VERDICT IS STATIC (decision of the J review, finding C.5): a system is time-dependent when
 * the symbol t appears in f or g (read from the validated AST; the parser already checks the
 * symbols). Full stop. A numerical probe cannot decide this: a forcing term of 1e-6 sin(t) is
 * invisible relative to the field on a box 1e4 wide, a forcing localized at exp(-2000 x^2) sin(t)
 * vanishes at every fixed sample point, and a field undefined at every probe time (sqrt(t - 5))
 * shows no change at all. The verdict therefore never depends on the box, on the sampling or on
 * the magnitude of the field. "0*t + y" counts as time-dependent by this rule: t appears, and the
 * honest answer is to say so and to report that no change was measured.
 *
 * The numerical PROBE is evidence, not the verdict: it measures how much the field changed at the
 * sampled times, and the callers report that number. F is evaluated at 13 irrational-fraction
 * points of the box (the detect-form style, off the axes and off the diagonals), each at the probe
 * times PROBE_TIMES plus the caller's snapshot time when it is not one of them. At every point the
 * largest change of the vector between the probe times and t = 0 is measured, relative to the
 * field's typical magnitude, the 75th percentile of |F| over all finite samples (so one sample
 * next to a pole does not set the scale), with a rounding floor of 1e3·eps times that magnitude
 * below which a change counts as zero. Scaling f and g by a common constant changes nothing,
 * because both the deviation and the scale are measured.
 *
 * A point where F is finite at some probe times and undefined at others has a domain that moves
 * with t (sqrt(t)·y, log(t), sqrt(t - 5) at the snapshot t = 10): reported as an infinite
 * deviation. Points undefined at every probe time (1/x on x = 0 for all t) are dropped; with no
 * usable point the probe reports 0 samples (the field could not be evaluated at any sampled time).
 *
 * A "ty" system (a first-order equation reduced to a planar system) has t as its horizontal
 * coordinate, not as a time: never time-dependent, and its probe measures exactly 0.
 */
import { type CompiledSystem, mathjs, parseValidated } from "./parse";
import type { Box, SystemSpec, Vec2 } from "./types";

export type TimeDependence = {
  /** The verdict: the symbol t appears in f or g (static, from the AST). Never decided by the probe. */
  dependsOnT: boolean;
  /**
   * Probe evidence: the largest change of F between the sampled times, relative to the typical
   * magnitude of |F| on the box; 0 when no change was measured; Infinity when the domain moves with t.
   */
  maxRelDeviation: number;
  /** Sample points that took part in the probe (finite at every sampled time, or finite at some and not others). */
  samples: number;
};

export type TimeDependenceOptions = {
  /** Called once per sample point (wall-clock budgets). */
  checkpoint?: () => void;
  /** The caller's snapshot time, added to the probe times (so a domain that contains it but not the fixed times is seen to move). */
  snapshotT?: number;
};

/** Probe times: 0 and four irrational-looking values on both sides of 0, no two commensurate with a round period. */
export const PROBE_TIMES: readonly number[] = [0, 0.7183, 1.4142, 3.1416, -2.7183];

// Irrational-looking fractions of the box (detect-form's style): no integer coordinates, no
// symmetry axes, and no pair with FX = FY or FX + FY = 1 (the diagonals of a centred box).
const FX = [0.2137, 0.3819, 0.5773, 0.7071, 0.866, 0.4472, 0.6281, 0.1618, 0.9271, 0.0729, 0.3183, 0.7853, 0.5236];
const FY = [0.6281, 0.1618, 0.9271, 0.4472, 0.3183, 0.7853, 0.2137, 0.866, 0.5773, 0.7071, 0.0729, 0.3819, 0.4472];

/**
 * The 13 irrational-fraction sample points of a box (see FX / FY), shared with the second-order
 * reduction so its numerical checks look at the student's own box too.
 */
export function boxSamplePoints(box: Box): Vec2[] {
  const w = box.x.max - box.x.min;
  const h = box.y.max - box.y.min;
  return FX.map((fx, i) => ({ x: box.x.min + fx * w, y: box.y.min + FY[i] * h }));
}

const EPS = 2.220446049250313e-16;
const finiteVec = (v: Vec2) => Number.isFinite(v.x) && Number.isFinite(v.y);

/** Value at a quantile of a list (0..1); 0 for an empty list. */
function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))];
}

/**
 * The static rule: whether the symbol t appears in f or g of a planar system. A "ty" system is
 * never time-dependent (its t is the horizontal coordinate). The spec must compile (callers hold
 * a CompiledSystem); parameters cannot be named t, so a symbol t is always the time.
 */
export function mentionsTime(spec: SystemSpec): boolean {
  if (spec.variables === "ty") return false;
  return [spec.f, spec.g].some((expr) => {
    let found = false;
    parseValidated(expr, spec.params, { variables: spec.variables }).traverse((n) => {
      if (mathjs.isSymbolNode(n) && n.name === "t") found = true;
    });
    return found;
  });
}

/** The verdict (static, see mentionsTime) together with the probe evidence. Never throws (eval never throws). */
export function detectTimeDependence(sys: CompiledSystem, box: Box, opts: TimeDependenceOptions = {}): TimeDependence {
  const dependsOnT = mentionsTime(sys.spec);
  const times = opts.snapshotT !== undefined && Number.isFinite(opts.snapshotT) && !PROBE_TIMES.includes(opts.snapshotT) ? [...PROBE_TIMES, opts.snapshotT] : PROBE_TIMES;
  const magnitudes: number[] = [];
  const perPoint: Array<{ deviation: number } | { mixed: true } | null> = [];
  for (const p of boxSamplePoints(box)) {
    opts.checkpoint?.();
    const values = times.map((t) => sys.eval(p, t));
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
  return { dependsOnT, maxRelDeviation, samples };
}
