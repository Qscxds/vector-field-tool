/**
 * Uniqueness of solutions at a constant solution or an equilibrium: does the Lipschitz condition
 * fail there?
 *
 * Picard-Lindelöf guarantees a unique solution through a point where the right-hand side is
 * Lipschitz in the state. At dy/dt = sqrt(y), y = 0 the derivative dg/dy = 1/(2 sqrt(y)) is
 * unbounded, the theorem does not apply, and infinitely many solutions pass through (t, 0): the
 * constant one, and y = (t - c)^2 / 4 for every c, glued to it. The textbook example, not an edge
 * case; the tool must say so instead of reporting "semi-stable".
 *
 * Probe: difference quotients D_k = |h(±δ_k)| / δ_k at offsets δ_k = scale · 1e-2 · 4^-k,
 * k = 0..7 (down to ~6e-7 · scale), on each side of the point separately. `h(d)` is the field
 * component at offset d from the point; h(0) is never evaluated and is taken to be 0 (at a constant
 * solution or an equilibrium the field vanishes by construction; the caller subtracts any residual).
 * A least-squares fit of log D_k against log δ_k gives D ~ δ^-α; α > 0 means the quotients grow
 * without bound as the point is approached. Verdicts per side:
 * - "unbounded": α >= UNBOUNDED_EXPONENT (0.25), at least 5 usable levels, and D_k increasing
 *   monotonically over the last 4 usable levels (a fit alone can be fooled by one noisy level);
 * - "borderline": α >= BORDERLINE_EXPONENT (0.1) with at least 5 levels (this includes an α above
 *   0.25 whose quotients do not grow monotonically: growth is measured but not clean);
 * - "bounded_at_tested_scales": α < 0.1 with at least 4 levels;
 * - "untestable": fewer levels than that, or exactly 4 levels with α >= 0.1 (too few points to
 *   call a trend, too much growth to call it bounded);
 * - "undefined": h is not finite at the smallest offset, i.e. the equation is not defined on that
 *   side arbitrarily close to the point (sqrt(y) below y = 0).
 * A level is skipped when the quotient cannot be resolved in floating point: when
 * eps · max_j |h(δ_j)| / δ_k > 0.1 · D_k, i.e. |h(δ_k)| is within 10 eps of the largest field value
 * seen (the rounding floor of h is estimated from the values of h themselves; a right-hand side
 * whose intermediate terms are much larger than h, such as (1 + y^4) - 1, has a higher floor that
 * this estimate does not see).
 *
 * HONESTY: "bounded_at_tested_scales" is what it says, a measurement over the offsets tested, never
 * a proof that the Lipschitz condition holds. A derivative that is unbounded but grows only
 * logarithmically, such as that of y·log|y| (dg/dy = log|y| + 1), reads α ≈ 0.12 over these levels
 * and lands in "borderline"; a still slower growth (log log) would read as bounded. The exponent is
 * fitted over four decades of offsets, so a genuinely bounded derivative that merely varies quickly
 * near the point (g = y (1 - y) at y = 1: D = 1 + δ) reads α ≈ 0 as it should. The thresholds
 * 0.25 / 0.1 and the level range k = 0..7 are choices, recorded here.
 *
 * Pure: no React, no clock, no randomness.
 */
import type { CompiledSystem } from "./parse";
import type { Box, Vec2 } from "./types";

export type SideVerdict = "unbounded" | "borderline" | "bounded_at_tested_scales" | "untestable" | "undefined";
export type UniquenessVerdict = Exclude<SideVerdict, "undefined">;

export type SideResult = {
  verdict: SideVerdict;
  /** Growth exponent α of the difference quotients (D ~ δ^-α); NaN when untestable or undefined. */
  exponent: number;
  /** Usable levels the fit was made over. */
  levels: number;
};

export type UniquenessResult = {
  /** The worst side (unbounded > borderline > untestable > bounded); both sides undefined gives untestable. */
  verdict: UniquenessVerdict;
  /** Exponent of that side. */
  exponent: number;
  sides: { above: SideResult; below: SideResult };
  /** The length scale the offsets were derived from. */
  scale: number;
  /** Systems only: the axis along which the reported side lies. */
  along?: "x" | "y";
};

/** Number of offset levels per side. */
export const LIPSCHITZ_LEVELS = 8;
/** First offset as a fraction of the scale. */
export const LIPSCHITZ_FIRST_FRACTION = 1e-2;
/** Each level divides the offset by this factor. */
export const LIPSCHITZ_SHRINK = 4;
/** α at or above which the quotients are called unbounded (with a clean monotone growth). */
export const UNBOUNDED_EXPONENT = 0.25;
/** α at or above which the verdict is at least borderline. */
export const BORDERLINE_EXPONENT = 0.1;
/** Levels needed for an unbounded or borderline verdict. */
export const MIN_LEVELS_FOR_GROWTH = 5;
/** Levels needed for a bounded verdict. */
export const MIN_LEVELS_FOR_BOUNDED = 4;
/** Levels over which the quotients must increase monotonically for "unbounded". */
export const MONOTONE_LEVELS = 4;
/** A level is skipped when the rounding floor of h exceeds this fraction of the quotient. */
export const ROUNDING_GUARD = 0.1;

const EPS = 2.220446049250313e-16;

export type LipschitzProbeOptions = {
  /** Called once per side (wall-clock budgets). */
  checkpoint?: () => void;
};

/** Offsets δ_k = scale · 1e-2 · 4^-k, k = 0..LIPSCHITZ_LEVELS - 1, largest first. */
export function lipschitzOffsets(scale: number): number[] {
  return Array.from({ length: LIPSCHITZ_LEVELS }, (_, k) => scale * LIPSCHITZ_FIRST_FRACTION * LIPSCHITZ_SHRINK ** -k);
}

