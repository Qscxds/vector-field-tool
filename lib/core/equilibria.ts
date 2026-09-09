/**
 * Equilibrium search: seeds on a grid, damped Newton (row-equilibrated solve; truncated
 * pseudo-inverse step when the Jacobian is numerically rank-deficient), LOCAL acceptance of a
 * root (the residual against the Jacobian at the point and its rounding floor, never a residual
 * tolerance taken from the box), a vanishing test (the field must tend to its value at the point
 * from every defined direction, else the point is a singularity of the field and goes to
 * `singularPoints`), de-duplication within the resolution each run achieved, classification with
 * per-entry Jacobian errors.
 *
 * Missing an equilibrium is worse than misclassifying one (it silently tells the student
 * "nothing is there"), so the search seeds Newton from FOUR independent sources:
 *
 * 1. A regular seedGrid x seedGrid grid of cell centres. Its density adapts to the field's
 *    structure and is SCALE-FREE (a rule based on the box size in units would flip with a change
 *    of units): on the scan grid of (2), the sign changes of f and of g are counted along every
 *    row and every column (finite values only); with c the largest count on any line,
 *    seedGrid = clamp(SEED_GRID_MIN, 4 + 2c, SEED_GRID_MAX) unless opts.seedGrid is given, in
 *    which case it stays fixed (tool caps).
 * 2. A self-check on |F| = sqrt(f² + g²) sampled at the centres of a scanGrid x scanGrid grid
 *    (default 64): every cell whose |F| is a local minimum among its available 8 neighbours
 *    (<= all finite neighbours with at least one strict <; plateaus count) seeds a Newton run,
 *    and so does a cell next to undefined cells (the edge of the field's domain) whose |F| is the
 *    smallest among its neighbours that are also next to undefined cells (a minimum ALONG the
 *    edge; "small" must be relative to something measured, and the edge band is what is there).
 *    Candidates are taken in increasing |F| order and capped at SCAN_SEED_CAP; the cap is
 *    reported in `seeding.capped`, never applied silently.
 * 3. Domain-edge seeds: from every scan cell next to an undefined cell, the last finite point
 *    toward the undefined neighbour (bisection) seeds a run ON the edge itself, so a root set
 *    lying along the edge (x' = sqrt(x) y, y' = x on x = 0) is found point by point instead of
 *    being walked to the origin by a linearization across the edge. Capped at EDGE_CELL_CAP
 *    cells (`seeding.edgeCapped`).
 * 4. A sign-change quadtree: f and g at the scan cells' corners; a cell on whose corners BOTH
 *    change sign seeds a run from its centre and is split into four (its sub-cells with both
 *    sign changes queued) until a located root lies inside, down to REFINE_MAX_DEPTH. This is
 *    the mechanism that does not depend on |F| minima or on a seed happening to fall into a
 *    root's basin (the origin of x' = y, y' = -x - y + x⁷ on [-100, 100]²). Capped by
 *    REFINE_CELL_CAP runs, REFINE_VISIT_CAP cells and REFINE_ROOT_CAP located roots
 *    (`seeding.refineCapped`).
 *
 * Roots on the edge of the field's domain (x' = sqrt(x), y' = y at the origin: the field is NaN
 * for x < 0) are reached with one-sided differences for the Jacobian columns whose stencil leaves
 * the domain (jacobianAt oneSided) and the usual backtracking (a step into undefined territory
 * halves). Such a point gets classification non_hyperbolic with caveat 'domainEdge': the
 * linearization does not exist there.
 *
 * Degenerate cases are reported, never thrown:
 * - no seed converges                    -> warning 'none_found'
 * - the found points look like a curve    -> warning 'possible_continuum'
 * - many non-hyperbolic points that do not form a curve -> warning 'multiple_non_hyperbolic'
 * - more points than maxPoints            -> `truncated` true; the warning keeps its geometric value,
 *                                            and is 'hit_limit' when there is no other
 * - a seed that diverges or stalls        -> dropped, unless the field is discontinuous where it
 *                                            stalled: then `singularPoints` (best effort: only
 *                                            points some run actually ends at are tested)
 *
 * A continuum of equilibria needs a count signal (many non-hyperbolic points), connectedness (the
 * field vanishes between neighbours: a chord-midpoint Newton polish lands strictly between them)
 * and a shape signal (a line or a curve). Connectedness comes first: the non-hyperbolic points are
 * grouped into connected components (union-find over each point's nearest neighbours), then the
 * shape test runs per component, so two parallel lines of equilibria are two continuum components
 * and not a scattered cloud.
 */
import { classify, type ClassifyResult } from "./classify";
import { assertBox } from "./field";
import { jacobianAt, jacobianSensitivityEntries, jacobianWithError } from "./jacobian";
import type { CompiledSystem } from "./parse";
import type { Box, Matrix2, Vec2 } from "./types";
import { LIPSCHITZ_FIRST_FRACTION, MIN_LEVELS_FOR_GROWTH, lipschitzProbe, type UniquenessResult } from "./uniqueness";

/** `uniqueness` is attached by the callers that ask for it (equilibriaUniqueness in uniqueness.ts); findEquilibria leaves it unset. */
export type Equilibrium = { at: Vec2; jacobian: Matrix2; uniqueness?: UniquenessResult } & ClassifyResult;

export type EquilibriaWarning = "none_found" | "possible_continuum" | "multiple_non_hyperbolic" | "hit_limit";

export type SeedingReport = {
  /** Seeds per axis of the regular grid actually used (adaptive unless opts.seedGrid was given). */
  seedGrid: number;
  /** Cells per axis of the |F| scan. */
  scanGrid: number;
  /** Largest number of sign changes of f or g along any row or column of the scan. */
  signChanges: number;
  /** Scan cells that qualified as Newton seeds (local minima of |F| and domain-edge cells). */
  candidates: number;
  /** Scan candidates actually run (after the cap). */
  seeds: number;
  /** True when candidates exceeded SCAN_SEED_CAP: some local minima were NOT searched. */
  capped: boolean;
  /** Domain-edge seeds run: points ON the edge of the field's domain, found by bisection from each edge cell toward its undefined neighbour. */
  edgeSeeds: number;
  /** True when more edge cells existed than EDGE_CELL_CAP: some of the domain's edge was NOT searched. */
  edgeCapped: boolean;
  /** Sign-change cells (both f and g change sign on the cell's corners) from which Newton ran, over all quadtree depths. */
  refined: number;
  /** True when the sign-change quadtree hit REFINE_CELL_CAP with cells still pending: some sign-change cells were NOT searched. */
  refineCapped: boolean;
};

