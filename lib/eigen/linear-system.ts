/**
 * Round 13 (AB): the EXACT eigen-analysis of a linear planar system with constant coefficients,
 *
 *     (x, y)' = A (x, y) + b,      A = [[a, b12], [c, d]] rational,
 *
 * read from the student's own text without sampling: a planar system x' = f, y' = g through the
 * parser's "xy" whitelist and lib/series' exact linear-form reader (x and y are the two unknowns,
 * every coefficient must be a constant), a second-order equation P2 x'' + P1 x' + P0 x = G through
 * lib/series' linearEquation, whose phase plane (x, x') has A = [[0, 1], [-P0/P2, -P1/P2]] and
 * b = (0, G/P2). Anything else (a product x*y, sin(x), a coefficient or forcing that depends on t)
 * is NOT linear with constant coefficients, and the caller falls back to the kernel's numerical
 * linearization at each equilibrium.
 *
 * Everything below is exact rational arithmetic (lib/series/rational): the characteristic
 * polynomial λ² − (tr A) λ + det A, its discriminant, the eigenvalues (rational, a quadratic surd
 * τ/2 ± (k/2)√m, or a complex pair α ± iβ), primitive integer eigenvectors, the generalized
 * eigenvector of a degenerate node, the equilibrium (a point, a line, the whole plane or none) and
 * the exact type. Floating point appears only in `numericLinear`, the geometry the picture draws
 * and snaps to. Pure: no React, no clock.
 *
 * Honesty: a coefficient that entered as the rational of a double (π, e, a function value, a literal
 * with more digits than a double holds) makes the system `approximate`; then a decisive quantity
 * (trace, determinant, discriminant) that is non-zero but within NEAR_ZERO_FRACTION of the matrix's
 * own scale is reported in `borderline`, because rounding to 16 digits may be all that separates,
 * say, a center from a slow spiral.
 */
import { ParseError, parseValidated } from "../core/parse";
import type { Vec2 } from "../core/types";
import { constantCoefficientOde } from "../series/decompose";
import { inexactLiteral, linearEquation, type ReductionOutcome, secondOrderSyntaxPasses } from "../series/equation";
import { LinearFormError, linearFormOf, type LinearFailureReason } from "../series/linear-form";
import { pdeg } from "../series/poly";
import { asConstant, qpIsZero, type QuasiPoly } from "../series/quasi";
import { abs, add, cmp, div, equals, gcdBig, isZero, mul, neg, ONE, q, type Q, sign, sqrtExact, sub, toNumber, ZERO } from "../series/rational";

export type Mat2Q = readonly [readonly [Q, Q], readonly [Q, Q]];
export type Vec2Q = readonly [Q, Q];

/** x' = A x + b with exact entries; `approximate` when a coefficient entered as the rational of a double. */
export type LinearSystemQ = { readonly A: Mat2Q; readonly b: Vec2Q; readonly approximate: boolean };

/** What the analysis reads: the student's planar system, or the student's second-order equation (its phase plane is (x, x')). */
export type EigenSource =
  | { readonly mode: "system"; readonly f: string; readonly g: string; readonly params?: Record<string, number> }
  /**
   * `reduction`: the kernel's reduceSecondOrder outcome on the same text when the caller already has
   * it (the web page, for its picture), so its sampling is not paid twice.
   */
  | { readonly mode: "second"; readonly equation: string; readonly params?: Record<string, number>; readonly reduction?: ReductionOutcome };

/**
 * Why the text is not a constant-coefficient linear system:
 * "nonlinear": a term that is not linear in the unknowns (`fragment`, the student's notation);
 * "timeDependent": a coefficient or the constant part depends on t;
 * "tooComplex": the exact reader's size caps; "other": anything else the exact reader refuses
 * (a conditional, a division by zero, ...), with its fragment; "parse": the text does not parse.
 */
export type ReadFailure =
  | { readonly reason: "nonlinear"; readonly fragment: string }
  | { readonly reason: "timeDependent" }
  | { readonly reason: "tooComplex" }
  | { readonly reason: "other"; readonly fragment: string }
  | { readonly reason: "parse" };

export type ReadResult = { readonly ok: true; readonly system: LinearSystemQ } | { readonly ok: false; readonly failure: ReadFailure };

