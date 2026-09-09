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
    expect(r.truncated).toBe(true);
    expect(r.warning).toBe("hit_limit");
    expect(r.points).toHaveLength(30);
  });
});

describe("connected components before the continuum test (J.5a)", () => {
  it("two parallel lines of equilibria are two continuum components: x' = 0, y' = y² - 1", () => {
    // Every point of y = 1 and of y = -1 is an equilibrium, J = diag(0, 2y) there (det 0).
    const r = findEquilibria(compileSystem({ f: "0", g: "y^2 - 1" }), box(-2, 2));
    expect(r.warning).toBe("possible_continuum");
    expect(r.geometry!.components).toBe(2);
    expect(r.geometry!.continuumComponents).toBe(2);
    for (const p of r.points) {
      expect(Math.abs(Math.abs(p.at.y) - 1)).toBeLessThan(1e-6);
      expect(p.classification).toBe("non_hyperbolic");
    }
  });

  it("the x-axis is one component: x' = 0, y' = y", () => {
    const r = findEquilibria(compileSystem({ f: "0", g: "y" }), box(-2, 2));
    expect(r.warning).toBe("possible_continuum");
    expect(r.geometry!.components).toBe(1);
    expect(r.geometry!.continuumComponents).toBe(1);
  });

  it("four isolated degenerate points are four components of one point each: (x² - 1)², (y² - 1)²", () => {
    const r = findEquilibria(compileSystem({ f: "(x^2 - 1)^2", g: "(y^2 - 1)^2" }), box(-2, 2));
    expect(r.points).toHaveLength(4);
    expect(r.warning).toBe("multiple_non_hyperbolic");
    expect(r.geometry!.components).toBe(4);
    expect(r.geometry!.continuumComponents).toBe(0);
    expect(r.geometry!.connected).toBe(0);
  });

  it("a circle of equilibria sampled unevenly is still one component (spanning-tree edges)", () => {
    const r = findEquilibria(compileSystem({ f: "x*(1 - x^2 - y^2)", g: "y*(1 - x^2 - y^2)" }), box(-2, 2));
    expect(r.warning).toBe("possible_continuum");
    expect(r.geometry!.components).toBe(1);
    expect(r.geometry!.continuumComponents).toBe(1);
  });
});

describe("independent truncated flag (J.5b)", () => {
  it("more isolated hyperbolic equilibria than maxPoints: truncated with warning hit_limit", () => {
    // sin(πx), sin(πy) on [-5, 5]²: 121 integer pairs, each with J = diag(±π, ±π): all hyperbolic,
    // so there is neither a continuum nor multiple_non_hyperbolic; the only thing to say is the cap.
    const r = findEquilibria(compileSystem({ f: "sin(pi*x)", g: "sin(pi*y)" }), box(-5, 5), { maxPoints: 10 });
    expect(r.truncated).toBe(true);
    expect(r.warning).toBe("hit_limit");
    expect(r.points).toHaveLength(10);
    expect(r.geometry).toBeUndefined();
  });

  it("a truncated continuum keeps its geometric warning: x' = 0, y' = y with maxPoints 3", () => {
    const r = findEquilibria(compileSystem({ f: "0", g: "y" }), box(-2, 2), { maxPoints: 3 });
    expect(r.truncated).toBe(true);
    expect(r.warning).toBe("possible_continuum");
    expect(r.points).toHaveLength(3);
    // The verdict was made on all points found, not on the three listed.
    expect(r.geometry!.continuumComponents).toBe(1);
  });

  it("is absent when nothing was cut", () => {
    const r = findEquilibria(compileSystem({ f: "x^2 - 1", g: "y" }), box(-2, 2));
    expect(r.truncated).toBeUndefined();
    expect(r.warning).toBeUndefined();
  });
});

