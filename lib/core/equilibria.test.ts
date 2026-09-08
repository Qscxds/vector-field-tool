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

describe("missed equilibria (J.1): adaptive seeds and the |F| local-minimum self-check", () => {
  it("x' = y, y' = -x - y + x^7 finds exactly three equilibria on [-10, 10]² and on [-3, 3]²", () => {
    // x^7 = x has the real roots 0, ±1 (x^6 = 1). Jacobian [[0, 1], [7x^6 - 1, -1]]:
    // at (0, 0): [[0, 1], [-1, -1]] -> trace -1, det 1, discriminant -3 -> stable spiral;
    // at (±1, 0): [[0, 1], [6, -1]] -> det -6 -> saddle. The old fixed 12x12 seed grid lost the
    // origin on the large box.
    for (const b of [box(-10, 10), box(-3, 3)]) {
      const r = findEquilibria(compileSystem({ f: "y", g: "-x - y + x^7" }), b);
      expect(r.points, JSON.stringify(b)).toHaveLength(3);
      expect(r.warning).toBeUndefined();
      const origin = r.points.find((p) => near(p.at, 0, 0))!;
      expect(origin.classification).toBe("stable_spiral");
      expect(origin.trace).toBeCloseTo(-1, 6);
      expect(origin.determinant).toBeCloseTo(1, 6);
      for (const s of [-1, 1]) {
        const saddle = r.points.find((p) => near(p.at, s, 0))!;
        expect(saddle.classification).toBe("saddle");
        expect(saddle.determinant).toBeCloseTo(-6, 5);
      }
    }
  });

  it("resolves two equilibria that are close relative to the box: f = x(x - 0.05), g = y on [-2, 2]²", () => {
    // Zeros (0, 0) and (0.05, 0). J = [[2x - 0.05, 0], [0, 1]]: eigenvalues -0.05, 1 -> saddle at
    // the origin; 0.05, 1 -> unstable node at (0.05, 0).
    const r = findEquilibria(compileSystem({ f: "x*(x - 0.05)", g: "y" }), box(-2, 2));
    expect(r.points).toHaveLength(2);
    expect(near(r.points[0].at, 0, 0)).toBe(true);
    expect(r.points[0].classification).toBe("saddle");
    expect(near(r.points[1].at, 0.05, 0)).toBe(true);
    expect(r.points[1].classification).toBe("unstable_node");
  });

  it("separation 1e-3 is still resolved: f = x(x - 0.001), g = y on [-2, 2]²", () => {
    // Both roots are simple, so Newton converges quadratically to whichever side it starts on
    // (a quadratic's Newton iteration is monotone from outside the roots), and the roots are
    // 1e-3 apart while duplicates are merged only within 1e-6 x (box size 4) = 4e-6. The
    // resolution limit of the search is that dedupe distance, not the seed spacing.
    const r = findEquilibria(compileSystem({ f: "x*(x - 0.001)", g: "y" }), box(-2, 2));
    expect(r.points).toHaveLength(2);
    expect(near(r.points[0].at, 0, 0)).toBe(true);
    expect(r.points[0].classification).toBe("saddle"); // eigenvalues -0.001, 1
    expect(near(r.points[1].at, 0.001, 0)).toBe(true);
    expect(r.points[1].classification).toBe("unstable_node"); // eigenvalues 0.001, 1
  });

  it("a nonlinear equilibrium in a corner of the box: f = sin(x - 9.9), g = (y - 9.9)(1 + (y - 9.9)²) on [-10, 10]²", () => {
    // g vanishes only at y = 9.9; f at x = 9.9 - kπ, k = 0..6 inside the box: seven equilibria,
    // (9.9, 9.9) in the corner among them. There J = diag(cos 0, 1 + 3·0²) = I: eigenvalue 1 twice
    // with two eigenvectors, a star node. classify(diag(1, 1)) itself gives star_node with no
    // caveat (exact scalar multiple of I). The FINITE-DIFFERENCE Jacobian is not exactly I: the
    // central difference of sin at step h = 1e-6·|p| ~ 1.4e-5 gives sin(h)/h = 1 - h²/6 and that
    // of u + u³ gives 1 + h², so the diagonal entries differ by ~2e-10, the discriminant is
    // ~5e-20 > 0 (inside the 1e-9 band but not zero), and the H2.8 rule attaches 'repeatedRoot'.
    const r = findEquilibria(compileSystem({ f: "sin(x - 9.9)", g: "(y - 9.9)*(1 + (y - 9.9)^2)" }), box(-10, 10));
    expect(r.points).toHaveLength(7);
    const corner = r.points.find((p) => near(p.at, 9.9, 9.9))!;
    expect(corner).toBeTruthy();
    expect(corner.classification).toBe("star_node");
    expect(corner.caveat).toBe("repeatedRoot");
    expect(corner.trace).toBeCloseTo(2, 8);
    expect(corner.determinant).toBeCloseTo(1, 8);
    for (let k = 0; k < 7; k++) expect(r.points.some((p) => near(p.at, 9.9 - k * Math.PI, 9.9))).toBe(true);
  });

  it("a root on the edge of the field's domain: x' = sqrt(x), y' = y on [-1, 2] x [-1, 1]", () => {
    // sqrt(x) is NaN for x < 0, so the only zero (0, 0) has the field defined on one side only.
    // No linearization exists there (the one-sided derivative of sqrt is infinite): classification
    // non_hyperbolic with the domainEdge caveat, and no eigenvalues.
    const r = findEquilibria(compileSystem({ f: "sqrt(x)", g: "y" }), { x: { min: -1, max: 2 }, y: { min: -1, max: 1 } });
    expect(r.points).toHaveLength(1);
    expect(near(r.points[0].at, 0, 0)).toBe(true);
    expect(r.points[0].classification).toBe("non_hyperbolic");
    expect(r.points[0].caveat).toBe("domainEdge");
    expect(r.points[0].eigenvalues).toEqual([]);
    expect(r.warning).toBeUndefined();
  });

  it("seed density follows the sign changes on the scan and is scale-free", () => {
    // sin(πx), sin(πy) on [-5, 5]²: the 64 scan cells per row straddle the zeros at the integers
    // -4..4 (±5 lie outside the range of cell centres): 9 sign changes -> 4 + 2·9 = 22 seeds per axis.
    const lattice = findEquilibria(compileSystem({ f: "sin(pi*x)", g: "sin(pi*y)" }), box(-5, 5), { maxPoints: 200 });
    expect(lattice.seeding.signChanges).toBe(9);
    expect(lattice.seeding.seedGrid).toBe(22);
    expect(lattice.points).toHaveLength(121); // integer pairs in [-5, 5]², edges included
    // An explicit seedGrid stays fixed.
    expect(findEquilibria(compileSystem({ f: "sin(pi*x)", g: "sin(pi*y)" }), box(-5, 5), { seedGrid: 12, maxPoints: 200 }).seeding.seedGrid).toBe(12);
    // No sign change at all: the minimum 12.
    expect(findEquilibria(compileSystem({ f: "1", g: "1" }), box(-1, 1)).seeding.seedGrid).toBe(12);
    // sin(20πx) on [-1, 1]: zeros at k/20 for k = -19..19 inside the centre range, one per gap
    // (gap 1/32 < 1/20): 39 sign changes -> 4 + 78 = 82, clamped to 32. The same equation in
    // other units (x in thousandths on [-1000, 1000]) samples the same sign pattern.
    expect(findEquilibria(compileSystem({ f: "sin(20*pi*x)", g: "1" }), box(-1, 1)).seeding.seedGrid).toBe(32);
    expect(findEquilibria(compileSystem({ f: "sin(20*pi*x/1000)", g: "1" }), box(-1000, 1000)).seeding).toEqual(
      findEquilibria(compileSystem({ f: "sin(20*pi*x)", g: "1" }), box(-1, 1)).seeding,
    );
  });

  it("the scan cap is reported, never silent: sin(12πx), sin(12πy) on [-1, 1]²", () => {
    // Roots at (k/12, m/12), k, m = -12..12: 625 equilibria. The 23 interior zeros per axis
    // (k = -11..11) each give at least one |F| local minimum on the 64x64 scan (a tie between
    // two cells counts twice), so >= 23² = 529 candidates against the cap of 400.
    const r = findEquilibria(compileSystem({ f: "sin(12*pi*x)", g: "sin(12*pi*y)" }), box(-1, 1));
    expect(r.seeding.candidates).toBeGreaterThanOrEqual(529);
    expect(r.seeding.seeds).toBe(400);
    expect(r.seeding.capped).toBe(true);
    expect(r.warning).toBe("hit_limit");
    expect(r.points).toHaveLength(30);
  });
});
