import { describe, expect, it } from "vitest";
import { compileSystem } from "./core/parse";
import { toSystem } from "./core/slope-field";
import type { Vec2 } from "./core/types";
import {
  computeFeatures,
  expandBox,
  fixedStopBox,
  HOVER_DIAGONALS,
  HOVER_STEP_CAP,
  hoverStopBox,
  screenMetric,
  traceBoth,
  traceFixed,
  tracePreview,
} from "./interactive";
import { fitViewport, zoomAt } from "./render/viewport";
import type { TrajectoryView } from "./scene";

const box = { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };
const screenLength = (t: TrajectoryView, metric: (a: Vec2, b: Vec2) => number) =>
  t.points.slice(1).reduce((s, p, i) => s + metric(t.points[i], p), 0);

describe("computeFeatures", () => {
  it("returns equilibria for a system", () => {
    const f = computeFeatures(compileSystem({ f: "x", g: "-y" }), null, box, "en");
    expect(f.equilibria).toHaveLength(1);
    expect(f.equilibria![0].classification).toBe("saddle");
    expect(f.firstOrder).toBeUndefined();
  });

  it("returns first-order features including the implicit curves of an exact equation", () => {
    const spec = { kind: "differential" as const, M: "2*t*y", N: "t^2 + y^2" };
    const f = computeFeatures(compileSystem(toSystem(spec)), spec, box, "zh");
    expect(f.firstOrder?.forms?.map((x) => x.form)).toContain("exact");
    expect(f.firstOrder?.implicit?.levels.length).toBeGreaterThan(3);
    expect(f.firstOrder?.singularities).toHaveLength(1);
    expect(f.firstOrder?.expr).toBe("(2*t*y) dt + (t^2 + y^2) dy = 0");
  });

  it("uses the locale for the no-form note", () => {
    const spec = { kind: "explicit" as const, g: "t^2 + y^2" };
    const sys = compileSystem(toSystem(spec));
    const b = { x: { min: 0.3, max: 3 }, y: { min: 0.3, max: 3 } };
    expect(computeFeatures(sys, spec, b, "en").firstOrder?.formsNote).toMatch(/Riccati/);
    expect(computeFeatures(sys, spec, b, "zh").firstOrder?.formsNote).toMatch(/Riccati/);
    expect(computeFeatures(sys, spec, b, "zh").firstOrder?.formsNote).not.toBe(computeFeatures(sys, spec, b, "en").firstOrder?.formsNote);
  });
});

describe("expandBox and stop boxes", () => {
  it("expandBox grows symmetrically", () => {
    expect(expandBox(box, 1)).toEqual({ x: { min: -6, max: 6 }, y: { min: -6, max: 6 } });
    expect(expandBox({ x: { min: 0, max: 1 }, y: { min: 0, max: 2 } }, 0.5)).toEqual({ x: { min: -0.5, max: 1.5 }, y: { min: -1, max: 3 } });
  });

  it("the fixed stop box is 20 times the home box in each dimension", () => {
    const s = fixedStopBox({ x: { min: -3, max: 3 }, y: { min: -1, max: 1 } });
    expect(s.x.max - s.x.min).toBeCloseTo(120, 12);
    expect(s.y.max - s.y.min).toBeCloseTo(40, 12);
    expect((s.x.min + s.x.max) / 2).toBeCloseTo(0, 12);
  });
});

