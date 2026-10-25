/**
 * Power-series solutions of linear equations with POLYNOMIAL coefficients about an ordinary point
 * (round 12, lib/series): the method of a differential-equations course, step by step, exactly.
 *
 *     P_r(t) u^(r) + ... + P_0(t) u = G(t),   u(t) = sum_{k >= 0} a_k (t - t0)^k,   r = 1 or 2.
 *
 * With s = t - t0 every coefficient is rewritten in powers of s (Taylor shift, exact). A term
 * c s^m u^(j) contributes  sum_{n >= m} c (n + j - m)_j a_{n+j-m} s^n  after the index shift
 * n = k - j + m, where (x)_j = x (x - 1) ... (x - j + 1) is the falling factorial; the index offset
 * of the term is delta = j - m. Collecting s^n gives, for every n >= 0,
 *
 *     sum_delta Q_delta(n) a_{n+delta} = g_n,     Q_delta(n) = sum_{terms with j - m = delta} c (n + delta)_j,
 *
 * where a term with m > n contributes nothing (its falling factorial vanishes, or its index is
 * negative and a_k = 0 for k < 0). The point is ORDINARY when P_r(t0) != 0; then delta = r occurs only
 * for the term (j = r, m = 0) and Q_r(n) = P_r(t0) (n + r)...(n + 1) never vanishes, which is the
 * recurrence  a_{n+r} = (g_n - sum_{delta < r} Q_delta(n) a_{n+delta}) / Q_r(n).
 *
 * Coefficients are vectors over (a_0, ..., a_{r-1}, 1): the free initial coefficients and the
 * right-hand side, so the general solution splits as u = a_0 u_1 + a_1 u_2 + u_p exactly (the
 * textbook's "the series splits into the part with a_0 and the part with a_1"). A basis series is
 * declared a POLYNOMIAL only when proven: in the region where the recurrence is homogeneous, a window
 * of r - delta_min consecutive zero coefficients forces every later one to be zero.
 *
 * The radius of convergence is reported as the theorem's LOWER BOUND: the distance from t0 to the
 * nearest complex zero of P_r that is not cancelled in every quotient P_j / P_r and G / P_r. At a
 * singular point (P_r(t0) = 0) the ordinary method does not apply; the result says whether the point
 * is a regular singular point and gives the indicial equation of the Frobenius method.
 */
import type { LinearEquation } from "./equation";
import {
  fallingFactorial, padd, pcoef, pdeg, pdivmod, pevalQ, pexactDiv, pgcd, pIsZero, pmul, pneg, PONE, type Poly, pscale, ptaylorShift, PZERO, trim,
} from "./poly";
import { asPolynomial } from "./quasi";
import { add, cmp, div, hexSize, isZero, mul, neg, ONE, q, type Q, SeriesTooExpensive, sub, toNumber, ZERO } from "./rational";
import { certifiedDistance, hasUnlocated, nearestDistance, rootDistances, rootFreeRadiusLn, rootsOf, type Distance, type RootForm } from "./roots";

/** The most terms (powers 0..N) a caller may show. */
export const MAX_SHOWN_TERMS = 30;
/** Coefficients computed internally: enough to prove that a basis series of degree < ~55 is a polynomial. */
export const COMPUTED_TERMS = 60;
/** Coefficients computed beyond the shown power, so a basis series that stops soon after it can still be proven a polynomial. */
export const TERMINATION_MARGIN = 20;
/**
 * A coefficient whose numerator and denominator together exceed this many HEX digits (about 1200
 * decimal digits) ends the computation there: exact fractions about an awkward center (t0 = 0.123456789
 * with a coefficient of degree 10) grow by ~90 digits per power, and every operation pays a gcd on
 * numbers that size. What was computed is exact; the derivation says where it stopped.
 */
export const MAX_COEFFICIENT_HEX_DIGITS = 1000;

/** What a caller may bound: the highest power it will show, and a wall-clock budget (lib stays clock-free). */
export type SeriesOptions = { readonly terms?: number; readonly checkpoint?: () => void };

