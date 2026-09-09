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
 * k = 0, 1, 2, ..., on each side of the point separately. `h(d)` is the field component at offset
 * d from the point; h(0) is never evaluated and is taken to be 0 (at a constant solution or an
 * equilibrium the field vanishes by construction; the caller subtracts any residual).
 *
 * The verdict is decided at the FINEST scales reached, never by the coarse offsets: the first
 * offset is set by the box (the only length available), and what the quotients do there says
 * nothing about the point (tanh(y) on y in [-1000, 1000] has D_0 = 0.05 because tanh saturates,
 * not because its derivative is unbounded). An unbounded derivative makes the quotients keep
 * growing at every scale; a bounded one makes them level off at the scale of the derivative's own
 * variation (tanh(1e6 y): near δ ~ 1e-7), however large the box. So the descent continues,
 * quartering δ, as long as the quotients keep CHANGING, and stops at the first of
 * - leveling off: |log(D_k / D_{k-2})| / log(δ_{k-2} / δ_k) < LEVEL_OFF_EXPONENT (0.05), i.e. the
 *   quotients moved by less than δ^±0.05 per level over the last two levels: the derivative is
 *   bounded at the scale where they leveled off, "bounded_at_tested_scales";
 * - the rounding floor: |h(δ_k)| < eps · max_j |h(δ_j)| / ROUNDING_GUARD (the quotient can no longer
 *   be resolved), an offset the point's own coordinate cannot carry (δ < POSITION_GUARD · eps ·
 *   |center|, where center + δ rounds), or LIPSCHITZ_MAX_LEVELS (60) levels: the growth persisted
 *   down to the floor, and α is fitted (least squares of log D against log δ) over the last
 *   TAIL_LEVELS (4) usable levels; "unbounded" when α >= UNBOUNDED_EXPONENT (0.25), "borderline"
 *   when α >= BORDERLINE_EXPONENT (0.1), else "bounded_at_tested_scales" (the quotients shrank or
 *   drifted only slowly).
 * Levels where h is not finite are skipped and the descent continues (a side defined only close to
 * the point is tested there); "undefined" means h was finite at no level on that side, i.e. the
 * equation is not defined on that side (sqrt(y) below y = 0); "untestable" means fewer than
 * MIN_LEVELS (3) usable levels. A side that leveled off reports the local exponent over the two
 * levels where it did (|α| < 0.05 by construction), a side that reached the floor the tail fit.
 *
 * HONESTY: "bounded_at_tested_scales" is what it says, a measurement over the offsets tested, never
 * a proof that the Lipschitz condition holds. A derivative that is unbounded but grows only
 * logarithmically, such as that of y·log|y| (dg/dy = log|y| + 1, D_k = |log δ_k|), levels off by
 * this rule once |log δ| exceeds about 20 (its change per level falls below 5%) and reads as bounded
 * with α ≈ 0.05; uniqueness does hold there, by the Osgood criterion. A singular term hidden under
 * a dominant linear one (y + 1e-4 sqrt|y|) changes the quotients by less than 5% per level at the
 * coarse offsets and also reads as bounded: the probe cannot see below the scale where it stopped.
 * The thresholds 0.25 / 0.1 / 0.05 and the level rules are choices, recorded here.
 *
 * Pure: no React, no clock, no randomness.
 */
import type { CompiledSystem } from "./parse";
import type { Box, Vec2 } from "./types";

export type SideVerdict = "unbounded" | "borderline" | "bounded_at_tested_scales" | "untestable" | "undefined";
export type UniquenessVerdict = Exclude<SideVerdict, "undefined">;

export type SideResult = {
  verdict: SideVerdict;
  /** Growth exponent α of the difference quotients (D ~ δ^-α) over the finest usable levels; NaN when untestable or undefined. */
  exponent: number;
  /** Usable levels (finite, above the rounding floor) the descent went through. */
  levels: number;
  /** The finest offset that was used; NaN when there was none. */
  finestOffset: number;
};

