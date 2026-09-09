/**
 * First-order equations, in the student's notation: the independent variable is t.
 *
 * The general representation is the differential form  M(t, y) dt + N(t, y) dy = 0. Its solution
 * curves are the trajectories of the planar system  x' = N, y' = -M  (so dy/dt = -M/N), which
 * lets slope fields reuse every other module. The explicit form dy/dt = g(t, y) is the special
 * case M = -g, N = 1, giving x' = 1, y' = g.
 *
 * The kernel coordinate x IS the student's t: expressions are compiled in variable mode "ty"
 * (see VariableMode in types.ts), where t is bound to the horizontal coordinate Vec2.x and the
 * symbol x is rejected. Everything below keeps the kernel's {x, y} for points and boxes.
 *
 * Why the differential form is the base and not a branch: textbook exact equations arrive as
 * M dt + N dy = 0, and solution curves with vertical tangents (N = 0) are perfectly finite there,
 * whereas g = -M/N blows up and would be mistaken for a singularity. The direction field is only
 * genuinely undefined where M = N = 0; those points are reported separately.
 */
import { findEquilibria } from "./equilibria";
import { assertNoLeftHandSide, compileBound, compileScalar, compileSystem, mentionsSymbol, parseValidated, type RoundingBound } from "./parse";
import type { Box, Range, SystemSpec, Vec2 } from "./types";
import { lipschitzProbe, type UniquenessVerdict } from "./uniqueness";

export type FirstOrderSpec =
  | { kind: "explicit"; g: string; params?: Record<string, number> }
  | { kind: "differential"; M: string; N: string; params?: Record<string, number> };

/**
 * A pasted left-hand side ("dy/dt = y") must be reported on the text the student typed. Both
 * conversions below wrap an expression in "-(...)" before it reaches the parser, and the parser's
 * check is anchored at the start of the text, so it would only see a generic syntax error inside
 * "-(dy/dt = y)". Checking the raw g, or the raw M and then N, here makes every kernel entry point
 * (compileDifferential, firstOrderEquilibria, firstOrderSingularities, detectForms,
 * exactPotential, toSystem + compileSystem) throw code "lhs_in_expression" with expr = the raw text.
 */
function assertRightHandSides(spec: FirstOrderSpec): void {
  if (spec.kind === "explicit") {
    assertNoLeftHandSide(spec.g, "ty");
  } else {
    assertNoLeftHandSide(spec.M, "ty");
    assertNoLeftHandSide(spec.N, "ty");
  }
}

/**
 * x' = N, y' = -M. For the explicit form this is x' = 1, y' = g. The returned SystemSpec carries
 * variables: "ty", so t in the expressions is the horizontal coordinate (and x is rejected);
 * consumers compile it with compileSystem unchanged.
 */
export function toSystem(spec: FirstOrderSpec): SystemSpec {
  assertRightHandSides(spec);
  const base: SystemSpec =
    spec.kind === "explicit" ? { f: "1", g: spec.g, variables: "ty" } : { f: spec.N, g: `-(${spec.M})`, variables: "ty" };
  return spec.params ? { ...base, params: spec.params } : base;
}

/** M and N of the differential form, as expression strings. */
export function toDifferential(spec: FirstOrderSpec): { M: string; N: string } {
  assertRightHandSides(spec);
  return spec.kind === "explicit" ? { M: `-(${spec.g})`, N: "1" } : { M: spec.M, N: spec.N };
}

/** Backwards-compatible helper: dy/dt = expr as a system. */
export function firstOrderToSystem(expr: string, params?: Record<string, number>): SystemSpec {
  return toSystem(params ? { kind: "explicit", g: expr, params } : { kind: "explicit", g: expr });
}

/**
 * Compiled M and N with the shared parameter set, in variable mode "ty". The evaluators take a
 * kernel point {x, y} whose x is the student's t. Every first-order module (constant solutions,
 * form detection, the exact potential) compiles through here, so this is the single choke point
 * for the variable mode. `MBound` is the running rounding-error bound of M at a point (see
 * RoundingBound in parse.ts): the yardstick for "this value of M is zero as far as floating
 * point can tell", built from M's own terms, never from the box.
 */
export function compileDifferential(spec: FirstOrderSpec): { M: (p: Vec2) => number; N: (p: Vec2) => number; MBound: (p: Vec2) => RoundingBound } {
  const { M, N } = toDifferential(spec);
  const opts = { variables: "ty" as const };
  const mNode = parseValidated(M, spec.params, opts);
  return { M: compileScalar(M, spec.params, opts), N: compileScalar(N, spec.params, opts), MBound: compileBound(mNode, spec.params, opts) };
}

/**
 * Does the right-hand side mention t? The static rule (as for planar systems since the J fix
 * round): t occurs in g, or in M or N of the differential form, read from the parsed expression,
 * never measured. t*sqrt(y) on y <= 0 is non-autonomous although no finite slope can be compared.
 */
export function firstOrderMentionsT(spec: FirstOrderSpec): boolean {
  const texts = spec.kind === "explicit" ? [spec.g] : [spec.M, spec.N];
  return texts.some((e) => mentionsSymbol(e, "t", spec.params, { variables: "ty" }));
}

// ---------------------------------------------------------------------------------------------
// Singular points of the direction field: M = N = 0.
// ---------------------------------------------------------------------------------------------

export type SingularPoints = {
  points: Vec2[];
  warning?: "possible_continuum" | "hit_limit";
  /** True when more singular points were found than maxPoints; independent of `warning` (a truncated continuum keeps 'possible_continuum'). */
  truncated?: boolean;
};

/**
 * Points where the direction is undefined. They are exactly the equilibria of x' = N, y' = -M,
 * so the Newton search is reused; the classification it computes is meaningless for a direction
 * field and is dropped. The explicit form (N = 1) never has any.
 */