export type EquilibriaResult = {
  points: Equilibrium[];
  warning?: EquilibriaWarning;
  /** True when more equilibria were found than `maxPoints`; `points` holds the first maxPoints (sorted by x, then y). Independent of `warning`. */
  truncated?: boolean;
  /**
   * Geometry of the non-hyperbolic points when there are enough of them to ask (>= 3 and >= 60%):
   * `collinearity` is the ratio of the covariance eigenvalues of ALL of them (0 = a perfect line),
   * `curveLike` the fraction whose nearest neighbours are locally collinear, `connected` the
   * fraction that is joined to at least one neighbour by equilibria (the field vanishes between
   * them), `components` the number of connected components and `continuumComponents` how many of
   * those (with >= 3 points) pass the shape test. 'possible_continuum' iff continuumComponents >= 1.
   */
  geometry?: { collinearity: number; curveLike: number; connected: number; components: number; continuumComponents: number };
  /** How the search was seeded, including whether the scan cap was hit. */
  seeding: SeedingReport;
  /**
   * Converged Newton points that failed the vanishing test: the field is undefined or
   * discontinuous there (x' = xy / (x² + y²), y' = y - x at the origin: |F| tends to 0 along the
   * axes and to 0.5 along the diagonals), so they are NOT equilibria and are not in `points`.
   * Present only when non-empty.
   */
  singularPoints?: Vec2[];
};

/** Continuum test thresholds (H2.7). */
export const COLLINEAR_RATIO = 1e-6;
export const CURVE_LOCAL_RATIO = 0.02;
export const CURVE_FRACTION = 0.8;
export const CURVE_MIN_POINTS = 6;
/** @deprecated Connectedness is now decided per component; kept for callers that read the old threshold. */
export const CONNECTED_FRACTION = 0.8;
/** Neighbours per point considered for connectedness edges. */
export const COMPONENT_NEIGHBOURS = 4;

/** Seeding rule constants (see the file header). */
export const SEED_GRID_MIN = 12;
export const SEED_GRID_MAX = 32;
export const SCAN_GRID_DEFAULT = 64;
export const SCAN_SEED_CAP = 400;
/** Edge cells (finite centre next to an undefined centre) bisected for a seed on the domain's edge, at most. */
export const EDGE_CELL_CAP = 256;
/** Sign-change quadtree (review J item 4): deepest subdivision of a scan cell, and the total number of cells Newton runs from. */
export const REFINE_MAX_DEPTH = 12;
export const REFINE_CELL_CAP = 1024;
/** Cells examined (popped, split) by the quadtree, at most: bounds the corner evaluations (5 per split). */
export const REFINE_VISIT_CAP = 8192;
/**
 * Located roots at which the quadtree stops running Newton: along a continuum every sub-cell
 * holds a new root and the refinement would only add points (and quadratic continuum-analysis
 * cost) without changing the verdict, which needs a few dozen.
 */
export const REFINE_ROOT_CAP = 128;
/** Newton stops on a step below this fraction of the box size; a root is located to about this precision. */
export const NEWTON_STEP_TOL = 1e-13;
/**
 * Scaled determinant (rows equilibrated by their largest entry) below which a Jacobian is treated
 * as numerically rank-deficient and the least-squares step is used: the FD Jacobian's relative
 * error (~1e-8 at h = 1e-6 with rounding eps |f| / h) makes smaller scaled determinants noise.
 */
export const SINGULAR_SCALED_DET = 1e-8;
/**
 * A Newton run within this fraction of the box of an already found root, whose own step predicts
 * a landing at least twice as close to that root, is abandoned (it would reproduce the root).
 */
export const ABORT_RADIUS = 1e-6;
/** Relative resolution of a root's location: two converged points closer than this times |p| are one root. */
export const LOCATION_RELATIVE_TOL = 1e-9;
/**
 * Vanishing test (review J item 8): |F(p + δ e) - F(p)| ~ δ^β is fitted along 8 directions with
 * δ from VANISHING_DELTA_FACTOR × stepTol downward (lipschitzProbe's levels); β <= this in some
 * defined direction means F does not tend to F(p) there: the field is discontinuous at p and p
 * is a singular point, not an equilibrium (x' = xy / (x² + y²): F is 0.5 along every diagonal at
 * every distance). A Hölder root (sqrt(x): β = 1/2) still vanishes and stays an equilibrium.
 */
export const VANISHING_MIN_EXPONENT = 0.1;
/** First probe offset of the vanishing test, as a multiple of stepTol (the location resolution). */
export const VANISHING_DELTA_FACTOR = 1e3;
const EPS = 2.220446049250313e-16;

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

/** Shape test of one connected component: a line, or (with enough points) a smooth curve. */
function componentIsCurve(pts: Vec2[]): boolean {
  if (pts.length < 3) return false;
  return collinearity(pts) <= COLLINEAR_RATIO || (pts.length >= CURVE_MIN_POINTS && curveLikeFraction(pts) >= CURVE_FRACTION);
}

/** Edges of the Euclidean minimum spanning tree of `pts` (Prim, O(n²)), as index pairs. */
function spanningTreeEdges(pts: Vec2[]): [number, number][] {
  const n = pts.length;
  if (n < 2) return [];
  const inTree = new Array<boolean>(n).fill(false);
  const best = new Array<number>(n).fill(Infinity);
  const from = new Array<number>(n).fill(0);
  inTree[0] = true;
  for (let j = 1; j < n; j++) { best[j] = Math.hypot(pts[j].x - pts[0].x, pts[j].y - pts[0].y); from[j] = 0; }
  const edges: [number, number][] = [];
  for (let k = 1; k < n; k++) {
    let next = -1;
    for (let j = 0; j < n; j++) if (!inTree[j] && (next < 0 || best[j] < best[next])) next = j;
    inTree[next] = true;
    edges.push([from[next], next]);
    for (let j = 0; j < n; j++) {
      if (inTree[j]) continue;
      const d = Math.hypot(pts[j].x - pts[next].x, pts[j].y - pts[next].y);
      if (d < best[j]) { best[j] = d; from[j] = next; }
    }
  }
  return edges;
}

