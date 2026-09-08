import { describe, expect, it } from "vitest";
import { integrateAdaptive, integrateRK4 } from "./integrate";
import { compileSystem, ParseError } from "./parse";
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
  it("explicit dy/dt = g becomes x' = 1, y' = g (M = -g, N = 1) in variable mode ty", () => {
    const spec: FirstOrderSpec = { kind: "explicit", g: "y*(1-y)" };
    expect(toSystem(spec)).toEqual({ f: "1", g: "y*(1-y)", variables: "ty" });
    expect(toDifferential(spec)).toEqual({ M: "-(y*(1-y))", N: "1" });
    expect(compileSystem(toSystem(spec)).eval({ x: 0, y: 0.5 })).toEqual({ x: 1, y: 0.25 });
  });

  it("differential M dt + N dy = 0 becomes x' = N, y' = -M", () => {
    const spec: FirstOrderSpec = { kind: "differential", M: "t", N: "y" };
    expect(toSystem(spec)).toEqual({ f: "y", g: "-(t)", variables: "ty" });
    const sys = compileSystem(toSystem(spec));
    // dy/dt = -M/N = -t/y: at (1, 2) the direction is (2, -1)
    expect(sys.eval({ x: 1, y: 2 })).toEqual({ x: 2, y: -1 });
  });

  it("keeps params and the legacy helper", () => {
    expect(toSystem({ kind: "explicit", g: "k*y", params: { k: 2 } })).toEqual({ f: "1", g: "k*y", params: { k: 2 }, variables: "ty" });
    expect(firstOrderToSystem("k*y", { k: 2 })).toEqual({ f: "1", g: "k*y", params: { k: 2 }, variables: "ty" });
    expect(firstOrderToSystem("y")).toEqual({ f: "1", g: "y", variables: "ty" });
    const { M, N } = compileDifferential({ kind: "differential", M: "a*t", N: "y", params: { a: 3 } });
    expect(M({ x: 2, y: 0 })).toBe(6);
    expect(N({ x: 0, y: 5 })).toBe(5);
  });
});

describe("the student's t is the kernel's horizontal coordinate", () => {
  it("toSystem tags the system with variables ty, and the time argument is ignored", () => {
    expect(toSystem({ kind: "explicit", g: "t*y" }).variables).toBe("ty");
    const sys = compileSystem(toSystem({ kind: "explicit", g: "t*y" }));
    // g(t, y) = t·y at the point t = 2, y = 3 is 6, whatever the integrator's time is
    expect(sys.eval({ x: 2, y: 3 })).toEqual({ x: 1, y: 6 });
    expect(sys.eval({ x: 2, y: 3 }, 99)).toEqual({ x: 1, y: 6 });
  });

  it("dy/dt = y from (0, 1) reaches y = e at t = 1", () => {
    // The exact solution is y = e^t. The adaptive integrator's default tolerance is rtol 1e-6,
    // so the value at t = 1 must agree with Math.E to about 1e-5 relative.
    const sys = compileSystem(toSystem({ kind: "explicit", g: "y" }));
    const tr = integrateAdaptive(sys, { x: 0, y: 1 }, 1, { box: box(-5, 5) });
    expect(tr.status).toBe("completed");
    const end = tr.points[tr.points.length - 1];
    expect(end.x).toBeCloseTo(1, 9);
    expect(Math.abs(end.y - Math.E) / Math.E).toBeLessThan(1e-5);
  });

  it("x in a first-order expression is rejected with code x_in_first_order, through every entry point", () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        expect(error).toBeInstanceOf(ParseError);
        return (error as ParseError).code;
      }
      throw new Error("expected a ParseError");
    };
    expect(code(() => compileSystem(toSystem({ kind: "explicit", g: "x*y" })))).toBe("x_in_first_order");
    expect(code(() => compileDifferential({ kind: "differential", M: "2*x*y", N: "y" }))).toBe("x_in_first_order");
    expect(code(() => firstOrderEquilibria("x - y", { min: -1, max: 1 }))).toBe("x_in_first_order");
    expect(code(() => firstOrderSingularities({ kind: "differential", M: "y", N: "-x" }, box(-2, 2)))).toBe("x_in_first_order");
  });
});

