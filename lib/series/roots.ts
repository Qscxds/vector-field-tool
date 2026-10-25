/**
 * Roots of real polynomials with rational coefficients (round 12, lib/series), for the radius of
 * convergence of a power series, the factored display of a recurrence and the indicial equation.
 *
 * Exact wherever the algebra allows it: a square-free decomposition (Yun) gives the multiplicities,
 * linear factors and quadratics are solved in closed form (a quadratic without rational roots keeps
 * its discriminant, so its roots print as center +- scale * sqrt(disc) and the distance of a complex
 * pair from a real point is an exact square root), and rational roots of higher factors are found by
 * candidates that are VERIFIED by exact evaluation. What is left of degree >= 3 without rational roots
 * is located numerically (Durand-Kerner on the polynomial scaled by its Fujiwara bound, so no term
 * overflows) and kept only when every root passes a residual test (backward stability); otherwise those roots
 * are reported as UNLOCATED, never as a wrong point. A located numeric root also carries a PROVEN
 * inclusion radius (`inclusionRadii`): backward stability alone does not bound how far a root of an
 * ill-conditioned polynomial moved, so a distance is only claimed down to what the radius certifies.
 * `rootFreeRadius` gives a guaranteed lower bound on the distance from a point to every root.
 *
 * Every loop takes an optional checkpoint (a caller's wall-clock budget; lib stays clock-free).
 */
import { pderiv, pdeg, pdivmod, pevalNumber, pevalQ, pexactDiv, pgcd, pIsZero, plead, type Poly, pmonic, psub, ptaylorShift, trim } from "./poly";
import { add, bigLn, div, gcdBig, isZero, lnAbs, mul, neg, ONE, q, type Q, sqrtExact, sub, toNumber } from "./rational";

export type RootForm =
  | { readonly kind: "rational"; readonly value: Q; readonly multiplicity: number }
  /**
   * The pair center +- scale * sqrt(disc); disc is not the square of a rational; disc < 0 is a complex
   * pair. `branch` (a radius's nearest point): only center + branch * scale * sqrt(disc).
   */
  | { readonly kind: "quadratic"; readonly center: Q; readonly scale: Q; readonly disc: Q; readonly multiplicity: number; readonly branch?: 1 | -1 }
  /**
   * A root located in floating point. `error`: every root of its factor lies within `error` of one of
   * the factor's approximations (`inclusionRadii`), so the distance from a point to the factor's
   * roots is at least min over its approximations of (|z - point| - error).
   */
  | { readonly kind: "numeric"; readonly re: number; readonly im: number; readonly error: number; readonly multiplicity: number }
  /** `count` roots of a factor the numerical search could not locate reliably. */
  | { readonly kind: "unlocated"; readonly count: number; readonly multiplicity: number };

type Checkpoint = (() => void) | undefined;

/** Square-free factors f_i with multiplicity i (Yun's algorithm over Q); p must be non-constant. */
export function squareFree(p: Poly, checkpoint?: () => void): { factor: Poly; multiplicity: number }[] {
  const out: { factor: Poly; multiplicity: number }[] = [];
  const dp = pderiv(p);
  const a0 = pgcd(p, dp, checkpoint);
  let b = pexactDiv(p, a0);
  let c = pexactDiv(dp, a0);
  let d = psub(c, pderiv(b));
  let i = 1;
  while (pdeg(b) >= 1) {
    checkpoint?.();
    const a = pgcd(b, d, checkpoint);
    if (pdeg(a) >= 1) out.push({ factor: a, multiplicity: i });
    b = pexactDiv(b, a);
    c = pexactDiv(d, a);
    d = psub(c, pderiv(b));
    i++;
    if (i > 200) break;
  }
  return out;
}

/**
 * Complex roots of a polynomial with double coefficients (low to high), Durand-Kerner on the
 * polynomial scaled by its Fujiwara bound B (w = z / B, all roots in |w| <= 1), deterministic.
 * `ok` is true only when every root is finite and passes the residual test |p(w)| <= 1e-8 * sum |c_k| |w|^k
 * (backward stability; the iteration stops on a per-root change below its rounding level or after 5000 rounds).
 */
