/**
 * The solution formula of a linear equation with CONSTANT coefficients (round 12, lib/series):
 *
 *     P_r u^(r) + ... + P_0 u = G(t),   r = 1 or 2,   G a real quasi-polynomial (see quasi.ts),
 *
 * split the way a course splits it: u = u_h + u_p. The homogeneous part comes from the
 * characteristic polynomial chi(r) = P_r r^r + ... + P_0 (its discriminant decides the three cases
 * exactly, since every coefficient is an exact rational); the particular part comes from undetermined
 * coefficients, solved EXACTLY over the Gaussian rationals for every exponent mu of the right-hand
 * side: u_p = sum_mu t^s e^(mu t) Q_mu(t), s = the multiplicity of mu as a root of chi (s > 0 is
 * resonance), and `particularResidualIsZero` verifies by exact substitution that L[u_p] = G.
 *
 * The homogeneous basis is ANCHORED at t0: e^(r (t - t0)), (t - t0) e^(r (t - t0)),
 * e^(alpha (t - t0)) cos(beta (t - t0)), ... so the constants solve a system whose matrix is that of
 * t0 = 0 (never an overflowing e^(2 r t0)); they are exact when the roots are rational (or complex with
 * a rational imaginary part) and u_p(t0), u_p'(t0) are exact (t0 = 0, or a polynomial right-hand side).
 *
 * Every loop over exact numbers takes the caller's checkpoint, and an undetermined coefficient that
 * outgrows MAX_COEFFICIENT_HEX_DIGITS (16-digit frequencies against t^40) ends the computation with
 * SeriesTooExpensive: a public endpoint must never spend a minute in exact arithmetic.
 */
import type { LinearEquation } from "./equation";
import { padd, pderiv, pevalQ, pmul, type Poly, PZERO, trim } from "./poly";
import { MAX_COEFFICIENT_HEX_DIGITS } from "./power-series";
import {
  asConstant, cpAdd, cpCoef, cpDeg, cpEquals, cpFromCoefs, type CPoly, cpScale, qpAdd, qpMul, qpPoly, qpTerms, type QuasiPoly,
  QP_ZERO, realPairs,
} from "./quasi";
import {
  add, cadd, cdiv, cIsZero, cKey, cmul, type CQ, cq, cscale, CZERO, div, hexSize, isZero, mul, neg, ONE, q, type Q, SeriesTooExpensive, sign,
  sqrtExact, sub, toNumber, ZERO,
} from "./rational";

export type ConstantOde = { readonly order: 1 | 2; readonly P: readonly Q[]; readonly G: QuasiPoly };

/** The equation with constant real coefficients, or the first coefficient that is not constant. */
export function constantCoefficientOde(eq: LinearEquation): { ok: true; ode: ConstantOde } | { ok: false; order: number } {
  const P: Q[] = [];
  for (let j = 0; j <= eq.order; j++) {
    const c = asConstant(eq.P[j]);
    if (c === null || !isZero(c.im)) return { ok: false, order: j };
    P.push(c.re);
  }
  return { ok: true, ode: { order: eq.order, P, G: eq.G } };
}

/** beta = exact, or scale * sqrt(radicand) with a radicand that is not the square of a rational. */
export type Surd = { readonly exact: Q } | { readonly scale: Q; readonly radicand: Q };

export type CharacteristicRoots =
  | { readonly kind: "single"; readonly root: Q }
  | { readonly kind: "distinct"; readonly r1: Q; readonly r2: Q }
  /** center +- scale * sqrt(disc), disc > 0 not a square; scale > 0, so r1 = center + ... is the larger. */
  | { readonly kind: "distinctIrrational"; readonly center: Q; readonly scale: Q; readonly disc: Q }
  | { readonly kind: "repeated"; readonly root: Q }
  | { readonly kind: "complex"; readonly alpha: Q; readonly beta: Surd };

export type ParticularPart = {
  /** The exponent mu of the right-hand side term this part answers. */
  readonly lambda: CQ;
  /** The multiplicity s of mu as a root of chi: the factor t^s (s > 0 is resonance). */
  readonly multiplicity: number;
  /** Q_mu(t), so the part is t^s e^(mu t) Q_mu(t). */
  readonly coef: CPoly;
  /** The right-hand side term's own polynomial G_mu(t). */
  readonly forcing: CPoly;
};