/**
 * Connected components of a point set under the relation "the field vanishes between them": a
 * pair of points is joined when a Newton polish from their chord midpoint lands on an equilibrium
 * strictly between the two (not at either end) that is NOT one of the equilibria already listed
 * (`known`, with the dedupe distance): the edge is evidence that the field vanishes at a point
 * nobody had found. True along a line or curve of equilibria, false for isolated roots that
 * merely happen to be collinear (the field is non-zero between them, review C5), including
 * evenly spaced ones whose second neighbour's midpoint is simply the first neighbour.
 *
 * Pairs tested: each point with its COMPONENT_NEIGHBOURS nearest neighbours, plus the edges of
 * the Euclidean minimum spanning tree. The tree matters when the sampling is uneven (a circle
 * sampled in clusters): every cut of the point set is crossed by a tree edge, so a genuine
 * continuum can never be split into several components merely because all four nearest
 * neighbours of the points on each side of a gap lie on their own side. Union-find; every pair
 * is polished at most once.
 */
function connectedComponents(
  sys: CompiledSystem,
  pts: Vec2[],
  known: Vec2[],
  dedupe: number,
  box: Box,
  scale: number,
  maxIterations: number,
  checkpoint: (() => void) | undefined,
): { component: number[]; count: number; connected: number } {
  const n = pts.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i: number, j: number) => {
    const a = find(i), b = find(j);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    pts
      .map((q, j) => ({ j, d: Math.hypot(q.x - p.x, q.y - p.y) }))
      .filter((e) => e.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, COMPONENT_NEIGHBOURS)
      .forEach(({ j }) => pairs.push([i, j]));
  }
  pairs.push(...spanningTreeEdges(pts));
  const tested = new Set<number>();
  const hasEdge = new Array<boolean>(n).fill(false);
  for (const [i, j] of pairs) {
    const key = Math.min(i, j) * n + Math.max(i, j);
    if (tested.has(key)) continue;
    tested.add(key);
    const p = pts[i], q = pts[j];
    checkpoint?.();
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const run = newton(sys, mid, box, scale, maxIterations);
    if (!run?.root) continue;
    const polished = run.at;
    const gap = Math.hypot(q.x - p.x, q.y - p.y);
    const between = Math.hypot(polished.x - p.x, polished.y - p.y) < 0.9 * gap && Math.hypot(polished.x - q.x, polished.y - q.y) < 0.9 * gap;
    if (between && !known.some((r) => Math.hypot(r.x - polished.x, r.y - polished.y) <= dedupe)) {
      union(i, j);
      hasEdge[i] = hasEdge[j] = true;
    }
  }
  const roots = new Map<number, number>();
  const component = pts.map((_, i) => {
    const r = find(i);
    if (!roots.has(r)) roots.set(r, roots.size);
    return roots.get(r)!;
  });
  return { component, count: roots.size, connected: n ? hasEdge.filter(Boolean).length / n : 0 };
}

export type FindEquilibriaOptions = {
  /** Seeds per axis of the regular grid (seedGrid² Newton runs). Default: adaptive, see the file header. */
  seedGrid?: number;
  /** Cells per axis of the |F| scan that seeds the self-check and measures the sign changes. Default 64. */
  scanGrid?: number;
  /** @deprecated Ignored: acceptance is local (the residual against the Jacobian at the point and its rounding floor), never a relative residual tolerance (review J item 1). */
  tol?: number;
  /** Maximum points returned. Default 30. */
  maxPoints?: number;
  /** Newton iterations per seed. Default 200 (multiple roots converge only linearly). */
  maxIterations?: number;
  /** Called before every Newton run; a caller enforcing a wall-clock budget throws from it. */
  checkpoint?: () => void;
};

const norm = (v: Vec2) => Math.hypot(v.x, v.y);
const isFiniteVec = (v: Vec2) => Number.isFinite(v.x) && Number.isFinite(v.y);

/**
 * Solves J d = -F, or takes the truncated pseudo-inverse step when J is numerically rank-deficient.
 *
 * Singularity is judged on the ROW-EQUILIBRATED matrix (each row divided by its largest entry,
 * F by the same factors), never on det against ||J||²: J = [[1e8, 1], [-1, 1e-8]] has det = 2,
 * which is 2e-16 ||J||_max² and looked "singular" to the old 1e-10 rule although the system is
 * perfectly solvable (scaled rows [[1, 1e-8], [-1, 1e-8]], scaled det 2e-8; review J item 3). The
 * scaled determinant is a condition measure that does not depend on the units of f and g; below
 * SINGULAR_SCALED_DET the FD Jacobian's own relative error (~1e-8) makes the two rows
 * indistinguishable from proportional and the least-squares step is used. Cramer's rule on the
 * scaled system is accurate whenever the scaled determinant is not tiny.
 *
 * A numerically rank-deficient J (rows proportional to within the FD error) gets the TRUNCATED
 * pseudo-inverse step: J ≈ σ₁ u₁ v₁ᵀ and d = -v₁ (u₁ · F) / σ₁, the least-squares step of minimum
 * norm restricted to the one resolvable direction (review J item 2). For F = h(x, y) w with a
 * constant vector w (the SI model x' = -xy, y' = xy) this is d = -h ∇h / |∇h|², Newton's step on
 * the scalar h along its gradient, which converges to the NEAREST zero of h: every seed lands on
 * the axis it started next to and the two axes of equilibria are found. Marquardt's scaled
 * normal equations (JᵀJ + λ diag JᵀJ) d = -JᵀF gave d = (-h / 2h_x, -h / 2h_y) instead (the
 * regularization is the whole determinant when J is rank 1), which halves every seed toward the
 * origin. `lm` tells the caller which branch produced the step.
 */
