/**
 * The student's equation as an exact LINEAR equation (round 12, lib/series):
 *
 *     P_r(t) u^(r) + ... + P_1(t) u' + P_0(t) u = G(t),   r = 1 (dy/dt = g(t, y)) or 2 (x'' ...)
 *
 * with quasi-polynomial coefficients and right-hand side (see quasi.ts and linear-form.ts). The text
 * is read exactly as the rest of the tool reads it: a first-order g through the parser's "ty"
 * whitelist, a second-order equation through lib/core/second-order (whose checks run first, so an
 * equation the picture refuses is refused here with the same sentence) and its placeholder symbols.
 * A non-constant denominator is cleared by multiplying the whole equation by it (`cleared`); the
 * equation is negated when that makes the leading coefficient's top term positive (x = x'' reads
 * x'' - x = 0).
 */
import type { MathNode } from "mathjs";
import { ParseError, type ParseErrorCode, parseValidated } from "../core/parse";
import { normalizePrimes, type ReducedSecondOrder, reduceSecondOrder, straightenPrimes, studentNotation, XD, XDD } from "../core/second-order";
import { LinearFormError, linearFormOf, structurallyLinear, type LinearFailureReason, type SymbolRoles } from "./linear-form";
import { pdeg, pexactDiv, pgcd, pIsZero, type Poly, PZERO } from "./poly";
import { asExponentialMonomial, asPolynomial, qpIsZero, qpNeg, qpPoly, type QuasiPoly, type QuasiTerm } from "./quasi";
import { cIsZero, cKey, type CQ, csub, sign } from "./rational";

export type SeriesMode = "first" | "second";

export type LinearEquation = {
  readonly mode: SeriesMode;
  readonly order: 1 | 2;
  /** P[j]: the coefficient of the j-th derivative, j = 0..order. */
  readonly P: readonly QuasiPoly[];
  /** The right-hand side G of  sum_j P[j] u^(j) = G. */
  readonly G: QuasiPoly;
  /** The non-constant (monic) denominator the equation was multiplied by, else null. */
  readonly cleared: Poly | null;
  /** A non-constant polynomial factor common to every coefficient and the right-hand side, cancelled (t x'' + t x = 0 is x'' + x = 0), else null. */
  readonly commonFactor: Poly | null;
  /** e^(lambda t), never zero, that every term was divided by (the leading coefficient was a single exponential: e^t x'' + e^t x = 0 is x'' + x = 0), else null. */
  readonly dividedExponential: CQ | null;
  /** True when something entered as the rational of its double: approximateConstant or approximateLiteral. */
  readonly approximate: boolean;
  /** A non-rational constant (pi, e, sqrt(2), cos(1)) entered as the rational of its double. */
  readonly approximateConstant: boolean;
  /** A typed literal says more than its double (0.5000000000000000001, 1e-400): inexactLiteral. */
  readonly approximateLiteral: boolean;
};

export type EquationFailure =
  | { readonly reason: LinearFailureReason; readonly fragment: string }
  | { readonly reason: "parse"; readonly message: string };

export type EquationResult = { ok: true; equation: LinearEquation } | { ok: false; failure: EquationFailure };

function parseFailure(error: unknown): EquationResult {
  if (error instanceof ParseError) return { ok: false, failure: { reason: "parse", message: error.message } };
  throw error;
}

/**
 * -1 when the leading coefficient is a NEGATIVE CONSTANT (x = x'' reads x'' - x = 0); 1 otherwise, so
 * a coefficient the student wrote as a polynomial keeps the student's sign: (1 - t^2) x'' stays
 * (1 - t^2) x'', never (t^2 - 1) x''.
 */
function leadingSign(top: QuasiPoly): 1 | -1 {
  const p = asPolynomial(top);
  if (p === null || p.length !== 1) return 1;
  return sign(p[0]) < 0 ? -1 : 1;
}

/**
 * The polynomial factor common to every coefficient and to the right-hand side: the gcd of all the
 * polynomial parts of their terms e^(lambda t) P(t), so t cos(t) shares the factor t with t x''. Such a
 * factor vanishes at points that are not singular for the equation at all (its zeros cancel in every
 * quotient P_j / P_r), so it is cancelled before anything else is formed.
 */
