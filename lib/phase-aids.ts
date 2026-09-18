/**
 * Three textbook overlays that let a phase plane explain itself (round V). All optional, all off by
 * default, all built from machinery that already exists (no new numerical method, kernel untouched):
 *
 * - NULLCLINES: the curves f = 0 and g = 0, by the marching squares of lib/render/contours. The
 *   equilibria are exactly where the two families cross, so the student sees WHY they are there.
 *   On a first-order picture dy/dt = g(t, y) the one family g = 0 is where solutions have their
 *   maxima and minima; on a differential form the families are N = 0 and M = 0.
 * - EIGEN-DIRECTIONS: at a hyperbolic equilibrium with real eigenvalues, the directions of the
 *   eigenvectors of the Jacobian the kernel already returned (2 x 2 closed form). A saddle has a
 *   stable and an unstable one; a degenerate node has ONE, which is its defining feature; a star
 *   node has every direction; a spiral or a center has none (complex eigenvalues).
 * - SEPARATRICES: from each saddle, the four branches of its stable and unstable manifolds, traced
 *   by the existing adaptive integrator from a point a tiny, VIEW-RELATIVE offset along the
 *   eigen-direction (forward in time for the unstable ones, backward for the stable ones). They
 *   separate initial points with different fates.
 *
 * Honesty: a marching-squares sign change is not yet a zero. 1/x changes sign across its pole and
 * sign(x) across its jump without vanishing; a segment is kept only when the function actually is
 * small there (NULLCLINE_RESIDUAL_FRACTION of the cell's own corner values). A separatrix is a
 * numerical curve started on the LINEARIZED direction; the help says so.
 *
 * Pure: no React, no canvas. components/drawScene.ts draws a Scene's `aids`.
 */
import type { Equilibrium } from "./core/equilibria";
import { integrateAdaptive, type IntegrationStatus } from "./core/integrate";
import type { CompiledSystem } from "./core/parse";
import type { Box, Vec2 } from "./core/types";
import { contourSegmentsFromGrid, sampleGrid, type ScalarGrid, type Segment } from "./render/contours";

/** Cells per axis of the nullcline grid (over the VISIBLE box, so the resolution follows the zoom). */
export const NULLCLINE_GRID = 80;
/** A contour segment is a zero only if |value at its midpoint| is at most this fraction of the largest |corner value| of its cell. */
export const NULLCLINE_RESIDUAL_FRACTION = 0.25;
/** Start of a separatrix branch: this fraction of the scale box's diagonal away from the saddle (about a pixel on screen). */
export const SEPARATRIX_OFFSET_FRACTION = 1e-3;
/** Time a separatrix branch is followed for (it also ends when it leaves the stop box or reaches an equilibrium). */
export const SEPARATRIX_TSPAN = 100;

export type NullclineSet = {
  /** Where the first component vanishes: x' = 0 (planar), N = 0 (differential form); empty for dy/dt = g (the first component is 1). */
  f: Segment[];
  /** Where the second component vanishes: y' = 0, x'' = 0 (second order), dy/dt = 0, M = 0. */
  g: Segment[];
};

/** The zero level of one sampled component, without the sign changes that are not zeros (poles, jumps). */
function zeroSegments(grid: ScalarGrid, value: (p: Vec2) => number): Segment[] {
  const { box, nx, ny, values } = grid;
  const dx = (box.x.max - box.x.min) / nx;
  const dy = (box.y.max - box.y.min) / ny;
  return contourSegmentsFromGrid(grid, 0).filter(([a, b]) => {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const i = Math.min(nx - 1, Math.max(0, Math.floor((mid.x - box.x.min) / dx)));
    const j = Math.min(ny - 1, Math.max(0, Math.floor((mid.y - box.y.min) / dy)));
    const corners = Math.max(Math.abs(values[j][i]), Math.abs(values[j][i + 1]), Math.abs(values[j + 1][i]), Math.abs(values[j + 1][i + 1]));
    const residual = Math.abs(value(mid));
    return Number.isFinite(residual) && residual <= NULLCLINE_RESIDUAL_FRACTION * corners;
  });
}

/** The two nullcline families of a compiled system inside `box`, at time `t` (a non-autonomous field is a snapshot, and so are its nullclines). */
export function computeNullclines(sys: CompiledSystem, box: Box, t = 0, n = NULLCLINE_GRID): NullclineSet {
  const f = (p: Vec2) => sys.eval(p, t).x;
  const g = (p: Vec2) => sys.eval(p, t).y;
  return { f: zeroSegments(sampleGrid(f, box, n, n), f), g: zeroSegments(sampleGrid(g, box, n, n), g) };
}

export type EigenDirection = {
  at: Vec2;
  /** Unit vector (world coordinates); the direction is a line, so its sign carries no meaning. */
  direction: Vec2;
  eigenvalue: number;
  /** Solutions on this line approach the equilibrium (eigenvalue < 0) or leave it (> 0). */
  kind: "stable" | "unstable";
};

/**
 * Why an equilibrium has the directions it has:
 * "two" distinct real eigenvalues; "one" a repeated eigenvalue with a single eigenvector (a
 * degenerate node); "every" a repeated eigenvalue whose matrix is a multiple of the identity (a
 * star node: every direction is an eigen-direction, none is drawn); "complex" a spiral or a
 * center-or-weak-spiral (no real eigen-direction); "undecided" a non-hyperbolic point (the
 * linearization decides nothing, so nothing is drawn).
 */
