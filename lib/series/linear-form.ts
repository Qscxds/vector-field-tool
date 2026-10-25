/**
 * The exact LINEAR FORM of an expression (round 12, lib/series): a validated mathjs AST read as
 *
 *     ( u0(t) * U + u1(t) * U' + u2(t) * U'' + free(t) ) / den(t)
 *
 * where U, U', U'' are the unknown and its derivatives (the caller names their symbols), the u_j and
 * `free` are quasi-polynomials in t (sums of polynomial * e^(lambda t), see quasi.ts) and `den` is a
 * monic real polynomial. Everything is exact rational arithmetic; a literal or a parameter value is
 * read as the decimal it was written as (rational.ts fromNumber). Constants that are not rational
 * (pi, e, sqrt(2), cos(1)) enter as the rational of their double and set `approximate`.
 *
 * The reader refuses, with a reason and the offending fragment, everything that is not of this form:
 * a product of two factors that contain the unknown, the unknown in a denominator, in a power or in a
 * function (nonlinear); a function of t other than exp / sin / cos / sinh / cosh of a LINEAR argument
 * a + b t (unsupportedFunction: ln(t), sqrt(t), tan(t), sin(t^2)); a non-integer power of an
 * expression in t (nonIntegerPower); a conditional or a comparison (piecewise); a division by
 * something that is neither a polynomial in t nor a single exponential (divisionByNonPolynomial).
 *
 * Static and exact: it never samples or evaluates the student's expression at a point, so no
 * conclusion depends on sampling luck. A common polynomial factor of the denominator and every
 * numerator is cancelled (t*x/t is x).
 */
import type { MathNode } from "mathjs";
import { mathjs } from "../core/parse";
import { pdeg, pexactDiv, pgcd, pIsZero, plead, pmul, PONE, type Poly, pscale, PZERO } from "./poly";
import {
  asConstant, asExponentialMonomial, asPolynomial, qpAdd, qpConst, qpExp, qpIsZero, qpMaxDegree, qpMul, qpMulPoly, qpNeg,
  qpScale, QP_T, QP_ZERO, type QuasiPoly, type QuasiTerm,
} from "./quasi";
import {
  abs as qabs, add as qadd, ceil as qceil, type CQ, cq, div as qdiv, equals as qequals, floor as qfloor, fromNumber,
  inv as qinv, isInteger, isZero, max as qmax, min as qmin, mul as qmul, neg as qneg, ONE, powInt, q, type Q, round as qround,
  sign as qsign, sqrtExact, toNumber, ZERO, bigLn,
} from "./rational";

export type LinearFailureReason =
  | "nonlinear"
  | "unsupportedFunction"
  | "nonIntegerPower"
  | "piecewise"
  | "divisionByNonPolynomial"
  | "divisionByZero"
  | "notFinite"
  /** A degree above MAX_DEGREE, more than MAX_EXPONENTS exponentials, or a power above MAX_INTEGER_POWER of something in t. */
  | "tooComplex"
  /** An exact number beyond MAX_RATIONAL_HEX_DIGITS ((10^40)^40, (t + pi)^40): too many digits, not too high a degree. */
  | "tooManyDigits"
  /** A function argument mathjs refuses (round(1.5, 0.5): the number of decimals must be a whole number 0..15). */
  | "invalidArgument"
  /** The coefficient of x'' is identically 0 (k x'' at k = 0, x'' - x''): not a second-order equation. */
  | "noSecondDerivative"
  /** A whole exponent beyond 2^53: the picture computes it as a double, so its exact value is not the picture's equation. */
  | "exponentTooLarge";

export class LinearFormError extends Error {
  readonly reason: LinearFailureReason;
  /** The offending sub-expression in mathjs notation (the caller maps placeholder names back). */
  readonly fragment: string;
  constructor(reason: LinearFailureReason, fragment: string) {
    super(`${reason}: ${fragment}`);
    this.name = "LinearFormError";
    this.reason = reason;
    this.fragment = fragment;
  }
}

