/**
 * Solution formula of constant-coefficient equations (round 12). Expectations are derived by hand:
 * characteristic roots from the quadratic formula, particular solutions from undetermined
 * coefficients (written out next to each case), constants from the initial values.
 */
import { describe, expect, it } from "vitest";
import { constantCoefficientOde, constantsFor, evaluateSolution, hasResonance, particularRealForm, solutionFormula, type SolutionFormula } from "./decompose";
import { linearEquation, type SeriesMode } from "./equation";
import { q, type Q, toNumber } from "./rational";

function formula(mode: SeriesMode, text: string, params?: Record<string, number>): SolutionFormula {
  const eq = linearEquation(mode, text, params);
  if (!eq.ok) throw new Error(JSON.stringify(eq.failure));
  const ode = constantCoefficientOde(eq.equation);
  if (!ode.ok) throw new Error(`not constant at order ${ode.order}`);
  return solutionFormula(ode.ode);
}
const n = (v: Q) => toNumber(v);

describe("characteristic roots", () => {
  it("x'' + 3x' + 2x = 0: r = -1, -2 (overdamped); x(0) = 1, x'(0) = 0 gives C1 = 2, C2 = -1", () => {
    const f = formula("second", "x'' + 3*x' + 2*x = 0");
    expect(f.discriminant).toEqual(q(1));
    expect(f.roots).toEqual({ kind: "distinct", r1: q(-1), r2: q(-2) });
    expect(f.damping).toBe("overdamped");
    expect(constantsFor(f, q(0), [q(1), q(0)]).exact).toEqual([q(2), q(-1)]);
  });

  it("x'' + 2x' + x = 0: repeated r = -1 (critical); x = (1 + t) e^(-t)", () => {
    const f = formula("second", "x'' + 2*x' + x = 0");
    expect(f.roots).toEqual({ kind: "repeated", root: q(-1) });
    expect(f.damping).toBe("critical");
    expect(constantsFor(f, q(0), [q(1), q(0)]).exact).toEqual([q(1), q(1)]);
  });

  it("x'' + x' + x = 0: r = -1/2 +- (sqrt(3)/2) i (underdamped)", () => {
    const f = formula("second", "x'' + x' + x = 0");
    expect(f.discriminant).toEqual(q(-3));
    expect(f.roots).toEqual({ kind: "complex", alpha: q(-1, 2), beta: { scale: q(1, 2), radicand: q(3) } });
    expect(f.damping).toBe("underdamped");
    expect(constantsFor(f, q(0), [q(1), q(0)]).exact).toBeNull();
  });

  it("x'' + 4x = 0: r = +-2i (undamped); C1 = 1, C2 = 0 from x(0) = 1, x'(0) = 0", () => {
    const f = formula("second", "x'' + 4*x = 0");
    expect(f.roots).toEqual({ kind: "complex", alpha: q(0), beta: { exact: q(2) } });
    expect(f.damping).toBe("undamped");
    expect(constantsFor(f, q(0), [q(1), q(0)]).exact).toEqual([q(1), q(0)]);
  });

  it("x'' - 2x = 0: r = +-sqrt(2), irrational", () => {
    const f = formula("second", "x'' - 2*x = 0");
    expect(f.roots).toEqual({ kind: "distinctIrrational", center: q(0), scale: q(1, 2), disc: q(8) });
    expect(f.damping).toBeNull();
  });

  it("slider parameters are exact decimals: b = 2, k = 1 is exactly critical", () => {
    const f = formula("second", "x'' + b*x' + k*x = 0", { b: 2, k: 1 });
    expect(f.roots.kind).toBe("repeated");
    const g = formula("second", "x'' + b*x' + k*x = 0", { b: 1.99, k: 1 });
    expect(g.roots.kind).toBe("complex");
  });
});

