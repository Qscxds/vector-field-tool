/**
 * Quasi-polynomials: finite sums  sum_lambda e^(lambda t) P_lambda(t)  with Gaussian-rational
 * exponents lambda and polynomials P_lambda with Gaussian-rational coefficients (round 12).
 *
 * This is the class of right-hand sides the method of undetermined coefficients handles exactly:
 * polynomials (lambda = 0), e^(a t), cos(b t) = (e^(i b t) + e^(-i b t))/2, sin(b t), sinh, cosh and
 * their products. A pure polynomial in t is the special case of a single lambda = 0 term with real
 * coefficients (`asPolynomial`), which is what the power-series path needs.
 */
import { padd, pconst, pIsZero, pmul, pscale, PX, trim, type Poly, PZERO, pequals } from "./poly";
import { cadd, cIsReal, cIsZero, cKey, cmp as cmpQ, cmul, type CQ, CZERO, isZero, neg as qneg, ONE, q, type Q, TWO, ZERO } from "./rational";

/** A polynomial with Gaussian-rational coefficients, as its real and imaginary parts. */
export type CPoly = { readonly re: Poly; readonly im: Poly };
export type QuasiTerm = { readonly lambda: CQ; readonly coef: CPoly };
/** Keyed by cKey(lambda); a key is present only with a non-zero coefficient. */
export type QuasiPoly = ReadonlyMap<string, QuasiTerm>;

export const CPZERO: CPoly = { re: PZERO, im: PZERO };

export function cpIsZero(p: CPoly): boolean {
  return pIsZero(p.re) && pIsZero(p.im);
}
export function cpAdd(a: CPoly, b: CPoly): CPoly {
  return { re: padd(a.re, b.re), im: padd(a.im, b.im) };
}
export function cpNeg(a: CPoly): CPoly {
  return { re: pscale(a.re, qneg(ONE)), im: pscale(a.im, qneg(ONE)) };
}
export function cpMul(a: CPoly, b: CPoly): CPoly {
  const re = padd(pmul(a.re, b.re), pscale(pmul(a.im, b.im), qneg(ONE)));
  const im = padd(pmul(a.re, b.im), pmul(a.im, b.re));
  return { re, im };
}
export function cpScale(a: CPoly, c: CQ): CPoly {
  return cpMul(a, { re: pconst(c.re), im: pconst(c.im) });
}
/** The k-th coefficient as a Gaussian rational. */
export function cpCoef(p: CPoly, k: number): CQ {
  return { re: k < p.re.length ? p.re[k] : ZERO, im: k < p.im.length ? p.im[k] : ZERO };
}
export function cpDeg(p: CPoly): number {
  return Math.max(p.re.length, p.im.length) - 1;
}
export function cpFromCoefs(coefs: readonly CQ[]): CPoly {
  return { re: trim(coefs.map((v) => v.re)), im: trim(coefs.map((v) => v.im)) };
}
export function cpEquals(a: CPoly, b: CPoly): boolean {
  return pequals(a.re, b.re) && pequals(a.im, b.im);
}

export const QP_ZERO: QuasiPoly = new Map();