/** Highest derivative order a linear form tracks. */
export const MAX_ORDER = 2;
/** Caps that keep a pathological input (t^999, (1+t)^40 * (1+t)^40 ...) from running long. */
export const MAX_DEGREE = 40;
export const MAX_EXPONENTS = 24;
export const MAX_INTEGER_POWER = 40;
/**
 * A rational whose numerator and denominator together exceed this many HEX digits (about 1200 decimal
 * digits) makes the expression tooComplex: (((10^40)^40)^40) or (t + pi)^16 / (t^2 + 1)^8 would
 * otherwise spend minutes in exact gcds before any budget could be consulted.
 */
export const MAX_RATIONAL_HEX_DIGITS = 1000;

/** The caller's budget for the current reading (set by linearFormOf for the duration of one synchronous walk). */
let activeCheckpoint: (() => void) | undefined;

function hexSize(v: Q): number {
  return (v.n < BigInt(0) ? -v.n : v.n).toString(16).length + v.d.toString(16).length;
}
/** The largest rational of a form, in hex digits. */
function formSize(f: LinearForm): number {
  let size = 0;
  for (const c of f.den) size = Math.max(size, hexSize(c));
  for (const part of [...f.u, f.free]) {
    for (const term of part.values()) {
      for (const c of term.coef.re) size = Math.max(size, hexSize(c));
      for (const c of term.coef.im) size = Math.max(size, hexSize(c));
      size = Math.max(size, hexSize(term.lambda.re), hexSize(term.lambda.im));
    }
  }
  return size;
}

export type LinearForm = {
  /** u[j]: the coefficient of the j-th derivative of the unknown, j = 0..MAX_ORDER. */
  readonly u: readonly QuasiPoly[];
  readonly free: QuasiPoly;
  /** Monic, non-zero. */
  readonly den: Poly;
  readonly approximate: boolean;
};

export type SymbolRoles = {
  /** The independent variable's symbol ("t"). */
  variable: string;
  /** Symbol -> derivative order of the unknown ("x" -> 0, "xd" -> 1, "xdd" -> 2). */
  unknowns: Readonly<Record<string, number>>;
  params?: Readonly<Record<string, number>>;
};

const EMPTY_U: readonly QuasiPoly[] = [QP_ZERO, QP_ZERO, QP_ZERO];

function free(value: QuasiPoly, approximate = false): LinearForm {
  return { u: EMPTY_U, free: value, den: PONE, approximate };
}
function constant(value: Q, approximate = false): LinearForm {
  return free(qpConst(cq(value)), approximate);
}
function unknown(order: number): LinearForm {
  const u = EMPTY_U.map((v, j) => (j === order ? qpConst(cq(ONE)) : v));
  return { u, free: QP_ZERO, den: PONE, approximate: false };
}
export function hasUnknown(f: LinearForm): boolean {
  return f.u.some((v) => !qpIsZero(v));
}
/** The constant value of an unknown-free form that does not depend on t; null otherwise. */
function constantOf(f: LinearForm): CQ | null {
  if (hasUnknown(f) || pdeg(f.den) > 0) return null;
  const c = asConstant(f.free);
  return c ? { re: qdiv(c.re, f.den[0] ?? ONE), im: qdiv(c.im, f.den[0] ?? ONE) } : null;
}
function realConstantOf(f: LinearForm): Q | null {
  const c = constantOf(f);
  return c && isZero(c.im) ? c.re : null;
}

function mapNumerators(f: LinearForm, map: (v: QuasiPoly) => QuasiPoly): { u: QuasiPoly[]; free: QuasiPoly } {
  return { u: f.u.map(map), free: map(f.free) };
}

function checkSize(f: LinearForm, node: MathNode): LinearForm {
  const parts = [...f.u, f.free];
  if (pdeg(f.den) > MAX_DEGREE || parts.some((v) => qpMaxDegree(v) > MAX_DEGREE || v.size > MAX_EXPONENTS)) {
    throw new LinearFormError("tooComplex", node.toString());
  }
  if (formSize(f) > MAX_RATIONAL_HEX_DIGITS) throw new LinearFormError("tooManyDigits", node.toString());
  return f;
}

