/**
 * The curves of the series / solution-formula chart (round 12, lib/series), as pure data:
 *
 * - the NUMERICAL solution with the same initial values, from the kernel's own adaptive integrator
 *   (the same machinery as every kept curve; nothing new is integrated here), as the reference a
 *   partial sum is compared with and the check a solution formula must pass;
 * - a function of t sampled across the chart, split into finite pieces and cut where it runs far
 *   off the chart (a partial sum outside its interval of convergence grows without bound);
 * - the formula-against-integration check: the largest deviation on the drawn range, judged against
 *   the solution's own size there (never an absolute floor).
 *
 * No React and no canvas: components/SeriesChart draws what this returns.
 */
import { integrateAdaptive } from "../core/integrate";
import { type CompiledSystem, compileSystem, mathjs } from "../core/parse";
import { type ReducedSecondOrder, XD, XDD } from "../core/second-order";
import { secondOrderNode } from "./equation";
import { toSystem } from "../core/slope-field";
import type { Range, Vec2 } from "../core/types";
import type { SeriesMode } from "./equation";

/** Samples of a function across the chart. */
export const CHART_SAMPLES = 400;
/** A sampled value this many chart heights beyond the chart ends its piece (the line leaves the picture). */
export const OFF_CHART_HEIGHTS = 20;
/** Tolerances of the reference integration: far tighter than the picture's, so the check measures the formula. */
export const REFERENCE_RTOL = 1e-10;
export const REFERENCE_ATOL = 1e-12;
/** The check passes when the deviation is at most this fraction of the solution's size on the range. */
export const CHECK_RELATIVE_TOL = 1e-6;

/** f sampled at CHART_SAMPLES + 1 points of the range, in finite pieces that stay near the chart (a checkpoint every 50 samples). */
export function sampleCurve(fn: (t: number) => number, range: Range, values: Range, checkpoint?: () => void): Vec2[][] {
  const pieces: Vec2[][] = [];
  let piece: Vec2[] = [];
  const height = Math.max(values.max - values.min, Number.MIN_VALUE);
  const low = values.min - OFF_CHART_HEIGHTS * height;
  const high = values.max + OFF_CHART_HEIGHTS * height;
  for (let i = 0; i <= CHART_SAMPLES; i++) {
    if (i % 50 === 0) checkpoint?.();
    const t = range.min + ((range.max - range.min) * i) / CHART_SAMPLES;
    const v = fn(t);
    if (Number.isFinite(v) && v >= low && v <= high) {
      piece.push({ x: t, y: v });
    } else {
      if (piece.length > 1) pieces.push(piece);
      piece = [];
    }
  }
  if (piece.length > 1) pieces.push(piece);
  return pieces;
}

/**
 * The numerical solution through u(t0) (and u'(t0)) across the range, as points (t, u) sorted by t,
 * or null when the equation does not compile for integration (a coefficient of x'' that vanishes,
 * which the picture refuses too). `holdAtEquilibrium` (drawing only): a leg that stopped at a TRUE
 * equilibrium (the field exactly zero there: x'' = 0 from x = 1, x' = 0) is held at its last value to
 * the end of its span, so the constant solution is drawn instead of a single point; a slow start that
 * the kernel's relative speed test stopped is not held. A CHECK never uses it. `atol`: the reference's
 * absolute tolerance (the check scales it to a tiny solution); `reduced`: the second-order reduction
 * the caller already has (the reduction samples the equation and is not paid twice).
 */
