/**
 * Dense polynomials in one variable over the exact rationals (round 12, lib/series).
 *
 * A Poly is the coefficient list p[k] of the k-th power, TRIMMED (no trailing zero coefficient),
 * so the zero polynomial is [] and structural equality is equality. The same type serves the
 * equation's coefficients in t (or in s = t - t0), the recurrence's coefficients in the summation
 * index n, and characteristic polynomials in r.
 */
import {
  add as qadd, div as qdiv, equals as qequals, isZero as qIsZero, mul as qmul, neg as qneg, ONE, q, type Q,
  sub as qsub, toNumber, ZERO,
} from "./rational";

export type Poly = readonly Q[];

export const PZERO: Poly = [];
export const PONE: Poly = [ONE];
/** The variable itself. */
export const PX: Poly = [ZERO, ONE];

/** The list without its trailing zero coefficients. */
export function trim(c: readonly Q[]): Poly {
  let end = c.length;
  while (end > 0 && qIsZero(c[end - 1])) end--;
  return end === c.length ? c : c.slice(0, end);
}
export function pconst(c: Q): Poly {
  return qIsZero(c) ? PZERO : [c];
}
/** c * X^k. */
export function pmonomial(c: Q, k: number): Poly {
  if (qIsZero(c)) return PZERO;
  const out: Q[] = new Array(k + 1).fill(ZERO);
  out[k] = c;
  return out;
}
export function pIsZero(p: Poly): boolean {
  return p.length === 0;
}
/** Degree; -1 for the zero polynomial. */
export function pdeg(p: Poly): number {
  return p.length - 1;
}
/** Leading coefficient (0 for the zero polynomial). */
export function plead(p: Poly): Q {
  return p.length === 0 ? ZERO : p[p.length - 1];
}
export function pcoef(p: Poly, k: number): Q {
  return k >= 0 && k < p.length ? p[k] : ZERO;
}
export function isConstantPoly(p: Poly): boolean {
  return p.length <= 1;
}
export function pequals(a: Poly, b: Poly): boolean {
  return a.length === b.length && a.every((c, i) => qequals(c, b[i]));
}
export function padd(a: Poly, b: Poly): Poly {
  const n = Math.max(a.length, b.length);
  const out: Q[] = [];
  for (let i = 0; i < n; i++) out.push(qadd(pcoef(a, i), pcoef(b, i)));
  return trim(out);
}
export function pneg(a: Poly): Poly {
  return a.map(qneg);
}
export function psub(a: Poly, b: Poly): Poly {
  return padd(a, pneg(b));
}
export function pscale(a: Poly, c: Q): Poly {
  return qIsZero(c) ? PZERO : a.map((v) => qmul(v, c));
}
export function pmul(a: Poly, b: Poly): Poly {
  if (a.length === 0 || b.length === 0) return PZERO;
  const out: Q[] = new Array(a.length + b.length - 1).fill(ZERO);
  for (let i = 0; i < a.length; i++) {
    if (qIsZero(a[i])) continue;
    for (let j = 0; j < b.length; j++) out[i + j] = qadd(out[i + j], qmul(a[i], b[j]));
  }
  return trim(out);
}
/** a^k for an integer k >= 0. */
export function ppow(a: Poly, k: number): Poly {
  let out: Poly = PONE;
  for (let i = 0; i < k; i++) out = pmul(out, a);
  return out;
}
/** p(x) exactly (Horner). */
export function pevalQ(p: Poly, x: Q): Q {
  let v = ZERO;
  for (let i = p.length - 1; i >= 0; i--) v = qadd(qmul(v, x), p[i]);
  return v;
}
/** p(x) in floating point from the coefficients' nearest doubles. */
export function pevalNumber(p: Poly, x: number): number {
  let v = 0;
  for (let i = p.length - 1; i >= 0; i--) v = v * x + toNumber(p[i]);
  return v;
}
export function pderiv(p: Poly): Poly {
  const out: Q[] = [];
  for (let k = 1; k < p.length; k++) out.push(qmul(p[k], q(k)));
  return trim(out);
}
/** p(s + c) as a polynomial in s (Horner on the binomial (s + c)); `checkpoint` is called once per step (a caller's budget). */
export function ptaylorShift(p: Poly, c: Q, checkpoint?: () => void): Poly {
  if (qIsZero(c)) return p;
  let out: Poly = PZERO;
  const linear: Poly = trim([c, ONE]);
  for (let i = p.length - 1; i >= 0; i--) {
    checkpoint?.();
    out = padd(pmul(out, linear), pconst(p[i]));
  }
  return out;
}
/** Long division a = q b + r with deg r < deg b; b must be non-zero. `checkpoint` is called once per quotient term. */
export function pdivmod(a: Poly, b: Poly, checkpoint?: () => void): { quotient: Poly; remainder: Poly } {
  if (b.length === 0) throw new RangeError("Polynomial division by zero.");
  let r: Q[] = [...a];
  const quotient: Q[] = new Array(Math.max(0, a.length - b.length + 1)).fill(ZERO);
  const lead = plead(b);
  for (let k = a.length - b.length; k >= 0; k--) {
    checkpoint?.();
    const coef = qdiv(pcoef(r, k + b.length - 1), lead);
    quotient[k] = coef;
    if (qIsZero(coef)) continue;
    for (let j = 0; j < b.length; j++) {
      // Every few terms: one quotient step over coefficients of thousands of digits can take a second.
      if ((j & 7) === 7) checkpoint?.();
      r[k + j] = qsub(r[k + j], qmul(coef, b[j]));
    }
  }
  r = r.slice(0, Math.max(0, b.length - 1));
  return { quotient: trim(quotient), remainder: trim(r) };
}
/** The monic multiple (the zero polynomial stays zero). */
export function pmonic(p: Poly, checkpoint?: () => void): Poly {
  if (p.length === 0) return p;
  const lead = plead(p);
  return p.map((v, i) => {
    if ((i & 7) === 7) checkpoint?.();
    return qdiv(v, lead);
  });
}
const B0 = BigInt(0);
const B1 = BigInt(1);
const B2 = BigInt(2);