/** Monic denominator and every common polynomial factor of the denominator and all numerators cancelled. */
function normalize(u: readonly QuasiPoly[], freePart: QuasiPoly, den: Poly, approximate: boolean): LinearForm {
  let numU = u;
  let numFree = freePart;
  let d = den;
  const lead = plead(d);
  if (!(qequals(lead, ONE))) {
    const scale = cq(qinv(lead));
    numU = numU.map((v) => qpScale(v, scale));
    numFree = qpScale(numFree, scale);
    d = pscale(d, qinv(lead));
  }
  if (pdeg(d) >= 1) {
    let g = d;
    for (const part of [...numU, numFree]) {
      for (const term of part.values()) {
        if (!pIsZero(term.coef.re)) g = pgcd(g, term.coef.re, activeCheckpoint);
        if (!pIsZero(term.coef.im)) g = pgcd(g, term.coef.im, activeCheckpoint);
        if (pdeg(g) < 1) break;
      }
      if (pdeg(g) < 1) break;
    }
    if (pdeg(g) >= 1) {
      const cancel = (v: QuasiPoly): QuasiPoly => {
        const out = new Map<string, QuasiTerm>();
        for (const [key, term] of v) {
          out.set(key, {
            lambda: term.lambda,
            coef: {
              re: pIsZero(term.coef.re) ? PZERO : pexactDiv(term.coef.re, g),
              im: pIsZero(term.coef.im) ? PZERO : pexactDiv(term.coef.im, g),
            },
          });
        }
        return out;
      };
      numU = numU.map(cancel);
      numFree = cancel(numFree);
      d = pexactDiv(d, g);
    }
  }
  return { u: numU, free: numFree, den: d, approximate };
}

function addForms(a: LinearForm, b: LinearForm): LinearForm {
  const g = pgcd(a.den, b.den);
  const fa = pexactDiv(b.den, g);
  const fb = pexactDiv(a.den, g);
  const u = a.u.map((v, j) => qpAdd(qpMulPoly(v, fa), qpMulPoly(b.u[j], fb)));
  const f = qpAdd(qpMulPoly(a.free, fa), qpMulPoly(b.free, fb));
  return normalize(u, f, pmul(a.den, fa), a.approximate || b.approximate);
}
function negForm(a: LinearForm): LinearForm {
  return { u: a.u.map(qpNeg), free: qpNeg(a.free), den: a.den, approximate: a.approximate };
}
function mulForms(a: LinearForm, b: LinearForm, node: MathNode): LinearForm {
  if (hasUnknown(a) && hasUnknown(b)) throw new LinearFormError("nonlinear", node.toString());
  const [withU, other] = hasUnknown(b) ? [b, a] : [a, b];
  const { u, free: f } = mapNumerators(withU, (v) => qpMul(v, other.free));
  return normalize(u, f, pmul(a.den, b.den), a.approximate || b.approximate);
}
function divForms(a: LinearForm, b: LinearForm, node: MathNode): LinearForm {
  if (hasUnknown(b)) throw new LinearFormError("nonlinear", node.toString());
  const poly = asPolynomial(b.free);
  if (poly !== null) {
    if (pIsZero(poly)) throw new LinearFormError("divisionByZero", node.toString());
    const { u, free: f } = mapNumerators(a, (v) => qpMulPoly(v, b.den));
    return normalize(u, f, pmul(a.den, poly), a.approximate || b.approximate);
  }
  const mono = asExponentialMonomial(b.free);
  if (mono !== null) {
    // a / (c e^(l t) / D) = a * D * (1/c) e^(-l t)
    const factor = qpScale(qpExp({ re: qneg(mono.lambda.re), im: qneg(mono.lambda.im) }), invC(mono.c));
    const { u, free: f } = mapNumerators(a, (v) => qpMulPoly(qpMul(v, factor), b.den));
    return normalize(u, f, a.den, a.approximate || b.approximate);
  }
  throw new LinearFormError("divisionByNonPolynomial", node.toString());
}
function invC(c: CQ): CQ {
  const den = qadd(qmul(c.re, c.re), qmul(c.im, c.im));
  return { re: qdiv(c.re, den), im: qdiv(qneg(c.im), den) };
}

/** e^(c) for a real constant c: exact only at c = 0; `fragment` is the student's expression a refusal names. */
function expConstant(c: Q, fragment: string): { value: Q; approximate: boolean } {
  if (isZero(c)) return { value: ONE, approximate: false };
  return approxValue(Math.exp(toNumber(c)), fragment);
}
/** A double that stands for an irrational constant, as the rational of its shortest decimal; a non-finite one refuses with the student's fragment. */
function approxValue(v: number, fragment: string): { value: Q; approximate: boolean } {
  const value = fromNumber(v);
  if (value === null) throw new LinearFormError("notFinite", fragment);
  return { value, approximate: true };
}