function commonPolynomialFactor(parts: readonly QuasiPoly[], checkpoint?: () => void): Poly | null {
  let g: Poly = PZERO;
  for (const part of parts) {
    for (const term of part.values()) {
      for (const p of [term.coef.re, term.coef.im]) {
        if (pIsZero(p)) continue;
        g = pIsZero(g) ? p : pgcd(g, p, checkpoint);
        if (pdeg(g) < 1) return null;
      }
    }
  }
  return pdeg(g) >= 1 ? g : null;
}

/** Every polynomial part of a quasi-polynomial divided by g (which divides them all). */
function divideTerms(v: QuasiPoly, g: Poly): QuasiPoly {
  const out = new Map<string, QuasiTerm>();
  for (const [key, term] of v) {
    out.set(key, {
      lambda: term.lambda,
      coef: { re: pIsZero(term.coef.re) ? PZERO : pexactDiv(term.coef.re, g), im: pIsZero(term.coef.im) ? PZERO : pexactDiv(term.coef.im, g) },
    });
  }
  return out;
}

/**
 * Whether a numeric literal of the text says more than the double it is read as
 * ("0.5000000000000000001" is the double 0.5): the reading is then exact for the double, not for
 * what was typed. Trailing zeros and the exponent form do not count ("1e18", "100000000000000000000"
 * are exact doubles). A digit inside a name ("k1") is not a literal.
 */
export function inexactLiteral(text: string): boolean {
  for (const m of text.matchAll(/(?<![A-Za-z_\d.])(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g)) {
    const typed = canonicalDecimal(m[0]);
    const read = canonicalDecimal(String(Number(m[0])));
    if (typed === null || read === null || typed !== read) return true;
  }
  return false;
}

/** A decimal as "digits e exponent" without leading or trailing zeros ("0.0120" and "1.2e-2" are "12e-3"); null when it is not a finite decimal. */
function canonicalDecimal(text: string): string | null {
  const m = /^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!m) return null;
  let digits = `${m[1]}${m[2] ?? ""}`.replace(/^0+/, "");
  let exponent = Number(m[3] ?? 0) - (m[2] ?? "").length;
  if (digits === "") return "0";
  while (digits.endsWith("0")) {
    digits = digits.slice(0, -1);
    exponent++;
  }
  return `${digits}e${exponent}`;
}

/** Every term e^(mu t) P(t) of v as e^((mu - lambda) t) P(t): v divided by e^(lambda t). */
function shiftExponents(v: QuasiPoly, lambda: CQ): QuasiPoly {
  const out = new Map<string, QuasiTerm>();
  for (const term of v.values()) {
    const shifted = csub(term.lambda, lambda);
    out.set(cKey(shifted), { lambda: shifted, coef: term.coef });
  }
  return out;
}

function build(mode: SeriesMode, order: 1 | 2, P: QuasiPoly[], G: QuasiPoly, den: Poly, approximateConstant: boolean, approximateLiteral: boolean, checkpoint?: () => void): LinearEquation {
  const common = commonPolynomialFactor([...P, G], checkpoint);
  const divide = (q: QuasiPoly) => (common ? divideTerms(q, common) : q);
  let reduced = P.map(divide);
  let rhs = divide(G);
  // A leading coefficient c e^(lambda t) never vanishes: the equation divided by e^(lambda t) is the same
  // equation, with the exponential gone from the top (e^t x'' + e^t x = 0 is x'' + x = 0).
  const top = asExponentialMonomial(reduced[order]);
  const dividedExponential = top !== null && !cIsZero(top.lambda) ? top.lambda : null;
  if (dividedExponential) {
    reduced = reduced.map((v) => shiftExponents(v, dividedExponential));
    rhs = shiftExponents(rhs, dividedExponential);
  }
  const s = leadingSign(reduced[order]);
  return {
    mode,
    order,
    P: s < 0 ? reduced.map(qpNeg) : reduced,
    G: s < 0 ? qpNeg(rhs) : rhs,
    cleared: pdeg(den) >= 1 ? den : null,
    commonFactor: common,
    dividedExponential,
    approximate: approximateConstant || approximateLiteral,
    approximateConstant,
    approximateLiteral,
  };
}

