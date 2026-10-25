/**
 * Round 12: the derivation text (lib/labels-series). Expectations are derived by hand (the
 * recurrences and formulas are written next to each check); the vocabulary checks enforce rule 9
 * (only the student's symbols, the tool's own symbols explained) on every line of both languages.
 */
import { describe, expect, it } from "vitest";
import { labels, type Locale } from "./labels";
import { derivationText, formulaDerivation, seriesDerivation, seriesLetters, type Derivation } from "./labels-series";
import { constantCoefficientOde, constantsFor, solutionFormula } from "./series/decompose";
import { linearEquation, type SeriesMode } from "./series/equation";
import { plain } from "./series/notation";
import { polynomialOde, powerSeries } from "./series/power-series";
import { q, type Q } from "./series/rational";

function series(mode: SeriesMode, text: string, locale: Locale = "en", opts: { center?: Q; initial?: Q[]; params?: Record<string, number>; terms?: number } = {}): Derivation {
  const eq = linearEquation(mode, text, opts.params);
  if (!eq.ok) throw new Error(JSON.stringify(eq.failure));
  const ode = polynomialOde(eq.equation);
  if (!ode.ok) throw new Error(JSON.stringify(ode.reason));
  const result = powerSeries(ode.ode, opts.center ?? q(0));
  return seriesDerivation(labels(locale), { equation: eq.equation, result, terms: opts.terms ?? 8, initial: opts.initial ?? null, letters: seriesLetters(Object.keys(opts.params ?? {})) });
}
function formula(mode: SeriesMode, text: string, initial: Q[], locale: Locale = "en", params?: Record<string, number>): Derivation {
  const eq = linearEquation(mode, text, params);
  if (!eq.ok) throw new Error(JSON.stringify(eq.failure));
  const ode = constantCoefficientOde(eq.equation);
  if (!ode.ok) throw new Error(`order ${ode.order}`);
  const sol = solutionFormula(ode.ode);
  return formulaDerivation(labels(locale), { equation: eq.equation, formula: sol, t0: q(0), initial, constants: constantsFor(sol, q(0), initial), letters: seriesLetters(Object.keys(params ?? {})), check: null });
}
const lines = (d: Derivation) => [plain(d.title), ...d.steps.flatMap((s) => [s.title, ...s.lines.map(plain)]), ...d.notes.map(plain)];

describe("power-series derivations", () => {
  it("Airy: the shift, the n = 0 case, the recurrence a_{n+2} = a_{n-1}/((n+2)(n+1)), the coefficients", () => {
    const text = derivationText(series("second", "x'' - t*x = 0", "en", { initial: [q(1), q(0)] }));
    // -t x = -sum_k a_k t^(k+1); with n = k + 1 the sum starts at n = 1
    // the shift note uses non-breaking spaces so it never wraps in the middle
    expect(text).toContain("−t x = −Σ_{k=0}^{∞} aₖtᵏ⁺¹ = −Σ_{n=1}^{∞} aₙ₋₁tⁿ   (n = k + 1)");
    expect(text).toContain("n = 0: 2a₂ = 0, so a₂ = 0.");
    expect(text).toContain("aₙ₊₂ = aₙ₋₁ / ((n + 1)(n + 2)), for n ≥ 1.");
    expect(text).toContain("a₃ = (1/6)a₀"); // a3 = a0/(3*2)
    expect(text).toContain("a₇ = (1/504)a₁"); // a7 = a4/42 = a1/504
    expect(text).toContain("converges for every t");
    expect(text).toContain("x(0) = 1, x'(0) = 0: x(t) = 1 + (1/6)t³ + (1/180)t⁶ + …");
  });

  it("Legendre l = 2: x1 = 1 - 3t^2 is announced as a polynomial and the radius is 1", () => {
    const text = derivationText(series("second", "(1-t^2)*x'' - 2*t*x' + 6*x = 0"));
    // a_{n+2} = (n - 2)(n + 3) a_n / ((n + 2)(n + 1))
    expect(text).toContain("aₙ₊₂ = (n − 2)(n + 3)aₙ / ((n + 1)(n + 2)), for n ≥ 2.");
    expect(text).toContain("x₁(t) = 1 − 3t²");
    expect(text).toContain("x₁ is a polynomial");
    expect(text).toContain("x₂(t) = t − (2/3)t³ − (1/5)t⁵");
    expect(text).toContain("at distance 1 from the expansion point, so the series converges at least for |t| < 1.");
  });

  it("a parameter named a moves the coefficients to c", () => {
    const text = derivationText(series("second", "x'' + a*x = 0", "en", { params: { a: 1 } }));
    expect(text).toContain("cₙ");
    expect(text).not.toMatch(/aₙ/);
  });

  it("first order: dy/dt = 2ty, a1 = 0 and y1 = 1 + t² + (1/2)t⁴ + ...", () => {
    const text = derivationText(series("first", "2*t*y"));
    expect(text).toContain("dy/dt − 2t y = 0");
    expect(text).toContain("n = 0: a₁ = 0.");
    expect(text).toContain("y₁(t) = 1 + t² + (1/2)t⁴ + (1/6)t⁶ + (1/24)t⁸ + …");
  });

  it("a singular center: Bessel's t x'' + x' + t x = 0 at 0 is regular singular with indicial r² = 0", () => {
    const text = derivationText(series("second", "t*x'' + x' + t*x = 0"));
    expect(text).toContain("t = 0 is a singular point");
    expect(text).toContain("regular singular point");
    expect(text).toContain("indicial equation r² = 0: r = 0 (double root)");
  });

  it("Frobenius at Bessel's singular point: the recurrence n²aₙ = −aₙ₋₂, J0's coefficients, the logarithm for the second solution", () => {
    const text = derivationText(series("second", "t*x'' + x' + t*x = 0"));
    expect(text).toContain("For r = 0: n²aₙ = −aₙ₋₂ for n ≥ 1, so aₙ = −aₙ₋₂/n².");
    expect(text).toContain("x₁(t) = 1 − (1/4)t² + (1/64)t⁴ − (1/2304)t⁶");
    expect(text).toContain("contains the term x₁(t) ln|t|");
  });

  it("Frobenius with a free coefficient: t²x'' + tx' − x = 0 gives x₁ = t and x₂ = t⁻¹", () => {
    const text = derivationText(series("second", "t^2*x'' + t*x' - x = 0"));
    expect(text.split("\n")).toContain("   x₁(t) = t");
    expect(text).toContain("At n = 2 the factor of aₙ is 0 and so is the right-hand side, so a₂ is free; take a₂ = 0.");
    expect(text).toContain("x₂(t) = t⁻¹");
  });

  it("both languages build the same steps, line for line", () => {
    for (const [mode, eq] of [["second", "x'' - t*x = 1 + t"], ["first", "2*t*y"], ["second", "t*x'' + x' + t*x = 0"], ["second", "t^2*x'' + t*x' + (t^2 - 1/4)*x = 0"]] as const) {
      const en = series(mode, eq, "en", { initial: mode === "first" ? [q(1)] : [q(1), q(0)] });
      const zh = series(mode, eq, "zh", { initial: mode === "first" ? [q(1)] : [q(1), q(0)] });
      expect(zh.steps.map((s) => s.lines.length)).toEqual(en.steps.map((s) => s.lines.length));
      expect(zh.notes.length).toBe(en.notes.length);
    }
  });
});

