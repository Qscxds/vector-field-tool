/**
 * First-order equations dy/dx = g(x, y) as a special case of the planar system
 * x' = 1, y' = g(x, y): slope fields and vector fields then share every other module.
 *
 * Equilibrium *solutions* of a first-order equation are constant solutions y = y*, which exist
 * only when g does not depend on x (autonomous equation) and g(y*) = 0.
 */
import { compileScalar } from "./parse";
import type { Range, SystemSpec } from "./types";

export function firstOrderToSystem(expr: string, params?: Record<string, number>): SystemSpec {
  return params ? { f: "1", g: expr, params } : { f: "1", g: expr };
}

export type EquilibriumSolution = {
  y: number;
  /** Sign pattern of g around y*: stable if solutions approach it from both sides. */
  stability: "stable" | "unstable" | "semi_stable";
};

export type FirstOrderEquilibria = {
  /**
   * Whether g is independent of x, checked numerically at several x values. False also when g is
   * singular almost everywhere, because then autonomy cannot be established.
   */
  autonomous: boolean;
  solutions: EquilibriumSolution[];
};

export type FirstOrderEquilibriaOptions = {
  params?: Record<string, number>;
  /** Scan resolution in y. Default 400. */
  samples?: number;
  /** x interval used to probe x-dependence; defaults to a fixed spread around the origin. */
  xRange?: Range;
  /** Relative residual tolerance for a root. Default 1e-9. */
  tol?: number;
};

/** Irrational-looking fractions so that a polynomial in x chosen to vanish on "nice" points is still caught. */
const PROBE_FRACTIONS = [0.0729, 0.2137, 0.3819, 0.5, 0.6181, 0.7863, 0.9271];
const DEFAULT_PROBES = [-1.7, -0.61, 0.37, 1.23, 2.91];

export function firstOrderEquilibria(expr: string, yRange: Range, opts: FirstOrderEquilibriaOptions = {}): FirstOrderEquilibria {
  if (!Number.isFinite(yRange.min) || !Number.isFinite(yRange.max) || !(yRange.min < yRange.max)) {
    throw new RangeError("y range must satisfy min < max with finite bounds.");
  }
  const g = compileScalar(expr, opts.params);
  const samples = opts.samples ?? 400;
  const tol = opts.tol ?? 1e-9;
  const span = yRange.max - yRange.min;
  const xProbe = opts.xRange
    ? PROBE_FRACTIONS.map((t) => opts.xRange!.min + t * (opts.xRange!.max - opts.xRange!.min))
    : DEFAULT_PROBES;

  const ys = Array.from({ length: samples + 1 }, (_, i) => yRange.min + (i * span) / samples);

  // Reference column: the probe x with the most finite values (a singular column would make the
  // autonomy test vacuous).
  const table = xProbe.map((x) => ys.map((y) => g({ x, y })));
  const finiteCounts = table.map((col) => col.filter(Number.isFinite).length);
  const refIndex = finiteCounts.indexOf(Math.max(...finiteCounts));
  const ref = table[refIndex];
  const gScale = Math.max(1, ...ref.filter(Number.isFinite).map(Math.abs));

  let comparable = 0;
  let autonomous = true;
  for (let i = 0; i < ys.length; i++) {
    const r = ref[i];
    if (!Number.isFinite(r)) continue;
    for (let k = 0; k < table.length; k++) {
      if (k === refIndex) continue;
      const v = table[k][i];
      if (!Number.isFinite(v)) continue;
      comparable++;
      if (Math.abs(v - r) > 1e-9 * gScale) {
        autonomous = false;
        break;
      }
    }
    if (!autonomous) break;
  }
  if (!autonomous || comparable < 3) return { autonomous: false, solutions: [] };

  const xRef = xProbe[refIndex];
  const gy = (y: number) => g({ x: xRef, y });
  const fTol = tol * gScale;
  // A candidate is a root only if g really vanishes there (a pole also flips sign).
  const isRoot = (y: number) => Number.isFinite(y) && Math.abs(gy(y)) <= Math.max(fTol, 1e-9 * gScale);

  const polish = (y0: number): number => {
    let y = y0;
    for (let k = 0; k < 100; k++) {
      const h = 1e-6 * Math.max(1, Math.abs(y));
      const d = (gy(y + h) - gy(y - h)) / (2 * h);
      if (!Number.isFinite(d) || d === 0) break;
      const yn = y - gy(y) / d;
      if (!Number.isFinite(yn)) break;
      const done = Math.abs(yn - y) <= 1e-15 * Math.max(1, Math.abs(y));
      y = yn;
      if (done) break;
    }
    return y;
  };

  const roots: number[] = [];
  const pushRoot = (y: number) => {
    if (!isRoot(y)) return;
    if (y < yRange.min - 1e-12 * span || y > yRange.max + 1e-12 * span) return;
    if (roots.some((r) => Math.abs(r - y) <= 1e-6 * span)) return;
    roots.push(y);
  };

  for (let i = 0; i < ys.length; i++) {
    const v = ref[i];
    if (!Number.isFinite(v)) continue;
    if (Math.abs(v) <= fTol) {
      pushRoot(polish(ys[i]));
      continue;
    }
    // Sign change between consecutive finite samples: bisect, then check it is a root, not a pole.
    if (i + 1 < ys.length && Number.isFinite(ref[i + 1]) && ref[i + 1] !== 0 && Math.sign(v) !== Math.sign(ref[i + 1])) {
      let lo = ys[i], hi = ys[i + 1], flo = v;
      for (let k = 0; k < 200; k++) {
        const mid = (lo + hi) / 2;
        const fm = gy(mid);
        if (!Number.isFinite(fm)) break;
        if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else { hi = mid; }
        if (hi - lo <= 1e-14 * Math.max(1, Math.abs(lo))) break;
      }
      pushRoot((lo + hi) / 2);
      continue;
    }
    // Tangential zero (no sign change): a local minimum of |g| between two same-sign neighbours.
    if (i > 0 && i + 1 < ys.length && Number.isFinite(ref[i - 1]) && Number.isFinite(ref[i + 1])) {
      const a = Math.abs(ref[i - 1]), b = Math.abs(v), c = Math.abs(ref[i + 1]);
      const isMin = b <= a && b <= c && (b < a || b < c);
      if (isMin && Math.sign(ref[i - 1]) === Math.sign(ref[i + 1])) pushRoot(polish(ys[i]));
    }
  }

  roots.sort((u, v) => u - v);
  const probe = Math.max(1e-6 * span, 1e-9);
  const solutions: EquilibriumSolution[] = roots.map((y) => {
    const below = gy(y - probe);
    const above = gy(y + probe);
    let stability: EquilibriumSolution["stability"];
    if (below > 0 && above < 0) stability = "stable";
    else if (below < 0 && above > 0) stability = "unstable";
    else stability = "semi_stable";
    return { y, stability };
  });
  return { autonomous: true, solutions };
}
