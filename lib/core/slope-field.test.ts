import { describe, expect, it } from "vitest";
import { integrateAdaptive, integrateRK4 } from "./integrate";
import { compileSystem } from "./parse";
import {
  compileDifferential,
  firstOrderEquilibria,
  firstOrderSingularities,
  firstOrderToSystem,
  toDifferential,
  toSystem,
  type FirstOrderSpec,
} from "./slope-field";

const box = (a: number, b: number) => ({ x: { min: a, max: b }, y: { min: a, max: b } });

describe("toSystem / toDifferential", () => {
  it("explicit dy/dx = g becomes x' = 1, y' = g (M = -g, N = 1)", () => {
    const spec: FirstOrderSpec = { kind: "explicit", g: "y*(1-y)" };
    expect(toSystem(spec)).toEqual({ f: "1", g: "y*(1-y)" });
    expect(toDifferential(spec)).toEqual({ M: "-(y*(1-y))", N: "1" });
    expect(compileSystem(toSystem(spec)).eval({ x: 0, y: 0.5 })).toEqual({ x: 1, y: 0.25 });
  });

  it("differential M dx + N dy = 0 becomes x' = N, y' = -M", () => {
    const spec: FirstOrderSpec = { kind: "differential", M: "x", N: "y" };
    expect(toSystem(spec)).toEqual({ f: "y", g: "-(x)" });
    const sys = compileSystem(toSystem(spec));
    // dy/dx = -M/N = -x/y: at (1, 2) the direction is (2, -1)
    expect(sys.eval({ x: 1, y: 2 })).toEqual({ x: 2, y: -1 });
  });

  it("keeps params and the legacy helper", () => {
    expect(toSystem({ kind: "explicit", g: "k*y", params: { k: 2 } })).toEqual({ f: "1", g: "k*y", params: { k: 2 } });
    expect(firstOrderToSystem("k*y", { k: 2 })).toEqual({ f: "1", g: "k*y", params: { k: 2 } });
    expect(firstOrderToSystem("y")).toEqual({ f: "1", g: "y" });
    const { M, N } = compileDifferential({ kind: "differential", M: "a*x", N: "y", params: { a: 3 } });
    expect(M({ x: 2, y: 0 })).toBe(6);
    expect(N({ x: 0, y: 5 })).toBe(5);
  });
});

describe("vertical tangents are not singularities", () => {
  it("dy/dx = -x/y in differential form (x dx + y dy = 0) traces the full circle through y = 0", () => {
    // Solutions are circles x² + y² = C. Starting at (0, 1) and running the system x' = y, y' = -x
    // for one period must return to the start and pass through y = 0 (where dy/dx is infinite).
    const sys = compileSystem(toSystem({ kind: "differential", M: "x", N: "y" }));
    const tr = integrateRK4(sys, { x: 0, y: 1 }, 2 * Math.PI, { h: 0.01, box: box(-2, 2) });
    expect(tr.status).toBe("completed");
    const end = tr.points[tr.points.length - 1];
    expect(Math.hypot(end.x, end.y - 1)).toBeLessThan(1e-6);
    expect(tr.points.some((p) => Math.abs(p.y) < 0.02 && Math.abs(Math.abs(p.x) - 1) < 0.02)).toBe(true);
    const radii = tr.points.map((p) => Math.hypot(p.x, p.y));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-6);
  });

  it("the same circle written explicitly, dy/dx = -x/y, hits the singularity at y = 0 (why the base changed)", () => {
    const sys = compileSystem(toSystem({ kind: "explicit", g: "-x/y" }));
    const tr = integrateAdaptive(sys, { x: 0, y: 1 }, 5, { box: box(-2, 2) });
    expect(tr.status).toBe("singular");
  });

  it("x dx + y dy = 0 and dy/dx = -x/y describe the same family (slopes agree where both are finite)", () => {
    const a = compileDifferential({ kind: "differential", M: "x", N: "y" });
    const b = compileDifferential({ kind: "explicit", g: "-x/y" });
    for (const p of [{ x: 0.3, y: 0.7 }, { x: -1.2, y: 0.4 }, { x: 2, y: -3 }]) {
      const sa = -a.M(p) / a.N(p);
      const sb = -b.M(p) / b.N(p);
      expect(sa).toBeCloseTo(sb, 12);
    }
  });
});