export type EigenNote = "two" | "one" | "every" | "complex" | "undecided";

export type EigenReport = { note: EigenNote; directions: EigenDirection[] };

/** An eigenvector of [[a, b], [c, d]] for the real eigenvalue l: the better conditioned of (b, l - a) and (l - d, c); null when both vanish (the matrix is l I). */
function eigenvector(j: Equilibrium["jacobian"], l: number): Vec2 | null {
  const [[a, b], [c, d]] = j;
  const u = { x: b, y: l - a };
  const w = { x: l - d, y: c };
  const pick = Math.hypot(u.x, u.y) >= Math.hypot(w.x, w.y) ? u : w;
  const norm = Math.hypot(pick.x, pick.y);
  if (!(norm > 0) || !Number.isFinite(norm)) return null;
  // A canonical sign (first non-zero component positive), so the same line always reads the same.
  const sign = pick.x < 0 || (pick.x === 0 && pick.y < 0) ? -1 : 1;
  return { x: (sign * pick.x) / norm, y: (sign * pick.y) / norm };
}

/**
 * The eigen-directions of one classified equilibrium, decided by the kernel's OWN classification
 * (never re-decided here): saddle and the two ordinary nodes have two real eigenvalues; a
 * degenerate node one direction, for the repeated eigenvalue tr / 2; a star node every direction;
 * spirals and the center-or-weak-spiral none; a non-hyperbolic point none.
 */
export function eigenDirections(e: Equilibrium): EigenReport {
  const kindOf = (l: number): "stable" | "unstable" => (l < 0 ? "stable" : "unstable");
  switch (e.classification) {
    case "saddle":
    case "stable_node":
    case "unstable_node": {
      const directions: EigenDirection[] = [];
      for (const l of e.eigenvalues.map((v) => v.re)) {
        const direction = eigenvector(e.jacobian, l);
        if (direction) directions.push({ at: e.at, direction, eigenvalue: l, kind: kindOf(l) });
      }
      return { note: "two", directions };
    }
    case "degenerate_node": {
      const l = e.trace / 2;
      const direction = eigenvector(e.jacobian, l);
      return { note: "one", directions: direction ? [{ at: e.at, direction, eigenvalue: l, kind: kindOf(l) }] : [] };
    }
    case "star_node":
      return { note: "every", directions: [] };
    case "stable_spiral":
    case "unstable_spiral":
    case "center_or_weak_spiral":
      return { note: "complex", directions: [] };
    default:
      return { note: "undecided", directions: [] };
  }
}

export type Separatrix = {
  saddle: Vec2;
  /** "unstable": a branch of the unstable manifold (leaves the saddle, traced forward); "stable": of the stable manifold (arrives at it, traced backward). */
  kind: "stable" | "unstable";
  points: Vec2[];
  status: IntegrationStatus;
};

/**
 * The four separatrix branches of every SADDLE among `equilibria` (other points have none).
 * `scaleBox` gives the offset its scale (the box the features were computed for, so the offset
 * is about a pixel whatever the zoom, never an absolute number); `stopBox` ends a branch (the
 * shells pass the kept curves' own far box, so a branch runs as far as a kept curve would).
 */
export function separatrices(sys: CompiledSystem, equilibria: readonly Equilibrium[], scaleBox: Box, stopBox: Box): Separatrix[] {
  const offset = SEPARATRIX_OFFSET_FRACTION * Math.hypot(scaleBox.x.max - scaleBox.x.min, scaleBox.y.max - scaleBox.y.min);
  const out: Separatrix[] = [];
  for (const e of equilibria) {
    if (e.classification !== "saddle") continue;
    for (const d of eigenDirections(e).directions) {
      for (const side of [1, -1] as const) {
        const start = { x: e.at.x + side * offset * d.direction.x, y: e.at.y + side * offset * d.direction.y };
        const tr = integrateAdaptive(sys, start, SEPARATRIX_TSPAN, { direction: d.kind === "unstable" ? 1 : -1, box: stopBox, h: 0.05 });
        // The branch is drawn from the saddle itself: the offset is below a pixel.
        out.push({ saddle: e.at, kind: d.kind, points: [e.at, ...tr.points], status: tr.status });
      }
    }
  }
  return out;
}

/** What a Scene carries of the three overlays (each present only when it was asked for). */
export type PhaseAids = {
  nullclines?: NullclineSet;
  eigenDirections?: EigenDirection[];
  separatrices?: Separatrix[];
};

/** Which overlays are shown (the link's `aids`: n, e, s). */
export type AidFlags = { nullclines: boolean; eigenDirections: boolean; separatrices: boolean };
export const NO_AIDS: AidFlags = { nullclines: false, eigenDirections: false, separatrices: false };

/**
 * The names of the two nullcline families in the student's own notation (rule 9): x' = 0 and
 * y' = 0 on a planar system; x' = 0 and x'' = 0 on a second-order equation (whose second
 * coordinate is x'); dy/dt = 0 alone on dy/dt = g(t, y); N = 0 and M = 0 on a differential form.
 */
export function nullclineNames(picture: "system" | "second" | "explicit" | "differential"): { f: string | null; g: string } {
  switch (picture) {
    case "system":
      return { f: "x' = 0", g: "y' = 0" };
    case "second":
      return { f: "x' = 0", g: "x'' = 0" };
    case "explicit":
      return { f: null, g: "dy/dt = 0" };
    case "differential":
      return { f: "N = 0", g: "M = 0" };
  }
}