/** How many coefficients to compute for a caller who shows powers through `terms`. */
function computeCount(opts: SeriesOptions): number {
  return opts.terms === undefined ? COMPUTED_TERMS : Math.min(COMPUTED_TERMS, Math.max(1, opts.terms) + 1 + TERMINATION_MARGIN);
}

export type PolynomialOde = { readonly order: 1 | 2; readonly P: readonly Poly[]; readonly G: Poly };

export type NotPolynomial = { readonly which: "coefficient"; readonly order: number } | { readonly which: "rightHandSide" };

/** The equation with polynomial coefficients and right-hand side, or which part is not a polynomial in t. */
export function polynomialOde(eq: LinearEquation): { ok: true; ode: PolynomialOde } | { ok: false; reason: NotPolynomial } {
  const P: Poly[] = [];
  for (let j = 0; j <= eq.order; j++) {
    const p = asPolynomial(eq.P[j]);
    if (p === null) return { ok: false, reason: { which: "coefficient", order: j } };
    P.push(p);
  }
  const G = asPolynomial(eq.G);
  if (G === null) return { ok: false, reason: { which: "rightHandSide" } };
  return { ok: true, ode: { order: eq.order, P, G } };
}

/** One term c s^m u^(j) of the equation in powers of s = t - t0; its series starts at n = m after the shift. */
export type SeriesTerm = { readonly j: number; readonly m: number; readonly c: Q; readonly delta: number };

/** Components over (a_0, ..., a_{r-1}, 1). */
export type CoefficientVector = readonly Q[];

/** The equation of the coefficient of s^n for a small n where not every term has started yet. */
export type LowEquation = {
  readonly n: number;
  /** The coefficient of a_{n+delta} for each index offset present (delta descending). */
  readonly parts: readonly { readonly delta: number; readonly value: Q }[];
  /** g_n, the coefficient of s^n of the right-hand side. */
  readonly rhs: Q;
  readonly solvedIndex: number;
  readonly solved: CoefficientVector;
};

export type Recurrence = {
  /** The formula holds for n >= from (every term present, right-hand side exhausted). */
  readonly from: number;
  readonly order: 1 | 2;
  /** Q_r(n) = P_r(t0) (n + r)...(n + 1). */
  readonly denominator: Poly;
  /** a_{n+r} = sum numerators[i].poly(n) a_{n + numerators[i].delta} / denominator(n), delta descending; zero numerators omitted. */
  readonly numerators: readonly { readonly delta: number; readonly poly: Poly }[];
  /** With exactly one numerator: the ratio with common factors cancelled. */
  readonly ratio: { readonly delta: number; readonly num: Poly; readonly den: Poly } | null;
};

export type BasisSeries = {
  /** 0..r-1 for the basis solution multiplying a_component; r for the particular part. */
  readonly component: number;
  /** Its coefficients of s^0 .. s^(COMPUTED_TERMS - 1). */
  readonly coefficients: readonly Q[];
  /** Proven polynomial degree (-1 = identically zero), or null when no termination was proven. */
  readonly degree: number | null;
};

export type Radius =
  | { readonly kind: "infinite" }
  | { readonly kind: "finite"; readonly distance: Distance; readonly nearest: readonly RootForm[] }
  /** No singular point lies within `value` of t0 (a guaranteed, weaker bound; `ln` its logarithm, finite also beyond the double range). */
  | { readonly kind: "lowerBound"; readonly value: number; readonly ln: number };

/**
 * A numeric distance is reported as the radius only when its proven lower bound is this close to it
 * (far below every printed digit); otherwise the radius is the proven bound itself (`lowerBound`). A
 * display choice: it decides how a guaranteed statement is worded, never what is guaranteed.
 */
export const CERTIFIED_FRACTION = 1e-9;

/**
 * The radius from a center to the roots of D (D(center) != 0): the nearest located root when its
 * distance is proven (exact roots, or numeric ones whose inclusion radii are negligible), else the
 * guaranteed bound: the proven distance of the located roots, or the root-free radius when that is
 * larger or some roots are unlocated.
 */