/** A linear argument a + b t (unknown-free, a polynomial of degree <= 1): {a, b}; else null. */
function linearArgument(f: LinearForm): { a: Q; b: Q } | null {
  if (hasUnknown(f) || pdeg(f.den) > 0) return null;
  const p = asPolynomial(f.free);
  if (p === null || pdeg(p) > 1) return null;
  const scale = qinv(f.den[0] ?? ONE);
  return { a: qmul(p[0] ?? ZERO, scale), b: qmul(p[1] ?? ZERO, scale) };
}

/** cos and sin of a real constant: exact at 0; `fragment` is the student's expression a refusal names. */
function trigConstant(a: Q, fragment: string): { cos: Q; sin: Q; approximate: boolean } {
  if (isZero(a)) return { cos: ONE, sin: ZERO, approximate: false };
  const cos = approxValue(Math.cos(toNumber(a)), fragment).value;
  const sin = approxValue(Math.sin(toNumber(a)), fragment).value;
  return { cos, sin, approximate: true };
}

function expOf(arg: LinearForm, node: MathNode): LinearForm {
  const lin = linearArgument(arg);
  if (!lin) throw new LinearFormError("unsupportedFunction", node.toString());
  const k = expConstant(lin.a, node.toString());
  return free(qpScale(qpExp(cq(lin.b)), cq(k.value)), arg.approximate || k.approximate);
}

function trigOf(name: "sin" | "cos" | "sinh" | "cosh", arg: LinearForm, node: MathNode): LinearForm {
  const lin = linearArgument(arg);
  if (!lin) throw new LinearFormError("unsupportedFunction", node.toString());
  const half = q(1, 2);
  if (name === "sinh" || name === "cosh") {
    // cosh(b t + a) = (e^a e^(bt) + e^(-a) e^(-bt)) / 2, sinh with a minus
    const ep = expConstant(lin.a, node.toString());
    const em = expConstant(qneg(lin.a), node.toString());
    const s = name === "cosh" ? ONE : qneg(ONE);
    const value = qpAdd(qpScale(qpExp(cq(lin.b)), cq(qmul(ep.value, half))), qpScale(qpExp(cq(qneg(lin.b))), cq(qmul(qmul(em.value, half), s))));
    return free(value, arg.approximate || ep.approximate || em.approximate);
  }
  // e^(i(bt+a)) = (cos a + i sin a) e^(i b t)
  const tc = trigConstant(lin.a, node.toString());
  const plus: CQ = { re: tc.cos, im: tc.sin };
  const minus: CQ = { re: tc.cos, im: qneg(tc.sin) };
  const ePlus = qpScale(qpExp({ re: ZERO, im: lin.b }), plus);
  const eMinus = qpScale(qpExp({ re: ZERO, im: qneg(lin.b) }), minus);
  // cos = (E+ + E-)/2 ; sin = (E+ - E-)/(2i) = -i/2 (E+ - E-)
  const value = name === "cos"
    ? qpScale(qpAdd(ePlus, eMinus), cq(half))
    : qpScale(qpAdd(ePlus, qpNeg(eMinus)), { re: ZERO, im: qneg(half) });
  return free(value, arg.approximate || tc.approximate);
}

