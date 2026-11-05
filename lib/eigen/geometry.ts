/**
 * Round 13 (AB): the floating-point side of the eigen features, shared by both shells.
 *
 * - `numericEigen`: what the kernel's numerical linearization at ONE equilibrium says about its
 *   eigenvectors (real directions from lib/phase-aids eigenDirections, decided by the kernel's own
 *   classification; for a complex pair the eigenvector v = re + i·im of α + iβ, β > 0, with its first
 *   component scaled to 1). Nothing is re-decided here.
 * - `rotationAids` / `rotationArc`: the picture of a complex pair, the linearized flow
 *   e^(αt)(re cos βt − im sin βt) near the point, as an OPEN arc (at most three quarters of a turn,
 *   shortened so its radius changes at most by ARC_MAX_GROWTH) unless the point is an exact center
 *   of a linear system, the only case where a closed ellipse is drawn.
 * - `snapTargets` / `snapPoint`: what the pointer snaps to (within SNAP_THRESHOLD_PX on screen):
 *   a LINEAR system's whole eigen-lines (each one is a straight-line solution); a nonlinear SADDLE's
 *   separatrices, numerical curves re-integrated to the exact point (near the saddle only, unless
 *   the separatrices are shown); a nonlinear NODE's drawn eigen-direction segment (approximate: the
 *   direction describes the solutions only near the point). Star nodes, spirals, centers and
 *   non-hyperbolic points snap to nothing.
 *
 * Pure: no React, no clock. Screen distances through lib/render/viewport (zoom-independent).
 */
import type { Equilibrium } from "../core/equilibria";
import type { Vec2 } from "../core/types";
import { EIGEN_HALF_FRACTION, eigenDirections, type EigenDirection, type EigenLine, type RotationAid, type Separatrix } from "../phase-aids";
import { worldToScreen, type Viewport } from "../render/viewport";
import type { NumericLinear } from "./linear-system";

/** The pointer snaps within this many screen pixels (a little more than the 8 px of a kept curve's removal, which is tested first). */
export const SNAP_THRESHOLD_PX = 12;
/** A drawn arc of a spiral changes its radius at most by this factor (a stronger spiral gets a shorter arc, never a distorted one). */
export const ARC_MAX_GROWTH = 4;
/** Open arcs run at most this much of a turn (radians); a closed ellipse runs 2π. */
export const ARC_OPEN_ANGLE = 1.5 * Math.PI;
/** Points per arc. */
export const ARC_SAMPLES = 96;

export type NumericEigen =
  | { readonly kind: "real"; readonly directions: readonly EigenDirection[]; readonly note: "two" | "one" }
  /** v = re + i·im is an eigenvector of α + iβ (β > 0), first component 1. */
  | { readonly kind: "complex"; readonly alpha: number; readonly beta: number; readonly re: Vec2; readonly im: Vec2; readonly ccw: boolean }
  | { readonly kind: "every" }
  | { readonly kind: "undecided" };

/** The kernel's linearization at one equilibrium, as eigenvectors (see the file header). */
export function numericEigen(e: Equilibrium): NumericEigen {
  const report = eigenDirections(e);
  if (report.note === "two" || report.note === "one") return { kind: "real", directions: report.directions, note: report.note };
  if (report.note === "every") return { kind: "every" };
  if (report.note === "undecided") return { kind: "undecided" };
  // A complex pair (spiral or center-or-weak-spiral): b c < 0, so b ≠ 0 and v = (2b, (d − a) + i√(−disc)) for α + iβ.
  const [[a, b], [c, d]] = e.jacobian;
  const disc = (a - d) * (a - d) + 4 * b * c;
  if (!(disc < 0) || b === 0 || !Number.isFinite(disc)) return { kind: "undecided" };
  const root = Math.sqrt(-disc);
  return { kind: "complex", alpha: (a + d) / 2, beta: root / 2, re: { x: 1, y: (d - a) / (2 * b) }, im: { x: 0, y: root / (2 * b) }, ccw: c > 0 };
}

/**
 * The rotation pictures of the eigen-direction overlay: the exact one of a linear system (its single
 * equilibrium), else one per equilibrium whose numerical linearization has a complex pair.
 */
export function rotationAids(linear: NumericLinear | null, equilibria: readonly Equilibrium[] | undefined): RotationAid[] {
  if (linear) {
    return linear.at && linear.complex ? [{ at: linear.at, re: linear.complex.re, im: linear.complex.im, alpha: linear.complex.alpha, beta: linear.complex.beta, closed: linear.complex.closed, exact: true }] : [];
  }
  const out: RotationAid[] = [];
  for (const e of equilibria ?? []) {
    const n = numericEigen(e);
    if (n.kind === "complex") out.push({ at: e.at, re: n.re, im: n.im, alpha: n.alpha, beta: n.beta, closed: false, exact: false });
  }
  return out;
}

