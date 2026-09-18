/**
 * Round V: nullclines, eigen-directions and separatrices. Every expectation is derived by hand:
 * - x' = y, y' = -x: x' = 0 is the line y = 0 and y' = 0 the line x = 0 (the two axes); marching
 *   squares interpolates a LINEAR function exactly, so the segments lie on the axes to rounding.
 * - x' = x² + y² - 1: x' = 0 is the unit circle; a chord of a circle of radius 1 across a cell of
 *   diagonal h lies within h²/8 of it (sagitta), h = sqrt(2) * 6/80 = 0.106: 0.0014. Bound used: 0.005.
 * - 1/x and sign(x) - 1/2 change sign without vanishing: no nullcline.
 * - J = [[1, 0], [0, -1]]: eigenvalue 1 along (1, 0) (unstable), -1 along (0, 1) (stable).
 *   J = [[0, 1], [1, 0]]: eigenvalue 1 along (1, 1)/sqrt 2, -1 along (1, -1)/sqrt 2.
 *   J = [[-1, 1], [0, -1]]: the repeated eigenvalue -1 has the single eigenvector (1, 0).
 *   J = I: every direction. x' = y, y' = -x - 0.5 y: complex pair, no real direction.
 * - x' = x, y' = -y: the unstable manifold of the origin is the x axis (y = 0 is invariant, y' = -y),
 *   the stable manifold the y axis; both are invariant EXACTLY for the integrator too (a zero
 *   component stays zero), so the four branches lie on the axes exactly.
 * - Pendulum x' = y, y' = -sin x: the saddle (pi, 0) has energy E = y²/2 - cos x = 1 and E is
 *   conserved, so every separatrix point has E = 1 up to the offset's O(offset⁴) and the
 *   integrator's tolerance (1e-6 relative): bound used 1e-4.
 */
import { describe, expect, it } from "vitest";
import { findEquilibria, type Equilibrium } from "./core/equilibria";
import { compileSystem } from "./core/parse";
import { toSystem } from "./core/slope-field";
import type { Box, Vec2 } from "./core/types";
import { fixedStopBox } from "./interactive";
import { computeNullclines, eigenDirections, nullclineNames, separatrices, SEPARATRIX_OFFSET_FRACTION } from "./phase-aids";

// Deliberately not symmetric and not aligned with the axes, so nothing is exact by luck of the grid.
const BOX: Box = { x: { min: -2.9, max: 3.1 }, y: { min: -3.05, max: 2.95 } };
const points = (segments: [Vec2, Vec2][]) => segments.flat();

function equilibriaOf(f: string, g: string, box: Box = BOX): Equilibrium[] {
  return findEquilibria(compileSystem({ f, g }), box).points;
}

