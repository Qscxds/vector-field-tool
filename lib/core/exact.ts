/**
 * Potential of an exact equation M dx + N dy = 0: a function F with F_x = M, F_y = N, so the
 * solutions are the level curves F(x, y) = C (the textbook implicit solution).
 *
 * F is built by a line integral from a base point along two different paths (horizontal-then-
 * vertical and vertical-then-horizontal). If the equation really is exact the two agree; the
 * largest disagreement over the box is reported as `pathDeviation` and doubles as an independent
 * check of the exactness verdict from detect-form.
 */
import { compileDifferential, type FirstOrderSpec } from "./slope-field";
import type { Box, Vec2 } from "./types";

export type ExactPotential = {
  /** F(p) along the horizontal-then-vertical path from `base`. NaN where M or N is undefined. */
  F: (p: Vec2) => number;
  base: Vec2;
  /** Largest relative disagreement between the two integration paths over a sample grid. */
  pathDeviation: number;
  /** pathDeviation <= tol: the equation behaves exactly, F is trustworthy. */
  consistent: boolean;
};

export type ExactPotentialOptions = {
  /** Base point; default the box centre. */
  base?: Vec2;
  /** Simpson panels per segment (even). Default 64. */
  panels?: number;
  /** Relative tolerance for path independence. Default 1e-6. */
  tol?: number;
  /** Called before every path-check point; a caller enforcing a wall-clock budget throws from it. */
  checkpoint?: () => void;
};

/** Composite Simpson rule on [a, b]. Exact for cubics. */
export function simpson(fn: (s: number) => number, a: number, b: number, panels = 64): number {
  if (a === b) return 0;
  const n = panels % 2 === 0 ? panels : panels + 1;
  const h = (b - a) / n;
  let sum = fn(a) + fn(b);
  for (let i = 1; i < n; i++) sum += (i % 2 === 1 ? 4 : 2) * fn(a + i * h);
  return (sum * h) / 3;
}

export function exactPotential(spec: FirstOrderSpec, box: Box, opts: ExactPotentialOptions = {}): ExactPotential {
  const { M, N } = compileDifferential(spec);
  const centre = { x: (box.x.min + box.x.max) / 2, y: (box.y.min + box.y.max) / 2 };
  // A singular centre (e.g. the origin of (x dy - y dx)/(x² + y²)) would make every path integral
  // NaN; fall back to an irrational-fraction point so the check can report a real deviation.
  const fallback = { x: box.x.min + 0.3819 * (box.x.max - box.x.min), y: box.y.min + 0.6181 * (box.y.max - box.y.min) };
  const base = opts.base ?? (Number.isFinite(M(centre)) && Number.isFinite(N(centre)) ? centre : fallback);
  const panels = opts.panels ?? 64;
  const tol = opts.tol ?? 1e-6;

  const viaHorizontalFirst = (p: Vec2) =>
    simpson((s) => M({ x: s, y: base.y }), base.x, p.x, panels) + simpson((t) => N({ x: p.x, y: t }), base.y, p.y, panels);
  const viaVerticalFirst = (p: Vec2) =>
    simpson((t) => N({ x: base.x, y: t }), base.y, p.y, panels) + simpson((s) => M({ x: s, y: p.y }), base.x, p.x, panels);

  // Path-independence check on a coarse grid of irrational fractions (avoids the base point itself).
  const fr = [0.1618, 0.3819, 0.618, 0.8541];
  let scale = 1;
  const pairs: Array<[number, number]> = [];
  for (const fx of fr) {
    for (const fy of fr) {
      opts.checkpoint?.();
      const p = { x: box.x.min + fx * (box.x.max - box.x.min), y: box.y.min + fy * (box.y.max - box.y.min) };
      const a = viaHorizontalFirst(p);
      const b = viaVerticalFirst(p);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      pairs.push([a, b]);
      scale = Math.max(scale, Math.abs(a), Math.abs(b));
    }
  }
  const pathDeviation = pairs.length ? Math.max(...pairs.map(([a, b]) => Math.abs(a - b) / scale)) : Infinity;

  return { F: viaHorizontalFirst, base, pathDeviation, consistent: pathDeviation <= tol };
}

/** Evenly spaced levels strictly inside the range of F over a grid (for drawing level curves). */
export function potentialLevels(F: (p: Vec2) => number, box: Box, count = 8, grid = 24): number[] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= grid; i++) {
    for (let j = 0; j <= grid; j++) {
      const v = F({ x: box.x.min + (i / grid) * (box.x.max - box.x.min), y: box.y.min + (j / grid) * (box.y.max - box.y.min) });
      if (!Number.isFinite(v)) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  if (!(hi > lo) || count < 1) return [];
  return Array.from({ length: count }, (_, k) => lo + ((k + 1) / (count + 1)) * (hi - lo));
}