/**
 * Primes for the modular coprimality test of `pgcd`: the three largest below 2^31. A prime that
 * divides a denominator or a leading coefficient leaves the test inconclusive for it and the next
 * one is tried; when all three do, the exact remainder sequence decides alone.
 */
export const GCD_TEST_PRIMES: readonly bigint[] = [2147483647, 2147483629, 2147483587].map((v) => BigInt(v));

function powMod(base: bigint, exponent: bigint, m: bigint): bigint {
  let result = B1;
  let x = base % m;
  let e = exponent;
  while (e > B0) {
    if ((e & B1) !== B0) result = (result * x) % m;
    x = (x * x) % m;
    e >>= B1;
  }
  return result;
}

/** n / d mod p; null when p divides d. */
function residue(v: Q, p: bigint): bigint | null {
  const d = ((v.d % p) + p) % p;
  if (d === B0) return null;
  return ((((v.n % p) + p) % p) * powMod(d, p - B2, p)) % p;
}

/**
 * The degree of gcd(a mod p, b mod p) over the integers mod p, or null when p divides a denominator
 * or a leading coefficient of a or b (or one of them is zero). When it is not null it is AT LEAST the
 * degree of the exact gcd over Q: a common factor h over Q, scaled to a primitive integer polynomial,
 * divides the integer multiples of a and b (Gauss's lemma), p does not divide their leading
 * coefficients and so not h's, so h mod p keeps its degree and divides both images. A result 0
 * therefore PROVES that a and b are coprime.
 */
export function modularGcdDegree(a: Poly, b: Poly, p: bigint): number | null {
  const reduce = (poly: Poly): bigint[] | null => {
    const out: bigint[] = [];
    for (const c of poly) {
      const r = residue(c, p);
      if (r === null) return null;
      out.push(r);
    }
    return out;
  };
  let x = reduce(a);
  let y = reduce(b);
  if (!x || !y || x.length === 0 || y.length === 0 || x[x.length - 1] === B0 || y[y.length - 1] === B0) return null;
  while (y.length > 0) {
    const r = x.slice();
    const inverse = powMod(y[y.length - 1], p - B2, p);
    for (let k = r.length - y.length; k >= 0; k--) {
      const c = (r[k + y.length - 1] * inverse) % p;
      if (c === B0) continue;
      for (let j = 0; j < y.length; j++) r[k + j] = (((r[k + j] - c * y[j]) % p) + p) % p;
    }
    let end = Math.min(r.length, y.length - 1);
    while (end > 0 && r[end - 1] === B0) end--;
    x = y;
    y = r.slice(0, end);
  }
  return x.length - 1;
}

/**
 * Monic greatest common divisor; gcd(0, 0) = 0. Coprime inputs, the usual case (a numerator and
 * its denominator, a polynomial and its derivative), are settled first by the modular test above,
 * which is a proof and costs a few hundred small multiplications; so is a shorter input that the
 * modular degree allows to be the gcd and that divides the other exactly. Everything else goes
 * through the exact sequence, every remainder made monic before the next step (a monic remainder
 * sequence), which keeps the rational coefficients from swelling the way the raw Euclidean
 * sequence does; `checkpoint` is called once per step. Without the test, (t + pi)^16 against
 * (t^2 + 1)^8 swelled to thousands of digits before reaching the constant remainder (1.3 s).
 */
export function pgcd(a: Poly, b: Poly, checkpoint?: () => void): Poly {
  if (a.length > 1 && b.length > 1) {
    for (const p of GCD_TEST_PRIMES) {
      const degree = modularGcdDegree(a, b, p);
      if (degree === null) continue;
      if (degree === 0) return PONE;
      const [small, large] = a.length <= b.length ? [a, b] : [b, a];
      if (degree === small.length - 1 && pdivmod(large, small, checkpoint).remainder.length === 0) return pmonic(small);
      break;
    }
  }
  let x = pmonic(a);
  let y = pmonic(b);
  while (y.length > 0) {
    checkpoint?.();
    const { remainder } = pdivmod(x, y, checkpoint);
    x = y;
    y = pmonic(remainder, checkpoint);
  }
  return pmonic(x);
}
/** The exact quotient a / b; throws when b does not divide a. */
export function pexactDiv(a: Poly, b: Poly): Poly {
  const { quotient, remainder } = pdivmod(a, b);
  if (remainder.length !== 0) throw new RangeError("Polynomial does not divide.");
  return quotient;
}
/** (X + offset)(X + offset - 1)...(X + offset - j + 1): the falling factorial of X + offset, j factors. */
export function fallingFactorial(offset: number, j: number): Poly {
  let out: Poly = PONE;
  for (let i = 0; i < j; i++) out = pmul(out, trim([q(offset - i), ONE]));
  return out;
}