function powForms(base: LinearForm, exponent: LinearForm, node: MathNode, baseIsE: boolean): LinearForm {
  if (hasUnknown(exponent)) throw new LinearFormError("nonlinear", node.toString());
  if (baseIsE) return expOf(exponent, node);
  const k = realConstantOf(exponent);
  if (k === null) {
    // t in the exponent (2^t): not a polynomial and not one of the expandable functions.
    throw new LinearFormError(hasUnknown(base) ? "nonlinear" : "unsupportedFunction", node.toString());
  }
  if (isInteger(k)) {
    // Beyond 2^53 the picture's evaluator (doubles) no longer sees the exponent as typed ((−1)^(2^53 + 1)
    // is +1 for it): such an equation is refused rather than solved as another one.
    if ((k.n < BigInt(0) ? -k.n : k.n) > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new LinearFormError(hasUnknown(base) ? "nonlinear" : "exponentTooLarge", node.toString());
    }
    // A base of ±1 or 0 takes any whole exponent, decided by the exponent's exact parity and sign.
    const c0 = hasUnknown(base) ? null : realConstantOf(base);
    if (c0 !== null && (isZero(c0) || qequals(qabs(c0), ONE))) {
      const approx = base.approximate || exponent.approximate;
      if (isZero(c0)) {
        if (k.n < BigInt(0)) throw new LinearFormError("divisionByZero", node.toString());
        return constant(k.n === BigInt(0) ? ONE : ZERO, approx);
      }
      const odd = (k.n < BigInt(0) ? -k.n : k.n) % BigInt(2) === BigInt(1);
      return constant(qsign(c0) < 0 && odd ? qneg(ONE) : ONE, approx);
    }
    const n = Number(k.n);
    if (hasUnknown(base)) {
      if (n === 1) return base;
      if (n === 0) return constant(ONE, base.approximate || exponent.approximate);
      throw new LinearFormError("nonlinear", node.toString());
    }
    // A constant base (2^41, 0.5^60) is one exact power, whatever the exponent; its size is known
    // beforehand from the logarithms of its numerator and denominator (2^501 has 127 hex digits).
    const c = realConstantOf(base);
    if (c !== null) {
      if (isZero(c)) {
        if (n < 0) throw new LinearFormError("divisionByZero", node.toString());
        return constant(n === 0 ? ONE : ZERO, base.approximate || exponent.approximate);
      }
      const hexDigits = (v: bigint) => (v === BigInt(0) ? 0 : bigLn(v) / Math.log(16));
      const size = Math.abs(n) * (hexDigits(c.n) + hexDigits(c.d)) + 2;
      if (size > MAX_RATIONAL_HEX_DIGITS) throw new LinearFormError("tooManyDigits", node.toString());
      return constant(powInt(c, n), base.approximate || exponent.approximate);
    }
    // The size of the result before computing it: |n| times the base's digits.
    if (formSize(base) * Math.abs(n) > MAX_RATIONAL_HEX_DIGITS) throw new LinearFormError("tooManyDigits", node.toString());
    if (Math.abs(n) > MAX_INTEGER_POWER) throw new LinearFormError("tooComplex", node.toString());
    let out = constant(ONE, exponent.approximate);
    for (let i = 0; i < Math.abs(n); i++) out = checkSize(mulForms(out, base, node), node);
    return n >= 0 ? out : divForms(constant(ONE), out, node);
  }
  if (hasUnknown(base)) throw new LinearFormError("nonlinear", node.toString());
  const b = realConstantOf(base);
  if (b === null) throw new LinearFormError("nonIntegerPower", node.toString());
  return constantFunction(Math.pow(toNumber(b), toNumber(k)), () => exactRationalPower(b, k), base.approximate || exponent.approximate, node.toString());
}

/** b^(p/q) exactly when it is rational and the numbers are small; else null. */
function exactRationalPower(b: Q, k: Q): Q | null {
  if (k.d > BigInt(12) || qsign(b) < 0 || hexSize(b) * Math.abs(Number(k.n)) > MAX_RATIONAL_HEX_DIGITS) return null;
  const guess = fromNumber(Math.pow(toNumber(b), toNumber(k)));
  if (guess === null) return null;
  const den = Number(k.d);
  const num = Number(k.n);
  if (Math.abs(num) > 60) return null;
  return qequals(powInt(guess, den), powInt(b, num)) ? guess : null;
}

/** A function value of constant arguments: exact when `exact` returns a value, else the rational of the double (approximate); a refusal names the student's `fragment`. */
function constantFunction(value: number, exact: () => Q | null, approximate: boolean, fragment: string): LinearForm {
  const e = exact();
  if (e !== null) return constant(e, approximate);
  return constant(approxValue(value, fragment).value, true);
}

/**
 * round(a, n) exactly as mathjs, the picture's evaluator, computes it (half away from zero, with its
 * own correction for decimals like 1.005): the double it returns is a decimal with at most n places,
 * read as that decimal. mathjs refuses an n that is not an integer from 0 to 15; so does this.
 */
