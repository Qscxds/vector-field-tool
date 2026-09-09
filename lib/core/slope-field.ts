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
import { assertNoLeftHandSide, compileScalar, compileSystem } from "./parse";
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
 * for the variable mode.
 */
export function compileDifferential(spec: FirstOrderSpec): { M: (p: Vec2) => number; N: (p: Vec2) => number } {
  const { M, N } = toDifferential(spec);
  const opts = { variables: "ty" as const };
  return { M: compileScalar(M, spec.params, opts), N: compileScalar(N, spec.params, opts) };
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
};

export type FirstOrderEquilibria = {
  /**
   * Whether g = -M/N is independent of t (informational; constant solutions no longer require
   * it). "untestable" when fewer than 3 pairs of finite slopes at the same y could be compared
   * across the t probes (the right-hand side is undefined on most of the range): neither
   * "autonomous" nor "depends on t" may be claimed then.
   */
  autonomous: boolean | "untestable";
  solutions: EquilibriumSolution[];
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
/** Vanishing ladder: |M(t, c ± h · 4^-k)|, k = 0..VANISH_LEVELS - 1, h = the scan cell (down to 9e-10 h). */
const VANISH_LEVELS = 16;
const VANISH_SHRINK = 4;
/** M vanishes at c when its values over the finest usable levels fall like δ^β with β at least this. */
const VANISH_EXPONENT_MIN = 0.05;
/** Levels the vanishing exponent is fitted over (the finest usable ones). */
const VANISH_TAIL = 4;
/** Usable levels needed for the fit. */
const VANISH_MIN_LEVELS = 3;
/** A ladder value below this many eps of the largest value seen on that side is rounding noise. */
const ROUNDING_FLOOR = 10;
/** Ladder offsets below this many eps of |c| are not carried by c to 1e-3 and are not used (β only needs that). */
const VANISH_POSITION_GUARD = 1e3;
/** The stability probe offset is carried by c to 1e-6 (as the uniqueness probe's POSITION_GUARD). */
const PROBE_POSITION_GUARD = 1e6;
/** The residual |M(t, c)| may exceed what the vanishing law predicts at the location tolerance by this factor. */
const RESIDUAL_SAFETY = 10;
/** Candidates closer than this fraction of a scan cell are one root: the scan cannot separate them. */
const MERGE_CELL_FRACTION = 1e-3;
/** N(t, c) counts as zero (a singular point on the line) below this many eps of |N| within a probe offset of c. */
const N_FLOOR = 1e3;
/** Bracketing iterations (bisection to adjacent doubles from one cell takes about 50; golden section about 70). */
const LOCATE_ITERATIONS = 200;

/**
 * What M(t, ·) does on one side of a candidate, measured on the vanishing ladder:
 * - "vanishes": the values fall toward 0 like δ^β with β >= VANISH_EXPONENT_MIN (evidence FOR a root);
 * - "not_vanishing": they level off at a nonzero value or grow (evidence AGAINST: the local minimum
 *   of y^8 + 1 at 0, a pole);
 * - "flat": M is exactly 0 at every level (consistent with a root, but no evidence by itself: the
 *   inside of a run of zero samples, or an underflow plateau such as y·exp(-y²) beyond |y| = 27);
 * - "insufficient": fewer than VANISH_MIN_LEVELS usable levels (the values hit the rounding floor
 *   at once, as at the edge of an underflow plateau);
 * - "undefined": M is not finite at the finest level evaluated (the equation ends on this side);
 * - "unresolvable": no level could be evaluated (every offset is below the position guard).
 */
type SideVanishing = {
  evidence: "vanishes" | "not_vanishing" | "flat" | "insufficient" | "undefined" | "unresolvable";
  /** Fitted exponent β over the finest usable levels ("vanishes" and "not_vanishing" only). */
  beta: number;
  /** |M| at the finest usable level and that level's offset ("vanishes" and "not_vanishing" only). */
  amp: number;
  deltaFine: number;
};

/** The equation is defined on this side of the candidate. */
const definedSide = (s: SideVanishing) => s.evidence !== "undefined" && s.evidence !== "unresolvable";

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
 * Constant solutions of M dt + N dy = 0: y = c such that M(t, c) = 0 for every t while N(t, c) != 0.
 * (For dy/dt = g this is g(t, c) = 0 for every t.)
 *
 * Candidates come from the scan of c -> M(t_ref, c) over the y range: samples where M is exactly 0,
 * sign changes (bisected to adjacent doubles), local minima of |M| between samples of one sign
 * (a derivative-free golden-section minimizer, so a cusp such as sqrt|y| is located as well as a
 * smooth double root), and domain edges (a finite sample next to an undefined one, one cell
 * OUTSIDE the range included, bisected on finiteness to the last defined double).
 *
 * A candidate is accepted by a LOCAL criterion only, at t_ref and then at every other t probe:
 * M(t, ·) must vanish continuously at c, i.e. on each side where it is defined the values
 * |M(t, c ± h 4^-k)| must fall toward 0 like δ^β with β > 0 over the finest resolvable levels, and
 * the residual |M(t, c)| must be 0 or within what that law predicts at the location tolerance of c
 * (bisection width, golden bracket, or the rounding floor of the scanned coordinates). No
 * tolerance is relative to a box-wide statistic: y^8 + 1 on [-100, 100] has no constant solution,
 * and tanh(y) - 0.5 on [-1e8, 1e8] has exactly one. A candidate whose |M| levels off at a nonzero
 * value (the local minimum of y^8 + 1 at 0) or grows (a pole) is not a root. A candidate at which
 * M(t, c) itself is undefined but vanishes on both sides (y·log|y| at 0) is a removable point on a
 * constant solution; one where M is defined on one side only is a domain-edge solution, and its
 * side is read from the ladder, so a line lying exactly on the box edge is an edge all the same.
 * A root located within the rounding floor of the scanned coordinates is reported as exactly 0.
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
  const { M, N } = compileDifferential(spec);
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

  // Reference column for the scan: the probe t with the most finite M values.
  const table = xProbe.map((x) => {
    opts.checkpoint?.();
    return ys.map((y) => M({ x, y }));
  });
  const finiteCounts = table.map((col) => col.filter(Number.isFinite).length);
  const refIndex = finiteCounts.indexOf(Math.max(...finiteCounts));
  const ref = table[refIndex];
  const xRef = xProbe[refIndex];

  // Autonomy of the slope (informational): at every 5th y, the slopes at the other probes are
  // compared with the reference probe's, relative to the two slopes themselves. Too few
  // comparable pairs (the slope is undefined almost everywhere) is a third state, not "depends on t".
  let comparable = 0;
  let tDependent = false;
  outer: for (let i = 0; i < ys.length; i += 5) {
    const s0 = slope(xRef, ys[i]);
    if (!Number.isFinite(s0)) continue;
    for (const x of xProbe) {
      if (x === xRef) continue;
      const s = slope(x, ys[i]);
      if (!Number.isFinite(s)) continue;
      comparable++;
      if (Math.abs(s - s0) > 1e-9 * Math.max(Math.abs(s0), Math.abs(s))) {
        tDependent = true;
        break outer;
      }
    }
  }
  const autonomous: FirstOrderEquilibria["autonomous"] = tDependent ? false : comparable < 3 ? "untestable" : true;

  // M ≡ 0 on its whole domain (every y is trivially constant: no direction field to speak of) or
  // N ≡ 0 (no slope anywhere): no constant solution is listed. "Whole domain" needs the finite
  // samples to cover more than one y, so a line that is the only defined point of the range
  // (sqrt(y) on y in [-4, 0]) is not mistaken for M ≡ 0.
  const finiteYs = new Set<number>();
  let allZero = true;
  table.forEach((col) => col.forEach((v, i) => { if (Number.isFinite(v)) { finiteYs.add(ys[i]); if (v !== 0) allZero = false; } }));
  if (finiteYs.size === 0 || (allZero && finiteYs.size > 1)) return { autonomous, solutions: [] };
  const nValues = xProbe.flatMap((x) => ys.filter((_, i) => i % 8 === 0).map((y) => N({ x, y }))).filter(Number.isFinite);
  if (nValues.length > 0 && nValues.every((v) => v === 0)) return { autonomous, solutions: [] };

  const mAt = (y: number) => M({ x: xRef, y });

  /** Vanishing ladder on one side of c at probe x (see SideVanishing). */
  const vanishing = (x: number, c: number, sign: 1 | -1): SideVanishing => {
    const positionFloor = VANISH_POSITION_GUARD * EPS * Math.abs(c);
    const values: { delta: number; a: number }[] = [];
    let evaluated = 0;
    let lastFinite = false;
    let maxSeen = 0;
    for (let k = 0; k < VANISH_LEVELS; k++) {
      const delta = cell * VANISH_SHRINK ** -k;
      if (delta < positionFloor) break;
      evaluated++;
      const v = M({ x, y: c + sign * delta });
      lastFinite = Number.isFinite(v);
      if (!lastFinite) continue;
      const a = Math.abs(v);
      if (a > maxSeen) maxSeen = a;
      values.push({ delta, a });
    }
    const none = { beta: NaN, amp: NaN, deltaFine: NaN };
    if (evaluated === 0) return { evidence: "unresolvable", ...none };
    if (!lastFinite) return { evidence: "undefined", ...none };
    if (maxSeen === 0) return { evidence: "flat", ...none };
    const usable = values.filter((u) => u.a > ROUNDING_FLOOR * EPS * maxSeen);
    if (usable.length < VANISH_MIN_LEVELS) return { evidence: "insufficient", ...none };
    const beta = fittedSlope(usable.slice(-VANISH_TAIL));
    const fine = usable[usable.length - 1];
    return { evidence: beta >= VANISH_EXPONENT_MIN ? "vanishes" : "not_vanishing", beta, amp: fine.a, deltaFine: fine.delta };
  };

  /**
   * What the vanishing law of one side predicts for |M| at the location tolerance w of c: the
   * power law continued from the finest usable level (a cusp located to w leaves a residual
   * ~ w^β), or the difference quotient at that level times w (a simple root: |M_y| · w).
   */
  const predicted = (s: SideVanishing, w: number): number => Math.max(s.amp * (w / s.deltaFine) ** s.beta, (s.amp / s.deltaFine) * w);

  type PointCheck = { verdict: "root" | "reject" | "skip"; edge?: "above" | "below" };
  /**
   * Is y = c a root of M(x, ·)? "root" with the domain edge read from the sides, "reject" when M is
   * defined next to c but does not vanish there (or the residual is too large), "skip" when the
   * point cannot be tested at this x (undefined at c and on a side, unresolvable offsets, or no
   * side with a measured vanishing law: a flat run of zeros is not evidence of anything).
   */
  const checkPoint = (x: number, c: number, w: number): PointCheck => {
    const m0 = M({ x, y: c });
    const above = vanishing(x, c, 1);
    const below = vanishing(x, c, -1);
    const sides = [above, below];
    if (sides.some((s) => s.evidence === "unresolvable")) return { verdict: "skip" };
    if (sides.some((s) => s.evidence === "not_vanishing")) return { verdict: "reject" };
    const vanishingSides = sides.filter((s) => s.evidence === "vanishes");
    if (Number.isFinite(m0)) {
      if (vanishingSides.length === 0) return { verdict: "skip" };
      if (m0 !== 0 && Math.abs(m0) > RESIDUAL_SAFETY * Math.max(...vanishingSides.map((s) => predicted(s, w)))) return { verdict: "reject" };
      const edge = definedSide(above) && !definedSide(below) ? "above" : definedSide(below) && !definedSide(above) ? "below" : undefined;
      return edge ? { verdict: "root", edge } : { verdict: "root" };
    }
    // M undefined at (x, c) itself: a removable point when M vanishes on both sides (y·log|y| at 0);
    // untestable here otherwise (dy/dt = y/t at t = 0: the line may still be a solution on either
    // side of this t). Both sides defined without vanishing was rejected above.
    if (vanishingSides.length === 2) return { verdict: "root" };
    return { verdict: "skip" };
  };

  type Candidate = { y: number; width: number };
  const candidates: Candidate[] = [];
  const pushCandidate = (y: number, width: number) => {
    if (!Number.isFinite(y)) return;
    if (y < yRange.min - locFloor || y > yRange.max + locFloor) return;
    const existing = candidates.find((r) => Math.abs(r.y - y) <= MERGE_CELL_FRACTION * cell);
    if (existing) {
      existing.width = Math.max(existing.width, width, Math.abs(existing.y - y));
      return;
    }
    candidates.push({ y: y + 0, width }); // + 0 turns -0 into 0
  };

  /** Stop when the bracket is at adjacent doubles (a bracket straddling 0 stops at the iteration cap instead: 2^-200 of a cell). */
  const resolved = (lo: number, hi: number) => hi - lo <= 2 * EPS * Math.max(Math.abs(lo), Math.abs(hi));

  /** Sign change of M(x_ref, ·) between lo and hi: bisection to the resolution of the coordinates. */
  const bisect = (lo0: number, hi0: number, flo0: number): Candidate => {
    let lo = lo0, hi = hi0, flo = flo0, fhi = mAt(hi0);
    for (let k = 0; k < LOCATE_ITERATIONS && !resolved(lo, hi); k++) {
      const mid = (lo + hi) / 2;
      if (mid === lo || mid === hi) break;
      const fm = mAt(mid);
      if (!Number.isFinite(fm)) return { y: mid, width: hi - lo };
      if (fm === 0) return { y: mid, width: hi - lo };
      if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; }
    }
    return { y: Math.abs(flo) <= Math.abs(fhi) ? lo : hi, width: hi - lo };
  };

  /** Minimum of |M(x_ref, ·)| on [a, b] by golden section (derivative-free: a cusp is located as well as a smooth double root). */
  const goldenMinimum = (a0: number, b0: number): Candidate => {
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
    return { y: f1 < f2 ? x1 : x2, width: b - a };
  };

  /**
   * The last y at which M(x_ref, ·) is finite between a finite point and an undefined one: bisection
   * on finiteness. sqrt(y) gives exactly 0, sqrt(y - a) exactly the double a.
   */
  const domainEdgeAt = (finiteY: number, undefinedY: number): Candidate => {
    let fin = finiteY, und = undefinedY;
    for (let k = 0; k < LOCATE_ITERATIONS && !resolved(Math.min(fin, und), Math.max(fin, und)); k++) {
      const mid = (fin + und) / 2;
      if (mid === fin || mid === und) break;
      if (Number.isFinite(mAt(mid))) fin = mid;
      else und = mid;
    }
    return { y: fin, width: Math.abs(und - fin) };
  };

  const finiteAt = (i: number) => i >= 0 && i < ys.length && Number.isFinite(ref[i]);
  for (let i = 0; i < ys.length; i++) {
    const v = ref[i];
    if (!Number.isFinite(v)) continue;
    // Domain edge: a finite sample next to an undefined one, one cell outside the range included
    // (the box edge is not evidence that the equation ends there; the probe outside is).
    const belowY = i > 0 ? ys[i - 1] : ys[0] - cell;
    const aboveY = i + 1 < ys.length ? ys[i + 1] : ys[ys.length - 1] + cell;
    const belowDefined = i > 0 ? finiteAt(i - 1) : Number.isFinite(mAt(belowY));
    const aboveDefined = i + 1 < ys.length ? finiteAt(i + 1) : Number.isFinite(mAt(aboveY));
    if (!belowDefined) { const e = domainEdgeAt(ys[i], belowY); pushCandidate(e.y, e.width); }
    if (!aboveDefined) { const e = domainEdgeAt(ys[i], aboveY); pushCandidate(e.y, e.width); }
    if (v === 0) {
      pushCandidate(ys[i], locFloor);
      continue;
    }
    if (finiteAt(i + 1) && ref[i + 1] !== 0 && Math.sign(v) !== Math.sign(ref[i + 1])) {
      const r = bisect(ys[i], ys[i + 1], v);
      pushCandidate(r.y, r.width);
      continue;
    }
    // Local minimum of |M| between samples of one sign: a tangential root or a cusp (or nothing:
    // the ladder decides). At the ends of the range the bracket is the single cell inside.
    const a = i > 0 && finiteAt(i - 1) ? Math.abs(ref[i - 1]) : Infinity;
    const b = Math.abs(v);
    const c = finiteAt(i + 1) ? Math.abs(ref[i + 1]) : Infinity;
    const sameSign = (i === 0 || !finiteAt(i - 1) || Math.sign(ref[i - 1]) === Math.sign(v)) && (!finiteAt(i + 1) || Math.sign(ref[i + 1]) === Math.sign(v));
    if (b <= a && b <= c && (b < a || b < c) && sameSign && (a !== Infinity || c !== Infinity)) {
      const r = goldenMinimum(a === Infinity ? ys[i] : ys[i - 1], c === Infinity ? ys[i] : ys[i + 1]);
      pushCandidate(r.y, r.width);
    }
  }

  // Verify each candidate at the reference probe (snapping a root within the rounding floor of the
  // coordinates to exactly 0), then "for all t": M(t, c) = 0 and N(t, c) != 0 at every probe.
  const solutions: EquilibriumSolution[] = [];
  for (const cand of candidates.sort((u, v) => u.y - v.y)) {
    opts.checkpoint?.();
    let c = cand.y;
    // Location tolerance: the bracket the locator ended with, at least the spacing of doubles at c.
    let w = Math.max(cand.width, 2 * EPS * Math.abs(c));
    let atRef: PointCheck | undefined;
    if (c !== 0 && Math.abs(c) <= locFloor) {
      // Within the rounding floor of the scanned coordinates the root is 0, unless 0 itself fails
      // the check (sqrt(y - 1e-20) is undefined at 0): then the point stays as located.
      const snapped = checkPoint(xRef, 0, Math.max(w, Math.abs(c)));
      if (snapped.verdict === "root") {
        w = Math.max(w, Math.abs(c));
        c = 0;
        atRef = snapped;
      }
    }
    atRef ??= checkPoint(xRef, c, w);
    if (atRef.verdict !== "root") continue;
    const domainEdge = atRef.edge;
    // The stability probe offset: well inside the scan cell, but carried by c.
    const probe = Math.max(1e-6 * span, PROBE_POSITION_GUARD * EPS * Math.abs(c));
    let ok = true;
    const goodX: number[] = [];
    for (const x of xProbe) {
      const check = x === xRef ? atRef : checkPoint(x, c, w);
      if (check.verdict === "reject") { ok = false; break; }
      if (check.verdict === "skip") continue;
      // M = N = 0 here: the line passes through a singular point of the direction field. That is
      // not a counterexample (dy = 0 still holds on either side), so the probe is skipped instead of
      // counted against the line; otherwise a probe landing exactly on the point would make the
      // answer depend on whether the box happens to be symmetric. A line singular at (almost)
      // every probe is not a solution of anything and is dropped. "Zero" is relative to |N| within
      // a probe offset of the line, never to a box-wide magnitude.
      const n = N({ x, y: c });
      if (!Number.isFinite(n)) continue;
      const nLocal = Math.max(Math.abs(n), ...[N({ x, y: c + probe }), N({ x, y: c - probe })].filter(Number.isFinite).map(Math.abs));
      if (n === 0 || Math.abs(n) <= N_FLOOR * EPS * nLocal) continue;
      goodX.push(x);
    }
    if (!ok || goodX.length < 3) continue;

    let stability: EquilibriumSolution["stability"] | undefined;
    for (const x of goodX) {
      let s: EquilibriumSolution["stability"] | undefined;
      if (domainEdge) {
        // Only the defined side exists: the sign of dy/dt there says whether solutions approach
        // the line or leave it. A probe with no sign (slope 0 or undefined) decides nothing.
        const s1 = domainEdge === "above" ? slope(x, c + probe) : slope(x, c - probe);
        const toward = domainEdge === "above" ? s1 < 0 : s1 > 0;
        const away = domainEdge === "above" ? s1 > 0 : s1 < 0;
        if (toward) s = "edge_approach";
        else if (away) s = "edge_leave";
        else continue;
      } else {
        const below = slope(x, c - probe);
        const above = slope(x, c + probe);
        // A side without a sign (slope 0 or undefined at this t) decides nothing at this probe.
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
    // A line whose sides gave no sign at any probe cannot be placed: 'varies' for a domain edge
    // (the only value that makes no claim about approach or departure), 'semi_stable' otherwise.
    const fallback: EquilibriumSolution["stability"] = domainEdge ? "varies" : "semi_stable";
    const solution: EquilibriumSolution = { y: c, stability: stability ?? fallback };
    if (domainEdge) solution.domainEdge = domainEdge;
    solution.uniqueness = solutionUniqueness(slope, c, goodX, span, opts.checkpoint);
    solutions.push(solution);
  }
  return { autonomous, solutions };
}

const UNIQUENESS_RANK: Record<UniquenessVerdict, number> = { unbounded: 3, borderline: 2, untestable: 1, bounded_at_tested_scales: 0 };

/**
 * Uniqueness at y = c: the Lipschitz probe on d -> g(t, c + d) - g(t, c) at every usable t (the
 * residual g(t, c) is subtracted so a root located to a few ulps does not read as a 1/δ growth;
 * an undefined value at d = 0 counts as 0). The worst probe decides; the first offset is 1e-2 of
 * the y span, and the verdict is decided at the finest scales (uniqueness.ts).
 */
function solutionUniqueness(slope: (x: number, y: number) => number, c: number, goodX: number[], span: number, checkpoint?: () => void): SolutionUniqueness {
  let worst: SolutionUniqueness | undefined;
  let failing = 0;
  for (const x of goodX) {
    const s0 = slope(x, c);
    const base = Number.isFinite(s0) ? s0 : 0;
    const r = lipschitzProbe((d) => slope(x, c + d) - base, span, { checkpoint, center: c });
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