/**
 * The second-order reduction's refusals that come from its NUMERICAL checks at sample points (not from
 * the syntax): a coefficient of x'' that vanishes somewhere (t x'' + ... is the Frobenius case), a
 * cross-check that misses at a sample where the coefficient is tiny ((t^2 - 2) x'' at t = 1.4142), a
 * non-affinity or an undefined value seen at the samples. The exact reading below decides all of these
 * itself, without sampling, so they are not refusals here.
 */
export const NUMERICAL_REDUCTION_CODES: ReadonlySet<ParseErrorCode> = new Set<ParseErrorCode>([
  "second_order_zero_coefficient",
  "second_order_internal",
  "second_order_not_affine",
  "second_order_undefined_at_samples",
]);

/** dy/dt = g(t, y): with g = (A y + B) / D, the equation D y' - A y = B. */
function firstOrder(g: string, params: Record<string, number> | undefined, checkpoint?: () => void): EquationResult {
  let node: MathNode;
  try {
    node = parseValidated(g, params, { variables: "ty" });
  } catch (error) {
    return parseFailure(error);
  }
  const roles: SymbolRoles = { variable: "t", unknowns: { y: 0 }, params };
  try {
    const form = linearFormOf(node, roles, checkpoint);
    if (!qpIsZero(form.u[1]) || !qpIsZero(form.u[2])) {
      // Cannot happen: "ty" mode has no derivative symbols.
      return { ok: false, failure: { reason: "nonlinear", fragment: g } };
    }
    return { ok: true, equation: build("first", 1, [qpNeg(form.u[0]), qpPoly(form.den)], form.free, form.den, form.approximate, inexactLiteral(g), checkpoint) };
  } catch (error) {
    if (error instanceof LinearFormError) return { ok: false, failure: { reason: error.reason, fragment: error.fragment } };
    throw error;
  }
}

/** The outcome of reduceSecondOrder(text, params) on the same text: `error` null = it passed (with `reduced`), else what it threw. */
export type ReductionOutcome = { readonly error: unknown; readonly reduced?: ReducedSecondOrder };

/** Whether a reduction refusal is one of its NUMERICAL ones (not about the text). */
export function isNumericalRefusal(error: unknown): boolean {
  return error instanceof ParseError && error.code !== undefined && NUMERICAL_REDUCTION_CODES.has(error.code);
}

/** The second-order text as the exact reader parses it: E(t, x, x', x'') with the placeholder symbols (throws ParseError). */
export function secondOrderNode(input: string, params: Record<string, number> | undefined): MathNode {
  const text = normalizePrimes(input.trim());
  const sides = text.split(/(?<![<>!])=/);
  const E = sides.length === 2 ? `(${sides[0].trim()}) - (${sides[1].trim()})` : `(${XDD}) - (${text})`;
  return parseValidated(E, params, { symbols: ["x", "t", XD, XDD] });
}

/**
 * A pre-filter for reduceSecondOrder's SYNTAX checks, without its sampling (which costs seconds on a
 * long product such as (t − 1)(t − 2)…(t − 20) x'' + x = 0 and takes no budget): true only when none
 * of them can refuse the text (no typed placeholder, no parameter v, no x''', no other prime or ==, one
 * "=" or none with no x'', and the placeholder parse succeeds). When it says false, reduceSecondOrder
 * itself gives the verdict and the picture's own sentence; when it says true, the text is syntactically
 * what the picture reads, and its numerical refusals are decided by the exact reader anyway.
 */
