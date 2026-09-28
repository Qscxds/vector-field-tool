/**
 * Round Z2.4: the two pictures are linked by ONE piece of state, the hovered kept curve's index;
 * the solution graph's pointer machine only ever hovers (a click adds and removes nothing).
 * Expectations derived from the viewport's affine map and from the store's order, never from output.
 */
import { describe, expect, it } from "vitest";
import { compileSystem } from "./core/parse";
import { groupTrajectories } from "./labels-trajectory";
import { traceFixed } from "./interactive";
import { nearestSeriesCurve, reduceGraphPointer } from "./linked-views";
import { curveColor } from "./render/color";
import type { Viewport } from "./render/viewport";
import { seriesCurves } from "./time-series";
import type { SeriesCurve } from "./time-series";
import { resetTrajectories, trajectoriesOf, trajectoryStartsOf } from "./trajectory-store";

// t in [0, 10] across 500 px (50 px per unit), the value in [-1, 1] down 200 px (y_screen = 100 - 100 v).
const vp: Viewport = { box: { x: { min: 0, max: 10 }, y: { min: -1, max: 1 } }, width: 500, height: 200 };
const line = (v: number, key: "x" | "y" = "x"): SeriesCurve => ({ key, points: [{ x: 0, y: v }, { x: 10, y: v }] });
// Curve 0: x(t) = 0 (screen y 100); curve 1: x(t) = 0.5 (screen y 50) and its second series x'(t) = -0.5 (screen y 150).
const curves: SeriesCurve[][] = [[line(0)], [line(0.5), line(-0.5, "y")]];

describe("[Z2.4] nearestSeriesCurve: the kept curve within 8 screen pixels of the pointer, the nearest when several qualify", () => {
  it("derived distances under the viewport", () => {
    expect(nearestSeriesCurve(curves, { x: 250, y: 104 }, vp)).toBe(0); // 4 px below curve 0
    expect(nearestSeriesCurve(curves, { x: 250, y: 56 }, vp)).toBe(1); // 6 px below curve 1
    expect(nearestSeriesCurve(curves, { x: 250, y: 92 }, vp)).toBe(0); // exactly 8 px: still a hit
    expect(nearestSeriesCurve(curves, { x: 250, y: 91 }, vp)).toBeNull(); // 9 px from curve 0, 41 from curve 1
    expect(nearestSeriesCurve(curves, { x: 250, y: 80 }, vp)).toBeNull(); // 20 and 30 px away
    // Any series of a curve counts: the second series of curve 1 at screen y 150.
    expect(nearestSeriesCurve(curves, { x: 100, y: 147 }, vp)).toBe(1);
    // Nearest wins: 3 px from curve 1 (y 50) and 47 from curve 0.
    expect(nearestSeriesCurve(curves, { x: 10, y: 53 }, vp)).toBe(1);
    expect(nearestSeriesCurve([], { x: 250, y: 100 }, vp)).toBeNull();
  });
});

describe("[Z2.4] the solution graph's pointer machine hovers and never adds or removes", () => {
  it("a move reports the curve under the pointer once per change, a leave reports null once", () => {
    let r = reduceGraphPointer(null, { type: "move", screen: { x: 250, y: 104 } }, curves, vp);
    expect(r).toEqual({ hovered: 0, actions: [{ type: "hover", index: 0 }] });
    r = reduceGraphPointer(r.hovered, { type: "move", screen: { x: 251, y: 103 } }, curves, vp);
    expect(r).toEqual({ hovered: 0, actions: [] });
    r = reduceGraphPointer(r.hovered, { type: "move", screen: { x: 250, y: 56 } }, curves, vp);
    expect(r).toEqual({ hovered: 1, actions: [{ type: "hover", index: 1 }] });
    r = reduceGraphPointer(r.hovered, { type: "move", screen: { x: 250, y: 80 } }, curves, vp);
    expect(r).toEqual({ hovered: null, actions: [{ type: "hover", index: null }] });
    r = reduceGraphPointer(0, { type: "leave" }, curves, vp);
    expect(r).toEqual({ hovered: null, actions: [{ type: "hover", index: null }] });
    expect(reduceGraphPointer(null, { type: "leave" }, curves, vp)).toEqual({ hovered: null, actions: [] });
  });

  it("a click on a curve, or on empty space, produces no action of any kind and changes nothing (no initial value can be read off (t, x))", () => {
    for (const hovered of [null, 0, 1]) {
      for (const screen of [{ x: 250, y: 104 }, { x: 250, y: 56 }, { x: 250, y: 80 }, { x: 0, y: 0 }]) {
        expect(reduceGraphPointer(hovered, { type: "click", screen }, curves, vp)).toEqual({ hovered, actions: [] });
      }
    }
    // The machine's action vocabulary is "hover" alone: no add, no delete exists to be emitted.
    const all = [
      reduceGraphPointer(null, { type: "move", screen: { x: 250, y: 104 } }, curves, vp),
      reduceGraphPointer(0, { type: "leave" }, curves, vp),
      reduceGraphPointer(0, { type: "click", screen: { x: 250, y: 104 } }, curves, vp),
    ].flatMap((r) => r.actions.map((a) => a.type));
    expect(new Set(all)).toEqual(new Set(["hover"]));
  });
});

describe("[Z2.4] one index names the same kept curve in both pictures, in the same color", () => {
  // x' = y, y' = -x from (1, 0) and (2, 0): x(t) = cos t and 2 cos t.
  const sys = compileSystem({ f: "y", g: "-x" });
  const home = { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } };
  const store = resetTrajectories([{ x: 1, y: 0 }, { x: 2, y: 0 }], (p) => traceFixed(sys, p, home, 0));
  const trajectories = trajectoriesOf(store);
  const groups = groupTrajectories(trajectories);

  it("pair i of the phase plane and entry i of the graph are the curve through start i", () => {
    expect(trajectoryStartsOf(store)).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    expect(groups).toHaveLength(2);
    for (const i of [0, 1]) {
      // The phase plane's pair: forward then backward legs of the same start.
      expect(groups[i]).toEqual([trajectories[2 * i], trajectories[2 * i + 1]]);
      expect(groups[i][0].direction).toBe("forward");
      expect(groups[i][0].points[0]).toEqual(trajectoryStartsOf(store)[i]);
      // The graph's entry: the same legs against the clock; at t = 0 the value is the start's x.
      const [xs] = seriesCurves(groups[i], ["x"]);
      const atStart = xs.points.find((p) => p.x === 0)!;
      expect(atStart.y).toBe(i + 1);
      // The color both pictures use for it.
      expect(curveColor(i)).toBe(["#1d4ed8", "#d97706"][i]);
    }
  });
});