export function numericRoots(coefficients: readonly number[], checkpoint?: () => void): { roots: { re: number; im: number }[]; ok: boolean } {
  const n = coefficients.length - 1;
  if (n < 1) return { roots: [], ok: true };
  const lead = coefficients[n];
  if (!Number.isFinite(lead) || lead === 0 || coefficients.some((v) => !Number.isFinite(v))) return { roots: [], ok: false };
  // log of the monic coefficients' magnitudes; Fujiwara: |z| <= 2 max |a_{n-k}|^(1/k).
  const logA = coefficients.map((v) => (v === 0 ? -Infinity : Math.log(Math.abs(v)) - Math.log(Math.abs(lead))));
  let logB = -Infinity;
  for (let k = 1; k <= n; k++) {
    const i = n - k;
    const candidate = i === 0 ? (logA[0] - Math.log(2)) / n : logA[i] / k;
    logB = Math.max(logB, candidate);
  }
  if (!Number.isFinite(logB)) logB = 0;
  logB += Math.log(2);
  // c_k = a_k / B^(n - k), computed in logs so nothing overflows; c_n = 1.
  const c = coefficients.map((v, k) => (v === 0 ? 0 : Math.sign(v) * Math.sign(lead) * Math.exp(logA[k] - (n - k) * logB)));
  const zr: number[] = [];
  const zi: number[] = [];
  for (let k = 0; k < n; k++) {
    const angle = (2 * Math.PI * k) / n + 0.4;
    zr.push(0.9 * Math.cos(angle));
    zi.push(0.9 * Math.sin(angle));
  }
  const evalAt = (wr: number, wi: number) => {
    let pr = 1;
    let pi = 0;
    let size = 1;
    const mod = Math.hypot(wr, wi);
    let power = 1;
    for (let k = n - 1; k >= 0; k--) {
      const nr = pr * wr - pi * wi + c[k];
      pi = pr * wi + pi * wr;
      pr = nr;
    }
    for (let k = 0; k <= n; k++) {
      size += Math.abs(c[k]) * power;
      power *= mod;
    }
    return { pr, pi, size };
  };
  for (let iter = 0; iter < 5000; iter++) {
    if (iter % 50 === 0) checkpoint?.();
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const { pr, pi } = evalAt(zr[i], zi[i]);
      let dr = 1;
      let di = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const er = zr[i] - zr[j];
        const ei = zi[i] - zi[j];
        const nr = dr * er - di * ei;
        di = dr * ei + di * er;
        dr = nr;
      }
      const den = dr * dr + di * di;
      if (den === 0 || !Number.isFinite(den)) continue;
      const qr = (pr * dr + pi * di) / den;
      const qi = (pi * dr - pr * di) / den;
      zr[i] -= qr;
      zi[i] -= qi;
      // Relative to the root, with an absolute floor in the scaled plane (every root has |w| <= 1 and
      // the coefficients are O(1), so 1e-15 is the rounding level there): a small root of a polynomial
      // whose roots are widely spread cannot get a better relative accuracy than that floor allows.
      worst = Math.max(worst, Math.hypot(qr, qi) / (1e-13 * Math.hypot(zr[i], zi[i]) + 1e-15));
    }
    if (worst <= 1) break;
  }
  const scale = Math.exp(logB);
  // Accepted by BACKWARD STABILITY: every root is an exact root of a polynomial within 1e-8 (relative,
  // term by term) of the given one. Whether the iteration's last steps settled below its stopping test
  // does not matter (a far pair jitters at the rounding level for ever); a root that fails the residual
  // test, or a non-finite one, makes the whole set unreliable.
  let ok = true;
  const roots = zr.map((re, i) => {
    const { pr, pi, size } = evalAt(re, zi[i]);
    if (!(Math.hypot(pr, pi) <= 1e-8 * size)) ok = false;
    return { re: re * scale, im: zi[i] * scale };
  });
  if (roots.some((z) => !Number.isFinite(z.re) || !Number.isFinite(z.im))) ok = false;
  return { roots, ok };
}