export function secondOrderSyntaxPasses(input: string, params?: Record<string, number>): boolean {
  const raw = input.trim();
  if (raw === "" || /\bxdd?\b/.test(raw)) return false;
  if (params && Object.prototype.hasOwnProperty.call(params, "v")) return false;
  if (/x\s*'\s*'\s*'/.test(straightenPrimes(raw))) return false;
  const text = normalizePrimes(raw);
  if (/['"]/.test(text) || /==/.test(text)) return false;
  const sides = text.split(/(?<![<>!])=/);
  if (sides.length > 2 || (sides.length === 1 && new RegExp(`\\b${XDD}\\b`).test(text))) return false;
  try {
    secondOrderNode(input, params);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the text passes the exact reader's own parse (the parser's whitelist and the second-order
 * symbols), contains x'' and is linear by its shape (structurallyLinear), all WITHOUT reading it:
 * bounded by the text's length, for a link decoded on the server. The reading itself, whose exact
 * arithmetic can be costly, happens later under the page's own budget.
 */
export function readableAsLinearSecondOrder(input: string, params?: Record<string, number>): boolean {
  let node: MathNode;
  try {
    node = secondOrderNode(input, params);
  } catch {
    return false;
  }
  let hasXdd = false;
  node.traverse((m) => {
    if ((m as { isSymbolNode?: boolean }).isSymbolNode && (m as unknown as { name: string }).name === XDD) hasXdd = true;
  });
  return hasXdd && structurallyLinear(node, new Set(["x", XD, XDD]));
}

/** A second-order equation E(t, x, x', x'') = 0 (or x'' = F): with E = (sum u_j x^(j) + F0) / D, the equation sum u_j x^(j) = -F0. */
function secondOrder(input: string, params: Record<string, number> | undefined, checkpoint?: () => void, reduction?: ReductionOutcome): EquationResult {
  // The tool's own checks first: an equation the picture refuses for its SYNTAX is refused here with
  // the same sentence. Its numerical refusals (NUMERICAL_REDUCTION_CODES) are not: the exact reading
  // below decides them without sampling (a vanishing coefficient of x'' is the Frobenius case). A
  // caller that already ran the reduction on this text (the web page, for its picture) hands over the
  // outcome, so its sampling is not paid twice.
  let error: unknown = null;
  if (reduction) error = reduction.error;
  else {
    try {
      reduceSecondOrder(input, params);
    } catch (e) {
      error = e;
    }
  }
  if (error !== null && !isNumericalRefusal(error)) return parseFailure(error);
  checkpoint?.();
  let node: MathNode;
  try {
    node = secondOrderNode(input, params);
  } catch (error) {
    return parseFailure(error);
  }
  const roles: SymbolRoles = { variable: "t", unknowns: { x: 0, [XD]: 1, [XDD]: 2 }, params };
  try {
    const form = linearFormOf(node, roles, checkpoint);
    // Linear, but x'' has the coefficient 0 (k x'' at k = 0): not a second-order equation, and not "nonlinear".
    if (qpIsZero(form.u[2])) return { ok: false, failure: { reason: "noSecondDerivative", fragment: studentNotation(input) } };
    return { ok: true, equation: build("second", 2, [form.u[0], form.u[1], form.u[2]], qpNeg(form.free), form.den, form.approximate, inexactLiteral(input), checkpoint) };
  } catch (error) {
    if (error instanceof LinearFormError) return { ok: false, failure: { reason: error.reason, fragment: studentNotation(error.fragment) } };
    throw error;
  }
}

/**
 * The linear equation behind the text of a first-order g (mode "first", dy/dt = g) or a second-order
 * equation (mode "second"). Never throws for bad input: a parse error or a non-linear / unsupported
 * term is a failure with a reason.
 */
export function linearEquation(mode: SeriesMode, text: string, params?: Record<string, number>, checkpoint?: () => void, reduction?: ReductionOutcome): EquationResult {
  if (typeof text !== "string" || text.trim() === "") return { ok: false, failure: { reason: "parse", message: "Expression is empty." } };
  return mode === "first" ? firstOrder(text, params, checkpoint) : secondOrder(text, params, checkpoint, reduction);
}

/** True when the right-hand side is identically zero (the equation is homogeneous). */
export function isHomogeneous(eq: LinearEquation): boolean {
  return qpIsZero(eq.G);
}
