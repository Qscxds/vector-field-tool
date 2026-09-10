/**
 * Shared, React-free helpers for the two interactive shells (web page and MCP widget): what to
 * recompute when the visible box changes, and how to trace the curve through a point. Pure calls
 * into lib/core; no drawing, no state.
 *
 * Two decisions from 2026-09-03 (H2.2 / H2.3) live here:
 * - A hover PREVIEW is limited by its on-screen length (a fixed number of canvas diagonals), not
 *   by a step count, so a fast field and a slow field give previews of the same visual length and
 *   zooming does not change it. Steps are only a safety cap.
 * - A FIXED trajectory (click) extends according to the solution, not the view: it stops when it
 *   leaves a box 20 times the original problem domain, so zooming out never exposes a curve that
 *   was cut where the old view ended. The view only clips what is drawn.
 * And one from the J review (2026-09-08): the "passes through a point where uniqueness fails" flag
 * is decided from the curve's own extent (markNonUnique with a probe), never from the entered box
 * alone, since a curve runs far beyond the box.
 */
import { detectForms, NO_FORM_NOTE, reportedForms } from "./core/detect-form";
import { findEquilibria, type Equilibrium } from "./core/equilibria";
import { exactPotential, potentialLevelsFromValues } from "./core/exact";
import { integrateAdaptive } from "./core/integrate";
import type { CompiledSystem } from "./core/parse";
import { firstOrderEquilibria, firstOrderSingularities, type FirstOrderSpec } from "./core/slope-field";
import { detectTimeDependence, type TimeDependence } from "./core/time-dependence";
import type { Box, Locale, Vec2 } from "./core/types";
import { equilibriaUniqueness } from "./core/uniqueness";
import { contourSegmentsFromGrid, sampleGrid } from "./render/contours";
import { worldToScreen, type Viewport } from "./render/viewport";
import type { FirstOrderView, Scene, TrajectoryView } from "./scene";

export type Features = Pick<Scene, "equilibria" | "warning" | "truncated" | "singularPoints" | "underflowPlateau" | "firstOrder" | "timeDependent" | "refineCapped">;

export type FeatureOptions = {
  /** Snapshot time of a non-autonomous system; recorded in `timeDependent`. Default 0. */
  snapshotT?: number;
  /**
   * A verdict already measured (the shells measure it once, on the entered box, so that zooming or
   * panning can never flip it). When absent the verdict is measured on `box`.
   */
  timeDependence?: TimeDependence;
};

/** Path-independence tolerance of the numerical potential (exactPotential's default). */
export const EXACT_PATH_TOL = 1e-6;

/** Fixed trajectories: how long to integrate in each direction. */
export const CLICK_TSPAN = 50;
/**
 * Hover previews are limited by on-screen length, not time: a slow field (x' = 0.1 y, y' = -0.1 x
 * has the same orbits as the unit oscillator) must not get a shorter preview because 50 time units
 * ran out. The arc-length limit, the step cap and the position bound end the preview.
 */
export const PREVIEW_TSPAN = 1e4;
/** Fixed trajectories stop when leaving the home box grown by this factor per side: 20x overall. */
export const FIXED_STOP_FACTOR = 9.5;
/** Hover preview: on-screen length per direction, in canvas diagonals. */
export const HOVER_DIAGONALS = 2;
/** Hover preview: safety cap on integration steps per direction (a very slow field could otherwise run for ever). */
export const HOVER_STEP_CAP = 4000;
/** Hover preview: the pointer has to move this many pixels before a new preview is computed. */
export const HOVER_PIXEL_THRESHOLD = 3;
/** Pixels around a singular point (M = N = 0) where no preview is attempted. */
export const SINGULAR_PIXEL_RADIUS = 8;
/** Recompute equilibria for the visible box this long after the last zoom/pan (ms). */
export const FEATURE_DEBOUNCE_MS = 250;
/**
 * A trajectory point this close to a non-unique constant solution or equilibrium, relative to the
 * longer side of the box, is "on" it. The integrator ends a curve that reaches a domain edge or an
 * equilibrium far closer than this (sqrt(y) from (0, 0.25) backward ends at y ≈ 5e-21).
 */