function radiusFrom(D: Poly, roots: readonly RootForm[], center: Q, checkpoint?: () => void): Radius {
  const bound = (certified: number): Radius => {
    const freeLn = rootFreeRadiusLn(D, center, checkpoint);
    const certifiedLn = certified > 0 ? Math.log(certified) : -Infinity;
    const ln = Math.max(freeLn, certifiedLn);
    return { kind: "lowerBound", value: Math.exp(ln), ln };
  };
  if (hasUnlocated(roots)) return bound(0);
  const distance = nearestDistance(roots, center);
  if (distance === null) return { kind: "infinite" };
  const certified = certifiedDistance(roots, center);
  // A proven distance of 0 proves nothing (a numeric root whose double IS t0: its disc contains t0); the
  // root-free radius then gives the true bound (t0 is rational and not a root of D).
  if (!(certified > 0 && certified >= distance.value * (1 - CERTIFIED_FRACTION))) return bound(Number.isFinite(certified) ? certified : 0);
  // The nearest points: every root as near as the nearest within CERTIFIED_FRACTION (a numeric
  // conjugate pair differs in its last bits and is still one pair); of a real pair off its center
  // only the nearer branch (t = √2 from t0 = 1, not ±√2).
  const tolerance = Math.log1p(CERTIFIED_FRACTION);
  const nearest: RootForm[] = [];
  for (const x of roots) {
    const ds = rootDistances(x, center);
    const close = ds.map((d) => d.ln <= distance.ln + tolerance);
    if (!close.some(Boolean)) continue;
    if (x.kind === "quadratic" && ds.length === 2 && close[0] !== close[1]) nearest.push({ ...x, branch: close[0] ? 1 : -1 });
    else nearest.push(x);
  }
  return { kind: "finite", distance: { ...distance, lower: Math.min(distance.lower, certified) }, nearest };
}

/** One Frobenius series s^rho (a_0 + a_1 s + ...), a_0 = 1, with its recurrence a_n = sum poly(n) a_{n-shift} / F(n). */
export type FrobeniusRoot = {
  readonly exponent: Q;
  /** F_rho(n): the polynomial that multiplies a_n (it vanishes at n = 0, the indicial equation). */
  readonly denominator: Poly;
  /** a_n = sum numerators[i].poly(n) a_{n - numerators[i].shift} / F_rho(n), shift ascending; zero numerators omitted. */
  readonly numerators: readonly { readonly shift: number; readonly poly: Poly }[];
  /** a_0 = 1, a_1, ... (as many as the caller needs, see SeriesSolution.coefficients). */
  readonly coefficients: readonly Q[];
  /** True when a coefficient outgrew MAX_COEFFICIENT_HEX_DIGITS and the computation stopped there. */
  readonly digitLimited: boolean;
  /** Proven polynomial degree of sum a_n s^n, or null. */
  readonly degree: number | null;
  /** The n >= 1 where F_rho(n) = 0 and the recurrence left a_n free (set to 0): the lucky integer gap; else null. */
  readonly freeIndex: number | null;
};

/**
 * The Frobenius method at a regular singular point of a HOMOGENEOUS equation with rational indicial
 * roots r1 >= r2: the series for r1 always exists; r2 gives a second one when r1 - r2 is not a whole
 * number, or when it is a whole number N and the recurrence leaves a_N free; otherwise (equal roots,
 * or the recurrence fails at N) the second solution contains a logarithm and is not expanded.
 */
export type Frobenius = {
  readonly first: FrobeniusRoot;
  readonly second:
    | { readonly kind: "series"; readonly root: FrobeniusRoot }
    | { readonly kind: "logEqual" }
    | { readonly kind: "logInteger"; readonly gap: number }
    /** An integer gap N whose decision (at n = N) lies beyond what could be computed (the cap or the digit limit). */
    | { readonly kind: "undecided"; readonly gap: number }
    | { readonly kind: "none" };
  /** Where the series converge: up to the nearest OTHER singular point. */
  readonly radius: Radius;
};

export type SingularPoint =
  | {
      readonly kind: "regular";
      readonly p0: Q;
      readonly q0: Q;
      readonly indicial: Poly;
      readonly roots: readonly RootForm[];
      /** The Frobenius series, or why they are not expanded ("forcing": a right-hand side; "notRational": irrational or complex roots). */
      readonly frobenius: Frobenius | { readonly blocked: "forcing" | "notRational" };
    }
  | { readonly kind: "irregular" };

