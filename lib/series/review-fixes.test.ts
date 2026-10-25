/**
 * Round 12 review: one regression per confirmed finding of the adversarial review, each expectation
 * derived by hand in the comment next to it.
 */
import { describe, expect, it } from "vitest";
import { labels } from "../labels";
import { derivationText, formulaDerivation, seriesDerivation, seriesLetters } from "../labels-series";
import { computeSeriesPanel, DEFAULT_SERIES_SETTINGS, type SeriesSettings } from "../series-panel";
import { constantCoefficientOde, constantsFor, evaluateSolution, particularResidualIsZero, solutionFormula } from "./decompose";
import { linearEquation, type SeriesMode } from "./equation";
import { polynomialOde, powerSeries, type SeriesAtSingularPoint, type SeriesSolution } from "./power-series";
import { q, type Q, toNumber } from "./rational";

const L = labels("en");
const ranges = { tRange: { min: -3, max: 3 }, vRange: { min: -3, max: 3 } };
const settings = (s: Partial<SeriesSettings>): SeriesSettings => ({ ...DEFAULT_SERIES_SETTINGS, kind: "series", ...s });

function result(mode: SeriesMode, text: string, center: Q = q(0), opts: { terms?: number; params?: Record<string, number> } = {}): SeriesSolution | SeriesAtSingularPoint {
  const eq = linearEquation(mode, text, opts.params);
  if (!eq.ok) throw new Error(JSON.stringify(eq.failure));
  const ode = polynomialOde(eq.equation);
  if (!ode.ok) throw new Error(JSON.stringify(ode.reason));
  return powerSeries(ode.ode, center, { terms: opts.terms });
}