describe("vertical tangents are not singularities", () => {
  it("dy/dt = -t/y in differential form (t dt + y dy = 0) traces the full circle through y = 0", () => {
    // Solutions are circles t² + y² = C. Starting at (0, 1) and running the kernel system
    // x' = y, y' = -x for one period must return to the start and pass through y = 0 (where dy/dt
    // is infinite).
    const sys = compileSystem(toSystem({ kind: "differential", M: "t", N: "y" }));
    const tr = integrateRK4(sys, { x: 0, y: 1 }, 2 * Math.PI, { h: 0.01, box: box(-2, 2) });
    expect(tr.status).toBe("completed");
    const end = tr.points[tr.points.length - 1];
    expect(Math.hypot(end.x, end.y - 1)).toBeLessThan(1e-6);
    expect(tr.points.some((p) => Math.abs(p.y) < 0.02 && Math.abs(Math.abs(p.x) - 1) < 0.02)).toBe(true);
    const radii = tr.points.map((p) => Math.hypot(p.x, p.y));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-6);
  });

  it("the same circle written explicitly, dy/dt = -t/y, hits the singularity at y = 0 (why the base changed)", () => {
    const sys = compileSystem(toSystem({ kind: "explicit", g: "-t/y" }));
    const tr = integrateAdaptive(sys, { x: 0, y: 1 }, 5, { box: box(-2, 2) });
    expect(tr.status).toBe("singular");
  });

  it("t dt + y dy = 0 and dy/dt = -t/y describe the same family (slopes agree where both are finite)", () => {
    const a = compileDifferential({ kind: "differential", M: "t", N: "y" });
    const b = compileDifferential({ kind: "explicit", g: "-t/y" });
    for (const p of [{ x: 0.3, y: 0.7 }, { x: -1.2, y: 0.4 }, { x: 2, y: -3 }]) {
      const sa = -a.M(p) / a.N(p);
      const sb = -b.M(p) / b.N(p);
      expect(sa).toBeCloseTo(sb, 12);
    }
  });
});

describe("firstOrderSingularities (M = N = 0)", () => {
  it("finds the origin of y dt - t dy = 0", () => {
    const r = firstOrderSingularities({ kind: "differential", M: "y", N: "-t" }, box(-2, 2));
    expect(r.points).toHaveLength(1);
    expect(Math.hypot(r.points[0].x, r.points[0].y)).toBeLessThan(1e-7);
    expect(r.warning).toBeUndefined();
  });

  it("finds nothing for t dt + y dy = 0 away from the origin, and never for explicit forms", () => {
    expect(firstOrderSingularities({ kind: "differential", M: "t", N: "y" }, { x: { min: 1, max: 3 }, y: { min: 1, max: 3 } }).points).toEqual([]);
    expect(firstOrderSingularities({ kind: "explicit", g: "t/y" }, box(-2, 2)).points).toEqual([]);
  });

  it("t³ dt + y dy = 0 has exactly one singular point (the origin, a triple root in t)", () => {
    const s = firstOrderSingularities({ kind: "differential", M: "t^3", N: "y" }, { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } });
    expect(s.points).toHaveLength(1);
    expect(Math.hypot(s.points[0].x, s.points[0].y)).toBeLessThan(1e-9);
    expect(s.warning).toBeUndefined();
  });

  it("finds two isolated singular points: (t² - 1) dt + y dy = 0", () => {
    const r = firstOrderSingularities({ kind: "differential", M: "t^2 - 1", N: "y" }, box(-2, 2));
    expect(r.points.map((p) => Math.round(p.x * 1e6) / 1e6).sort()).toEqual([-1, 1]);
  });
});