/** The exact binary value of a finite double: x = m * 2^e. */
function dyadic(x: number): { m: bigint; e: number } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const exponentBits = (hi >>> 20) & 0x7ff;
  const fraction = BigInt(hi & 0xfffff) * BigInt(4294967296) + BigInt(lo);
  const negative = hi >>> 31 === 1;
  const m = exponentBits === 0 ? fraction : fraction + (BigInt(1) << BigInt(52));
  return { m: negative ? -m : m, e: exponentBits === 0 ? -1074 : exponentBits - 1075 };
}

type GaussInt = { re: bigint; im: bigint };
function gmul(a: GaussInt, b: GaussInt): GaussInt {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function gNormLn(a: GaussInt): number {
  const n = a.re * a.re + a.im * a.im;
  return n === BigInt(0) ? -Infinity : bigLn(n);
}

/**
 * PROVEN inclusion radii for approximations z_1..z_n of the n roots of a square-free p (Weierstrass /
 * Braess-Hadeler): for monic p, with W_i = p(z_i) / prod_{j != i} (z_i - z_j), every root of p lies in
 * some disc |z - z_i| <= n |W_i|. (Lagrange: p(z) = prod (z - z_j) (1 + sum_i W_i / (z - z_i)), so
 * p(z) = 0 makes sum |W_i| / |z - z_i| >= 1.) The W_i are computed EXACTLY in Gaussian integers from
 * the binary values of the doubles; only the final conversion of |W_i| rounds, and the radius is
 * inflated by 1e-12 for it. null when two approximations coincide or a value is not finite.
 */
export function inclusionRadii(p: Poly, roots: readonly { re: number; im: number }[], checkpoint?: () => void): number[] | null {
  const n = pdeg(p);
  if (n < 1 || roots.length !== n) return null;
  if (roots.some((z) => !Number.isFinite(z.re) || !Number.isFinite(z.im))) return null;
  const parts = roots.map((z) => ({ re: z.re === 0 ? null : dyadic(z.re), im: z.im === 0 ? null : dyadic(z.im) }));
  let E = 0;
  for (const z of parts) {
    if (z.re) E = Math.min(E, z.re.e);
    if (z.im) E = Math.min(E, z.im.e);
  }
  // z_i = Z_i / S with S = 2^-E and Gaussian integers Z_i.
  const lift = (d: { m: bigint; e: number } | null) => (d === null ? BigInt(0) : d.m << BigInt(d.e - E));
  const Z: GaussInt[] = parts.map((z) => ({ re: lift(z.re), im: lift(z.im) }));
  const S = BigInt(1) << BigInt(-E);
  const lnS = -E * Math.LN2;
  const R = integerCoefficients(p);
  const lnLead = bigLn(R[n]);
  const Spow: bigint[] = [BigInt(1)];
  for (let k = 1; k <= n; k++) Spow.push(Spow[k - 1] * S);
  const radii: number[] = [];
  for (let i = 0; i < n; i++) {
    checkpoint?.();
    // N_i = S^n R(z_i) = sum_k R_k Z_i^k S^(n - k), by Horner.
    let acc: GaussInt = { re: R[n], im: BigInt(0) };
    for (let k = n - 1; k >= 0; k--) {
      acc = gmul(acc, Z[i]);
      acc = { re: acc.re + R[k] * Spow[n - k], im: acc.im };
    }
    // M_i = S^(n-1) prod_{j != i} (z_i - z_j).
    let M: GaussInt = { re: BigInt(1), im: BigInt(0) };
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      M = gmul(M, { re: Z[i].re - Z[j].re, im: Z[i].im - Z[j].im });
    }
    const lnM = gNormLn(M);
    if (lnM === -Infinity) return null;
    const lnN = gNormLn(acc);
    // p = R / R_n, so W_i = (N_i / S^n) / (R_n M_i / S^(n-1)) = N_i / (R_n S M_i).
    const lnW = lnN === -Infinity ? -Infinity : lnN / 2 - lnLead - lnS - lnM / 2;
    radii.push(lnW === -Infinity ? 0 : n * Math.exp(lnW) * (1 + 1e-12));
  }
  return radii;
}

