/**
 * Equilibrium search: seeds on a grid, damped Newton (Levenberg-Marquardt fallback when the
 * Jacobian is singular), de-duplication, classification.
 *
 * Degenerate cases are reported, never thrown:
 * - no seed converges                    -> warning 'none_found'
 * - the found points look like a curve    -> warning 'possible_continuum' (list truncated)
 * - more isolated points than maxPoints   -> warning 'hit_limit' (list truncated)
 * - a seed that diverges or stalls        -> silently dropped
 */
import { classify, type ClassifyResult } from "./classify";
import { assertBox } from "./field";
import { determinant, jacobianAt, jacobianWithError } from "./jacobian";
import type { CompiledSystem } from "./parse";
import type { Box, Matrix2, Vec2 } from "./types";

export type Equilibrium = { at: Vec2; jacobian: Matrix2 } & ClassifyResult;

export type EquilibriaWarning = "none_found" | "possible_continuum" | "multiple_non_hyperbolic" | "hit_limit";

export type EquilibriaResult = {
  points: Equilibrium[];
  warning?: EquilibriaWarning;
  /**
   * Geometry of the non-hyperbolic points when there are enough of them to ask (>= 3 and >= 60%):
   * `collinearity` is the ratio of the covariance eigenvalues (0 = a perfect line), `curveLike`
   * the fraction of points whose nearest neighbours are locally collinear. Both are what decided
   * between 'possible_continuum' and 'multiple_non_hyperbolic'.
   */
  geometry?: { collinearity: number; curveLike: number; connected: number };
};

/** Continuum test thresholds (H2.7). */
export const COLLINEAR_RATIO = 1e-6;
export const CURVE_LOCAL_RATIO = 0.02;
export const CURVE_FRACTION = 0.8;
export const CURVE_MIN_POINTS = 6;
export const CONNECTED_FRACTION = 0.8;

/** Ratio λ_min / λ_max of the covariance matrix of a point cloud: 0 for a perfect line, 1 for an isotropic cloud. NaN for fewer than 3 points. */
export function collinearity(points: Vec2[]): number {
  if (points.length < 3) return NaN;
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of points) {
    const dx = p.x - mx, dy = p.y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  if (!(tr > 0)) return 0; // all points coincide: degenerate, treat as a line
  const disc = Math.sqrt(Math.max(0, tr * tr - 4 * det));
  const lMax = (tr + disc) / 2;
  const lMin = Math.max(0, (tr - disc) / 2);
  return lMin / lMax;
}

/**
 * Fraction of points whose nearest neighbour is CONNECTED to them by equilibria: a Newton polish
 * from the chord midpoint must land on an equilibrium strictly between the two (not at either end).
 * True for a line or curve of equilibria (the field vanishes all along it), false for isolated
 * roots that merely happen to be collinear (the field is non-zero between them).
 */
function connectedFraction(sys: CompiledSystem, pts: Vec2[], box: Box, scale: number, fTol: number, maxIterations: number): number {
  if (pts.length < 2) return 0;
  let connected = 0;
  for (const p of pts) {
    let q: Vec2 | null = null;
    let best = Infinity;
    for (const r of pts) {
      if (r === p) continue;
      const d = Math.hypot(r.x - p.x, r.y - p.y);
      if (d < best) { best = d; q = r; }
    }
    if (!q) continue;
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const polished = newton(sys, mid, box, scale, fTol, maxIterations);
    if (!polished) continue;
    const gap = Math.hypot(q.x - p.x, q.y - p.y);
    if (Math.hypot(polished.x - p.x, polished.y - p.y) < 0.9 * gap && Math.hypot(polished.x - q.x, polished.y - q.y) < 0.9 * gap) connected++;
  }
  return connected / pts.length;
}

/**
 * Fraction of points whose k nearest neighbours (plus the point itself) form a locally collinear
 * set: on a densely sampled smooth curve every small neighbourhood is nearly a straight segment,
 * on a scattered set of isolated points it is not.
 */
