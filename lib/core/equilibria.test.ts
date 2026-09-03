import { describe, expect, it } from "vitest";
import { collinearity, curveLikeFraction, findEquilibria } from "./equilibria";
import { compileSystem } from "./parse";

const box = (a: number, b: number) => ({ x: { min: a, max: b }, y: { min: a, max: b } });
const near = (p: { x: number; y: number }, x: number, y: number, eps = 1e-7) => Math.hypot(p.x - x, p.y - y) < eps;

describe("findEquilibria", () => {
  it("Lotka-Volterra x'=x-xy, y'=xy-y: exactly (0,0) saddle and (1,1) centre-or-weak-spiral", () => {
    const lv = compileSystem({ f: "x - x*y", g: "x*y - y" });
    const r = findEquilibria(lv, box(-0.5, 3));
    expect(r.warning).toBeUndefined();
    expect(r.points).toHaveLength(2);
    const origin = r.points.find((p) => near(p.at, 0, 0));
    const coexist = r.points.find((p) => near(p.at, 1, 1));
    expect(origin?.classification).toBe("saddle");
    expect(coexist?.classification).toBe("center_or_weak_spiral");
    expect(coexist?.caveat).toBeTruthy();
    expect(coexist?.jacobian[0][1]).toBeCloseTo(-1, 6);
    expect(coexist?.jacobian[1][0]).toBeCloseTo(1, 6);
  });

  it("harmonic oscillator: only the origin, honestly classified", () => {
    const r = findEquilibria(compileSystem({ f: "y", g: "-x" }), box(-2, 2));
    expect(r.points).toHaveLength(1);
    expect(near(r.points[0].at, 0, 0)).toBe(true);
    expect(r.points[0].classification).toBe("center_or_weak_spiral");
  });

  it("damped oscillator: the origin is a stable spiral", () => {
    const r = findEquilibria(compileSystem({ f: "y", g: "-x - 0.5*y" }), box(-2, 2));
    expect(r.points).toHaveLength(1);
    expect(r.points[0].classification).toBe("stable_spiral");
  });

  it("finds several isolated equilibria: x'=x²-1, y'=y", () => {
    const r = findEquilibria(compileSystem({ f: "x^2 - 1", g: "y" }), box(-2, 2));
    expect(r.warning).toBeUndefined();
    expect(r.points).toHaveLength(2);
    // sorted by x
    expect(near(r.points[0].at, -1, 0)).toBe(true);
    expect(r.points[0].classification).toBe("saddle"); // J = diag(-2, 1)
    expect(near(r.points[1].at, 1, 0)).toBe(true);
    expect(r.points[1].classification).toBe("unstable_node"); // J = diag(2, 1)
  });

  it("reports none_found when the field never vanishes (f=1, g=1)", () => {
    const r = findEquilibria(compileSystem({ f: "1", g: "1" }), box(-1, 1));
    expect(r.points).toEqual([]);
    expect(r.warning).toBe("none_found");
  });

  it("reports none_found for complex-only roots (f=x²+1) without throwing", () => {
    const r = findEquilibria(compileSystem({ f: "x^2 + 1", g: "y" }), box(-3, 3));
    expect(r.warning).toBe("none_found");
  });

  it("drops equilibria outside the box", () => {
    const r = findEquilibria(compileSystem({ f: "x - 5", g: "y" }), box(-1, 1));
    expect(r.warning).toBe("none_found");
  });

  it("flags a continuum (f=0, g=-y: the whole x-axis) and truncates", () => {
    const r = findEquilibria(compileSystem({ f: "0", g: "-y" }), box(-1, 1), { maxPoints: 5 });
    expect(r.warning).toBe("possible_continuum");
    expect(r.points.length).toBeGreaterThan(0);
    expect(r.points.length).toBeLessThanOrEqual(5);
    for (const p of r.points) {
      expect(Math.abs(p.at.y)).toBeLessThan(1e-6);
      expect(p.classification).toBe("non_hyperbolic");
    }
  });

  it("flags hit_limit for many isolated equilibria (sin(πx), sin(πy) lattice)", () => {
    const r = findEquilibria(compileSystem({ f: "sin(pi*x)", g: "sin(pi*y)" }), box(-3.5, 3.5), { maxPoints: 10 });
    expect(r.warning).toBe("hit_limit");
    expect(r.points).toHaveLength(10);
    for (const p of r.points) {
      expect(Math.abs(p.at.x - Math.round(p.at.x))).toBeLessThan(1e-7);
      expect(Math.abs(p.at.y - Math.round(p.at.y))).toBeLessThan(1e-7);
      expect(p.classification).not.toBe("non_hyperbolic");
    }
  });

  it("reports an isolated non-hyperbolic equilibrium once, honestly (x'=x², y'=-y)", () => {
    // The only zero is (0,0) with J = [[0,0],[0,-1]]: one eigenvalue is 0. A residual-only Newton
    // would stop at x ~ ±sqrt(tol) and report several 'saddles' / 'nodes' instead.
    const r = findEquilibria(compileSystem({ f: "x^2", g: "-y" }), box(-2, 2));
    expect(r.points).toHaveLength(1);
    expect(near(r.points[0].at, 0, 0, 1e-6)).toBe(true);
    expect(r.points[0].classification).toBe("non_hyperbolic");
    expect(r.points[0].caveat).toBeTruthy();
    expect(r.warning).toBeUndefined();
  });

  it("keeps an equilibrium that lies exactly on the box edge", () => {
    const r = findEquilibria(compileSystem({ f: "x - 1", g: "y" }), box(-1, 1));
    expect(r.points).toHaveLength(1);
    expect(near(r.points[0].at, 1, 0)).toBe(true);
    // J = identity: eigenvalue 1 twice with two eigenvectors -> star node (unstable).
    expect(r.points[0].classification).toBe("star_node");
    expect(r.points[0].trace).toBeCloseTo(2, 6);
  });

  it("locates a centre precisely enough that its trace really is zero to tolerance", () => {
    // Lotka-Volterra at (1,1): tr(J) = (1-y) + (x-1) = x - y is exactly the location error.
    const r = findEquilibria(compileSystem({ f: "x - x*y", g: "x*y - y" }), box(-0.5, 3), { tol: 1e-6 });
    const coexist = r.points.find((p) => near(p.at, 1, 1, 1e-6))!;
    expect(Math.abs(coexist.trace)).toBeLessThan(1e-9);
    expect(coexist.classification).toBe("center_or_weak_spiral");
  });

  it("survives singular fields (1/x) without throwing", () => {
    const r = findEquilibria(compileSystem({ f: "1/x", g: "y" }), box(-1, 1));
    expect(r.warning).toBe("none_found");
  });

  it("is deterministic", () => {
    const sys = compileSystem({ f: "y", g: "(1 - x^2)*y - x" });
    const a = findEquilibria(sys, box(-3, 3));
    const b = findEquilibria(sys, box(-3, 3));
    expect(a).toEqual(b);
    expect(a.points).toHaveLength(1);
    expect(a.points[0].classification).toBe("unstable_spiral");
  });

  it("rejects an invalid box or seed grid", () => {
    const sys = compileSystem({ f: "x", g: "y" });
    expect(() => findEquilibria(sys, { x: { min: 1, max: 0 }, y: { min: 0, max: 1 } })).toThrow(RangeError);
    expect(() => findEquilibria(sys, box(-1, 1), { seedGrid: 0 })).toThrow(RangeError);
  });
});

