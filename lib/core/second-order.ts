/**
 * Second-order equations x'' = F(x, x') (or a full equation such as x'' + 0.5*x' + x = 0) reduced
 * to the planar system x' = y, y' = F(x, y) AT THE STRING LEVEL, so the reduced system can be
 * shown to the student, put into a Scene, and recompiled by any client exactly like a planar system.
 *
 * Notation: the unknown is x, its derivatives are written x' and x'' (straight apostrophes; the
 * unicode primes ′ and ″ and a double quote are accepted too), and t is the time. Internally the
 * derivatives become the placeholder symbols xd and xdd, which the parser accepts ONLY here.
 *
 * Reduction: with E(x, x', x'', t) = lhs - rhs the equation is E = 0. E must be affine in x'':
 * E = a(x, x', t) * x'' + E0(x, x', t), so x'' = -E0 / a. Affinity is checked numerically at nine
 * generic points (the second difference E2 - 2 E1 + E0 in x'' must vanish relative to the
 * magnitudes measured); the coefficient a = E1 - E0 must not vanish at any of them. F is then built
 * from the mathjs AST of E (x'' -> 0 or 1, x' -> y), simplified when that keeps the semantics at
 * the nine points, and re-validated through the ordinary "xy" whitelist.
 *
 * Limitation (recorded): the affinity and the simplification cross-check are sampled at nine
 * points with t = 0. An equation whose x'' coefficient depends on t, or a simplification that only
 * differs on a lower-dimensional set (x/x -> 1), cannot be detected this way.
 */
import type { MathNode } from "mathjs";
import { compileNode, compileScalar, mathjs, ParseError, parseValidated } from "./parse";
import type { SystemSpec, Vec2 } from "./types";

/** Placeholder symbols for x' and x''; accepted by the parser only through this module. */
export const XD = "xd";
export const XDD = "xdd";

export const NOT_LINEAR_IN_XDD_MESSAGE =
  "x'' must appear linearly, e.g. x'' + 0.5*x' + x = 0 or x'' = -sin(x); x''^2, sin(x'') and the like cannot be reduced.";
export const XDD_COEFFICIENT_VANISHES_MESSAGE =
  "The coefficient of x'' vanishes (at least at some points), so the equation cannot be solved for x''. Check that x'' really appears and that its coefficient is never zero.";
export const XDD_WITHOUT_EQUALS_MESSAGE =
  "Write an equation with = (x'' + x = 0) or just the right-hand side F of x'' = F.";
export const DOUBLE_EQUALS_MESSAGE = 'Use a single "=" between the two sides of the equation (== is a comparison).';
export const TOO_MANY_EQUALS_MESSAGE = 'The equation must contain exactly one "=".';
export const OTHER_PRIME_MESSAGE =
  "Only the unknown x may carry primes: write x' for dx/dt and x'' for the second derivative. The unknown function is x and t is the time.";
export const PLACEHOLDER_TYPED_MESSAGE =
  "xd and xdd are internal names; write x' and x'' for the derivatives of x.";
export const UNDEFINED_AT_SAMPLES_MESSAGE =
  "The equation is undefined (not a finite number) at most of the sample points used to check it, so it cannot be reduced safely.";

export function unknownSymbolInSecondOrder(name: string): string {
  return (
    `Unknown symbol "${name}". The unknown function is x, its derivative is x' (dx/dt) and its second derivative is x''; ` +
    "t is the time. Allowed symbols: x, x', x'', t, pi, e, and the names in params."
  );
}

export type ReducedSecondOrder = {
  /** The reduced planar system x' = y, y' = F(x, y) (variables "xy": no `variables` field). */
  spec: SystemSpec;
  /** What the student typed, with primes normalized to straight apostrophes ("x'' = F" for a bare F). */
  equation: string;
  /** The reduction shown to students: x' = f, y' = g with f = "y". */
  reduced: { f: string; g: string };
};

/** Relative tolerance of the affinity check, against the largest |E| measured at the point. */
export const AFFINITY_REL_TOL = 1e-9;
/** Relative tolerance for "a is the same constant at every point". */
export const CONSTANT_REL_TOL = 1e-12;
/** Relative tolerance of the simplification cross-check F == -E0/a. */
export const CROSS_CHECK_REL_TOL = 1e-12;
/** The affinity check needs at least this many points where E is finite. */
const MIN_FINITE_POINTS = 3;

/**
 * Nine generic sample points in [-1.7, 2.3]^2: fractional parts of multiples of the golden ratio
 * and of sqrt(2) (never an integer, never 0, never symmetric), so a polynomial identity that holds
 * at all of them does not hold by accident of the sampling.
 */
export const SAMPLE_POINTS: readonly Vec2[] = (() => {
  const phi = (Math.sqrt(5) - 1) / 2;
  const s2 = Math.SQRT2;
  const frac = (v: number) => v - Math.floor(v);
  const pts: Vec2[] = [];
  for (let i = 1; i <= 9; i++) pts.push({ x: -1.7 + 4 * frac(i * phi), y: -1.7 + 4 * frac(i * s2) });
  return pts;
})();