export function curveLikeFraction(points: Vec2[], k = 4): number {
  if (points.length < CURVE_MIN_POINTS) return 0;
  let locallyLinear = 0;
  for (const p of points) {
    const neighbours = points
      .filter((q) => q !== p)
      .map((q) => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
      .map((e) => e.q);
    if (collinearity([p, ...neighbours]) < CURVE_LOCAL_RATIO) locallyLinear++;
  }
  return locallyLinear / points.length;
}

export type FindEquilibriaOptions = {
  /** Seeds per axis (seedGrid² Newton runs). Default 12. */
  seedGrid?: number;
  /** Relative residual tolerance for convergence. Default 1e-9. */
  tol?: number;
  /** Maximum points returned. Default 30. */
  maxPoints?: number;
  /** Newton iterations per seed. Default 200 (multiple roots converge only linearly). */
  maxIterations?: number;
  /** Called before every seed; a caller enforcing a wall-clock budget throws from it. */
  checkpoint?: () => void;
};

const norm = (v: Vec2) => Math.hypot(v.x, v.y);
const isFiniteVec = (v: Vec2) => Number.isFinite(v.x) && Number.isFinite(v.y);

/**
 * Solves J d = -F, falling back to Levenberg-Marquardt when J is (nearly) singular. Marquardt's
 * diagonal scaling (JᵀJ + λ diag(JᵀJ)) keeps the step in a weak direction Newton-sized (for
 * x' = -x³ the x step is x/3, geometric convergence) instead of killing it with a λ taken from
 * the strong direction (review C3). `lm` tells the caller which branch produced the step.
 */
function newtonDirection(J: Matrix2, F: Vec2, scale: number): { dir: Vec2; lm: boolean } | null {
  const [[a, b], [c, d]] = J;
  if (![a, b, c, d].every(Number.isFinite)) return null;
  const det = determinant(J);
  const jNorm = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), 1e-300);
  if (Math.abs(det) > 1e-10 * jNorm * jNorm) {
    return { dir: { x: -(d * F.x - b * F.y) / det, y: -(-c * F.x + a * F.y) / det }, lm: false };
  }
  const g00 = a * a + c * c;
  const g11 = b * b + d * d;
  const g01 = a * b + c * d;
  const lambda = 1e-6;
  // Only guards against an exactly zero diagonal: any larger floor would dominate g00 = a² once the
  // weak-direction derivative is ~1e-16 (x' = -x³ at x ~ 1e-8) and stall the convergence.
  const floor = 1e-300;
  const m00 = g00 * (1 + lambda) + floor;
  const m11 = g11 * (1 + lambda) + floor;
  const g0 = -(a * F.x + c * F.y);
  const g1 = -(b * F.x + d * F.y);
  const mdet = m00 * m11 - g01 * g01;
  if (!(Math.abs(mdet) > 0)) return null;
  return { dir: { x: (m11 * g0 - g01 * g1) / mdet, y: (-g01 * g0 + m00 * g1) / mdet }, lm: true };
}

function newton(
  sys: CompiledSystem,
  seed: Vec2,
  box: Box,
  scale: number,
  fTol: number,
  maxIterations: number,
): Vec2 | null {
  let p = seed;
  let F = sys.eval(p);
  if (!isFiniteVec(F)) return null;
  let fNorm = norm(F);
  const escape = 2 * scale; // how far outside the box a seed may wander before we give up
  // Converge on the step as well as on the residual: at a multiple root the residual reaches fTol
  // while the point is still ~sqrt(fTol) away, and different seeds would stop at different places
  // (each then mis-classified as hyperbolic). Newton still shrinks the step geometrically there.
  const stepTol = 1e-13 * scale;
  let lastStep = Infinity;
  let lastFromLM = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    // A microscopic Levenberg-Marquardt step is not evidence of convergence (it may simply have
    // been damped); only a Newton-branch step that has shrunk below stepTol counts (review C3).
    if (fNorm <= fTol && lastStep <= stepTol && !lastFromLM) return p;
    // Finite-difference step for the Jacobian: shrink it with the Newton step. Near a multiple
    // root the truncation error h^2 f_xxx / 6 of a fixed h = 1e-6 swamps the true derivative
    // (3x^2 for x' = -x^3 once x < 6e-7) and the damped step crawls; h ~ step/100 keeps the
    // error far below the derivative while rounding (eps |f| / h) stays negligible.
    const hJ = Math.min(1e-6 * Math.max(1, Math.hypot(p.x, p.y)), Math.max(1e-2 * lastStep, 1e-15 * scale));
    const nd = newtonDirection(jacobianAt(sys, p, hJ), F, scale);
    if (nd === null || !isFiniteVec(nd.dir)) return fNorm <= fTol ? p : null;
    const dir = nd.dir;
    lastFromLM = nd.lm;

    // Backtracking: accept the first step that does not increase the residual.
    let step = 1;
    let accepted = false;
    for (let k = 0; k < 12; k++) {
      const q = { x: p.x + step * dir.x, y: p.y + step * dir.y };
      const Fq = sys.eval(q);
      if (isFiniteVec(Fq) && norm(Fq) < fNorm) {
        lastStep = step * norm(dir);
        p = q;
        F = Fq;
        fNorm = norm(Fq);
        accepted = true;
        break;
      }
      step /= 2;
    }
    // No decrease possible: either we are at the root up to rounding, or the seed is hopeless.
    if (!accepted) return fNorm <= fTol ? p : null;
    if (
      p.x < box.x.min - escape || p.x > box.x.max + escape ||
      p.y < box.y.min - escape || p.y > box.y.max + escape
    ) {
      return null;
    }
  }
  return fNorm <= fTol ? p : null;
}