export type SeriesSolution = {
  readonly status: "ok";
  readonly order: 1 | 2;
  readonly center: Q;
  /** The coefficients and right-hand side in powers of s = t - t0 (the same as P, G when t0 = 0). */
  readonly shifted: PolynomialOde;
  readonly terms: readonly SeriesTerm[];
  readonly low: readonly LowEquation[];
  readonly recurrence: Recurrence;
  /** a_0 .. a_K: as many as the caller's terms need plus TERMINATION_MARGIN, at most COMPUTED_TERMS. */
  readonly coefficients: readonly CoefficientVector[];
  /** True when a coefficient outgrew MAX_COEFFICIENT_HEX_DIGITS and the computation stopped there. */
  readonly digitLimited: boolean;
  readonly basis: readonly BasisSeries[];
  readonly particular: BasisSeries | null;
  /** The singular points of the equation: zeros of P_r not cancelled everywhere. */
  readonly singular: readonly RootForm[];
  readonly radius: Radius;
};

export type SeriesAtSingularPoint = {
  readonly status: "singular";
  readonly order: 1 | 2;
  readonly center: Q;
  readonly shifted: PolynomialOde;
  readonly point: SingularPoint;
  readonly singular: readonly RootForm[];
};

function multiplicityAtZero(p: Poly): number {
  if (pIsZero(p)) return Infinity;
  let k = 0;
  while (isZero(p[k])) k++;
  return k;
}

/** The singular points: zeros of D = P_r / gcd(P_r, P_0, ..., P_{r-1}, G). */
export function singularPolynomial(ode: PolynomialOde, checkpoint?: () => void): Poly {
  let g = ode.P[ode.order];
  for (let j = 0; j < ode.order; j++) g = pgcd(g, ode.P[j], checkpoint);
  g = pgcd(g, ode.G, checkpoint);
  return pIsZero(g) ? PONE : pexactDiv(ode.P[ode.order], g);
}

function vecZero(r: number): Q[] {
  return new Array(r + 1).fill(ZERO);
}
function vecAddScaled(acc: Q[], v: CoefficientVector, s: Q): void {
  if (isZero(s)) return;
  for (let i = 0; i < acc.length; i++) acc[i] = add(acc[i], mul(v[i], s));
}

function singularPoint(shifted: PolynomialOde, center: Q, D: Poly, opts: SeriesOptions): SingularPoint {
  const r = shifted.order;
  const top = shifted.P[r];
  const mu = multiplicityAtZero(top);
  const lead = top[mu];
  let p0: Q;
  let q0: Q = ZERO;
  let indicial: Poly;
  if (r === 2) {
    if (multiplicityAtZero(shifted.P[1]) < mu - 1 || multiplicityAtZero(shifted.P[0]) < mu - 2) return { kind: "irregular" };
    p0 = div(pcoef(shifted.P[1], mu - 1), lead);
    q0 = mu >= 2 ? div(pcoef(shifted.P[0], mu - 2), lead) : ZERO;
    // r(r - 1) + p0 r + q0 = r^2 + (p0 - 1) r + q0
    indicial = trim([q0, sub(p0, ONE), ONE]);
  } else {
    if (multiplicityAtZero(shifted.P[0]) < mu - 1) return { kind: "irregular" };
    p0 = div(pcoef(shifted.P[0], mu - 1), lead);
    indicial = trim([p0, ONE]);
  }
  const roots = rootsOf(indicial, opts.checkpoint);
  return { kind: "regular", p0, q0, indicial, roots, frobenius: frobeniusSeries(shifted, roots, center, D, opts) };
}

/** (X + offset)(X + offset - 1)... with j factors, for a rational offset. */
function fallingFactorialQ(offset: Q, j: number): Poly {
  let out: Poly = PONE;
  for (let i = 0; i < j; i++) out = pmul(out, trim([sub(offset, q(i)), ONE]));
  return out;
}

