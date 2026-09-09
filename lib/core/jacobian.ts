/**
 * Numerical Jacobian (central differences) and closed-form 2x2 eigenvalues.
 */
import type { CompiledSystem } from "./parse";
import type { Complex, Matrix2, Vec2 } from "./types";

export type JacobianOptions = {
  /**
   * Handle a column whose forward or backward stencil point evaluates to a non-finite value: the
   * field is defined only on one side of p there (x' = sqrt(x) near x = 0). The step of that
   * column is shrunk (binary search over h 2^-m, down to the coordinate's own rounding floor
   * 4 eps |p_c|, or 2^-1000 h when p_c = 0) until both stencil points are finite and a central
   * difference is taken there; if no such step exists p lies on the edge itself and the one-sided
   * difference (f(p + s e) - f(p)) / s (or its mirror) at the smallest step is used. Without the
   * option, or when p itself or both sides are non-finite, the column stays non-finite. Why shrink
   * and not take a plain one-sided secant: at a distance d from a sqrt edge the secant over
   * [x, x + h] underestimates the derivative by sqrt(d / h), so Newton's step overshoots into the
   * undefined region by that factor and backtracking (12 halvings) never recovers; shrinking
   * down to the rounding floor leaves no band of d where that can happen.
   */
  oneSided?: boolean;
};

const finiteVec = (v: Vec2) => Number.isFinite(v.x) && Number.isFinite(v.y);
const allFinite = (J: Matrix2) => J[0].every(Number.isFinite) && J[1].every(Number.isFinite);
const EPS = 2.220446049250313e-16;
/** Deepest step halving tried for a column at the edge of the domain when the coordinate is 0 (h 2^-1000 stays a normal number). */
const EDGE_HALVINGS = 1000;

/**
 * Central-difference Jacobian at p. The step is relative, 1e-6 * max(1, |p|), because a fixed
 * 1e-6 loses most of its digits far from the origin. Entries may be non-finite if the field is
 * singular near p; callers (classify) treat that as "cannot decide". See JacobianOptions for
 * columns whose stencil crosses the edge of the field's domain.
 */
export function jacobianAt(sys: CompiledSystem, p: Vec2, h?: number, t = 0, opts: JacobianOptions = {}): Matrix2 {
  const step = h ?? 1e-6 * Math.max(1, Math.hypot(p.x, p.y));
  let F0: Vec2 | undefined;
  // Column of the Jacobian along the unit direction (ex, ey): [df/dc, dg/dc].
  const column = (ex: number, ey: number): [number, number] => {
    const at = (s: number) => sys.eval({ x: p.x + s * ex, y: p.y + s * ey }, t);
    const central = (s: number, plus: Vec2, minus: Vec2): [number, number] => [(plus.x - minus.x) / (2 * s), (plus.y - minus.y) / (2 * s)];
    const plus = at(step);
    const minus = at(-step);
    if (!opts.oneSided || (finiteVec(plus) && finiteVec(minus))) return central(step, plus, minus);
    F0 ??= sys.eval(p, t);
    if (!finiteVec(F0)) return central(step, plus, minus);
    // Smallest step that still moves the coordinate (below 4 eps |p_c| the displaced point is p
    // itself and a "finite" stencil would be meaningless), and the deepest halving reaching it.
    const sMin = Math.max(step / 2 ** EDGE_HALVINGS, 4 * EPS * Math.abs(ex ? p.x : p.y));
    const mMax = Math.max(1, Math.floor(Math.log2(step / sMin)));
    // Smallest m in [1, mMax] with both stencil points finite at step 2^-m (monotone: closer to p
    // stays inside the domain), by binary search.
    const bothFinite = (m: number) => {
      const s = step / 2 ** m;
      return finiteVec(at(s)) && finiteVec(at(-s));
    };
    if (bothFinite(mMax)) {
      let lo = 0, hi = mMax; // lo: known to fail, hi: known to work
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (bothFinite(mid)) hi = mid;
        else lo = mid;
      }
      // The edge lies between step 2^-hi and step 2^-lo from p; a quarter of the working step
      // keeps the central difference's O((s / d)^2) error small for a sqrt-type edge.
      const s = Math.max(step / 2 ** (hi + 2), sMin);
      return central(s, at(s), at(-s));
    }
    // p is on the edge itself (no finite pair down to sMin): one-sided, smallest step.
    const fwd = at(sMin);
    if (finiteVec(fwd)) return [(fwd.x - F0.x) / sMin, (fwd.y - F0.y) / sMin];
    const bwd = at(-sMin);
    if (finiteVec(bwd)) return [(F0.x - bwd.x) / sMin, (F0.y - bwd.y) / sMin];
    return central(step, plus, minus);
  };
  const cx = column(1, 0);
  const cy = column(0, 1);
  return [
    [cx[0], cy[0]],
    [cx[1], cy[1]],
  ];
}