export type UniquenessResult = {
  /** The worst side (unbounded > borderline > untestable > bounded); both sides undefined gives untestable. */
  verdict: UniquenessVerdict;
  /** Exponent of that side. */
  exponent: number;
  sides: { above: SideResult; below: SideResult };
  /** The length scale the first offset was derived from (it sets where the descent starts, not the verdict). */
  scale: number;
  /** Systems only: the axis along which the reported side lies. */
  along?: "x" | "y";
};

/** Most offset levels per side. */
export const LIPSCHITZ_MAX_LEVELS = 60;
/** First offset as a fraction of the scale. */
export const LIPSCHITZ_FIRST_FRACTION = 1e-2;
/** Each level divides the offset by this factor. */
export const LIPSCHITZ_SHRINK = 4;
/** α at or above which the quotients are called unbounded (growth persisted to the floor). */
export const UNBOUNDED_EXPONENT = 0.25;
/** α at or above which the verdict is at least borderline (growth persisted to the floor). */
export const BORDERLINE_EXPONENT = 0.1;
/** The descent stops, as bounded, when the quotients change by less than δ^±this per level over two levels. */
export const LEVEL_OFF_EXPONENT = 0.05;
/** Levels the exponent is fitted over (the finest usable ones). */
export const TAIL_LEVELS = 4;
/** Usable levels needed for any verdict other than untestable. */
export const MIN_LEVELS = 3;
/** A level is skipped when the rounding floor of h exceeds this fraction of the quotient. */
export const ROUNDING_GUARD = 0.1;
/**
 * Offsets below this many eps of |center| are not representable to 1e-7 (center + δ rounds) and end
 * the descent: an offset carried to 1e-7 keeps the exponent of a δ^-1/2 law good to about 3e-8.
 */
export const POSITION_GUARD = 1e7;

const EPS = 2.220446049250313e-16;

export type LipschitzProbeOptions = {
  /** Called once per side (wall-clock budgets). */
  checkpoint?: () => void;
  /**
   * Coordinate of the probed point along the probed direction: offsets below
   * POSITION_GUARD · eps · |center| cannot be represented accurately (center + δ rounds) and end
   * the descent. Default 0 (no such floor).
   */
  center?: number;
};

/** Offsets δ_k = scale · 1e-2 · 4^-k, k = 0..levels - 1, largest first. */
export function lipschitzOffsets(scale: number, levels = LIPSCHITZ_MAX_LEVELS): number[] {
  return Array.from({ length: levels }, (_, k) => scale * LIPSCHITZ_FIRST_FRACTION * LIPSCHITZ_SHRINK ** -k);
}

const RANK: Record<SideVerdict, number> = { unbounded: 4, borderline: 3, untestable: 2, bounded_at_tested_scales: 1, undefined: 0 };

/** Least-squares slope of log D against log δ; α is its negative. */
function fittedExponent(levels: readonly { delta: number; D: number }[]): number {
  const n = levels.length;
  const xs = levels.map((u) => Math.log(u.delta));
  const ys = levels.map((u) => Math.log(u.D));
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  return -(sxy / sxx);
}