function newtonDirection(J: Matrix2, F: Vec2): { dir: Vec2; lm: boolean } | null {
  const [[a, b], [c, d]] = J;
  if (![a, b, c, d].every(Number.isFinite)) return null;
  const r0 = Math.max(Math.abs(a), Math.abs(b));
  const r1 = Math.max(Math.abs(c), Math.abs(d));
  if (r0 > 0 && r1 > 0) {
    const a1 = a / r0, b1 = b / r0, c1 = c / r1, d1 = d / r1;
    const detS = a1 * d1 - b1 * c1;
    if (Math.abs(detS) > SINGULAR_SCALED_DET) {
      const fx = F.x / r0, fy = F.y / r1;
      return { dir: { x: -(d1 * fx - b1 * fy) / detS, y: -(-c1 * fx + a1 * fy) / detS }, lm: false };
    }
  }
  // Rank-one step on the matrix scaled by its largest entry (entries up to ~1e154, a one-sided
  // derivative of sqrt at a domain edge, would overflow JᵀJ otherwise): v₁ is the dominant
  // eigenvector of JᵀJ (the one of the two closed forms without cancellation), and
  // d = -v₁ (v₁ · JᵀF) / λ₁ since u₁ σ₁ = J v₁.
  const m = Math.max(r0, r1);
  if (!(m > 0)) return null;
  const A = a / m, B = b / m, C = c / m, D = d / m;
  const g00 = A * A + C * C, g11 = B * B + D * D, g01 = A * B + C * D;
  const half = (g00 + g11) / 2;
  const l1 = half + Math.hypot((g00 - g11) / 2, g01);
  if (!(l1 > 0)) return null;
  let vx: number, vy: number;
  if (g00 >= g11) { vx = l1 - g11; vy = g01; } else { vx = g01; vy = l1 - g00; }
  const vn = Math.hypot(vx, vy);
  if (!(vn > 0)) return null;
  vx /= vn; vy /= vn;
  const gx = (A * F.x + C * F.y) / m, gy = (B * F.x + D * F.y) / m; // JᵀF / m²
  const coef = -(vx * gx + vy * gy) / l1;
  const dir = { x: coef * vx, y: coef * vy };
  if (!isFiniteVec(dir)) return null;
  return { dir, lm: true };
}

/**
 * Where a Newton run ended. `root`: the point passed the local acceptance test and `locTol` is
 * the radius within which the root lies (>= stepTol). `root` false: the run stalled or ran out of
 * iterations WITHOUT the residual being consistent with a root; findEquilibria still submits such
 * a point to the vanishing test, because a field that is discontinuous at a point (a
 * direction-dependent limit) attracts Newton along the directions where |F| tends to 0 and the
 * iteration ends exactly there; that point is reported as singular, not silently dropped.
 */
type NewtonResult = { at: Vec2; locTol: number; root: boolean };

/** Frobenius norm of a 2x2 matrix (>= its spectral norm, so |F| <= ||J||_F |p - r| near a simple root r). */
const frobenius = (J: Matrix2) => Math.hypot(J[0][0], J[0][1], J[1][0], J[1][1]);

/**
 * Is the residual F(p) at its rounding floor? Per component: |f(p)| <= 4 eps times the largest
 * |f| at p and at the stencil points p ± h e_i, and the same for g (the estimator
 * jacobianWithError uses; per component because g = -y at the stencil says nothing about the
 * rounding of f = x⁸). A residual at or below it cannot be reduced in floating point, so it is
 * zero as far as the evaluation can tell. Intermediate terms much larger than F itself
 * ((1 + y⁴) - 1) raise the true floor above this estimate.
 */
function atRoundingFloor(sys: CompiledSystem, p: Vec2, F: Vec2, h: number): boolean {
  let mx = Math.abs(F.x), my = Math.abs(F.y);
  for (const q of [{ x: p.x + h, y: p.y }, { x: p.x - h, y: p.y }, { x: p.x, y: p.y + h }, { x: p.x, y: p.y - h }]) {
    const v = sys.eval(q);
    if (Number.isFinite(v.x)) mx = Math.max(mx, Math.abs(v.x));
    if (Number.isFinite(v.y)) my = Math.max(my, Math.abs(v.y));
  }
  return Math.abs(F.x) <= 4 * EPS * mx && Math.abs(F.y) <= 4 * EPS * my;
}

/**
 * Damped Newton from `seed`; null when it diverges, stalls away from a root, or (with `abortNear`)
 * its own step predicts a landing on an already found root (the run would only reproduce it; a
 * root on a domain edge is approached only linearly, and 144 grid seeds crawling to the same
 * point would cost 200 iterations each). The abort needs BOTH closeness (within ABORT_RADIUS of
 * the known root) and a predicted landing at least twice as close to it: two distinct roots
 * closer than ABORT_RADIUS are not confused, because a run heading for the other one predicts a
 * landing away from the known one.
 *
 * ACCEPTANCE IS LOCAL (review J item 1). A point p is a root only when the residual is consistent
 * with a root within the location tolerance, judged at p itself:
 * - converged: the Newton step d = -J⁻¹F at p (the linear model's distance to the root) is below
 *   stepTol; or
 * - the residual |F(p)| is at its rounding floor (nothing smaller can be computed there); or
 * - at a stall (no step decreases |F|, no usable direction, iterations exhausted): the lower bound
 *   |F(p)| / ||J(p)|| on the distance to any root (F ≈ J (p - r) near a root) is below stepTol.
 * No box-wide statistic enters: the old rule |F| <= tol·median|F| over the box accepted |F| = 1 as
 * zero on a box where the field's median is 1e13 (x' = y, y' = x⁸ + 1 "had" 14 equilibria on
 * [-100, 100]²). stepTol = NEWTON_STEP_TOL × box size is the location precision the search is
 * asked for, an input of the search rather than a property of the field.
 *
 * The returned `locTol` is the radius within which the root lies: for a simple root the Newton
 * step itself, for a multiple root (linear convergence with ratio ρ = |d| / previous step) the
 * remaining geometric tail |d| / (1 - ρ) (x' = -x³: ρ = 2/3, the root is 3 steps away), with a
 * factor 2 of safety, never below stepTol.
 */