/** The Frobenius recurrence and coefficients for one rational exponent (null when F vanishes at some n >= 1 with a non-zero right side). */
/** The largest integer gap of the indicial roots whose logarithm decision is computed (n = N is reached). */
export const FROBENIUS_GAP_CAP = 200;

function frobeniusRoot(terms: readonly SeriesTerm[], deltaStar: number, rho: Q, opts: SeriesOptions, minCount = 0): FrobeniusRoot | null {
  // A term c s^m u^(j) contributes c (k + rho)_j a_k s^(k + rho - delta); the power s^(n + rho - delta*) takes k = n - (delta* - delta).
  let denominator: Poly = PZERO;
  const byShift = new Map<number, Poly>();
  for (const t of terms) {
    const shift = deltaStar - t.delta;
    const poly = pscale(fallingFactorialQ(sub(rho, q(shift)), t.j), t.c);
    if (shift === 0) denominator = padd(denominator, poly);
    else byShift.set(shift, padd(byShift.get(shift) ?? PZERO, poly));
  }
  const numerators = [...byShift.entries()].filter(([, poly]) => !pIsZero(poly)).sort((a, b) => a[0] - b[0]).map(([shift, poly]) => ({ shift, poly: pneg(poly) }));
  const coefficients: Q[] = [ONE];
  let freeIndex: number | null = null;
  let digitLimited = false;
  const count = Math.max(computeCount(opts), minCount);
  for (let n = 1; n < count; n++) {
    opts.checkpoint?.();
    let rhs = ZERO;
    for (const { shift, poly } of numerators) if (n - shift >= 0) rhs = add(rhs, mul(pevalQ(poly, q(n)), coefficients[n - shift]));
    const d = pevalQ(denominator, q(n));
    if (isZero(d)) {
      if (!isZero(rhs)) return null;
      freeIndex = n;
      coefficients.push(ZERO);
    } else {
      coefficients.push(div(rhs, d));
    }
    if (hexSize(coefficients[n]) > MAX_COEFFICIENT_HEX_DIGITS) {
      digitLimited = true;
      break;
    }
  }
  // A polynomial is proven when, past every zero of F at a positive integer, a window of max-shift zeros occurs.
  const window = numerators.length ? Math.max(...numerators.map((x) => x.shift)) : 1;
  let degree: number | null = null;
  const start = (freeIndex ?? 0) + 1;
  for (let n = start; n + window <= coefficients.length; n++) {
    let zero = true;
    for (let k = n; k < n + window; k++) if (!isZero(coefficients[k])) zero = false;
    if (!zero) continue;
    let last = -1;
    for (let k = n - 1; k >= 0; k--) if (!isZero(coefficients[k])) { last = k; break; }
    degree = last;
    break;
  }
  return { exponent: rho, denominator, numerators, coefficients, degree, freeIndex, digitLimited };
}