describe("ill-scaled linear systems through findEquilibria (J.5c)", () => {
  it("x' = 1e10 x, y' = -y is a saddle with eigenvalues 1e10 and -1", () => {
    // Only the origin. J = diag(1e10, -1). The Jacobian's error at the origin is dominated by the
    // rounding term 4 eps |f| / (2h) with |f| = 1e10 · 1e-6 = 1e4 and h = 1e-6: ~4.4e-6, times the
    // 10x margin: e ~ 4.4e-5. |det| = 1e10 against e (|a| + |d|) ~ 4.4e5: resolvable, not zero.
    // The relative rule would have called |det| / scale² = 1e-10 zero and hidden the eigenvalue -1.
    // The small eigenvalue comes out of the normalized matrix as (tr - sqrt(disc)) / 2 with
    // absolute rounding ~1e-16, i.e. ~1e-6 relative once multiplied back by 1e10.
    const r = findEquilibria(compileSystem({ f: "1e10*x", g: "-y" }), box(-1, 1));
    expect(r.points).toHaveLength(1);
    expect(r.points[0].classification).toBe("saddle");
    expect(r.points[0].caveat).toBeUndefined();
    const eig = r.points[0].eigenvalues.map((e) => e.re).sort((a, b) => a - b);
    expect(Math.abs(eig[1] / 1e10 - 1)).toBeLessThan(1e-9);
    expect(Math.abs(eig[0] + 1)).toBeLessThan(1e-5);
  });

  it("x' = 1e10 x, y' = 1e-10 y: with per-entry errors the 1e-10 eigenvalue is resolved (review J item 6)", () => {
    // J = diag(1e10, 1e-10). Per-entry errors: e_a ~ 4.4e-6 (rounding of |f| = 1e4 on the x
    // stencil at h = 1e-6), e_d ~ 4.4e-26 (|g| = 1e-16 on the y stencil), e_b = e_c = 0 (f does
    // not depend on y, g not on x), times the 10x margin. err(det) = e_a |d| + e_d |a| ~ 4.4e-15 +
    // 4.4e-15 << det = 1: resolved. tr > 0, disc = (a - d)² > 0: real, both positive -> unstable
    // node with eigenvalues 1e10 and det / 1e10 = 1e-10. (Under the old single error e = 4.4e-5 for
    // all four entries, e (|a| + |d|) ~ 4.4e5 > 1 hid the determinant and the point was reported
    // non_hyperbolic; that expectation was derived from the coarser error model.)
    const r = findEquilibria(compileSystem({ f: "1e10*x", g: "1e-10*y" }), box(-1, 1));
    expect(r.points).toHaveLength(1);
    expect(r.points[0].classification).toBe("unstable_node");
    expect(r.points[0].caveat).toBeUndefined();
    const eig = r.points[0].eigenvalues.map((e) => e.re).sort((a, b) => a - b);
    expect(eig[1] / 1e10).toBeCloseTo(1, 9);
    expect(eig[0] / 1e-10).toBeCloseTo(1, 6);
  });

  it("a genuine centre and a double root keep their honest verdicts", () => {
    expect(findEquilibria(compileSystem({ f: "y", g: "-x" }), box(-2, 2)).points[0].classification).toBe("center_or_weak_spiral");
    const r = findEquilibria(compileSystem({ f: "(x^2 - 1)^2", g: "(y^2 - 1)^2" }), box(-2, 2));
    for (const p of r.points) expect(p.classification).toBe("non_hyperbolic");
  });
});

