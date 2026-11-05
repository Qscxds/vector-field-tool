/**
 * Round 13: the exact eigen-analysis. Every expectation is derived by hand in the comment above it
 * (characteristic polynomial, discriminant, eigenvectors from (b, λ − a), equilibria from −A⁻¹ b).
 */
import { describe, expect, it } from "vitest";
import { q, toNumber, type Q } from "../series/rational";
import { analyzeLinear, centerByRounding, eigenvalueNumbers, linearAnalysisOf, numericLinear, readLinearSystem, squareFreeSplit, type FieldNumber, type LinearAnalysis } from "./linear-system";

const B = (v: number) => BigInt(v);
const fn = (r: Q, s: Q = q(0)): FieldNumber => ({ r, s });

function analysis(source: Parameters<typeof linearAnalysisOf>[0]): LinearAnalysis {
  const r = linearAnalysisOf(source);
  if (!r.ok) throw new Error(`not linear: ${JSON.stringify(r.failure)}`);
  return r.analysis;
}

describe("squareFreeSplit", () => {
  it("pulls square factors out", () => {
    // 8 = 2²·2, 60 = 2²·15, 72 = 6²·2, 13 is square-free.
    expect(squareFreeSplit(B(8))).toEqual({ k: B(2), m: B(2) });
    expect(squareFreeSplit(B(60))).toEqual({ k: B(2), m: B(15) });
    expect(squareFreeSplit(B(72))).toEqual({ k: B(6), m: B(2) });
    expect(squareFreeSplit(B(13))).toEqual({ k: B(1), m: B(13) });
  });
});

describe("readLinearSystem", () => {
  it("reads a planar system as A and b", () => {
    // x' = x + y − 3, y' = x − y − 1: A = [[1, 1], [1, −1]], b = (−3, −1).
    const r = readLinearSystem({ mode: "system", f: "x + y - 3", g: "x - y - 1" });
    expect(r.ok && r.system).toEqual({ A: [[q(1), q(1)], [q(1), q(-1)]], b: [q(-3), q(-1)], approximate: false });
  });

  it("reads the parameter values exactly as typed", () => {
    // k = 0.8 = 4/5: A = [[4/5, 0], [0, −1]].
    const r = readLinearSystem({ mode: "system", f: "k*x", g: "-y", params: { k: 0.8 } });
    expect(r.ok && r.system.A).toEqual([[q(4, 5), q(0)], [q(0), q(-1)]]);
  });

  it("refuses a nonlinear term and names it", () => {
    const r = readLinearSystem({ mode: "system", f: "x*y", g: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.reason).toBe("nonlinear");
      expect(r.failure.reason === "nonlinear" && r.failure.fragment.replace(/\s/g, "")).toBe("x*y");
    }
  });

  it("calls a coefficient or a constant part that depends on t time-dependent", () => {
    expect(readLinearSystem({ mode: "system", f: "t*x", g: "y" })).toEqual({ ok: false, failure: { reason: "timeDependent" } });
    expect(readLinearSystem({ mode: "system", f: "x + sin(t)", g: "y" })).toEqual({ ok: false, failure: { reason: "timeDependent" } });
  });

  it("marks a system with π approximate", () => {
    const r = readLinearSystem({ mode: "system", f: "pi*y", g: "-pi*x" });
    expect(r.ok && r.system.approximate).toBe(true);
  });

  it("reads a second-order equation as its phase plane (x, x')", () => {
    // x'' + 0.5 x' + x = 0: x' = v, v' = −x − v/2, so A = [[0, 1], [−1, −1/2]], b = 0.
    const r = readLinearSystem({ mode: "second", equation: "x'' + 0.5*x' + x = 0" });
    expect(r.ok && r.system).toEqual({ A: [[q(0), q(1)], [q(-1), q(-1, 2)]], b: [q(0), q(0)], approximate: false });
    // x'' + x = 2: v' = 2 − x, b = (0, 2).
    const forced = readLinearSystem({ mode: "second", equation: "x'' + x = 2" });
    expect(forced.ok && forced.system.b).toEqual([q(0), q(2)]);
  });

  it("refuses a second-order equation with a forcing or a coefficient in t, and a nonlinear one", () => {
    expect(readLinearSystem({ mode: "second", equation: "x'' + x = cos(t)" })).toEqual({ ok: false, failure: { reason: "timeDependent" } });
    expect(readLinearSystem({ mode: "second", equation: "x'' + t*x = 0" })).toEqual({ ok: false, failure: { reason: "timeDependent" } });
    const r = readLinearSystem({ mode: "second", equation: "x'' = -sin(x)" });
    expect(!r.ok && r.failure.reason).toBe("nonlinear");
  });
});