function roundTo(a: number, digits: number, approximate: boolean, fragment: string): LinearForm {
  let value: unknown;
  try {
    value = mathjs.round(a, digits);
  } catch {
    throw new LinearFormError("invalidArgument", fragment);
  }
  const exact = typeof value === "number" ? fromNumber(value) : null;
  if (exact === null) throw new LinearFormError("notFinite", fragment);
  return constant(exact, approximate);
}

const ZERO_AT_ZERO = new Set(["sin", "tan", "asin", "atan", "sinh", "tanh", "asinh", "atanh"]);
const ONE_AT_ZERO = new Set(["cos", "cosh", "exp"]);

function callConstant(name: string, args: Q[], approximate: boolean, node: MathNode): LinearForm {
  const [a, b] = args;
  const num = args.map(toNumber);
  switch (name) {
    case "abs": return constant(qabs(a), approximate);
    case "sign": return constant(q(qsign(a)), approximate);
    case "floor": return constant(qfloor(a), approximate);
    case "ceil": return constant(qceil(a), approximate);
    case "round":
      // mathjs (the picture's evaluator) rounds a half away from zero (round(-2.5) = -3) and snaps a
      // value within its tolerance of a half first (round(2.4999999999999996) = 3): the same double
      // rule as the picture; beyond 2^53 every double is an integer and the exact rule is the same.
      if (args.length === 1) {
        if (Math.abs(num[0]) < 2 ** 53) return roundTo(num[0], 0, approximate, node.toString());
        return constant(qsign(a) < 0 ? qneg(qround(qneg(a))) : qround(a), approximate);
      }
      return roundTo(num[0], num[1], approximate, node.toString());
    case "min": return constant(args.reduce((m, v) => qmin(m, v)), approximate);
    case "max": return constant(args.reduce((m, v) => qmax(m, v)), approximate);
    case "sqrt":
      if (qsign(a) < 0) throw new LinearFormError("notFinite", node.toString());
      return constantFunction(Math.sqrt(num[0]), () => sqrtExact(a), approximate, node.toString());
    case "pow": return powForms(constant(a, approximate), constant(b, approximate), node, false);
    case "log": case "ln": case "log10":
      if (args.length === 2) return constantFunction(Math.log(num[0]) / Math.log(num[1]), () => null, approximate, node.toString());
      if (qsign(a) <= 0) throw new LinearFormError("notFinite", node.toString());
      return constantFunction(name === "log10" ? Math.log10(num[0]) : Math.log(num[0]), () => (qequals(a, ONE) ? ZERO : null), approximate, node.toString());
    case "atan2": return constantFunction(Math.atan2(num[0], num[1]), () => (isZero(a) && qsign(b) > 0 ? ZERO : null), approximate, node.toString());
    default: {
      const fn = (Math as unknown as Record<string, (v: number) => number>)[name];
      if (typeof fn !== "function") throw new LinearFormError("unsupportedFunction", node.toString());
      const exact = () => (isZero(a) ? (ZERO_AT_ZERO.has(name) ? ZERO : ONE_AT_ZERO.has(name) ? ONE : null) : null);
      return constantFunction(fn(num[0]), exact, approximate, node.toString());
    }
  }
}