function failureOf(reason: LinearFailureReason, fragment: string): ReadFailure {
  switch (reason) {
    case "nonlinear":
      return { reason: "nonlinear", fragment };
    case "tooComplex":
    case "tooManyDigits":
    case "exponentTooLarge":
      return { reason: "tooComplex" };
    default:
      return { reason: "other", fragment };
  }
}

/** The real constant of a quasi-polynomial, or null when it depends on t (or is not real). */
function realConstant(v: QuasiPoly): Q | null {
  const c = asConstant(v);
  return c !== null && isZero(c.im) ? c.re : null;
}

/** One component f(x, y) = p x + r y + s of a planar system, exactly; null when it depends on t. */
function readComponent(text: string, params: Record<string, number> | undefined, checkpoint?: () => void): { ok: true; p: Q; r: Q; s: Q; approximate: boolean } | { ok: false; failure: ReadFailure } {
  let node;
  try {
    node = parseValidated(text, params, { variables: "xy" });
  } catch (error) {
    if (error instanceof ParseError) return { ok: false, failure: { reason: "parse" } };
    throw error;
  }
  try {
    const form = linearFormOf(node, { variable: "t", unknowns: { x: 0, y: 1 }, params }, checkpoint);
    // The reader never puts an unknown into a denominator (that is "nonlinear"); a denominator left
    // is a polynomial in t, i.e. a coefficient that changes with time.
    if (pdeg(form.den) > 0 || !qpIsZero(form.u[2])) return { ok: false, failure: { reason: "timeDependent" } };
    const p = realConstant(form.u[0]);
    const r = realConstant(form.u[1]);
    const s = realConstant(form.free);
    if (p === null || r === null || s === null) return { ok: false, failure: { reason: "timeDependent" } };
    const scale = form.den[0];
    return { ok: true, p: div(p, scale), r: div(r, scale), s: div(s, scale), approximate: form.approximate || inexactLiteral(text) };
  } catch (error) {
    if (error instanceof LinearFormError) return { ok: false, failure: failureOf(error.reason, error.fragment) };
    throw error;
  }
}

/** The text as x' = A x + b with constant rational A and b, or why it is not. Never throws for bad input. */
export function readLinearSystem(source: EigenSource, checkpoint?: () => void): ReadResult {
  if (source.mode === "system") {
    const f = readComponent(source.f, source.params, checkpoint);
    if (!f.ok) return f;
    const g = readComponent(source.g, source.params, checkpoint);
    if (!g.ok) return g;
    return { ok: true, system: { A: [[f.p, f.r], [g.p, g.r]], b: [f.s, g.s], approximate: f.approximate || g.approximate } };
  }
  // As lib/series-panel: a text that passes the reduction's SYNTAX checks needs no sampling here
  // (the exact reader decides the rest); otherwise linearEquation runs the reduction for its verdict.
  const reduction = source.reduction ?? (secondOrderSyntaxPasses(source.equation, source.params) ? { error: null } : undefined);
  const read = linearEquation("second", source.equation, source.params, checkpoint, reduction);
  if (!read.ok) {
    const failure = read.failure;
    if (failure.reason === "parse") return { ok: false, failure: { reason: "parse" } };
    return { ok: false, failure: failure.reason === "noSecondDerivative" ? { reason: "other", fragment: failure.fragment } : failureOf(failure.reason, failure.fragment) };
  }
  const ode = constantCoefficientOde(read.equation);
  if (!ode.ok) return { ok: false, failure: { reason: "timeDependent" } };
  const G = realConstant(read.equation.G);
  if (G === null) return { ok: false, failure: { reason: "timeDependent" } };
  const [P0, P1, P2] = ode.ode.P;
  // P2 x'' + P1 x' + P0 x = G, with v = x': x' = v, v' = (G - P1 v - P0 x) / P2.
  return {
    ok: true,
    system: { A: [[ZERO, ONE], [neg(div(P0, P2)), neg(div(P1, P2))]], b: [ZERO, div(G, P2)], approximate: read.equation.approximate },
  };
}

// ---------------------------------------------------------------------------------------------
// Numbers r + s·√m of the analysis's own field.

/**
 * √disc = scale·√m, with m > 1 an integer free of square factors below SQUARE_FREE_LIMIT² (a larger
 * square factor, if any, stays under the root: still exact, only less simplified); `imaginary`:
 * disc < 0 and √disc = i·scale·√m (then m = 1 is allowed: √(−4) = 2i).
 */
export type Radical = { readonly scale: Q; readonly m: bigint; readonly imaginary: boolean };