/** Positive divisors of a positive BigInt up to 1e12 (null beyond: too many to try). */
function divisors(v: bigint, checkpoint: Checkpoint): bigint[] | null {
  if (v > BigInt(1e12)) return null;
  const n = Number(v);
  const small: number[] = [];
  const large: number[] = [];
  for (let d = 1; d * d <= n; d++) {
    if (d % 100000 === 0) checkpoint?.();
    if (n % d === 0) {
      small.push(d);
      if (d * d !== n) large.push(n / d);
    }
  }
  return [...small, ...large.reverse()].map((d) => BigInt(d));
}

/** The primitive integer multiple of p (denominators cleared, content removed). */
function integerCoefficients(p: Poly): bigint[] {
  let lcm = BigInt(1);
  for (const c of p) lcm = (lcm / gcdBig(lcm, c.d)) * c.d;
  const ints = p.map((c) => (c.n * lcm) / c.d);
  let content = BigInt(0);
  for (const v of ints) content = gcdBig(content, v);
  return content === BigInt(0) ? ints : ints.map((v) => v / content);
}

/** The roots of a square-free polynomial: rational ones exact, a remaining quadratic exact, the rest numeric or unlocated. */
function simpleRoots(f: Poly, multiplicity: number, checkpoint: Checkpoint): RootForm[] {
  const out: RootForm[] = [];
  let rest = pmonic(f);
  if (pdeg(rest) >= 3) {
    const { roots: approx } = numericRoots(rest.map(toNumber), checkpoint);
    const ints = integerCoefficients(rest);
    const lead = ints[ints.length - 1] < BigInt(0) ? -ints[ints.length - 1] : ints[ints.length - 1];
    const constant = ints[0] < BigInt(0) ? -ints[0] : ints[0];
    const dens = divisors(lead, checkpoint);
    for (const z of approx) {
      if (pdeg(rest) < 3) break;
      if (!Number.isFinite(z.re) || Math.abs(z.im) > 1e-6 * (1 + Math.abs(z.re))) continue;
      for (const d of dens ?? [BigInt(1)]) {
        checkpoint?.();
        const num = Math.round(z.re * Number(d));
        if (!Number.isSafeInteger(num)) continue;
        // Rational root theorem: the numerator divides the constant term (0 only when it is 0).
        if (num === 0 ? constant !== BigInt(0) : constant % BigInt(Math.abs(num)) !== BigInt(0)) continue;
        const candidate = q(num, d);
        // A cheap float test before the exact evaluation.
        const v = toNumber(candidate);
        const size = rest.reduce((s, c, k) => s + Math.abs(toNumber(c)) * Math.abs(v) ** k, 0);
        if (!(Math.abs(pevalNumber(rest, v)) <= 1e-6 * size)) continue;
        if (isZero(pevalQ(rest, candidate))) {
          out.push({ kind: "rational", value: candidate, multiplicity });
          rest = pdivmod(rest, trim([neg(candidate), ONE]), checkpoint).quotient;
          break;
        }
      }
    }
  }
  const deg = pdeg(rest);
  if (deg === 1) {
    out.push({ kind: "rational", value: neg(div(rest[0], rest[1])), multiplicity });
  } else if (deg === 2) {
    const [c0, b, a] = rest;
    const disc = sub(mul(b, b), mul(q(4), mul(a, c0)));
    const center = neg(div(b, mul(q(2), a)));
    const scale = div(ONE, mul(q(2), a));
    const root = sqrtExact(disc);
    if (root !== null) {
      out.push({ kind: "rational", value: add(center, mul(scale, root)), multiplicity });
      out.push({ kind: "rational", value: sub(center, mul(scale, root)), multiplicity });
    } else {
      out.push({ kind: "quadratic", center, scale, disc, multiplicity });
    }
  } else if (deg >= 3) {
    const { roots, ok } = numericRoots(rest.map(toNumber), checkpoint);
    const radii = ok ? inclusionRadii(rest, roots, checkpoint) : null;
    if (radii) roots.forEach((z, i) => out.push({ kind: "numeric", re: z.re, im: z.im, error: radii[i], multiplicity }));
    else out.push({ kind: "unlocated", count: deg, multiplicity });
  }
  return out;
}

