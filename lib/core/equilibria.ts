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
import { MIN_LEVELS, RESOLUTION_FACTOR, type UniquenessResult } from "./uniqueness";

/** `uniqueness` is attached by the callers that ask for it (equilibriaUniqueness in uniqueness.ts); findEquilibria leaves it unset. */
export type Equilibrium = {
  at: Vec2;
  jacobian: Matrix2;
  /** Radius within which the root lies (the run's location tolerance, never below NEWTON_STEP_TOL × box): the offsets of any probe around the point must start above it (J-fix2 item 7). */
  resolution: number;
  uniqueness?: UniquenessResult;
} & ClassifyResult;

/**
 * 'region_of_equilibria' (J-fix2 item 6): the field is exactly 0 at REGION_ZERO_FRACTION or more
 * of the scan samples (x' = 0, y' = 0; max(x - 1, 0), max(y - 1, 0)): every point of that region
 * is an equilibrium; `points` holds representative samples and no continuum or isolation verdict
 * is attempted.
 */
export type EquilibriaWarning = "none_found" | "possible_continuum" | "multiple_non_hyperbolic" | "hit_limit" | "region_of_equilibria";

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
  /**
   * True when some Newton run ended where a component of the field evaluates to exactly 0 only
   * because the expression underflowed (x' = y, y' = exp(x) for x < -745): in part of the box the
   * right-hand side is below the smallest representable number; those points are not roots and
   * are not listed (J-fix2 item 3). Present only when true.
   */
  underflowPlateau?: true;
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
 * Scaled determinant tolerance from the measured row noise (singularDetTol): the first-order
 * perturbation of a 2 x 2 determinant of rows with entries <= 1 by a relative noise ρ_i of row i
 * is at most 2 (ρ₀ + ρ₁), so a scaled determinant above that is resolved. Never below
 * SINGULAR_DET_FLOOR, the rounding of the determinant itself.
 */
export const SINGULAR_DET_NOISE_FACTOR = 2;
export const SINGULAR_DET_FLOOR = 16 * 2.220446049250313e-16;
/**
 * A Newton run within this fraction of the box of an already found root, whose own step predicts
 * a landing at least twice as close to that root, is abandoned (it would reproduce the root).
 */
export const ABORT_RADIUS = 1e-6;
/** Relative resolution of a root's location: two converged points closer than this times |p| are one root. */
export const LOCATION_RELATIVE_TOL = 1e-9;
/**
 * Vanishing test (review J item 8): |F(p + δ e) - F(p)| ~ δ^β is fitted along 8 directions with
 * δ from VANISHING_DELTA_FACTOR × stepTol downward (lipschitzProbe's descent, quartering δ until
 * the quotients level off or reach the rounding floor); β <= this in some
 * defined direction means F does not tend to F(p) there: the field is discontinuous at p and p
 * is a singular point, not an equilibrium (x' = xy / (x² + y²): F is 0.5 along every diagonal at
 * every distance). A Hölder root (sqrt(x): β = 1/2) still vanishes and stays an equilibrium.
 */
export const VANISHING_MIN_EXPONENT = 0.1;
/** First probe offset of the vanishing test, as a multiple of stepTol (the location resolution). */
export const VANISHING_DELTA_FACTOR = 1e3;
/**
 * The vanishing test fits |F(p + δ e)| over offsets at least this many times the point's own
 * location resolution: closer offsets step around a point that may not be the one in question
 * (x' = x² / (x² + y²): the finest levels see the value drop from 1 to 0.5 as δ crosses the
 * stall's distance to the axis and spoil the fit).
 */
export const VANISHING_RESOLUTION_FACTOR = RESOLUTION_FACTOR;
/** A residual is at its rounding floor when it is within this factor of the expression's rounding-error bound. */
export const ROUNDING_FLOOR_FACTOR = 4;
/** A run still closing in at maxIterations may run up to this many times maxIterations in total. */
export const EXTENDED_ITERATIONS = 10;
/** A full Newton step that leaves more than this fraction of |F| is compared with the half step. */
export const POOR_DECREASE = 0.9;
/** A finite-difference Jacobian whose rounding noise exceeds this fraction of its largest entry gives no step verdict. */
export const JACOBIAN_NOISE_FRACTION = 0.5;
/**
 * The finite-difference step is widened (up to fdStep) until every row's rounding noise is below
 * this fraction of its largest entry (J-fix3 item 1): a row known to ±50% (the old stopping
 * point) leaves the scaled determinant unresolved by the first-order bound 2 (ρ₀ + ρ₁) and a
 * perfectly regular Jacobian (cos(x) - 1 at 1e-7 from a root: det -1) fell into the rank-one
 * step. At 10% the truncation h² f''' / 6 of x - sin(x) at x = 3e-7 is still 0.3% of f'.
 */
export const JACOBIAN_WIDEN_FRACTION = 0.1;
/**
 * The finite-difference step never shrinks below EPS × |p| / this fraction: the stencil
 * coordinates p ± h are rounded to the double grid (EPS |p|), a relative error of the difference
 * quotient of EPS |p| / h, and at h = 1e-2 × a 1e-13 step near x = 1 that error is 20% (J-fix3
 * item 1: the row-equilibrated determinant of a perfectly regular Jacobian then looked
 * unresolved and the run fell into the rank-one step within 1e-12 of the root).
 */