export type Damping = "undamped" | "underdamped" | "critical" | "overdamped";

/**
 * |chi(mu)| at most this fraction of sum |P_j| |mu|^j counts as NEAR resonance: with a frequency that
 * came in as a 16-digit decimal (pi, sqrt(2)), chi(mu) is then rounding noise, and the exact formula
 * for that decimal (coefficients near 1e15) says nothing a student can use. A display choice that
 * decides no mathematics: the caller refuses with an explanation only for an approximate equation.
 */
export const NEAR_RESONANCE_FRACTION = 1e-12;

export type SolutionFormula = {
  readonly order: 1 | 2;
  readonly P: readonly Q[];
  /** The right-hand side. */
  readonly G: QuasiPoly;
  readonly characteristic: Poly;
  /** b^2 - 4ac of the second-order characteristic polynomial (null for order 1). */
  readonly discriminant: Q | null;
  readonly roots: CharacteristicRoots;
  readonly parts: readonly ParticularPart[];
  /** u_p as one quasi-polynomial (zero when the equation is homogeneous). */
  readonly particular: QuasiPoly;
  /** The oscillator words, only for P2 > 0, P1 >= 0, P0 > 0. */
  readonly damping: Damping | null;
  /** A forcing exponent mu whose chi(mu) is non-zero but within NEAR_RESONANCE_FRACTION of zero (null when there is none). */
  readonly nearResonance: CQ | null;
};

function surdOf(v: Q): Surd {
  const exact = sqrtExact(v);
  return exact !== null ? { exact } : { scale: ONE, radicand: v };
}
export function surdValue(s: Surd): number {
  return "exact" in s ? toNumber(s.exact) : toNumber(s.scale) * Math.sqrt(toNumber(s.radicand));
}

function factorial(n: number): Q {
  let v = ONE;
  for (let k = 2; k <= n; k++) v = mul(v, q(k));
  return v;
}

/** chi^(k)(mu) / k! for k = 0..r: the Taylor coefficients of chi at mu (exact in Q(i)). */
function taylorAt(chi: Poly, mu: CQ, r: number): CQ[] {
  const out: CQ[] = [];
  let d = chi;
  for (let k = 0; k <= r; k++) {
    let v = CZERO;
    for (let i = d.length - 1; i >= 0; i--) v = cadd(cmul(v, mu), cq(d[i]));
    out.push(cscale(v, div(ONE, factorial(k))));
    d = pderiv(d);
  }
  return out;
}

/** Undetermined coefficients for one exponent: t^s Q(t) with chi(D + mu)[t^s Q] = G_mu (triangular, exact). */
function particularFor(chi: Poly, r: number, mu: CQ, forcing: CPoly, checkpoint?: () => void): ParticularPart {
  const c = taylorAt(chi, mu, r);
  let s = 0;
  while (s <= r && cIsZero(c[s])) s++;
  const m = cpDeg(forcing);
  const b: CQ[] = new Array(m + 1).fill(CZERO);
  for (let i = m; i >= 0; i--) {
    checkpoint?.();
    let rhs = cpCoef(forcing, i);
    for (let k = s + 1; k <= r; k++) {
      const l = i + k - s;
      if (l > m) continue;
      rhs = cadd(rhs, cmul(c[k], cscale(b[l], neg(div(factorial(i + k), factorial(i))))));
    }
    b[i] = cdiv(rhs, cscale(c[s], div(factorial(i + s), factorial(i))));
    if (hexSize(b[i].re) > MAX_COEFFICIENT_HEX_DIGITS || hexSize(b[i].im) > MAX_COEFFICIENT_HEX_DIGITS) throw new SeriesTooExpensive();
  }
  return { lambda: mu, multiplicity: s, coef: cpFromCoefs(b), forcing };
}

