import { describe, expect, it } from "vitest";
import { determinant, eigenvalues2, jacobianAt, jacobianSensitivity, jacobianWithError, trace } from "./jacobian";
import { compileSystem } from "./parse";
import type { Matrix2 } from "./types";

const expectMatrixClose = (J: Matrix2, expected: Matrix2, digits: number) => {
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) expect(J[i][j]).toBeCloseTo(expected[i][j], digits);
};

describe("jacobianAt", () => {
  it("recovers the matrix of a linear system", () => {
    const sys = compileSystem({ f: "2x + 3y", g: "-x + 4y" });
    expectMatrixClose(jacobianAt(sys, { x: 0.3, y: -0.7 }), [[2, 3], [-1, 4]], 8);
  });

  it("linearises Lotka-Volterra at (1,1) to a rotation", () => {
    // f = x - xy: f_x = 1 - y = 0, f_y = -x = -1;  g = xy - y: g_x = y = 1, g_y = x - 1 = 0
    const lv = compileSystem({ f: "x - x*y", g: "x*y - y" });
    expectMatrixClose(jacobianAt(lv, { x: 1, y: 1 }), [[0, -1], [1, 0]], 6);
  });

  it("keeps precision far from the origin thanks to the relative step", () => {
    // f = x^2 at x = 1e6: with a fixed h = 1e-6 the values f(x ± h) ~ 1e12 are only resolved to an
    // ulp of ~1e-4, so the difference quotient carries an error of ~1e-4 / 2e-6 = 50, i.e. 2.5e-5
    // relative. The relative step h = 1 gives (x+1)^2 - (x-1)^2 = 4x exactly in floating point.
    const sys = compileSystem({ f: "x^2", g: "y^2" });
    const J = jacobianAt(sys, { x: 1e6, y: -5e5 });
    expect(Math.abs(J[0][0] / 2e6 - 1)).toBeLessThan(1e-9);
    expect(Math.abs(J[1][1] / -1e6 - 1)).toBeLessThan(1e-9);
    expect(Math.abs(J[0][1])).toBeLessThan(1e-3);
    expect(Math.abs(J[1][0])).toBeLessThan(1e-3);
  });

  it("uses an explicit step when given", () => {
    // f = x^3 at 0: the central difference is exactly h^2, so the step is observable in the result.
    const sys = compileSystem({ f: "x^3", g: "0" });
    expect(jacobianAt(sys, { x: 0, y: 0 }, 1e-2)[0][0]).toBeCloseTo(1e-4, 12);
    expect(jacobianAt(sys, { x: 0, y: 0 }, 1e-3)[0][0]).toBeCloseTo(1e-6, 14);
  });

  it("returns non-finite entries when the stencil hits undefined values instead of throwing", () => {
    // sqrt(x) at x = 0: the backward stencil point x - h is negative, so the difference is NaN.
    const J = jacobianAt(compileSystem({ f: "sqrt(x)", g: "0" }), { x: 0, y: 0 });
    expect(Number.isFinite(J[0][0])).toBe(false);
    // 1/x evaluated *around* 0 gives a huge but finite estimate; that is the caller's problem.
    const K = jacobianAt(compileSystem({ f: "1/x", g: "0" }), { x: 0, y: 0 });
    expect(Number.isFinite(K[0][0])).toBe(true);
  });
});

