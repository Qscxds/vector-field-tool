import { describe, expect, it } from "vitest";
import { compileSystem } from "./parse";
import { firstOrderEquilibria, firstOrderToSystem } from "./slope-field";

describe("firstOrderToSystem", () => {
  it("maps dy/dx = expr to x' = 1, y' = expr", () => {
    const spec = firstOrderToSystem("y*(1-y)");
    expect(spec).toEqual({ f: "1", g: "y*(1-y)" });
    const sys = compileSystem(spec);
    expect(sys.eval({ x: 0, y: 0.5 })).toEqual({ x: 1, y: 0.25 });
  });

  it("keeps params", () => {
    expect(firstOrderToSystem("k*y", { k: 2 })).toEqual({ f: "1", g: "k*y", params: { k: 2 } });
  });
});

describe("firstOrderEquilibria", () => {
  it("logistic dy/dx = y(1-y): y=0 unstable, y=1 stable", () => {
    const r = firstOrderEquilibria("y*(1-y)", { min: -1, max: 2 });
    expect(r.autonomous).toBe(true);
    expect(r.solutions).toHaveLength(2);
    expect(r.solutions[0].y).toBeCloseTo(0, 9);
    expect(r.solutions[0].stability).toBe("unstable");
    expect(r.solutions[1].y).toBeCloseTo(1, 9);
    expect(r.solutions[1].stability).toBe("stable");
  });

  it("finds a tangential (semi-stable) equilibrium that is not a sample point: dy/dx = y²", () => {
    // 400 samples on [-2.1, 2.05]: step 0.010375, and 2.1 / 0.010375 = 202.4 is not an integer,
    // so y = 0 is never sampled and only the local-minimum branch can find it.
    const r = firstOrderEquilibria("y^2", { min: -2.1, max: 2.05 });
    expect(r.solutions).toHaveLength(1);
    expect(Math.abs(r.solutions[0].y)).toBeLessThan(1e-4);
    expect(r.solutions[0].stability).toBe("semi_stable");
  });

  it("works with an irrational root: dy/dx = y² - 2", () => {
    const r = firstOrderEquilibria("y^2 - 2", { min: -3, max: 3 });
    expect(r.solutions.map((s) => s.y)).toEqual(
      expect.arrayContaining([expect.closeTo(-Math.SQRT2, 9), expect.closeTo(Math.SQRT2, 9)]),
    );
    expect(r.solutions.find((s) => s.y < 0)?.stability).toBe("stable");
    expect(r.solutions.find((s) => s.y > 0)?.stability).toBe("unstable");
  });

  it("does not mistake a pole for an equilibrium: dy/dx = 1/y", () => {
    const r = firstOrderEquilibria("1/y", { min: -1, max: 1 });
    expect(r.autonomous).toBe(true);
    expect(r.solutions).toEqual([]);
  });

  it("reports a flat multiple root once: dy/dx = (y-1)^3", () => {
    const r = firstOrderEquilibria("(y-1)^3", { min: -1, max: 3 });
    expect(r.solutions).toHaveLength(1);
    expect(Math.abs(r.solutions[0].y - 1)).toBeLessThan(1e-3);
    // g < 0 below y = 1 and g > 0 above: solutions move away on both sides -> unstable.
    expect(r.solutions[0].stability).toBe("unstable");
  });

  it("reports non-autonomous equations as having no equilibrium solutions", () => {
    const r = firstOrderEquilibria("x - y", { min: -2, max: 2 });
    expect(r.autonomous).toBe(false);
    expect(r.solutions).toEqual([]);
  });

  it("is not fooled by x-dependence that vanishes on nice x values", () => {
    // Vanishes at x = -1, 0, 1, 2.5 (the old fixed probes) but not elsewhere.
    const r = firstOrderEquilibria("y + x*(x-1)*(x+1)*(x-2.5)", { min: -2, max: 2 });
    expect(r.autonomous).toBe(false);
    // Same with probes taken from a box range.
    const r2 = firstOrderEquilibria("y + x*(x-1)*(x+1)*(x-2.5)", { min: -2, max: 2 }, { xRange: { min: -3, max: 3 } });
    expect(r2.autonomous).toBe(false);
  });

  it("uses the given x range for the autonomy probes", () => {
    const r = firstOrderEquilibria("y*(1-y)", { min: -1, max: 2 }, { xRange: { min: 100, max: 200 } });
    expect(r.autonomous).toBe(true);
    expect(r.solutions).toHaveLength(2);
  });

  it("returns no solutions when g never vanishes", () => {
    const r = firstOrderEquilibria("y^2 + 1", { min: -2, max: 2 });
    expect(r.autonomous).toBe(true);
    expect(r.solutions).toEqual([]);
  });

  it("cannot establish autonomy for a field that is singular everywhere", () => {
    const r = firstOrderEquilibria("sqrt(-1 - y^2)", { min: -1, max: 1 });
    expect(r.autonomous).toBe(false);
    expect(r.solutions).toEqual([]);
  });

  it("ignores roots outside the range and survives singularities", () => {
    expect(firstOrderEquilibria("y - 5", { min: -1, max: 1 }).solutions).toEqual([]);
    expect(() => firstOrderEquilibria("1/y", { min: -1, max: 1 })).not.toThrow();
  });

  it("rejects a degenerate range", () => {
    expect(() => firstOrderEquilibria("y", { min: 1, max: 1 })).toThrow(RangeError);
  });
});