export function numericalSolution(
  mode: SeriesMode,
  text: string,
  params: Record<string, number> | undefined,
  t0: number,
  initial: readonly number[],
  range: Range,
  checkpoint?: () => void,
  options: { readonly holdAtEquilibrium?: boolean; readonly atol?: number; readonly reduced?: ReducedSecondOrder } = {},
): Vec2[] | null {
  const tMin = Math.min(range.min, t0);
  const tMax = Math.max(range.max, t0);
  const opts = { rtol: REFERENCE_RTOL, atol: options.atol ?? REFERENCE_ATOL, maxSteps: 20000, ...(checkpoint ? { checkpoint } : {}) };
  // `rest`: the field exactly zero at the stop point (both components; the first-order reduction's
  // t' = 1 is not part of the solution).
  const hold = (leg: Vec2[], status: string, end: number, rest: boolean): Vec2[] => {
    if (!options.holdAtEquilibrium || status !== "reached_equilibrium" || !rest || leg.length === 0) return leg;
    const last = leg[leg.length - 1];
    return last.x === end ? leg : [...leg, { x: end, y: last.y }];
  };
  try {
    if (mode === "first") {
      const sys = compileSystem(toSystem(params ? { kind: "explicit", g: text, params } : { kind: "explicit", g: text }));
      const start = { x: t0, y: initial[0] ?? 0 };
      const legs: Vec2[][] = [];
      // The reduced first-order system moves with t' = 1, so the parameter span is the t span.
      const rest = (p: Vec2) => sys.eval(p).y === 0;
      if (tMax > t0) {
        const tr = integrateAdaptive(sys, start, tMax - t0, { ...opts, direction: 1 });
        const last = tr.points[tr.points.length - 1];
        legs.push(hold(tr.points.map((p) => ({ x: p.x, y: p.y })), tr.status, tMax, last !== undefined && rest(last)));
      }
      if (tMin < t0) {
        const tr = integrateAdaptive(sys, start, t0 - tMin, { ...opts, direction: -1 });
        const last = tr.points[tr.points.length - 1];
        legs.push(hold(tr.points.map((p) => ({ x: p.x, y: p.y })), tr.status, tMin, last !== undefined && rest(last)));
      }
      return mergeLegs(legs);
    }
    // The caller's reduction when it has one (the web page's, for its picture), else the direct evaluation.
    const sys = options.reduced ? compileSystem(options.reduced.spec) : directSecondOrder(text, params);
    const rest = (p: Vec2, t: number) => {
      const v = sys.eval(p, t);
      return v.x === 0 && v.y === 0;
    };
    const start = { x: initial[0] ?? 0, y: initial[1] ?? 0 };
    const legs: Vec2[][] = [];
    const restAtEnd = (tr: { points: Vec2[]; times: number[] }) => {
      const k = tr.points.length - 1;
      return k >= 0 && rest(tr.points[k], tr.times[k]);
    };
    if (tMax > t0) {
      const tr = integrateAdaptive(sys, start, tMax - t0, { ...opts, direction: 1, t0 });
      legs.push(hold(tr.points.map((p, i) => ({ x: tr.times[i], y: p.x })), tr.status, tMax, restAtEnd(tr)));
    }
    if (tMin < t0) {
      const tr = integrateAdaptive(sys, start, t0 - tMin, { ...opts, direction: -1, t0 });
      legs.push(hold(tr.points.map((p, i) => ({ x: tr.times[i], y: p.x })), tr.status, tMin, restAtEnd(tr)));
    }
    return mergeLegs(legs);
  } catch {
    return null;
  }
}

function mergeLegs(legs: Vec2[][]): Vec2[] {
  const all = legs.flat().filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  all.sort((a, b) => a.x - b.x);
  const out: Vec2[] = [];
  for (const p of all) if (out.length === 0 || out[out.length - 1].x !== p.x) out.push(p);
  return out;
}

/**
 * The student's second-order equation E(t, x, x', x'') = 0 as the system x' = v, v' = F, evaluated
 * DIRECTLY from the text: E is affine in x'' (the exact reader verified it), so F = -E(.., 0) / (E(.., 1)
 * - E(.., 0)), the kernel's own definition of the reduction, with no symbolic simplification. The
 * kernel's reduceSecondOrder takes no budget and spends seconds to minutes simplifying a long product
 * ((t - 1)...(t - 24)(x'' + x) = 0); a reference must never wait for it. `spec` carries only what the
 * integrator reads from it: whether the field depends on t (its equilibrium stop is for autonomous systems).
 */
