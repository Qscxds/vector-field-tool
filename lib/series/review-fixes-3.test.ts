/**
 * Round 12, third review round: one regression per defect the verification of the second round's
 * fixes found, each expectation derived by hand next to it.
 */
import { describe, expect, it } from "vitest";
import { mathjs } from "../core/parse";
import { fill, labels } from "../labels";
import { derivationText } from "../labels-series";
import { computeSeriesPanel, DEFAULT_SERIES_SETTINGS, type SeriesPanelResult, type SeriesSettings } from "../series-panel";
import { linearEquation, type SeriesMode } from "./equation";
import { decimalDirected, decimalDown, decimalLn, plain } from "./notation";

const L = labels("en");
const ranges = { tRange: { min: -3, max: 3 }, vRange: { min: -3, max: 3 } };
const series = (s: Partial<SeriesSettings> = {}): SeriesSettings => ({ ...DEFAULT_SERIES_SETTINGS, kind: "series", ...s });
const formula = (s: Partial<SeriesSettings> = {}): SeriesSettings => ({ ...DEFAULT_SERIES_SETTINGS, kind: "formula", ...s });

function panel(mode: SeriesMode, text: string, settings: SeriesSettings, extra: Partial<Parameters<typeof computeSeriesPanel>[1]> = {}): SeriesPanelResult {
  return computeSeriesPanel(L, { mode, text, settings, ...ranges, ...extra });
}
function text(r: SeriesPanelResult): string {
  if (r.status !== "ok") throw new Error(`not ok: ${r.status === "unavailable" ? plain(r.message) : r.status}`);
  return derivationText(r.derivation);
}
function message(r: SeriesPanelResult): string {
  if (r.status !== "unavailable") throw new Error(`not unavailable: ${r.status}`);
  return plain(r.message);
}
const head = (label: string) => label.split("{")[0];
const A = (g: string) => {
  const eq = linearEquation("first", g);
  if (!eq.ok) throw new Error(JSON.stringify(eq.failure));
  const p0 = eq.equation.P[0].values().next().value;
  return p0 ? -Number(p0.coef.re[0].n) / Number(p0.coef.re[0].d) : 0;
};