describe("analyzeLinear: real eigenvalues", () => {
  it("the saddle preset x' = x, y' = −y", () => {
    // tr 0, det −1, disc 4: λ = ±1; diagonal, so e1 for 1 and e2 for −1.
    const a = analysis({ mode: "system", f: "x", g: "-y" });
    expect(a.type).toBe("saddle");
    expect(a.roots).toEqual({ kind: "distinct", values: [fn(q(1)), fn(q(-1))] });
    expect(a.vectors).toEqual({ kind: "two", v: [[fn(q(1)), fn(q(0))], [fn(q(0)), fn(q(1))]] });
    expect(a.equilibrium).toEqual({ kind: "point", at: [q(0), q(0)] });
  });

  it("x' = x + y, y' = 4x + y: λ = 3, −1 with v = (1, 2), (1, −2)", () => {
    // tr 2, det −3, disc (1 − 1)² + 16 = 16; v = (b, λ − a) = (1, 2) and (1, −2).
    const a = analysis({ mode: "system", f: "x + y", g: "4*x + y" });
    expect([a.trace, a.det, a.disc]).toEqual([q(2), q(-3), q(16)]);
    expect(a.roots).toEqual({ kind: "distinct", values: [fn(q(3)), fn(q(-1))] });
    expect(a.vectors).toEqual({ kind: "two", v: [[fn(q(1)), fn(q(2))], [fn(q(1)), fn(q(-2))]] });
  });

  it("irrational eigenvalues stay exact: x' = y, y' = x + y", () => {
    // tr 1, det −1, disc 1 + 4 = 5: λ = 1/2 ± (1/2)√5; v± = (2b, (d − a) ± √5) = (2, 1 ± √5).
    const a = analysis({ mode: "system", f: "y", g: "x + y" });
    expect(a.radical).toEqual({ scale: q(1), m: B(5), imaginary: false });
    expect(a.roots).toEqual({ kind: "distinct", values: [fn(q(1, 2), q(1, 2)), fn(q(1, 2), q(-1, 2))] });
    expect(a.vectors).toEqual({ kind: "two", v: [[fn(q(2)), fn(q(1), q(1))], [fn(q(2)), fn(q(1), q(-1))]] });
    expect(a.type).toBe("saddle");
  });

  it("an affine saddle with equilibrium (2, 1) and λ = ±√2", () => {
    // A = [[1, 1], [1, −1]], b = (−3, −1): det −2, p* = −A⁻¹ b = (2, 1); disc 4 + 4 = 8 = (2√2)²:
    // λ = ±√2, v± = (2, −2 ± 2√2) ∝ (1, −1 ± √2).
    const a = analysis({ mode: "system", f: "x + y - 3", g: "x - y - 1" });
    expect(a.equilibrium).toEqual({ kind: "point", at: [q(2), q(1)] });
    expect(a.radical).toEqual({ scale: q(2), m: B(2), imaginary: false });
    expect(a.roots).toEqual({ kind: "distinct", values: [fn(q(0), q(1)), fn(q(0), q(-1))] });
    expect(a.vectors).toEqual({ kind: "two", v: [[fn(q(1)), fn(q(-1), q(1))], [fn(q(1)), fn(q(-1), q(-1))]] });
    const n = numericLinear(a);
    expect(n.at).toEqual({ x: 2, y: 1 });
    expect(n.lines[0].eigenvalue).toBeCloseTo(Math.SQRT2, 14);
    // Unit direction of (1, √2 − 1).
    const len = Math.hypot(1, Math.SQRT2 - 1);
    expect(n.lines[0].direction.x).toBeCloseTo(1 / len, 14);
    expect(n.lines[0].direction.y).toBeCloseTo((Math.SQRT2 - 1) / len, 14);
  });

  it("a degenerate node has one eigenvector and a generalized one", () => {
    // x' = y, y' = −x − 2y: tr −2, det 1, disc 0, λ = −1; v = (1, −1); (A + I) w = v with w = (0, 1).
    const a = analysis({ mode: "system", f: "y", g: "-x - 2*y" });
    expect(a.type).toBe("stable_degenerate");
    expect(a.roots).toEqual({ kind: "repeated", value: q(-1) });
    expect(a.vectors).toEqual({ kind: "one", v: [q(1), q(-1)], w: [q(0), q(1)] });
    expect(numericLinear(a).lines).toHaveLength(1);
  });

  it("a star node has every direction and no line", () => {
    // x' = 2x, y' = 2y: A = 2I.
    const a = analysis({ mode: "system", f: "2*x", g: "2*y" });
    expect(a.type).toBe("unstable_star");
    expect(a.vectors).toEqual({ kind: "every" });
    expect(numericLinear(a).lines).toHaveLength(0);
  });

  it("a zero eigenvalue with a line of equilibria", () => {
    // x' = x + y, y' = 2x + 2y: det 0, tr 3, disc 1 + 8 = 9: λ = 3 and 0; v = (1, 2) and (1, −1);
    // the equilibria are the line x + y = 0 through (0, 0) along (1, −1).
    const a = analysis({ mode: "system", f: "x + y", g: "2*x + 2*y" });
    expect(a.type).toBe("zero_eigenvalue");
    expect(a.roots).toEqual({ kind: "distinct", values: [fn(q(3)), fn(q(0))] });
    expect(a.equilibrium).toEqual({ kind: "line", through: [q(0), q(0)], direction: [q(1), q(-1)] });
    expect(numericLinear(a).lines).toHaveLength(0);
  });

  it("no equilibrium at all: x' = 1, y' = x", () => {
    // A = [[0, 0], [1, 0]] (nilpotent): λ = 0 twice, v = (0, 1), w = (1, 0) since A (1, 0) = (0, 1);
    // A p = −b = (−1, 0) asks 0 = −1: no equilibrium.
    const a = analysis({ mode: "system", f: "1", g: "x" });
    expect(a.vectors).toEqual({ kind: "one", v: [q(0), q(1)], w: [q(1), q(0)] });
    expect(a.equilibrium).toEqual({ kind: "none" });
  });
});