function rootsOf(order: 1 | 2, P: readonly Q[]): { roots: CharacteristicRoots; discriminant: Q | null } {
  if (order === 1) return { roots: { kind: "single", root: neg(div(P[0], P[1])) }, discriminant: null };
  const [c0, b, a] = P;
  const disc = sub(mul(b, b), mul(q(4), mul(a, c0)));
  const center = neg(div(b, mul(q(2), a)));
  const half = div(ONE, mul(q(2), a));
  const scale = sign(half) < 0 ? neg(half) : half;
  const s = sign(disc);
  if (s === 0) return { roots: { kind: "repeated", root: center }, discriminant: disc };
  if (s > 0) {
    const root = sqrtExact(disc);
    if (root !== null) {
      const w = mul(scale, root);
      return { roots: { kind: "distinct", r1: add(center, w), r2: sub(center, w) }, discriminant: disc };
    }
    return { roots: { kind: "distinctIrrational", center, scale, disc }, discriminant: disc };
  }
  const beta = surdOf(neg(disc));
  const scaled: Surd = "exact" in beta ? { exact: mul(beta.exact, scale) } : { scale, radicand: beta.radicand };
  return { roots: { kind: "complex", alpha: center, beta: scaled }, discriminant: disc };
}

/** |chi(mu)| against the size of its terms, in floating point (the near-resonance test). */
function nearRoot(chi: Poly, mu: CQ): boolean {
  const re = toNumber(mu.re);
  const im = toNumber(mu.im);
  let vr = 0;
  let vi = 0;
  let size = 0;
  const mod = Math.hypot(re, im);
  for (let i = chi.length - 1; i >= 0; i--) {
    const nr = vr * re - vi * im + toNumber(chi[i]);
    vi = vr * im + vi * re;
    vr = nr;
    size += Math.abs(toNumber(chi[i])) * mod ** i;
  }
  return Math.hypot(vr, vi) <= NEAR_RESONANCE_FRACTION * size;
}

/** The solution formula of a constant-coefficient equation (checkpoint: the caller's budget; SeriesTooExpensive past the digit cap). */
export function solutionFormula(ode: ConstantOde, checkpoint?: () => void): SolutionFormula {
  const chi = trim([...ode.P]);
  const { roots, discriminant } = rootsOf(ode.order, ode.P);
  const parts: ParticularPart[] = [];
  let particular: QuasiPoly = QP_ZERO;
  let nearResonance: CQ | null = null;
  for (const term of qpTerms(ode.G)) {
    const part = particularFor(chi, ode.order, term.lambda, term.coef, checkpoint);
    parts.push(part);
    if (part.multiplicity === 0 && nearResonance === null && nearRoot(chi, term.lambda)) nearResonance = term.lambda;
    // t^s Q(t): the coefficients shifted by s places (no multiplication of long fractions).
    const shift = (p: Poly): Poly => (p.length === 0 ? p : trim([...new Array(part.multiplicity).fill(ZERO), ...p]));
    const piece: QuasiPoly = new Map([[cKey(part.lambda), { lambda: part.lambda, coef: { re: shift(part.coef.re), im: shift(part.coef.im) } }]]);
    particular = qpAdd(particular, piece);
  }
  let damping: Damping | null = null;
  if (ode.order === 2) {
    const [k, cDamp, m] = ode.P;
    if (sign(m) > 0 && sign(cDamp) >= 0 && sign(k) > 0) {
      damping = isZero(cDamp) ? "undamped" : roots.kind === "complex" ? "underdamped" : roots.kind === "repeated" ? "critical" : "overdamped";
    }
  }
  return { order: ode.order, P: ode.P, G: ode.G, characteristic: chi, discriminant, roots, parts, particular, damping, nearResonance };
}

/**
 * Exact substitution: sum_j P_j D^j u_p = G. Exponent by exponent, since e^(mu t) W(t) has the
 * derivative e^(mu t) (mu W + W') and terms with different mu are independent: for every part,
 * sum_j P_j (D + mu)^j [t^s Q] must equal the right-hand side's own polynomial for that mu, and every
 * exponent of the right-hand side must have its part. Built from the P_j directly, not from the
 * Taylor coefficients the parts were solved with.
 */
