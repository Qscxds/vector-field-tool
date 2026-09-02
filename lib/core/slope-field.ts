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
  /** Whether g is independent of x (checked numerically). */
  autonomous: boolean;
  solutions: EquilibriumSolution[];
};

export type FirstOrderEquilibriaOptions = {
  params?: Record<string, number>;
  /** Scan resolution in y. Default 400. */
  samples?: number;
  /** x values used to probe x-dependence. Default [-1, 0, 1, 2.5]. */
  xProbe?: number[];
  /** Relative residual tolerance for a root. Default 1e-9. */
  tol?: number;
};

export function firstOrderEquilibria(expr: string, yRange: Range, opts: FirstOrderEquilibriaOptions = {}): FirstOrderEquilibria {
  if (!Number.isFinite(yRange.min) || !Number.isFinite(yRange.max) || !(yRange.min < yRange.max)) {
    throw new RangeError("y range must satisfy min < max with finite bounds.");
  }
  const g = compileScalar(expr, opts.params);
  const samples = opts.samples ?? 400;
  const xProbe = opts.xProbe ?? [-1, 0, 1, 2.5];
  const tol = opts.tol ?? 1e-9;
  const span = yRange.max - yRange.min;

  // Probe autonomy: g must agree across x at a handful of y values.
  const ys = Array.from({ length: samples + 1 }, (_, i) => yRange.min + (i * span) / samples);
  let gScale = 1;
  for (const y of ys) {
    const v = Math.abs(g({ x: xProbe[0], y }));
    if (Number.isFinite(v) && v > gScale) gScale = v;
  }
  const autonomous = ys.every((y, i) => {
    if (i % 7 !== 0) return true; // every 7th sample is plenty
    const ref = g({ x: xProbe[0], y });
    return xProbe.every((x) => {
      const v = g({ x, y });
      if (!Number.isFinite(ref) || !Number.isFinite(v)) return true; // singular spots are inconclusive
      return Math.abs(v - ref) <= 1e-9 * gScale;
    });
  });
  if (!autonomous) return { autonomous: false, solutions: [] };

  const gy = (y: number) => g({ x: xProbe[0], y });
  const fTol = tol * gScale;
  const roots: number[] = [];
  const pushRoot = (y: number) => {
    if (y < yRange.min - 1e-12 * span || y > yRange.max + 1e-12 * span) return;
    if (roots.some((r) => Math.abs(r - y) <= 1e-6 * span)) return;
    roots.push(y);
  };

  const values = ys.map(gy);
  for (let i = 0; i < ys.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (Math.abs(v) <= fTol) {
      pushRoot(ys[i]);
      continue;
    }
    // Sign change between consecutive finite samples: bisect.
    if (i + 1 < ys.length && Number.isFinite(values[i + 1]) && Math.sign(v) !== Math.sign(values[i + 1]) && values[i + 1] !== 0) {
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
    // Tangential zero (no sign change): a local minimum of |g| well below the neighbours.
    if (i > 0 && i + 1 < ys.length && Number.isFinite(values[i - 1]) && Number.isFinite(values[i + 1])) {
      const a = Math.abs(values[i - 1]), b = Math.abs(v), c = Math.abs(values[i + 1]);
      if (b < a && b < c && Math.sign(values[i - 1]) === Math.sign(values[i + 1])) {
        // Newton polish from the sample; accept only if the residual actually reaches the tolerance.
        let y = ys[i];
        for (let k = 0; k < 100; k++) {
          const h = 1e-6 * Math.max(1, Math.abs(y));
          const d = (gy(y + h) - gy(y - h)) / (2 * h);
          if (!Number.isFinite(d) || d === 0) break;
          const yn = y - gy(y) / d;
          if (!Number.isFinite(yn)) break;
          if (Math.abs(yn - y) <= 1e-15 * Math.max(1, Math.abs(y))) { y = yn; break; }
          y = yn;
        }
        if (Math.abs(gy(y)) <= Math.max(fTol, 1e-12 * gScale)) pushRoot(y);
      }
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