function newton(
  sys: CompiledSystem,
  seed: Vec2,
  box: Box,
  scale: number,
  maxIterations: number,
  abortNear?: { points: Vec2[]; radius: number },
): NewtonResult | null {
  let p = seed;
  let F = sys.eval(p);
  if (!isFiniteVec(F)) return null;
  let fNorm = norm(F);
  const escape = 2 * scale; // how far outside the box a seed may wander before we give up
  const stepTol = NEWTON_STEP_TOL * scale;
  let lastStep = Infinity;
  let hJ = 1e-6 * Math.max(1, Math.hypot(p.x, p.y));

  // Geometric tail of a linearly converging run: with the current step d and the ratio ρ to the
  // previous one, the root is about d / (1 - ρ) away (ρ -> 0 for quadratic convergence); twice
  // that is claimed, never less than stepTol.
  const tail = (dn: number) => Math.max(stepTol, (2 * dn) / (1 - Math.min(dn / lastStep, 0.99)));
  // The stalled exits (no step decreases |F|, no usable direction, iterations exhausted). A root
  // when: the residual is at its rounding floor (nothing smaller can be computed there); or, with
  // a rank-deficient J (no Newton step to judge by), the distance lower bound |F| / ||J||_F is
  // within stepTol; or, at the iteration limit, the Newton steps are still shrinking (ρ < 1) and
  // the geometric tail says where the root is (a multiple root of high order needs more than
  // maxIterations linear steps; the claimed radius is honest about the remaining distance).
  // A Newton-branch stall above the rounding floor with a step larger than stepTol is not a root:
  // the model puts the root further away and the residual would not decrease toward it.
  const stalled = (J: Matrix2, dir: Vec2 | null, exhausted: boolean): NewtonResult => {
    const newtonDir = dir !== null && isFiniteVec(dir);
    const dn = newtonDir ? norm(dir) : 0;
    if (atRoundingFloor(sys, p, F, hJ)) return { at: p, locTol: Math.max(stepTol, dn), root: true };
    if (newtonDir) {
      if (exhausted && dn < lastStep) return { at: p, locTol: tail(dn), root: true };
      return { at: p, locTol: Math.max(stepTol, dn), root: false };
    }
    const jn = frobenius(J);
    if (Number.isFinite(jn) && jn > 0 && fNorm / jn <= stepTol) return { at: p, locTol: stepTol, root: true };
    return { at: p, locTol: stepTol, root: false };
  };

  for (let iter = 0; iter < maxIterations; iter++) {
    // Finite-difference step for the Jacobian: shrink it with the Newton step. Near a multiple
    // root the truncation error h^2 f_xxx / 6 of a fixed h = 1e-6 swamps the true derivative
    // (3x^2 for x' = -x^3 once x < 6e-7) and the damped step crawls; h ~ step/100 keeps the
    // error far below the derivative while rounding (eps |f| / h) stays negligible.
    hJ = Math.min(1e-6 * Math.max(1, Math.hypot(p.x, p.y)), Math.max(1e-2 * lastStep, 1e-15 * scale));
    // One-sided columns where the stencil leaves the field's domain (a root on the domain edge).
    const J = jacobianAt(sys, p, hJ, 0, { oneSided: true });
    const nd = newtonDirection(J, F);
    if (nd === null || !isFiniteVec(nd.dir)) return stalled(J, null, false);
    const dir = nd.dir;
    const dn = norm(dir);

    if (!nd.lm && dn <= stepTol) {
      // Converged: the model puts the root within stepTol. Take the last step when it helps.
      const q = { x: p.x + dir.x, y: p.y + dir.y };
      const Fq = sys.eval(q);
      if (isFiniteVec(Fq) && norm(Fq) <= fNorm) {
        p = q;
        F = Fq;
        fNorm = norm(Fq);
      }
      return { at: p, locTol: tail(dn), root: true };
    }
    // A microscopic Levenberg-Marquardt step is not evidence of convergence (it may simply have
    // been damped, review C3): LM runs can only end at a stalled exit, judged by the residual.

    if (abortNear && !nd.lm) {
      const landing = { x: p.x + dir.x, y: p.y + dir.y };
      if (abortNear.points.some((q) => {
        const dq = Math.hypot(q.x - p.x, q.y - p.y);
        return dq <= abortNear.radius && Math.hypot(q.x - landing.x, q.y - landing.y) <= 0.5 * dq;
      })) return null;
    }

    // Backtracking: accept the first step that does not increase the residual. A step into
    // undefined territory (non-finite F) is halved like any other rejected step.
    let step = 1;
    let accepted = false;
    for (let k = 0; k < 12; k++) {
      const q = { x: p.x + step * dir.x, y: p.y + step * dir.y };
      const Fq = sys.eval(q);
      if (isFiniteVec(Fq) && norm(Fq) < fNorm) {
        lastStep = step * dn;
        p = q;
        F = Fq;
        fNorm = norm(Fq);
        accepted = true;
        break;
      }
      step /= 2;
    }
    // No decrease possible: either we are at the root up to rounding, or the seed is hopeless.
    if (!accepted) return stalled(J, nd.lm ? null : dir, false);
    if (
      p.x < box.x.min - escape || p.x > box.x.max + escape ||
      p.y < box.y.min - escape || p.y > box.y.max + escape
    ) {
      return null;
    }
  }
  const J = jacobianAt(sys, p, hJ, 0, { oneSided: true });
  const nd = newtonDirection(J, F);
  return stalled(J, nd !== null && !nd.lm ? nd.dir : null, true);
}

/** Largest number of sign changes along any row or any column of an n x n table (finite, non-zero values only). */
function maxSignChanges(values: Float64Array, n: number): number {
  let best = 0;
  const line = (index: (k: number) => number) => {
    let prev = 0, count = 0;
    for (let k = 0; k < n; k++) {
      const v = values[index(k)];
      if (!Number.isFinite(v) || v === 0) continue;
      const s = Math.sign(v);
      if (prev !== 0 && s !== prev) count++;
      prev = s;
    }
    best = Math.max(best, count);
  };
  for (let j = 0; j < n; j++) line((i) => j * n + i);
  for (let i = 0; i < n; i++) line((j) => j * n + i);
  return best;
}

