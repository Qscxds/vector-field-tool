/**
 * Round 12, second review round: one regression per defect the verification of the first round's
 * fixes found (still broken or newly introduced), each expectation derived by hand next to it.
 */
import { describe, expect, it } from "vitest";
import { fill, labels } from "../labels";
import { derivationText } from "../labels-series";
import { computeSeriesPanel, DEFAULT_SERIES_SETTINGS, type SeriesPanelResult, type SeriesSettings } from "../series-panel";
import { decodeState, DEFAULT_STATE } from "../url-state";
import { growthRate, constantCoefficientOde, particularResidualIsZero, solutionFormula, type SolutionFormula } from "./decompose";
import { inexactLiteral, linearEquation, readableAsLinearSecondOrder, type SeriesMode } from "./equation";
import { structurallyLinear } from "./linear-form";
import { decimalDirected, decimalDown, distinctDigits, plain, rationalDecimal } from "./notation";
import { GCD_TEST_PRIMES, modularGcdDegree, pgcd, pmul, type Poly, ppow } from "./poly";
import { polynomialOde, powerSeries, type SeriesAtSingularPoint, type SeriesSolution } from "./power-series";
import { q, type Q } from "./rational";
import { inclusionRadii, numericRoots, rootFreeRadius } from "./roots";
import { mathjs } from "../core/parse";

const L = labels("en");
const ranges = { tRange: { min: -3, max: 3 }, vRange: { min: -3, max: 3 } };
const series = (s: Partial<SeriesSettings> = {}): SeriesSettings => ({ ...DEFAULT_SERIES_SETTINGS, kind: "series", ...s });
const formula = (s: Partial<SeriesSettings> = {}): SeriesSettings => ({ ...DEFAULT_SERIES_SETTINGS, kind: "formula", ...s });
const TEN = BigInt(10);

function panel(mode: SeriesMode, text: string, settings: SeriesSettings, extra: Partial<Parameters<typeof computeSeriesPanel>[1]> = {}): SeriesPanelResult {
  return computeSeriesPanel(L, { mode, text, settings, ...ranges, ...extra });
}
function text(r: SeriesPanelResult): string {
  if (r.status !== "ok") throw new Error(`not ok: ${r.status === "unavailable" ? JSON.stringify(r.message) : r.status}`);
  return derivationText(r.derivation);
}
function message(r: SeriesPanelResult): string {
  if (r.status !== "unavailable") throw new Error(`not unavailable: ${r.status}`);
  return plain(r.message);
}
/** The label text before its first placeholder. */
const head = (label: string) => label.split("{")[0];
function seriesResult(mode: SeriesMode, textIn: string, center: Q = q(0), params?: Record<string, number>): SeriesSolution | SeriesAtSingularPoint {
  const eq = linearEquation(mode, textIn, params);
  if (!eq.ok) throw new Error(JSON.stringify(eq.failure));
  const ode = polynomialOde(eq.equation);
  if (!ode.ok) throw new Error(JSON.stringify(ode.reason));
  return powerSeries(ode.ode, center);
}
function formulaOf(mode: SeriesMode, textIn: string): SolutionFormula {
  const eq = linearEquation(mode, textIn);
  if (!eq.ok) throw new Error(JSON.stringify(eq.failure));
  const ode = constantCoefficientOde(eq.equation);
  if (!ode.ok) throw new Error("not constant");
  return solutionFormula(ode.ode);
}
const poly = (...c: (number | Q)[]): Poly => c.map((v) => (typeof v === "number" ? q(v) : v));
const P1 = GCD_TEST_PRIMES[0];