/** The whole straight-line solutions of a linear system (nothing for a nonlinear one). */
export function eigenLines(linear: NumericLinear | null): EigenLine[] {
  return linear?.at ? linear.lines.map((l) => ({ through: linear.at!, direction: l.direction, eigenvalue: l.eigenvalue })) : [];
}

/** The eigen-direction segments drawn at the equilibria: the exact ones of a linear system, else the kernel's. */
export function eigenSegments(linear: NumericLinear | null, equilibria: readonly Equilibrium[] | undefined): EigenDirection[] {
  if (linear) {
    return linear.at ? linear.lines.map((l) => ({ at: linear.at!, direction: l.direction, eigenvalue: l.eigenvalue, kind: l.eigenvalue < 0 ? "stable" : "unstable" })) : [];
  }
  return (equilibria ?? []).flatMap((e) => eigenDirections(e).directions);
}

/**
 * The arc of a rotation aid in WORLD coordinates, sized so its largest screen radius is `radiusPx`:
 * at + k e^(αs/β)(re cos s − im sin s) for s from 0 to S (S = 2π for a closed ellipse, else at most
 * ARC_OPEN_ANGLE and at most the angle over which e^(|α| s/β) reaches ARC_MAX_GROWTH). s grows with
 * time (s = βt), so the last point is where the flow goes. Also the tips at + k·re and at + k·im.
 */
export function rotationArc(aid: RotationAid, v: Viewport, radiusPx: number): { points: Vec2[]; reTip: Vec2; imTip: Vec2 } | null {
  const rate = aid.beta > 0 ? aid.alpha / aid.beta : 0;
  if (!Number.isFinite(rate) || !(aid.beta > 0)) return null;
  const span = aid.closed ? 2 * Math.PI : Math.min(ARC_OPEN_ANGLE, rate !== 0 ? Math.log(ARC_MAX_GROWTH) / Math.abs(rate) : Infinity);
  const origin = worldToScreen(v, { x: 0, y: 0 });
  const screenLength = (w: Vec2) => {
    const s = worldToScreen(v, w);
    return Math.hypot(s.x - origin.x, s.y - origin.y);
  };
  const raw: Vec2[] = [];
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    const s = (span * i) / ARC_SAMPLES;
    const g = Math.exp(rate * s);
    raw.push({ x: g * (aid.re.x * Math.cos(s) - aid.im.x * Math.sin(s)), y: g * (aid.re.y * Math.cos(s) - aid.im.y * Math.sin(s)) });
  }
  const largest = Math.max(...raw.map(screenLength), screenLength(aid.re), screenLength(aid.im));
  if (!(largest > 0) || !Number.isFinite(largest)) return null;
  const k = radiusPx / largest;
  const place = (w: Vec2): Vec2 => ({ x: aid.at.x + k * w.x, y: aid.at.y + k * w.y });
  return { points: raw.map(place), reTip: place(aid.re), imTip: place(aid.im) };
}

// ---------------------------------------------------------------------------------------------
// Snapping.

export type SnapTarget =
  /** A linear system's eigen-line: the whole line is a solution. */
  | { readonly kind: "line"; readonly through: Vec2; readonly direction: Vec2; readonly eigenvalue: number }
  /** A nonlinear node's eigen-direction: the drawn segment only, an approximation near the point. */
  | { readonly kind: "segment"; readonly at: Vec2; readonly direction: Vec2; readonly eigenvalue: number }
  /** A nonlinear saddle's separatrix branch; `nearSaddleOnly` while the separatrices are not drawn (then only the part inside the drawn eigen segment). */
  | { readonly kind: "branch"; readonly branch: Separatrix; readonly nearSaddleOnly: boolean };

export type Snap = {
  readonly point: Vec2;
  readonly target: SnapTarget;
  readonly distancePx: number;
};

/** What the pointer may snap to (see the file header). `linear` is the exact analysis's geometry when the system is linear, else null. */
export function snapTargets(linear: NumericLinear | null, equilibria: readonly Equilibrium[] | undefined, separatrices: readonly Separatrix[] | undefined, separatricesShown: boolean): SnapTarget[] {
  if (linear) return eigenLines(linear).map((l) => ({ kind: "line" as const, ...l }));
  const out: SnapTarget[] = [];
  for (const e of equilibria ?? []) {
    if (e.classification === "saddle") {
      for (const branch of separatrices ?? []) {
        if (branch.saddle.x === e.at.x && branch.saddle.y === e.at.y) out.push({ kind: "branch", branch, nearSaddleOnly: !separatricesShown });
      }
    } else if (e.classification === "stable_node" || e.classification === "unstable_node" || e.classification === "degenerate_node") {
      for (const d of eigenDirections(e).directions) out.push({ kind: "segment", at: d.at, direction: d.direction, eigenvalue: d.eigenvalue });
    }
  }
  return out;
}