/** All roots of a non-zero polynomial with their multiplicities (a constant has none). */
export function rootsOf(p: Poly, checkpoint?: () => void): RootForm[] {
  if (pIsZero(p) || pdeg(p) < 1) return [];
  const out: RootForm[] = [];
  for (const { factor, multiplicity } of squareFree(p, checkpoint)) out.push(...simpleRoots(factor, multiplicity, checkpoint));
  return out.sort(compareRoots);
}

function realPart(r: RootForm): number {
  return r.kind === "rational" ? toNumber(r.value) : r.kind === "quadratic" ? toNumber(r.center) : r.kind === "numeric" ? r.re : Infinity;
}
function compareRoots(a: RootForm, b: RootForm): number {
  return realPart(a) - realPart(b);
}

/**
 * `value`: the distance (an estimate for a numeric root; Infinity beyond the double range); `ln`: its
 * natural logarithm (finite also beyond the double range, the quantity compared); `lower`: a PROVEN
 * lower bound on it; `squared`: its exact square when known.
 */
export type Distance = { value: number; ln: number; squared: Q | null; lower: number };

/** ln(e^a + e^b) without overflow. */
function lnSum(a: number, b: number): number {
  const top = Math.max(a, b);
  return top === -Infinity ? -Infinity : top + Math.log(Math.exp(a - top) + Math.exp(b - top));
}
function fromLn(ln: number, squared: Q | null, lowerFactor = 1 - 1e-14): Distance {
  const value = Math.exp(ln);
  return { value, ln, squared, lower: value * lowerFactor };
}

/** Distances from a real center to the root(s) a form stands for (two for a pair, none for unlocated roots). */
export function rootDistances(r: RootForm, center: Q): Distance[] {
  // Every distance is computed from exact rationals through logarithms (lnAbs), so it is right to full
  // relative accuracy and also beyond the double range (a singular point at 10^400 is not "none").
  if (r.kind === "rational") {
    const d = sub(r.value, center);
    return isZero(d) ? [fromLn(-Infinity, d)] : [fromLn(lnAbs(d), mul(d, d))];
  }
  if (r.kind === "quadratic") {
    const off = sub(r.center, center);
    const w2 = mul(mul(r.scale, r.scale), r.disc.n < BigInt(0) ? neg(r.disc) : r.disc);
    if (r.disc.n < BigInt(0)) {
      const sq = add(mul(off, off), w2);
      const d = fromLn(lnAbs(sq) / 2, sq);
      return [d, d];
    }
    // A real pair center ± w, w = |s|√disc: from its own center the distance w is an exact square root.
    if (isZero(off)) {
      const d = fromLn(lnAbs(w2) / 2, w2);
      return [d, d];
    }
    // Off its center: the far root at |o| + w; the near one at |o − w| = |o² − w²| / (|o| + w), with an
    // EXACT numerator (no cancellation: t0 = 1.4142135623730951 is 5.1e-17 from √2, not 0).
    const lnO = lnAbs(off);
    const lnW = lnAbs(w2) / 2;
    const lnFar = lnSum(lnO, lnW);
    const lnNear = lnAbs(sub(mul(off, off), w2)) - lnFar;
    const far = fromLn(lnFar, null);
    const near = fromLn(lnNear, null, 1 - 1e-13);
    // Branch +1 is center + scale√disc: it is the near root when off and scale have opposite signs.
    const plusIsNear = (off.n < BigInt(0)) !== (r.scale.n < BigInt(0));
    return plusIsNear ? [near, far] : [far, near];
  }
  if (r.kind === "numeric") {
    const c = toNumber(center);
    const v = Math.hypot(r.re - c, r.im);
    // The centre as a double is off by a few ulps of |t0| (and the subtraction by an ulp of the larger
    // operand): a proven distance subtracts that too (t0 = 1.259921049894 is 8.7316e-13 from the cube
    // root of 2, not the 8.7322e-13 its double gives).
    const slack = 4 * Number.EPSILON * Math.max(Math.abs(c), Math.abs(r.re), Math.abs(r.im));
    return [{ value: v, ln: Math.log(v), squared: null, lower: Math.max(0, v * (1 - 1e-14) - r.error - slack) }];
  }
  return [];
}