describe("local acceptance, ill-scaled solve, resolution dedupe, vanishing test (review J items 1, 3, 7, 8)", () => {
  const offsetBox = { x: { min: -1, max: 3 }, y: { min: -2, max: 2 } };

  it("J.1: a field that never vanishes has no equilibria on any box or scale: x' = y, y' = x⁸ + 1", () => {
    // x⁸ + 1 >= 1 everywhere, so F has no zero. The old residual tolerance tol × median|F| over
    // the box grew like 100⁸ and accepted |F| = 1 as zero on [-100, 100]² (14 "equilibria").
    for (const b of [box(-10, 10), box(-100, 100), box(-1000, 1000), offsetBox]) {
      for (const s of ["1", "1e-6", "1e6"]) {
        const r = findEquilibria(compileSystem({ f: `${s}*y`, g: `${s}*(x^8 + 1)` }), b);
        expect(r.points, `${s} ${JSON.stringify(b)}`).toEqual([]);
        expect(r.warning).toBe("none_found");
        expect(r.singularPoints).toBeUndefined();
      }
    }
    // f >= 1 everywhere: same, and no hit_limit from 30 false points.
    const r = findEquilibria(compileSystem({ f: "x^2 + y^2 + 1", g: "x^8" }), box(-100, 100));
    expect(r.points).toEqual([]);
    expect(r.warning).toBe("none_found");
  });

  it("J.3: an ill-scaled but invertible linear system has its one equilibrium: x' = 1e8 x + y, y' = -x + 1e-8 y", () => {
    // det J = 1e8 · 1e-8 + 1 = 2 ≠ 0: the origin is the unique zero. The old singularity test
    // |det| > 1e-10 ||J||² (= 1e6) sent every seed to the LM branch, whose normal equations lose
    // the 1 in JᵀJ = 1e16 + 1 and produce a garbage step. Same on every box and scale.
    for (const b of [box(-1, 1), box(-1000, 1000), offsetBox]) {
      for (const s of ["1", "1e-6", "1e6"]) {
        const r = findEquilibria(compileSystem({ f: `${s}*(1e8*x + y)`, g: `${s}*(-x + 1e-8*y)` }), b);
        expect(r.points, `${s} ${JSON.stringify(b)}`).toHaveLength(1);
        expect(near(r.points[0].at, 0, 0, 1e-9)).toBe(true);
      }
    }
    // 1e6 variant: tr = 1e6 + 1e-6, det = 2, disc = tr² - 8 > 0: real eigenvalues ~1e6 and ~2e-6,
    // both positive -> unstable node; the entry error (~2e-9 from the 1e6 entry) times the entry
    // sum (~1e6) is ~2e-3 < det = 2, so the determinant is resolved.
    const r6 = findEquilibria(compileSystem({ f: "1e6*x + y", g: "-x + 1e-6*y" }), box(-1, 1));
    expect(r6.points).toHaveLength(1);
    expect(r6.points[0].classification).toBe("unstable_node");
    expect(r6.points[0].determinant).toBeCloseTo(2, 3);
  });

  it("J.3/J.6: the 1e8 variant is an unstable node with eigenvalues ~1e8 and ~2e-8 (per-entry Jacobian errors)", () => {
    // tr = 1e8 + 1e-8, det = 2: eigenvalues ~1e8 and det / 1e8 = 2e-8, both positive -> unstable
    // node. A single error for all entries (~4e-7 from the 1e8 entry, with the 10x margin) put
    // the determinant 2 below e (|a| + |b| + |c| + |d|) ~ 40; per entry, err(det) = e_a |d| +
    // e_d |a| + e_b |c| + e_c |b| ~ 4e-15 (e_a 4.4e-7 · 1e-8, e_d 4.4e-23 · 1e8, e_b, e_c ~ 4e-15).
    for (const b of [box(-1, 1), box(-1000, 1000), offsetBox]) {
      for (const s of ["1", "1e-6", "1e6"]) {
        const r = findEquilibria(compileSystem({ f: `${s}*(1e8*x + y)`, g: `${s}*(-x + 1e-8*y)` }), b);
        expect(r.points, `${s} ${JSON.stringify(b)}`).toHaveLength(1);
        expect(r.points[0].classification).toBe("unstable_node");
        expect(r.points[0].caveat).toBeUndefined();
        const eig = r.points[0].eigenvalues.map((e) => e.re / Number(s)).sort((u, v) => u - v);
        expect(eig[1] / 1e8).toBeCloseTo(1, 6);
        expect(eig[0] / 2e-8).toBeCloseTo(1, 3);
      }
    }
  });

  it("J.3: the saddles of x' = y, y' = -x - y + x⁷ survive a huge box (det J ~ 1e14 at the scan seeds)", () => {
    // At (±1, 0): J = [[0, 1], [6, -1]], det -6 -> saddle. At a scan seed x ~ 156, det J = 7x⁶ - 1
    // ~ 1e14 < 1e-10 (1e14)², which the old test called singular; the row-scaled test does not.
    for (const b of [box(-1e4, 1e4), box(-1e6, 1e6)]) {
      const r = findEquilibria(compileSystem({ f: "y", g: "-x - y + x^7" }), b);
      for (const s of [-1, 1]) {
        const saddle = r.points.find((p) => near(p.at, s, 0, 1e-6));
        expect(saddle, `${s} ${JSON.stringify(b)}`).toBeTruthy();
        expect(saddle!.classification).toBe("saddle");
        expect(saddle!.determinant).toBeCloseTo(-6, 4);
      }
    }
  });

  it("J.7: two simple roots 1e-3 apart are two equilibria on every box and scale: x' = x(x - 1e-3), y' = y", () => {
    // Zeros (0, 0) and (1e-3, 0); J = diag(2x - 1e-3, 1): eigenvalues -1e-3, 1 (saddle) and
    // 1e-3, 1 (unstable node). Newton locates each to ~1e-13 × box; the old merge radius
    // 1e-6 × box folded them into one on [-2000, 2000]² (radius 4e-3 > 1e-3).
    for (const b of [box(-2, 2), box(-200, 200), box(-2000, 2000), offsetBox]) {
      for (const s of ["1", "1e-6", "1e6"]) {
        const r = findEquilibria(compileSystem({ f: `${s}*x*(x - 1e-3)`, g: `${s}*y` }), b);
        expect(r.points, `${s} ${JSON.stringify(b)}`).toHaveLength(2);
        expect(near(r.points[0].at, 0, 0, 1e-9)).toBe(true);
        expect(r.points[0].classification).toBe("saddle");
        expect(near(r.points[1].at, 1e-3, 0, 1e-9)).toBe(true);
        expect(r.points[1].classification).toBe("unstable_node");
        expect(r.warning).toBeUndefined();
      }
    }
    const r4 = findEquilibria(compileSystem({ f: "x*(x - 1e-4)", g: "y" }), box(-100, 100));
    expect(r4.points).toHaveLength(2);
    expect(near(r4.points[1].at, 1e-4, 0, 1e-9)).toBe(true);
  });

  it("J.7: one root reached from many seeds is still listed once (simple and multiple)", () => {
    // Every seed of the harmonic oscillator converges to the origin in one Newton step.
    for (const b of [box(-2, 2), box(-2000, 2000), offsetBox]) {
      expect(findEquilibria(compileSystem({ f: "y", g: "-x" }), b).points).toHaveLength(1);
      // x⁸: a multiple root approached only linearly (ratio 7/8); each run's claimed radius is its
      // geometric tail, and the runs from both sides overlap.
      expect(findEquilibria(compileSystem({ f: "x^8", g: "-y" }), b).points).toHaveLength(1);
    }
  });

  it("J.8: a direction-dependent singularity is not an equilibrium: x' = xy / (x² + y²), y' = y - x", () => {
    // F has no zero (f = 0 needs an axis, g = 0 needs y = x) and is undefined at the origin, where
    // its limit depends on the direction: 0 along the axes, f = 1/2 along the diagonals. Newton
    // crawls to the origin along the x-axis (|F| -> 0 there) and used to report it as an
    // equilibrium. The vanishing test finds |F(p + δe) - F(p)| ~ δ⁰ along the diagonals, over
    // the offsets between the search's location resolution (stepTol) and 1e3 stepTol: the runs
    // that crawled toward the origin stall at various distances from it (2e-15 up the y-axis,
    // 8e-12 on the anti-diagonal on [-2, 2]²), all inside that window, and are reported once.
    for (const s of ["1", "1e-6", "1e6"]) {
      for (const b of [box(-10, 10), box(-2, 2), box(-1, 1)]) {
        const r = findEquilibria(compileSystem({ f: `${s}*x*y/(x^2 + y^2)`, g: `${s}*(y - x)` }), b);
        expect(r.points, `${s} ${JSON.stringify(b)}`).toEqual([]);
        expect(r.warning).toBe("none_found");
        expect(r.singularPoints).toHaveLength(1);
        expect(Math.hypot(r.singularPoints![0].x, r.singularPoints![0].y)).toBeLessThan(1e-9);
      }
    }
    // The same singularity moved to (1, 1) on an offset box.
    const moved = findEquilibria(compileSystem({ f: "(x - 1)*(y - 1)/((x - 1)^2 + (y - 1)^2)", g: "y - x" }), { x: { min: 0, max: 3 }, y: { min: -1, max: 2 } });
    expect(moved.points).toEqual([]);
    expect(moved.singularPoints).toHaveLength(1);
    expect(near(moved.singularPoints![0], 1, 1, 1e-9)).toBe(true);
    // On a big box no equilibrium either (the verdict never depends on the box).
    const big = findEquilibria(compileSystem({ f: "x*y/(x^2 + y^2)", g: "y - x" }), box(-1000, 1000));
    expect(big.points).toEqual([]);
    expect(big.warning).toBe("none_found");
  });

  it("J.8: the singular point is also reported on [-1000, 1000]²", () => {
    // A run stalls on the anti-diagonal 6.6e-10 from the origin (3.3 stepTol, stepTol = 2e-10):
    // the vanishing test's window [stepTol, 1e3 stepTol] straddles the origin along that line.
    const big = findEquilibria(compileSystem({ f: "x*y/(x^2 + y^2)", g: "y - x" }), box(-1000, 1000));
    expect(big.points).toEqual([]);
    expect(big.singularPoints).toHaveLength(1);
    expect(Math.hypot(big.singularPoints![0].x, big.singularPoints![0].y)).toBeLessThan(1e-9);
  });

  it.fails("J.8: the singular point is also reported on [-100, 100]² (open: no run stalls within the vanishing window of the origin there)", () => {
    // On [-100, 100]² every run that heads for the origin stalls on the diagonal y = x, where
    // |F| = 1/2 is a local minimum, or too far from the origin for the window
    // [stepTol, 1e3 stepTol] = [2e-11, 2e-8] to straddle it, so there is nothing to submit to
    // the vanishing test: whether the singular point is listed still depends on where the seeds
    // stall (review J item 4's seeding does not reach it). Recorded, not hidden.
    const b = findEquilibria(compileSystem({ f: "x*y/(x^2 + y^2)", g: "y - x" }), box(-100, 100));
    expect(b.points).toEqual([]);
    expect(b.singularPoints).toHaveLength(1);
  });

  it("J.8: a genuine root next to a pole stays an equilibrium: x' = x(x - 1)/(x - 0.01), y' = y", () => {
    // Zeros x = 0 and x = 1, a pole at x = 0.01. f'(0) = (-1)(-0.01) / 0.01² = 100 and f'(1) =
    // 0.99 / 0.99² = 1/0.99: J = diag(100, 1) and diag(1.0101, 1), both unstable nodes with
    // distinct eigenvalues. F is continuous at both roots, so the vanishing test keeps them.
    for (const s of ["1", "1e-6", "1e6"]) {
      const r = findEquilibria(compileSystem({ f: `${s}*x*(x - 1)/(x - 0.01)`, g: `${s}*y` }), box(-2, 2));
      expect(r.points, s).toHaveLength(2);
      expect(near(r.points[0].at, 0, 0, 1e-9)).toBe(true);
      expect(r.points[0].classification).toBe("unstable_node");
      expect(r.points[0].jacobian[0][0] / Number(s)).toBeCloseTo(100, 3);
      expect(near(r.points[1].at, 1, 0, 1e-9)).toBe(true);
      expect(r.points[1].classification).toBe("unstable_node");
      expect(r.singularPoints).toBeUndefined();
    }
  });
});