function single(lambda: CQ, coef: CPoly): QuasiPoly {
  return cpIsZero(coef) ? QP_ZERO : new Map([[cKey(lambda), { lambda, coef }]]);
}
/** A constant c. */
export function qpConst(c: CQ): QuasiPoly {
  return single(CZERO, { re: pconst(c.re), im: pconst(c.im) });
}
/** The variable t. */
export const QP_T: QuasiPoly = single(CZERO, { re: PX, im: PZERO });
/** e^(lambda t). */
export function qpExp(lambda: CQ): QuasiPoly {
  return single(lambda, { re: pconst(ONE), im: PZERO });
}
/** A real polynomial in t. */
export function qpPoly(p: Poly): QuasiPoly {
  return single(CZERO, { re: p, im: PZERO });
}
export function qpIsZero(a: QuasiPoly): boolean {
  return a.size === 0;
}
export function qpAdd(a: QuasiPoly, b: QuasiPoly): QuasiPoly {
  if (a.size === 0) return b;
  if (b.size === 0) return a;
  const out = new Map(a);
  for (const [key, term] of b) {
    const prev = out.get(key);
    const coef = prev ? cpAdd(prev.coef, term.coef) : term.coef;
    if (cpIsZero(coef)) out.delete(key);
    else out.set(key, { lambda: term.lambda, coef });
  }
  return out;
}
export function qpNeg(a: QuasiPoly): QuasiPoly {
  const out = new Map<string, QuasiTerm>();
  for (const [key, term] of a) out.set(key, { lambda: term.lambda, coef: cpNeg(term.coef) });
  return out;
}
export function qpSub(a: QuasiPoly, b: QuasiPoly): QuasiPoly {
  return qpAdd(a, qpNeg(b));
}
export function qpMul(a: QuasiPoly, b: QuasiPoly): QuasiPoly {
  let out: QuasiPoly = QP_ZERO;
  for (const s of a.values()) {
    for (const t of b.values()) out = qpAdd(out, single(cadd(s.lambda, t.lambda), cpMul(s.coef, t.coef)));
  }
  return out;
}
export function qpScale(a: QuasiPoly, c: CQ): QuasiPoly {
  if (cIsZero(c)) return QP_ZERO;
  const out = new Map<string, QuasiTerm>();
  for (const [key, term] of a) out.set(key, { lambda: term.lambda, coef: cpScale(term.coef, c) });
  return out;
}
/** Multiplication by a real polynomial. */
export function qpMulPoly(a: QuasiPoly, p: Poly): QuasiPoly {
  return qpMul(a, qpPoly(p));
}
/** The real polynomial when the quasi-polynomial is one (only lambda = 0, real coefficients); else null. */
export function asPolynomial(a: QuasiPoly): Poly | null {
  if (a.size === 0) return PZERO;
  if (a.size > 1) return null;
  const term = a.values().next().value as QuasiTerm;
  if (!cIsZero(term.lambda) || !pIsZero(term.coef.im)) return null;
  return term.coef.re;
}
/** The constant when the quasi-polynomial is a (possibly complex) constant; else null. */
export function asConstant(a: QuasiPoly): CQ | null {
  if (a.size === 0) return CZERO;
  if (a.size > 1) return null;
  const term = a.values().next().value as QuasiTerm;
  if (!cIsZero(term.lambda) || cpDeg(term.coef) > 0) return null;
  return cpCoef(term.coef, 0);
}
/** A single exponential c e^(lambda t) with a constant c != 0: { c, lambda }; else null. */
export function asExponentialMonomial(a: QuasiPoly): { c: CQ; lambda: CQ } | null {
  if (a.size !== 1) return null;
  const term = a.values().next().value as QuasiTerm;
  if (cpDeg(term.coef) > 0) return null;
  return { c: cpCoef(term.coef, 0), lambda: term.lambda };
}
/** True when the value is real for real t: every lambda's conjugate carries the conjugate coefficient. */
export function qpIsReal(a: QuasiPoly): boolean {
  for (const term of a.values()) {
    const conj = { re: term.lambda.re, im: qneg(term.lambda.im) };
    if (isZero(term.lambda.im)) {
      if (!pIsZero(term.coef.im)) return false;
      continue;
    }
    const partner = a.get(cKey(conj));
    if (!partner) return false;
    const expected: CPoly = { re: term.coef.re, im: pscale(term.coef.im, qneg(ONE)) };
    if (!cpEquals(partner.coef, expected)) return false;
  }
  return true;
}
/** Highest polynomial degree over the terms (-1 for zero). */
export function qpMaxDegree(a: QuasiPoly): number {
  let d = -1;
  for (const term of a.values()) d = Math.max(d, cpDeg(term.coef));
  return d;
}
/** The terms in a stable display order: real exponents first by value, then complex by real part, then by imaginary part. */
export function qpTerms(a: QuasiPoly): QuasiTerm[] {
  return [...a.values()].sort((s, t) => {
    const sr = cIsReal(s.lambda) ? 0 : 1;
    const tr = cIsReal(t.lambda) ? 0 : 1;
    if (sr !== tr) return sr - tr;
    const re = cmpQ(s.lambda.re, t.lambda.re);
    if (re !== 0) return re;
    return cmpQ(t.lambda.im, s.lambda.im);
  });
}
/** The real part e^(alpha t)(A cos + B sin) pairs: conjugate terms merged, im >= 0 kept. */
export function realPairs(a: QuasiPoly): { alpha: Q; beta: Q; cos: Poly; sin: Poly }[] {
  const out: { alpha: Q; beta: Q; cos: Poly; sin: Poly }[] = [];
  for (const term of qpTerms(a)) {
    const beta = term.lambda.im;
    if (cmpQ(beta, ZERO) < 0) continue; // the partner with im > 0 carries the pair
    if (isZero(beta)) {
      out.push({ alpha: term.lambda.re, beta, cos: term.coef.re, sin: PZERO });
      continue;
    }
    // e^((a+ib)t) Q + e^((a-ib)t) conj(Q) = e^(at) (2 Re Q cos bt - 2 Im Q sin bt)
    out.push({ alpha: term.lambda.re, beta, cos: pscale(term.coef.re, TWO), sin: pscale(term.coef.im, qneg(TWO)) });
  }
  return out;
}
/** Evaluates a quasi-polynomial at a real t in floating point (real part; the input is real). */
export function qpEvalNumber(a: QuasiPoly, t: number, num: (q: Q) => number): number {
  let sum = 0;
  for (const term of a.values()) {
    const al = num(term.lambda.re);
    const be = num(term.lambda.im);
    let pr = 0;
    let pi = 0;
    const deg = cpDeg(term.coef);
    for (let k = deg; k >= 0; k--) {
      const ck = cpCoef(term.coef, k);
      pr = pr * t + num(ck.re);
      pi = pi * t + num(ck.im);
    }
    const mag = Math.exp(al * t);
    const cr = Math.cos(be * t);
    const ci = Math.sin(be * t);
    sum += mag * (pr * cr - pi * ci);
  }
  return sum;
}
/** The derivative d/dt of a quasi-polynomial. */
export function qpDerivative(a: QuasiPoly): QuasiPoly {
  let out: QuasiPoly = QP_ZERO;
  for (const term of a.values()) {
    // (e^(l t) P)' = e^(l t) (l P + P')
    const deg = cpDeg(term.coef);
    const coefs: CQ[] = [];
    for (let k = 0; k <= deg; k++) {
      const scaled = cmul(term.lambda, cpCoef(term.coef, k));
      const next = k + 1 <= deg ? cmul({ re: q(k + 1), im: ZERO }, cpCoef(term.coef, k + 1)) : CZERO;
      coefs.push(cadd(scaled, next));
    }
    out = qpAdd(out, single(term.lambda, cpFromCoefs(coefs)));
  }
  return out;
}