describe("hover preview length is measured on screen (H2.2)", () => {
  const viewport = fitViewport(box, 400, 400); // 100 px per world unit
  const metric = screenMetric(viewport);
  const limit = HOVER_DIAGONALS * Math.hypot(400, 400);

  it("a fast field and a slow field give previews of the same on-screen length", () => {
    // Both systems have circular orbits through (1, 0); the fast one goes round 100 times faster.
    const slow = tracePreview(compileSystem({ f: "y", g: "-x" }), { x: 1, y: 0 }, viewport);
    const fast = tracePreview(compileSystem({ f: "100*y", g: "-100*x" }), { x: 1, y: 0 }, viewport);
    for (const t of [...slow, ...fast]) {
      expect(t.status).toBe("arc_length");
      expect(screenLength(t, metric)).toBeCloseTo(limit, 6);
      expect(t.steps).toBeLessThanOrEqual(HOVER_STEP_CAP);
    }
    // The fast preview took far fewer time units for the same picture.
    expect(Math.abs(fast[0].tEnd)).toBeLessThan(Math.abs(slow[0].tEnd) / 50);
    // A field ten times slower than the unit oscillator has the same orbits and must get the same
    // preview: the old 50-time-unit cap cut it short (review C12).
    const slower = tracePreview(compileSystem({ f: "0.1*y", g: "-0.1*x" }), { x: 1, y: 0 }, viewport);
    for (const t of slower) {
      expect(t.status).toBe("arc_length");
      expect(screenLength(t, metric)).toBeCloseTo(limit, 6);
    }
  });

  it("the stop box is far enough that a straight preview from the canvas edge is cut by length, not by the box (non-square canvas)", () => {
    const wide = fitViewport(box, 640, 435);
    const lim = HOVER_DIAGONALS * Math.hypot(640, 435);
    const m = screenMetric(wide);
    // vertical field, start at the top edge of the visible box: the box would cut it 4 short sides away
    const start = { x: 0, y: wide.box.y.max };
    const up = tracePreview(compileSystem({ f: "0", g: "1" }), start, wide);
    expect(up[0].status).toBe("arc_length");
    expect(screenLength(up[0], m)).toBeCloseTo(lim, 6);
    const stop = hoverStopBox(wide.box);
    expect(stop.y.max - wide.box.y.max).toBeGreaterThan(lim / (435 / (wide.box.y.max - wide.box.y.min)));
  });

  it("zooming in keeps the on-screen length: fewer world units, same pixels", () => {
    const zoomed = zoomAt(viewport, { x: 200, y: 200 }, 4, { original: box });
    const sys = compileSystem({ f: "1", g: "0" });
    const wide = tracePreview(sys, { x: 0, y: 0 }, viewport)[0];
    const close = tracePreview(sys, { x: 0, y: 0 }, zoomed)[0];
    expect(screenLength(wide, metric)).toBeCloseTo(limit, 6);
    expect(screenLength(close, screenMetric(zoomed))).toBeCloseTo(limit, 6);
    // In world units the zoomed preview is four times shorter: 1131 px / 400 px-per-unit.
    const worldLen = (t: TrajectoryView) => Math.abs(t.points[t.points.length - 1].x);
    expect(worldLen(wide)).toBeCloseTo(limit / 100, 6);
    expect(worldLen(close)).toBeCloseTo(limit / 400, 6);
  });

  it("the screen metric is anisotropic: under unequal pixel scales a unit step measures sx px horizontally and sy px vertically", () => {
    // sx = 600/300 = 2 px/unit, sy = 300/300 = 1 px/unit
    const m = screenMetric({ box: { x: { min: 0, max: 300 }, y: { min: 0, max: 300 } }, width: 600, height: 300 });
    expect(m({ x: 10, y: 10 }, { x: 11, y: 10 })).toBeCloseTo(2, 12);
    expect(m({ x: 10, y: 10 }, { x: 10, y: 11 })).toBeCloseTo(1, 12);
    expect(m({ x: 10, y: 10 }, { x: 11, y: 11 })).toBeCloseTo(Math.sqrt(5), 12);
  });

  it("under unequal scales the preview keeps its on-screen length and the stop box still does not cut it", () => {
    // Filled 720 x 520 canvas over the 4 x 4 box: sx = 180, sy = 130 px/unit; limit = 2 diagonals.
    const filled = fitViewport(box, 720, 520, { equalScale: false });
    const lim = HOVER_DIAGONALS * Math.hypot(720, 520);
    const m = screenMetric(filled);
    // vertical field from the top edge: the stop box is 4 box heights = 16 units away; the preview
    // needs lim / 130 = 13.67 units, so it is cut by length
    const up = tracePreview(compileSystem({ f: "0", g: "1" }), { x: 0, y: 2 }, filled)[0];
    expect(up.direction).toBe("forward");
    expect(up.status).toBe("arc_length");
    expect(screenLength(up, m)).toBeCloseTo(lim, 6);
    expect(up.points[up.points.length - 1].y - 2).toBeCloseTo(lim / 130, 6);
    // horizontal field: the same pixels are fewer world units along x (180 px/unit)
    const right = tracePreview(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, filled)[0];
    expect(right.status).toBe("arc_length");
    expect(screenLength(right, m)).toBeCloseTo(lim, 6);
    expect(right.points[right.points.length - 1].x).toBeCloseTo(lim / 180, 6);
  });

  it("a preview that reaches an equilibrium or leaves the stop box is shorter, and says why", () => {
    const t = tracePreview(compileSystem({ f: "-x", g: "-y" }), { x: 1, y: 1 }, viewport);
    expect(t[0].status).toBe("reached_equilibrium");
    expect(screenLength(t[0], metric)).toBeLessThan(limit);
  });
});

describe("fixed trajectories extend by the solution, not the view (H2.3)", () => {
  it("clicked in a 10x zoomed view, the curve runs far beyond the visible range", () => {
    const home = { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } };
    const v = zoomAt(fitViewport(home, 600, 600), { x: 300, y: 300 }, 10, { original: home });
    expect(v.box.x.max - v.box.x.min).toBeCloseTo(0.6, 9); // the visible range is now ±0.3
    const [fwd, back] = traceFixed(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, home);
    // x' = 1 for 50 time units: x = 50, inside the 20x stop box (±60) -> completed, not truncated.
    expect(fwd.status).toBe("completed");
    expect(fwd.points[fwd.points.length - 1].x).toBeCloseTo(50, 6);
    expect(back.points[back.points.length - 1].x).toBeCloseTo(-50, 6);
    expect(fwd.points[fwd.points.length - 1].x).toBeGreaterThan(v.box.x.max * 100);
  });

  it("stops at 20x the home box, wherever the view is", () => {
    const home = { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } };
    const [fwd] = traceFixed(compileSystem({ f: "5", g: "0" }), { x: 0, y: 0 }, home);
    // Stop box is ±20; x = 5t reaches 20 at t = 4 (< 50) -> left_box, cut exactly on the border.
    expect(fwd.status).toBe("left_box");
    expect(fwd.stop).toBe("far");
    const end = fwd.points[fwd.points.length - 1];
    expect(end.x).toBeCloseTo(20, 9);
    expect(fwd.tEnd).toBeCloseTo(4, 9);
  });

  it("traceBoth honours an explicit step cap", () => {
    const [fwd] = traceBoth(compileSystem({ f: "y", g: "-x" }), { x: 1, y: 0 }, { stopBox: box, maxSteps: 7 });
    expect(fwd.status).toBe("max_steps");
    expect(fwd.steps).toBe(7);
  });
});