describe("nullclines", () => {
  it("x' = y, y' = -x: the two families are the two coordinate axes, across the whole box", () => {
    const n = computeNullclines(compileSystem({ f: "y", g: "-x" }), BOX);
    expect(n.f.length).toBeGreaterThan(40);
    expect(n.g.length).toBeGreaterThan(40);
    for (const p of points(n.f)) expect(Math.abs(p.y)).toBeLessThan(1e-12);
    for (const p of points(n.g)) expect(Math.abs(p.x)).toBeLessThan(1e-12);
    // from edge to edge of the box
    const xs = points(n.f).map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(BOX.x.min, 9);
    expect(Math.max(...xs)).toBeCloseTo(BOX.x.max, 9);
    const ys = points(n.g).map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(BOX.y.min, 9);
    expect(Math.max(...ys)).toBeCloseTo(BOX.y.max, 9);
  });

  it("a curved nullcline: x' = x² + y² - 1 vanishes on the unit circle (within the chord's sagitta)", () => {
    const n = computeNullclines(compileSystem({ f: "x^2 + y^2 - 1", g: "x - y" }), BOX);
    expect(n.f.length).toBeGreaterThan(40);
    for (const p of points(n.f)) expect(Math.abs(Math.hypot(p.x, p.y) - 1)).toBeLessThan(0.005);
    // y' = x - y vanishes on the diagonal; the families cross at the equilibria ±(1, 1)/sqrt 2
    for (const p of points(n.g)) expect(Math.abs(p.x - p.y)).toBeLessThan(1e-12);
  });

  it("a sign change that is not a zero is not a nullcline: the pole of 1/x, the jump of sign(x) - 1/2", () => {
    expect(computeNullclines(compileSystem({ f: "1/x", g: "y" }), BOX).f).toEqual([]);
    expect(computeNullclines(compileSystem({ f: "sign(x) - 0.5", g: "y" }), BOX).f).toEqual([]);
    // and tan has both: zeros at k pi (kept), poles at pi/2 + k pi (dropped)
    const tan = computeNullclines(compileSystem({ f: "tan(x)", g: "y" }), BOX).f;
    expect(tan.length).toBeGreaterThan(40);
    for (const p of points(tan)) expect(Math.abs(Math.sin(p.x))).toBeLessThan(0.01);
  });

  it("first order: dy/dt = y - t has the one family y = t (where solutions have their extrema); dy/dt = g has no f family", () => {
    const n = computeNullclines(compileSystem(toSystem({ kind: "explicit", g: "y - t" })), BOX);
    expect(n.f).toEqual([]);
    expect(n.g.length).toBeGreaterThan(40);
    for (const p of points(n.g)) expect(Math.abs(p.y - p.x)).toBeLessThan(1e-12);
  });

  it("differential form t dt + y dy = 0: N = y vanishes on y = 0 (vertical tangents), M = t on t = 0 (horizontal tangents)", () => {
    const n = computeNullclines(compileSystem(toSystem({ kind: "differential", M: "t", N: "y" })), BOX);
    for (const p of points(n.f)) expect(Math.abs(p.y)).toBeLessThan(1e-12);
    for (const p of points(n.g)) expect(Math.abs(p.x)).toBeLessThan(1e-12);
    expect(n.f.length).toBeGreaterThan(40);
    expect(n.g.length).toBeGreaterThan(40);
  });

  it("a non-autonomous field's nullclines are those of the snapshot: y' = -x + t vanishes on x = t", () => {
    const sys = compileSystem({ f: "y", g: "-x + t" });
    for (const p of points(computeNullclines(sys, BOX, 1.5).g)) expect(Math.abs(p.x - 1.5)).toBeLessThan(1e-12);
    for (const p of points(computeNullclines(sys, BOX, 0).g)) expect(Math.abs(p.x)).toBeLessThan(1e-12);
  });

  it("the families are named in the student's notation", () => {
    expect(nullclineNames("system")).toEqual({ f: "x' = 0", g: "y' = 0" });
    expect(nullclineNames("second")).toEqual({ f: "x' = 0", g: "x'' = 0" });
    expect(nullclineNames("explicit")).toEqual({ f: null, g: "dy/dt = 0" });
    expect(nullclineNames("differential")).toEqual({ f: "N = 0", g: "M = 0" });
  });
});

describe("eigen-directions", () => {
  const only = (f: string, g: string) => {
    const eq = equilibriaOf(f, g);
    expect(eq).toHaveLength(1);
    return eq[0];
  };
  const along = (d: Vec2, expected: Vec2) => Math.abs(d.x * expected.y - d.y * expected.x);

  it("the saddle x' = x, y' = -y: unstable along the x axis, stable along the y axis", () => {
    const report = eigenDirections(only("x", "-y"));
    expect(report.note).toBe("two");
    const unstable = report.directions.find((d) => d.kind === "unstable")!;
    const stable = report.directions.find((d) => d.kind === "stable")!;
    expect(unstable.eigenvalue).toBeCloseTo(1, 6);
    expect(stable.eigenvalue).toBeCloseTo(-1, 6);
    expect(along(unstable.direction, { x: 1, y: 0 })).toBeLessThan(1e-6);
    expect(along(stable.direction, { x: 0, y: 1 })).toBeLessThan(1e-6);
    for (const d of report.directions) expect(Math.hypot(d.direction.x, d.direction.y)).toBeCloseTo(1, 12);
  });

  it("a saddle whose directions are not the axes: x' = y, y' = x has (1, 1) unstable and (1, -1) stable", () => {
    const report = eigenDirections(only("y", "x"));
    expect(along(report.directions.find((d) => d.kind === "unstable")!.direction, { x: 1, y: 1 })).toBeLessThan(1e-6);
    expect(along(report.directions.find((d) => d.kind === "stable")!.direction, { x: 1, y: -1 })).toBeLessThan(1e-6);
  });

  it("the degenerate node x' = -x + y, y' = -y has ONE eigen-direction, (1, 0): its defining feature", () => {
    const e = only("-x + y", "-y");
    expect(e.classification).toBe("degenerate_node");
    const report = eigenDirections(e);
    expect(report.note).toBe("one");
    expect(report.directions).toHaveLength(1);
    expect(report.directions[0].kind).toBe("stable");
    expect(report.directions[0].eigenvalue).toBeCloseTo(-1, 6);
    expect(along(report.directions[0].direction, { x: 1, y: 0 })).toBeLessThan(1e-6);
  });

  it("a node has two; a star node has every direction (none drawn); complex eigenvalues and non-hyperbolic points have none", () => {
    const node = eigenDirections(only("-x", "-3*y"));
    expect(node.note).toBe("two");
    expect(node.directions.map((d) => d.kind)).toEqual(["stable", "stable"]);
    expect(eigenDirections(only("x", "y"))).toEqual({ note: "every", directions: [] });
    expect(eigenDirections(only("y", "-x - 0.5*y"))).toEqual({ note: "complex", directions: [] });
    expect(eigenDirections(only("y", "-x"))).toEqual({ note: "complex", directions: [] });
    const nonHyperbolic = equilibriaOf("x^2", "-y").find((e) => e.classification === "non_hyperbolic");
    expect(nonHyperbolic).toBeDefined();
    expect(eigenDirections(nonHyperbolic!)).toEqual({ note: "undecided", directions: [] });
  });
});