describe("gcd: the modular coprimality test", () => {
  it("(t + pi)^16 and (t^2 + 1)^8 are coprime, proved without one step of the exact sequence", () => {
    // The roots of (t^2 + 1)^8 are ±i, that of the other is the real -3.141592653589793: no common factor.
    const piDec = q(BigInt("3141592653589793"), TEN ** BigInt(15));
    let steps = 0;
    expect(pgcd(ppow(poly(piDec, 1), 16), ppow(poly(1, 0, 1), 8), () => steps++)).toEqual(poly(1));
    expect(steps).toBe(0);
  });

  it("finds real common factors: t of t(t + 1) and t(t + 2); t^2 + 1 next to a denominator divisible by the first prime", () => {
    expect(pgcd(poly(0, 1, 1), poly(0, 2, 1))).toEqual(poly(0, 1));
    const a = pmul(poly(1, 0, 1), poly(q(BigInt(1), P1), 1)); // (t^2 + 1)(t + 1/p1)
    const b = pmul(poly(1, 0, 1), poly(5, 1));
    expect(modularGcdDegree(a, b, P1)).toBeNull();
    expect(pgcd(a, b)).toEqual(poly(1, 0, 1));
  });

  it("a leading coefficient divisible by the prime skips it; an unlucky prime is caught by the exact sequence", () => {
    // (p1 t + 1)(t + 2) and (t + 2)(t + 3): gcd t + 2.
    expect(pgcd(pmul(poly(1, q(P1)), poly(2, 1)), pmul(poly(2, 1), poly(3, 1)))).toEqual(poly(2, 1));
    // t + 1 and t + 1 + p1 p2 p3 agree modulo every test prime but have different roots: gcd 1.
    const N = GCD_TEST_PRIMES.reduce((m, p) => m * p, BigInt(1));
    expect(pgcd(poly(1, 1), [q(BigInt(1) + N), q(1)])).toEqual(poly(1));
  });

  it("modularGcdDegree: 0 for t + 1/2 and t + 1, null when the prime divides a denominator", () => {
    expect(modularGcdDegree(poly(q(1, 2), 1), poly(1, 1), P1)).toBe(0);
    expect(modularGcdDegree(poly(q(BigInt(1), P1), 1), poly(1, 1), P1)).toBeNull();
  });

  it("keeps gcd(0, 0) = 0 and gcd(a, 0) = monic a", () => {
    expect(pgcd([], [])).toEqual([]);
    expect(pgcd(poly(2, 4), [])).toEqual(poly(q(1, 2), 1));
  });
});

describe("roots: proven distances", () => {
  it("inclusion radii of good approximations of t^3 - 2 are tiny and cover the true roots", () => {
    // Roots 2^(1/3) e^(2 pi i k / 3): every one lies within the radius of some approximation.
    const p = poly(-2, 0, 0, 1);
    const { roots, ok } = numericRoots([-2, 0, 0, 1]);
    expect(ok).toBe(true);
    const radii = inclusionRadii(p, roots);
    if (!radii) throw new Error();
    const c = Math.cbrt(2);
    for (const k of [0, 1, 2]) {
      const re = c * Math.cos((2 * Math.PI * k) / 3);
      const im = c * Math.sin((2 * Math.PI * k) / 3);
      expect(roots.some((z, i) => Math.hypot(z.re - re, z.im - im) <= radii[i] + 1e-15)).toBe(true);
    }
    for (const r of radii) expect(r).toBeLessThan(1e-12);
  });

  it("a coefficient beyond the double range: (10^400 t^3 - 2) x'' + x = 0 never claims more than |t| < (2/10^400)^(1/3)", () => {
    // |t|^3 = 2·10^-400: |t| = 2^(1/3) 10^(-400/3) = 5.848035476…·10^-134.
    const truth = Math.cbrt(2) * 10 ** (-400 / 3);
    const r = seriesResult("second", "((10^40)^10*t^3 - 2)*x'' + x = 0");
    if (r.status !== "ok") throw new Error();
    const value = r.radius.kind === "lowerBound" ? r.radius.value : r.radius.kind === "finite" ? r.radius.distance.lower : Infinity;
    expect(value).toBeLessThanOrEqual(truth);
    expect(value).toBeGreaterThan(0.999 * truth);
  });

  it("rootFreeRadius reads tiny and huge coefficients by their logarithms", () => {
    // p(s) = 10^400 s^3 - 2: |b0| = 2 = 10^400 rho^3 gives rho = (2·10^-400)^(1/3), a slight underestimate.
    const truth = Math.cbrt(2) * 10 ** (-400 / 3);
    const rho = rootFreeRadius([q(-2), q(0), q(0), q(TEN ** BigInt(400))], q(0));
    expect(rho).toBeLessThanOrEqual(truth);
    expect(rho).toBeGreaterThan(truth * (1 - 1e-9));
  });

  it("an ill-conditioned product (t^2 + 1e-16)((t - 1e8)^2 + 3): the guarantee never exceeds the true 1e-8", () => {
    // The nearest singular points are ±1e-8 i (1e-16 enters as exactly 10^-16).
    const r = seriesResult("second", "(t^2 + 1e-16)*((t - 100000000)^2 + 3)*x'' + x = 0");
    if (r.status !== "ok") throw new Error();
    const value = r.radius.kind === "lowerBound" ? r.radius.value : r.radius.kind === "finite" ? r.radius.distance.lower : Infinity;
    expect(value).toBeLessThanOrEqual(1e-8);
    // The root-free bound alone: 1e16 rho^2 ≈ 1 gives about 1e-8.
    expect(value).toBeGreaterThan(0.99e-8);
  });

  it("a far pair k ± i seen from t0 = k = 1e8 (with t^2 + 3): never more than the true distance 1", () => {
    const r = seriesResult("second", "((t - 100000000)^2 + 1)*(t^2 + 3)*x'' + x = 0", q(100000000));
    if (r.status !== "ok") throw new Error();
    const value = r.radius.kind === "lowerBound" ? r.radius.value : r.radius.kind === "finite" ? r.radius.distance.lower : Infinity;
    expect(value).toBeLessThanOrEqual(1);
    expect(value).toBeGreaterThan(0);
  });
});