export const FD_QUANTIZATION_FRACTION = 1e-4;
/** Extra Newton steps taken after convergence while the residual still decreases (a polish, never a verdict). */
export const POLISH_ITERATIONS = 20;
/** Fraction of the finite scan samples at which the field must be exactly 0 for 'region_of_equilibria'. */
export const REGION_ZERO_FRACTION = 0.25;
/** Non-finite corner of a scan cell: the sign witness is taken this fraction of the cell inward (a removable singularity on a corner). */
export const CORNER_NUDGE = 2 ** -20;
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
function newtonDirection(J: Matrix2, F: Vec2, detTol = SINGULAR_SCALED_DET): { dir: Vec2; lm: boolean } | null {
  const [[a, b], [c, d]] = J;
  if (![a, b, c, d].every(Number.isFinite)) return null;
  const r0 = Math.max(Math.abs(a), Math.abs(b));
  const r1 = Math.max(Math.abs(c), Math.abs(d));
  if (r0 > 0 && r1 > 0) {
    const a1 = a / r0, b1 = b / r0, c1 = c / r1, d1 = d / r1;
    const detS = a1 * d1 - b1 * c1;
    if (Math.abs(detS) > detTol) {
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
 * the radius within which the root lies (>= the location tolerance at p). `root` false: the run
 * stalled or ran out of iterations WITHOUT the residual being consistent with a root;
 * findEquilibria still submits such a point to the vanishing test, because a field that is
 * discontinuous at a point (a direction-dependent limit) attracts Newton along the directions
 * where |F| tends to 0 and the iteration ends exactly there; that point is reported as singular,
 * not silently dropped. `underflow`: the run ended where a component of F evaluates to exactly 0
 * (or a subnormal) only because the expression underflowed (exp(x) at x = -999): not a root, and
 * not a singular point either; findEquilibria reports the plateau once (J-fix2 item 3).
 */
type NewtonResult = { at: Vec2; locTol: number; root: boolean; underflow?: boolean };

/**
 * Location tolerance at p: NEWTON_STEP_TOL times the box (the precision the search is asked
 * for) but never below the resolution of the coordinates themselves, 8 eps |p| (J-fix2 item 4:
 * a root kπ of sin at |p| ~ 1e5 is not representable; the nearest double has a Newton step of
 * half a spacing, which the box rule alone would never accept).
 */
const stepTolAt = (p: Vec2, scale: number) => Math.max(NEWTON_STEP_TOL * scale, 8 * EPS * Math.max(Math.abs(p.x), Math.abs(p.y)));

/** Finite-difference step of the Jacobian at p: relative to the box (a change of units rescales it) and to |p|, with no absolute floor (J-fix2 item 4). */
const fdStep = (p: Vec2, scale: number) => 1e-6 * Math.max(scale, Math.hypot(p.x, p.y));
/** Smallest finite-difference step at p that keeps the rounding of the stencil coordinates below FD_QUANTIZATION_FRACTION of it (and 1e-15 × box). */
const fdStepMin = (p: Vec2, scale: number) => Math.max(1e-15 * scale, (EPS * Math.max(Math.abs(p.x), Math.abs(p.y))) / FD_QUANTIZATION_FRACTION);

/**
 * Is the residual F(p) at its rounding floor? Per component: |f(p)| <= ROUNDING_FLOOR_FACTOR
 * times the rounding-error bound of the expression's OWN terms at p (parse.ts RoundingBound:
 * cos(x) - 1 is formed from terms of size 1, so its floor is ~2 eps whatever the tiny result;
 * f = y at y = 1e-43 is exact to eps × 1e-43 and is NOT at its floor although the stencil
 * values y ± h are 1e-6). A component that is 0 only because the expression underflowed
 * (exp(x) at x = -999) is never at its floor: its exact value is not representable, not zero
 * (`underflow`). A residual at or below the floor cannot be reduced in floating point, so it is
 * zero as far as the evaluation can tell. Without a bound (a hand-built system) the older
 * estimate is used: 4 eps times the largest |f| at p and on the stencil p ± h e_i.
 */
function roundingFloor(sys: CompiledSystem, p: Vec2, F: Vec2, h: number, J?: Matrix2): { atFloor: boolean; underflow: boolean } {
  const floors = residualFloors(sys, p, F, h, J);
  if (floors === null) return { atFloor: false, underflow: true };
  return { atFloor: Math.abs(F.x) <= floors[0] && Math.abs(F.y) <= floors[1], underflow: false };
}

/**
 * The floor of each residual component at p: ROUNDING_FLOOR_FACTOR times the rounding-error
 * bound of the component's own terms (see roundingFloor), plus what ONE ROUNDING of the
 * coordinates changes it by, |∂F_i/∂x| ulp(p.x) + |∂F_i/∂y| ulp(p.y) with ulp <= EPS × |coordinate|
 * (J-fix3 item 1). The second term is the resolution of the point itself: at (1 - u, u) on the
 * line x + y = 1 of x' = x(1 - x) - xy the value f = -(1 - x - y)(x) is 1e-17, the terms' own
 * rounding bound is 1e-23, yet no double next to p makes |f| smaller, because x moves in steps
 * of 1.1e-16 and f by as much. Judged by the bound alone that residual is "not at its floor",
 * every step that leaves it unchanged to rounding is rejected, and the crawl along the
 * rank-deficient direction (where g = -u² still has 8 orders of magnitude to go) stalls at
 * u ~ 3e-8. null: a component is 0 only because the expression underflowed.
 */
function residualFloors(sys: CompiledSystem, p: Vec2, F: Vec2, h: number, J?: Matrix2, extra: [number, number] = [0, 0]): [number, number] | null {
  const quant = (i: number) => (J ? EPS * (Math.abs(J[i][0]) * Math.abs(p.x) + Math.abs(J[i][1]) * Math.abs(p.y)) : 0) + extra[i];
  if (sys.roundingBound) {
    const [bf, bg] = sys.roundingBound(p);
    if ((bf.underflow && bf.value === 0) || (bg.underflow && bg.value === 0)) return null;
    if (bf.underflow || bg.underflow) return [0, 0]; // an underflowed non-zero value is never at its floor (and not a plateau)
    return [ROUNDING_FLOOR_FACTOR * (bf.error + quant(0)), ROUNDING_FLOOR_FACTOR * (bg.error + quant(1))];
  }
  let mx = Math.abs(F.x), my = Math.abs(F.y);
  for (const q of [{ x: p.x + h, y: p.y }, { x: p.x - h, y: p.y }, { x: p.x, y: p.y + h }, { x: p.x, y: p.y - h }]) {
    const v = sys.eval(q);
    if (Number.isFinite(v.x)) mx = Math.max(mx, Math.abs(v.x));
    if (Number.isFinite(v.y)) my = Math.max(my, Math.abs(v.y));
  }
  return [4 * EPS * mx + ROUNDING_FLOOR_FACTOR * quant(0), 4 * EPS * my + ROUNDING_FLOOR_FACTOR * quant(1)];
}

/**
 * The residual with each component's floor subtracted (0 when it is at the floor): the size a
 * Newton step must reduce. Comparing plain |F| rejects every step once one component is at its
 * floor and fluctuates by rounding while the other still decreases (the rank-deficient crawl
 * above): the floored norm sees the decrease of the component that can still decrease.
 */
function flooredNorm(sys: CompiledSystem, p: Vec2, F: Vec2, h: number, J?: Matrix2, extra?: [number, number]): number {
  const floors = residualFloors(sys, p, F, h, J, extra);
  if (floors === null) return norm(F);
  return Math.hypot(Math.max(Math.abs(F.x) - floors[0], 0), Math.max(Math.abs(F.y) - floors[1], 0));
}

/**
 * Half-width of the region around p where the residual stays at its rounding floor, along the
 * axes: offsets stepTol × 4^k from p in the four axis directions as long as F(p + δ e) is still at
 * its floor there, capped at ABORT_RADIUS × scale (the radius the search already treats as one
 * root; along a line of exact zeros the region is unbounded, and the cap keeps a continuum's
 * sample points apart). For a cancelling double root (cos(x) - 1 = -x²/2 + noise) every point
 * with |x| < ~6e-8 is at the floor: a run that stops anywhere in that band claims the band as
 * its radius, so all such runs are one root, and the classification's location error covers the
 * noise instead of reading it as a resolved eigenvalue (J-fix2 item 2).
 */
function floorWidth(sys: CompiledSystem, p: Vec2, stepTol: number, scale: number): number {
  let width = 0;
  const cap = ABORT_RADIUS * scale;
  const atFloorAt = (d: number, e: Vec2): boolean => {
    const q = { x: p.x + d * e.x, y: p.y + d * e.y };
    const Fq = sys.eval(q);
    return isFiniteVec(Fq) && roundingFloor(sys, q, Fq, d).atFloor;
  };
  for (const e of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
    let pass = 0, fail = NaN;
    for (let d = stepTol; d <= cap; d *= 4) {
      if (!atFloorAt(d, e)) { fail = d; break; }
      pass = d;
    }
    // The band's edge lies between the last passing and the first failing offset: bisect it
    // (8 halvings), so that two runs stopping anywhere in one band claim radii that overlap.
    if (pass > 0 && Number.isFinite(fail)) {
      let lo = pass, hi = fail;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2;
        if (atFloorAt(mid, e)) lo = mid;
        else hi = mid;
      }
      pass = lo;
    }
    width = Math.max(width, pass);
  }
  return width;
}

/**
 * Is a row of the central-difference Jacobian at p with step h dominated by the rounding noise
 * of its stencil? Row i (the gradient of component i) carries noise (error bound of F_i at
 * p + h e_j + at p - h e_j) / 2h, the largest over the columns j, from the expression's own terms
 * (parse.ts RoundingBound; without a bound, 4 eps × the largest |F_i| on the stencil / 2h); a
 * stencil point outside the field's domain (a root on a domain edge) contributes nothing. The row
 * is noise when that exceeds JACOBIAN_NOISE_FRACTION of its largest entry (a row that is exactly
 * 0 with no noise, g ≡ 0, is not). Per row, because the 1 of g = y says nothing about the
 * gradient of f = exp(x) - 1 - x, which is 4e-9 at x = 4e-9 against a noise of 3 eps / h.
 */
function noiseDominated(sys: CompiledSystem, p: Vec2, J: Matrix2, h: number, fraction = JACOBIAN_NOISE_FRACTION): boolean {
  const noise = rowNoise(sys, p, h, J);
  return [0, 1].some((i) => noise[i] > fraction * Math.max(Math.abs(J[i][0]), Math.abs(J[i][1])));
}

/**
 * Tolerance on the scaled determinant below which J is numerically rank-deficient, from the
 * MEASURED rounding noise of its rows (J-fix3 item 1): each row's noise relative to its largest
 * entry perturbs the row-equilibrated determinant by that much, so a scaled determinant above
 * SINGULAR_DET_NOISE_FACTOR times the sum of the two relative noises is resolved, however
 * small. The old absolute SINGULAR_SCALED_DET = 1e-8 (the FD error at h = 1e-6) was far above
 * the noise of the shrunken step h ~ 1e-2 × Newton step, and near a root with one zero
 * eigenvalue (x' = xy, y' = x² - y at the origin: the scaled determinant is 3x on the way in)
 * switched to the rank-one step at x < 3e-9, which only moves in the row space and never
 * reaches the root. Floor: the rounding of the 2 × 2 determinant itself, 16 eps.
 */
function singularDetTol(J: Matrix2, noise: [number, number]): number {
  const rel = (i: number) => {
    const m = Math.max(Math.abs(J[i][0]), Math.abs(J[i][1]));
    return m > 0 ? noise[i] / m : 0;
  };
  return Math.max(SINGULAR_DET_FLOOR, SINGULAR_DET_NOISE_FACTOR * (rel(0) + rel(1)));
}

/** Rounding noise of each row of the central-difference Jacobian at p with step h (see noiseDominated). */
function rowNoise(sys: CompiledSystem, p: Vec2, h: number, J: Matrix2): [number, number] {
  // The stencil points p ± h e_j are rounded to the double grid (EPS × |p_j|), which moves F_i
  // by |J_ij| EPS |p_j|; over the quotient's 2h that is |J_ij| EPS |p_j| / h per column (J-fix3
  // item 1: near (1, 0) the terms of x(1 - x) - xy are 1e-8 and their own bound 1e-23, but the
  // 1.1e-16 grid of x gives ∂f/∂x an error of 2e-6 at h = 1e-10).
  const fin0 = (v: number) => (Number.isFinite(v) ? Math.abs(v) : 0);
  const quant = (i: number) => (EPS * (fin0(J[i][0]) * Math.abs(p.x) + fin0(J[i][1]) * Math.abs(p.y))) / h;
  const noise: [number, number] = [quant(0), quant(1)];
  for (const e of [{ x: 1, y: 0 }, { x: 0, y: 1 }]) {
    const plus = { x: p.x + h * e.x, y: p.y + h * e.y }, minus = { x: p.x - h * e.x, y: p.y - h * e.y };
    if (sys.roundingBound) {
      const fin = (v: number) => (Number.isFinite(v) ? v : 0);
      const [pf, pg] = sys.roundingBound(plus), [mf, mg] = sys.roundingBound(minus);
      noise[0] = Math.max(noise[0], (fin(pf.error) + fin(mf.error)) / (2 * h));
      noise[1] = Math.max(noise[1], (fin(pg.error) + fin(mg.error)) / (2 * h));
    } else {
      const Fp = sys.eval(plus), Fm = sys.eval(minus);
      const fin = (v: number) => (Number.isFinite(v) ? Math.abs(v) : 0);
      noise[0] = Math.max(noise[0], (4 * EPS * Math.max(fin(Fp.x), fin(Fm.x))) / (2 * h));
      noise[1] = Math.max(noise[1], (4 * EPS * Math.max(fin(Fp.y), fin(Fm.y))) / (2 * h));
    }
  }
  return noise;
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
 *   the location tolerance at p; or
 * - the residual |F(p)| is at its rounding floor (nothing smaller can be computed there); or
 * - at a stall with a rank-deficient J (no Newton step to judge by): the lower bound
 *   |F(p)| / ||J(p)|| on the distance to any root (F ≈ J (p - r) near a root) is below it.
 * No box-wide statistic enters: the old rule |F| <= tol·median|F| over the box accepted |F| = 1 as
 * zero on a box where the field's median is 1e13 (x' = y, y' = x⁸ + 1 "had" 14 equilibria on
 * [-100, 100]²). NEWTON_STEP_TOL × box size is the location precision the search is asked for, an
 * input of the search rather than a property of the field.
 *
 * NO EXTRAPOLATION (J-fix2 item 1): a run that ran out of iterations is never accepted on the
 * strength of its last steps shrinking. The old geometric-tail rule took ρ = |d| / |previous d|
 * < 1 as linear convergence and claimed a root within 2|d| / (1 - ρ); a run walking down
 * exp(x) + 1 has ρ = 1 - 1e-11 from finite-difference noise and "converged" to a point with
 * |F| = 5e116, and a run oscillating across the cusp of sqrt|x| (each step mirrors x, |F| shrinks
 * by one part in 1e8) claimed a radius larger than the box. Instead, a run that is still closing
 * in at the iteration limit (the geometric tail 2|d| / (1 - ρ) of its steps keeps shrinking, as
 * it does at a multiple root x^m with ρ = 1 - 1/m) is given up to EXTENDED_ITERATIONS times
 * maxIterations to reach the location tolerance on its own; a run whose tail grows (the harmonic
 * outward walk of a Gaussian, steps 1/(2x) with ρ -> 1) stops at maxIterations and is not a root.
 *
 * A full Newton step that reduces |F| by less than the factor POOR_DECREASE (the linear model
 * predicted 0) is compared with the half step and the better of the two is taken: at the cusp of
 * sqrt|x| the full step is the mirror image (dir = -2x, |F| unchanged to FD noise) and the half
 * step lands on the root.
 *
 * The returned `locTol` is the radius within which the root lies: for a converged root the
 * geometric tail of its steps (the step itself for quadratic convergence; never below the
 * location tolerance at p); for a root accepted at its rounding floor also the width of the band
 * where the residual stays at that floor (floorWidth).
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
  let lastStep = Infinity;
  let lastTail = Infinity;
  let hJ = fdStep(p, scale);

  // The stalled exits (no step decreases |F|, no usable direction, iterations exhausted). A root
  // only when the residual is at its rounding floor (nothing smaller can be computed there). The
  // old rule "with a rank-deficient J, the distance lower bound |F| / ||J||_F is within the
  // location tolerance" is gone (J-fix2 item 2): |F| ≈ ||J|| |p - r| presumes a root r nearby,
  // and at the least-squares optimum of a field with no zero the bound is just as small
  // (x' = y, y' = exp(-x²) - 0.5y at (-9.96, 3e-44): |F| = 7e-44 with a floor of 7e-57, thirty
  // "saddles"); a root on a domain edge is reached exactly instead (the edge bisection in the
  // backtracking). A Newton-branch stall above the rounding floor with a step larger than the
  // tolerance is not a root: the model puts the root further away and the residual would not
  // decrease toward it. An exhausted run is not a root either (see above).
  const stalled = (J: Matrix2, dir: Vec2 | null): NewtonResult => {
    const stepTol = stepTolAt(p, scale);
    const newtonDir = dir !== null && isFiniteVec(dir);
    const dn = newtonDir ? norm(dir) : 0;
    const floor = roundingFloor(sys, p, F, hJ, J);
    if (floor.underflow) return { at: p, locTol: stepTol, root: false, underflow: true };
    if (floor.atFloor) return { at: p, locTol: Math.max(stepTol, dn, floorWidth(sys, p, stepTol, scale)), root: true };
    return { at: p, locTol: Math.max(stepTol, dn), root: false };
  };

  const limit = EXTENDED_ITERATIONS * maxIterations;
  let closingIn = false;
  for (let iter = 0; iter < maxIterations || (closingIn && iter < limit); iter++) {
    const stepTol = stepTolAt(p, scale);
    // Finite-difference step for the Jacobian: shrink it with the Newton step. Near a multiple
    // root the truncation error h^2 f_xxx / 6 of a fixed h = 1e-6 swamps the true derivative
    // (3x^2 for x' = -x^3 once x < 6e-7) and the damped step crawls; h ~ step/100 keeps the
    // error far below the derivative while rounding (eps |f| / h) stays negligible.
    hJ = Math.min(fdStep(p, scale), Math.max(1e-2 * lastStep, fdStepMin(p, scale)));
    // One-sided columns where the stencil leaves the field's domain (a root on the domain edge).
    let J = jacobianAt(sys, p, hJ, 0, { oneSided: true });
    // A row of J dominated by the rounding noise of its stencil (eps × the expression's own
    // terms / h) makes the Newton step meaningless. The shrunken step is the usual cause
    // (cos(x) - 1 at x = 8e-8: f' = -x = -8e-8 against 2 eps / h at h = 1e-10), so the step is
    // widened by factors of 4, up to fdStep, until the noise is below the row's entries: the
    // smallest such step keeps the truncation smallest (x - sin(x) at x = 3e-7 has f' = 4.5e-14
    // and the coarse step's truncation h² / 6 would be 2.7e-12, a step 60x too short). If even
    // fdStep is noise (inside the band |x| < 6e-8 of cos(x) - 1, where the value itself is noise)
    // a step below the tolerance is no evidence of a root and the run ends on the residual alone
    // (J-fix2 item 2).
    const hMax = fdStep(p, scale);
    while (noiseDominated(sys, p, J, hJ, JACOBIAN_WIDEN_FRACTION) && hJ < hMax) {
      hJ = Math.min(4 * hJ, hMax);
      J = jacobianAt(sys, p, hJ, 0, { oneSided: true });
    }
    const noise = rowNoise(sys, p, hJ, J);
    if ([0, 1].some((i) => noise[i] > JACOBIAN_NOISE_FRACTION * Math.max(Math.abs(J[i][0]), Math.abs(J[i][1])))) return stalled(J, null);
    const nd = newtonDirection(J, F, singularDetTol(J, noise));
    if (nd === null || !isFiniteVec(nd.dir)) return stalled(J, null);
    const dir = nd.dir;
    const dn = norm(dir);
    // A step is an improvement when the residual decreases, or when its floored norm does (a
    // component already at its floor fluctuates by rounding and must not veto the decrease of
    // the other; residualFloors).
    // The step's own imprecision, the Jacobian's row noise times its length, is part of the
    // floor at the landing point: the model predicts 0 there only to that accuracy.
    const improves = (q: Vec2, Fq: Vec2, taken: number): boolean =>
      norm(Fq) < fNorm || flooredNorm(sys, q, Fq, hJ, J, [noise[0] * taken, noise[1] * taken]) < flooredNorm(sys, p, F, hJ, J);

    if (!nd.lm && dn <= stepTol) {
      // Converged: the model puts the root within the tolerance. Polish: keep taking Newton
      // steps (the half step when the full one is poor, as below) while the residual still
      // decreases and is not yet at its rounding floor, at most POLISH_ITERATIONS times; the
      // verdict is already made, the polish only moves the point closer (at the cusp of sqrt|x|
      // each step divides |x| by the relative error of the difference quotient, so a run that
      // converged at 2e-13 ends far closer to 0, and the uniqueness probe's window around the
      // point sees the clean law). A step that fails leaves the converged point as it was.
      let d = dir;
      for (let k = 0; k < POLISH_ITERATIONS; k++) {
        const q = { x: p.x + d.x, y: p.y + d.y };
        let Fq = sys.eval(q);
        let best = q;
        const qh = { x: p.x + 0.5 * d.x, y: p.y + 0.5 * d.y };
        const Fh = sys.eval(qh);
        if (isFiniteVec(Fh) && (!isFiniteVec(Fq) || norm(Fh) < norm(Fq))) { best = qh; Fq = Fh; }
        if (!isFiniteVec(Fq) || !improves(best, Fq, Math.hypot(best.x - p.x, best.y - p.y))) break;
        p = best;
        F = Fq;
        fNorm = norm(Fq);
        const hp = Math.min(hJ, Math.max(1e-2 * norm(d), fdStepMin(p, scale)));
        const Jp = jacobianAt(sys, p, hp, 0, { oneSided: true });
        if (roundingFloor(sys, p, F, hp, Jp).atFloor) break;
        const np = newtonDirection(Jp, F, singularDetTol(Jp, rowNoise(sys, p, hp, Jp)));
        if (np === null || np.lm || !isFiniteVec(np.dir)) break;
        d = np.dir;
      }
      // The radius claimed: for a simple root the step itself, for a multiple root (linear
      // convergence with ratio ρ = |d| / previous step) the remaining geometric tail
      // |d| / (1 - ρ) (x' = -x³: ρ = 2/3, the root is 3 steps away), with a factor 2 of safety,
      // so the runs that stop on either side of a double root are one root; never a verdict.
      // A residual at its rounding floor also claims the band where it stays there (cos(x) - 1
      // evaluates to exactly 0 for |x| < 1e-8: two runs stopping at -1e-8 and 7e-9 are one root).
      const stepTolP = stepTolAt(p, scale);
      const band = roundingFloor(sys, p, F, hJ, J).atFloor ? floorWidth(sys, p, stepTolP, scale) : 0;
      return { at: p, locTol: Math.max(stepTolP, (2 * dn) / (1 - Math.min(dn / lastStep, 0.99)), band), root: true };
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

    // Backtracking: accept the first step that does not increase the residual (a poor full step
    // is compared with the half step first). A full step into undefined territory (non-finite F)
    // is first cut back to the edge of the domain by bisection on the step fraction (64 halvings,
    // the last finite point): a root ON the edge (x' = sqrt(x) y, y' = x on x = 0) is then reached
    // in a few iterations instead of a crawl of halvings (Newton's dir_x = -2x lands exactly on
    // x = 0), where F is evaluated and the residual decides. Otherwise the step is halved like
    // any other rejected step.
    let step = 1;
    let accepted = false;
    for (let k = 0; k < 12; k++) {
      let q = { x: p.x + step * dir.x, y: p.y + step * dir.y };
      let Fq = sys.eval(q);
      if (k === 0 && !isFiniteVec(Fq)) {
        let lo = 0, hi = 1; // lo: finite (p itself), hi: undefined
        for (let m = 0; m < 64; m++) {
          const mid = (lo + hi) / 2;
          if (mid <= lo || mid >= hi) break;
          if (isFiniteVec(sys.eval({ x: p.x + mid * dir.x, y: p.y + mid * dir.y }))) lo = mid;
          else hi = mid;
        }
        if (lo > 0) {
          q = { x: p.x + lo * dir.x, y: p.y + lo * dir.y };
          Fq = sys.eval(q);
          step = lo;
        }
      } else if (k === 0 && norm(Fq) > POOR_DECREASE * fNorm) {
        const qh = { x: p.x + 0.5 * dir.x, y: p.y + 0.5 * dir.y };
        const Fh = sys.eval(qh);
        if (isFiniteVec(Fh) && norm(Fh) < norm(Fq)) { q = qh; Fq = Fh; step = 0.5; }
      }
      if (isFiniteVec(Fq) && improves(q, Fq, step * dn)) {
        const taken = step * dn;
        const tail = (2 * taken) / (1 - Math.min(taken / lastStep, 0.99));
        closingIn = tail < lastTail;
        lastTail = tail;
        lastStep = taken;
        p = q;
        F = Fq;
        fNorm = norm(Fq);
        accepted = true;
        break;
      }
      step /= 2;
    }
    // No decrease possible: either we are at the root up to rounding, or the seed is hopeless.
    if (!accepted) return stalled(J, nd.lm ? null : dir);
    if (
      p.x < box.x.min - escape || p.x > box.x.max + escape ||
      p.y < box.y.min - escape || p.y > box.y.max + escape
    ) {
      return null;
    }
  }
  const J = jacobianAt(sys, p, hJ, 0, { oneSided: true });
  const nd = newtonDirection(J, F, singularDetTol(J, rowNoise(sys, p, hJ, J)));
  return stalled(J, nd !== null && !nd.lm ? nd.dir : null);
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
  const stalls: NewtonResult[] = [];
  let underflowPlateau = false;
  // Runs Newton from a seed and registers what it finds: the located root (new or already
  // known: the run that reached it is returned either way), or null for a diverged, aborted or
  // out-of-box run; a stall goes to the vanishing test later, and a run that ended on an
  // underflow plateau only sets the notice. A point outside the box by more than its location
  // radius (itself capped at ABORT_RADIUS times the box) is never reported (J-fix2 item 1).
  const runSeed = (seed: Vec2): NewtonResult | null => {
    opts.checkpoint?.();
    const r = newton(sys, seed, box, scale, maxIterations, { points: found, radius: ABORT_RADIUS * scale });
    if (r === null) return null;
    const p = r.at, margin = Math.min(r.locTol, ABORT_RADIUS * scale);
    if (p.x < box.x.min - margin || p.x > box.x.max + margin || p.y < box.y.min - margin || p.y > box.y.max + margin) {
      return null;
    }
    if (r.underflow) {
      // An underflow plateau, not a root: the underflowed component is exactly 0 at the coarsest
      // probe offset in every axis direction where the field is defined (exp(x) at x = -999 on
      // [-1000, 1000]²: 0 everywhere within 2e-7). A product that merely underflows next to a
      // genuine root (x' = xy at (1e-200, 1e-200): the axes are equilibria) is non-zero at those
      // offsets and only drops the run.
      const D = VANISHING_DELTA_FACTOR * stepTol;
      const bounds = sys.roundingBound?.(p);
      const zeroComponents = bounds ? bounds.map((b) => b.underflow && b.value === 0) : [false, false];
      const flat = [{ x: D, y: 0 }, { x: -D, y: 0 }, { x: 0, y: D }, { x: 0, y: -D }].every((d) => {
        const v = sys.eval({ x: p.x + d.x, y: p.y + d.y });
        if (!isFiniteVec(v)) return true;
        return (!zeroComponents[0] || v.x === 0) && (!zeroComponents[1] || v.y === 0);
      });
      if (flat) underflowPlateau = true;
      return null;
    }
    if (!r.root) {
      stalls.push(r);
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
  // A corner where a component of F is not finite says nothing about its sign (J-fix2 item 8).
  // The field is re-evaluated a fraction CORNER_NUDGE of the cell inward (toward the cell's
  // centre): if it is finite there, the corner is a removable singularity of that component
  // (x log|x| at x = 0 on every symmetric box: 0 × (-Infinity) = NaN on the corner, finite a hair
  // inside) and the component's sign at the corner is UNKNOWN, recorded as 0, which the change
  // test min <= 0 <= max reads as compatible with both signs, so the cell and every sub-cell
  // sharing the corner are refined (bounded by the caps) until a run from a sub-cell centre lands
  // in the root's basin. (The nudged value itself is not used: f = x log|x| is negative on the
  // whole of (0, 1), so no interior witness would show the sign change that happens exactly AT the
  // corner.) If the nudged value is not finite either, the corner lies in a region where the
  // field is undefined and the cell is left out as before. Corner order: [x0y0, x1y0, x0y1, x1y1].
  const witnesses = (x0: number, x1: number, y0: number, y1: number, F: Vec2[]): Vec2[] =>
    F.map((v, k) => {
      if (isFiniteVec(v)) return v;
      const left = k % 2 === 0, bottom = k < 2;
      const inward = sys.eval({ x: (left ? x0 : x1) + (left ? 1 : -1) * CORNER_NUDGE * (x1 - x0), y: (bottom ? y0 : y1) + (bottom ? 1 : -1) * CORNER_NUDGE * (y1 - y0) });
      return { x: Number.isFinite(v.x) ? v.x : Number.isFinite(inward.x) ? 0 : NaN, y: Number.isFinite(v.y) ? v.y : Number.isFinite(inward.y) ? 0 : NaN };
    });
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
      const W = witnesses(cornerX(i), cornerX(i + 1), cornerY(j), cornerY(j + 1), ks.map((k) => ({ x: cf[k], y: cg[k] })));
      const f = W.map((v) => v.x), g = W.map((v) => v.y);
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
    const sub = (x0: number, x1: number, y0: number, y1: number, F0: Vec2[]) => {
      const F = witnesses(x0, x1, y0, y1, F0);
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

  // Vanishing test (review J item 8; J-fix2 items 1, 5): a converged point is an equilibrium
  // only if the field tends to its value there from every direction in which it is defined.
  // Along 8 directions (both sides of the two axes and of the two diagonals) the differences
  // |F(p + δ e) - F(p)| are taken over the ladder δ = VANISHING_DELTA_FACTOR × stepTol × 2^-k,
  // k = 0, 1, ..., down to VANISHING_RESOLUTION_FACTOR times the resolution to which p is known
  // (the radius locTol the run claimed for a located root; the location tolerance at p for a
  // stall): an offset closer to p than that steps around a point that may not be the one in
  // question, and what it sees there is no evidence about p (the stall of a run that crawled
  // toward the origin of x' = xy / (x² + y²) lies a few 1e-15 up the y-axis; the located point
  // of x' = x² / (x² + y²), y' = -y lies 4e-13 below the origin, and at offsets of that size
  // along x the field drops from 1 to 0.5, which a least-squares exponent over the finest
  // levels read as "vanishing" with β = 0.15). The verdict is the END-TO-END decrease: the
  // difference at the finest usable level must be smaller than at the coarsest by at least the
  // factor (δ_finest / δ_coarsest)^VANISHING_MIN_EXPONENT, i.e. |F(p + δ e) - F(p)| ~ δ^β with
  // β > VANISHING_MIN_EXPONENT over the resolved window; a direction on which it is not
  // (x' = xy / (x² + y²): 0.5 along every diagonal at every distance) shows a field that does
  // not tend to F(p): p is a singular point of the field, not an equilibrium. A Hölder root
  // (sqrt|x|: β = 1/2) still vanishes. A direction on which the field is undefined arbitrarily
  // close to p (domain edge) says nothing and is skipped, as is one with fewer than MIN_LEVELS
  // usable levels: the point then stays, on Newton's evidence alone.
  //
  // UNRESOLVABLE DIFFERENCES end a direction as vanished, never as a discontinuity: a value
  // F(p + δ e) that is exactly 0, a difference below the rounding floor of the two values
  // (10 × the expressions' own rounding bounds), or, for a point accepted as a root, a
  // difference not larger than the residual |F(p)| itself (the residual is zero to the
  // resolution of the point, so a constant difference equal to it is the field being zero on
  // both sides: x' = (x + y)², y' = 0 at a point of the line x + y = 0 with F(p) = 3.9e-61
  // used to be reported as a singular point of an entire field).
  // The window is [VANISHING_RESOLUTION_FACTOR, VANISHING_DELTA_FACTOR] times the point's
  // resolution (at least stepTol): a root that converged only linearly (the crawl down the y-axis
  // of x' = x² / (x² + y²) claims 200 steps of radius) is probed at offsets that resolve it.
  const singularPoints: Vec2[] = [];
  const boundError = (q: Vec2): number => {
    if (!sys.roundingBound) return NaN;
    const [bf, bg] = sys.roundingBound(q);
    return bf.error + bg.error;
  };
  const vanishes = (p: Vec2, resolution: number, root: boolean): boolean => {
    const F0 = sys.eval(p);
    const base = isFiniteVec(F0) ? F0 : { x: 0, y: 0 };
    const residual = root ? norm(base) : 0;
    const baseMag = Math.max(Math.abs(base.x), Math.abs(base.y));
    const baseError = boundError(p);
    // What one rounding of the coordinates of q changes F by, |J| × EPS × |coordinates| (J-fix3
    // item 2): q = p + δ e is rounded to the double grid, and near x = 1 that grid is 1.1e-16
    // wide; a polynomial field with a gradient of 1 then differs from its value at the exact q
    // by 1e-16 whatever δ is. Such a difference is the resolution of the point, not a
    // direction-dependent limit: without this term the stalls of x' = x(1 - x - y), y' = y(1 - x)
    // near (1, 0) (a continuous field) were called discontinuous, 44 times.
    const Jp = jacobianAt(sys, p, fdStep(p, scale), 0, { oneSided: true });
    const fin = (v: number) => (Number.isFinite(v) ? Math.abs(v) : 0);
    const quantization = (q: Vec2): number =>
      EPS * ((fin(Jp[0][0]) + fin(Jp[1][0])) * Math.max(Math.abs(p.x), Math.abs(q.x)) + (fin(Jp[0][1]) + fin(Jp[1][1])) * Math.max(Math.abs(p.y), Math.abs(q.y)));
    // The difference at q: NaN when q is undefined, 0 when it is unresolvable (vanished).
    const h = (q: Vec2): number => {
      const v = sys.eval(q);
      if (!isFiniteVec(v)) return NaN;
      if (v.x === 0 && v.y === 0) return 0;
      const diff = Math.hypot(v.x - base.x, v.y - base.y);
      const qError = boundError(q);
      const rounding = Number.isFinite(qError) && Number.isFinite(baseError) ? qError + baseError : EPS * Math.max(baseMag, Math.abs(v.x), Math.abs(v.y));
      const floor = 10 * (rounding + quantization(q));
      return diff <= Math.max(floor, residual) ? 0 : diff;
    };
    const minOffset = VANISHING_RESOLUTION_FACTOR * Math.max(resolution, stepTol);
    const probeStart = VANISHING_DELTA_FACTOR * Math.max(resolution, stepTol);
    const s = Math.SQRT1_2;
    for (const e of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: s, y: s }, { x: -s, y: -s }, { x: s, y: -s }, { x: -s, y: s }]) {
      opts.checkpoint?.();
      const levels: { delta: number; d: number }[] = [];
      let vanished = false;
      for (let delta = probeStart; delta >= minOffset; delta /= 2) {
        const d = h({ x: p.x + delta * e.x, y: p.y + delta * e.y });
        if (Number.isNaN(d)) continue;
        if (d === 0) { vanished = true; break; }
        levels.push({ delta, d });
      }
      if (vanished || levels.length < MIN_LEVELS) continue;
      const first = levels[0], last = levels[levels.length - 1];
      if (last.d > first.d * (last.delta / first.delta) ** VANISHING_MIN_EXPONENT) return false;
    }
    return true;
  };
  const flagged: NewtonResult[] = [];
  for (let i = located.length - 1; i >= 0; i--) {
    if (vanishes(located[i].at, located[i].locTol, true)) continue;
    flagged.push(located[i]);
    located.splice(i, 1);
  }
  // A run that stalled without a consistent residual ended at a singular point when the field is
  // discontinuous there (Newton crawls toward it along the directions where |F| tends to 0); a
  // stall elsewhere (a local minimum of |F| that is not a root) is dropped as before.
  // A singular point is located to the window the vanishing test looked at: the field was seen
  // not to tend to F(p) at offsets up to VANISHING_DELTA_FACTOR × stepTol, so the discontinuity
  // lies within that radius of p, and every run that crawled toward the same singularity stalls
  // somewhere inside it (the origin of x' = xy / (x² + y²) collects stalls on both sides of the
  // anti-diagonal, from 5e-11 to 1e-9 away on [-1000, 1000]²). Flagged points within that radius
  // of each other are one singular point, represented by the MEDOID of the cluster (the flagged
  // point with the smallest total distance to the others): runs approach a discontinuity from
  // several sides, and the one nearest the middle of the cluster is the best located.
  // A stall's own radius (the Newton step it could not take, or the location tolerance) widens
  // the cluster it belongs to (J-fix3 item 2): stalls of runs crawling toward one point spread
  // over their last steps, wider than the vanishing window, and were listed one by one.
  const singularAt = (r: NewtonResult): NewtonResult => ({ at: r.at, locTol: Math.max(VANISHING_DELTA_FACTOR * stepTol, r.locTol), root: false });
  const singularRuns: NewtonResult[] = flagged.map(singularAt);
  for (const r of stalls) {
    if (located.some((q) => sameRoot(q, { at: r.at, locTol: stepTolAt(r.at, scale), root: false }))) continue;
    if (!vanishes(r.at, stepTolAt(r.at, scale), false)) singularRuns.push(singularAt(r));
  }
  const clusters: NewtonResult[][] = [];
  for (const r of singularRuns) {
    const c = clusters.find((members) => members.some((q) => sameRoot(q, r)));
    if (c) c.push(r);
    else clusters.push([r]);
  }
  for (const members of clusters) {
    const total = (p: Vec2) => members.reduce((acc, q) => acc + Math.hypot(q.at.x - p.x, q.at.y - p.y), 0);
    singularPoints.push(members.reduce((best, r) => (total(r.at) < total(best) ? r.at : best), members[0].at));
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
  // The finite-difference step is relative to the box and to |p| with no absolute floor (J-fix2
  // item 4): in units where the box is 4e-7 wide a step of 1e-6 spans the whole box.
  // A coordinate below the point's own resolution is 0 as far as the run can tell (J-fix3
  // item 3): the last Newton step leaves x = 7e-322 for a root on the y-axis, and that noise
  // would change with the box; the snap moves the point by less than the radius it claims.
  const equilibria: Equilibrium[] = located.map(({ at: located, locTol }) => {
    const resolution = locTol;
    const at = { x: Math.abs(located.x) <= resolution ? 0 : located.x, y: Math.abs(located.y) <= resolution ? 0 : located.y };
    const { J: jacobian, errors, domainEdge, h } = jacobianWithError(sys, at, 0, { scale });
    if (domainEdge) return { at, jacobian, resolution, ...classify(jacobian), caveat: "domainEdge" };
    const locationError = Math.max(10 * stepTol, locTol);
    // Per entry (review J item 6): the 1e8 entry's rounding must not be charged to the 1e-8 entry.
    const S = jacobianSensitivityEntries(sys, at, jacobian, h);
    const entryErrors = errors.map((row, i) => row.map((e, j) => 10 * (e + S[i][j] * locationError))) as Matrix2;
    return { at, jacobian, resolution, ...classify(jacobian, undefined, { entryErrors }) };
  });

  const singular = singularPoints.length ? { singularPoints } : {};
  const plateau = underflowPlateau ? { underflowPlateau: true as const } : {};
  if (equilibria.length === 0) return { points: [], warning: "none_found", seeding, ...singular, ...plateau };

  // A field that is exactly 0 on a region of the box (x' = 0, y' = 0; max(x - 1, 0),
  // max(y - 1, 0)): every point there is an equilibrium, the located points are only the samples
  // the seeds happened to fall on, and neither "a line or a curve" nor "isolated degenerate
  // points" describes it (J-fix2 item 6). The signal is the scan: exactly 0 (not merely small,
  // never a tolerance) at REGION_ZERO_FRACTION or more of its finite samples.
  const finiteSamples = mag.filter(Number.isFinite);
  const zeroSamples = finiteSamples.filter((m) => m === 0).length;
  if (finiteSamples.length > 0 && zeroSamples >= REGION_ZERO_FRACTION * finiteSamples.length) {
    const cut = equilibria.length > maxPoints;
    return { points: cut ? equilibria.slice(0, maxPoints) : equilibria, warning: "region_of_equilibria", ...(cut ? { truncated: true } : {}), seeding, ...singular, ...plateau };
  }

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
    ...plateau,
  };
}