export function findEquilibria(sys: CompiledSystem, box: Box, opts: FindEquilibriaOptions = {}): EquilibriaResult {
  assertBox(box);
  const maxPoints = opts.maxPoints ?? 30;
  const maxIterations = opts.maxIterations ?? 200;
  const scanGrid = opts.scanGrid ?? SCAN_GRID_DEFAULT;
  if (opts.seedGrid !== undefined && (!Number.isInteger(opts.seedGrid) || opts.seedGrid < 1)) throw new RangeError("seedGrid must be a positive integer.");
  if (!Number.isInteger(scanGrid) || scanGrid < 1) throw new RangeError("scanGrid must be a positive integer.");

  const width = box.x.max - box.x.min;
  const height = box.y.max - box.y.min;
  const scale = Math.max(width, height);

  // The |F| scan: f, g and |F| at the centres of a scanGrid x scanGrid grid (row-major, j*n + i).
  const n = scanGrid;
  const fv = new Float64Array(n * n);
  const gv = new Float64Array(n * n);
  const mag = new Float64Array(n * n);
  const cellCentre = (i: number, j: number): Vec2 => ({ x: box.x.min + ((i + 0.5) * width) / n, y: box.y.min + ((j + 0.5) * height) / n });
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const F = sys.eval(cellCentre(i, j));
      const k = j * n + i;
      fv[k] = F.x;
      gv[k] = F.y;
      mag[k] = isFiniteVec(F) ? norm(F) : NaN;
    }
  }

  // Seed density from the field's structure (scale-free): sign changes along the scan lines.
  const signChanges = Math.max(maxSignChanges(fv, n), maxSignChanges(gv, n));
  const seedGrid = opts.seedGrid ?? Math.max(SEED_GRID_MIN, Math.min(4 + 2 * signChanges, SEED_GRID_MAX));

  // Seeds at cell centres so that exact boundaries (often singular) are avoided.
  const seeds: Vec2[] = [];
  for (let j = 0; j < seedGrid; j++) {
    for (let i = 0; i < seedGrid; i++) {
      seeds.push({ x: box.x.min + ((i + 0.5) * width) / seedGrid, y: box.y.min + ((j + 0.5) * height) / seedGrid });
    }
  }

  // The self-check: local minima of |F| among the available neighbours, and cells on the edge of
  // the field's domain (next to an undefined cell) that are minima along the edge band.
  const inGrid = (i: number, j: number) => i >= 0 && i < n && j >= 0 && j < n;
  const nextToUndefined = (i: number, j: number): boolean => {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if ((di || dj) && inGrid(i + di, j + dj) && !Number.isFinite(mag[(j + dj) * n + i + di])) return true;
    }
    return false;
  };
  const candidates: { at: Vec2; m: number }[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const m = mag[j * n + i];
      if (!Number.isFinite(m)) continue;
      const edge = nextToUndefined(i, j);
      let notAbove = true, strictlyBelow = false, edgeMinimum = edge;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const ii = i + di, jj = j + dj;
          if (!inGrid(ii, jj)) continue;
          const mm = mag[jj * n + ii];
          if (!Number.isFinite(mm)) continue;
          if (m > mm) notAbove = false;
          if (m < mm) strictlyBelow = true;
          if (edge && m > mm && nextToUndefined(ii, jj)) edgeMinimum = false;
        }
      }
      if ((notAbove && strictlyBelow) || edgeMinimum) candidates.push({ at: cellCentre(i, j), m });
    }
  }
  candidates.sort((u, v) => u.m - v.m);
  const capped = candidates.length > SCAN_SEED_CAP;
  const scanSeeds = (capped ? candidates.slice(0, SCAN_SEED_CAP) : candidates).map((c) => c.at);

  // Every located root comes with the radius within which it lies (locTol, >= stepTol). Two
  // converged points are the SAME root when their claimed disks intersect, |p - q| <= locTol_p +
  // locTol_q, or when they agree to the relative resolution of a location (LOCATION_RELATIVE_TOL
  // times |p|). Never a fraction of the box (review J item 7): the old 1e-6 × box merged the two
  // simple roots of x(x - 1e-3) on [-2000, 2000]², so the count depended on the box. A root
  // exactly on a box edge is legitimate; the located point may overshoot the edge by its locTol.
  const stepTol = NEWTON_STEP_TOL * scale;
  const sameRoot = (p: NewtonResult, q: NewtonResult) =>
    Math.hypot(p.at.x - q.at.x, p.at.y - q.at.y) <= Math.max(p.locTol + q.locTol, LOCATION_RELATIVE_TOL * Math.max(norm(p.at), norm(q.at)));
  const located: NewtonResult[] = [];
  const found: Vec2[] = [];
  const stalls: Vec2[] = [];
  // Runs Newton from a seed and registers what it finds: the located root (new or already
  // known: the run that reached it is returned either way), or null for a diverged, aborted or
  // out-of-box run; a stall goes to the vanishing test later.
  const runSeed = (seed: Vec2): NewtonResult | null => {
    opts.checkpoint?.();
    const r = newton(sys, seed, box, scale, maxIterations, { points: found, radius: ABORT_RADIUS * scale });
    if (r === null) return null;
    const p = r.at, margin = r.locTol;
    if (p.x < box.x.min - margin || p.x > box.x.max + margin || p.y < box.y.min - margin || p.y > box.y.max + margin) {
      return null;
    }
    if (!r.root) {
      stalls.push(p);
      return null;
    }
    const known = located.find((q) => sameRoot(q, r));
    if (known) return known;
    located.push(r);
    found.push(p);
    return r;
  };
  for (const seed of [...seeds, ...scanSeeds]) runSeed(seed);

  // Domain-edge seeds (review J item 5): a root ON the edge of the field's domain (x' = sqrt(x) y,
  // y' = x vanishes at every point of x = 0) is invisible to the |F| minima along the edge band
  // (|F| there is set by the distance to the edge, not by the root) and Newton from a cell centre
  // linearizes sqrt across the edge and walks along it instead of to it. So every edge cell
  // (finite centre, undefined axis neighbour) seeds Newton from the edge itself: the last finite
  // point on the segment toward the undefined neighbour, by bisection down to the segment's
  // rounding floor. From there the pseudo-inverse step (the one-sided Jacobian is rank one to the
  // FD error) lands exactly on the edge point, where F is evaluated, not linearized. Edge cells
  // are taken in increasing |F| order, at most EDGE_CELL_CAP of them (reported, never silent).
  const edgeCells: { i: number; j: number; m: number }[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const m = mag[j * n + i];
      if (Number.isFinite(m) && nextToUndefined(i, j)) edgeCells.push({ i, j, m });
    }
  }
  edgeCells.sort((u, v) => u.m - v.m);
  const edgeCapped = edgeCells.length > EDGE_CELL_CAP;
  let edgeSeeds = 0;
  for (const { i, j } of edgeCapped ? edgeCells.slice(0, EDGE_CELL_CAP) : edgeCells) {
    const c = cellCentre(i, j);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (!inGrid(i + di, j + dj) || Number.isFinite(mag[(j + dj) * n + i + di])) continue;
      const u = cellCentre(i + di, j + dj);
      let lo = 0, hi = 1; // lo: finite, hi: undefined
      for (let k = 0; k < 64; k++) {
        const mid = (lo + hi) / 2;
        if (mid <= lo || mid >= hi) break;
        if (isFiniteVec(sys.eval({ x: c.x + mid * (u.x - c.x), y: c.y + mid * (u.y - c.y) }))) lo = mid;
        else hi = mid;
      }
      edgeSeeds++;
      runSeed({ x: c.x + lo * (u.x - c.x), y: c.y + lo * (u.y - c.y) });
    }
  }

  // Sign-change quadtree (review J item 4), the mechanism independent of |F| minima and of the
  // seed grid: f and g are evaluated at the (n + 1)² CORNERS of the scan cells; a cell on whose
  // corners both f and g change sign (min <= 0 <= max, all four finite) is a candidate and
  // Newton runs from its centre. If no located root lies inside the cell afterwards (the run
  // diverged, stalled, or converged elsewhere: on [-100, 100]² the cell containing the origin of
  // x' = y, y' = -x - y + x⁷ has its centre in a saddle's basin), the cell is split into four,
  // the five new corner values are evaluated, and the sub-cells that still show both sign
  // changes are queued, breadth first, down to REFINE_MAX_DEPTH. The number of cells Newton runs
  // from is capped at REFINE_CELL_CAP, the number of cells examined at REFINE_VISIT_CAP, the
  // refinement stops once REFINE_ROOT_CAP roots are located (a continuum), and any of the caps
  // is reported in `seeding.refineCapped`, never applied silently. A sign
  // change of both components on a cell's boundary is a scale-free, unit-free signal: it does
  // not compare |F| with anything.
  const cornerX = (i: number) => box.x.min + (i * width) / n;
  const cornerY = (j: number) => box.y.min + (j * height) / n;
  type Cell = { x0: number; x1: number; y0: number; y1: number; depth: number; f: number[]; g: number[] };
  const bothChange = (f: number[], g: number[]) => {
    if (!f.every(Number.isFinite) || !g.every(Number.isFinite)) return false;
    const changes = (v: number[]) => Math.min(...v) <= 0 && Math.max(...v) >= 0;
    return changes(f) && changes(g);
  };
  const cf = new Float64Array((n + 1) * (n + 1));
  const cg = new Float64Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const F = sys.eval({ x: cornerX(i), y: cornerY(j) });
      cf[j * (n + 1) + i] = F.x;
      cg[j * (n + 1) + i] = F.y;
    }
  }
  const level0: { cell: Cell; m: number }[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const ks = [j * (n + 1) + i, j * (n + 1) + i + 1, (j + 1) * (n + 1) + i, (j + 1) * (n + 1) + i + 1];
      const f = ks.map((k) => cf[k]), g = ks.map((k) => cg[k]);
      if (!bothChange(f, g)) continue;
      const m = mag[j * n + i];
      level0.push({ cell: { x0: cornerX(i), x1: cornerX(i + 1), y0: cornerY(j), y1: cornerY(j + 1), depth: 0, f, g }, m: Number.isFinite(m) ? m : Infinity });
    }
  }
  level0.sort((u, v) => u.m - v.m);
  const queue: Cell[] = level0.map((e) => e.cell);
  let refined = 0;
  let head = 0;
  const rootInside = (c: Cell) => located.some((r) => r.at.x >= c.x0 - r.locTol && r.at.x <= c.x1 + r.locTol && r.at.y >= c.y0 - r.locTol && r.at.y <= c.y1 + r.locTol);
  let visited = 0;
  let refineCapped = false;
  while (head < queue.length) {
    if (visited >= REFINE_VISIT_CAP) { refineCapped = true; break; }
    const c = queue[head++];
    visited++;
    // Newton runs only when no located root lies in the cell already (a run from the centre of a
    // cell around a known root would land on it again); the cell is split regardless, because a
    // cell can hold several roots (on [-100, 100]² the origin and the saddle (1, 0) of the x⁷
    // system share a cell and its boundary y = 0): the sub-cells that do not contain the known
    // root but still show both sign changes are where a second root hides.
    if (!rootInside(c)) {
      if (refined >= REFINE_CELL_CAP || located.length >= REFINE_ROOT_CAP) { refineCapped = true; break; }
      refined++;
      runSeed({ x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 });
    }
    if (c.depth >= REFINE_MAX_DEPTH) continue;
    const xm = (c.x0 + c.x1) / 2, ym = (c.y0 + c.y1) / 2;
    // Corner order of a cell: [x0y0, x1y0, x0y1, x1y1]; new values: bottom, left, centre, right, top.
    const at = (x: number, y: number) => sys.eval({ x, y });
    const bottom = at(xm, c.y0), left = at(c.x0, ym), centre = at(xm, ym), right = at(c.x1, ym), top = at(xm, c.y1);
    const sub = (x0: number, x1: number, y0: number, y1: number, F: Vec2[]) => {
      const f = F.map((v) => v.x), g = F.map((v) => v.y);
      if (bothChange(f, g)) queue.push({ x0, x1, y0, y1, depth: c.depth + 1, f, g });
    };
    const old = c.f.map((fx, k) => ({ x: fx, y: c.g[k] }));
    sub(c.x0, xm, c.y0, ym, [old[0], bottom, left, centre]);
    sub(xm, c.x1, c.y0, ym, [bottom, old[1], centre, right]);
    sub(c.x0, xm, ym, c.y1, [left, centre, old[2], top]);
    sub(xm, c.x1, ym, c.y1, [centre, right, top, old[3]]);
  }
  const seeding: SeedingReport = { seedGrid, scanGrid, signChanges, candidates: candidates.length, seeds: scanSeeds.length, capped, edgeSeeds, edgeCapped, refined, refineCapped };
  // the resolution the roots were located to.
  const dedupe = located.reduce((m, r) => Math.max(m, r.locTol), stepTol);

  // Vanishing test (review J item 8): a converged point is an equilibrium only if the field
  // tends to its value there from every direction in which it is defined. Along 8 directions
  // (both sides of the two axes and of the two diagonals) lipschitzProbe fits
  // |F(p + δ e) - F(p)| / δ ~ δ^-α over δ = VANISHING_DELTA_FACTOR × stepTol × 4^-k, k = 0..7,
  // i.e. |F(p + δ e) - F(p)| ~ δ^β with β = 1 - α. A defined direction with enough levels and
  // β <= VANISHING_MIN_EXPONENT (α >= 1 - it) shows a field that does not vanish toward p: p is a
  // singular point of the field, not an equilibrium. A direction on which the field is undefined
  // arbitrarily close to p (domain edge) says nothing and is skipped, as is one with too few
  // resolvable levels: the point then stays, on Newton's evidence alone. A difference below the
  // rounding floor of the two field values (10 eps of the larger; the probe's own guard only
  // knows the differences, and F(p) is not small at a non-root stall) is reported as NaN, i.e.
  // unresolvable at that level: a direction along which F does not change measurably is trivially
  // continuous, never "unbounded" from rounding noise.
  const probeScale = (VANISHING_DELTA_FACTOR * stepTol) / LIPSCHITZ_FIRST_FRACTION;
  const singularPoints: Vec2[] = [];
  const vanishes = (p: Vec2): boolean => {
    const F0 = sys.eval(p);
    const base = isFiniteVec(F0) ? F0 : { x: 0, y: 0 };
    const baseMag = Math.max(Math.abs(base.x), Math.abs(base.y));
    const h = (q: Vec2) => {
      const v = sys.eval(q);
      const diff = Math.hypot(v.x - base.x, v.y - base.y);
      const floor = 10 * EPS * Math.max(baseMag, Math.abs(v.x), Math.abs(v.y));
      return diff <= floor ? NaN : diff;
    };
    const s = Math.SQRT1_2;
    for (const e of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: s, y: s }, { x: s, y: -s }]) {
      opts.checkpoint?.();
      const r = lipschitzProbe((d) => h({ x: p.x + d * e.x, y: p.y + d * e.y }), probeScale);
      for (const side of [r.sides.above, r.sides.below]) {
        if (side.verdict === "undefined" || side.levels < MIN_LEVELS_FOR_GROWTH || !Number.isFinite(side.exponent)) continue;
        if (1 - side.exponent <= VANISHING_MIN_EXPONENT) return false;
      }
    }
    return true;
  };
  for (let i = located.length - 1; i >= 0; i--) {
    if (vanishes(located[i].at)) continue;
    singularPoints.push(located[i].at);
    located.splice(i, 1);
  }
  // A run that stalled without a consistent residual ended at a singular point when the field is
  // discontinuous there (Newton crawls toward it along the directions where |F| tends to 0); a
  // stall elsewhere (a local minimum of |F| that is not a root) is dropped as before.
  const stepOnly = (p: Vec2): NewtonResult => ({ at: p, locTol: stepTol, root: false });
  for (const p of stalls) {
    if (singularPoints.some((q) => sameRoot(stepOnly(q), stepOnly(p))) || located.some((q) => sameRoot(q, stepOnly(p)))) continue;
    if (!vanishes(p)) singularPoints.push(p);
  }
  singularPoints.sort((u, v) => u.x - v.x || u.y - v.y);
  located.sort((u, v) => u.at.x - v.at.x || u.at.y - v.at.y);
  found.length = 0;
  found.push(...located.map((r) => r.at));

  // The Jacobian's local error (finite differences: truncation + rounding) plus the part that
  // comes from not standing exactly on the root: the run's claimed radius locTol (at least 10x
  // NEWTON_STEP_TOL times the box, the geometric tail for a multiple root that converged only
  // linearly), and the Jacobian moves by its sensitivity times that. With a 10x safety margin
  // this is the level below which an entry, the determinant or the trace is zero for this
  // problem. Local to the point, never a box-wide statistic (review C4).
  const equilibria: Equilibrium[] = located.map(({ at, locTol }) => {
    const { J: jacobian, errors, domainEdge } = jacobianWithError(sys, at);
    if (domainEdge) return { at, jacobian, ...classify(jacobian), caveat: "domainEdge" };
    const locationError = Math.max(10 * stepTol, locTol);
    // Per entry (review J item 6): the 1e8 entry's rounding must not be charged to the 1e-8 entry.
    const S = jacobianSensitivityEntries(sys, at, jacobian);
    const entryErrors = errors.map((row, i) => row.map((e, j) => 10 * (e + S[i][j] * locationError))) as Matrix2;
    return { at, jacobian, ...classify(jacobian, undefined, { entryErrors }) };
  });

  const singular = singularPoints.length ? { singularPoints } : {};
  if (equilibria.length === 0) return { points: [], warning: "none_found", seeding, ...singular };

  // A continuum of equilibria needs a counting signal (many non-hyperbolic points), connectedness
  // (the field vanishes between neighbours) and a geometric one (a line or a curve) per connected
  // component. Counting alone would call four isolated degenerate points a continuum (H2.7);
  // shape alone would call isolated double roots on a line a continuum (review C5).
  const nonHyperbolic = equilibria.filter((e) => e.classification === "non_hyperbolic");
  const manyNonHyperbolic = equilibria.length >= 3 && nonHyperbolic.length >= Math.ceil(0.6 * equilibria.length);
  let geometry: EquilibriaResult["geometry"];
  let continuum = false;
  if (manyNonHyperbolic) {
    const pts = nonHyperbolic.map((e) => e.at);
    const cc = connectedComponents(sys, pts, found, dedupe, box, scale, maxIterations, opts.checkpoint);
    const members: Vec2[][] = Array.from({ length: cc.count }, () => []);
    pts.forEach((p, i) => members[cc.component[i]].push(p));
    const continuumComponents = members.filter(componentIsCurve).length;
    geometry = { collinearity: collinearity(pts), curveLike: curveLikeFraction(pts), connected: cc.connected, components: cc.count, continuumComponents };
    continuum = continuumComponents >= 1;
  }
  const truncated = equilibria.length > maxPoints;
  const warning: EquilibriaWarning | undefined = continuum ? "possible_continuum" : manyNonHyperbolic ? "multiple_non_hyperbolic" : truncated ? "hit_limit" : undefined;

  return {
    points: truncated ? equilibria.slice(0, maxPoints) : equilibria,
    ...(warning ? { warning } : {}),
    ...(truncated ? { truncated: true } : {}),
    ...(geometry ? { geometry } : {}),
    seeding,
    ...singular,
  };
}