export function firstOrderSingularities(spec: FirstOrderSpec, box: Box, opts: { seedGrid?: number; maxPoints?: number; checkpoint?: () => void } = {}): SingularPoints {
  if (spec.kind === "explicit") return { points: [] };
  const eq = findEquilibria(compileSystem(toSystem(spec)), box, { seedGrid: opts.seedGrid, maxPoints: opts.maxPoints ?? 20, checkpoint: opts.checkpoint });
  const out: SingularPoints = { points: eq.points.map((p) => p.at) };
  if (eq.warning === "possible_continuum") out.warning = eq.warning;
  else if (eq.truncated) out.warning = "hit_limit";
  if (eq.truncated) out.truncated = true;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Constant solutions y = c.
// ---------------------------------------------------------------------------------------------

/**
 * Uniqueness of solutions through the line y = c (see uniqueness.ts): the growth of the
 * difference quotients |g(t, c + d) - g(t, c)| / d, probed at every usable t.
 */
export type SolutionUniqueness = {
  /** The worst verdict over the t probes ("unbounded" as soon as one probe is). */
  verdict: UniquenessVerdict;
  /** Growth exponent α of the worst probe (D ~ δ^-α); NaN when untestable. */
  exponent: number;
  /** How many t probes gave "unbounded". */
  probesFailing: number;
  probesTotal: number;
  /** Which side of the line the worst verdict was found on. */
  side: "above" | "below";
};

export type EquilibriumSolution = {
  y: number;
  /**
   * Sign pattern of dy/dt just below and above y = c, at every t probe: stable if solutions
   * approach the line from both sides everywhere, 'varies' if the pattern changes with t.
   * A DOMAIN-EDGE solution (`domainEdge` set) is examined on its defined side only:
   * 'edge_approach' when the solutions on that side approach the line, 'edge_leave' when they
   * leave it; never 'semi_stable', which would describe a side that does not exist.
   */
  stability: "stable" | "unstable" | "semi_stable" | "varies" | "edge_approach" | "edge_leave";
  /**
   * Set when the line is the edge of the region where the equation is defined (dy/dt = sqrt(y)
   * at y = 0): the side named is the one where the equation IS defined.
   */
  domainEdge?: "above" | "below";
  uniqueness?: SolutionUniqueness;
  /**
   * Set when the right-hand side evaluates to exactly 0 on a whole interval around the line
   * (below the smallest representable number, as exp(-1/y²) for |y| < 0.037) and decreases
   * continuously toward that interval from both sides: the line is reported at the interval's
   * center, known to this half-width.
   */
  plateauHalfWidth?: number;
  /**
   * How many of the t probes could test the line (the equation defined there, M vanishing and
   * N nonzero) out of how many were tried: a line defined on part of the t range (sqrt(t)·y for
   * t > 0) is verified where it exists, and the shells say so when fewer than 3 probes were usable.
   */
  probes: { usable: number; total: number };
};

export type FirstOrderEquilibria = {
  /**
   * Whether the right-hand side is independent of t: the STATIC rule (firstOrderMentionsT), true
   * iff the symbol t does not occur in g (or in M, N). Informational; constant solutions do not
   * require it. "untestable" is kept in the type for older scenes only and is no longer produced.
   */
  autonomous: boolean | "untestable";
  /** No longer produced (autonomy is static); kept for older scenes. */
  untestableReason?: "undefined" | "all_zero";
  /**
   * True when M is identically zero on the range as far as the scan can tell: every sample at
   * every t probe is finite and exactly 0, and none of them underflowed (the rounding bound
   * reports no unrepresentable nonzero result). dy/dt = 0: every line y = c is a constant
   * solution and the field is flat; `solutions` is empty and no plateau is listed. Not set when
   * some sample is undefined or underflowed (y·exp(-100 y²) with a cell of 5).
   */
  identicallyZero?: boolean;
  solutions: EquilibriumSolution[];
  /**
   * The scan resolution Δy actually used (the cell of the finest scan run; refined by 4 while every
   * finite sample was exactly 0). Roots closer together than this may have been merged or missed:
   * a fact the shells always state.
   */
  resolution: number;
  /**
   * Intervals (as located, clipped to the range) on which the right-hand side evaluates to
   * exactly 0 without a constant solution being claimed inside them: an underflow plateau of a
   * Gaussian factor, or a genuinely flat region. Their edges that are roots are listed in
   * `solutions`; the inside is not.
   */
  zeroPlateaus: Range[];
};

export type FirstOrderEquilibriaOptions = {
  /** Called per probe column and per candidate (wall-clock budgets). */
  checkpoint?: () => void;
  /** Scan resolution in y. Default 400. */
  samples?: number;
  /** t interval (the horizontal axis, box.x) used for the "for all t" checks; defaults to a fixed spread around the origin. */
  tRange?: Range;
  /** @deprecated Former name of `tRange` (the horizontal axis); `tRange` wins when both are given. */
  xRange?: Range;
};

/** Irrational-looking fractions so that a polynomial in t chosen to vanish on "nice" points is still caught. */
const PROBE_FRACTIONS = [0.0729, 0.2137, 0.3819, 0.5, 0.6181, 0.7863, 0.9271];
const DEFAULT_PROBES = [-1.7, -0.61, 0.37, 1.23, 2.91];

const EPS = 2.220446049250313e-16;
/** The smallest normal double: a value below it carries no relative precision and is not a measurement of M. */
const MIN_NORMAL = 2.2250738585072014e-308;
/**
 * Vanishing ladder: |M(t, c ± h · 4^-k)| from h = the scan cell, quartered per level, down to the
 * position floor of c, an underflow, or this many levels (as the uniqueness descent: the floor is
 * never a fixed count from the cell, so a steep root such as tanh(1e6 y) is resolved on any box).
 */
const VANISH_MAX_LEVELS = 60;
const VANISH_SHRINK = 4;
/** M vanishes at c when its values over the finest usable levels fall like δ^β with β at least this. */
const VANISH_EXPONENT_MIN = 0.05;
/** Levels the vanishing exponent is fitted over, and over which the values must fall monotonically (the finest usable ones). */
const VANISH_TAIL = 6;
/** Usable levels needed for the fit. */
const VANISH_MIN_LEVELS = 3;
/** Usable levels needed before an underflow to call the fall into it measured. */
const UNDERFLOW_MIN_LEVELS = 2;
/** Ladder offsets below this many eps of |c| are not carried by c to 1e-3 and are not used (β only needs that). */
const VANISH_POSITION_GUARD = 1e3;
/**
 * A value of exactly 0 (or a denormal) that follows a usable value within this factor of the
 * smallest normal double is the arithmetic underflowing (the tail of a Gaussian factor); one that
 * follows a large value is a coincidence (another root at that level) and is skipped.
 */
const UNDERFLOW_REACH = 1e60;
/**
 * A value within its rounding bound that follows a measured value within this factor of the bound
 * is the rounding floor of the vanishing law (4^β for β up to 10); after a larger value it is a
 * coincidence (another root at that level) and is skipped.
 */
const PRECISION_REACH = 1e6;
/** The residual |M(t, c)| may exceed what the vanishing law predicts at the location tolerance by this factor. */
const RESIDUAL_SAFETY = 10;
/** N(t, c) counts as zero (a singular point on the line) below this many eps of |N| within a ladder offset of c. */
const N_FLOOR = 1e3;
/** Bracketing iterations (bisection to adjacent doubles from one cell takes about 50; golden section about 70). */
const LOCATE_ITERATIONS = 200;
/** Probes (t values where the line could be tested) a constant solution needs; below PROBES_NOTED the shells say how many. */
const MIN_USABLE_PROBES = 2;
export const PROBES_NOTED = 3;
/** Cap on candidates (the scan's plus those found by deflating located roots). */
const CANDIDATE_CAP_PER_SAMPLE = 4;

/**
 * What M(t, ·) does on one side of a point, measured on the vanishing ladder:
 * - "vanishes": the values fall toward 0 like δ^β with β >= VANISH_EXPONENT_MIN, monotonically over
 *   the finest usable levels, down to the position floor or the last level (evidence FOR a root);
 * - "underflow": they fall monotonically until the arithmetic underflows (a denormal or exactly 0
 *   right after a value near the smallest normal double) while the offset is still far above the
 *   position floor: the side of an underflow plateau (exp(-1/y²) toward |y| < 0.037), by itself
 *   no evidence of a root at this point;
 * - "not_vanishing": they level off at a nonzero value, grow, or do not fall monotonically
 *   (evidence AGAINST: the local minimum of y^8 + 1 at 0, a pole, sin(1/y) at 0);
 * - "flat": M is exactly 0 at every level (consistent with a root, but no evidence by itself: the
 *   inside of a run of zero samples);
 * - "insufficient": fewer than VANISH_MIN_LEVELS usable levels (every value denormal, as at the
 *   edge of an underflow plateau reached from inside);
 * - "undefined": M is not finite at the finest level evaluated (the equation ends on this side);
 * - "unresolvable": no level could be evaluated (every offset is below the position guard).
 */
type SideVanishing = {
  evidence: "vanishes" | "underflow" | "not_vanishing" | "flat" | "insufficient" | "undefined" | "unresolvable";
  /** Fitted exponent β over the finest usable levels (measured evidence only). */
  beta: number;
  /** |M| at the finest usable level, that level's offset, and the sign of M there (measured evidence only; NaN / 0 otherwise). */
  amp: number;
  deltaFine: number;
  signFine: number;
};

/** The equation is defined on this side of the point. */
const definedSide = (s: SideVanishing) => s.evidence !== "undefined" && s.evidence !== "unresolvable";
/** The side measured M falling continuously to 0 at the point itself (not merely into an underflow plateau). */
const vanishingSide = (s: SideVanishing) => s.evidence === "vanishes";

/** Least-squares slope of log a against log δ: the exponent β of a ~ δ^β. */
function fittedSlope(levels: readonly { delta: number; a: number }[]): number {
  const n = levels.length;
  const xs = levels.map((u) => Math.log(u.delta));
  const ys = levels.map((u) => Math.log(u.a));
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  return sxy / sxx;
}

/**
 * Does the expression text use a fractional power (y^(2/3), y^0.5, y^-1.5, pow(y, 2/3),
 * pow(y, 0.5))? Such a power of a negative number is undefined, the usual reason a first-order
 * equation ends on a line; the shells add the abs(y)^p hint to a domain-edge sentence only then
 * (not for a logarithm or sqrt(1 - y²)). A text heuristic: the exponent must be written as a
 * decimal or a fraction of integer literals right after ^ or as the last argument of pow(...).
 */
export function hasFractionalPower(spec: FirstOrderSpec): boolean {
  const texts = spec.kind === "explicit" ? [spec.g] : [spec.M, spec.N];
  const decimal = /\^\s*\(?\s*-?\d*\.\d+/;
  const fraction = /\^\s*\(\s*-?\d+\s*\/\s*\d+\s*\)/;
  // pow(base, exponent): the exponent is the text after the LAST top-level comma of the call;
  // "[^()]*" keeps the match inside the innermost pow( ... ) so pow(y, 2)/3 is not a fraction.
  const powCall = /pow\s*\([^()]*(?:\([^()]*\)[^()]*)*,\s*\(?\s*-?(?:\d*\.\d+|\d+\s*\/\s*\d+)\s*\)?\s*\)/;
  return texts.some((t) => decimal.test(t) || fraction.test(t) || powCall.test(t));
}

/**
 * Constant solutions of M dt + N dy = 0: y = c such that M(t, c) = 0 for every t while N(t, c) != 0.
 * (For dy/dt = g this is g(t, c) = 0 for every t.)
 *
 * Candidates come from the scan of c -> M(t_ref, c) over the y range, t_ref being the probe with
 * the most finite nonzero values (sqrt(t)·y is scanned at a t > 0, not at t = 0 where M ≡ 0):
 * sign changes (bisected to adjacent doubles), local minima of |M| between samples of one sign
 * (a derivative-free golden-section minimizer, so a cusp such as sqrt|y| is located as well as a
 * smooth double root), domain edges (a finite sample next to an undefined one, one cell OUTSIDE
 * the range included, bisected on finiteness to the last defined double), and runs of samples
 * that are exactly 0. Consecutive zero samples form one run only when M does not rise between
 * them (0, 1 and 2 of y(1 - y)(2 - y) with a cell of 1 are three runs; a quarter point that is
 * itself zero is a spotted root). A run whose zero set is a point (y(1 - y) at the sample 0) is
 * a candidate at that point; a wider zero-to-precision band that M falls into from both sides
 * down to its rounding floor (the cancellation of y(1 - y) - 1/4 around 1/2) is one candidate at
 * its center; otherwise a wide run is examined at its located edges: an edge into which M falls
 * continuously to 0 is a candidate (the boundary y = 1 of max(0, y - 1)), a run into which the
 * arithmetic UNDERFLOWS from both sides (exp(-1/y²) on |y| < 0.037) is one candidate at its
 * center reported with its half-width, and anything else (an underflow plateau reaching the box
 * edge, as exp(-y²) beyond |y| = 27.3) is listed in `zeroPlateaus` with no solution claimed
 * inside. When EVERY sample is exactly 0 and none underflowed, M is identically zero
 * (`identicallyZero`, nothing listed); when every FINITE sample is exactly 0 otherwise (a
 * Gaussian factor underflowing at every sample, or the line the only defined sample) each sample
 * is a candidate and the ladder decides (y·exp(-100 y²) on [-1000, 1000] keeps y = 0).
 * Autonomy is the static rule (firstOrderMentionsT), never measured here.
 *
 * "Zero" throughout is zero to precision: |M| within the rounding bound of M's own terms at the
 * point (parse.ts RoundingBound), which the vanishing ladder treats as its floor, so a double root
 * whose expanded form cancels (y(1 - y) - 1/4, y² - 2y + 1) is measured on the levels above the
 * floor and located at the center of its zero-to-precision band; an underflowed 0 is never zero
 * to precision.
 *
 * A candidate is accepted by a LOCAL criterion only, at every t probe where it can be tested:
 * M(t, ·) must vanish continuously at c, i.e. on each side where it is defined the values
 * |M(t, c ± h 4^-k)| must fall toward 0 like δ^β with β > 0, monotonically over the finest usable
 * levels, the ladder descending from the scan cell to the position floor of c (or 60 levels;
 * never a fixed count from the cell, so tanh(1e6 y) is resolved on every box), and the residual
 * |M(t, c)| must be 0 or within what that law predicts at the location tolerance of c (bisection
 * width, golden bracket, or the rounding floor of the scanned coordinates). No tolerance is
 * relative to a box-wide statistic: y^8 + 1 on [-100, 100] has no constant solution, and
 * tanh(y) - 0.5 on [-1e8, 1e8] has exactly one. A candidate whose |M| levels off at a nonzero
 * value (the local minimum of y^8 + 1 at 0), grows (a pole) or oscillates (sin(1/y) at 0, where M
 * is undefined) is not a root. A candidate at which M(t, c) itself is undefined but vanishes on
 * both sides (y·log|y| at 0), or on its one defined side (y·log(y) at 0), is a removable point on
 * a constant solution; one where M is defined on one side only is a domain-edge solution, and its
 * side is read from the ladder, so a line lying exactly on the box edge is an edge all the same.
 * A root located within the rounding floor of the scanned coordinates is reported as exactly 0.
 * A probe t where the line cannot be tested (M undefined there, or a singular point M = N = 0 on
 * the line) is skipped, not held against it; a line needs MIN_USABLE_PROBES usable probes and
 * reports how many it had. After a root is accepted, the sign of M at the finest ladder level on
 * each side is compared with the sign at the end of its scan bracket: a difference means another
 * sign change in that sub-interval, which is bisected too (deflation: (y - 1)(y - 1.01) on
 * [-100, 100] yields both roots). The stability signs are read at those finest ladder levels,
 * inside the region where the local law holds, never at a fraction of the box.
 *
 * Accepts the legacy (expr, yRange, { params }) call as well: a bare string is dy/dt = expr.
 * Local variables named x below are the kernel's horizontal coordinate, i.e. the student's t.
 */
export function firstOrderEquilibria(
  specOrExpr: FirstOrderSpec | string,
  yRange: Range,
  opts: FirstOrderEquilibriaOptions & { params?: Record<string, number> } = {},
): FirstOrderEquilibria {
  const spec: FirstOrderSpec =
    typeof specOrExpr === "string"
      ? opts.params
        ? { kind: "explicit", g: specOrExpr, params: opts.params }
        : { kind: "explicit", g: specOrExpr }
      : specOrExpr;
  if (!Number.isFinite(yRange.min) || !Number.isFinite(yRange.max) || !(yRange.min < yRange.max)) {
    throw new RangeError("y range must satisfy min < max with finite bounds.");
  }
  const { M, N, MBound } = compileDifferential(spec);
  // Autonomy is the static rule: t occurs in the right-hand side or it does not (never measured).
  const autonomous = !firstOrderMentionsT(spec);
  const samples = opts.samples ?? 400;
  const span = yRange.max - yRange.min;
  const cell = span / samples;
  // Rounding floor of the scanned coordinates: positions in the range are only meaningful to this.
  const locFloor = EPS * Math.max(Math.abs(yRange.min), Math.abs(yRange.max));
  const tRange = opts.tRange ?? opts.xRange;
  const xProbe = tRange
    ? PROBE_FRACTIONS.map((fr) => tRange.min + fr * (tRange.max - tRange.min))
    : DEFAULT_PROBES;

  const ys = Array.from({ length: samples + 1 }, (_, i) => yRange.min + i * cell);
  const slope = (x: number, y: number) => {
    const n = N({ x, y });
    const m = M({ x, y });
    return n === 0 ? (m === 0 ? NaN : (m > 0 ? -Infinity : Infinity)) : -m / n;
  };

  // Reference column for the scan: the probe t with the most finite NONZERO values (ties: the most
  // finite ones), so a line defined on part of the t range (sqrt(t)·y) is scanned where the
  // equation has something to say, not at a t where M ≡ 0.
  const table = xProbe.map((x) => {
    opts.checkpoint?.();
    return ys.map((y) => M({ x, y }));
  });
  const finiteCounts = table.map((col) => col.filter(Number.isFinite).length);
  const nonzeroCounts = table.map((col) => col.filter((v) => Number.isFinite(v) && v !== 0).length);
  let refIndex = 0;
  for (let i = 1; i < table.length; i++) {
    if (nonzeroCounts[i] > nonzeroCounts[refIndex] || (nonzeroCounts[i] === nonzeroCounts[refIndex] && finiteCounts[i] > finiteCounts[refIndex])) refIndex = i;
  }
  const ref = table[refIndex];
  const xRef = xProbe[refIndex];

  // Every finite sample exactly 0: M may be identically 0 (dy/dt = 0) or a factor may underflow at
  // every sample (y·exp(-100 y²) with a cell of 5). The rounding bound tells the two apart: when
  // every sample is finite, exactly 0 and none underflowed, M is identically zero as far as the
  // scan can tell (every line y = c is a constant solution; nothing is listed). Otherwise each
  // finite sample is a candidate for the ladder to decide (below).
  const finiteYs = new Set<number>();
  let allZero = true;
  let allFinite = true;
  table.forEach((col) => col.forEach((v, i) => { if (Number.isFinite(v)) { finiteYs.add(ys[i]); if (v !== 0) allZero = false; } else allFinite = false; }));
  if (finiteYs.size === 0) return { autonomous, solutions: [], resolution: cell, zeroPlateaus: [] };
  // N ≡ 0 (no slope anywhere): no constant solution is listed.
  const nValues = xProbe.flatMap((x) => ys.filter((_, i) => i % 8 === 0).map((y) => N({ x, y }))).filter(Number.isFinite);
  if (nValues.length > 0 && nValues.every((v) => v === 0)) return { autonomous, solutions: [], resolution: cell, zeroPlateaus: [] };
  if (allZero && allFinite && !xProbe.some((x) => ys.some((y) => MBound({ x, y }).underflow))) {
    return { autonomous, identicallyZero: true, solutions: [], resolution: cell, zeroPlateaus: [] };
  }

  /**
   * |M(x, y)| within its own rounding bound (parse.ts RoundingBound: the rounding of M's own
   * terms at this point) and not an underflow: zero as far as floating point can tell. The
   * cancellation of y(1 - y) - 1/4 leaves ~1e-17 of noise on |y - 1/2| < 7e-9, where the
   * expression is -(y - 1/2)² exactly; an underflowed 0 (exp(-1/y²)) is NOT zero to precision.
   */
  const zeroToPrecision = (x: number, y: number): boolean => {
    const b = MBound({ x, y });
    return Number.isFinite(b.value) && !b.underflow && Math.abs(b.value) <= b.error;
  };

  const mAt = (y: number) => M({ x: xRef, y });

  /** Vanishing ladder on one side of c at probe x (see SideVanishing). */
  const vanishing = (x: number, c: number, sign: 1 | -1): SideVanishing => {
    const positionFloor = VANISH_POSITION_GUARD * EPS * Math.abs(c);
    const values: { delta: number; a: number; v: number }[] = [];
    let evaluated = 0;
    let lastFinite = false;
    let maxSeen = 0;
    let underflow = false;
    for (let k = 0; k < VANISH_MAX_LEVELS; k++) {
      const delta = cell * VANISH_SHRINK ** -k;
      if (delta < positionFloor) break;
      evaluated++;
      const bnd = MBound({ x, y: c + sign * delta });
      const v = bnd.value;
      lastFinite = Number.isFinite(v);
      if (!lastFinite) continue;
      const a = Math.abs(v);
      if (a > maxSeen) maxSeen = a;
      if (!bnd.underflow && a <= bnd.error) {
        // Zero to precision: the rounding floor of the ladder when the values were falling toward
        // it (the last measured value of a law δ^β lies within 4^β of the floor); after a much
        // larger value it is a coincidence (another root at this level) and is skipped, as an
        // exact 0 is below. Values within the bound are never measurements of the law.
        const prev = values[values.length - 1];
        if (prev && prev.a <= PRECISION_REACH * bnd.error) break;
        continue;
      }
      if (a < MIN_NORMAL) {
        // Exactly 0 or a denormal: the arithmetic underflowing when the values were already near
        // the smallest normal double; a coincidence (another root at this level) otherwise.
        const prev = values[values.length - 1];
        if (prev && prev.a <= UNDERFLOW_REACH * MIN_NORMAL) { underflow = true; break; }
        continue;
      }
      values.push({ delta, a, v });
    }
    const none = { beta: NaN, amp: NaN, deltaFine: NaN, signFine: 0 };
    if (evaluated === 0) return { evidence: "unresolvable", ...none };
    if (!lastFinite) return { evidence: "undefined", ...none };
    if (maxSeen === 0) return { evidence: "flat", ...none };
    // Every normal value is a measurement of M relative to itself; no floor from the largest value
    // of the ladder (e^50 at the first offset of 1 - exp(-100 y) on a box of half-width 100, or
    // the e^-374 of exp(-1/y²) three levels before its underflow, would silence the fine levels).
    const usable = values;
    // An underflow needs no fitted law, only the fall into it: UNDERFLOW_MIN_LEVELS measured values
    // plus the underflowed one (exp(-1/y²) on [-3, 3] has two normal levels above its plateau edge).
    if (usable.length < (underflow ? UNDERFLOW_MIN_LEVELS : VANISH_MIN_LEVELS)) return { evidence: "insufficient", ...none };
    const tail = usable.slice(-VANISH_TAIL);
    const monotone = tail.every((u, i) => i === 0 || u.a <= tail[i - 1].a);
    const fine = tail[tail.length - 1];
    const beta = tail.length >= VANISH_MIN_LEVELS ? fittedSlope(tail) : NaN;
    const measured = { beta, amp: fine.a, deltaFine: fine.delta, signFine: Math.sign(fine.v) };
    if (underflow) return monotone ? { evidence: "underflow", ...measured } : { evidence: "not_vanishing", ...measured };
    if (!monotone || beta < VANISH_EXPONENT_MIN) return { evidence: "not_vanishing", ...measured };
    return { evidence: "vanishes", ...measured };
  };

  /**
   * What the vanishing law of one side predicts for |M| at the location tolerance w of c: the
   * power law continued from the finest usable level (a cusp located to w leaves a residual
   * ~ w^β), or the difference quotient at that level times w (a simple root: |M_y| · w).
   */
  const predicted = (s: SideVanishing, w: number): number => Math.max(s.amp * (w / s.deltaFine) ** s.beta, (s.amp / s.deltaFine) * w);

  type PointCheck = { verdict: "root" | "reject" | "skip"; edge?: "above" | "below"; above?: SideVanishing; below?: SideVanishing };
  /**
   * Is y = c a root of M(x, ·)? "root" with the domain edge read from the sides, "reject" when M is
   * defined next to c but does not vanish there (or the residual is too large), "skip" when the
   * point cannot be tested at this x (undefined at c and on a side, unresolvable offsets, or no
   * side with a measured vanishing law: a flat run of zeros, or an underflow plateau, is not
   * evidence of anything).
   */
  const checkPoint = (x: number, c: number, w: number): PointCheck => {
    const m0 = M({ x, y: c });
    const above = vanishing(x, c, 1);
    const below = vanishing(x, c, -1);
    const sides = [above, below];
    const out = { above, below };
    if (sides.some((s) => s.evidence === "unresolvable")) return { verdict: "skip", ...out };
    if (sides.some((s) => s.evidence === "not_vanishing")) return { verdict: "reject", ...out };
    const vanishingSides = sides.filter(vanishingSide);
    const edge = definedSide(above) && !definedSide(below) ? "above" : definedSide(below) && !definedSide(above) ? "below" : undefined;
    if (Number.isFinite(m0)) {
      if (vanishingSides.length === 0) return { verdict: "skip", ...out };
      if (!zeroToPrecision(x, c) && Math.abs(m0) > RESIDUAL_SAFETY * Math.max(...vanishingSides.map((s) => predicted(s, w)))) return { verdict: "reject", ...out };
      return edge ? { verdict: "root", edge, ...out } : { verdict: "root", ...out };
    }
    // M undefined at (x, c) itself: a removable point when M vanishes on both sides (y·log|y| at 0)
    // or on its one defined side (y·log(y) at 0, a removable point on the domain edge); untestable
    // here otherwise (dy/dt = y/t at t = 0: the line may still be a solution on either side of this
    // t). Both sides defined without vanishing was rejected above.
    if (vanishingSides.length === 2) return { verdict: "root", ...out };
    if (vanishingSides.length === 1 && edge) return { verdict: "root", edge, ...out };
    return { verdict: "skip", ...out };
  };

  /**
   * Is the interval [lo, hi], on which M(x_ref, ·) is exactly 0, one constant solution? At this x,
   * M must be 0 at its center and fall continuously into it from both edges (to the underflow, or
   * to the edge itself); a side that is flat here (the plateau is wider at this t) or undefined
   * cannot test it.
   */
  const checkPlateau = (x: number, lo: number, hi: number): PointCheck => {
    const above = vanishing(x, hi, 1);
    const below = vanishing(x, lo, -1);
    const out = { above, below };
    if ([above, below].some((s) => s.evidence === "not_vanishing")) return { verdict: "reject", ...out };
    const m0 = M({ x, y: (lo + hi) / 2 });
    const into = (s: SideVanishing) => s.evidence === "underflow" || s.evidence === "vanishes";
    if (m0 !== 0 || !into(above) || !into(below)) return { verdict: "skip", ...out };
    return { verdict: "root", ...out };
  };

  type Bracket = { lo: number; hi: number; flo: number; fhi: number };
  type Candidate = { y: number; width: number; kind: "point" | "plateau"; lo?: number; hi?: number; bracket?: Bracket };
  const candidates: Candidate[] = [];
  const zeroPlateaus: Range[] = [];
  const pushCandidate = (cand: Candidate) => {
    if (!Number.isFinite(cand.y)) return;
    if (cand.y < yRange.min - locFloor || cand.y > yRange.max + locFloor) return;
    if (candidates.length >= CANDIDATE_CAP_PER_SAMPLE * samples) return;
    // Two locations are one root when they lie within the resolution either locator achieved
    // (or that of the coordinates), never within a fraction of the scan cell.
    const existing = candidates.find((r) => Math.abs(r.y - cand.y) <= 2 * Math.max(r.width, cand.width, locFloor));
    if (existing) {
      existing.width = Math.max(existing.width, cand.width, Math.abs(existing.y - cand.y));
      return;
    }
    candidates.push({ ...cand, y: cand.y + 0 }); // + 0 turns -0 into 0
  };

  /** Stop when the bracket is at adjacent doubles (a bracket straddling 0 stops at the iteration cap instead: 2^-200 of a cell). */
  const resolved = (lo: number, hi: number) => hi - lo <= 2 * EPS * Math.max(Math.abs(lo), Math.abs(hi));

  /** Sign change of M(x_ref, ·) between lo and hi: bisection to the resolution of the coordinates. */
  const bisect = (lo0: number, hi0: number, flo0: number): { y: number; width: number } => {
    let lo = lo0, hi = hi0, flo = flo0, fhi = mAt(hi0);
    for (let k = 0; k < LOCATE_ITERATIONS && !resolved(lo, hi); k++) {
      const mid = (lo + hi) / 2;
      if (mid === lo || mid === hi) break;
      const fm = mAt(mid);
      if (!Number.isFinite(fm)) return { y: mid, width: hi - lo };
      // Zero to precision (exactly 0, or noise of a multiple root formed by cancellation): the
      // sign carries no information below this; the root is the center of the interval on which
      // M is zero to precision.
      if (fm === 0) return { y: mid, width: hi - lo };
      if (zeroToPrecision(xRef, mid)) return precisionInterval(mid, lo, hi);
      if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; }
    }
    return { y: Math.abs(flo) <= Math.abs(fhi) ? lo : hi, width: hi - lo };
  };

  /** Minimum of |M(x_ref, ·)| on [a, b] by golden section (derivative-free: a cusp is located as well as a smooth double root). */
  const goldenMinimum = (a0: number, b0: number): { y: number; width: number } => {
    const f = (y: number) => {
      const m = mAt(y);
      return Number.isFinite(m) ? Math.abs(m) : Infinity;
    };
    const R = 0.6180339887498949;
    let a = a0, b = b0;
    let x1 = b - R * (b - a), x2 = a + R * (b - a);
    let f1 = f(x1), f2 = f(x2);
    for (let k = 0; k < LOCATE_ITERATIONS && !resolved(a, b); k++) {
      if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - R * (b - a); f1 = f(x1); }
      else { a = x1; x1 = x2; f1 = f2; x2 = a + R * (b - a); f2 = f(x2); }
    }
    const best = f1 < f2 ? x1 : x2;
    // A minimum that is zero to precision (a double root formed by cancellation: y(1 - y) - 1/4 at
    // 1/2, or (y - 1)² expanded) is located as the center of the interval of such values, never
    // at whichever noise value happened to be smallest.
    return zeroToPrecision(xRef, best) ? precisionInterval(best, a0, b0) : { y: best, width: b - a };
  };

  /**
   * The last y at which M(x_ref, ·) is finite between a finite point and an undefined one: bisection
   * on finiteness. sqrt(y) gives exactly 0, sqrt(y - a) exactly the double a.
   */
  const domainEdgeAt = (finiteY: number, undefinedY: number): { y: number; width: number } => {
    let fin = finiteY, und = undefinedY;
    for (let k = 0; k < LOCATE_ITERATIONS && !resolved(Math.min(fin, und), Math.max(fin, und)); k++) {
      const mid = (fin + und) / 2;
      if (mid === fin || mid === und) break;
      if (Number.isFinite(mAt(mid))) fin = mid;
      else und = mid;
    }
    return { y: fin, width: Math.abs(und - fin) };
  };

  /**
   * The boundary of the set on which M(x_ref, ·) is zero to precision, between a point in it and a
   * point outside it (or undefined): bisection on the predicate to the last double inside. (A
   * bracket that is zero to precision at both ends converges to `nonzeroY` itself.)
   */
  const zeroEdge = (zeroY: number, nonzeroY: number): number => {
    let z = zeroY, n = nonzeroY;
    for (let k = 0; k < LOCATE_ITERATIONS && !resolved(Math.min(z, n), Math.max(z, n)); k++) {
      const mid = (z + n) / 2;
      if (mid === z || mid === n) break;
      if (inZeroSet(mid) && connectedZeros(z, mid)) z = mid;
      else {
        // A midpoint in the zero set but not connected to z is a root of its own (2 between the
        // sample 0 and its neighbor 4 of y(1 - y)(2 - y)): a candidate, and the edge lies below it.
        if (inZeroSet(mid)) pushCandidate({ y: mid, width: locFloor, kind: "point" });
        n = mid;
      }
    }
    return z;
  };

  /**
   * A point of the zero set of M(x_ref, ·): the computed value is exactly 0 (a flat region or an
   * underflow plateau) or zero to precision (the noise of a multiple root formed by cancellation).
   */
  const inZeroSet = (y: number): boolean => mAt(y) === 0 || zeroToPrecision(xRef, y);

  /**
   * Does M(x_ref, ·) rise clearly above its rounding floor at y: beyond RESIDUAL_SAFETY times the
   * bound, the slack this module allows rounding everywhere? A value within a few rounding units
   * of the bound is the ragged edge of a zero-to-precision band, not M being nonzero.
   */
  const risesAt = (y: number): boolean => {
    const b = MBound({ x: xRef, y });
    return Number.isFinite(b.value) && Math.abs(b.value) > RESIDUAL_SAFETY * b.error;
  };

  /**
   * Are a and b (both in the zero set) connected through it? The zero set of a plateau is an
   * interval, so M cannot rise between two of its points; where it does at a quarter point, the
   * two are separate roots (y(1 - y)(2 - y) at the samples 0 and 2 of a cell of 2, or a bisection
   * midpoint that happens to be another root; y·exp(-100 y²) at the samples -5 and 0 of a cell
   * of 5, where M = 1e-68 at -1.25), never one zero set. A quarter point of a disconnected pair
   * that is itself in the zero set is a root spotted between the samples (y = 1 between 0 and 2)
   * and becomes a candidate for the ladder to confirm.
   */
  const connectedZeros = (a: number, b: number): boolean => {
    const probes = [0.25, 0.5, 0.75].map((f) => a + f * (b - a));
    if (!probes.some(risesAt)) return true;
    for (const y of probes) if (inZeroSet(y)) pushCandidate({ y, width: locFloor, kind: "point" });
    return false;
  };

  /**
   * The interval around y0 (zero to precision) on which M(x_ref, ·) is zero to precision, between
   * lo and hi: a root whose location the arithmetic cannot pin down further is reported at the
   * center, with half the width as its location tolerance. For -(y - 1/2)² formed by cancellation
   * that is |y - 1/2| < ~7e-9 (sqrt of the rounding bound ~ 4 eps / 4), centered on 1/2.
   */
  const precisionInterval = (y0: number, lo: number, hi: number): { y: number; width: number } => {
    const a = zeroEdge(y0, lo);
    const b = zeroEdge(y0, hi);
    return { y: (a + b) / 2, width: (b - a) / 2 };
  };

  const finiteAt = (i: number) => i >= 0 && i < ys.length && Number.isFinite(ref[i]);
  const nonzeroAt = (i: number) => finiteAt(i) && ref[i] !== 0;
  const edgeWidth = (y: number) => Math.max(2 * EPS * Math.abs(y), locFloor);

  /**
   * A run of samples i..j at which M(x_ref, ·) is exactly 0 (see the header): a point, an
   * underflow plateau with a root at its center, roots at its edges, or a plateau with no claim.
   */
  const zeroRun = (i: number, j: number) => {
    type Edge = { kind: "open" | "undefined" | "located"; y: number };
    const endAt = (k: number, dir: 1 | -1): Edge => {
      const nb = k + dir;
      const inside = nb >= 0 && nb < ys.length;
      const nbY = inside ? ys[nb] : ys[k] + dir * cell;
      const nbV = inside ? ref[nb] : mAt(nbY);
      if (!Number.isFinite(nbV)) return { kind: "undefined", y: ys[k] };
      // A zero neighbor connected through the zero set continues the run (the box edge, or the
      // next run of a split scan at the range end); a disconnected one is a separate root and the
      // edge is located toward it as toward a nonzero neighbor.
      if (nbV === 0 && (!inside || connectedZeros(ys[k], nbY))) return { kind: "open", y: ys[k] };
      return { kind: "located", y: zeroEdge(ys[k], nbY) };
    };
    const lo = endAt(i, -1);
    const hi = endAt(j, 1);
    const c = (lo.y + hi.y) / 2;
    const bracket = nonzeroAt(i - 1) && nonzeroAt(j + 1) ? { lo: ys[i - 1], hi: ys[j + 1], flo: ref[i - 1], fhi: ref[j + 1] } : undefined;
    if (hi.y - lo.y <= 2 * edgeWidth(c)) {
      // The zero set is a point: an ordinary candidate, bracketed by the nonzero neighbours
      // (deflation). A single sample at which M is exactly 0 is the root to the last bit (sin(y)
      // at 0, y·log|y| at -1); the zero-to-precision band of a few ulps around it says no more.
      pushCandidate({ y: i === j ? ys[i] : c, width: Math.max(hi.y - lo.y, locFloor), kind: "point", bracket });
      return;
    }
    // A wider band on which M is zero to precision WITHOUT underflowing (the cancellation of
    // y(1 - y) - 1/4 on |y - 1/2| < 7e-9; never the inside of an underflow plateau, whose
    // samples carry the underflow flag), into which M falls continuously from both sides down to
    // its rounding floor: one root at the center, known to half the width. The ladder from the
    // center decides: it measures the law above the floor for a multiple root, and is 'flat' (no
    // evidence) inside a flat region wider than the cell, which falls through to the edge rules.
    const cancellationBand = [0.25, 0.5, 0.75].every((f) => zeroToPrecision(xRef, lo.y + f * (hi.y - lo.y)));
    if (lo.kind === "located" && hi.kind === "located" && cancellationBand && checkPoint(xRef, c, (hi.y - lo.y) / 2).verdict === "root") {
      pushCandidate({ y: c, width: (hi.y - lo.y) / 2, kind: "point", bracket });
      return;
    }
    const loSide = lo.kind === "located" ? vanishing(xRef, lo.y, -1) : undefined;
    const hiSide = hi.kind === "located" ? vanishing(xRef, hi.y, 1) : undefined;
    if (loSide?.evidence === "underflow" && hiSide?.evidence === "underflow") {
      pushCandidate({ y: c, width: (hi.y - lo.y) / 2, kind: "plateau", lo: lo.y, hi: hi.y });
      return;
    }
    if (loSide && vanishingSide(loSide)) pushCandidate({ y: lo.y, width: edgeWidth(lo.y), kind: "point" });
    if (hiSide && vanishingSide(hiSide)) pushCandidate({ y: hi.y, width: edgeWidth(hi.y), kind: "point" });
    zeroPlateaus.push({ min: Math.max(lo.y, yRange.min), max: Math.min(hi.y, yRange.max) });
  };

  // Every finite sample exactly 0: the runs below say where, and every finite sample is also a
  // candidate in its own right for the ladder to decide (y·exp(-100 y²) with a cell of 5 keeps 0).
  if (allZero) for (let i = 0; i < ys.length; i++) if (finiteAt(i)) pushCandidate({ y: ys[i], width: locFloor, kind: "point" });
  for (let i = 0; i < ys.length; i++) {
    const v = ref[i];
    if (!Number.isFinite(v)) continue;
    // Domain edge: a finite sample next to an undefined one, one cell outside the range included
    // (the box edge is not evidence that the equation ends there; the probe outside is).
    const belowY = i > 0 ? ys[i - 1] : ys[0] - cell;
    const aboveY = i + 1 < ys.length ? ys[i + 1] : ys[ys.length - 1] + cell;
    const belowDefined = i > 0 ? finiteAt(i - 1) : Number.isFinite(mAt(belowY));
    const aboveDefined = i + 1 < ys.length ? finiteAt(i + 1) : Number.isFinite(mAt(aboveY));
    if (v !== 0 && !belowDefined) { const e = domainEdgeAt(ys[i], belowY); pushCandidate({ ...e, kind: "point" }); }
    if (v !== 0 && !aboveDefined) { const e = domainEdgeAt(ys[i], aboveY); pushCandidate({ ...e, kind: "point" }); }
    if (v === 0) {
      // A run of zero samples is one zero set only when M is zero between consecutive samples
      // too; otherwise each sample is its own run (0, 1 and 2 of y(1 - y)(2 - y) with a cell of 1).
      let j = i;
      while (j + 1 < ys.length && ref[j + 1] === 0 && connectedZeros(ys[j], ys[j + 1])) j++;
      zeroRun(i, j);
      i = j;
      continue;
    }
    if (nonzeroAt(i + 1) && Math.sign(v) !== Math.sign(ref[i + 1])) {
      const r = bisect(ys[i], ys[i + 1], v);
      pushCandidate({ ...r, kind: "point", bracket: { lo: ys[i], hi: ys[i + 1], flo: v, fhi: ref[i + 1] } });
      continue;
    }
    // Local minimum of |M| between samples of one sign: a tangential root or a cusp (or nothing:
    // the ladder decides). At the ends of the range the bracket is the single cell inside.
    const a = i > 0 && finiteAt(i - 1) ? Math.abs(ref[i - 1]) : Infinity;
    const b = Math.abs(v);
    const c = finiteAt(i + 1) ? Math.abs(ref[i + 1]) : Infinity;
    const sameSign = (i === 0 || !finiteAt(i - 1) || Math.sign(ref[i - 1]) === Math.sign(v)) && (!finiteAt(i + 1) || Math.sign(ref[i + 1]) === Math.sign(v));
    if (b <= a && b <= c && (b < a || b < c) && sameSign && (a !== Infinity || c !== Infinity)) {
      const lo = a === Infinity ? ys[i] : ys[i - 1];
      const hi = c === Infinity ? ys[i] : ys[i + 1];
      const r = goldenMinimum(lo, hi);
      const bracket = nonzeroAt(i - 1) && nonzeroAt(i + 1) ? { lo, hi, flo: ref[i - 1], fhi: ref[i + 1] } : undefined;
      pushCandidate({ ...r, kind: "point", bracket });
    }
  }

  // Verify each candidate at every probe (snapping a root within the rounding floor of the
  // coordinates to exactly 0): no probe may reject it, at least one must confirm it, and the
  // "for all t" count is taken over the probes where the line could be tested at all.
  const solutions: EquilibriumSolution[] = [];
  candidates.sort((u, v) => u.y - v.y);
  for (let ci = 0; ci < candidates.length; ci++) {
    const cand = candidates[ci];
    opts.checkpoint?.();
    let c = cand.y;
    // Location tolerance: the bracket the locator ended with, at least the spacing of doubles at c.
    let w = Math.max(cand.width, 2 * EPS * Math.abs(c));
    const verify = (cc: number, ww: number): PointCheck[] =>
      xProbe.map((x) => (cand.kind === "plateau" ? checkPlateau(x, cand.lo as number, cand.hi as number) : checkPoint(x, cc, ww)));
    const accepted = (r: PointCheck[]) => !r.some((p) => p.verdict === "reject") && r.some((p) => p.verdict === "root");
    let results: PointCheck[] | undefined;
    if (cand.kind === "point" && c !== 0 && Math.abs(c) <= locFloor) {
      // Within the rounding floor of the scanned coordinates the root is 0, unless 0 itself fails
      // the check (sqrt(y - 1e-20) is undefined at 0): then the point stays as located.
      const snapped = verify(0, Math.max(w, Math.abs(c)));
      if (accepted(snapped)) {
        w = Math.max(w, Math.abs(c));
        c = 0;
        results = snapped;
      }
    }
    results ??= verify(c, w);
    if (!accepted(results)) continue;
    const rootIdx = results.map((p, k) => (p.verdict === "root" ? k : -1)).filter((k) => k >= 0);
    const domainEdge = (results[refIndex].verdict === "root" ? results[refIndex] : results[rootIdx[0]]).edge;
    // Probes where the line is confirmed AND N != 0 there. M = N = 0 means the line passes through
    // a singular point of the direction field: not a counterexample (dy = 0 still holds on either
    // side), so the probe is skipped instead of counted against the line; otherwise a probe landing
    // exactly on the point would make the answer depend on whether the box happens to be
    // symmetric. A line singular at (almost) every probe is not a solution of anything and is
    // dropped. "Zero" is relative to |N| within a ladder offset of the line, never to a box-wide
    // magnitude.
    const goodX: number[] = [];
    const goodChecks: PointCheck[] = [];
    for (const k of rootIdx) {
      const x = xProbe[k];
      const p = results[k];
      const n = N({ x, y: c });
      if (!Number.isFinite(n)) continue;
      const offs = [p.above?.deltaFine, p.below?.deltaFine].filter((d): d is number => Number.isFinite(d as number));
      const near = offs.flatMap((d) => [N({ x, y: c + d }), N({ x, y: c - d })]).filter(Number.isFinite).map(Math.abs);
      const nLocal = Math.max(Math.abs(n), ...near);
      if (n === 0 || Math.abs(n) <= N_FLOOR * EPS * nLocal) continue;
      goodX.push(x);
      goodChecks.push(p);
    }
    if (goodX.length < MIN_USABLE_PROBES) continue;

    // Stability: the sign of dy/dt at the finest usable ladder level of each side (inside the
    // region where the local law holds, below the distance to any other root), never at a
    // fraction of the box. For a plateau the levels start at its edges.
    const baseAbove = cand.kind === "plateau" ? (cand.hi as number) : c;
    const baseBelow = cand.kind === "plateau" ? (cand.lo as number) : c;
    let stability: EquilibriumSolution["stability"] | undefined;
    for (let k = 0; k < goodX.length; k++) {
      const x = goodX[k];
      const p = goodChecks[k];
      const dA = p.above?.deltaFine ?? NaN;
      const dB = p.below?.deltaFine ?? NaN;
      const yA = Number.isFinite(dA) ? baseAbove + dA : NaN;
      const yB = Number.isFinite(dB) ? baseBelow - dB : NaN;
      let s: EquilibriumSolution["stability"] | undefined;
      if (domainEdge) {
        // Only the defined side exists: the sign of dy/dt there says whether solutions approach
        // the line or leave it. A probe with no sign (slope 0 or undefined) decides nothing.
        const yS = domainEdge === "above" ? yA : yB;
        if (!Number.isFinite(yS)) continue;
        const s1 = slope(x, yS);
        const toward = domainEdge === "above" ? s1 < 0 : s1 > 0;
        const away = domainEdge === "above" ? s1 > 0 : s1 < 0;
        if (toward) s = "edge_approach";
        else if (away) s = "edge_leave";
        else continue;
      } else {
        // A side without a measured level or without a sign (slope 0 or undefined at this t)
        // decides nothing at this probe.
        if (!Number.isFinite(yA) || !Number.isFinite(yB)) continue;
        const below = slope(x, yB);
        const above = slope(x, yA);
        if (!Number.isFinite(below) || !Number.isFinite(above) || below === 0 || above === 0) continue;
        if (below > 0 && above < 0) s = "stable";
        else if (below < 0 && above > 0) s = "unstable";
        else s = "semi_stable";
      }
      if (stability === undefined) stability = s;
      else if (stability !== s) {
        stability = "varies";
        break;
      }
    }

    // Deflation: another sign change between the root and an end of its scan bracket (read at the
    // reference probe, where the bracket was measured) is bisected and queued.
    const pRef = results[refIndex];
    if (cand.kind === "point" && cand.bracket && pRef.verdict === "root") {
      const { lo, hi, flo, fhi } = cand.bracket;
      const bl = pRef.below;
      if (bl && Number.isFinite(bl.deltaFine) && bl.signFine !== 0 && Math.sign(flo) !== bl.signFine && c - bl.deltaFine > lo) {
        const y1 = c - bl.deltaFine;
        pushCandidate({ ...bisect(lo, y1, flo), kind: "point", bracket: { lo, hi: y1, flo, fhi: mAt(y1) } });
      }
      const ab = pRef.above;
      if (ab && Number.isFinite(ab.deltaFine) && ab.signFine !== 0 && Math.sign(fhi) !== ab.signFine && c + ab.deltaFine < hi) {
        const y0 = c + ab.deltaFine;
        pushCandidate({ ...bisect(y0, hi, mAt(y0)), kind: "point", bracket: { lo: y0, hi, flo: mAt(y0), fhi } });
      }
    }

    // A line whose sides gave no sign at any probe cannot be placed: 'varies' for a domain edge
    // (the only value that makes no claim about approach or departure), 'semi_stable' otherwise.
    const fallback: EquilibriumSolution["stability"] = domainEdge ? "varies" : "semi_stable";
    const solution: EquilibriumSolution = { y: c, stability: stability ?? fallback, probes: { usable: goodX.length, total: xProbe.length } };
    if (domainEdge) solution.domainEdge = domainEdge;
    if (cand.kind === "plateau") solution.plateauHalfWidth = ((cand.hi as number) - (cand.lo as number)) / 2;
    solution.uniqueness = solutionUniqueness(slope, c, goodX, span, opts.checkpoint);
    solutions.push(solution);
  }
  solutions.sort((u, v) => u.y - v.y);
  return { autonomous, solutions, resolution: cell, zeroPlateaus };
}