export function particularResidualIsZero(sol: SolutionFormula, checkpoint?: () => void): boolean {
  const forcing = new Map(qpTerms(sol.G).map((t) => [cKey(t.lambda), t.coef] as const));
  const answered = new Set<string>();
  for (const part of sol.parts) {
    const key = cKey(part.lambda);
    answered.add(key);
    const shifted: CQ[] = [];
    for (let k = 0; k < part.multiplicity; k++) shifted.push(CZERO);
    for (let k = 0; k <= cpDeg(part.coef); k++) shifted.push(cpCoef(part.coef, k));
    let w: CPoly = cpFromCoefs(shifted);
    let total: CPoly = cpFromCoefs([]);
    for (let j = 0; j <= sol.order; j++) {
      checkpoint?.();
      total = cpAdd(total, cpScale(w, cq(sol.P[j])));
      // (D + mu) W = mu W + W'
      const derivative: CQ[] = [];
      for (let k = 1; k <= cpDeg(w); k++) derivative.push(cscale(cpCoef(w, k), q(k)));
      w = cpAdd(cpScale(w, part.lambda), cpFromCoefs(derivative));
    }
    if (!cpEquals(total, forcing.get(key) ?? cpFromCoefs([]))) return false;
  }
  for (const key of forcing.keys()) if (!answered.has(key)) return false;
  return true;
}

/** The largest |Re r| of the characteristic roots: how fast an error of the reference integration can grow per unit of t in either direction. */
export function growthRate(roots: CharacteristicRoots): number {
  switch (roots.kind) {
    case "single":
    case "repeated":
      return Math.abs(toNumber(roots.root));
    case "distinct":
      return Math.max(Math.abs(toNumber(roots.r1)), Math.abs(toNumber(roots.r2)));
    case "distinctIrrational": {
      const w = toNumber(roots.scale) * Math.sqrt(toNumber(roots.disc));
      return Math.abs(toNumber(roots.center)) + Math.abs(w);
    }
    case "complex":
      return Math.abs(toNumber(roots.alpha));
  }
}

/**
 * The size of the formula's separate TERMS at t: sum |C_i b_i(t)| + sum over the parts of
 * |e^(mu t)| sum_k |q_k| |t|^(k + s). Floating-point evaluation of the formula is only as good as about
 * 1e-15 of this, however small the solution itself is (near resonance its terms are 10^11 and cancel).
 */
export function termScale(sol: SolutionFormula, constants: readonly number[], t0 = 0): (t: number) => number {
  const basis = basisFunctions(sol.roots, t0);
  return (t) => {
    let size = 0;
    basis.forEach((b, i) => {
      size += Math.abs((constants[i] ?? 0) * b.f(t));
    });
    for (const part of numericParts(sol)) {
      let poly = 0;
      for (let k = 0; k < part.re.length; k++) poly += Math.hypot(part.re[k], part.im[k]) * Math.abs(t) ** (k + part.s);
      size += Math.exp(part.al * t) * poly;
    }
    return size;
  };
}

/** The anchored homogeneous basis functions of s = t - t0 and their first derivatives, in floating point. */
export function basisFunctions(roots: CharacteristicRoots, t0 = 0): { f: (t: number) => number; df: (t: number) => number }[] {
  switch (roots.kind) {
    case "single": {
      const r = toNumber(roots.root);
      return [{ f: (t) => Math.exp(r * (t - t0)), df: (t) => r * Math.exp(r * (t - t0)) }];
    }
    case "distinct":
    case "distinctIrrational": {
      const [r1, r2] = roots.kind === "distinct"
        ? [toNumber(roots.r1), toNumber(roots.r2)]
        : [toNumber(roots.center) + toNumber(roots.scale) * Math.sqrt(toNumber(roots.disc)), toNumber(roots.center) - toNumber(roots.scale) * Math.sqrt(toNumber(roots.disc))];
      return [
        { f: (t) => Math.exp(r1 * (t - t0)), df: (t) => r1 * Math.exp(r1 * (t - t0)) },
        { f: (t) => Math.exp(r2 * (t - t0)), df: (t) => r2 * Math.exp(r2 * (t - t0)) },
      ];
    }
    case "repeated": {
      const r = toNumber(roots.root);
      return [
        { f: (t) => Math.exp(r * (t - t0)), df: (t) => r * Math.exp(r * (t - t0)) },
        { f: (t) => (t - t0) * Math.exp(r * (t - t0)), df: (t) => (1 + r * (t - t0)) * Math.exp(r * (t - t0)) },
      ];
    }
    case "complex": {
      const a = toNumber(roots.alpha);
      const b = surdValue(roots.beta);
      return [
        { f: (t) => Math.exp(a * (t - t0)) * Math.cos(b * (t - t0)), df: (t) => Math.exp(a * (t - t0)) * (a * Math.cos(b * (t - t0)) - b * Math.sin(b * (t - t0))) },
        { f: (t) => Math.exp(a * (t - t0)) * Math.sin(b * (t - t0)), df: (t) => Math.exp(a * (t - t0)) * (a * Math.sin(b * (t - t0)) + b * Math.cos(b * (t - t0))) },
      ];
    }
  }
}