describe("solution-formula derivations", () => {
  it("x'' + 3x' + 2x = 0 from x(0) = 1, x'(0) = 0: x = 2e^(-t) - e^(-2t)", () => {
    const text = derivationText(formula("second", "x'' + 3*x' + 2*x = 0", [q(1), q(0)]));
    expect(text).toContain("Discriminant Δ = 3² − 4·2 = 1.");
    expect(text).toContain("r₁ = −1, r₂ = −2");
    expect(text).toContain("C₁ = 2, C₂ = −1");
    expect(text).toContain("x(t) = 2e⁻ᵗ − e⁻²ᵗ");
    expect(text).toContain("overdamped");
  });

  it("x'' + x = cos(t) is resonant: x_p = (1/2)t sin(t)", () => {
    const text = derivationText(formula("second", "x'' + x = cos(t)", [q(0), q(0)]));
    expect(text).toContain("try xₚ = t(A cos(t) + B sin(t))");
    expect(text).toContain("±i is a simple root of the characteristic equation");
    expect(text).toContain("xₚ(t) = (1/2)t sin(t)");
  });

  it("dy/dt = -2y + 4 from y(0) = 0: y = -2e^(-2t) + 2, with one undetermined coefficient named in the singular", () => {
    const text = derivationText(formula("first", "-2*y + 4", [q(0)]));
    expect(text).toContain("dy/dt + 2y = 4");
    expect(text).toContain("(A is the coefficient to be found)");
    expect(text).toContain("y(t) = −2e⁻²ᵗ + 2");
    expect(text).toContain("steady state");
  });
});

describe("the student's vocabulary (rule 9)", () => {
  const LONE_Y = /(^|[^A-Za-z0-9_])y(?![A-Za-z0-9_])/;
  const LONE_X = /(^|[^A-Za-z0-9_'])x(?![A-Za-z0-9_'₁₂ₕₚ(])/;
  it("a second-order derivation never shows a y, in either language", () => {
    for (const locale of ["en", "zh"] as const) {
      for (const d of [
        series("second", "(1-t^2)*x'' - 2*t*x' + 6*x = 0", locale, { initial: [q(1), q(0)] }),
        formula("second", "x'' + 0.5*x' + 4*x = cos(t)", [q(1), q(0)], locale),
      ]) {
        for (const line of lines(d)) expect(line, line).not.toMatch(LONE_Y);
      }
    }
  });
  it("a first-order derivation never shows an x or dy/dx", () => {
    for (const locale of ["en", "zh"] as const) {
      for (const d of [series("first", "2*t*y", locale, { initial: [q(1)] }), formula("first", "-2*y + 4", [q(0)], locale)]) {
        for (const line of lines(d)) {
          expect(line, line).not.toMatch(/dy\/dx/);
          expect(line, line).not.toMatch(LONE_X);
        }
      }
    }
  });
  it("the Chinese derivation carries no English sentence words", () => {
    const zh = lines(series("second", "(1-t^2)*x'' - 2*t*x' + 6*x = 0", "zh", { initial: [q(1), q(0)] })).join("\n");
    expect(zh).not.toMatch(/\b(the|coefficient|series|converges|where|Shown)\b/);
  });
});