export const NON_UNIQUE_REL_TOL = 1e-9;

/**
 * The box the features (equilibria, constant solutions, singular points, forms, level curves) are
 * computed for. At the HOME view (not zoomed or panned) it is the entered range itself, in both
 * equal-scale modes: the equal-scale margin only carries field arrows, so flipping the toggle, or
 * viewing the same link on a canvas of another aspect ratio (phone vs desktop), never changes
 * which features are listed. After a zoom or pan it is the visible box.
 */
export function featuresBoxFor(homeBox: Box, visibleBox: Box, atHome: boolean): Box {
  return atHome ? homeBox : visibleBox;
}

/**
 * Equilibria (systems) or constant solutions / singular points / forms / implicit curves (first
 * order) inside `box`. A non-autonomous system (t appears in f or g, the static rule of
 * lib/core/time-dependence) gets `timeDependent` INSTEAD of equilibria: equilibria and linearized
 * stability are tools for autonomous systems, and listing the equilibria of the t = snapshot slice
 * would be exactly the silent error this tool exists to avoid. First-order specs are never time-dependent (their
 * t is the horizontal coordinate). Never throws: a failure inside the kernel yields no features
 * rather than a broken page.
 */
export function computeFeatures(sys: CompiledSystem, firstOrder: FirstOrderSpec | null, box: Box, locale: Locale, opts: FeatureOptions = {}): Features {
  try {
    if (!firstOrder) {
      // The verdict is static (t appears in f or g); the probe only measures the change, and it
      // includes the snapshot time so a domain that moves with t is seen at the time on display.
      const td = opts.timeDependence ?? detectTimeDependence(sys, box, { snapshotT: opts.snapshotT ?? 0 });
      if (td.dependsOnT) return { timeDependent: { snapshotT: opts.snapshotT ?? 0, maxRelDeviation: td.maxRelDeviation } };
      const eq = findEquilibria(sys, box);
      return {
        equilibria: withUniqueness(sys, eq.points, box),
        warning: eq.warning,
        truncated: eq.truncated,
        singularPoints: eq.singularPoints,
        underflowPlateau: eq.underflowPlateau,
        ...(eq.seeding.refineCapped ? { refineCapped: true } : {}),
      };
    }
    const spec = firstOrder;
    const eq = firstOrderEquilibria(spec, box.y, { tRange: box.x });
    const singular = firstOrderSingularities(spec, box);
    const forms = detectForms(spec, box, locale);
    const reported = reportedForms(forms);
    let implicit: FirstOrderView["implicit"];
    let implicitCheck: FirstOrderView["implicitCheck"];
    if (reported.some((f) => f.form === "exact" && f.verdict === "consistent")) {
      const pot = exactPotential(spec, box);
      implicitCheck = { pathDeviation: pot.pathDeviation, tol: EXACT_PATH_TOL, passed: pot.consistent };
      if (pot.consistent) {
        const grid = sampleGrid(pot.F, box, 60, 60);
        const levels = potentialLevelsFromValues(grid.values, 8).map((level) => ({ level, segments: contourSegmentsFromGrid(grid, level) }));
        implicit = { levels, pathDeviation: pot.pathDeviation };
      }
    }
    return {
      firstOrder: {
        expr: spec.kind === "explicit" ? `dy/dt = ${spec.g}` : `(${spec.M}) dt + (${spec.N}) dy = 0`,
        spec,
        autonomous: eq.autonomous,
        identicallyZero: eq.identicallyZero,
        solutions: eq.solutions,
        singularities: singular.points,
        singularitiesTruncated: singular.truncated,
        singularitiesWarning: singular.warning,
        forms,
        formsNote: reported.length === 0 ? NO_FORM_NOTE[locale] : undefined,
        implicit,
        implicitCheck,
      },
    };
  } catch {
    return {};
  }
}

