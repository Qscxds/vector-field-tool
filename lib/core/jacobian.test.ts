import { describe, expect, it } from "vitest";
import { determinant, eigenvalues2, jacobianAt, jacobianSensitivity, jacobianSensitivityEntries, jacobianWithError, trace } from "./jacobian";
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

  it("J.6: the small real eigenvalue is det / λ₁, not a cancelled difference: diag(1, 1e-20) and diag(1e10, 1e-10)", () => {
    // (tr - sqrt(disc)) / 2 = (1 + 1e-20 - (1 - 1e-20)) / 2 rounds to 0; det / λ₁ = 1e-20 exactly.
    expect(eigenvalues2([[1, 0], [0, 1e-20]])).toEqual([{ re: 1, im: 0 }, { re: 1e-20, im: 0 }]);
    const [big, small] = eigenvalues2([[1e10, 0], [0, 1e-10]]);
    expect(big.re / 1e10).toBeCloseTo(1, 12);
    expect(small.re / 1e-10).toBeCloseTo(1, 12);
    // Negative trace: the root of larger magnitude is (tr - s) / 2 = -1, the other det / (-1) = -1e-20; largest first.
    expect(eigenvalues2([[-1, 0], [0, -1e-20]])).toEqual([{ re: -1e-20, im: 0 }, { re: -1, im: 0 }]);
    // tr = 0, det < 0: ± sqrt(-det).
    expect(eigenvalues2([[0, 1], [4, 0]])).toEqual([{ re: 2, im: 0 }, { re: -2, im: 0 }]);
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

describe("jacobianWithError per-entry errors (review J item 6)", () => {
  it("x' = 1e8 x + y, y' = -x + 1e-8 y at the origin: each entry carries its own rounding floor", () => {
    // Central differences at h = 1e-6. Entry (i, j) is rounded by 4 eps max|F_i| / (2h) over the
    // stencil of column j: e_a from |f(±h, 0)| = 100 -> 4.4e-8; e_b from |f(0, ±h)| = 1e-6 ->
    // 4.4e-16; e_c from |g(±h, 0)| = 1e-6 -> 4.4e-16; e_d from |g(0, ±h)| = 1e-14 -> 4.4e-24. The
    // truncation term |J_h - J_2h| / 3 of a linear field is rounding of the same size at most.
    const { J, error, errors } = jacobianWithError(compileSystem({ f: "1e8*x + y", g: "-x + 1e-8*y" }), { x: 0, y: 0 });
    expect(J[0][0] / 1e8).toBeCloseTo(1, 9);
    expect(J[1][1] / 1e-8).toBeCloseTo(1, 9);
    expect(errors[0][0]).toBeGreaterThan(4e-8);
    expect(errors[0][0]).toBeLessThan(1e-7);
    expect(errors[0][1]).toBeLessThan(1e-14);
    expect(errors[1][0]).toBeLessThan(1e-14);
    expect(errors[1][1]).toBeLessThan(1e-22);
    expect(error).toBe(Math.max(errors[0][0], errors[0][1], errors[1][0], errors[1][1]));
    // Propagated to the determinant: e_a |d| + e_d |a| + e_b |c| + e_c |b| << 2.
    const [[ea, eb], [ec, ed]] = errors;
    expect(ea * Math.abs(J[1][1]) + ed * Math.abs(J[0][0]) + eb * Math.abs(J[1][0]) + ec * Math.abs(J[0][1])).toBeLessThan(1e-13);
  });

  it("errors are all Infinity when J is not finite, and per-entry truncation shows where the field bends", () => {
    expect(jacobianWithError(compileSystem({ f: "sqrt(x)", g: "y" }), { x: 0, y: 0 }).errors.flat().every((e) => e === Infinity)).toBe(true);
    // f = x³, g = y at (1, 0), h = 1e-6. Entry (0, 0): rounding 4 eps |f| / (2h) = 4.4e-10 with
    // |f| = 1 on the x stencil, plus the truncation estimate |J_h - J_2h| / 3 = |(3 + h²) -
    // (3 + 4h²)| / 3 = h² = 1e-12 in exact arithmetic, but each difference quotient itself carries
    // rounding of up to ~4.4e-10, so the estimate lies between 0 and ~1e-9. Entry (0, 1): f does
    // not change along y (the quotients are exactly 0, truncation 0) but its rounding floor is set
    // by |f(1, ±h)| = 1: exactly 4.4e-10. Entry (1, 1): |g(1, ±h)| = 1e-6 -> 4.4e-16, no truncation
    // (g linear). Entry (1, 0): g(1 ± h, 0) = 0 -> exactly 0.
    const { errors } = jacobianWithError(compileSystem({ f: "x^3", g: "y" }), { x: 1, y: 0 });
    expect(errors[0][0]).toBeGreaterThan(4.4e-10);
    expect(errors[0][0]).toBeLessThan(1.5e-9);
    expect(errors[0][1]).toBeGreaterThan(4.3e-10);
    expect(errors[0][1]).toBeLessThan(4.5e-10);
    expect(errors[1][1]).toBeLessThan(1e-15);
    expect(errors[1][0]).toBe(0);
  });
});

describe("jacobianSensitivityEntries", () => {
  it("f = x², g = y³ at (0.3, 0.5): 2 for entry (0, 0), 6y = 3 for entry (1, 1), noise elsewhere", () => {
    const sys = compileSystem({ f: "x^2", g: "y^3" });
    const p = { x: 0.3, y: 0.5 };
    const S = jacobianSensitivityEntries(sys, p, jacobianAt(sys, p));
    expect(S[0][0]).toBeCloseTo(2, 4);
    expect(S[1][1]).toBeCloseTo(3, 4);
    expect(S[0][1]).toBeLessThan(1e-3);
    expect(S[1][0]).toBeLessThan(1e-3);
    expect(jacobianSensitivity(sys, p, jacobianAt(sys, p))).toBe(Math.max(S[0][0], S[0][1], S[1][0], S[1][1]));
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

describe("jacobianWithError: the step follows the box and the function, never an absolute 1e-6 (J-fix2 item 4)", () => {
  it("x' = 1e14 x³ - 1e-7, y' = 3y at (1e-7, 0) with scale 4e-7: J00 = 3 to 1e-6 and a step below the box", () => {
    // J00 = 3 × 1e14 × (1e-7)² = 3; the fixed step 1e-6 (2.5 boxes) read 3 + 1e14 h² = 103.
    const { J, h, errors } = jacobianWithError(compileSystem({ f: "1e14*x^3 - 1e-7", g: "3*y" }), { x: 1e-7, y: 0 }, 0, { scale: 4e-7 });
    expect(J[0][0]).toBeCloseTo(3, 6);
    expect(J[1][1]).toBeCloseTo(3, 6);
    expect(h).toBeLessThanOrEqual(1e-6 * 4e-7);
    expect(errors[0][0]).toBeLessThan(1e-3);
  });

  it("the saddle (1, 0) of x' = y, y' = -x - y + x⁷ keeps det = -6 to 1e-6 with the scale of a 2e4 box (adaptive step)", () => {
    // J = [[0, 1], [7x⁶ - 1, -1]] at x = 1: det = -6. The box step 1e-6 × 2e4 = 0.02 has a
    // truncation h² (x⁷)''' / 6 = 0.02² × 210 / 6 = 0.014; quartering until the truncation
    // estimate is below JACOBIAN_TRUNCATION_TARGET × |J| brings it to ~2e-7 at h ~ 8e-5.
    const { J, h } = jacobianWithError(compileSystem({ f: "y", g: "-x - y + x^7" }), { x: 1, y: 0 }, 0, { scale: 2e4 });
    expect(determinant(J)).toBeCloseTo(-6, 6);
    expect(h).toBeLessThan(0.02);
  });

  it("without a scale the unit is 1, as before (x³ at x = 1: J00 = 3, h = 1e-6)", () => {
    const { J, h } = jacobianWithError(compileSystem({ f: "x^3", g: "y" }), { x: 1, y: 0 });
    expect(J[0][0]).toBeCloseTo(3, 9);
    expect(h).toBe(1e-6);
  });
});