describe("power series", () => {
  it("Frobenius with an integer gap is decided at n = N whatever the number of terms shown (Bessel order 15, gap 30)", () => {
    // [(n + r)^2 - 225] a_n = -a_{n-2}; r = -15: n(n - 30) a_n = -a_{n-2}, a_28 != 0, so at n = 30
    // 0 * a_30 = -a_28 != 0: no series, a logarithm.
    const r = result("second", "t^2*x'' + t*x' + (t^2 - 225)*x = 0", q(0), { terms: 8 });
    if (r.status !== "singular" || r.point.kind !== "regular" || "blocked" in r.point.frobenius) throw new Error();
    expect(r.point.frobenius.second).toEqual({ kind: "logInteger", gap: 30 });
    // Euler t^2 x'' + t x' - 225 x = 0: n(n - 30) a_n = 0, a_30 free: x2 = t^-15 is a series.
    const e = result("second", "t^2*x'' + t*x' - 225*x = 0", q(0), { terms: 8 });
    if (e.status !== "singular" || e.point.kind !== "regular" || "blocked" in e.point.frobenius) throw new Error();
    expect(e.point.frobenius.second.kind).toBe("series");
    if (e.point.frobenius.second.kind === "series") expect(e.point.frobenius.second.root.freeIndex).toBe(30);
  });

  it("(t^2 - 2) x'' + x = 0 is read exactly although the picture's sampled check fails at t = 1.4142", () => {
    // -2 (n+2)(n+1) a_{n+2} + n(n-1) a_n + a_n = 0: n = 0 gives -4 a_2 + a_0 = 0, a_2 = a_0/4; singular at +-sqrt(2).
    const r = result("second", "(t^2 - 2)*x'' + x = 0");
    if (r.status !== "ok") throw new Error();
    expect(r.coefficients[2]).toEqual([q(1, 4), q(0), q(0)]);
    expect(r.radius.kind === "finite" && r.radius.distance.squared).toEqual(q(2));
  });

  it("a common factor of every term is cancelled: t x'' + t x = 0 is x'' + x = 0, ordinary at 0", () => {
    const eq = linearEquation("second", "t*x'' + t*x = 0");
    if (!eq.ok) throw new Error();
    expect(eq.equation.commonFactor).toEqual([q(0), q(1)]);
    const r = result("second", "t*x'' + t*x = 0");
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.radius.kind).toBe("infinite");
  });

  it("round() follows mathjs, half away from zero: round(-2.5) = -3, the equation the picture integrates", () => {
    const f = constantCoefficientOde((linearEquation("second", "x'' + round(-2.5)*x = 0") as { ok: true; equation: never }).equation);
    if (!f.ok) throw new Error();
    expect(f.ode.P[0]).toEqual(q(-3));
  });

  it("the radius never comes from a wrong numerical root: far roots k ± i, -k ± i√2 and near ±i√3 give √3 (k = 10^4)", () => {
    const r = result("second", "((t-k)^2 + 1)*((t+k)^2 + 2)*(t^2 + 3)*x'' + x = 0", q(0), { params: { k: 10000 } });
    if (r.status !== "ok") throw new Error();
    expect(r.radius.kind).toBe("finite");
    if (r.radius.kind === "finite") expect(r.radius.distance.value).toBeCloseTo(Math.sqrt(3), 9);
  });

  it("Wilkinson's 14 factors (t-1)...(t-14): the rational roots are verified exactly, the radius is 1", () => {
    const r = result("second", "(t-1)*(t-2)*(t-3)*(t-4)*(t-5)*(t-6)*(t-7)*(t-8)*(t-9)*(t-10)*(t-11)*(t-12)*(t-13)*(t-14)*x'' + x = 0");
    if (r.status !== "ok" || r.radius.kind !== "finite") throw new Error();
    expect(r.radius.distance.squared).toEqual(q(1));
  });

  it("a radius from unlocatable roots is a guaranteed lower bound, never too large: t^40 = 10^6 has |t| = 10^0.15", () => {
    const r = result("second", "(t^40 - k)*x'' + x = 0", q(0), { params: { k: 1e6 } });
    if (r.status !== "ok") throw new Error();
    const value = r.radius.kind === "finite" ? r.radius.distance.value : r.radius.kind === "lowerBound" ? r.radius.value : Infinity;
    expect(value).toBeLessThanOrEqual(10 ** 0.15 * (1 + 1e-9));
    expect(value).toBeGreaterThan(0);
  });

  it("the chosen initial values' series is proven to stop on the combined coefficients: x'' + x = 1 from (1, 0) is x = 1", () => {
    const r = result("second", "x'' + x = 1");
    const text = derivationText(seriesDerivation(L, { equation: (linearEquation("second", "x'' + x = 1") as { ok: true; equation: never }).equation, result: r, terms: 6, initial: [q(1), q(0)], letters: seriesLetters([]) }));
    expect(text.split("\n")).toContain("   x(0) = 1, x'(0) = 0: x(t) = 1");
  });

  it("a negative denominator moves to the numerator: (t - 1) x'' + x = 0", () => {
    // -(n+2)(n+1) a_{n+2} + (n+1) n a_{n+1} + a_n = 0
    const eq = (linearEquation("second", "(t-1)*x'' + x = 0") as { ok: true; equation: never }).equation;
    const text = derivationText(seriesDerivation(L, { equation: eq, result: result("second", "(t-1)*x'' + x = 0"), terms: 6, initial: null, letters: seriesLetters([]) }));
    expect(text).toContain("aₙ₊₂ = (n(n + 1)aₙ₊₁ + aₙ) / ((n + 1)(n + 2))");
  });
});