describe("notation", () => {
  it("rationalDecimal rounds half away from zero beyond the double range, with the carry", () => {
    expect(rationalDecimal(q(BigInt(1234567890) * TEN ** BigInt(400)), 6)).toBe("1.23457·10⁴⁰⁹");
    // 19999999·10^-417 = 1.9999999·10^-410 rounds to 2.00000: the carry gives 2·10^-410.
    expect(rationalDecimal(q(BigInt(19999999), TEN ** BigInt(417)), 6)).toBe("2·10⁻⁴¹⁰");
    expect(rationalDecimal(q(BigInt(2) * TEN ** BigInt(400), 3), 6)).toBe("6.66667·10³⁹⁹");
    // 9.999999·10^399 rounds to 10.0000·10^399 = 1·10^400.
    expect(rationalDecimal(q(BigInt(9999999) * TEN ** BigInt(400), TEN ** BigInt(7)), 6)).toBe("1·10⁴⁰⁰");
  });

  it("decimalDown and decimalDirected never round past the value", () => {
    expect(decimalDown(1.2206555616, 6)).toBe("1.22065");
    expect(decimalDown(1.4125375446227544)).toBe("1.412");
    expect(decimalDirected(12344.678, 7, "up")).toBe("12344.68");
    expect(decimalDirected(12346.678, 7, "down")).toBe("12346.67");
    expect(decimalDirected(-54322.5, 8, "up")).toBe("−54322.5");
  });

  it("distinctDigits raises the digits until different exponents print differently", () => {
    // 0.9999999999999 next to 1: at 12 digits or fewer both print "1"; at 13 they differ.
    expect(distinctDigits([q(1), q(BigInt(9999999999999), TEN ** BigInt(13))])).toBe(13);
    expect(distinctDigits([q(1), q(2)])).toBe(6);
  });
});