export type JacobianWithError = {
  J: Matrix2;
  /** Largest of `errors` (truncation plus rounding); Infinity when J is not finite. */
  error: number;
  /**
   * Estimated absolute error of EACH entry (review J item 6): entry (i, j) = ∂F_i/∂x_j carries its
   * own truncation |J_h - J_2h|_ij / 3 and its own rounding floor eps |F_i| / h measured on the
   * stencil of column j. A single error for the whole matrix let the 1e8 entry of
   * [[1e8, 1], [-1, 1e-8]] (rounding ~4e-8) hide the determinant 2: e (|a| + |b| + |c| + |d|)
   * ~ 4e3, whereas the per-entry propagation e_a |d| + e_d |a| + e_b |c| + e_c |b| is ~1e-15.
   * All Infinity when J is not finite.
   */
  errors: Matrix2;
  /**
   * True when the central stencil crosses the edge of the field's domain: the field is finite at
   * p and on one side of it, not on the other (x' = sqrt(x) at x = 0). J is then the (non-finite)
   * central difference: the linearization does not exist at such a point, only a one-sided
   * derivative does, and no classification follows from it.
   */
  domainEdge: boolean;
  /** The finite-difference step J was taken with (after the truncation/rounding balance below). */
  h: number;
};

/** jacobianWithError shrinks its step until the truncation estimate is below this fraction of the largest entry (or rounding forbids). */
export const JACOBIAN_TRUNCATION_TARGET = 1e-7;
/** Most quarterings of the step in jacobianWithError. */
export const JACOBIAN_STEP_HALVINGS = 20;
/** Safety factor on the expression's rounding bound in the rounding term of the Jacobian's error. */
export const ROUNDING_SAFETY = 4;

/**
 * Jacobian with an error estimate: central differences at h and 2h (truncation ≈ |J_h - J_2h| / 3,
 * the leading h² term) plus the rounding floor eps * |f| / h. Callers use the error as the level
 * below which an entry is zero for this problem (review C4): a finite-difference Jacobian of
 * ~1e-12 at a double root is zero, an O(1) Jacobian in a field whose box-wide median is 1e9 is not.
 *
 * The step starts at 1e-6 × max(`scale`, |p|), where `scale` is the caller's unit of length (the
 * box size in findEquilibria) with NO absolute floor (J-fix2 item 4): a fixed 1e-6 spans 2.5
 * boxes in units where the box is 4e-7 wide (J00 = 3 read as 103 for x' = 1e14 x³ - 1e-7).
 * Without `scale` the unit is 1 (a bare call that knows no box). It is then adapted to the
 * FUNCTION: while the truncation estimate exceeds JACOBIAN_TRUNCATION_TARGET times the largest
 * entry and a quartering of the step would still leave the rounding floor (4x, from the
 * expression's own terms when the system carries a rounding bound) below the new truncation
 * (1/16), the step is quartered, at most JACOBIAN_STEP_HALVINGS times and never below the
 * coordinates' own resolution 4 eps |p|. So the saddle (1, 0) of x' = y, y' = -x - y + x⁷ has
 * det = -6 to 1e-6 on [-1e4, 1e4]² (the box rule alone gives h = 0.02 and det = -6.014), and
 * sin at |p| = 3e4 keeps its ±1 entries. The step used is returned as `h`.
 */