describe("cost", () => {
  it("a tower of constants is refused at once for its digits, never computed for a minute", () => {
    const start = performance.now();
    // 10^40 has 34 hex digits; its 40th power would have about 1330 > MAX_RATIONAL_HEX_DIGITS.
    const a = linearEquation("first", "(((((10^40)^40)^40)^40)^40)*y");
    expect(!a.ok && a.failure.reason).toBe("tooManyDigits");
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("the budget reaches the exact reading: swelling fractions stop within it instead of running for a minute", () => {
    const start = performance.now();
    const deadline = start + 300;
    const checkpoint = () => {
      if (performance.now() > deadline) throw new RangeError("budget");
    };
    let outcome = "finished";
    try {
      computeSeriesPanel(L, { mode: "first", text: "y*(t+pi)^16/(t^2+1)^8", settings: settings({}), ...ranges, checkpoint });
    } catch (error) {
      outcome = error instanceof RangeError ? "budget" : "other";
    }
    expect(outcome === "finished" || outcome === "budget").toBe(true);
    // one checkpoint interval past the deadline at most (a single gcd step), far from the minute it took
    expect(performance.now() - start).toBeLessThan(1500);
  });

  it("a center with hundreds of digits is refused before the Taylor shift", () => {
    const start = performance.now();
    const r = computeSeriesPanel(L, { mode: "second", text: "(1+t)^40*x'' + x = 0", settings: settings({ center: 1e-300 }), ...ranges });
    expect(r.status).toBe("unavailable");
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("solution formula", () => {
  it("near resonance on a decimal frequency (cos(sqrt(2) t) against r = ±i√2) is explained, not printed with 10^15 coefficients", () => {
    const r = computeSeriesPanel(L, { mode: "second", text: "x'' + 2*x = cos(sqrt(2)*t)", settings: settings({ kind: "formula" }), ...ranges });
    expect(r.status).toBe("unavailable");
  });

  it("the check is exact substitution plus a well-conditioned comparison near t0: y = (cos t + sin t)/2 passes", () => {
    // dy/dt = y - sin t, y(0) = 1/2: y_p = (cos t + sin t)/2 and C = 0 exactly
    const r = computeSeriesPanel(L, { mode: "first", text: "y - sin(t)", settings: settings({ kind: "formula", initial: [0.5, 0] }), tRange: { min: 0, max: 20 }, vRange: { min: -3, max: 3 } });
    if (r.status !== "ok" || !r.check || !r.check.numeric) throw new Error();
    expect(r.check.residualExact).toBe(true);
    expect(r.check.numeric.ok).toBe(true);
  });

  it("constants anchored at t0 stay finite far from 0: x'' - x = 0 from x(1000) = 1, x'(1000) = 0 is cosh(t - 1000)", () => {
    const eq = (linearEquation("second", "x'' - x = 0") as { ok: true; equation: never }).equation;
    const ode = constantCoefficientOde(eq);
    if (!ode.ok) throw new Error();
    const sol = solutionFormula(ode.ode);
    const c = constantsFor(sol, q(1000), [q(1), q(0)]);
    // anchored basis e^(t-1000), e^-(t-1000): C1 = C2 = 1/2 exactly (polynomial right-hand side 0)
    expect(c.exact).toEqual([q(1, 2), q(1, 2)]);
    expect(evaluateSolution(sol, c.values, 1000).total(1000)).toBeCloseTo(1, 12);
  });

  it("no steady state is claimed when u_p dies out faster than u_h: x'' + 3x' + 2x = e^(-5t)", () => {
    const r = computeSeriesPanel(L, { mode: "second", text: "x'' + 3*x' + 2*x = exp(-5*t)", settings: settings({ kind: "formula" }), ...ranges });
    if (r.status !== "ok") throw new Error();
    expect(derivationText(r.derivation)).not.toContain("steady state");
  });

  it("several right-hand side terms get their own unknowns and names, joined by superposition", () => {
    const r = computeSeriesPanel(L, { mode: "second", text: "x'' + x = 1 + cos(2*t)", settings: settings({ kind: "formula" }), ...ranges });
    if (r.status !== "ok") throw new Error();
    const text = derivationText(r.derivation);
    expect(text).toContain("xₚ₁ = A");
    expect(text).toContain("xₚ₂ = D cos(2t) + E sin(2t)");
    expect(text).toContain("By superposition xₚ = xₚ₁ + xₚ₂.");
  });

  it("the exact residual check sees the particular solution satisfy the equation", () => {
    const ode = constantCoefficientOde((linearEquation("second", "x'' + x = t*exp(t)*sin(2*t)") as { ok: true; equation: never }).equation);
    if (!ode.ok) throw new Error();
    expect(particularResidualIsZero(solutionFormula(ode.ode))).toBe(true);
  });

  it("a fraction on the right-hand side is named as the reason, not the coefficients: x'' + x = 1/t", () => {
    const r = computeSeriesPanel(L, { mode: "second", text: "x'' + x = 1/t", settings: settings({ kind: "formula" }), ...ranges });
    expect(r.status).toBe("unavailable");
    if (r.status === "unavailable") expect(derivationText({ title: r.message, steps: [], notes: [] })).toContain("right-hand side");
  });

  it("a number beyond the double range prints with an exponent, never Infinity", () => {
    // 1e300 * 1e300 = 10^600, beyond the double range (the exponent cap refuses 10^400 written as a power)
    const eq = (linearEquation("second", "x'' + 1e300*1e300*x = 0") as { ok: true; equation: never }).equation;
    const ode = constantCoefficientOde(eq);
    if (!ode.ok) throw new Error();
    const text = derivationText(formulaDerivation(L, { equation: eq, formula: solutionFormula(ode.ode), t0: q(0), initial: null, constants: null, letters: seriesLetters([]), check: null }));
    expect(text).not.toMatch(/Infinity|NaN/);
    expect(text).toContain("10⁶⁰⁰");
    expect(toNumber(q(1))).toBe(1);
  });
});