describe("analyzeLinear: complex eigenvalues", () => {
  it("the center x' = −y, y' = x", () => {
    // tr 0, det 1, disc −4 = (2i)²: λ = ±i; v = (2b, (d − a) + 2i) = (−2, 2i) ∝ (1, −i): Re (1, 0), Im (0, −1).
    // c = 1 > 0: counterclockwise.
    const a = analysis({ mode: "system", f: "-y", g: "x" });
    expect(a.type).toBe("center");
    expect(a.radical).toEqual({ scale: q(2), m: B(1), imaginary: true });
    expect(a.roots).toEqual({ kind: "complex", alpha: q(0), beta: q(1) });
    expect(a.vectors).toEqual({ kind: "complex", re: [q(1), q(0)], im: [q(0), q(-1)] });
    expect(a.rotation).toBe("ccw");
    const c = numericLinear(a).complex!;
    expect(c.closed).toBe(true);
    expect(c.beta).toBe(1);
  });

  it("the damped oscillator x'' + 0.5x' + x = 0: λ = −1/4 ± (√15/4) i, clockwise", () => {
    // A = [[0, 1], [−1, −1/2]]: tr −1/2, det 1, disc 1/4 − 4 = −15/4 = (i√15/2)²;
    // v = (2, 1/2·(−1) + i√15/2)·2 = (4, −1 + i√15); c = −1: clockwise.
    const a = analysis({ mode: "second", equation: "x'' + 0.5*x' + x = 0" });
    expect(a.type).toBe("stable_spiral");
    expect(a.radical).toEqual({ scale: q(1, 2), m: B(15), imaginary: true });
    expect(a.roots).toEqual({ kind: "complex", alpha: q(-1, 4), beta: q(1, 4) });
    expect(a.vectors).toEqual({ kind: "complex", re: [q(4), q(-1)], im: [q(0), q(1)] });
    expect(a.rotation).toBe("cw");
  });

  it("an approximate coefficient that leaves the trace barely non-zero is borderline", () => {
    // sqrt(2)·sqrt(2) − 2 is the square of the double nearest √2 minus 2: about 4.4e-16, not 0.
    const a = analysis({ mode: "system", f: "sqrt(2)*sqrt(2)*x - 2*x + y", g: "-x" });
    expect(a.system.approximate).toBe(true);
    // A = [[s² − 2, 1], [−1, 0]] with s the double nearest √2: tr = s² − 2 ≠ 0, det = 1, disc = tr² − 4 < 0:
    // a spiral, and rounding may be all that separates it from a center.
    expect(a.borderline).toEqual([{ quantity: "trace", exactZero: false }]);
    // π·y, −π·x: a = d = 0, the trace is 0 without any cancellation: a center, not borderline.
    const b = analysis({ mode: "system", f: "pi*y", g: "-pi*x" });
    expect(b.type).toBe("center");
    expect(b.borderline).toEqual([]);
    expect(centerByRounding(b)).toBe(false);
    expect(numericLinear(b).complex?.closed).toBe(true);
  });

  it("an exactly zero trace made by cancelling approximate terms is borderline too (second review)", () => {
    // a = 1/10 (the literal 0.10000000000000000001 enters as its double, shortest decimal 0.1), d = −1/10:
    // tr = 0 by cancellation, det = −1/100 + 1 = 99/100, disc = (1/5)² − 4 = −99/25 < 0: a center of this approximate system.
    const a = analysis({ mode: "system", f: "0.10000000000000000001*x + y", g: "-x - 0.1*y" });
    expect(a.type).toBe("center");
    expect(a.borderline).toEqual([{ quantity: "trace", exactZero: true }]);
    expect(centerByRounding(a)).toBe(true);
    expect(numericLinear(a).complex?.closed).toBe(false);
    // π x + y, −x − π y: the trace cancels too, but a saddle (det = −π² + 1 < 0) does not depend on it: not borderline.
    const s = analysis({ mode: "system", f: "pi*x + y", g: "-x - pi*y" });
    expect(s.type).toBe("saddle");
    expect(s.borderline).toEqual([]);
    // An exact system is never borderline: x' = x + 2y, y' = −x − y has tr = 0 exactly, a center for certain.
    expect(analysis({ mode: "system", f: "x + 2*y", g: "-x - y" }).borderline).toEqual([]);
  });

  it("the decimals of two distinct eigenvalues never cancel (Vieta for the small one)", () => {
    // λ = s ± √2 with s the double nearest √2 (see the labels test): the product is det A = s² − 2 > 0.
    const a = analysis({ mode: "system", f: "sqrt(2)*x + 2*y", g: "x + sqrt(2)*y" });
    const [l1, l2] = eigenvalueNumbers(a)!;
    expect(l1).toBeCloseTo(2 * Math.SQRT2, 14);
    expect(l2).toBeGreaterThan(0);
    expect(l1 * l2).toBeCloseTo(toNumber(a.det), 30);
    // Exact roots: 3 and −1 directly.
    expect(eigenvalueNumbers(analysis({ mode: "system", f: "x + y", g: "4*x + y" }))).toEqual([3, -1]);
  });

  it("the equilibrium of a forced constant: x'' + x = 2 is (2, 0)", () => {
    const a = analysis({ mode: "second", equation: "x'' + x = 2" });
    expect(a.equilibrium).toEqual({ kind: "point", at: [q(2), q(0)] });
  });
});

