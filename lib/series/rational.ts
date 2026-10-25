/**
 * Exact rational and Gaussian-rational arithmetic on BigInt (round 12, lib/series).
 *
 * Every number of a power-series derivation or of a solution formula is computed here exactly: a
 * coefficient a_7 = 1/504 is 1/504, never 0.001984126984. The only door from floating point is
 * `fromNumber`, which reads a double as the SHORTEST decimal that round-trips (what String(v)
 * prints), i.e. as the student typed it or as a slider set it: 0.1 is 1/10 and 0.37 is 37/100, not
 * the binary fraction nearest to them. A value that did not come from a decimal (pi, e, sin(1)) also
 * goes through that door, and its caller marks the result as approximate.
 *
 * Q is always normalized (d > 0, gcd(|n|, d) = 1), so structural equality is value equality.
 * BigInt literals (1n) need an ES2020 target and tsconfig targets ES2017, so the constants are built
 * with BigInt(...).
 */

export type Q = { readonly n: bigint; readonly d: bigint };
/** A Gaussian rational re + i im. */
export type CQ = { readonly re: Q; readonly im: Q };

const B0 = BigInt(0);
const B1 = BigInt(1);
const B2 = BigInt(2);
const B10 = BigInt(10);

/** gcd of |a| and |b|; gcd(0, 0) = 0. */
export function gcdBig(a: bigint, b: bigint): bigint {
  let x = a < B0 ? -a : a;
  let y = b < B0 ? -b : b;
  while (y !== B0) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

function make(n: bigint, d: bigint): Q {
  if (d === B0) throw new RangeError("Rational with zero denominator.");
  if (d < B0) {
    n = -n;
    d = -d;
  }
  const g = gcdBig(n, d);
  return g === B1 ? { n, d } : { n: n / g, d: d / g };
}

function big(v: number | bigint): bigint {
  if (typeof v === "bigint") return v;
  if (!Number.isSafeInteger(v)) throw new RangeError(`Not a safe integer: ${v}`);
  return BigInt(v);
}

/** The rational n/d from integers (numbers must be safe integers). */
export function q(n: number | bigint, d: number | bigint = 1): Q {
  return make(big(n), big(d));
}

export const ZERO: Q = q(0);
export const ONE: Q = q(1);
export const TWO: Q = q(2);

/**
 * A finite double as the shortest decimal that round-trips ("0.1" -> 1/10, "-2.5e-7" ->
 * -1/4000000, "1.5e+21" -> 1500000000000000000000). null for NaN and infinities.
 */
export function fromNumber(v: number): Q | null {
  if (!Number.isFinite(v)) return null;
  const text = String(v);
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(text);
  if (!m) return null;
  const sign = m[1];
  const digits = m[2] + (m[3] ?? "");
  const exponent = Number(m[4] ?? "0") - (m[3] ?? "").length;
  let n = BigInt(digits);
  let d = B1;
  if (exponent >= 0) n *= B10 ** BigInt(exponent);
  else d = B10 ** BigInt(-exponent);
  return make(sign ? -n : n, d);
}

export function isZero(a: Q): boolean {
  return a.n === B0;
}
export function isOne(a: Q): boolean {
  return a.n === B1 && a.d === B1;
}
export function isInteger(a: Q): boolean {
  return a.d === B1;
}
export function sign(a: Q): -1 | 0 | 1 {
  return a.n === B0 ? 0 : a.n < B0 ? -1 : 1;
}
export function equals(a: Q, b: Q): boolean {
  return a.n === b.n && a.d === b.d;
}
/** -1, 0 or 1 as a < b, a = b, a > b. */
export function cmp(a: Q, b: Q): -1 | 0 | 1 {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l === r ? 0 : l < r ? -1 : 1;
}
export function add(a: Q, b: Q): Q {
  if (a.n === B0) return b;
  if (b.n === B0) return a;
  if (a.d === b.d) return make(a.n + b.n, a.d);
  return make(a.n * b.d + b.n * a.d, a.d * b.d);
}
export function sub(a: Q, b: Q): Q {
  return add(a, neg(b));
}
export function neg(a: Q): Q {
  return a.n === B0 ? a : { n: -a.n, d: a.d };
}
/**
 * a·b with the common factors cancelled CROSSWISE (gcd(a.n, b.d) and gcd(b.n, a.d)) before multiplying:
 * both operands are normalized, so the result is normalized without a gcd of the full product, which
 * on numbers of thousands of digits is what costs (a factor 1 costs nothing at all).
 */
export function mul(a: Q, b: Q): Q {
  if (a.n === B0 || b.n === B0) return ZERO;
  if (a.n === B1 && a.d === B1) return b;
  if (b.n === B1 && b.d === B1) return a;
  const g1 = gcdBig(a.n, b.d);
  const g2 = gcdBig(b.n, a.d);
  return { n: (a.n / g1) * (b.n / g2), d: (a.d / g2) * (b.d / g1) };
}
/** a / b; throws RangeError when b = 0. */
export function div(a: Q, b: Q): Q {
  if (b.n === B0) throw new RangeError("Division by zero.");
  // 1/b is normalized as it stands (the sign moved to the numerator).
  return mul(a, b.n < B0 ? { n: -b.d, d: -b.n } : { n: b.d, d: b.n });
}
export function inv(a: Q): Q {
  return div(ONE, a);
}
export function abs(a: Q): Q {
  return a.n < B0 ? neg(a) : a;
}
/** a^k for an integer k (k < 0 needs a != 0). */
export function powInt(a: Q, k: number): Q {
  if (!Number.isInteger(k)) throw new RangeError("Non-integer exponent.");
  if (k < 0) return inv(powInt(a, -k));
  const e = BigInt(k);
  return make(a.n ** e, a.d ** e);
}
/** The integer part toward -infinity. */
export function floor(a: Q): Q {
  const t = a.n / a.d; // BigInt division truncates toward zero
  return q(a.n < B0 && t * a.d !== a.n ? t - B1 : t);
}
export function ceil(a: Q): Q {
  return neg(floor(neg(a)));
}
/** Math.round's rule (a half rounds toward +infinity): floor(a + 1/2). */
export function round(a: Q): Q {
  return floor(add(a, q(1, 2)));
}
export function min(a: Q, b: Q): Q {
  return cmp(a, b) <= 0 ? a : b;
}
export function max(a: Q, b: Q): Q {
  return cmp(a, b) >= 0 ? a : b;
}

/** Bits of |v| (from its hex digits: a quarter of the characters of toString(2), on numbers of thousands of digits). */
function bitLength(v: bigint): number {
  if (v === B0) return 0;
  const hex = (v < B0 ? -v : v).toString(16);
  return (hex.length - 1) * 4 + parseInt(hex[0], 16).toString(2).length;
}

/** The nearest double (within an ulp or two), also for numerators and denominators beyond 2^1024. */
export function toNumber(a: Q): number {
  if (a.n === B0) return 0;
  const negative = a.n < B0;
  const n = negative ? -a.n : a.n;
  const sn = Math.max(0, bitLength(n) - 60);
  const sd = Math.max(0, bitLength(a.d) - 60);
  const k = sn - sd;
  const half = Math.trunc(k / 2);
  const v = (Number(n >> BigInt(sn)) / Number(a.d >> BigInt(sd))) * 2 ** half * 2 ** (k - half);
  return negative ? -v : v;
}

/** Decimal digits of the numerator plus those of the denominator: the size a display rule looks at. */
export function digitCount(a: Q): number {
  const n = a.n < B0 ? -a.n : a.n;
  return n.toString().length + a.d.toString().length;
}

/** Hex digits of the numerator plus those of the denominator: the size the exact-arithmetic caps look at. */
export function hexSize(a: Q): number {
  return (a.n < B0 ? -a.n : a.n).toString(16).length + a.d.toString(16).length;
}

/** ln|v| of a non-zero BigInt, to about 1e-15 relative, also far beyond the double range (10^400). */
export function bigLn(v: bigint): number {
  const a = v < B0 ? -v : v;
  const s = a.toString(16);
  if (s.length <= 13) return Math.log(parseInt(s, 16));
  return Math.log(parseInt(s.slice(0, 13), 16)) + (s.length - 13) * 4 * Math.LN2;
}

/** ln|a| of a non-zero rational, beyond the double range too. */
export function lnAbs(a: Q): number {
  return bigLn(a.n) - bigLn(a.d);
}

/**
 * The exact arithmetic of an expansion or a solution formula would outgrow what can be computed here
 * (the digits of t0 times the degree, a coefficient beyond the digit cap): the caller says so in words.
 */
export class SeriesTooExpensive extends RangeError {
  constructor() {
    super("The exact computation is too expensive here.");
    this.name = "SeriesTooExpensive";
  }
}

/**
 * floor(sqrt(v)) of a non-negative BigInt. Newton's iteration from ABOVE (2^ceil(bits/2) >= sqrt(v))
 * decreases monotonically to the floor in O(log bits) steps. A floating-point start is not used: for
 * v beyond 2^53 it may land below the root, and creeping up by ones from there never ends.
 */
export function isqrt(v: bigint): bigint {
  if (v < B0) throw new RangeError("Square root of a negative integer.");
  if (v < B2) return v;
  let x = B1 << BigInt(Math.ceil(bitLength(v) / 2));
  for (;;) {
    const y = (x + v / x) / B2;
    if (y >= x) return x;
    x = y;
  }
}

/** The exact rational square root of a non-negative a, or null when a is not the square of a rational. */
export function sqrtExact(a: Q): Q | null {
  if (a.n < B0) return null;
  const rn = isqrt(a.n);
  const rd = isqrt(a.d);
  return rn * rn === a.n && rd * rd === a.d ? make(rn, rd) : null;
}

// ---- Gaussian rationals --------------------------------------------------------------------

export const CZERO: CQ = { re: ZERO, im: ZERO };
export const CONE: CQ = { re: ONE, im: ZERO };
export const CI: CQ = { re: ZERO, im: ONE };

export function cq(re: Q, im: Q = ZERO): CQ {
  return { re, im };
}
export function cIsZero(a: CQ): boolean {
  return isZero(a.re) && isZero(a.im);
}
export function cIsReal(a: CQ): boolean {
  return isZero(a.im);
}
export function cEquals(a: CQ, b: CQ): boolean {
  return equals(a.re, b.re) && equals(a.im, b.im);
}
export function cadd(a: CQ, b: CQ): CQ {
  return { re: add(a.re, b.re), im: add(a.im, b.im) };
}
export function csub(a: CQ, b: CQ): CQ {
  return { re: sub(a.re, b.re), im: sub(a.im, b.im) };
}
export function cneg(a: CQ): CQ {
  return { re: neg(a.re), im: neg(a.im) };
}
export function cconj(a: CQ): CQ {
  return { re: a.re, im: neg(a.im) };
}
export function cmul(a: CQ, b: CQ): CQ {
  return { re: sub(mul(a.re, b.re), mul(a.im, b.im)), im: add(mul(a.re, b.im), mul(a.im, b.re)) };
}
export function cscale(a: CQ, s: Q): CQ {
  return { re: mul(a.re, s), im: mul(a.im, s) };
}
/** a / b; throws RangeError when b = 0. */
export function cdiv(a: CQ, b: CQ): CQ {
  const den = add(mul(b.re, b.re), mul(b.im, b.im));
  if (isZero(den)) throw new RangeError("Division by zero.");
  const num = cmul(a, cconj(b));
  return { re: div(num.re, den), im: div(num.im, den) };
}
/** A stable text key of a Gaussian rational (the map key of a quasi-polynomial's exponent). */
export function cKey(a: CQ): string {
  return `${a.re.n}/${a.re.d}|${a.im.n}/${a.im.d}`;
}
