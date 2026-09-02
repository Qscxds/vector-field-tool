import { describe, expect, it } from "vitest";
import { compileSystem } from "./core/parse";
import { toSystem } from "./core/slope-field";
import { computeFeatures, expandBox, HOVER_STEP_BUDGET, traceBoth } from "./interactive";

const box = { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };

describe("computeFeatures", () => {
  it("returns equilibria for a system", () => {
    const f = computeFeatures(compileSystem({ f: "x", g: "-y" }), null, box, "en");
    expect(f.equilibria).toHaveLength(1);
    expect(f.equilibria![0].classification).toBe("saddle");
    expect(f.firstOrder).toBeUndefined();
  });

  it("returns first-order features including the implicit curves of an exact equation", () => {
    const spec = { kind: "differential" as const, M: "2*x*y", N: "x^2 + y^2" };
    const f = computeFeatures(compileSystem(toSystem(spec)), spec, box, "zh");
    expect(f.firstOrder?.forms?.map((x) => x.form)).toContain("exact");
    expect(f.firstOrder?.implicit?.levels.length).toBeGreaterThan(3);
    expect(f.firstOrder?.singularities).toHaveLength(1);
    expect(f.firstOrder?.expr).toBe("(2*x*y) dx + (x^2 + y^2) dy = 0");
  });

  it("uses the locale for the no-form note", () => {
    const spec = { kind: "explicit" as const, g: "x^2 + y^2" };
    const sys = compileSystem(toSystem(spec));
    const b = { x: { min: 0.3, max: 3 }, y: { min: 0.3, max: 3 } };
    expect(computeFeatures(sys, spec, b, "en").firstOrder?.formsNote).toMatch(/Riccati/);
    expect(computeFeatures(sys, spec, b, "zh").firstOrder?.formsNote).toMatch(/Riccati/);
    expect(computeFeatures(sys, spec, b, "zh").firstOrder?.formsNote).not.toBe(computeFeatures(sys, spec, b, "en").firstOrder?.formsNote);
  });
});

describe("expandBox and traceBoth", () => {
  it("expandBox grows symmetrically", () => {
    expect(expandBox(box, 1)).toEqual({ x: { min: -6, max: 6 }, y: { min: -6, max: 6 } });
    expect(expandBox({ x: { min: 0, max: 1 }, y: { min: 0, max: 2 } }, 0.5)).toEqual({ x: { min: -0.5, max: 1.5 }, y: { min: -1, max: 3 } });
  });

  it("traces both directions and respects the step budget", () => {
    const sys = compileSystem({ f: "y", g: "-x" });
    const both = traceBoth(sys, { x: 1, y: 0 }, box, HOVER_STEP_BUDGET);
    expect(both.map((t) => t.direction)).toEqual(["forward", "backward"]);
    for (const t of both) {
      expect(t.steps).toBeLessThanOrEqual(HOVER_STEP_BUDGET);
      expect(t.points.length).toBeGreaterThan(10);
      expect(t.points.every((p) => Math.abs(Math.hypot(p.x, p.y) - 1) < 1e-3)).toBe(true);
    }
    const fixed = traceBoth(sys, { x: 1, y: 0 }, box);
    expect(fixed[0].status).toBe("completed");
    expect(fixed[0].tEnd).toBeCloseTo(50, 9);
  });

  it("a trajectory may leave the visible box but stops at three times its size", () => {
    const sys = compileSystem({ f: "1", g: "0" });
    const [fwd] = traceBoth(sys, { x: 0, y: 0 }, box);
    expect(fwd.status).toBe("left_box");
    // The integrator records the first point outside the stop box; every earlier point is inside it.
    const end = fwd.points[fwd.points.length - 1];
    const beforeEnd = fwd.points[fwd.points.length - 2];
    expect(end.x).toBeGreaterThan(6);
    expect(beforeEnd.x).toBeLessThanOrEqual(6);
  });
});