describe("particular solutions (undetermined coefficients)", () => {
  it("x'' + 4x = cos(t): chi(i) = 3, x_p = cos(t)/3", () => {
    const f = formula("second", "x'' + 4*x = cos(t)");
    expect(hasResonance(f)).toBe(false);
    expect(particularRealForm(f)).toEqual([{ alpha: q(0), beta: q(1), cos: [q(1, 3)], sin: [] }]);
  });

  it("x'' + x = cos(t) is resonant: x_p = (t/2) sin(t)", () => {
    // chi(i) = 0, chi'(i) = 2i: b0 = (1/2) / (2i) = -i/4, x_p = 2 Re(t (-i/4) e^(it)) = (t/2) sin t
    const f = formula("second", "x'' + x = cos(t)");
    expect(hasResonance(f)).toBe(true);
    expect(f.parts.every((p) => p.multiplicity === 1)).toBe(true);
    expect(particularRealForm(f)).toEqual([{ alpha: q(0), beta: q(1), cos: [], sin: [q(0), q(1, 2)] }]);
  });

  it("x'' + x = t: x_p = t;  x'' + x' = 1: x_p = t;  x'' = 1: x_p = t^2/2", () => {
    expect(particularRealForm(formula("second", "x'' + x = t"))).toEqual([{ alpha: q(0), beta: q(0), cos: [q(0), q(1)], sin: [] }]);
    expect(particularRealForm(formula("second", "x'' + x' = 1"))).toEqual([{ alpha: q(0), beta: q(0), cos: [q(0), q(1)], sin: [] }]);
    expect(particularRealForm(formula("second", "x'' = 1"))).toEqual([{ alpha: q(0), beta: q(0), cos: [q(0), q(0), q(1, 2)], sin: [] }]);
  });

  it("x'' - x = e^t is resonant: x_p = (t/2) e^t", () => {
    const f = formula("second", "x'' - x = exp(t)");
    expect(particularRealForm(f)).toEqual([{ alpha: q(1), beta: q(0), cos: [q(0), q(1, 2)], sin: [] }]);
    const g = formula("second", "x'' - x = e^t");
    expect(particularRealForm(g)).toEqual(particularRealForm(f));
  });

  it("first order: dy/dt = -2y + 4 gives y = 2 - 2 e^(-2t) from y(0) = 0", () => {
    const f = formula("first", "-2*y + 4");
    expect(f.roots).toEqual({ kind: "single", root: q(-2) });
    expect(particularRealForm(f)).toEqual([{ alpha: q(0), beta: q(0), cos: [q(2)], sin: [] }]);
    const c = constantsFor(f, q(0), [q(0)]);
    expect(c.exact).toEqual([q(-2)]);
    const u = evaluateSolution(f, c.values);
    expect(u.total(1)).toBeCloseTo(2 - 2 * Math.exp(-2), 14);
  });

  it("dy/dt = y + t: y_p = -t - 1", () => {
    const f = formula("first", "y + t");
    expect(particularRealForm(f)).toEqual([{ alpha: q(0), beta: q(0), cos: [q(-1), q(-1)], sin: [] }]);
  });

  it("constants at t0 != 0 come out numerically and reproduce the initial values", () => {
    const f = formula("second", "x'' + x' + x = cos(2*t)");
    const t0 = q(1);
    const c = constantsFor(f, t0, [q(1, 2), q(-1)]);
    expect(c.exact).toBeNull();
    // the homogeneous basis is anchored at t0 = 1: e^(alpha (t - 1)) cos(beta (t - 1)), ...
    const u = evaluateSolution(f, c.values, 1);
    expect(u.total(1)).toBeCloseTo(0.5, 12);
    const h = 1e-6;
    expect((u.total(1 + h) - u.total(1 - h)) / (2 * h)).toBeCloseTo(-1, 6);
    expect(n(t0)).toBe(1);
  });
});

describe("what the formula path refuses", () => {
  it("a coefficient that depends on t", () => {
    const eq = linearEquation("second", "x'' + t*x = 0");
    if (!eq.ok) throw new Error();
    expect(constantCoefficientOde(eq.equation)).toEqual({ ok: false, order: 0 });
  });
});