function probeSide(h: (d: number) => number, scale: number, sign: 1 | -1, center: number): SideResult {
  const usable: { delta: number; D: number }[] = [];
  const positionFloor = POSITION_GUARD * EPS * Math.abs(center);
  let maxH = 0;
  let finiteLevels = 0;
  let lastFiniteDelta = NaN;
  let leveledOff = false;
  for (let k = 0; k < LIPSCHITZ_MAX_LEVELS; k++) {
    const delta = scale * LIPSCHITZ_FIRST_FRACTION * LIPSCHITZ_SHRINK ** -k;
    if (delta < positionFloor) break;
    const v = h(sign * delta);
    if (!Number.isFinite(v)) continue;
    finiteLevels++;
    lastFiniteDelta = delta;
    const a = Math.abs(v);
    if (a > maxH) maxH = a;
    // Nothing to resolve yet: h vanished at every finite level so far.
    if (maxH === 0) continue;
    // Rounding floor: eps · maxH / δ > ROUNDING_GUARD · D, i.e. |h| is within 10 eps of the largest value seen.
    if (a < (EPS * maxH) / ROUNDING_GUARD) break;
    usable.push({ delta, D: a / delta });
    const n = usable.length;
    if (n >= MIN_LEVELS) {
      const fine = usable[n - 1], coarse = usable[n - 3];
      if (Math.abs(Math.log(fine.D / coarse.D)) / Math.log(coarse.delta / fine.delta) < LEVEL_OFF_EXPONENT) {
        leveledOff = true;
        break;
      }
    }
  }
  // Not defined at any offset on this side: the equation lives on the other side.
  if (finiteLevels === 0) return { verdict: "undefined", exponent: NaN, levels: 0, finestOffset: NaN };
  if (maxH === 0) {
    // The field vanishes at every level on this side: the quotients are all zero, hence bounded.
    return { verdict: "bounded_at_tested_scales", exponent: 0, levels: finiteLevels, finestOffset: lastFiniteDelta };
  }
  const n = usable.length;
  const finestOffset = n > 0 ? usable[n - 1].delta : NaN;
  if (n < MIN_LEVELS) return { verdict: "untestable", exponent: NaN, levels: n, finestOffset };
  if (leveledOff) {
    // The exponent at the scale where the quotients leveled off: |α| < LEVEL_OFF_EXPONENT by construction.
    const fine = usable[n - 1], coarse = usable[n - 3];
    const local = Math.log(fine.D / coarse.D) / Math.log(coarse.delta / fine.delta);
    return { verdict: "bounded_at_tested_scales", exponent: local, levels: n, finestOffset };
  }
  const alpha = fittedExponent(usable.slice(-TAIL_LEVELS));
  const verdict: SideVerdict = alpha >= UNBOUNDED_EXPONENT ? "unbounded" : alpha >= BORDERLINE_EXPONENT ? "borderline" : "bounded_at_tested_scales";
  return { verdict, exponent: alpha, levels: n, finestOffset };
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
 * field component at offset d; h(0) is taken to be 0 and never called. `scale` sets the first
 * offset (the y span of the box for a constant solution); the verdict does not depend on it.
 */
export function lipschitzProbe(h: (d: number) => number, scale: number, opts: LipschitzProbeOptions = {}): UniquenessResult {
  if (!(scale > 0) || !Number.isFinite(scale)) throw new RangeError("scale must be a positive finite number.");
  const center = opts.center ?? 0;
  opts.checkpoint?.();
  const above = probeSide(h, scale, 1, center);
  opts.checkpoint?.();
  const below = probeSide(h, scale, -1, center);
  return combine(above, below, scale);
}

/**
 * Uniqueness at the equilibria of a planar system: for each point, |F(p + d e) - F(p)| / d is
 * probed along the four axis directions (+x, -x, +y, -y); the result is the worse of the two axes,
 * tagged with `along`. The residual F(p) of the numerically located point is subtracted so that a
 * root found to 1e-9 does not read as a 1/δ growth. The first offset is 1e-2 of the longer side of
 * the box; the verdict is decided at the finest scales and does not depend on the box.
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
    const alongX = lipschitzProbe((d) => h({ x: p.x + d, y: p.y }), scale, { checkpoint: opts.checkpoint, center: p.x });
    const alongY = lipschitzProbe((d) => h({ x: p.x, y: p.y + d }), scale, { checkpoint: opts.checkpoint, center: p.y });
    const worstX = worse(alongX.sides.above, alongX.sides.below);
    const worstY = worse(alongY.sides.above, alongY.sides.below);
    const pick = RANK[worstY.verdict] > RANK[worstX.verdict] ? alongY : alongX;
    return { ...pick, along: pick === alongY ? "y" : "x" };
  });
}