describe("continuum needs a geometric criterion, not just a count (H2.7)", () => {
  it("collinearity: 0 for points on a line, ~1 for a square, in between for a scattered cloud", () => {
    expect(collinearity([{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }, { x: -3, y: -6 }])).toBeLessThan(1e-30);
    expect(collinearity([{ x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }])).toBeCloseTo(1, 12);
    expect(collinearity([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBeNaN();
  });

  it("curveLikeFraction: 1 on a densely sampled circle, 0 for four isolated points", () => {
    // 60 points on a unit circle: any 5 consecutive points span 24° -> covariance ratio ~ θ²/60 ≈ 0.003.
    const circle = Array.from({ length: 60 }, (_, i) => ({ x: Math.cos((2 * Math.PI * i) / 60), y: Math.sin((2 * Math.PI * i) / 60) }));
    expect(curveLikeFraction(circle)).toBe(1);
    expect(curveLikeFraction([{ x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }])).toBe(0);
  });

  it("f = 0, g = -y (the whole x-axis) is a continuum: many non-hyperbolic points AND collinear", () => {
    const r = findEquilibria(compileSystem({ f: "0", g: "-y" }), box(-1, 1));
    expect(r.warning).toBe("possible_continuum");
    expect(r.geometry!.collinearity).toBeLessThan(1e-6);
    expect(r.geometry!.connected).toBeGreaterThanOrEqual(0.8);
  });

  it("a circle of equilibria, x' = x(1 - x² - y²), y' = y(1 - x² - y²), is a continuum by the curve test", () => {
    // Every point of the unit circle is an equilibrium (the Jacobian there has a zero eigenvalue
    // along the circle); the origin is an isolated unstable star node.
    const r = findEquilibria(compileSystem({ f: "x*(1 - x^2 - y^2)", g: "y*(1 - x^2 - y^2)" }), box(-2, 2));
    expect(r.warning).toBe("possible_continuum");
    expect(r.geometry!.collinearity).toBeGreaterThan(0.1); // a circle is not a line
    expect(r.geometry!.curveLike).toBeGreaterThanOrEqual(0.8);
    const onCircle = r.points.filter((p) => Math.abs(Math.hypot(p.at.x, p.at.y) - 1) < 1e-6);
    expect(onCircle.length).toBeGreaterThanOrEqual(6);
    for (const p of onCircle) expect(p.classification).toBe("non_hyperbolic");
  });

  it("isolated double roots that happen to be collinear are NOT a continuum: the field is non-zero between them (review C5)", () => {
    // f = sin(πx)², g = y: double roots at every integer x on the x-axis, all non-hyperbolic and
    // exactly collinear, yet f = 1 at the midpoints. Seven of them on [-3.5, 3.5].
    const r = findEquilibria(compileSystem({ f: "sin(pi*x)^2", g: "y" }), box(-3.5, 3.5));
    expect(r.points).toHaveLength(7);
    for (const p of r.points) expect(p.classification).toBe("non_hyperbolic");
    expect(r.warning).toBe("multiple_non_hyperbolic");
    expect(r.geometry!.collinearity).toBeLessThan(1e-6);
    expect(r.geometry!.connected).toBeLessThan(0.2);
    // three collinear double roots: f = (x³ - x)², g = y
    const r3 = findEquilibria(compileSystem({ f: "(x^3 - x)^2", g: "y" }), box(-2, 2));
    expect(r3.points).toHaveLength(3);
    expect(r3.warning).toBe("multiple_non_hyperbolic");
  });

  it("a multiple root is one equilibrium, not a cluster mistaken for a continuum (review C3)", () => {
    // x' = -x³, y' = -y: the origin is the only zero (a degenerate, actually stable, equilibrium).
    // Newton converges only linearly there (x -> 2x/3); the old LM step was so small that it
    // passed the step-convergence test a few 1e-6 from the root, and different seeds stopped at
    // different places: 2-3 'equilibria' plus a 'possible_continuum'.
    for (const b of [box(-2, 2), box(-0.5, 0.5), box(-10, 10)]) {
      const r = findEquilibria(compileSystem({ f: "-x^3", g: "-y" }), b);
      expect(r.points, JSON.stringify(b)).toHaveLength(1);
      expect(near(r.points[0].at, 0, 0, 1e-9)).toBe(true);
      expect(r.points[0].classification).toBe("non_hyperbolic");
      expect(r.warning).toBeUndefined();
    }
    const quartic = findEquilibria(compileSystem({ f: "x^4", g: "-y" }), box(-2, 2));
    expect(quartic.points).toHaveLength(1);
    expect(quartic.warning).toBeUndefined();
    const octic = findEquilibria(compileSystem({ f: "x^8", g: "-y" }), box(-2, 2));
    expect(octic.points).toHaveLength(1);
    expect(octic.warning).toBeUndefined();
  });

  it("an O(1) saddle stays a saddle on a huge box (review C4)", () => {
    // x' = y, y' = -x - y + x^7: equilibria at x^7 = x, i.e. 0, ±1. At (1, 0): J = [[0, 1], [6, -1]],
    // det = -6: a saddle. The median field magnitude over a [-100, 100]² box is enormous, which
    // used to declare this Jacobian zero.
    const r = findEquilibria(compileSystem({ f: "y", g: "-x - y + x^7" }), box(-100, 100));
    const saddle = r.points.find((p) => near(p.at, 1, 0, 1e-6));
    expect(saddle).toBeTruthy();
    expect(saddle!.classification).toBe("saddle");
    expect(saddle!.determinant).toBeCloseTo(-6, 4);
  });

  it("four isolated degenerate equilibria that are not collinear are NOT a continuum", () => {
    // f = (x² - 1)², g = (y² - 1)²: zeros exactly at (±1, ±1), each with J = 0 (double roots in
    // both variables), so all four are non-hyperbolic: the counting rule fires, the geometry does not.
    const r = findEquilibria(compileSystem({ f: "(x^2 - 1)^2", g: "(y^2 - 1)^2" }), box(-2, 2));
    expect(r.points).toHaveLength(4);
    for (const p of r.points) {
      expect(Math.abs(Math.abs(p.at.x) - 1)).toBeLessThan(1e-6);
      expect(Math.abs(Math.abs(p.at.y) - 1)).toBeLessThan(1e-6);
      expect(p.classification).toBe("non_hyperbolic");
    }
    expect(r.warning).toBe("multiple_non_hyperbolic");
    expect(r.geometry!.collinearity).toBeGreaterThan(0.5);
    expect(r.geometry!.curveLike).toBe(0);
  });
});