describe("the linear-form reader", () => {
  const A = (g: string) => {
    const eq = linearEquation("first", g);
    if (!eq.ok) throw new Error(JSON.stringify(eq.failure));
    // dy/dt = A y: P0 = -A, P1 = 1.
    const p0 = eq.equation.P[0].values().next().value;
    return p0 ? -Number(p0.coef.re[0].n) / Number(p0.coef.re[0].d) : 0;
  };

  it("round(a, n) as mathjs evaluates it: half away from zero to n places", () => {
    // 1.005 -> 1.01, -1.005 -> -1.01, -0.125 -> -0.13, -0.25 to one place -> -0.3, -2.5 to none -> -3.
    expect(A("round(1.005, 2)*y")).toBe(1.01);
    expect(A("round(-1.005, 2)*y")).toBe(-1.01);
    expect(A("round(-0.125, 2)*y")).toBe(-0.13);
    expect(A("round(-0.25, 1)*y")).toBe(-0.3);
    expect(A("round(-2.5, 0)*y")).toBe(-3);
    expect(mathjs.round(1.005, 2)).toBe(1.01);
  });

  it("round with a number of places that is not a whole number from 0 to 15 is refused, as mathjs refuses it, for that reason", () => {
    for (const g of ["round(2.5, 0.5)*y", "round(1234.5678, -2)*y"]) {
      const eq = linearEquation("first", g);
      expect(!eq.ok && eq.failure.reason, g).toBe("invalidArgument");
    }
  });

  it("notFinite names the student's fragment, not a computed value", () => {
    const cases: [string, string][] = [["exp(800)*y", "exp(800)"], ["cosh(800)*y", "cosh(800)"], ["y + cosh(800 + t)", "cosh(800 + t)"], ["y + sinh(t + 800)", "sinh(t + 800)"]];
    for (const [g, fragment] of cases) {
      const eq = linearEquation("first", g);
      expect(eq.ok ? null : eq.failure, g).toEqual({ reason: "notFinite", fragment });
    }
  });

  it("the digit cap has its own reason; a constant base takes any whole power exactly", () => {
    const big = linearEquation("first", "((10^40)^40)*y");
    expect(!big.ok && big.failure.reason).toBe("tooManyDigits");
    expect(fill(L.series.failTooManyDigits, { fragment: "(10 ^ 40) ^ 40" })).not.toContain("degree");
    const tooHigh = linearEquation("first", "t^41*y");
    expect(!tooHigh.ok && tooHigh.failure.reason).toBe("tooComplex");
    // 2^41 = 2199023255552 and 0.5^60 = 2^-60, exact.
    expect(A("2^41*y")).toBe(2199023255552);
    expect(A("0.5^60*y")).toBe(2 ** -60);
  });

  it("a literal is approximate exactly when its text says more than its double", () => {
    expect(inexactLiteral("0.5000000000000000001*x")).toBe(true);
    expect(inexactLiteral("-0.12345678912345678912*y")).toBe(true);
    expect(inexactLiteral("10000000000000000*x")).toBe(false);
    expect(inexactLiteral("1e18*x + 100000000000000000000")).toBe(false);
    expect(inexactLiteral("0.1*k1 + 2.50")).toBe(false);
    const half = linearEquation("second", "x'' + 0.5000000000000000001*x = 0");
    expect(half.ok && half.equation.approximate).toBe(true);
    const e16 = linearEquation("second", "x'' + 10000000000000000*x = 0");
    expect(e16.ok && e16.equation.approximate).toBe(false);
    const e18 = linearEquation("second", "x'' + 1e18*x = 0");
    expect(e18.ok && e18.equation.approximate).toBe(false);
  });

  it("structurallyLinear: the shape alone decides, as the reader would", () => {
    const lin = (s: string) => structurallyLinear(mathjs.parse(s), new Set(["x"]));
    expect(lin("t*x + sin(t)*x + x/(1 + t) + x^1 - 2*x")).toBe(true);
    for (const s of ["x*x", "1/x", "x^2", "2^x", "sin(x)", "t > 0 ? x : 0"]) expect(lin(s), s).toBe(false);
  });
});

describe("the common factor", () => {
  it("is cancelled from exponential and trigonometric terms too: t x'' + t x = t sin(t) is x'' + x = sin(t)", () => {
    // x_p = t(A cos t + B sin t): L[x_p] = 2(-A sin t + B cos t) = sin t, so A = -1/2, B = 0.
    // x = C1 cos t + C2 sin t - (1/2) t cos t; x(0) = C1 = 1, x'(0) = C2 - 1/2 = 0: C2 = 1/2.
    const out = text(panel("second", "t*x'' + t*x = t*sin(t)", formula({ initial: [1, 0] })));
    expect(out).toContain("xₚ(t) = −(1/2)t cos(t)");
    expect(out).toContain("C₁ = 1, C₂ = 1/2");
  });

  it("its zeros are said not to be singular only when that is true of the reduced equation", () => {
    // t^2 x'' + t x = 0 is t x'' + x = 0 after cancelling t: t = 0 is still a (regular) singular point.
    const kept = text(panel("second", "t^2*x'' + t*x = 0", series()));
    expect(kept).toContain(fill(L.series.cancelledFactorPlain, { g: "t" }));
    expect(kept).not.toContain("its zeros are not singular points");
    // t x'' + t x = t^2 is x'' + x = t: t = 0 is an ordinary point.
    const ordinary = text(panel("second", "t*x'' + t*x = t^2", series()));
    expect(ordinary).toContain(fill(L.series.cancelledFactor, { g: "t" }));
  });
});