/** The nearest point of the line through `c` along `u` to the screen point, as the world parameter s (c + s·u) and the screen distance. */
function projectLine(v: Viewport, c: Vec2, u: Vec2, screen: Vec2): { s: number; distance: number; pixelsPerUnit: number } | null {
  const a = worldToScreen(v, c);
  const b = worldToScreen(v, { x: c.x + u.x, y: c.y + u.y });
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (!(len2 > 0) || !Number.isFinite(len2)) return null;
  const s = ((screen.x - a.x) * dx + (screen.y - a.y) * dy) / len2;
  return { s, distance: Math.hypot(a.x + s * dx - screen.x, a.y + s * dy - screen.y), pixelsPerUnit: Math.sqrt(len2) };
}

/**
 * Where the pointer at `screen` snaps, or null (nothing within `thresholdPx`). A branch target is
 * located on its own integration: `locate(branch, t)` re-integrates the branch from its start to
 * the clock t of the nearest point of its polyline (null keeps the polyline's own point).
 */
export function snapPoint(
  targets: readonly SnapTarget[],
  screen: Vec2,
  v: Viewport,
  locate?: (branch: Separatrix, t: number) => Vec2 | null,
  thresholdPx = SNAP_THRESHOLD_PX,
): Snap | null {
  const halfPx = EIGEN_HALF_FRACTION * Math.min(v.width, v.height);
  type Candidate = { point: Vec2; target: SnapTarget; distancePx: number; time?: number };
  const state: { best: Candidate | null } = { best: null };
  const consider = (point: Vec2, target: SnapTarget, distancePx: number, time?: number) => {
    if (distancePx <= thresholdPx && (state.best === null || distancePx < state.best.distancePx)) state.best = { point, target, distancePx, time };
  };
  for (const target of targets) {
    if (target.kind === "line" || target.kind === "segment") {
      const c = target.kind === "line" ? target.through : target.at;
      const p = projectLine(v, c, target.direction, screen);
      if (!p) continue;
      let s = p.s;
      let distance = p.distance;
      if (target.kind === "segment") {
        // Only the drawn segment: |s| in pixels at most the drawn half-length.
        const limit = halfPx / p.pixelsPerUnit;
        if (Math.abs(s) > limit) {
          s = Math.sign(s) * limit;
          const tip = worldToScreen(v, { x: c.x + s * target.direction.x, y: c.y + s * target.direction.y });
          distance = Math.hypot(tip.x - screen.x, tip.y - screen.y);
        }
      }
      consider({ x: c.x + s * target.direction.x, y: c.y + s * target.direction.y }, target, distance);
      continue;
    }
    // A separatrix branch: its polyline after the saddle, points[i + 1] at times[i].
    const { branch } = target;
    const saddle = worldToScreen(v, branch.saddle);
    for (let i = 1; i + 1 < branch.points.length; i++) {
      const a = worldToScreen(v, branch.points[i]);
      const b = worldToScreen(v, branch.points[i + 1]);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const u = len2 > 0 ? Math.max(0, Math.min(1, ((screen.x - a.x) * dx + (screen.y - a.y) * dy) / len2)) : 0;
      const foot = { x: a.x + u * dx, y: a.y + u * dy };
      if (target.nearSaddleOnly && Math.hypot(foot.x - saddle.x, foot.y - saddle.y) > halfPx) continue;
      const distance = Math.hypot(foot.x - screen.x, foot.y - screen.y);
      if (distance > thresholdPx || (state.best !== null && distance >= state.best.distancePx)) continue;
      const pa = branch.points[i];
      const pb = branch.points[i + 1];
      const time = branch.times[i - 1] + u * (branch.times[i] - branch.times[i - 1]);
      consider({ x: pa.x + u * (pb.x - pa.x), y: pa.y + u * (pb.y - pa.y) }, target, distance, time);
    }
  }
  const found = state.best;
  if (!found) return null;
  if (found.target.kind === "branch" && found.time !== undefined && locate) {
    const exact = locate(found.target.branch, found.time);
    if (exact && Number.isFinite(exact.x) && Number.isFinite(exact.y)) return { point: exact, target: found.target, distancePx: found.distancePx };
  }
  return { point: found.point, target: found.target, distancePx: found.distancePx };
}

/** The stability a snap target belongs to (solutions on it approach or leave the equilibrium). */
export function snapStability(target: SnapTarget): "stable" | "unstable" {
  if (target.kind === "branch") return target.branch.kind;
  return target.eigenvalue < 0 ? "stable" : "unstable";
}

/** The equilibrium a snap target belongs to. */
export function snapEquilibrium(target: SnapTarget): Vec2 {
  return target.kind === "line" ? target.through : target.kind === "segment" ? target.at : target.branch.saddle;
}
