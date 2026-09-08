/**
 * Equilibrium search: seeds on a grid, damped Newton (Levenberg-Marquardt fallback when the
 * Jacobian is singular), de-duplication, classification.
 *
 * Missing an equilibrium is worse than misclassifying one (it silently tells the student
 * "nothing is there"), so the search seeds Newton from TWO independent sources:
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
 * - a seed that diverges or stalls        -> silently dropped
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
import { determinant, jacobianAt, jacobianSensitivity, jacobianWithError } from "./jacobian";
import type { CompiledSystem } from "./parse";
import type { Box, Matrix2, Vec2 } from "./types";

export type Equilibrium = { at: Vec2; jacobian: Matrix2 } & ClassifyResult;

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
/** Newton stops on a step below this fraction of the box size; a root is located to about this precision. */
export const NEWTON_STEP_TOL = 1e-13;

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
  fTol: number,
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
    const polished = newton(sys, mid, box, scale, fTol, maxIterations);
    if (!polished) continue;
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
  /** Relative residual tolerance for convergence. Default 1e-9. */
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
  // Entries above ~1e154 (a one-sided derivative of sqrt at a domain edge) overflow JᵀJ: no
  // usable direction; the caller keeps the point if its residual is already below tolerance.
  if (!(Math.abs(mdet) > 0) || !Number.isFinite(mdet)) return null;
  return { dir: { x: (m11 * g0 - g01 * g1) / mdet, y: (-g01 * g0 + m00 * g1) / mdet }, lm: true };
}

/**
 * Damped Newton from `seed`; null when it diverges, stalls or (with `abortNear`) comes within
 * `abortNear.radius` of an already found root, which de-duplication would discard anyway (a
 * root on a domain edge is approached only linearly, and 144 grid seeds crawling to the same
 * point would cost 200 iterations each).
 */
function newton(
  sys: CompiledSystem,
  seed: Vec2,
  box: Box,
  scale: number,
  fTol: number,
  maxIterations: number,
  abortNear?: { points: Vec2[]; radius: number },
): Vec2 | null {
  let p = seed;
  let F = sys.eval(p);
  if (!isFiniteVec(F)) return null;
  let fNorm = norm(F);
  const escape = 2 * scale; // how far outside the box a seed may wander before we give up
  // Converge on the step as well as on the residual: at a multiple root the residual reaches fTol
  // while the point is still ~sqrt(fTol) away, and different seeds would stop at different places
  // (each then mis-classified as hyperbolic). Newton still shrinks the step geometrically there.
  const stepTol = NEWTON_STEP_TOL * scale;
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
    // One-sided columns where the stencil leaves the field's domain (a root on the domain edge).
    const nd = newtonDirection(jacobianAt(sys, p, hJ, 0, { oneSided: true }), F, scale);
    if (nd === null || !isFiniteVec(nd.dir)) return fNorm <= fTol ? p : null;
    const dir = nd.dir;
    lastFromLM = nd.lm;

    // Backtracking: accept the first step that does not increase the residual. A step into
    // undefined territory (non-finite F) is halved like any other rejected step.
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
    if (abortNear && abortNear.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= abortNear.radius)) return null;
  }
  return fNorm <= fTol ? p : null;
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
  const tol = opts.tol ?? 1e-9;
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
  const finiteMags: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const F = sys.eval(cellCentre(i, j));
      const k = j * n + i;
      fv[k] = F.x;
      gv[k] = F.y;
      mag[k] = isFiniteVec(F) ? norm(F) : NaN;
      if (Number.isFinite(mag[k])) finiteMags.push(mag[k]);
    }
  }
  // Residual tolerance relative to the typical field strength in the box.
  finiteMags.sort((u, v) => u - v);
  const typical = finiteMags.length ? Math.max(finiteMags[Math.floor(finiteMags.length / 2)], 1e-300) : 1;
  const fTol = tol * Math.max(1, typical);

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
  const seeding: SeedingReport = { seedGrid, scanGrid, signChanges, candidates: candidates.length, seeds: scanSeeds.length, capped };

  const found: Vec2[] = [];
  // Equilibria sitting exactly on a box edge are legitimate; allow the located point to overshoot
  // the edge by the same amount we use to merge duplicates.
  const margin = 1e-6 * scale;
  const dedupe = 1e-6 * scale;
  for (const seed of [...seeds, ...scanSeeds]) {
    opts.checkpoint?.();
    const p = newton(sys, seed, box, scale, fTol, maxIterations, { points: found, radius: dedupe });
    if (p === null) continue;
    if (p.x < box.x.min - margin || p.x > box.x.max + margin || p.y < box.y.min - margin || p.y > box.y.max + margin) {
      continue;
    }
    if (found.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= dedupe)) continue;
    found.push(p);
  }

  found.sort((u, v) => u.x - v.x || u.y - v.y);

  // The Jacobian's local error (finite differences: truncation + rounding) plus the part that
  // comes from not standing exactly on the root: Newton locates a root to about NEWTON_STEP_TOL
  // times the box (a multiple root converges only linearly, so the last step IS the remaining
  // distance; 10x for slower ratios), and the Jacobian moves by its sensitivity times that. With
  // a 10x safety margin this is the level below which an entry, the determinant or the trace is
  // zero for this problem. Local to the point, never a box-wide statistic (review C4).
  const locationError = 10 * NEWTON_STEP_TOL * scale;
  const equilibria: Equilibrium[] = found.map((at) => {
    const { J: jacobian, error, domainEdge } = jacobianWithError(sys, at);
    if (domainEdge) return { at, jacobian, ...classify(jacobian), caveat: "domainEdge" };
    const zeroFloor = Number.isFinite(error) ? 10 * (error + jacobianSensitivity(sys, at, jacobian) * locationError) : Infinity;
    return { at, jacobian, ...classify(jacobian, undefined, { zeroFloor }) };
  });

  if (equilibria.length === 0) return { points: [], warning: "none_found", seeding };

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
    const cc = connectedComponents(sys, pts, found, dedupe, box, scale, fTol, maxIterations, opts.checkpoint);
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
  };
}