function walk(node: MathNode, roles: SymbolRoles): LinearForm {
  activeCheckpoint?.();
  if (mathjs.isParenthesisNode(node)) return walk(node.content, roles);
  if (mathjs.isConstantNode(node)) {
    const value = typeof node.value === "number" ? fromNumber(node.value) : null;
    if (value === null) throw new LinearFormError("notFinite", node.toString());
    // A literal with more digits than its double keeps is marked by the caller, from the text (inexactLiteral).
    return constant(value);
  }
  if (mathjs.isSymbolNode(node)) {
    const name = node.name;
    if (name === roles.variable) return free(QP_T);
    if (Object.prototype.hasOwnProperty.call(roles.unknowns, name)) return unknown(roles.unknowns[name]);
    if (name === "pi") return constant(approxValue(Math.PI, "pi").value, true);
    if (name === "e") return constant(approxValue(Math.E, "e").value, true);
    const value = roles.params && Object.prototype.hasOwnProperty.call(roles.params, name) ? fromNumber(roles.params[name]) : null;
    if (value === null) throw new LinearFormError("notFinite", name);
    return constant(value);
  }
  if (mathjs.isConditionalNode(node)) throw new LinearFormError("piecewise", node.toString());
  if (mathjs.isOperatorNode(node)) {
    const args = node.args;
    switch (node.fn) {
      case "unaryPlus": return walk(args[0], roles);
      case "unaryMinus": return negForm(walk(args[0], roles));
      case "add": return checkSize(addForms(walk(args[0], roles), walk(args[1], roles)), node);
      case "subtract": return checkSize(addForms(walk(args[0], roles), negForm(walk(args[1], roles))), node);
      case "multiply": return checkSize(mulForms(walk(args[0], roles), walk(args[1], roles), node), node);
      case "divide": return checkSize(divForms(walk(args[0], roles), walk(args[1], roles), node), node);
      case "pow": {
        const baseNode = args[0];
        const baseIsE = mathjs.isSymbolNode(baseNode) && baseNode.name === "e";
        return checkSize(powForms(baseIsE ? constant(ONE) : walk(baseNode, roles), walk(args[1], roles), node, baseIsE), node);
      }
      default: throw new LinearFormError("piecewise", node.toString());
    }
  }
  if (mathjs.isFunctionNode(node)) {
    const name = (node.fn as { name: string }).name;
    const args = node.args.map((a) => walk(a, roles));
    if (args.some(hasUnknown)) throw new LinearFormError("nonlinear", node.toString());
    const approximate = args.some((a) => a.approximate);
    const constants = args.map(realConstantOf);
    if (constants.every((c): c is Q => c !== null)) return callConstant(name, constants, approximate, node);
    if (name === "exp") return checkSize(expOf(args[0], node), node);
    if (name === "sin" || name === "cos" || name === "sinh" || name === "cosh") return checkSize(trigOf(name, args[0], node), node);
    if (name === "pow") return checkSize(powForms(args[0], args[1], node, false), node);
    throw new LinearFormError("unsupportedFunction", node.toString());
  }
  throw new LinearFormError("piecewise", node.toString());
}

/**
 * Whether the unknowns appear LINEARLY by the shape of the expression alone, without any arithmetic:
 * never in a product of two factors that both contain one, in a denominator, an exponent, a function
 * argument or a power other than ^1, and no conditional. The same structural rules the reading
 * applies (it may still refuse later for a size or an unsupported function of t), checked in time
 * linear in the expression's size: what a link decoded on the server can afford.
 */
export function structurallyLinear(node: MathNode, unknowns: ReadonlySet<string>): boolean {
  const contains = (n: MathNode): boolean => {
    let found = false;
    n.traverse((m) => {
      if (mathjs.isSymbolNode(m) && unknowns.has(m.name)) found = true;
    });
    return found;
  };
  const linear = (n: MathNode): boolean => {
    if (mathjs.isParenthesisNode(n)) return linear(n.content);
    if (mathjs.isConstantNode(n) || mathjs.isSymbolNode(n)) return true;
    if (mathjs.isConditionalNode(n)) return false;
    if (mathjs.isOperatorNode(n)) {
      const [a, b] = n.args;
      switch (n.fn) {
        case "unaryPlus":
        case "unaryMinus":
          return linear(a);
        case "add":
        case "subtract":
          return linear(a) && linear(b);
        case "multiply":
          return linear(a) && linear(b) && !(contains(a) && contains(b));
        case "divide":
          return linear(a) && !contains(b);
        case "pow":
          if (contains(b)) return false;
          if (!contains(a)) return true;
          return linear(a) && mathjs.isConstantNode(b) && b.value === 1;
        default:
          return false;
      }
    }
    if (mathjs.isFunctionNode(n)) return !n.args.some(contains);
    return false;
  };
  return linear(node);
}

/** The linear form of a validated AST. Throws LinearFormError. */
export function linearFormOf(node: MathNode, roles: SymbolRoles, checkpoint?: () => void): LinearForm {
  const previous = activeCheckpoint;
  activeCheckpoint = checkpoint;
  try {
    return walk(node, roles);
  } finally {
    activeCheckpoint = previous;
  }
}