describe("firstOrderSingularities (M = N = 0)", () => {
  it("finds the origin of y dx - x dy = 0", () => {
    const r = firstOrderSingularities({ kind: "differential", M: "y", N: "-x" }, box(-2, 2));
    expect(r.points).toHaveLength(1);
    expect(Math.hypot(r.points[0].x, r.points[0].y)).toBeLessThan(1e-7);
    expect(r.warning).toBeUndefined();
  });

  it("finds nothing for x dx + y dy = 0 away from the origin, and never for explicit forms", () => {
    expect(firstOrderSingularities({ kind: "differential", M: "x", N: "y" }, { x: { min: 1, max: 3 }, y: { min: 1, max: 3 } }).points).toEqual([]);
    expect(firstOrderSingularities({ kind: "explicit", g: "x/y" }, box(-2, 2)).points).toEqual([]);
  });

  it("x³ dx + y dy = 0 has exactly one singular point (the origin, a triple root in x)", () => {
    const s = firstOrderSingularities({ kind: "differential", M: "x^3", N: "y" }, { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } });
    expect(s.points).toHaveLength(1);
    expect(Math.hypot(s.points[0].x, s.points[0].y)).toBeLessThan(1e-9);
    expect(s.warning).toBeUndefined();
  });

  it("finds two isolated singular points: (x² - 1) dx + y dy = 0", () => {
    const r = firstOrderSingularities({ kind: "differential", M: "x^2 - 1", N: "y" }, box(-2, 2));
    expect(r.points.map((p) => Math.round(p.x * 1e6) / 1e6).sort()).toEqual([-1, 1]);
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

  it("accepts the differential form: (y^2 - 1) dx + 2 dy = 0 has y = ±1", () => {
    // dy/dx = -(y²-1)/2: above y = 1 the slope is negative -> approaches from above; below 1 (but
    // above -1) positive -> approaches from below: y = 1 stable. Around y = -1 the signs reverse.
    const r = firstOrderEquilibria({ kind: "differential", M: "y^2 - 1", N: "2" }, { min: -3, max: 3 });
    expect(r.solutions.map((s) => [Math.round(s.y * 1e9) / 1e9, s.stability])).toEqual([[-1, "unstable"], [1, "stable"]]);
  });

  it("finds constant solutions of non-autonomous equations: dy/dx = x(y-1)", () => {
    // M(x, c) = -x (c - 1) vanishes for every x only at c = 1; N = 1 != 0. The stability flips with
    // the sign of x, so it is reported as 'varies'.
    const r = firstOrderEquilibria("x*(y-1)", { min: -2, max: 3 }, { xRange: { min: -2, max: 2 } });
    expect(r.autonomous).toBe(false);
    expect(r.solutions).toHaveLength(1);
    expect(r.solutions[0].y).toBeCloseTo(1, 9);
    expect(r.solutions[0].stability).toBe("varies");
  });

  it("rejects a line where N vanishes: y dx + (y - 1) dy = 0 has no constant solution at y = 1", () => {
    // M(x, 1) = 1 != 0 anyway; and at y = 0, M = 0 but N = -1 != 0 -> y = 0 is a constant solution.
    const r = firstOrderEquilibria({ kind: "differential", M: "y", N: "y - 1" }, { min: -2, max: 2 });
    expect(r.solutions.map((s) => Math.round(s.y * 1e9) / 1e9)).toEqual([0]);
  });

  it("finds a tangential (semi-stable) equilibrium that is not a sample point: dy/dx = y²", () => {
    const r = firstOrderEquilibria("y^2", { min: -2.1, max: 2.05 });
    expect(r.solutions).toHaveLength(1);
    expect(Math.abs(r.solutions[0].y)).toBeLessThan(1e-4);
    expect(r.solutions[0].stability).toBe("semi_stable");
  });

  it("works with an irrational root: dy/dx = y² - 2", () => {
    const r = firstOrderEquilibria("y^2 - 2", { min: -3, max: 3 });
    expect(r.solutions.map((s) => s.y)).toEqual(expect.arrayContaining([expect.closeTo(-Math.SQRT2, 9), expect.closeTo(Math.SQRT2, 9)]));
    expect(r.solutions.find((s) => s.y < 0)?.stability).toBe("stable");
    expect(r.solutions.find((s) => s.y > 0)?.stability).toBe("unstable");
  });

  it("does not mistake a pole for an equilibrium: dy/dx = 1/y", () => {
    const r = firstOrderEquilibria("1/y", { min: -1, max: 1 });
    expect(r.solutions).toEqual([]);
  });

  it("reports a flat multiple root once: dy/dx = (y-1)^3 is unstable", () => {
    const r = firstOrderEquilibria("(y-1)^3", { min: -1, max: 3 });
    expect(r.solutions).toHaveLength(1);
    expect(Math.abs(r.solutions[0].y - 1)).toBeLessThan(1e-3);
    expect(r.solutions[0].stability).toBe("unstable");
  });

  it("a genuinely x-dependent right-hand side has no constant solutions: dy/dx = x - y", () => {
    const r = firstOrderEquilibria("x - y", { min: -2, max: 2 });
    expect(r.autonomous).toBe(false);
    expect(r.solutions).toEqual([]);
  });

  it("is not fooled by x-dependence that vanishes on nice x values", () => {
    const r = firstOrderEquilibria("y + x*(x-1)*(x+1)*(x-2.5)", { min: -2, max: 2 }, { xRange: { min: -3, max: 3 } });
    expect(r.autonomous).toBe(false);
    expect(r.solutions).toEqual([]);
  });

  it("returns no solutions when g never vanishes, and none for an everywhere-singular field", () => {
    expect(firstOrderEquilibria("y^2 + 1", { min: -2, max: 2 }).solutions).toEqual([]);
    const r = firstOrderEquilibria("sqrt(-1 - y^2)", { min: -1, max: 1 });
    expect(r.autonomous).toBe(false);
    expect(r.solutions).toEqual([]);
  });

  it("ignores roots outside the range and rejects a degenerate range", () => {
    expect(firstOrderEquilibria("y - 5", { min: -1, max: 1 }).solutions).toEqual([]);
    expect(() => firstOrderEquilibria("y", { min: 1, max: 1 })).toThrow(RangeError);
  });
});

describe("relative tolerances for constant solutions and autonomy (review C7)", () => {
  it("dy/dx = exp(-x) on [30, 40] has no constant solution although |g| < 1e-13 everywhere", () => {
    // M = -e^{-x} is never zero; the old absolute floor 1e-9 called every sampled y a root.
    const r = firstOrderEquilibria({ kind: "explicit", g: "exp(-x)" }, { min: -1, max: 1 }, { xRange: { min: 30, max: 40 } });
    expect(r.solutions).toEqual([]);
    expect(r.autonomous).toBe(false); // e^{-x} depends on x, however small it is
  });

  it("scaling an equation by 1e-12 changes neither its constant solutions nor its autonomy", () => {
    const a = firstOrderEquilibria({ kind: "explicit", g: "y*(1-y)" }, { min: -1, max: 2 }, { xRange: { min: -2, max: 2 } });
    const b = firstOrderEquilibria({ kind: "explicit", g: "1e-12*y*(1-y)" }, { min: -1, max: 2 }, { xRange: { min: -2, max: 2 } });
    expect(b.autonomous).toBe(true);
    expect(b.solutions.map((s) => [Math.round(s.y * 1e6) / 1e6, s.stability])).toEqual(a.solutions.map((s) => [Math.round(s.y * 1e6) / 1e6, s.stability]));
    const c = firstOrderEquilibria({ kind: "explicit", g: "1e-12*(x + y)" }, { min: -2, max: 2 }, { xRange: { min: -2, max: 2 } });
    expect(c.autonomous).toBe(false);
  });

  it("dy/dx = y/x: y = 0 is a constant solution on a box where a probe lands on x = 0 (review, dropped item)", () => {
    // M = -y/x is 0 on y = 0 for x ≠ 0 and undefined at x = 0; the undefined probe is skipped, not
    // held against the line. Solutions go away from y = 0 for x > 0 and towards it for x < 0: 'varies'.
    const r = firstOrderEquilibria({ kind: "explicit", g: "y/x" }, { min: -2, max: 2 }, { xRange: { min: -2, max: 2 } });
    expect(r.solutions).toHaveLength(1);
    expect(Math.abs(r.solutions[0].y)).toBeLessThan(1e-9);
    expect(r.solutions[0].stability).toBe("varies");
  });
});

describe("constant solutions through a singular point", () => {
  const spec = { kind: "differential" as const, M: "2*x*y", N: "x^2 + y^2" };

  it("y = 0 of 2xy dx + (x^2 + y^2) dy = 0 is found on a symmetric box and reported as 'varies'", () => {
    // Along y = 0: M = 0 and N = x^2 != 0 for x != 0, so dy = 0 holds on both sides of the singular
    // point (0, 0). Near the line the slope is -2xy/(x^2 + y^2) ~ -2y/x: attracting for x > 0,
    // repelling for x < 0. Before the fix the probe at x = 0 (the midpoint of a symmetric box)
    // rejected the whole line, so the answer flipped with the symmetry of the box.
    const r = firstOrderEquilibria(spec, { min: -2, max: 2 }, { xRange: { min: -2, max: 2 } });
    expect(r.solutions).toHaveLength(1);
    expect(Math.abs(r.solutions[0].y)).toBeLessThan(1e-9);
    expect(r.solutions[0].stability).toBe("varies");
  });

  it("is stable for x > 0 and unstable for x < 0", () => {
    expect(firstOrderEquilibria(spec, { min: -1, max: 1.2 }, { xRange: { min: 0.3, max: 2.5 } }).solutions.map((s) => s.stability)).toEqual(["stable"]);
    expect(firstOrderEquilibria(spec, { min: -1, max: 1.2 }, { xRange: { min: -2.5, max: -0.3 } }).solutions.map((s) => s.stability)).toEqual(["unstable"]);
  });

  it("a line where N vanishes identically is not a constant solution: y dx + y dy = 0", () => {
    // M = N = y: every point of y = 0 is singular; there is no direction field on that line at all.
    const r = firstOrderEquilibria({ kind: "differential", M: "y", N: "y" }, { min: -1, max: 1 }, { xRange: { min: -1, max: 1 } });
    expect(r.solutions).toEqual([]);
  });
});