export function findEquilibria(sys: CompiledSystem, box: Box, opts: FindEquilibriaOptions = {}): EquilibriaResult {
  assertBox(box);
  const seedGrid = opts.seedGrid ?? 12;
  const tol = opts.tol ?? 1e-9;
  const maxPoints = opts.maxPoints ?? 30;
  const maxIterations = opts.maxIterations ?? 200;
  if (!Number.isInteger(seedGrid) || seedGrid < 1) throw new RangeError("seedGrid must be a positive integer.");

  const width = box.x.max - box.x.min;
  const height = box.y.max - box.y.min;
  const scale = Math.max(width, height);

  // Seeds at cell centres so that exact boundaries (often singular) are avoided.
  const seeds: Vec2[] = [];
  const mags: number[] = [];
  for (let j = 0; j < seedGrid; j++) {
    for (let i = 0; i < seedGrid; i++) {
      const s = { x: box.x.min + ((i + 0.5) * width) / seedGrid, y: box.y.min + ((j + 0.5) * height) / seedGrid };
      seeds.push(s);
      const m = norm(sys.eval(s));
      if (Number.isFinite(m)) mags.push(m);
    }
  }
  // Residual tolerance relative to the typical field strength in the box.
  mags.sort((u, v) => u - v);
  const typical = mags.length ? Math.max(mags[Math.floor(mags.length / 2)], 1e-300) : 1;
  const fTol = tol * Math.max(1, typical);

  const found: Vec2[] = [];
  // Equilibria sitting exactly on a box edge are legitimate; allow the located point to overshoot
  // the edge by the same amount we use to merge duplicates.
  const margin = 1e-6 * scale;
  const dedupe = 1e-6 * scale;
  for (const seed of seeds) {
    opts.checkpoint?.();
    const p = newton(sys, seed, box, scale, fTol, maxIterations);
    if (p === null) continue;
    if (p.x < box.x.min - margin || p.x > box.x.max + margin || p.y < box.y.min - margin || p.y > box.y.max + margin) {
      continue;
    }
    if (found.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= dedupe)) continue;
    found.push(p);
  }

  found.sort((u, v) => u.x - v.x || u.y - v.y);

  // A Jacobian whose entries are all within (10x) the numerical error of the finite differences
  // is zero for this problem: multiple roots, where Newton stops a hair from the root. The floor
  // is local to the point, never a box-wide statistic (review C4).
  const equilibria: Equilibrium[] = found.map((at) => {
    const { J: jacobian, error } = jacobianWithError(sys, at);
    return { at, jacobian, ...classify(jacobian, undefined, { zeroFloor: 10 * error }) };
  });

  if (equilibria.length === 0) return { points: [], warning: "none_found" };

  // A continuum of equilibria needs BOTH a counting signal (many non-hyperbolic points) and a
  // geometric one (they lie on a line or, more generally, on a curve). Counting alone would call
  // four isolated degenerate points a continuum (H2.7).
  const nonHyperbolic = equilibria.filter((e) => e.classification === "non_hyperbolic");
  const manyNonHyperbolic = equilibria.length >= 3 && nonHyperbolic.length >= Math.ceil(0.6 * equilibria.length);
  let geometry: EquilibriaResult["geometry"];
  let continuum = false;
  if (manyNonHyperbolic) {
    const pts = nonHyperbolic.map((e) => e.at);
    const shape = collinearity(pts) <= COLLINEAR_RATIO || (pts.length >= CURVE_MIN_POINTS && curveLikeFraction(pts) >= CURVE_FRACTION);
    // Shape is not enough: isolated double roots on a line have the shape of a continuum. The field
    // must also vanish BETWEEN neighbouring points (review C5).
    const connected = shape ? connectedFraction(sys, pts, box, scale, fTol, maxIterations) : 0;
    geometry = { collinearity: collinearity(pts), curveLike: curveLikeFraction(pts), connected };
    continuum = shape && connected >= CONNECTED_FRACTION;
  }
  const warning: EquilibriaWarning | undefined = continuum ? "possible_continuum" : manyNonHyperbolic ? "multiple_non_hyperbolic" : undefined;

  if (equilibria.length > maxPoints) {
    return { points: equilibria.slice(0, maxPoints), warning: warning ?? "hit_limit", geometry };
  }
  return warning ? { points: equilibria, warning, geometry } : { points: equilibria };
}