/** r + s·√m (the radical's √m, without its scale; see Radical). */
export type FieldNumber = { readonly r: Q; readonly s: Q };
export type FieldVector = readonly [FieldNumber, FieldNumber];

/** Square factors are pulled out of a radicand up to this prime. */
export const SQUARE_FREE_LIMIT = 10000;

/** n = k² m with m free of square factors of primes up to SQUARE_FREE_LIMIT. */
export function squareFreeSplit(n: bigint): { k: bigint; m: bigint } {
  let k = BigInt(1);
  let m = n;
  for (let p = 2; p <= SQUARE_FREE_LIMIT; p += p === 2 ? 1 : 2) {
    const pp = BigInt(p * p);
    if (pp > m) break;
    while (m % pp === BigInt(0)) {
      m /= pp;
      k *= BigInt(p);
    }
  }
  return { k, m };
}

/** √|v| as scale·√m (m = 1 when |v| is the square of a rational). */
function radicalOf(v: Q, imaginary: boolean): Radical {
  const a = abs(v);
  // √(n/d) = √(n d) / d
  const { k, m } = squareFreeSplit(a.n * a.d);
  return { scale: q(k, a.d), m, imaginary };
}

export function fieldNumberValue(x: FieldNumber, radical: Radical | null): number {
  if (isZero(x.s) || radical === null) return toNumber(x.r);
  return toNumber(x.r) + toNumber(x.s) * Math.sqrt(Number(radical.m));
}

// ---------------------------------------------------------------------------------------------
// The analysis.

export type ExactType =
  | "saddle"
  | "stable_node"
  | "unstable_node"
  | "stable_spiral"
  | "unstable_spiral"
  | "center"
  | "stable_star"
  | "unstable_star"
  | "stable_degenerate"
  | "unstable_degenerate"
  | "zero_eigenvalue";

export type ExactRoots =
  /** Two different real eigenvalues λ1 > λ2, each r + s√m (s = 0 when they are rational). */
  | { readonly kind: "distinct"; readonly values: readonly [FieldNumber, FieldNumber] }
  | { readonly kind: "repeated"; readonly value: Q }
  /** α ± iβ with β = s·scale·√m > 0 (radical imaginary): `beta` is the coefficient s of √m. */
  | { readonly kind: "complex"; readonly alpha: Q; readonly beta: Q };

export type ExactVectors =
  /** One eigenvector per eigenvalue of `roots` (distinct), primitive integers (r + s√m components). */
  | { readonly kind: "two"; readonly v: readonly [FieldVector, FieldVector] }
  /** A repeated eigenvalue with ONE eigenvector v and a generalized eigenvector w: (A − λI) w = v. */
  | { readonly kind: "one"; readonly v: Vec2Q; readonly w: Vec2Q }
  /** A = λI: every vector is an eigenvector. */
  | { readonly kind: "every" }
  /** v = re + i·(im·√m) for λ = α + iβ (β > 0): `im` is the coefficient vector of the radical's √m. */
  | { readonly kind: "complex"; readonly re: Vec2Q; readonly im: Vec2Q };

export type ExactEquilibrium =
  | { readonly kind: "point"; readonly at: Vec2Q }
  /** det A = 0 and the equations are consistent: a whole line of equilibria. */
  | { readonly kind: "line"; readonly through: Vec2Q; readonly direction: Vec2Q }
  /** A = 0 and b = 0: every point is an equilibrium. */
  | { readonly kind: "plane" }
  | { readonly kind: "none" };

/** Display choice (not a mathematical decision): a decisive quantity of an APPROXIMATE system this close to 0, relative to the matrix's scale, is reported as borderline. */
export const NEAR_ZERO_FRACTION = 1e-12;

export type LinearAnalysis = {
  readonly system: LinearSystemQ;
  readonly trace: Q;
  readonly det: Q;
  /** tr² − 4 det = (a − d)² + 4 b c. */
  readonly disc: Q;
  /** √disc when it is not rational (an irrational or a complex pair), else null. */
  readonly radical: Radical | null;
  readonly roots: ExactRoots;
  readonly vectors: ExactVectors;
  readonly type: ExactType;
  readonly equilibrium: ExactEquilibrium;
  /** Complex eigenvalues only: the sense of rotation in the (x, y) plane with y pointing up (counterclockwise iff c > 0). */
  readonly rotation?: "ccw" | "cw";
  /** Approximate systems only: decisive quantities that are non-zero but within NEAR_ZERO_FRACTION of the scale. */
  readonly borderline: readonly ("trace" | "det" | "disc")[];
};