describe("the solution formula's check", () => {
  it("the window narrows for a fast mode: y' = 40(y - t), y(0) = 1/40 is y = t + 1/40 and passes on |t| <= 0.2", () => {
    // y_p = t + 1/40, C e^(40t) with C = 0. Window: min(1, 8/40) = 0.2.
    expect(growthRate(formulaOf("first", "40*(y - t)").roots)).toBe(40);
    const r = panel("first", "40*(y - t)", formula({ initial: [0.025, 0] }));
    if (r.status !== "ok" || !r.check?.numeric) throw new Error();
    expect(r.check.numeric.ok).toBe(true);
    expect(r.check.numeric.covered).toEqual({ min: -0.2, max: 0.2 });
  });

  it("x'' - 6400 x = 0 with x(0) = 1, x'(0) = -80 is e^(-80t) and passes", () => {
    // C1 + C2 = 1, 80 C1 - 80 C2 = -80: C1 = 0, C2 = 1. Window 8/80 = 0.1.
    const r = panel("second", "x'' - 6400*x = 0", formula({ initial: [1, -80] }));
    if (r.status !== "ok" || !r.check?.numeric) throw new Error();
    expect(r.check.numeric.ok).toBe(true);
    expect(text(r)).toContain("x(t) = e⁻⁸⁰ᵗ");
  });

  it("an exact near-resonant frequency: the formula is given, no failed check is claimed, the cancellation is named", () => {
    // mu = 1.41421356237 (exact): chi(mu) = 2 - mu^2 ≈ 8.75e-12, so x_p ≈ 1.14·10^11 cos(mu t).
    const r = panel("second", "x'' + 2*x = cos(1.41421356237*t)", formula({ initial: [1, 0] }));
    const out = text(r);
    if (r.status !== "ok" || !r.check) throw new Error();
    expect(r.check.cancellation).toBeGreaterThan(1e8);
    expect(out).toContain(head(L.series.checkUnresolvable));
    expect(out).not.toContain("Check failed");
  });

  it("a single compared point is not a check: the equilibrium x ≡ 1 of x'' + x = 1, and a field 0/0 at t0", () => {
    for (const [mode, eq] of [["second", "x'' + x = 1"], ["first", "(t*y - t)/t"]] as const) {
      const out = text(panel(mode, eq, formula({ initial: [1, 0] })));
      expect(out, eq).not.toContain("0 ≤ t ≤ 0");
      expect(out, eq).toContain(head(L.series.checkExactOnly));
    }
  });

  it("a completed reference covers the whole window although its last t is an ulp past the end", () => {
    // y' = y - sin t, y(0) = 1/2: y = (cos t + sin t)/2 exactly; window |t| <= 1 (rate 1).
    const r = panel("first", "y - sin(t)", formula({ initial: [0.5, 0] }));
    if (r.status !== "ok" || !r.check?.numeric) throw new Error();
    expect(r.check.numeric.covered).toEqual({ min: -1, max: 1 });
    expect(text(r)).toContain("−1 ≤ t ≤ 1");
  });

  it("the range is printed with the digits that tell its ends apart, rounded inward", () => {
    // |t - 100000| <= 1 and |t - 12345.678| <= 1.
    expect(text(panel("second", "x'' + x = 0", formula({ center: 100000, initial: [1, 0] })))).toContain("99999 ≤ t ≤ 100001");
    expect(text(panel("second", "x'' + x = 0", formula({ center: 12345.678, initial: [1, 0] })))).toContain("12344.68 ≤ t ≤ 12346.67");
  });

  it("a homogeneous equation's check speaks of its basis terms, never of an x_p it does not have", () => {
    const out = text(panel("second", "x'' + 2*x = 0", formula({ initial: [1, 0] })));
    expect(out).toContain(head(L.series.checkOkHomogeneous));
    expect(out).not.toContain("xₚ");
  });

  it("the exact substitution is made term by term and catches a wrong part", () => {
    const sol = formulaOf("second", "x'' + x = cos(2*t)");
    expect(particularResidualIsZero(sol)).toBe(true);
    // x_p = -(1/3) cos 2t; doubling it breaks L[x_p] = cos 2t.
    const wrong: SolutionFormula = { ...sol, parts: sol.parts.map((p) => ({ ...p, coef: { re: p.coef.re.map((c) => q(c.n * BigInt(2), c.d)), im: p.coef.im } })) };
    expect(particularResidualIsZero(wrong)).toBe(false);
  });
});