describe("firstOrderEquilibria", () => {
  it("logistic dy/dt = y(1-y): y=0 unstable, y=1 stable", () => {
    const r = firstOrderEquilibria("y*(1-y)", { min: -1, max: 2 });
    expect(r.autonomous).toBe(true);
    expect(r.solutions).toHaveLength(2);
    expect(r.solutions[0].y).toBeCloseTo(0, 9);
    expect(r.solutions[0].stability).toBe("unstable");
    expect(r.solutions[1].y).toBeCloseTo(1, 9);
    expect(r.solutions[1].stability).toBe("stable");
  });

  it("accepts the differential form: (y^2 - 1) dt + 2 dy = 0 has y = ±1", () => {
    // dy/dt = -(y²-1)/2: above y = 1 the slope is negative -> approaches from above; below 1 (but
    // above -1) positive -> approaches from below: y = 1 stable. Around y = -1 the signs reverse.
    const r = firstOrderEquilibria({ kind: "differential", M: "y^2 - 1", N: "2" }, { min: -3, max: 3 });
    expect(r.solutions.map((s) => [Math.round(s.y * 1e9) / 1e9, s.stability])).toEqual([[-1, "unstable"], [1, "stable"]]);
  });

  it("finds constant solutions of non-autonomous equations: dy/dt = t(y-1)", () => {
    // M(t, c) = -t (c - 1) vanishes for every t only at c = 1; N = 1 != 0. The stability flips with
    // the sign of t, so it is reported as 'varies'.
    const r = firstOrderEquilibria("t*(y-1)", { min: -2, max: 3 }, { tRange: { min: -2, max: 2 } });
    expect(r.autonomous).toBe(false);
    expect(r.solutions).toHaveLength(1);
    expect(r.solutions[0].y).toBeCloseTo(1, 9);
    expect(r.solutions[0].stability).toBe("varies");
  });

  it("the deprecated xRange option still means the t range, and tRange wins when both are given", () => {
    const viaT = firstOrderEquilibria("t*(y-1)", { min: -2, max: 3 }, { tRange: { min: -2, max: 2 } });
    const viaX = firstOrderEquilibria("t*(y-1)", { min: -2, max: 3 }, { xRange: { min: -2, max: 2 } });
    expect(viaX).toEqual(viaT);
    // on t in [0.3, 2.5]: y > 1 gives dy/dt = t(y-1) > 0 (moves up, away), y < 1 gives dy/dt < 0
    // (moves down, away): unstable on the whole range, not 'varies' as on [-2, 2].
    const both = firstOrderEquilibria("t*(y-1)", { min: -2, max: 3 }, { tRange: { min: 0.3, max: 2.5 }, xRange: { min: -2, max: 2 } });
    expect(both.solutions.map((s) => s.stability)).toEqual(["unstable"]);
  });

  it("-2ty is not autonomous while y(1-y) is", () => {
    expect(firstOrderEquilibria("-2*t*y", { min: -2, max: 2 }, { tRange: { min: -2, max: 2 } }).autonomous).toBe(false);
    expect(firstOrderEquilibria("y*(1-y)", { min: -2, max: 2 }, { tRange: { min: -2, max: 2 } }).autonomous).toBe(true);
  });

  it("rejects a line where N vanishes: y dt + (y - 1) dy = 0 has no constant solution at y = 1", () => {
    // M(t, 1) = 1 != 0 anyway; and at y = 0, M = 0 but N = -1 != 0 -> y = 0 is a constant solution.
    const r = firstOrderEquilibria({ kind: "differential", M: "y", N: "y - 1" }, { min: -2, max: 2 });
    expect(r.solutions.map((s) => Math.round(s.y * 1e9) / 1e9)).toEqual([0]);
  });

  it("finds a tangential (semi-stable) equilibrium that is not a sample point: dy/dt = y²", () => {
    const r = firstOrderEquilibria("y^2", { min: -2.1, max: 2.05 });
    expect(r.solutions).toHaveLength(1);
    expect(Math.abs(r.solutions[0].y)).toBeLessThan(1e-4);
    expect(r.solutions[0].stability).toBe("semi_stable");
  });

  it("works with an irrational root: dy/dt = y² - 2", () => {
    const r = firstOrderEquilibria("y^2 - 2", { min: -3, max: 3 });
    expect(r.solutions.map((s) => s.y)).toEqual(expect.arrayContaining([expect.closeTo(-Math.SQRT2, 9), expect.closeTo(Math.SQRT2, 9)]));
    expect(r.solutions.find((s) => s.y < 0)?.stability).toBe("stable");
    expect(r.solutions.find((s) => s.y > 0)?.stability).toBe("unstable");
  });

  it("does not mistake a pole for an equilibrium: dy/dt = 1/y", () => {
    const r = firstOrderEquilibria("1/y", { min: -1, max: 1 });
    expect(r.solutions).toEqual([]);
  });

  it("reports a flat multiple root once: dy/dt = (y-1)^3 is unstable", () => {
    const r = firstOrderEquilibria("(y-1)^3", { min: -1, max: 3 });
    expect(r.solutions).toHaveLength(1);
    expect(Math.abs(r.solutions[0].y - 1)).toBeLessThan(1e-3);
    expect(r.solutions[0].stability).toBe("unstable");
  });

  it("a genuinely t-dependent right-hand side has no constant solutions: dy/dt = t - y", () => {
    const r = firstOrderEquilibria("t - y", { min: -2, max: 2 });
    expect(r.autonomous).toBe(false);
    expect(r.solutions).toEqual([]);
  });

  it("is not fooled by t-dependence that vanishes on nice t values", () => {
    const r = firstOrderEquilibria("y + t*(t-1)*(t+1)*(t-2.5)", { min: -2, max: 2 }, { tRange: { min: -3, max: 3 } });
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
  it("dy/dt = exp(-t) on [30, 40] has no constant solution although |g| < 1e-13 everywhere", () => {
    // M = -e^{-t} is never zero; the old absolute floor 1e-9 called every sampled y a root.
    const r = firstOrderEquilibria({ kind: "explicit", g: "exp(-t)" }, { min: -1, max: 1 }, { tRange: { min: 30, max: 40 } });
    expect(r.solutions).toEqual([]);
    expect(r.autonomous).toBe(false); // e^{-t} depends on t, however small it is
  });

  it("scaling an equation by 1e-12 changes neither its constant solutions nor its autonomy", () => {
    const a = firstOrderEquilibria({ kind: "explicit", g: "y*(1-y)" }, { min: -1, max: 2 }, { tRange: { min: -2, max: 2 } });
    const b = firstOrderEquilibria({ kind: "explicit", g: "1e-12*y*(1-y)" }, { min: -1, max: 2 }, { tRange: { min: -2, max: 2 } });
    expect(b.autonomous).toBe(true);
    expect(b.solutions.map((s) => [Math.round(s.y * 1e6) / 1e6, s.stability])).toEqual(a.solutions.map((s) => [Math.round(s.y * 1e6) / 1e6, s.stability]));
    const c = firstOrderEquilibria({ kind: "explicit", g: "1e-12*(t + y)" }, { min: -2, max: 2 }, { tRange: { min: -2, max: 2 } });
    expect(c.autonomous).toBe(false);
  });

  it("dy/dt = y/t: y = 0 is a constant solution on a box where a probe lands on t = 0 (review, dropped item)", () => {
    // M = -y/t is 0 on y = 0 for t ≠ 0 and undefined at t = 0; the undefined probe is skipped, not
    // held against the line. Solutions go away from y = 0 for t > 0 and towards it for t < 0: 'varies'.
    const r = firstOrderEquilibria({ kind: "explicit", g: "y/t" }, { min: -2, max: 2 }, { tRange: { min: -2, max: 2 } });
    expect(r.solutions).toHaveLength(1);
    expect(Math.abs(r.solutions[0].y)).toBeLessThan(1e-9);
    expect(r.solutions[0].stability).toBe("varies");
  });
});

describe("constant solutions through a singular point", () => {
  const spec = { kind: "differential" as const, M: "2*t*y", N: "t^2 + y^2" };

  it("y = 0 of 2ty dt + (t^2 + y^2) dy = 0 is found on a symmetric box and reported as 'varies'", () => {
    // Along y = 0: M = 0 and N = t^2 != 0 for t != 0, so dy = 0 holds on both sides of the singular
    // point (0, 0). Near the line the slope is -2ty/(t^2 + y^2) ~ -2y/t: attracting for t > 0,
    // repelling for t < 0. Before the fix the probe at t = 0 (the midpoint of a symmetric box)
    // rejected the whole line, so the answer flipped with the symmetry of the box.
    const r = firstOrderEquilibria(spec, { min: -2, max: 2 }, { tRange: { min: -2, max: 2 } });
    expect(r.solutions).toHaveLength(1);
    expect(Math.abs(r.solutions[0].y)).toBeLessThan(1e-9);
    expect(r.solutions[0].stability).toBe("varies");
  });

  it("is stable for t > 0 and unstable for t < 0", () => {
    expect(firstOrderEquilibria(spec, { min: -1, max: 1.2 }, { tRange: { min: 0.3, max: 2.5 } }).solutions.map((s) => s.stability)).toEqual(["stable"]);
    expect(firstOrderEquilibria(spec, { min: -1, max: 1.2 }, { tRange: { min: -2.5, max: -0.3 } }).solutions.map((s) => s.stability)).toEqual(["unstable"]);
  });

  it("a line where N vanishes identically is not a constant solution: y dt + y dy = 0", () => {
    // M = N = y: every point of y = 0 is singular; there is no direction field on that line at all.
    const r = firstOrderEquilibria({ kind: "differential", M: "y", N: "y" }, { min: -1, max: 1 }, { tRange: { min: -1, max: 1 } });
    expect(r.solutions).toEqual([]);
  });
});