const field = (r: Q, s: Q = ZERO): FieldNumber => ({ r, s });

/**
 * The positive rational factor that makes every given rational an integer with gcd 1 (the content
 * of a vector written over several rationals); 1 for all zeros.
 */
function primitiveFactor(values: readonly Q[]): Q {
  let lcm = BigInt(1);
  for (const v of values) if (!isZero(v)) lcm = (lcm / gcdBig(lcm, v.d)) * v.d;
  let g = BigInt(0);
  for (const v of values) if (!isZero(v)) g = gcdBig(g, (v.n * lcm) / v.d);
  return g === BigInt(0) ? ONE : q(lcm, g);
}

/** The first non-zero of the values is positive afterwards. */
function signFactor(values: readonly Q[]): Q {
  const first = values.find((v) => !isZero(v));
  return first !== undefined && sign(first) < 0 ? q(-1) : ONE;
}

function scaleVec(v: Vec2Q, k: Q): Vec2Q {
  return [mul(v[0], k), mul(v[1], k)];
}

/** A primitive integer vector with its first non-zero component positive. */
function primitive(v: Vec2Q): Vec2Q {
  const k = mul(primitiveFactor(v), signFactor(v));
  return scaleVec(v, k);
}

/** An eigenvector of A for the RATIONAL eigenvalue l (A − lI singular), primitive; null when A = lI. */
function eigenvectorRational(A: Mat2Q, l: Q): Vec2Q | null {
  const [[a, b], [c, d]] = A;
  if (!isZero(b)) return primitive([b, sub(l, a)]);
  if (!isZero(c)) return primitive([sub(l, d), c]);
  // Diagonal: the eigenvalue a has e1, d has e2 (a = d = l is the scalar matrix).
  if (!equals(a, d)) return equals(l, a) ? [ONE, ZERO] : [ZERO, ONE];
  return null;
}

/** N w = v for a rank-one N with N² = 0 and v in its image (the generalized eigenvector), checked exactly; null if no such w. */
function generalized(N: Mat2Q, v: Vec2Q): Vec2Q | null {
  const [[n11, n12], [n21, n22]] = N;
  const candidates: Vec2Q[] = [];
  if (!isZero(n12)) candidates.push([ZERO, div(v[0], n12)]);
  if (!isZero(n11)) candidates.push([div(v[0], n11), ZERO]);
  if (!isZero(n22)) candidates.push([ZERO, div(v[1], n22)]);
  if (!isZero(n21)) candidates.push([div(v[1], n21), ZERO]);
  for (const w of candidates) {
    const r0 = add(mul(n11, w[0]), mul(n12, w[1]));
    const r1 = add(mul(n21, w[0]), mul(n22, w[1]));
    if (equals(r0, v[0]) && equals(r1, v[1])) return w;
  }
  return null;
}

function equilibriumOf(A: Mat2Q, b: Vec2Q, det: Q): ExactEquilibrium {
  const [[a, b12], [c, d]] = A;
  const [b1, b2] = b;
  if (!isZero(det)) {
    // A p = −b: p = −A⁻¹ b, A⁻¹ = [[d, −b12], [−c, a]] / det.
    const x = neg(div(sub(mul(d, b1), mul(b12, b2)), det));
    const y = neg(div(sub(mul(a, b2), mul(c, b1)), det));
    return { kind: "point", at: [x, y] };
  }
  const zeroMatrix = isZero(a) && isZero(b12) && isZero(c) && isZero(d);
  if (zeroMatrix) return isZero(b1) && isZero(b2) ? { kind: "plane" } : { kind: "none" };
  // Rank one: A p = −b is solvable exactly when −b lies on the column line of A.
  const consistent = isZero(sub(mul(c, b1), mul(a, b2))) && isZero(sub(mul(d, b1), mul(b12, b2)));
  if (!consistent) return { kind: "none" };
  const row: readonly [Q, Q, Q] = !isZero(a) || !isZero(b12) ? [a, b12, neg(b1)] : [c, d, neg(b2)];
  const through: Vec2Q = !isZero(row[0]) ? [div(row[2], row[0]), ZERO] : [ZERO, div(row[2], row[1])];
  // The line's direction spans the kernel of A (the eigenvector for 0).
  const direction = eigenvectorRational(A, ZERO) ?? [ONE, ZERO];
  return { kind: "line", through, direction };
}