describe("the solution formula's text", () => {
  it("a negative single coefficient of an exponential stands in front: −(1/2)e⁻³ᵗ", () => {
    // y' + y = e^(-3t): -3A + A = 1, A = -1/2; y = C e^-t - (1/2) e^(-3t), y(0) = 1: C = 3/2.
    const out = text(panel("first", "-y + exp(-3*t)", formula({ initial: [1, 0] })));
    expect(out).toContain("yₚ(t) = −(1/2)e⁻³ᵗ");
    expect(out).toContain("y(t) = (3/2)e⁻ᵗ − (1/2)e⁻³ᵗ");
  });

  it("different exponents never print alike, and an exact short decimal prints exactly", () => {
    const close = text(panel("second", "x'' + x = cos(1.00000001*t)", formula({ initial: [1, 0] })));
    expect(close).toContain("cos(1.00000001t)");
    expect(close).not.toContain("cos(1t)");
    // 0.9999999999999 (13 digits) next to the root -1: printed with 13 digits.
    const decay = text(panel("first", "-y + exp(-0.9999999999999*t)", formula({ initial: [1, 0] })));
    expect(decay).toContain("0.9999999999999t");
  });

  it("a constant that only rounds to 1 keeps its zeros: it is never printed as an exact 1", () => {
    // C1 = 1 - x_p(0) = 1 + 1e-7/(pi^2 - 1) ≈ 1.0000000113 (exact for pi's double): 1.00000 at 6 digits.
    const out = text(panel("second", "x'' + x = 0.0000001*cos(pi*t)", formula({ initial: [1, 0] })));
    expect(out).toContain("C₁ = 1.00000");
    expect(out).toContain("x(t) = 1.00000 cos(t)");
    expect(out).not.toMatch(/[^.\d]1 cos\(t\)/);
  });

  it("β = 1 about t0 = 1 reads cos(t − 1), without doubled parentheses", () => {
    const out = text(panel("second", "x'' + x = 0", formula({ center: 1, initial: [1, 0] })));
    expect(out).toContain("cos(t − 1)");
    expect(out).not.toContain("((t − 1))");
  });

  it("more forcing terms than the letter pool: the letters get primes, never repeat", () => {
    const out = text(panel("second", "x'' + 100*x = cos(t)+cos(2*t)+cos(3*t)+cos(4*t)+cos(5*t)+cos(6*t)+cos(7*t)", formula({ initial: [0, 0] })));
    expect(out).toContain("A′");
    expect(out).toContain("B′");
  });

  it("the near-resonance refusal says 'exponent' for a real exponent", () => {
    expect(message(panel("second", "x'' - 2*x = exp(sqrt(2)*t)", formula()))).toBe(L.series.formulaNearResonanceExponent);
    expect(message(panel("second", "x'' + 2*x = cos(sqrt(2)*t)", formula()))).toBe(L.series.formulaNearResonance);
  });

  it("not applicable: the coefficient is named after dividing by the leading one; the obstacle may be the right-hand side", () => {
    // dy/dt = y/(1 + t^2) + 1: dy/dt - y/(1 + t^2) = 1.
    expect(message(panel("first", "y/(t^2+1) + 1", formula()))).toContain("the coefficient of y is −1/(1 + t²)");
    // x'' + x/t = 0: the coefficient of x is 1/t.
    expect(message(panel("second", "x'' + x/t = 0", formula()))).toContain("the coefficient of x is 1/t");
    // dy/dt = y + 1/(1 + t): constant coefficients, the right-hand side 1/(1 + t) is the obstacle.
    expect(message(panel("first", "y + 1/(1+t)", formula()))).toContain("once the equation is divided by the coefficient of dy/dt, the right-hand side is 1/(1 + t)");
  });

  it("a formula whose exact coefficients outgrow the cap answers at once that it is too expensive", () => {
    const start = performance.now();
    const r = panel("second", "x'' + pi*x' + e*x = t^40*(cos(pi*t)+cos(e*t))", formula());
    expect(message(r)).toBe(L.series.tooExpensiveFormula);
    expect(performance.now() - start).toBeLessThan(5000);
  });
});