const UNIQUENESS_RANK: Record<UniquenessVerdict, number> = { unbounded: 3, borderline: 2, untestable: 1, bounded_at_tested_scales: 0 };

/**
 * Uniqueness at y = c: the Lipschitz probe on d -> g(t, c + d) - g(t, c) at every usable t (the
 * residual g(t, c) is subtracted so a root located to a few ulps does not read as a 1/δ growth;
 * an undefined value at d = 0 counts as 0; |g(t, c + d)| + |g(t, c)| is the magnitude the rounding
 * floor of the difference is measured against, local to each offset). The worst probe decides; the
 * first offset is 1e-2 of the y span, and the verdict is decided at the finest scales (uniqueness.ts).
 */
function solutionUniqueness(slope: (x: number, y: number) => number, c: number, goodX: number[], span: number, checkpoint?: () => void): SolutionUniqueness {
  let worst: SolutionUniqueness | undefined;
  let failing = 0;
  for (const x of goodX) {
    const s0 = slope(x, c);
    const base = Number.isFinite(s0) ? s0 : 0;
    const r = lipschitzProbe((d) => slope(x, c + d) - base, span, { checkpoint, center: c, magnitude: (d) => Math.abs(slope(x, c + d)) + Math.abs(base) });
    if (r.verdict === "unbounded") failing++;
    const side: SolutionUniqueness["side"] = r.sides.above.verdict === r.verdict || r.sides.below.verdict !== r.verdict ? "above" : "below";
    if (!worst || UNIQUENESS_RANK[r.verdict] > UNIQUENESS_RANK[worst.verdict]) {
      worst = { verdict: r.verdict, exponent: r.exponent, probesFailing: 0, probesTotal: goodX.length, side };
    }
  }
  const out = worst ?? { verdict: "untestable" as const, exponent: NaN, probesFailing: 0, probesTotal: goodX.length, side: "above" as const };
  out.probesFailing = failing;
  return out;
}