/** A part's numbers as doubles, converted ONCE (toNumber of a big rational is costly: the check evaluates thousands of times). */
type NumericPart = { readonly al: number; readonly be: number; readonly s: number; readonly re: readonly number[]; readonly im: readonly number[] };
const NUMERIC_PARTS = new WeakMap<SolutionFormula, readonly NumericPart[]>();
function numericParts(sol: SolutionFormula, checkpoint?: () => void): readonly NumericPart[] {
  let cached = NUMERIC_PARTS.get(sol);
  if (!cached) {
    cached = sol.parts.map((part) => {
      const deg = cpDeg(part.coef);
      const re: number[] = [];
      const im: number[] = [];
      for (let k = 0; k <= deg; k++) {
        // Converting a coefficient of thousands of digits takes time too: on the caller's budget.
        if ((k & 3) === 3) checkpoint?.();
        const c = cpCoef(part.coef, k);
        re.push(toNumber(c.re));
        im.push(toNumber(c.im));
      }
      return { al: toNumber(part.lambda.re), be: toNumber(part.lambda.im), s: part.multiplicity, re, im };
    });
    NUMERIC_PARTS.set(sol, cached);
  }
  return cached;
}

/** u_p and u_p' at a real t in floating point. */
export function particularValue(sol: SolutionFormula, t: number): { value: number; slope: number } {
  let value = 0;
  let slope = 0;
  for (const part of numericParts(sol)) {
    const { al, be, s } = part;
    // w(t) = t^s Q(t) (complex polynomial), part = e^(mu t) w(t)
    let wr = 0, wi = 0, dwr = 0, dwi = 0;
    for (let k = part.re.length - 1; k >= 0; k--) {
      const p = k + s;
      const tp = t ** p;
      wr += part.re[k] * tp;
      wi += part.im[k] * tp;
      if (p > 0) {
        const dtp = p * t ** (p - 1);
        dwr += part.re[k] * dtp;
        dwi += part.im[k] * dtp;
      }
    }
    const e = Math.exp(al * t);
    const cr = e * Math.cos(be * t);
    const ci = e * Math.sin(be * t);
    // value = Re(e^(mu t) w); slope = Re(e^(mu t) (mu w + w'))
    value += cr * wr - ci * wi;
    const mr = al * wr - be * wi + dwr;
    const mi = al * wi + be * wr + dwi;
    slope += cr * mr - ci * mi;
  }
  return { value, slope };
}

export type Constants = {
  /** C_1 (and C_2) of the anchored basis, in floating point (finite only when nothing overflowed). */
  readonly values: readonly number[];
  /** The same constants exactly, when the roots and u_p(t0), u_p'(t0) allow it; else null. */
  readonly exact: readonly Q[] | null;
};

/** The exact u_p(t0) and u_p'(t0): at t0 = 0 always, at another t0 only for a polynomial right-hand side; else null. */
function particularAtExact(sol: SolutionFormula, t0: Q, checkpoint?: () => void): { value: Q; slope: Q } | null {
  if (isZero(t0)) {
    let value = CZERO;
    let slope = CZERO;
    for (const part of sol.parts) {
      // Sums of fractions of thousands of digits with different denominators: on the caller's budget.
      checkpoint?.();
      const b0 = cpCoef(part.coef, 0);
      const b1 = cpCoef(part.coef, 1);
      if (part.multiplicity === 0) {
        value = cadd(value, b0);
        slope = cadd(slope, cadd(cmul(part.lambda, b0), b1));
      } else if (part.multiplicity === 1) {
        slope = cadd(slope, b0);
      }
    }
    return { value: value.re, slope: slope.re };
  }
  if (!sol.parts.every((p) => cIsZero(p.lambda))) return null;
  // A polynomial right-hand side: u_p is the real polynomial sum t^s Q(t).
  let up: Poly = PZERO;
  for (const part of sol.parts) {
    checkpoint?.();
    up = padd(up, pmul(trim([...new Array(part.multiplicity).fill(ZERO), ONE]), part.coef.re));
  }
  return { value: pevalQ(up, t0), slope: pevalQ(pderiv(up), t0) };
}