/** True when some roots could not be located (their distance is unknown). */
export function hasUnlocated(roots: readonly RootForm[]): boolean {
  return roots.some((r) => r.kind === "unlocated");
}

/** The proven lower bound on the distance from the center to every located root (Infinity without one). */
export function certifiedDistance(roots: readonly RootForm[], center: Q): number {
  let best = Infinity;
  for (const r of roots) for (const d of rootDistances(r, center)) best = Math.min(best, d.lower);
  return best;
}

/** The smallest distance from the center to a located root (compared by logarithm, never skipped), with the exact square when known; null without one. */
export function nearestDistance(roots: readonly RootForm[], center: Q): Distance | null {
  let best: Distance | null = null;
  for (const r of roots) {
    for (const d of rootDistances(r, center)) {
      if (Number.isNaN(d.ln)) continue;
      if (best === null || d.ln < best.ln || (d.ln === best.ln && best.squared === null && d.squared !== null)) best = d;
    }
  }
  return best;
}

/**
 * A guaranteed lower bound on the distance from `center` to every root of p (p(center) != 0): with
 * p(center + s) = sum b_k s^k, every root has |s| >= rho, the positive root of
 * |b_0| = sum_{k>=1} |b_k| rho^k (if |s| < rho then |sum_{k>=1} b_k s^k| < |b_0|). Solved for ln rho
 * by bisection with every |b_k| taken as its exact logarithm, so a coefficient beyond the double range
 * (2·10^-400) still counts; the value returned is a slight underestimate, never an overestimate. 0
 * when p(center) = 0.
 */
export function rootFreeRadius(p: Poly, center: Q, checkpoint?: () => void): number {
  return Math.exp(rootFreeRadiusLn(p, center, checkpoint));
}

/** The natural logarithm of rootFreeRadius (finite also when the radius is beyond the double range). */
export function rootFreeRadiusLn(p: Poly, center: Q, checkpoint?: () => void): number {
  const shifted = ptaylorShift(p, center, checkpoint);
  const b0 = shifted[0];
  if (b0 === undefined || isZero(b0)) return -Infinity;
  const L0 = lnAbs(b0);
  const terms = shifted.map((c, k) => ({ k, L: isZero(c) ? -Infinity : lnAbs(c) })).filter((x) => x.k >= 1 && x.L > -Infinity);
  if (terms.length === 0) return Infinity;
  // g(u) = ln sum_k |b_k| e^(k u) - ln |b_0|, increasing in u = ln rho.
  const g = (u: number) => {
    let top = -Infinity;
    for (const t of terms) top = Math.max(top, t.L + t.k * u);
    let s = 0;
    for (const t of terms) s += Math.exp(t.L + t.k * u - top);
    return top + Math.log(s) - L0;
  };
  // g(hi) >= 0 (the largest single term reaches |b_0|), g(lo) <= 0 (every term at most |b_0| / count).
  let hi = Math.min(...terms.map((t) => (L0 - t.L) / t.k));
  let lo = Math.min(...terms.map((t) => (L0 - t.L - Math.log(terms.length)) / t.k));
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) < 0) lo = mid;
    else hi = mid;
  }
  return lo + Math.log(1 - 1e-12);
}