describe("separatrices", () => {
  it("x' = x, y' = -y: four branches from the origin along the axes; unstable ones forward along y = 0, stable ones backward along x = 0", () => {
    const sys = compileSystem({ f: "x", g: "-y" });
    const branches = separatrices(sys, equilibriaOf("x", "-y"), BOX, fixedStopBox(BOX));
    expect(branches).toHaveLength(4);
    const unstable = branches.filter((b) => b.kind === "unstable");
    const stable = branches.filter((b) => b.kind === "stable");
    expect(unstable).toHaveLength(2);
    expect(stable).toHaveLength(2);
    for (const b of unstable) for (const p of b.points) expect(Math.abs(p.y)).toBeLessThan(1e-9);
    for (const b of stable) for (const p of b.points) expect(Math.abs(p.x)).toBeLessThan(1e-9);
    // one branch on each side, each running out of the box to the far stop box
    expect(unstable.map((b) => Math.sign(b.points.at(-1)!.x)).sort()).toEqual([-1, 1]);
    expect(stable.map((b) => Math.sign(b.points.at(-1)!.y)).sort()).toEqual([-1, 1]);
    for (const b of branches) {
      expect(b.status).toBe("left_box");
      expect(Math.hypot(b.points.at(-1)!.x, b.points.at(-1)!.y)).toBeGreaterThan(10);
    }
  });

  it("the offset is relative to the box: a box a thousand times smaller starts a thousand times closer", () => {
    const sys = compileSystem({ f: "x", g: "-y" });
    const eq = equilibriaOf("x", "-y");
    const small: Box = { x: { min: -0.003, max: 0.003 }, y: { min: -0.003, max: 0.003 } };
    const firstStep = (box: Box) => Math.hypot(...Object.values(separatrices(sys, eq, box, fixedStopBox(BOX))[0].points[1]) as [number, number]);
    const big: Box = { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } };
    expect(firstStep(big)).toBeCloseTo(SEPARATRIX_OFFSET_FRACTION * Math.hypot(6, 6), 12);
    expect(firstStep(small)).toBeCloseTo(SEPARATRIX_OFFSET_FRACTION * Math.hypot(0.006, 0.006), 15);
  });

  it("only saddles: a node, a spiral and a center-or-weak-spiral have no separatrix", () => {
    for (const [f, g] of [["-x", "-3*y"], ["y", "-x - 0.5*y"], ["y", "-x"]] as const) {
      expect(separatrices(compileSystem({ f, g }), equilibriaOf(f, g), BOX, fixedStopBox(BOX))).toEqual([]);
    }
  });

  it("pendulum: every separatrix point of the saddle (pi, 0) has the saddle's energy y²/2 - cos x = 1", () => {
    const box: Box = { x: { min: 0.5, max: 5.5 }, y: { min: -3, max: 3 } };
    const sys = compileSystem({ f: "y", g: "-sin(x)" });
    const saddles = equilibriaOf("y", "-sin(x)", box).filter((e) => e.classification === "saddle");
    expect(saddles).toHaveLength(1);
    expect(saddles[0].at.x).toBeCloseTo(Math.PI, 8);
    const branches = separatrices(sys, saddles, box, fixedStopBox(box));
    expect(branches).toHaveLength(4);
    for (const b of branches) {
      expect(b.points.length).toBeGreaterThan(10);
      for (const p of b.points) expect(Math.abs((p.y * p.y) / 2 - Math.cos(p.x) - 1)).toBeLessThan(1e-4);
    }
  });
});