/** The constants of u_h (anchored at t0) from u(t0) (and u'(t0)); `checkpoint`: the caller's budget for the first conversion of u_p to doubles. */
export function constantsFor(sol: SolutionFormula, t0: Q, initial: readonly Q[], checkpoint?: () => void): Constants {
  numericParts(sol, checkpoint);
  const t = toNumber(t0);
  const p = particularValue(sol, t);
  const u0 = toNumber(initial[0] ?? ZERO) - p.value;
  let values: number[];
  const r = sol.roots;
  if (sol.order === 1) {
    values = [u0];
  } else {
    const v0 = toNumber(initial[1] ?? ZERO) - p.slope;
    // The anchored basis at s = 0: values and slopes as at t0 = 0.
    switch (r.kind) {
      case "distinct":
      case "distinctIrrational": {
        const b = basisFunctions(r, 0);
        const r1 = b[0].df(0);
        const r2 = b[1].df(0);
        values = [(v0 - r2 * u0) / (r1 - r2), (r1 * u0 - v0) / (r1 - r2)];
        break;
      }
      case "repeated":
        values = [u0, v0 - toNumber(r.root) * u0];
        break;
      case "complex":
        values = [u0, (v0 - toNumber(r.alpha) * u0) / surdValue(r.beta)];
        break;
      default:
        values = [u0];
    }
  }
  const atT0 = particularAtExact(sol, t0, checkpoint);
  return { values, exact: atT0 ? exactConstants(sol, initial, atT0) : null };
}

function exactConstants(sol: SolutionFormula, initial: readonly Q[], p: { value: Q; slope: Q }): Q[] | null {
  const u0 = sub(initial[0] ?? ZERO, p.value);
  if (sol.order === 1) return [u0]; // phi(t0) = e^0 = 1
  const v0 = sub(initial[1] ?? ZERO, p.slope);
  const r = sol.roots;
  switch (r.kind) {
    case "distinct": // C1 + C2 = u0, r1 C1 + r2 C2 = v0
      return [div(sub(v0, mul(r.r2, u0)), sub(r.r1, r.r2)), div(sub(mul(r.r1, u0), v0), sub(r.r1, r.r2))];
    case "repeated": // C1 = u0, r C1 + C2 = v0
      return [u0, sub(v0, mul(r.root, u0))];
    case "complex": { // C1 = u0, alpha C1 + beta C2 = v0
      const numerator = sub(v0, mul(r.alpha, u0));
      // An irrational beta still gives exact constants when the numerator is 0 (C2 = 0).
      if (!("exact" in r.beta)) return isZero(numerator) ? [u0, ZERO] : null;
      return [u0, div(numerator, r.beta.exact)];
    }
    default:
      return null;
  }
}

/** u = C . (anchored basis) + u_p and its pieces in floating point. */
export function evaluateSolution(sol: SolutionFormula, constants: readonly number[], t0 = 0): {
  homogeneous: (t: number) => number;
  particular: (t: number) => number;
  total: (t: number) => number;
} {
  const basis = basisFunctions(sol.roots, t0);
  const homogeneous = (t: number) => basis.reduce((sum, b, i) => sum + (constants[i] ?? 0) * b.f(t), 0);
  const particular = (t: number) => particularValue(sol, t).value;
  return { homogeneous, particular, total: (t) => homogeneous(t) + particular(t) };
}

/** The real form of u_p: e^(alpha t) (A(t) cos(beta t) + B(t) sin(beta t)) per pair, for display. */
export function particularRealForm(sol: SolutionFormula) {
  return realPairs(sol.particular);
}

/** True when some part is resonant (its exponent is a root of chi). */
export function hasResonance(sol: SolutionFormula): boolean {
  return sol.parts.some((p) => p.multiplicity > 0);
}