function frobeniusSeries(shifted: PolynomialOde, roots: readonly RootForm[], center: Q, D: Poly, opts: SeriesOptions): Frobenius | { blocked: "forcing" | "notRational" } {
  if (!pIsZero(shifted.G)) return { blocked: "forcing" };
  const rational = roots.filter((x): x is Extract<RootForm, { kind: "rational" }> => x.kind === "rational");
  const count = roots.reduce((n, x) => n + (x.kind === "quadratic" ? 2 : 1) * x.multiplicity, 0);
  if (rational.reduce((n, x) => n + x.multiplicity, 0) !== count) return { blocked: "notRational" };
  const exponents = rational.flatMap((x) => Array.from({ length: x.multiplicity }, () => x.value)).sort((a, b) => cmp(b, a));
  const terms: SeriesTerm[] = [];
  for (let j = shifted.order; j >= 0; j--) shifted.P[j].forEach((c, m) => { if (!isZero(c)) terms.push({ j, m, c, delta: j - m }); });
  const deltaStar = Math.max(...terms.map((t) => t.delta));
  const first = frobeniusRoot(terms, deltaStar, exponents[0], opts);
  if (!first) return { blocked: "notRational" }; // cannot happen for the larger root: F(n + r1) has no zero at n >= 1
  let second: Frobenius["second"] = { kind: "none" };
  if (exponents.length === 2) {
    const gap = sub(exponents[0], exponents[1]);
    if (isZero(gap)) second = { kind: "logEqual" };
    else if (gap.d === BigInt(1)) {
      // An integer gap N: the smaller root's recurrence must be followed THROUGH n = N, where its factor
      // vanishes; only there is the choice between a series and a logarithm made, never by how many
      // terms happen to be shown.
      const N = Number(gap.n);
      const root = N > FROBENIUS_GAP_CAP ? undefined : frobeniusRoot(terms, deltaStar, exponents[1], opts, N + 1);
      if (root === null) second = { kind: "logInteger", gap: N };
      else if (root === undefined || root.coefficients.length - 1 < N) second = { kind: "undecided", gap: N };
      else second = { kind: "series", root };
    } else {
      const root = frobeniusRoot(terms, deltaStar, exponents[1], opts);
      // A non-integer gap: the factor never vanishes at a positive integer, so the series always exists.
      if (root) second = { kind: "series", root };
    }
  }
  // Convergence up to the nearest singular point other than t0: D with every factor (t - t0) removed.
  let others = D;
  while (pdeg(others) >= 1 && isZero(pevalQ(others, center))) others = pdivmod(others, trim([neg(center), ONE]), opts.checkpoint).quotient;
  const radius = radiusFrom(others, rootsOf(others, opts.checkpoint), center, opts.checkpoint);
  return { first, second, radius };
}

/** Proven degree of a coefficient sequence under the recurrence, or null (see the header). */
export function provenDegree(seq: readonly Q[], rec: Recurrence): number | null {
  const r = rec.order;
  const deltaMin = rec.numerators.length === 0 ? r : Math.min(...rec.numerators.map((x) => x.delta));
  for (let n = rec.from; n + r < seq.length; n++) {
    let zero = true;
    for (let k = n + deltaMin; k <= n + r - 1; k++) {
      if (k >= 0 && !isZero(seq[k])) {
        zero = false;
        break;
      }
    }
    if (!zero) continue;
    let last = -1;
    for (let k = Math.min(n + deltaMin, seq.length) - 1; k >= 0; k--) {
      if (!isZero(seq[k])) {
        last = k;
        break;
      }
    }
    return last;
  }
  return null;
}

/**
 * The power-series solution about t0, or the description of the singular point t0. `ode` must have
 * polynomial coefficients (see polynomialOde) and a non-zero leading coefficient.
 */