function typeOf(A: Mat2Q, trace: Q, det: Q, disc: Q): ExactType {
  if (sign(det) < 0) return "saddle";
  if (isZero(det)) return "zero_eigenvalue";
  if (sign(disc) > 0) return sign(trace) < 0 ? "stable_node" : "unstable_node";
  if (isZero(disc)) {
    const [[a, b], [c, d]] = A;
    const scalar = isZero(b) && isZero(c) && equals(a, d);
    const stable = sign(trace) < 0;
    return scalar ? (stable ? "stable_star" : "unstable_star") : stable ? "stable_degenerate" : "unstable_degenerate";
  }
  if (isZero(trace)) return "center";
  return sign(trace) < 0 ? "stable_spiral" : "unstable_spiral";
}

/** The exact eigen-analysis of x' = A x + b. */
export function analyzeLinear(system: LinearSystemQ): LinearAnalysis {
  const A = system.A;
  const [[a, b], [c, d]] = A;
  const trace = add(a, d);
  const det = sub(mul(a, d), mul(b, c));
  const amd = sub(a, d);
  const disc = add(mul(amd, amd), mul(q(4), mul(b, c)));
  const half = q(1, 2);
  const type = typeOf(A, trace, det, disc);
  const equilibrium = equilibriumOf(A, system.b, det);
  const borderline = system.approximate ? borderlineOf(A, trace, det, disc) : [];
  const base = { system, trace, det, disc, type, equilibrium, borderline };

  if (isZero(disc)) {
    const l = mul(trace, half);
    const N: Mat2Q = [[sub(a, l), b], [c, sub(d, l)]];
    const v = eigenvectorRational(A, l);
    const vectors: ExactVectors = v === null ? { kind: "every" } : (() => {
      const w = generalized(N, v);
      return w === null ? { kind: "every" as const } : { kind: "one" as const, v, w };
    })();
    return { ...base, radical: null, roots: { kind: "repeated", value: l }, vectors };
  }

  const root = sign(disc) > 0 ? sqrtExact(disc) : null;
  if (root !== null) {
    // Two different rational eigenvalues.
    const l1 = mul(add(trace, root), half);
    const l2 = mul(sub(trace, root), half);
    const v1 = eigenvectorRational(A, l1);
    const v2 = eigenvectorRational(A, l2);
    // Distinct eigenvalues always have their own eigenvector (A ≠ λI).
    const toField = (v: Vec2Q | null): FieldVector => (v ? [field(v[0]), field(v[1])] : [field(ONE), field(ZERO)]);
    return { ...base, radical: null, roots: { kind: "distinct", values: [field(l1), field(l2)] }, vectors: { kind: "two", v: [toField(v1), toField(v2)] } };
  }

  if (sign(disc) > 0) {
    // λ = τ/2 ± (scale/2)√m. bc ≠ 0 here (else disc = (a − d)² would be a square), so b ≠ 0 and
    // v± = (2b, (d − a) ± √disc) = (2b, (d − a) ± scale√m).
    const radical = radicalOf(disc, false);
    const center = mul(trace, half);
    const s = mul(radical.scale, half);
    const vector = (pm: 1 | -1): FieldVector => {
      const raw: readonly Q[] = [mul(q(2), b), neg(amd), pm > 0 ? radical.scale : neg(radical.scale)];
      const k = mul(primitiveFactor(raw), signFactor([raw[0]]));
      return [field(mul(raw[0], k)), field(mul(raw[1], k), mul(raw[2], k))];
    };
    return {
      ...base,
      radical,
      roots: { kind: "distinct", values: [field(center, s), field(center, neg(s))] },
      vectors: { kind: "two", v: [vector(1), vector(-1)] },
    };
  }

  // disc < 0: λ = α ± iβ, β = (scale/2)√m; b c < 0, so b ≠ 0 and v = (2b, (d − a) + i·scale√m) for α + iβ.
  const radical = radicalOf(disc, true);
  const raw: readonly Q[] = [mul(q(2), b), neg(amd), radical.scale];
  const k = mul(primitiveFactor(raw), signFactor([raw[0]]));
  return {
    ...base,
    radical,
    roots: { kind: "complex", alpha: mul(trace, half), beta: mul(radical.scale, half) },
    vectors: { kind: "complex", re: [mul(raw[0], k), mul(raw[1], k)], im: [ZERO, mul(raw[2], k)] },
    rotation: sign(c) > 0 ? "ccw" : "cw",
  };
}