const RANK: Record<SideVerdict, number> = { unbounded: 4, borderline: 3, untestable: 2, bounded_at_tested_scales: 1, undefined: 0 };

function probeSide(h: (d: number) => number, scale: number, sign: 1 | -1): SideResult {
  const deltas = lipschitzOffsets(scale);
  const values = deltas.map((d) => {
    const v = h(sign * d);
    return Number.isFinite(v) ? Math.abs(v) : null;
  });
  const finite = values.filter((v): v is number => v !== null);
  // Not defined arbitrarily close to the point on this side: the equation lives on the other side.
  if (values[values.length - 1] === null || finite.length === 0) return { verdict: "undefined", exponent: NaN, levels: 0 };
  const maxH = Math.max(...finite);
  if (maxH === 0) {
    // The field vanishes at every level on this side: the quotients are all zero, hence bounded.
    return { verdict: "bounded_at_tested_scales", exponent: 0, levels: finite.length };
  }
  // Usable levels: finite and resolvable (eps · maxH / δ_k <= ROUNDING_GUARD · D_k, D_k = |h| / δ_k).
  const usable: { logDelta: number; logD: number; D: number }[] = [];
  values.forEach((v, k) => {
    if (v === null) return;
    const D = v / deltas[k];
    if (EPS * maxH / deltas[k] > ROUNDING_GUARD * D) return;
    usable.push({ logDelta: Math.log(deltas[k]), logD: Math.log(D), D });
  });
  const n = usable.length;
  if (n < MIN_LEVELS_FOR_BOUNDED) return { verdict: "untestable", exponent: NaN, levels: n };
  const mx = usable.reduce((s, u) => s + u.logDelta, 0) / n;
  const my = usable.reduce((s, u) => s + u.logD, 0) / n;
  let sxy = 0, sxx = 0;
  for (const u of usable) {
    sxy += (u.logDelta - mx) * (u.logD - my);
    sxx += (u.logDelta - mx) ** 2;
  }
  const alpha = -(sxy / sxx);
  const last = usable.slice(-MONOTONE_LEVELS);
  const monotone = last.every((u, i) => i === 0 || u.D > last[i - 1].D);
  let verdict: SideVerdict;
  if (n >= MIN_LEVELS_FOR_GROWTH && alpha >= UNBOUNDED_EXPONENT && monotone) verdict = "unbounded";
  else if (n >= MIN_LEVELS_FOR_GROWTH && alpha >= BORDERLINE_EXPONENT) verdict = "borderline";
  else if (alpha < BORDERLINE_EXPONENT) verdict = "bounded_at_tested_scales";
  else verdict = "untestable";
  return { verdict, exponent: alpha, levels: n };
}

/** The worse of two sides, by RANK; ties go to the first. */
function worse(a: SideResult, b: SideResult): SideResult {
  return RANK[b.verdict] > RANK[a.verdict] ? b : a;
}

function combine(above: SideResult, below: SideResult, scale: number): UniquenessResult {
  const w = worse(above, below);
  const verdict: UniquenessVerdict = w.verdict === "undefined" ? "untestable" : w.verdict;
  return { verdict, exponent: w.verdict === "undefined" ? NaN : w.exponent, sides: { above, below }, scale };
}

/**
 * Growth of the difference quotients of `h` on both sides of 0 (see the header). `h(d)` is the
 * field component at offset d; h(0) is taken to be 0 and never called. `scale` sets the offsets
 * (the y span of the box for a constant solution).
 */
export function lipschitzProbe(h: (d: number) => number, scale: number, opts: LipschitzProbeOptions = {}): UniquenessResult {
  if (!(scale > 0) || !Number.isFinite(scale)) throw new RangeError("scale must be a positive finite number.");
  opts.checkpoint?.();
  const above = probeSide(h, scale, 1);
  opts.checkpoint?.();
  const below = probeSide(h, scale, -1);
  return combine(above, below, scale);
}

/**
 * Uniqueness at the equilibria of a planar system: for each point, |F(p + d e) - F(p)| / d is
 * probed along the four axis directions (+x, -x, +y, -y); the result is the worse of the two axes,
 * tagged with `along`. The residual F(p) of the numerically located point is subtracted so that a
 * root found to 1e-9 does not read as a 1/δ growth. The scale is the longer side of the box.
 */
export function equilibriaUniqueness(sys: CompiledSystem, points: readonly Vec2[], box: Box, opts: LipschitzProbeOptions = {}): UniquenessResult[] {
  const scale = Math.max(box.x.max - box.x.min, box.y.max - box.y.min);
  return points.map((p) => {
    const f0 = sys.eval(p);
    const base = Number.isFinite(f0.x) && Number.isFinite(f0.y) ? f0 : { x: 0, y: 0 };
    const h = (q: Vec2) => {
      const f = sys.eval(q);
      return Math.hypot(f.x - base.x, f.y - base.y);
    };
    const alongX = lipschitzProbe((d) => h({ x: p.x + d, y: p.y }), scale, opts);
    const alongY = lipschitzProbe((d) => h({ x: p.x, y: p.y + d }), scale, opts);
    const worstX = worse(alongX.sides.above, alongX.sides.below);
    const worstY = worse(alongY.sides.above, alongY.sides.below);
    const pick = RANK[worstY.verdict] > RANK[worstX.verdict] ? alongY : alongX;
    return { ...pick, along: pick === alongY ? "y" : "x" };
  });
}