describe("rounding that cannot run away", () => {
  it("a value just below the largest double rounds down at once and never to Infinity", () => {
    const start = performance.now();
    expect(decimalDown(1.7975999906959045e308)).toBe("1.797·10³⁰⁸");
    // Rounding up past the largest double is printed, not converted back to a number.
    expect(decimalDirected(1.7975999906959045e308, 4, "up")).toBe("1.798·10³⁰⁸");
    expect(performance.now() - start).toBeLessThan(100);
  });

  it("decimalLn prints values beyond the double range", () => {
    // ln(10^400) = 400 ln 10; ln(2·10^-320) / 2 = ln(1.41421…·10^-160).
    expect(decimalLn(400 * Math.LN10, 4)).toBe("1·10⁴⁰⁰");
    expect(decimalLn((Math.log(2) - 320 * Math.LN10) / 2, 6, "down")).toBe("1.41421·10⁻¹⁶⁰");
  });

  it("a radius just below the largest double: (t^3 - 5.808703·10^924) x'' + x = 0 answers at once", () => {
    // |t|^3 = 5808703·10^918: |t| = 179.7599…·10^306 = 1.7976·10^308, printed rounded down to 1.797·10^308.
    const start = performance.now();
    const out = text(panel("second", "(t^3 - 5808703*10^400*10^400*10^118)*x'' + x = 0", series()));
    expect(out).toContain("1.797·10³⁰⁸");
    expect(out).not.toMatch(/Infinity|NaN/);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});

describe("distances beyond the double range and near cancellations", () => {
  it("a singular point at 10^400 is a singular point, not 'none'", () => {
    const out = text(panel("second", "(t - (10^200)^2)*x'' + x = 0", series()));
    expect(out).toContain("|t| < 1·10⁴⁰⁰");
    expect(out).not.toContain(head(L.series.radiusInfinite));
    // ±10^155 i: the squared distance 10^310 is exact, the radius 10^155.
    expect(text(panel("second", "(t^2 + 10^310)*x'' + x = 0", series()))).toContain("|t| < 1·10¹⁵⁵");
    // The Frobenius series of t (t - 10^400) x'' + x = 0 converge up to the other singular point 10^400.
    expect(text(panel("second", "t*(t - (10^200)^2)*x'' + x = 0", series()))).toContain("1·10⁴⁰⁰");
  });

  it("a surd whose radicand has 300+ digits prints a number: ±√(2·10^-320) = ±1.41421·10^-160", () => {
    const out = text(panel("second", "(t^2 - 2e-320)*x'' + x = 0", series({ terms: 3 })));
    expect(out).not.toMatch(/Infinity|NaN/);
    expect(out).toContain("1.41421·10⁻¹⁶⁰");
    // √(1 + 10^-200) is just above 1: rounded down with the safety margin for the error of ln, the
    // guaranteed interval prints 0.999999 (true, and never Infinity).
    const near = text(panel("second", "(t^2 + 1 + 1e-200)*x'' + x = 0", series({ terms: 3 })));
    expect(near).not.toMatch(/Infinity|NaN/);
    expect(near).toContain("|t| < 0.999999");
  });

  it("√2 seen from t0 = 1.4142135623730951 is 5.11983·10^-17 away, located exactly, and only the nearer root is named", () => {
    // t0 - √2 = (t0^2 - 2)/(t0 + √2) = 5.11983…·10^-17 (t0 is 14142135623730951/10^16, not √2).
    const out = text(panel("second", "(t^2 - 2)*x'' + x = 0", series({ center: Math.SQRT2 })));
    expect(out).toContain("is t = √2,");
    expect(out).toContain("< 5.119·10⁻¹⁷");
    expect(out).not.toContain("≈ 0 from");
    expect(out).not.toContain("could not be located");
    // From t0 = 1.4142: √2 - 1.4142 = 1.35624·10^-5, still exact points.
    const close = text(panel("second", "(t^2 - 2)*x'' + x = 0", series({ center: 1.4142 })));
    expect(close).toContain("is t = √2,");
    expect(close).not.toContain("could not be located");
  });

  it("of a real pair, only the nearer root is the nearest singular point", () => {
    // From t0 = 1: √2 at 0.4142, -√2 at 2.414. From t0 = 2: 1 + √2 at 0.4142, 1 - √2 at 2.414.
    expect(text(panel("second", "(t^2 - 2)*x'' + x = 0", series({ center: 1 })))).toContain("is t = √2, at distance ≈ 0.4142");
    expect(text(panel("second", "(t^2 - 2*t - 1)*x'' + x = 0", series({ center: 2 })))).toContain("is t = 1 + √2,");
  });

  it("numeric singular points print without rounding noise: t ≈ ±1.017i, ±i", () => {
    // (i 2^(1/40))^40 = 2: purely imaginary.
    const forty = text(panel("second", "(t^40 - 2)*x'' + x = 0", series({ terms: 3 })));
    expect(forty).toContain("t ≈ ±1.017i");
    expect(forty).not.toMatch(/10⁻³\d ±/);
    // t^2 + 1 divides t^30 + 1: ±i is one of the nearest pairs (all 30 roots lie on |t| = 1).
    const thirty = text(panel("second", "(1 + t^30)*x'' + x = 0", series({ terms: 4 })));
    expect(thirty).toContain("t ≈ ±i,");
    expect(thirty).not.toMatch(/[^.\d]1i/);
  });
});

describe("the reader", () => {
  it("round(x) with one argument is mathjs's own, also at the last ulp", () => {
    for (const v of ["2.4999999999999996", "0.49999999999999994", "1.4999999999999998", "-2.4999999999999996"]) {
      expect(A(`round(${v})*y`), v).toBe(mathjs.round(Number(v)));
    }
  });

  it("an invalid number of places for round has its own sentence", () => {
    const eq = linearEquation("second", "x'' + x'*round(1.5, 0.5) = 0");
    expect(!eq.ok && eq.failure.reason).toBe("invalidArgument");
    expect(fill(L.series.failInvalidArgument, { fragment: "round(1.5, 0.5)" })).toContain("whole number from 0 to 15");
  });

  it("a constant power is sized from its logarithms: 2^501, 10^501 and 0.5^501 are read exactly", () => {
    // 2^501 has 151 decimal digits and 10^501 has 502: far below the cap of about 1200.
    for (const e of ["2^501", "10^501", "0.5^501"]) expect(linearEquation("second", `x'' + ${e}*x = 0`).ok, e).toBe(true);
  });

  it("a coefficient of x'' that is identically 0 is not called nonlinear", () => {
    const r = panel("second", "k*x'' + x' + x = 0", formula(), { params: { k: 0 } });
    expect(message(r)).toContain("identically 0");
    expect(message(r)).not.toContain("not linear");
  });

  it("a never-zero exponential leading coefficient is divided out: e^t x'' + e^t x = 0 is x'' + x = 0", () => {
    const out = text(panel("second", "exp(t)*x'' + exp(t)*x = 0", formula({ initial: [1, 0] })));
    expect(out).toContain("x(t) = cos(t)");
    expect(out).toContain(fill(L.series.dividedExponential, { e: "eᵗ" }));
    // e^t x'' + x = 0 is x'' + e^-t x = 0: the coefficient of x changes with t.
    expect(message(panel("second", "exp(t)*x'' + x = 0", formula()))).toContain("the coefficient of x is e⁻ᵗ");
  });

  it("a typed literal longer than its double gets its own note, not the π one", () => {
    const out = text(panel("first", "-y + 0.10000000000000000001", formula()));
    expect(out).toContain(L.series.approximateLiteralNote);
    expect(out).not.toContain(L.series.approximateNote);
  });
});

describe("the solution formula's check", () => {
  it("a solution of size 1e-7 is checked against a reference scaled to it, and passes", () => {
    // x = 10^-7 cos(10t) is exact; with an absolute tolerance of 1e-12 the reference itself was off by 4.7e-13.
    for (const [eq, init] of [["x'' + 100*x = 0", [1e-7, 0]], ["x'' + 3*x' + 2*x = 0", [1e-8, 0]]] as const) {
      const r = panel("second", eq, formula({ initial: [...init] }));
      if (r.status !== "ok" || !r.check?.numeric) throw new Error(eq);
      expect(r.check.numeric.ok, eq).toBe(true);
    }
  });

  it("a ratio of 1e8 is still compared (rounding is 1e-8 of the solution there)", () => {
    const r = panel("second", "x'' + x = cos(1.00000001*t)", formula({ initial: [1, 0] }));
    if (r.status !== "ok" || !r.check) throw new Error();
    expect(r.check.cancellation ?? null).toBeNull();
    expect(r.check.numeric?.ok).toBe(true);
  });

  it("the cancellation factor is taken from the reference: t^30 forcing, about 2·10^19", () => {
    // termScale ≈ 1.15·10^20 on |t| <= 1 against a solution of size about 5 (the reference's).
    const r = panel("second", "x'' + 3*x' + 7*x = t^30", formula({ initial: [1, 0] }), { tRange: { min: -1, max: 1 }, vRange: { min: -5, max: 5 } });
    if (r.status !== "ok" || !r.check) throw new Error();
    expect(r.check.cancellation).toBeGreaterThan(1e18);
    // The chart is not drawn from the cancelling evaluation: it shows the numerical solution and says so.
    expect(r.chart?.caption.map((x) => ("t" in x ? x.t : "")).join("")).toBe(L.series.chartCancellation);
    expect(r.chart?.curves.map((c) => plain(c.label))).toEqual([L.series.legendNumerical]);
  });

  it("an unrelated π does not make an exactly typed near-resonant frequency be refused", () => {
    // 1.0000000000001 is a 14-digit typed decimal: exact; the near resonance is real and its formula exact.
    const r = panel("second", "x'' + x = cos(1.0000000000001*t) + pi", formula({ initial: [1, 0] }));
    expect(r.status).toBe("ok");
  });

  it("no advice to move t0 when t0 is 0 and nothing would help", () => {
    expect(message(panel("first", "y + 10^400", formula()))).toBe(L.series.formulaOverflowFixed);
  });
});

describe("the text", () => {
  it("a coefficient that is not 1 never prints as 1: x'' + 1.0000000001x = cos(t), r = ±1.00000000005i", () => {
    // ω² = 1.0000000001, ω = 1.00000000005 (to 12 digits): not the forcing frequency 1, so no resonance.
    const out = text(panel("second", "x'' + 1.0000000001*x = cos(t)", formula({ initial: [1, 0] })));
    expect(out).toContain("x'' + 1.0000000001x = cos(t)");
    expect(out).toContain("1.00000000005");
    expect(out).not.toContain("cos((1)t)");
    expect(out).not.toContain("r² + 1 = 0");
  });

  it("a homogeneous series has no x_p line even when its termination is not proven", () => {
    const out = text(panel("second", "(1 + t^30)*x'' + x = 0", series({ terms: 4 })));
    expect(out).not.toContain("xₚ");
  });

  it("not applicable: a coefficient with integer parts, never a fraction inside a fraction", () => {
    // (2t) x'' + x = 0: the coefficient of x is 1/(2t). dy/dt = y/(2t + 1): the coefficient of y is -1/(1 + 2t).
    expect(message(panel("second", "(2*t)*x'' + x = 0", formula()))).toContain("the coefficient of x is 1/(2t)");
    expect(message(panel("first", "y/(2*t+1)", formula()))).toContain("the coefficient of y is −1/(1 + 2t)");
    // t x'' + t x = 1 has constant coefficients after dividing by t; its right-hand side is then 1/t.
    expect(message(panel("second", "t*x'' + t*x = 1", formula()))).toContain("once the equation is divided by the coefficient of x'', the right-hand side is 1/t");
  });

  it("a fraction before cos or sin is bracketed in plain text: (1/51) cos(7t)", () => {
    // x'' + 100x = cos 7t: A = 1/(100 - 49) = 1/51.
    const out = text(panel("second", "x'' + 100*x = cos(7*t)", formula({ initial: [0, 0] })));
    expect(out).toContain("(1/51) cos(7t)");
  });

  it("e^(t − 1/2), without doubled parentheses", () => {
    const out = text(panel("second", "x'' - x = 0", formula({ center: 0.5, initial: [1, 0] })));
    expect(out).toContain("e^(t − 1/2)");
    expect(out).not.toContain("((t − 1/2))");
  });

  it("'shown through' names the last power the digit cap allowed", () => {
    // dy/dt = 10^600 y: a_n = 10^(600 n)/n!; a_3 ≈ 1.7·10^1799 is the last one computed.
    expect(text(panel("first", "y*10^300*10^300", series({ terms: 8 })))).toContain("Shown through t³");
  });

  it("the results name the expansion point by its value, never t₀ (the form has its own t₀)", () => {
    const out = text(panel("second", "(1 - t^2)*x'' - 2*t*x' + 6*x = 0", series({ center: 0.5 })));
    expect(out).toContain("Power series about t = 1/2");
    expect(out).not.toContain("t₀");
  });

  it("the field alert names the field, without the label's '='", () => {
    for (const locale of ["en", "zh"] as const) {
      const S = labels(locale).series;
      for (const name of [S.centerName, S.centerFormulaName]) expect(fill(S.numberProblem, { field: name })).not.toMatch(/=\s*[:：]/);
    }
  });
});

describe("the chart", () => {
  it("a slow start that is not an equilibrium is not drawn as a constant", () => {
    // x'' = 2x' from x = 1, x' = 1e-10: x = 1 + 5e-11 (e^(2t) - 1) leaves the chart near t = 12; the
    // kernel stops at once on its relative speed test, but the field there is not zero.
    const r = panel("second", "x'' - 2*x' = 0", series({ initial: [1, 1e-10] }), { tRange: { min: 0, max: 20 } });
    if (r.status !== "ok" || !r.chart) throw new Error();
    const numerical = r.chart.curves.find((c) => plain(c.label) === L.series.legendNumerical);
    const lastT = numerical ? Math.max(...numerical.segments.flat().map((p) => p.x)) : -Infinity;
    expect(lastT).toBeLessThan(20);
  });

  it("curves that never enter the value range are not claimed: dy/dt = 0 from y = 10 on -3..3 has no chart", () => {
    const r = panel("first", "0*y", series({ initial: [10, 0] }));
    expect(r.status === "ok" && r.chart).toBeNull();
  });

  it("a budget that first runs out while sampling keeps the finished derivation and the chart", () => {
    // Count the calls of a full run, then let the budget run out within the last sampling.
    let calls = 0;
    panel("second", "x'' + x = 0", series(), { checkpoint: () => void calls++ });
    let k = 0;
    const r = panel("second", "x'' + x = 0", series(), {
      checkpoint: () => {
        if (++k > calls - 3) throw new RangeError("budget");
      },
    });
    expect(r.status).toBe("ok");
  });

  it("the not-constant message of a heavy equation stays inside the budget", () => {
    const deadline = performance.now() + 1500;
    const start = performance.now();
    try {
      panel("second", "(t+1)*(97*t^2+5*t+3)^19*x'' + x' + (t+1)*(89*t^2+29*t+13)^19*x = 0", formula(), {
        checkpoint: () => {
          if (performance.now() > deadline) throw new RangeError("budget");
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(RangeError);
    }
    expect(performance.now() - start).toBeLessThan(4000);
  });
});
