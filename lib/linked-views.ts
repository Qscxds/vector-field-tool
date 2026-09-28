/**
 * Round Z2.4: what links the two pictures of a planar picture (the phase plane and the solution
 * graph, shown together in the "both" view) is ONE piece of state: the index of the kept curve
 * under the pointer, whichever picture the pointer is in. Kept curve i is the pair
 * `trajectories[2i], trajectories[2i + 1]` of the phase plane and `curves[i]` of the solution
 * graph (lib/labels-trajectory groupTrajectories pairs them in that order), drawn in the same color
 * (lib/render/color curveColor(i)) in both pictures.
 *
 * The phase plane's pointer goes through useInteractiveScene (nearestFixedTrajectory: a click
 * there keeps or removes a curve). The solution graph's pointer goes through THIS module, a pure
 * pointer machine whose only action is a hover: a click on the solution graph can fix no initial
 * value (a point (t, x) lacks the x' of a second-order equation and the y of a planar system), so
 * it adds nothing and removes nothing, and the machine has no such action to emit (tested).
 */
import type { Vec2 } from "./core/types";
import type { Viewport } from "./render/viewport";
import type { SeriesCurve } from "./time-series";
import { HIT_THRESHOLD_PX, polylineScreenDistance } from "./trajectory-hit";

/**
 * The index of the kept curve whose polyline (any of its series) passes within `thresholdPx` of the
 * pointer, in SCREEN pixels under the solution graph's viewport (the same threshold as a click on
 * the phase plane, lib/trajectory-hit); the nearest when several qualify; null when none.
 */
export function nearestSeriesCurve(curves: ReadonlyArray<ReadonlyArray<SeriesCurve>>, screen: Vec2, viewport: Viewport, thresholdPx = HIT_THRESHOLD_PX): number | null {
  let best: number | null = null;
  let bestDistance = thresholdPx;
  curves.forEach((series, index) => {
    for (const s of series) {
      const d = polylineScreenDistance(s.points, screen, viewport);
      if (d <= bestDistance) {
        bestDistance = d;
        best = index;
      }
    }
  });
  return best;
}

export type GraphPointerEvent = { type: "move"; screen: Vec2 } | { type: "leave" } | { type: "click"; screen: Vec2 };

/** The only thing the solution graph's pointer can do: name the kept curve under it (null = none). */
export type GraphPointerAction = { type: "hover"; index: number | null };

/**
 * One pointer event on the solution graph: `hovered` is the curve currently reported, the result is
 * the curve to report now and the actions to emit (a hover only when it changed). A click emits
 * nothing and changes nothing.
 */
export function reduceGraphPointer(hovered: number | null, event: GraphPointerEvent, curves: ReadonlyArray<ReadonlyArray<SeriesCurve>>, viewport: Viewport): { hovered: number | null; actions: GraphPointerAction[] } {
  switch (event.type) {
    case "move": {
      const index = nearestSeriesCurve(curves, event.screen, viewport);
      return index === hovered ? { hovered, actions: [] } : { hovered: index, actions: [{ type: "hover", index }] };
    }
    case "leave":
      return hovered === null ? { hovered, actions: [] } : { hovered: null, actions: [{ type: "hover", index: null }] };
    case "click":
      // No initial value can be read off (t, x): nothing is added, nothing is removed.
      return { hovered, actions: [] };
  }
}