/** Normalizes the prime notation: x'' / x″ / x" -> xdd, then x' / x′ -> xd. Trims whitespace. */
export function normalizePrimes(input: string): string {
  return input
    .trim()
    .replace(/x\s*(?:''|″|")/g, XDD)
    .replace(/x\s*(?:'|′)/g, XD);
}

/** The student's text with unicode primes turned into straight apostrophes, for display. */
function displayForm(input: string): string {
  return input.trim().replace(/″/g, "''").replace(/x\s*"/g, "x''").replace(/′/g, "'");
}

function substitute(node: MathNode, xddValue: number): MathNode {
  return node.transform((n: MathNode) => {
    if (mathjs.isSymbolNode(n)) {
      if (n.name === XDD) return new mathjs.ConstantNode(xddValue);
      if (n.name === XD) return new mathjs.SymbolNode("y");
    }
    return n;
  });
}

/** Cross-check of a candidate F against the reference values at the sample points. */
function matchesReference(F: (p: Vec2, t?: number) => number, reference: (number | null)[]): boolean {
  for (let i = 0; i < SAMPLE_POINTS.length; i++) {
    const target = reference[i];
    if (target === null) continue;
    const value = F(SAMPLE_POINTS[i], 0);
    if (!Number.isFinite(value)) return false;
    const scale = Math.max(Math.abs(value), Math.abs(target));
    if (Math.abs(value - target) > CROSS_CHECK_REL_TOL * scale) return false;
  }
  return true;
}

/**
 * Reduces a second-order equation in x(t) to the planar system x' = y, y' = F(x, y). Throws
 * ParseError with a readable (English) message when the text is not an equation of this kind.
 */
export function reduceSecondOrder(input: string, params?: Record<string, number>): ReducedSecondOrder {
  if (typeof input !== "string" || input.trim() === "") throw new ParseError(input, "Expression is empty.");
  const raw = input.trim();
  if (/\bxdd?\b/.test(raw)) throw new ParseError(raw, PLACEHOLDER_TYPED_MESSAGE);
  const text = normalizePrimes(raw);
  if (/['′″"]/.test(text)) throw new ParseError(raw, OTHER_PRIME_MESSAGE);
  if (/==/.test(text)) throw new ParseError(raw, DOUBLE_EQUALS_MESSAGE);

  const hasXdd = new RegExp(`\\b${XDD}\\b`).test(text);
  // Split on the lone "=" only (== was rejected above; <=, >=, != belong to a piecewise F).
  const sides = text.split(/(?<![<>!])=/);
  let E: string;
  let equation: string;
  if (sides.length === 2) {
    E = `(${sides[0].trim()}) - (${sides[1].trim()})`;
    equation = displayForm(raw);
  } else if (sides.length > 2) {
    throw new ParseError(raw, TOO_MANY_EQUALS_MESSAGE);
  } else if (hasXdd) {
    throw new ParseError(raw, XDD_WITHOUT_EQUALS_MESSAGE);
  } else {
    E = `(${XDD}) - (${text})`;
    equation = `x'' = ${displayForm(raw)}`;
  }

  // Validation in the placeholder symbol set; errors carry the student's own text.
  let node: MathNode;
  try {
    node = parseValidated(E, params, { symbols: ["x", "t", XD, XDD], unknownSymbolMessage: unknownSymbolInSecondOrder });
  } catch (error) {
    if (error instanceof ParseError) throw new ParseError(raw, error.message, error.code);
    throw error;
  }

  const node0 = substitute(node, 0);
  const node1 = substitute(node, 1);
  const node2 = substitute(node, 2);
  const e0 = compileNode(E, node0, params);
  const e1 = compileNode(E, node1, params);
  const e2 = compileNode(E, node2, params);

  // Affinity in x'' and the coefficient a = E1 - E0 at every finite sample point (t = 0).
  const reference: (number | null)[] = [];
  const coefficients: number[] = [];
  for (const p of SAMPLE_POINTS) {
    const v0 = e0(p, 0), v1 = e1(p, 0), v2 = e2(p, 0);
    if (!Number.isFinite(v0) || !Number.isFinite(v1) || !Number.isFinite(v2)) {
      reference.push(null);
      continue;
    }
    const scale = Math.max(Math.abs(v0), Math.abs(v1), Math.abs(v2));
    if (Math.abs(v2 - v1 - (v1 - v0)) > AFFINITY_REL_TOL * scale) throw new ParseError(raw, NOT_LINEAR_IN_XDD_MESSAGE);
    const a = v1 - v0;
    if (a === 0) throw new ParseError(raw, XDD_COEFFICIENT_VANISHES_MESSAGE);
    coefficients.push(a);
    reference.push(-v0 / a);
  }
  if (coefficients.length < MIN_FINITE_POINTS) throw new ParseError(raw, UNDEFINED_AT_SAMPLES_MESSAGE);

  const aMax = coefficients.reduce((m, a) => Math.max(m, Math.abs(a)), 0);
  const constant = coefficients.every((a) => Math.abs(a - coefficients[0]) <= CONSTANT_REL_TOL * aMax);
  const E0 = node0.toString();
  const E1 = node1.toString();
  let plain: string;
  if (constant) {
    const a = coefficients[0];
    plain = a === 1 ? `-(${E0})` : a === -1 ? `(${E0})` : `-(${E0})/(${a})`;
  } else {
    plain = `-(${E0})/((${E1}) - (${E0}))`;
  }

  // Simplify for display, but only keep the result when it still parses through the ordinary
  // whitelist and agrees with -E0/a at the sample points.
  let g = plain;
  try {
    const simplified = mathjs.simplify(plain, {}, { exactFractions: false }).toString();
    if (matchesReference(compileScalar(simplified, params), reference)) g = simplified;
  } catch {
    // keep the un-simplified string
  }
  // The un-simplified string must pass too (it is what a client recompiles).
  if (!matchesReference(compileScalar(g, params), reference)) {
    throw new ParseError(raw, "Internal check failed: the reduced right-hand side does not reproduce -E0/a at the sample points.");
  }

  const spec: SystemSpec = params ? { f: "y", g, params } : { f: "y", g };
  return { spec, equation, reduced: { f: "y", g } };
}