describe("analyzeLinear on a bare matrix", () => {
  it("is what the reader would give", () => {
    // [[−3, 1], [1, −3]]: tr −6, det 8, disc 4: λ = −2, −4; v = (1, 1), (1, −1): a stable node.
    const a = analyzeLinear({ A: [[q(-3), q(1)], [q(1), q(-3)]], b: [q(0), q(0)], approximate: false });
    expect(a.type).toBe("stable_node");
    expect(a.roots).toEqual({ kind: "distinct", values: [fn(q(-2)), fn(q(-4))] });
    expect(a.vectors).toEqual({ kind: "two", v: [[fn(q(1)), fn(q(1))], [fn(q(1)), fn(q(-1))]] });
  });
});

describe("a budget can stop the exact reading (second review)", () => {
  it("checks the budget often inside one large product of quasi-polynomials", () => {
    // 111 characters that once ran 5–7 s inside a single product without calling the checkpoint
    // (a hostile link with the eigen switch on). The checkpoint now runs before every term product:
    // the longest gap between two calls stays far below the 500 ms budget of the web shell.
    const F = "((1.2345678901234567+t)*(1.2345678901234567+exp(t)))^12*((9.876543210987654+t)*(9.876543210987654+exp(t)))^11*x";
    const start = performance.now();
    let last = start;
    let gap = 0;
    let stopped = false;
    try {
      linearAnalysisOf({ mode: "system", f: F, g: "y" }, () => {
        const now = performance.now();
        gap = Math.max(gap, now - last);
        last = now;
        if (now - start > 300) throw new RangeError("budget");
      });
    } catch (error) {
      stopped = error instanceof RangeError;
    }
    expect(stopped).toBe(true);
    expect(gap).toBeLessThan(250);
  });
});
