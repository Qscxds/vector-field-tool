import { describe, expect, it } from "vitest";
import { determinant, eigenvalues2, jacobianAt, trace } from "./jacobian";
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
    const sys = compileSystem({ f: "x^2", g: "y^2" });
    const J = jacobianAt(sys, { x: 1000, y: -500 });
    expect(J[0][0] / 2000).toBeCloseTo(1, 7);
    expect(J[1][1] / -1000).toBeCloseTo(1, 7);
    expect(Math.abs(J[0][1])).toBeLessThan(1e-3);
    expect(Math.abs(J[1][0])).toBeLessThan(1e-3);
  });

  it("accepts an explicit step", () => {
    const sys = compileSystem({ f: "sin(x)", g: "0" });
    expect(jacobianAt(sys, { x: 0, y: 0 }, 1e-4)[0][0]).toBeCloseTo(1, 7);
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