export function jacobianWithError(sys: CompiledSystem, p: Vec2, t = 0, opts: { scale?: number } = {}): JacobianWithError {
  let h = 1e-6 * Math.max(opts.scale ?? 1, Math.hypot(p.x, p.y));
  const hMin = 4 * EPS * Math.max(Math.abs(p.x), Math.abs(p.y));
  const infinite: Matrix2 = [[Infinity, Infinity], [Infinity, Infinity]];
  // Rounding floor of column j, per component i, over 2h: ROUNDING_SAFETY times the larger of the
  // expression's own rounding bounds at the two stencil points when the system carries them (the
  // bound is a first-order model with one eps per operation; the factor keeps the estimate at the
  // level of the older 4 eps |F_i|, which it equals for x³), else 4 eps × the largest |F_i| on the
  // stencil.
  const roundingAt = (step: number): Matrix2 => {
    const pts = [
      [{ x: p.x + step, y: p.y }, { x: p.x - step, y: p.y }],
      [{ x: p.x, y: p.y + step }, { x: p.x, y: p.y - step }],
    ];
    const out: Matrix2 = [[0, 0], [0, 0]];
    for (let j = 0; j < 2; j++) {
      if (sys.roundingBound) {
        const bounds = pts[j].map((q) => sys.roundingBound!(q, t));
        for (let i = 0; i < 2; i++) out[i][j] = (ROUNDING_SAFETY * Math.max(...bounds.map((b) => (Number.isFinite(b[i].error) ? b[i].error : 0)))) / (2 * step);
      } else {
        const vals = pts[j].map((q) => sys.eval(q, t));
        for (let i = 0; i < 2; i++) {
          const mags = vals.map((v) => Math.abs(i === 0 ? v.x : v.y)).filter(Number.isFinite);
          out[i][j] = (4 * EPS * (mags.length ? Math.max(...mags) : 0)) / (2 * step);
        }
      }
    }
    return out;
  };
  let J = jacobianAt(sys, p, h, t);
  if (!allFinite(J)) {
    const domainEdge = finiteVec(sys.eval(p, t)) && allFinite(jacobianAt(sys, p, h, t, { oneSided: true }));
    return { J, error: Infinity, errors: infinite, domainEdge, h };
  }
  let J2 = jacobianAt(sys, p, 2 * h, t);
  let rounding = roundingAt(h);
  const largest = (M: Matrix2) => Math.max(Math.abs(M[0][0]), Math.abs(M[0][1]), Math.abs(M[1][0]), Math.abs(M[1][1]));
  const truncationOf = (A: Matrix2, B: Matrix2): Matrix2 => A.map((row, i) => row.map((v, j) => Math.abs(v - B[i][j]) / 3)) as Matrix2;
  let truncation = truncationOf(J, J2);
  for (let k = 0; k < JACOBIAN_STEP_HALVINGS; k++) {
    const tr = largest(truncation);
    if (!(tr > JACOBIAN_TRUNCATION_TARGET * largest(J)) || !(largest(rounding) * 4 < tr / 16) || h / 4 < hMin) break;
    const hNext = h / 4;
    const JNext = jacobianAt(sys, p, hNext, t);
    if (!allFinite(JNext)) break;
    // J at 2 hNext is the previous J at h / 2... not computed; take it at the same cost as before.
    const J2Next = jacobianAt(sys, p, 2 * hNext, t);
    if (!allFinite(J2Next)) break;
    h = hNext;
    J = JNext;
    J2 = J2Next;
    rounding = roundingAt(h);
    truncation = truncationOf(J, J2);
  }
  const errors: Matrix2 = [[0, 0], [0, 0]];
  let error = 0;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      errors[i][j] = Number.isFinite(truncation[i][j]) ? truncation[i][j] + rounding[i][j] : Infinity;
      error = Math.max(error, errors[i][j]);
    }
  }
  return { J, error, errors, domainEdge: false, h };
}

