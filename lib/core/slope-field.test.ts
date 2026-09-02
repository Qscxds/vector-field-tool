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

  it("finds a tangential (semi-stable) equilibrium: dy/dx = y²", () => {
    const r = firstOrderEquilibria("y^2", { min: -2, max: 2 });
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

  it("reports non-autonomous equations as having no equilibrium solutions", () => {
    const r = firstOrderEquilibria("x - y", { min: -2, max: 2 });
    expect(r.autonomous).toBe(false);
    expect(r.solutions).toEqual([]);
  });

  it("returns no solutions when g never vanishes", () => {
    const r = firstOrderEquilibria("y^2 + 1", { min: -2, max: 2 });
    expect(r.autonomous).toBe(true);
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