export function powerSeries(ode: PolynomialOde, center: Q, opts: SeriesOptions = {}): SeriesSolution | SeriesAtSingularPoint {
  const r = ode.order;
  // The Taylor shift's coefficients grow like (digits of t0) x (degree): refuse before doing it when that is out of reach.
  const degree = Math.max(pdeg(ode.G), ...ode.P.map(pdeg), 0);
  if (!isZero(center) && hexSize(center) * degree > MAX_COEFFICIENT_HEX_DIGITS) throw new SeriesTooExpensive();
  const shifted: PolynomialOde = {
    order: r,
    P: ode.P.map((p) => ptaylorShift(p, center, opts.checkpoint)),
    G: ptaylorShift(ode.G, center, opts.checkpoint),
  };
  const D = singularPolynomial(ode, opts.checkpoint);
  const singular = rootsOf(D, opts.checkpoint);
  const lead0 = pcoef(shifted.P[r], 0);
  if (isZero(lead0)) return { status: "singular", order: r, center, shifted, point: singularPoint(shifted, center, D, opts), singular };

  // The terms c s^m u^(j), in the equation's order: highest derivative first, then by power.
  const terms: SeriesTerm[] = [];
  for (let j = r; j >= 0; j--) {
    shifted.P[j].forEach((c, m) => {
      if (!isZero(c)) terms.push({ j, m, c, delta: j - m });
    });
  }
  // Q_delta(n) = sum c (n + delta)_j over the terms with that offset.
  const groups = new Map<number, Poly>();
  for (const t of terms) groups.set(t.delta, padd(groups.get(t.delta) ?? PZERO, pscale(fallingFactorial(t.delta, t.j), t.c)));
  const denominator = groups.get(r) as Poly;
  const numerators = [...groups.entries()]
    .filter(([delta, poly]) => delta < r && !pIsZero(poly))
    .sort((a, b) => b[0] - a[0])
    .map(([delta, poly]) => ({ delta, poly: pneg(poly) }));
  let ratio: Recurrence["ratio"] = null;
  if (numerators.length === 1) {
    const g = pgcd(numerators[0].poly, denominator);
    ratio = { delta: numerators[0].delta, num: pexactDiv(numerators[0].poly, g), den: pexactDiv(denominator, g) };
  }
  const maxM = terms.reduce((m, t) => Math.max(m, t.m), 0);
  const from = Math.max(maxM, pdeg(shifted.G) + 1);
  const recurrence: Recurrence = { from, order: r, denominator, numerators, ratio };

  // Coefficients as vectors over (a_0, .., a_{r-1}, 1).
  const coefficients: CoefficientVector[] = [];
  for (let k = 0; k < r; k++) {
    const v = vecZero(r);
    v[k] = ONE;
    coefficients.push(v);
  }
  const groupList = [...groups.entries()].filter(([delta]) => delta < r);
  const count = computeCount(opts);
  let digitLimited = false;
  for (let n = 0; n + r < count; n++) {
    opts.checkpoint?.();
    const acc = vecZero(r);
    acc[r] = pcoef(shifted.G, n);
    for (const [delta, poly] of groupList) {
      const k = n + delta;
      if (k < 0) continue;
      vecAddScaled(acc, coefficients[k], neg(pevalQ(poly, q(n))));
    }
    const d = pevalQ(denominator, q(n));
    const next = acc.map((v) => div(v, d));
    coefficients.push(next);
    if (next.some((v) => hexSize(v) > MAX_COEFFICIENT_HEX_DIGITS)) {
      digitLimited = true;
      break;
    }
  }

  // The low equations n < from, with only the terms that have started (m <= n).
  const low: LowEquation[] = [];
  for (let n = 0; n < from && n + r < coefficients.length; n++) {
    const parts = new Map<number, Q>();
    for (const t of terms) {
      if (t.m > n) continue;
      const value = mul(t.c, pevalQ(fallingFactorial(t.delta, t.j), q(n)));
      parts.set(t.delta, add(parts.get(t.delta) ?? ZERO, value));
    }
    low.push({
      n,
      parts: [...parts.entries()].filter(([, v]) => !isZero(v)).sort((a, b) => b[0] - a[0]).map(([delta, value]) => ({ delta, value })),
      rhs: pcoef(shifted.G, n),
      solvedIndex: n + r,
      solved: coefficients[n + r],
    });
  }

  const component = (i: number): BasisSeries => {
    const seq = coefficients.map((v) => v[i]);
    return { component: i, coefficients: seq, degree: provenDegree(seq, recurrence) };
  };
  const basis = Array.from({ length: r }, (_, i) => component(i));
  const particularSeries = component(r);
  // A homogeneous equation has no particular part at all (its computed entries are all 0, whether or
  // not the window that proves it is reached).
  const particular = pIsZero(shifted.G) || particularSeries.degree === -1 ? null : particularSeries;

  const radius = radiusFrom(D, singular, center, opts.checkpoint);

  return { status: "ok", order: r, center, shifted, terms, low, recurrence, coefficients, digitLimited, basis, particular, singular, radius };
}

/** The exact coefficients a_k for given values of the free coefficients a_0..a_{r-1} (u(t0), u'(t0)). */
export function coefficientValues(sol: SeriesSolution, initial: readonly Q[]): Q[] {
  return sol.coefficients.map((v) => {
    let s = v[sol.order];
    for (let i = 0; i < sol.order; i++) s = add(s, mul(v[i], initial[i] ?? ZERO));
    return s;
  });
}

/** The partial sum through the power s^N at a real t (floating point from the exact coefficients). */
export function partialSum(values: readonly Q[], N: number, center: Q, t: number): number {
  const s = t - toNumber(center);
  let v = 0;
  for (let k = Math.min(N, values.length - 1); k >= 0; k--) v = v * s + toNumber(values[k]);
  return v;
}