function directSecondOrder(text: string, params: Record<string, number> | undefined): CompiledSystem {
  const node = secondOrderNode(text, params);
  const code = node.compile();
  let mentionsT = false;
  node.traverse((n) => {
    if (mathjs.isSymbolNode(n) && n.name === "t") mentionsT = true;
  });
  const scope = { ...(params ?? {}) };
  const E = (x: number, v: number, a: number, t: number): number => {
    try {
      const r = code.evaluate({ ...scope, x, [XD]: v, [XDD]: a, t });
      return typeof r === "number" ? r : NaN;
    } catch {
      return NaN;
    }
  };
  return {
    eval(p: Vec2, t = 0): Vec2 {
      const e0 = E(p.x, p.y, 0, t);
      const F = -e0 / (E(p.x, p.y, 1, t) - e0);
      return { x: p.y, y: F };
    },
    spec: { f: "y", g: mentionsT ? "t" : "0" },
  };
}

/** Splits a numerical polyline into pieces that stay near the chart (like sampleCurve). */
export function clipPolyline(points: readonly Vec2[], values: Range): Vec2[][] {
  const height = Math.max(values.max - values.min, Number.MIN_VALUE);
  const low = values.min - OFF_CHART_HEIGHTS * height;
  const high = values.max + OFF_CHART_HEIGHTS * height;
  const pieces: Vec2[][] = [];
  let piece: Vec2[] = [];
  for (const p of points) {
    if (p.y >= low && p.y <= high) piece.push(p);
    else {
      if (piece.length > 1) pieces.push(piece);
      piece = [];
    }
  }
  if (piece.length > 1) pieces.push(piece);
  return pieces;
}

/**
 * `covered`: the smallest and largest t actually compared (the reference may stop early: a blow-up,
 * the step cap, an equilibrium); null when that is a single point (only the initial value itself,
 * where formula and integration agree by construction: no comparison to claim).
 */
export type FormulaCheck = { deviation: number; scale: number; ok: boolean; covered: Range | null };

/**
 * The largest |formula - numerical| at the integration points inside the range, judged against the
 * largest |numerical| there (at least the size of the initial values): ok when the deviation is at
 * most CHECK_RELATIVE_TOL of that size. null without points in the range. A point a few ulps past an
 * end counts as that end (the first-order reduction accumulates t by steps and lands at
 * 1.0000000000000004 for 1), so a completed leg covers the whole range.
 */
export function checkFormula(formula: (t: number) => number, numerical: readonly Vec2[], range: Range, initial: readonly number[], checkpoint?: () => void): FormulaCheck | null {
  let deviation = 0;
  let scale = Math.max(...initial.map(Math.abs), 0);
  let count = 0;
  let min = Infinity;
  let max = -Infinity;
  const slack = 16 * Number.EPSILON * Math.max(1, Math.abs(range.min), Math.abs(range.max));
  let seen = 0;
  for (const p of numerical) {
    if (seen++ % 50 === 0) checkpoint?.();
    if (p.x < range.min - slack || p.x > range.max + slack) continue;
    const t = Math.min(range.max, Math.max(range.min, p.x));
    const v = formula(p.x);
    if (!Number.isFinite(v)) return { deviation: Infinity, scale, ok: false, covered: { min: t, max: t } };
    deviation = Math.max(deviation, Math.abs(v - p.y));
    scale = Math.max(scale, Math.abs(p.y));
    min = Math.min(min, t);
    max = Math.max(max, t);
    count++;
  }
  if (count === 0) return null;
  // An end within the slack of the range's end is that end (a leg may also stop an ulp short of it).
  if (min - range.min <= slack) min = range.min;
  if (range.max - max <= slack) max = range.max;
  const covered = max - min > slack ? { min, max } : null;
  return { deviation, scale, ok: deviation <= CHECK_RELATIVE_TOL * Math.max(scale, Number.MIN_VALUE), covered };
}