/** The equilibria with their uniqueness probes attached (see uniqueness.ts). */
export function withUniqueness(sys: CompiledSystem, points: Equilibrium[], box: Box, checkpoint?: () => void): Equilibrium[] {
  // Each point carries the radius it was located to: the probe's offsets start above it.
  const u = equilibriaUniqueness(sys, points.map((p) => ({ ...p.at, resolution: p.resolution })), box, { checkpoint });
  return points.map((p, i) => ({ ...p, uniqueness: u[i] }));
}

/** Distance from q to the segment ab. */
function segmentDistance(a: Vec2, b: Vec2, q: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y);
}

/** Smallest |y - c| along the segment ab: zero when the segment crosses or touches the line y = c. */
function segmentLineGap(a: Vec2, b: Vec2, c: number): number {
  return (a.y - c) * (b.y - c) <= 0 ? 0 : Math.min(Math.abs(a.y - c), Math.abs(b.y - c));
}

/** Constant solutions (y values) and equilibria (points) whose uniqueness verdict is "unbounded". */
type NonUniqueSet = { lines: number[]; points: Vec2[] };

function nonUniqueOf(features: Pick<Scene, "equilibria" | "firstOrder">): NonUniqueSet {
  return {
    lines: (features.firstOrder?.solutions ?? []).filter((s) => s.uniqueness?.verdict === "unbounded").map((s) => s.y),
    points: (features.equilibria ?? []).filter((e) => e.uniqueness?.verdict === "unbounded").map((e) => e.at),
  };
}

/** The start point, any point or any segment of the curve comes within tol of a line or a point of the set. */
function touchesSet(t: TrajectoryView, set: NonUniqueSet, tol: number): boolean {
  const pts = t.points;
  if (pts.length === 0 || (set.lines.length === 0 && set.points.length === 0)) return false;
  if (set.lines.some((c) => Math.abs(pts[0].y - c) <= tol) || set.points.some((q) => Math.hypot(pts[0].x - q.x, pts[0].y - q.y) <= tol)) return true;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (set.lines.some((c) => segmentLineGap(a, b, c) <= tol) || set.points.some((q) => segmentDistance(a, b, q) <= tol)) return true;
  }
  return false;
}

/**
 * What markNonUnique needs to probe a curve itself: the compiled system and, for a first-order
 * scene, its equation. `timeDependent` (a non-autonomous planar system) disables the probe:
 * equilibria and their uniqueness are not defined for such a system.
 */
export type NonUniqueProbe = { sys: CompiledSystem; firstOrder: FirstOrderSpec | null; timeDependent?: boolean };

/** Seeds per axis of the equilibrium search around a speed minimum of a planar curve (a small square box). */
export const CURVE_SEED_GRID = 4;
/** Padding of a curve's own extent, as a fraction of that extent, when its features are computed. */
export const CURVE_EXTENT_PAD = 1e-3;

/**
 * The constant solutions / equilibria with unbounded quotients that the curve itself can reach,
 * so that the flag follows the curve and not the entered box: a clicked curve runs to 20 times the
 * home box, and y = 0 of dy/dt = sqrt(y) is reached from a box y in [1, 4] all the same.
 * - First order: the constant solutions of the curve's OWN y extent (padded by CURVE_EXTENT_PAD of
 *   itself and at least by the on-line tolerance), with the t probes over the curve's own t extent
 *   (the box's when that is degenerate: a vertical curve of a differential form).
 * - Planar: an equilibrium the curve passes through is a local minimum of the speed |F| along the
 *   curve, so each such point (its ends included) is searched in a square box spanning the steps
 *   around it; a bounding box of the whole curve would be degenerate for a curve on an axis.
 * The uniqueness scale is the box's, as for the listed features. Never throws: a failure inside
 * the kernel means nothing is flagged by this path.
 */
