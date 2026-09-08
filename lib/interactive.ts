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
 */
import { detectForms, NO_FORM_NOTE, reportedForms } from "./core/detect-form";
import { findEquilibria } from "./core/equilibria";
import { exactPotential, potentialLevelsFromValues } from "./core/exact";
import { integrateAdaptive } from "./core/integrate";
import type { CompiledSystem } from "./core/parse";
import { firstOrderEquilibria, firstOrderSingularities, type FirstOrderSpec } from "./core/slope-field";
import type { Box, Locale, Vec2 } from "./core/types";
import { contourSegmentsFromGrid, sampleGrid } from "./render/contours";
import { worldToScreen, type Viewport } from "./render/viewport";
import type { FirstOrderView, Scene, TrajectoryView } from "./scene";

export type Features = Pick<Scene, "equilibria" | "warning" | "truncated" | "firstOrder">;

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
 * order) inside `box`. Never throws: a failure inside the kernel yields no features rather than a
 * broken page.
 */
export function computeFeatures(sys: CompiledSystem, firstOrder: FirstOrderSpec | null, box: Box, locale: Locale): Features {
  try {
    if (!firstOrder) {
      const eq = findEquilibria(sys, box);
      return { equilibria: eq.points, warning: eq.warning, truncated: eq.truncated };
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
        solutions: eq.solutions,
        singularities: singular.points,
        singularitiesTruncated: singular.truncated,
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
};

/** The solution through `start`, forward and backward, under the given stop rules. */
export function traceBoth(sys: CompiledSystem, start: Vec2, opts: TraceOptions): TrajectoryView[] {
  return ([1, -1] as const).map((direction): TrajectoryView => {
    const tr = integrateAdaptive(sys, start, opts.tSpan ?? CLICK_TSPAN, {
      direction,
      box: opts.stopBox,
      h: 0.05,
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

/** Hover preview through `world`: fixed on-screen length, whatever the field's speed or the zoom. */
export function tracePreview(sys: CompiledSystem, world: Vec2, viewport: Viewport): TrajectoryView[] {
  return traceBoth(sys, world, {
    stopBox: hoverStopBox(viewport.box),
    tSpan: PREVIEW_TSPAN,
    maxSteps: HOVER_STEP_CAP,
    screenLength: { viewport, maxPixels: HOVER_DIAGONALS * Math.hypot(viewport.width, viewport.height) },
  });
}

/** Fixed trajectory through `world`: extends by the solution's own rule, clipped only by drawing. */
export function traceFixed(sys: CompiledSystem, world: Vec2, homeBox: Box): TrajectoryView[] {
  return traceBoth(sys, world, { stopBox: fixedStopBox(homeBox), stop: "far" });
}