describe("eigenvalues2", () => {
  it("real distinct: diag(1, -1)", () => {
    expect(eigenvalues2([[1, 0], [0, -1]])).toEqual([{ re: 1, im: 0 }, { re: -1, im: 0 }]);
  });

  it("purely imaginary: rotation", () => {
    const [l1, l2] = eigenvalues2([[0, -1], [1, 0]]);
    expect(l1).toEqual({ re: 0, im: 1 });
    expect(l2).toEqual({ re: 0, im: -1 });
  });

  it("complex: -1 ± i", () => {
    const [l1, l2] = eigenvalues2([[-1, -1], [1, -1]]);
    expect(l1.re).toBeCloseTo(-1, 12);
    expect(l1.im).toBeCloseTo(1, 12);
    expect(l2.im).toBeCloseTo(-1, 12);
  });

  it("damped oscillator: -1/4 ± i sqrt(15)/4", () => {
    const [l1] = eigenvalues2([[0, 1], [-1, -0.5]]);
    expect(l1.re).toBeCloseTo(-0.25, 12);
    expect(l1.im).toBeCloseTo(Math.sqrt(15) / 4, 12);
  });

  it("repeated: 2, 2", () => {
    expect(eigenvalues2([[2, 0], [0, 2]])).toEqual([{ re: 2, im: 0 }, { re: 2, im: 0 }]);
  });

  it("trace and determinant", () => {
    expect(trace([[1, 2], [3, 4]])).toBe(5);
    expect(determinant([[1, 2], [3, 4]])).toBe(-2);
  });
});

describe("columns at the edge of the field's domain (J.1)", () => {
  it("oneSided shrinks the step until the stencil is inside the domain: sqrt(x) at x = 1e-10", () => {
    // Central difference is NaN at the default step (x - h < 0). Shrinking by halving to a step
    // s in (x/8, x/4] and taking a central difference there gives 1/(2 sqrt x) = 5e4 with the
    // relative truncation error of sqrt's central difference, s² / (8x²) < 1 / 128.
    const sys = compileSystem({ f: "sqrt(x)", g: "0" });
    expect(Number.isFinite(jacobianAt(sys, { x: 1e-10, y: 0 })[0][0])).toBe(false);
    const J = jacobianAt(sys, { x: 1e-10, y: 0 }, undefined, 0, { oneSided: true });
    expect(Math.abs(J[0][0] / 5e4 - 1)).toBeLessThan(1e-2);
    expect(J[0][1]).toBe(0);
  });

  it("on the edge itself the one-sided difference is finite; without the option it is not", () => {
    const sys = compileSystem({ f: "sqrt(x)", g: "y" });
    const J = jacobianAt(sys, { x: 0, y: 0 }, undefined, 0, { oneSided: true });
    expect(Number.isFinite(J[0][0])).toBe(true);
    expect(J[0][0]).toBeGreaterThan(0);
    expect(J[1][1]).toBeCloseTo(1, 9);
    expect(Number.isFinite(jacobianAt(sys, { x: 0, y: 0 })[0][0])).toBe(false);
  });

  it("jacobianWithError reports domainEdge only when the field is finite at p and on one side", () => {
    const sqrt = compileSystem({ f: "sqrt(x)", g: "y" });
    const edge = jacobianWithError(sqrt, { x: 0, y: 0 });
    expect(edge.domainEdge).toBe(true);
    expect(edge.error).toBe(Infinity);
    expect(Number.isFinite(edge.J[0][0])).toBe(false);
    expect(jacobianWithError(sqrt, { x: 1, y: 0 }).domainEdge).toBe(false);
    // 1/x at 0: the field itself is infinite there, not on an edge.
    expect(jacobianWithError(compileSystem({ f: "1/x", g: "y" }), { x: 0, y: 0 }).domainEdge).toBe(false);
  });
});

describe("jacobianSensitivity", () => {
  it("is the largest second derivative: 2 for f = x², and only finite-difference noise for a linear system", () => {
    const q = compileSystem({ f: "x^2", g: "y" });
    expect(jacobianSensitivity(q, { x: 0.3, y: 0 }, jacobianAt(q, { x: 0.3, y: 0 }))).toBeCloseTo(2, 4);
    // Linear: the displaced Jacobians differ from the exact one only by the rounding of the
    // central differences, ~2 eps / h = 4.4e-10 per entry, divided by the displacement 1e-6.
    const lin = compileSystem({ f: "2*x + y", g: "x - y" });
    expect(jacobianSensitivity(lin, { x: 0.3, y: 0.1 }, [[2, 1], [1, -1]])).toBeLessThan(1e-3);
  });
});