function borderlineOf(A: Mat2Q, trace: Q, det: Q, disc: Q): ("trace" | "det" | "disc")[] {
  const scale = Math.max(...A.flat().map((v) => Math.abs(toNumber(v))));
  if (!(scale > 0) || !Number.isFinite(scale)) return [];
  const near = (v: Q, power: number) => !isZero(v) && Math.abs(toNumber(v)) <= NEAR_ZERO_FRACTION * scale ** power;
  const out: ("trace" | "det" | "disc")[] = [];
  if (near(trace, 1)) out.push("trace");
  if (near(det, 2)) out.push("det");
  if (near(disc, 2)) out.push("disc");
  return out;
}

/** The analysis of a source, or why there is none. */
export function linearAnalysisOf(source: EigenSource, checkpoint?: () => void): { ok: true; analysis: LinearAnalysis } | { ok: false; failure: ReadFailure } {
  const read = readLinearSystem(source, checkpoint);
  return read.ok ? { ok: true, analysis: analyzeLinear(read.system) } : read;
}

// ---------------------------------------------------------------------------------------------
// The geometry the picture draws and snaps to (floating point, from the exact data).

export type NumericLinear = {
  /** The equilibrium as doubles when it is a single point, else null. */
  readonly at: Vec2 | null;
  /** The invariant straight lines through `at` (two for a saddle or node, one for a degenerate node): unit directions and their eigenvalues. */
  readonly lines: readonly { readonly direction: Vec2; readonly eigenvalue: number }[];
  /** Complex eigenvalues: Re v and Im v as doubles (v the eigenvector of α + iβ), α, β and the sense of rotation; `closed` for an exact center. */
  readonly complex: { readonly re: Vec2; readonly im: Vec2; readonly alpha: number; readonly beta: number; readonly ccw: boolean; readonly closed: boolean } | null;
};

function unit(v: Vec2): Vec2 | null {
  const n = Math.hypot(v.x, v.y);
  return n > 0 && Number.isFinite(n) ? { x: v.x / n, y: v.y / n } : null;
}

export function numericLinear(an: LinearAnalysis): NumericLinear {
  const at = an.equilibrium.kind === "point" ? { x: toNumber(an.equilibrium.at[0]), y: toNumber(an.equilibrium.at[1]) } : null;
  const lines: { direction: Vec2; eigenvalue: number }[] = [];
  // Only a single equilibrium has straight-line solutions worth drawing: a line of equilibria has
  // one through every point, the whole plane and "none" have none to anchor.
  if (at && an.type !== "zero_eigenvalue") {
    if (an.vectors.kind === "two" && an.roots.kind === "distinct") {
      an.vectors.v.forEach((v, i) => {
        const direction = unit({ x: fieldNumberValue(v[0], an.radical), y: fieldNumberValue(v[1], an.radical) });
        if (direction) lines.push({ direction, eigenvalue: fieldNumberValue((an.roots as { values: readonly [FieldNumber, FieldNumber] }).values[i], an.radical) });
      });
    } else if (an.vectors.kind === "one" && an.roots.kind === "repeated") {
      const direction = unit({ x: toNumber(an.vectors.v[0]), y: toNumber(an.vectors.v[1]) });
      if (direction) lines.push({ direction, eigenvalue: toNumber(an.roots.value) });
    }
  }
  let complex: NumericLinear["complex"] = null;
  if (at && an.vectors.kind === "complex" && an.roots.kind === "complex" && an.radical) {
    const root = Math.sqrt(Number(an.radical.m));
    complex = {
      re: { x: toNumber(an.vectors.re[0]), y: toNumber(an.vectors.re[1]) },
      im: { x: toNumber(an.vectors.im[0]) * root, y: toNumber(an.vectors.im[1]) * root },
      alpha: toNumber(an.roots.alpha),
      beta: toNumber(an.roots.beta) * root,
      ccw: an.rotation === "ccw",
      closed: an.type === "center",
    };
  }
  return { at, lines, complex };
}

/** Whether two exact numbers compare (for tests and ordering). */
export function compareField(a: FieldNumber, b: FieldNumber, radical: Radical | null): number {
  if (isZero(a.s) && isZero(b.s)) return cmp(a.r, b.r);
  return Math.sign(fieldNumberValue(a, radical) - fieldNumberValue(b, radical));
}