describe("rank-one steps, sign-change quadtree, domain-edge lines, error-based bands (review J items 2, 4, 5, 6, 9)", () => {
  const offsetBox = { x: { min: -1, max: 3 }, y: { min: -2, max: 2 } };
  const skewBox = { x: { min: -1.3, max: 2.1 }, y: { min: -0.7, max: 1.9 } };
  const onAxis = (p: { x: number; y: number }) => Math.min(Math.abs(p.x), Math.abs(p.y)) <= 1e-9 * Math.max(1, Math.hypot(p.x, p.y));

  it("J.2: the SI model x' = -xy, y' = xy has both axes as equilibria: a continuum (one connected cross) on every box and scale", () => {
    // F = xy (-1, 1) vanishes exactly on {xy = 0}: the two axes, which meet at the origin, so the
    // equilibrium set is ONE connected continuum (the connectedness relation "the field vanishes
    // between neighbours" joins the two axes through the origin). J = [[-y, -x], [y, x]] has
    // det = 0 everywhere: every point is non-hyperbolic. The rank-one Jacobian used to send every
    // Newton run to the origin (the Marquardt-scaled step is -(x, y) / 2); the pseudo-inverse step
    // -h ∇h / |∇h|² lands on the nearest axis. Same for x' = xy, y' = 0.
    for (const [f, g] of [["-x*y", "x*y"], ["x*y", "0"]]) {
      for (const b of [box(-2, 2), offsetBox, skewBox, box(-200, 200)]) {
        for (const s of ["1", "1e-6", "1e6"]) {
          const r = findEquilibria(compileSystem({ f: `${s}*(${f})`, g: `${s}*(${g})` }), b, { maxPoints: 200 });
          const label = `${f} ${s} ${JSON.stringify(b)}`;
          expect(r.warning, label).toBe("possible_continuum");
          expect(r.geometry!.components, label).toBe(1);
          expect(r.geometry!.continuumComponents, label).toBe(1);
          expect(r.points.length, label).toBeGreaterThanOrEqual(20);
          for (const p of r.points) {
            expect(onAxis(p.at), label).toBe(true);
            expect(p.classification, label).toBe("non_hyperbolic");
          }
          // Both axes are represented, away from the origin.
          expect(r.points.some((p) => Math.abs(p.at.y) <= 1e-9 && Math.abs(p.at.x) > 0.3), label).toBe(true);
          expect(r.points.some((p) => Math.abs(p.at.x) <= 1e-9 && Math.abs(p.at.y) > 0.3), label).toBe(true);
          expect(r.singularPoints, label).toBeUndefined();
        }
      }
    }
  });

  it("J.4: x' = y, y' = -x - y + x⁷ finds exactly (0, 0) stable spiral and (±1, 0) saddles on every box and scale", () => {
    // Roots of x⁷ = x: 0, ±1. J = [[0, 1], [7x⁶ - 1, -1]]: at 0 trace -1, det 1, disc -3 -> stable
    // spiral; at ±1 det -6 -> saddle. On [-100, 100]² and larger the origin sits on a scan-cell
    // corner whose neighbouring centres lie in the saddles' basins (no |F| minimum, no seed in its
    // basin); the sign-change quadtree splits the cell that has the origin at its corner until a
    // run from a sub-cell centre lands on it, so `seeding.refined` is positive.
    for (const b of [box(-3, 3), box(-10, 10), box(-100, 100), box(-1000, 1000), { x: { min: -30, max: 170 }, y: { min: -120, max: 80 } }]) {
      for (const s of ["1", "1e-6", "1e6"]) {
        const r = findEquilibria(compileSystem({ f: `${s}*y`, g: `${s}*(-x - y + x^7)` }), b);
        const label = `${s} ${JSON.stringify(b)}`;
        expect(r.points, label).toHaveLength(3);
        expect(r.warning, label).toBeUndefined();
        expect(r.seeding.refined, label).toBeGreaterThan(0);
        expect(r.seeding.refineCapped, label).toBe(false);
        const origin = r.points.find((p) => near(p.at, 0, 0, 1e-9))!;
        expect(origin, label).toBeTruthy();
        expect(origin.classification, label).toBe("stable_spiral");
        expect(origin.trace / Number(s)).toBeCloseTo(-1, 6);
        expect(origin.determinant / Number(s) ** 2).toBeCloseTo(1, 6);
        for (const x of [-1, 1]) {
          const saddle = r.points.find((p) => near(p.at, x, 0, 1e-9))!;
          expect(saddle, label).toBeTruthy();
          expect(saddle.classification, label).toBe("saddle");
          expect(saddle.determinant / Number(s) ** 2).toBeCloseTo(-6, 5);
        }
      }
    }
  });

  it("J.4: the quadtree caps are reported, never silent: sin(20πx), sin(20πy) on [-1, 1]²", () => {
    // 41² = 1681 roots (k/20, m/20): far more sign-change cells than REFINE_ROOT_CAP roots, so the
    // refinement stops and says so; the scan cap is hit as before.
    const r = findEquilibria(compileSystem({ f: "sin(20*pi*x)", g: "sin(20*pi*y)" }), box(-1, 1));
    expect(r.seeding.refineCapped).toBe(true);
    expect(r.seeding.capped).toBe(true);
    expect(r.truncated).toBe(true);
    // A field without a common sign change never enters the quadtree: x' = y, y' = x⁸ + 1.
    const none = findEquilibria(compileSystem({ f: "y", g: "x^8 + 1" }), box(-100, 100));
    expect(none.seeding.refined).toBe(0);
    expect(none.seeding.refineCapped).toBe(false);
    expect(none.points).toEqual([]);
  });

  it("J.5: a line of equilibria on the edge of the field's domain: x' = sqrt(x) y, y' = x vanishes on all of x = 0", () => {
    // sqrt(x) is undefined for x < 0; F(0, y) = (0, 0) for every y, so the whole edge x = 0 is an
    // equilibrium set: one connected line, every point a domain-edge point (no linearization).
    // Newton from a cell centre linearizes sqrt across the edge (d = (-x, -y/2)) and walked every
    // seed to the origin; the edge seeds (bisection from each edge cell toward its undefined
    // neighbour) start ON the edge and the rank-one step lands there exactly.
    for (const b of [box(-2, 2), offsetBox, skewBox, box(-200, 200)]) {
      for (const s of ["1", "1e-6", "1e6"]) {
        const r = findEquilibria(compileSystem({ f: `${s}*sqrt(x)*y`, g: `${s}*x` }), b, { maxPoints: 200 });
        const label = `${s} ${JSON.stringify(b)}`;
        const height = b.y.max - b.y.min;
        expect(r.warning, label).toBe("possible_continuum");
        expect(r.geometry!.components, label).toBe(1);
        expect(r.geometry!.continuumComponents, label).toBe(1);
        expect(r.seeding.edgeSeeds, label).toBeGreaterThanOrEqual(60);
        expect(r.seeding.edgeCapped, label).toBe(false);
        expect(r.points.length, label).toBeGreaterThanOrEqual(20);
        for (const p of r.points) {
          expect(Math.abs(p.at.x), label).toBeLessThanOrEqual(1e-12 * (b.x.max - b.x.min));
          expect(p.classification, label).toBe("non_hyperbolic");
          expect(p.caveat, label).toBe("domainEdge");
        }
        // The line is found along the whole edge, not only near the origin.
        const ys = r.points.map((p) => p.at.y);
        expect(Math.max(...ys) - Math.min(...ys), label).toBeGreaterThan(0.8 * height);
      }
    }
    // The isolated domain-edge root of x' = sqrt(x), y' = y is still a single point: every edge seed converges to it.
    const single = findEquilibria(compileSystem({ f: "sqrt(x)", g: "y" }), { x: { min: -1, max: 2 }, y: { min: -1, max: 1 } });
    expect(single.points).toHaveLength(1);
    expect(single.seeding.edgeSeeds).toBeGreaterThanOrEqual(60);
    expect(single.warning).toBeUndefined();
  });

  it("J.9: the 121 lattice points of x' = sin(πx), y' = sin(πy) get uniform verdicts, decided by the Jacobian's error", () => {
    // At (k, m): J = diag(π cos πk, π cos πm) = diag(±π, ±π). Equal signs: a star node whose
    // finite-difference diagonal entries differ by rounding (~1e-10) while the off-diagonals are
    // exactly 0 (f does not depend on y): disc = (a - d)² is within its error 2 |a - d| (e_a + e_d)
    // (e ~ 4e-9 after the 10x margin), so EVERY such point is star_node with the repeatedRoot
    // caveat, whether or not the two entries happened to come out bit-identical. Opposite signs:
    // det = -π² -> saddle, no caveat. 61 of the first kind, 60 of the second, on every scale.
    for (const s of ["1", "1e-6", "1e6"]) {
      const r = findEquilibria(compileSystem({ f: `${s}*sin(pi*x)`, g: `${s}*sin(pi*y)` }), box(-5, 5), { maxPoints: 200 });
      expect(r.points, s).toHaveLength(121);
      let stars = 0, saddles = 0;
      for (const p of r.points) {
        const k = Math.round(p.at.x), m = Math.round(p.at.y);
        expect(near(p.at, k, m, 1e-9), s).toBe(true);
        if ((k + m) % 2 === 0) {
          stars++;
          expect(p.classification, `${s} (${k}, ${m})`).toBe("star_node");
          expect(p.caveat, `${s} (${k}, ${m})`).toBe("repeatedRoot");
          expect(Math.abs(p.eigenvalues[0].re / Number(s)), `${s} (${k}, ${m})`).toBeCloseTo(Math.PI, 8);
        } else {
          saddles++;
          expect(p.classification, `${s} (${k}, ${m})`).toBe("saddle");
          expect(p.caveat, `${s} (${k}, ${m})`).toBeUndefined();
        }
      }
      expect(stars).toBe(61);
      expect(saddles).toBe(60);
    }
  });
});