/**
 * How fast the Jacobian changes with the point: the largest entry of |J(p ± d e) - J(p)| / d over
 * both axes (an estimate of the largest second derivative). Multiplied by the uncertainty of a
 * root's location it gives the part of the Jacobian's error that comes from not standing exactly
 * on the root: at a double root f = x² Newton stops at x ~ 1e-13 with f'(x) = 2e-13, which is
 * not a resolved eigenvalue but the location error times f'' = 2. An axis whose displaced
 * Jacobians are non-finite on both sides contributes nothing. Non-negative, possibly 0.
 */
export function jacobianSensitivity(sys: CompiledSystem, p: Vec2, J: Matrix2, d?: number, t = 0): number {
  const S = jacobianSensitivityEntries(sys, p, J, d, t);
  return Math.max(S[0][0], S[0][1], S[1][0], S[1][1]);
}

/**
 * Per-entry version of jacobianSensitivity: entry (i, j) is the largest |K_ij - J_ij| / d over the
 * displaced Jacobians K (review J item 6: the location error moves each entry by its own second
 * derivative; for x' = 1e10 x, y' = 1e-10 y the 1e10 entry's rounding noise must not be charged to
 * the 1e-10 entry). jacobianSensitivity is the largest entry of this matrix.
 */
export function jacobianSensitivityEntries(sys: CompiledSystem, p: Vec2, J: Matrix2, d?: number, t = 0): Matrix2 {
  const step = d ?? 1e-6 * Math.max(1, Math.hypot(p.x, p.y));
  const worst: Matrix2 = [[0, 0], [0, 0]];
  for (const dir of [{ x: 1, y: 0 }, { x: 0, y: 1 }]) {
    for (const sign of [1, -1]) {
      // The displaced Jacobian uses the same step (the default would reintroduce the absolute floor of 1e-6).
      const K = jacobianAt(sys, { x: p.x + sign * step * dir.x, y: p.y + sign * step * dir.y }, step, t);
      if (!allFinite(K)) continue;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) worst[i][j] = Math.max(worst[i][j], Math.abs(K[i][j] - J[i][j]) / step);
      break;
    }
  }
  return worst;
}

export function trace(J: Matrix2): number {
  return J[0][0] + J[1][1];
}

export function determinant(J: Matrix2): number {
  return J[0][0] * J[1][1] - J[0][1] * J[1][0];
}

/**
 * Eigenvalues of a 2x2 matrix from the characteristic polynomial λ² - tr λ + det = 0.
 * Real pairs are returned largest first; complex pairs with positive imaginary part first.
 */
export function eigenvalues2(J: Matrix2): [Complex, Complex] {
  const tr = trace(J);
  const det = determinant(J);
  // (a - d)² + 4bc: tr² - 4 det cancels to rounding noise near a repeated root.
  const disc = (J[0][0] - J[1][1]) * (J[0][0] - J[1][1]) + 4 * J[0][1] * J[1][0];
  if (disc >= 0) {
    // The root of larger magnitude by the quadratic formula, the other as det / λ₁ (no
    // cancellation: diag(1, 1e-20) has eigenvalues 1 and 1e-20, not 1 and 0), largest first.
    const s = Math.sqrt(disc);
    const l1 = tr >= 0 ? (tr + s) / 2 : (tr - s) / 2;
    const l2 = l1 !== 0 && Number.isFinite(l1) ? det / l1 : (tr - (tr >= 0 ? s : -s)) / 2;
    const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return [
      { re: hi, im: 0 },
      { re: lo, im: 0 },
    ];
  }
  const im = Math.sqrt(-disc) / 2;
  return [
    { re: tr / 2, im },
    { re: tr / 2, im: -im },
  ];
}
