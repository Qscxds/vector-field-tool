/**
 * Shared, React-free helpers for the two interactive shells (web page and MCP widget): what to
 * recompute when the visible box changes, and how to trace the curve through a point. Pure calls
 * into lib/core; no drawing, no state.
 */
import { detectForms, NO_FORM_NOTE } from "./core/detect-form";
import { findEquilibria } from "./core/equilibria";
import { exactPotential, potentialLevels } from "./core/exact";
import { integrateAdaptive } from "./core/integrate";
import type { CompiledSystem } from "./core/parse";
import { firstOrderEquilibria, firstOrderSingularities, type FirstOrderSpec } from "./core/slope-field";
import type { Box, Locale, Vec2 } from "./core/types";
import { contourSegments } from "./render/contours";
import type { FirstOrderView, Scene, TrajectoryView } from "./scene";

export type Features = Pick<Scene, "equilibria" | "warning" | "firstOrder">;

/** Fixed trajectories: how long to integrate in each direction. */
export const CLICK_TSPAN = 50;
/** Hover preview: integration steps per direction (S spike: ~2000 RK4 steps ≈ 13 ms in the sandbox). */
export const HOVER_STEP_BUDGET = 400;
/** Hover preview: the pointer has to move this many pixels before a new preview is computed. */
export const HOVER_PIXEL_THRESHOLD = 3;
/** Pixels around a singular point (M = N = 0) where no preview is attempted. */
export const SINGULAR_PIXEL_RADIUS = 8;
/** Recompute equilibria for the visible box this long after the last zoom/pan (ms). */
export const FEATURE_DEBOUNCE_MS = 250;

/**
 * Equilibria (systems) or constant solutions / singular points / forms / implicit curves (first
 * order) inside `box`. Never throws: a failure inside the kernel yields no features rather than a
 * broken page.
 */
export function computeFeatures(sys: CompiledSystem, firstOrder: FirstOrderSpec | null, box: Box, locale: Locale): Features {
  try {
    if (!firstOrder) {
      const eq = findEquilibria(sys, box);
      return { equilibria: eq.points, warning: eq.warning };
    }
    const spec = firstOrder;
    const eq = firstOrderEquilibria(spec, box.y, { xRange: box.x });
    const singular = firstOrderSingularities(spec, box);
    const forms = detectForms(spec, box, locale);
    let implicit: FirstOrderView["implicit"];
    if (forms.some((f) => f.form === "exact")) {
      const pot = exactPotential(spec, box);
      if (pot.consistent) {
        const levels = potentialLevels(pot.F, box, 8).map((level) => ({ level, segments: contourSegments(pot.F, box, level, 60, 60) }));
        implicit = { levels, pathDeviation: pot.pathDeviation };
      }
    }
    return {
      firstOrder: {
        expr: spec.kind === "explicit" ? `dy/dx = ${spec.g}` : `(${spec.M}) dx + (${spec.N}) dy = 0`,
        spec,
        autonomous: eq.autonomous,
        solutions: eq.solutions,
        singularities: singular.points,
        forms,
        formsNote: forms.length === 0 ? NO_FORM_NOTE[locale] : undefined,
        implicit,
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

/**
 * The solution through `start`, forward and backward, stopping when it leaves a box three times
 * the visible one (so zooming out later still shows the curve). `maxSteps` bounds the hover
 * preview; fixed trajectories use the integrator's default.
 */
export function traceBoth(sys: CompiledSystem, start: Vec2, visibleBox: Box, maxSteps?: number): TrajectoryView[] {
  return ([1, -1] as const).map((direction): TrajectoryView => {
    const tr = integrateAdaptive(sys, start, CLICK_TSPAN, {
      direction,
      box: expandBox(visibleBox, 1),
      h: 0.05,
      ...(maxSteps ? { maxSteps } : {}),
    });
    return {
      direction: direction === 1 ? "forward" : "backward",
      points: tr.points,
      status: tr.status,
      steps: tr.steps,
      tEnd: tr.times[tr.times.length - 1],
    };
  });
}