describe("the radius text", () => {
  it("a guaranteed interval is rounded down: (t^2 + 1) x'' + x = 0 about 0.70000000001", () => {
    // rho = sqrt(1 + 0.70000000001^2) = 1.2206555616…: at most 1.22065 may be printed.
    const out = text(panel("second", "(t^2+1)*x'' + x = 0", series({ center: 0.70000000001 })));
    expect(out).toContain("< 1.22065");
    expect(out).not.toContain("< 1.22066");
  });

  it("numeric singular points print as t ≈ a ± bi, and their interval is rounded down", () => {
    // t^5 - t - 1: the nearest pair is -0.7649 ± 0.3525i.
    const quintic = text(panel("second", "(t^5 - t - 1)*x'' + x = 0", series({ terms: 4 })));
    expect(quintic).toContain("t ≈ −0.7649 ± 0.3525i");
    expect(quintic).not.toContain("= ≈");
    // t^40 = 1e6: |t| = 10^0.15 = 1.41253754…: at most 1.412.
    const forty = text(panel("second", "(t^40 - k)*x'' + x = 0", series({ terms: 4 }), { params: { k: 1e6 } }));
    expect(forty).toContain("|t| < 1.412");
  });
});

describe("the chart", () => {
  it("an equilibrium start draws the constant solution, and the caption names both curves", () => {
    // x'' = 0 from x = 1, x' = 0: x ≡ 1, the partial sum is 1 too.
    const r = panel("second", "x'' = 0", series());
    if (r.status !== "ok" || !r.chart) throw new Error();
    expect(r.chart.curves.length).toBe(2);
    expect(r.chart.caption.map((x) => ("t" in x ? x.t : "")).join("")).toBe(L.series.chartSeriesBoth);
  });

  it("a radius of 1e-7 is drawn on t0 ± 2.5 radii, not on the picture's range", () => {
    const r = panel("second", "(t - 1.0000001)*x'' + x = 0", series({ center: 1 }));
    if (r.status !== "ok" || !r.chart) throw new Error();
    expect(r.chart.tRange.min).toBeCloseTo(1 - 2.5e-7, 12);
    expect(r.chart.tRange.max).toBeCloseTo(1 + 2.5e-7, 12);
  });

  it("a budget that runs out while drawing keeps the finished derivation and drops only the numerical curve", () => {
    // The derivation of x'' + x = 0 needs far fewer than 100 checkpoint calls; the reference integration far more.
    let calls = 0;
    const checkpoint = () => {
      if (++calls > 100) throw new RangeError("budget");
    };
    const r = panel("second", "x'' + x = 0", series(), { tRange: { min: 0, max: 20 }, checkpoint });
    if (r.status !== "ok" || !r.chart) throw new Error();
    expect(r.chart.curves.length).toBe(1);
    expect(r.chart.caption.map((x) => ("t" in x ? x.t : "")).join("")).toBe(L.series.chartSeriesOnly);
  });
});

describe("the link (decoded on the server for every request)", () => {
  it("a hostile Frobenius-like equation decodes in milliseconds: only static checks run", () => {
    for (const eq of ["t*(t+pi)^16/(t^2+1)^8*x'' + x = 0", "t*(97*t^2+5*t+3)^19*x'' + (89*t^2+29*t+13)^20*x = 0"]) {
      const start = performance.now();
      const decoded = decodeState(new URLSearchParams({ m: "second", eq, ser: "ps" }), DEFAULT_STATE);
      expect(performance.now() - start, eq).toBeLessThan(1000);
      expect(decoded.state.eq, eq).toBe(eq);
    }
  });

  it("readableAsLinearSecondOrder: x'' must appear and the shape must be linear", () => {
    expect(readableAsLinearSecondOrder("t*x'' + x' + t*x = 0")).toBe(true);
    expect(readableAsLinearSecondOrder("x''^2 + x = 0")).toBe(false);
    expect(readableAsLinearSecondOrder("x'' + sin(x'') = 0")).toBe(false);
    expect(readableAsLinearSecondOrder("x' + x = 0")).toBe(false);
  });
});

describe("the panel's controls", () => {
  it("name the expansion point by its value, never by the form's t0", () => {
    for (const locale of ["en", "zh"] as const) {
      const S = labels(locale).series;
      for (const label of [S.center, S.centerFormula, S.initialValues]) expect(label).not.toContain("t₀");
      expect(fill(S.initialAt, { name: "x", t0: "2" })).toBe("x(2)");
    }
  });
});