function curveNonUnique(probe: NonUniqueProbe, t: TrajectoryView, box: Box, tol: number): NonUniqueSet {
  const none: NonUniqueSet = { lines: [], points: [] };
  const pts = t.points;
  if (pts.length === 0 || probe.timeDependent || !pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return none;
  try {
    if (probe.firstOrder) {
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      for (const p of pts) {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
      }
      const padY = Math.max(CURVE_EXTENT_PAD * (yMax - yMin), tol);
      const padX = Math.max(CURVE_EXTENT_PAD * (xMax - xMin), tol);
      const tRange = xMax - xMin > NON_UNIQUE_REL_TOL * (box.x.max - box.x.min) ? { min: xMin - padX, max: xMax + padX } : box.x;
      const eq = firstOrderEquilibria(probe.firstOrder, { min: yMin - padY, max: yMax + padY }, { tRange });
      return nonUniqueOf({ firstOrder: { expr: "", autonomous: eq.autonomous, solutions: eq.solutions } });
    }
    const speed = pts.map((p) => {
      const f = probe.sys.eval(p);
      return Number.isFinite(f.x) && Number.isFinite(f.y) ? Math.hypot(f.x, f.y) : Infinity;
    });
    const step = (i: number, j: number) => Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
    const found: Equilibrium[] = [];
    for (let i = 0; i < pts.length; i++) {
      if (!Number.isFinite(speed[i])) continue;
      if ((i > 0 && speed[i - 1] < speed[i]) || (i + 1 < pts.length && speed[i + 1] < speed[i])) continue;
      const half = Math.max(i > 0 ? step(i, i - 1) : 0, i + 1 < pts.length ? step(i, i + 1) : 0, tol);
      const around: Box = { x: { min: pts[i].x - half, max: pts[i].x + half }, y: { min: pts[i].y - half, max: pts[i].y + half } };
      for (const e of findEquilibria(probe.sys, around, { seedGrid: CURVE_SEED_GRID, maxPoints: 4 }).points) {
        if (!found.some((q) => Math.hypot(q.at.x - e.at.x, q.at.y - e.at.y) <= tol)) found.push(e);
      }
    }
    return nonUniqueOf({ equilibria: withUniqueness(probe.sys, found, box) });
  } catch {
    return none;
  }
}

/**
 * Flags the trajectories that pass through a point where uniqueness fails: the start point, any
 * point of the curve, or any segment between consecutive points comes within NON_UNIQUE_REL_TOL of
 * the box scale of a constant solution y = c, or of a system equilibrium, whose uniqueness verdict
 * is "unbounded". Segments count because an adaptive step can cross such a point without landing
 * on it (x' = sqrt|x| through the origin).
 *
 * The listed features are the fast path. With `probe` given, a curve they do not flag is checked
 * against the features of its OWN extent (curveNonUnique), so the flag depends on the curve, never
 * on the entered box. Pure: returns the same array when nothing is flagged, new TrajectoryView
 * objects otherwise.
 */
export function markNonUnique(trajectories: TrajectoryView[], features: Pick<Scene, "equilibria" | "firstOrder">, box: Box, probe?: NonUniqueProbe): TrajectoryView[] {
  const tol = NON_UNIQUE_REL_TOL * Math.max(box.x.max - box.x.min, box.y.max - box.y.min);
  const listed = nonUniqueOf(features);
  if (!probe && listed.lines.length === 0 && listed.points.length === 0) return trajectories;
  let changed = false;
  const out = trajectories.map((t) => {
    if (touchesSet(t, listed, tol) || (probe && touchesSet(t, curveNonUnique(probe, t, box, tol), tol))) {
      changed = true;
      return { ...t, nonUnique: true };
    }
    return t;
  });
  return changed ? out : trajectories;
}

/** Grows a box by `factor` of its own size on every side (factor 1 → three times as wide and tall). */
export function expandBox(box: Box, factor: number): Box {
  const w = box.x.max - box.x.min;
  const h = box.y.max - box.y.min;
  return {
    x: { min: box.x.min - w * factor, max: box.x.max + w * factor },
    y: { min: box.y.min - h * factor, max: box.y.max + h * factor },
  };
}

/** Where a fixed (clicked) trajectory stops: 20 times the original problem domain. */
export function fixedStopBox(homeBox: Box): Box {
  return expandBox(homeBox, FIXED_STOP_FACTOR);
}

/**
 * Where a hover preview stops. It must lie further from every visible point than the preview's
 * on-screen length (HOVER_DIAGONALS diagonals) in EVERY direction, including from a point at the
 * edge of a non-square canvas: growing by 4 per side puts the box 4 short sides away, and
 * 2 diagonals ≤ 2 x sqrt(short² + long²) < 4 x short whenever long < sqrt(3) x short (true for
 * the shells' 720x520 and ~640x435 canvases).
 */
export function hoverStopBox(visibleBox: Box): Box {
  return expandBox(visibleBox, 4);
}

/** Screen-pixel distance between two world points under a viewport (affine, so segments cut exactly). */
export function screenMetric(v: Viewport): (a: Vec2, b: Vec2) => number {
  return (a, b) => {
    const sa = worldToScreen(v, a);
    const sb = worldToScreen(v, b);
    return Math.hypot(sa.x - sb.x, sa.y - sb.y);
  };
}

export type TraceOptions = {
  /** The trajectory ends when it leaves this box. */
  stopBox: Box;
  /** Time span per direction; default CLICK_TSPAN. */
  tSpan?: number;
  /** Tag for the stop box so labels can say which box was left. Default "view". */
  stop?: "view" | "far";
  /** Safety cap on steps per direction; default the integrator's own (20000). */
  maxSteps?: number;
  /** Stop after this on-screen length (pixels) per direction, measured with `viewport`. */
  screenLength?: { viewport: Viewport; maxPixels: number };
  /**
   * Start time. Default 0. For a non-autonomous system the shells pass the displayed snapshot
   * time, so the curve shown is the solution through the clicked point AT the time in the picture.
   */
  t0?: number;
};

/** The solution through `start`, forward and backward, under the given stop rules. */
export function traceBoth(sys: CompiledSystem, start: Vec2, opts: TraceOptions): TrajectoryView[] {
  return ([1, -1] as const).map((direction): TrajectoryView => {
    const tr = integrateAdaptive(sys, start, opts.tSpan ?? CLICK_TSPAN, {
      direction,
      box: opts.stopBox,
      h: 0.05,
      t0: opts.t0 ?? 0,
      ...(opts.maxSteps ? { maxSteps: opts.maxSteps } : {}),
      ...(opts.screenLength ? { arcLength: { limit: opts.screenLength.maxPixels, metric: screenMetric(opts.screenLength.viewport) } } : {}),
    });
    return {
      direction: direction === 1 ? "forward" : "backward",
      points: tr.points,
      status: tr.status,
      steps: tr.steps,
      tEnd: tr.times[tr.times.length - 1],
      stop: opts.stop ?? "view",
    };
  });
}

/** Hover preview through `world`: fixed on-screen length, whatever the field's speed or the zoom. Starts at `t0` (the snapshot time). */
export function tracePreview(sys: CompiledSystem, world: Vec2, viewport: Viewport, t0 = 0): TrajectoryView[] {
  return traceBoth(sys, world, {
    stopBox: hoverStopBox(viewport.box),
    tSpan: PREVIEW_TSPAN,
    maxSteps: HOVER_STEP_CAP,
    screenLength: { viewport, maxPixels: HOVER_DIAGONALS * Math.hypot(viewport.width, viewport.height) },
    t0,
  });
}

/** Fixed trajectory through `world`: extends by the solution's own rule, clipped only by drawing. Starts at `t0` (the snapshot time). */
export function traceFixed(sys: CompiledSystem, world: Vec2, homeBox: Box, t0 = 0): TrajectoryView[] {
  return traceBoth(sys, world, { stopBox: fixedStopBox(homeBox), stop: "far", t0 });
}
