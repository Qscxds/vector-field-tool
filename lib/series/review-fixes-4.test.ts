/**
 * Round 12, fourth review round: one regression per defect the verification of the third round's
 * fixes found, each expectation derived by hand next to it.
 */
import { describe, expect, it } from "vitest";
import { fill, labels } from "../labels";
import { derivationText } from "../labels-series";
import { computeSeriesPanel, DEFAULT_SERIES_SETTINGS, type SeriesPanelResult, type SeriesSettings } from "../series-panel";
import { linearEquation, secondOrderSyntaxPasses, type SeriesMode } from "./equation";
import { plain } from "./notation";
import { polynomialOde, powerSeries } from "./power-series";
import { fromNumber } from "./rational";

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
function radiusBound(eq: string, center: number): number {
  const parsed = linearEquation("second", eq);
  if (!parsed.ok) throw new Error();
  const ode = polynomialOde(parsed.equation);
  if (!ode.ok) throw new Error();
  const r = powerSeries(ode.ode, fromNumber(center)!);
  if (r.status !== "ok") throw new Error();
  return r.radius.kind === "lowerBound" ? r.radius.value : r.radius.kind === "finite" ? r.radius.distance.lower : Infinity;
}
const A = (g: string) => {
  const eq = linearEquation("first", g);
  if (!eq.ok) throw new Error(JSON.stringify(eq.failure));
  const p0 = eq.equation.P[0].values().next().value;
  return p0 ? -Number(p0.coef.re[0].n) / Number(p0.coef.re[0].d) : 0;
};

describe("radius", () => {
  it("a centre equal to the double of a numeric root: a positive proven bound, never 0 or NaN", () => {
    // The real root of t^3 + t + 1 is -0.68232780382801932737…; the double -0.6823278038280194 is
    // 7.263·10^-17 from it. 2^(1/5) = 1.1486983549970350068…; the double 1.148698354997035 is 6.80·10^-18 below.
    const cases: [string, number, number][] = [
      ["(t^3 + t + 1)*x'' + x = 0", -0.6823278038280194, 7.263e-17],
      ["(t^5 - 2)*x'' + x = 0", 2 ** 0.2, 6.8e-18],
    ];
    for (const [eq, t0, truth] of cases) {
      const value = radiusBound(eq, t0);
      expect(value, eq).toBeGreaterThan(0);
      expect(value, eq).toBeLessThanOrEqual(truth * 1.001);
      const out = text(panel("second", eq, series({ center: t0 })));
      expect(out, eq).not.toMatch(/NaN|Infinity/);
    }
  });

  it("a guaranteed surd bound keeps its margin: √(1 − 10^-15) prints below 1", () => {
    // √(1 - 1e-15) = 0.9999999999999995: rounded down to 6 digits, 0.999999.
    const out = text(panel("second", "(t^2 + 1 - 10^-15)*x'' + x = 0", series({ terms: 3 })));
    expect(out).toContain("|t| < 0.999999");
    expect(out).not.toContain("|t| < 1.00000");
  });

  it("the expansion point prints exactly: t0 = 0.3333333333333333 is not 0.333333", () => {
    // 3 t0 - 1 = -10^-16: an ordinary point 3.33·10^-17 from the singular point 1/3.
    const out = text(panel("second", "(3*t - 1)*x'' + x = 0", series({ center: 0.3333333333333333, terms: 3 })));
    expect(out).toContain("|t − 0.3333333333333333| <");
    expect(out).not.toMatch(/0\.333333[^3]/);
  });
});

describe("the reader", () => {
  it("±1 to a whole power: the exact parity within 2^53, a refusal beyond (the picture computes doubles)", () => {
    // 2^52 + 1 is odd and an exact double: (-1)^(2^52 + 1) = -1 for the reader and for the picture.
    expect(A("(-1)^(2^52+1)*y")).toBe(-1);
    // 10^21 + 1 is odd, but as a double it is even: the picture would draw +1, so the reader refuses.
    for (const g of ["(-1)^(10^21+1)*y", "1^(10^400)*y", "2^(10^400)*y"]) {
      const eq = linearEquation("first", g);
      expect(!eq.ok && eq.failure.reason, g).toBe("exponentTooLarge");
    }
  });

  it("the syntax pre-filter passes clean text and sends everything doubtful to the kernel", () => {
    expect(secondOrderSyntaxPasses("t*x'' + x' + t*x = 0")).toBe(true);
    for (const t of ["x'' + y = 0", "x''' + x = 0", "xdd + x = 0", "x'' == x", "x'' + x", "x'' = x = 1"]) expect(secondOrderSyntaxPasses(t), t).toBe(false);
    expect(secondOrderSyntaxPasses("x'' + v*x = 0", { v: 1 })).toBe(false);
  });

  it("a long product of 20 factors reads without the kernel's sampling (no chart, no reference)", () => {
    const eq = `${Array.from({ length: 20 }, (_, i) => `(t-${i + 1})`).join("*")}*x'' + x = 0`;
    const start = performance.now();
    const r = panel("second", eq, series(), { chart: false });
    expect(r.status).toBe("ok");
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("the solution formula", () => {
  it("a growing mode is drawn from the formula: x'' − 4x = 0 is cosh 2t, nothing cancels", () => {
    // x = (e^(2t) + e^(-2t))/2: both terms positive, so the terms' size equals |x| wherever x is drawn.
    const r = panel("second", "x'' - 4*x = 0", formula({ initial: [1, 0] }), { tRange: { min: 0, max: 20 } });
    if (r.status !== "ok" || !r.chart) throw new Error();
    expect(r.chart.caption.map((x) => ("t" in x ? x.t : "")).join("")).not.toBe(L.series.chartCancellation);
    expect(r.chart.curves.map((c) => plain(c.label))).toEqual(["x"]);
  });

  it("an early stop of the reference is not a cancellation, and Infinity is never printed", () => {
    // y = (40/41)e^-t + (1/41)e^(40t): both terms positive, ratio 1.
    for (const g of ["-y + exp(40*t)", "-y + exp(710*t)"]) {
      const r = panel("first", g, formula({ initial: [1, 0] }));
      if (r.status === "unavailable") continue;
      if (r.status !== "ok" || !r.check) throw new Error(g);
      expect(r.check.cancellation ?? null, g).toBeNull();
      expect(text(r), g).not.toMatch(/Infinity|NaN/);
    }
  });

  it("constants of a pair with an irrational frequency are exact when they can be: C1 = 1 − 10^7, C2 = 0", () => {
    // x'' + 1.0000001x = cos t: x_p = 10^7 cos t; x(0) = C1 + 10^7 = 1, x'(0) = omega C2 = 0.
    const out = text(panel("second", "x'' + 1.0000001*x = cos(t)", formula({ initial: [1, 0] })));
    expect(out).toContain("C₁ = −9999999, C₂ = 0");
  });

  it("a rounded value never reads as an exact integer, also in scientific form: 1.00000·10⁶", () => {
    // x_p = 1000000.000001 (13 significant digits): rounded to 6 it is 1.00000·10⁶, not 1·10⁶.
    const out = text(panel("second", "x'' + x = 1000000.000001", formula({ initial: [1, 0] })));
    expect(out).toContain("1.00000·10⁶");
    expect(out).not.toMatch(/[^.\d]1·10⁶/);
  });

  it("real irrational roots and the approximations keep the digits that tell rates apart", () => {
    // r = -3/2 ± √(0.9999996)/2 = -1.0000001…, -1.9999999…: not the forcing rate -1.
    const real = text(panel("second", "x'' + 3*x' + 2.0000001*x = exp(-t)", formula({ initial: [1, 0] })));
    expect(real).not.toContain("(≈ −1, −2)");
    expect(real).toContain("−1.0000001");
    // √1.001 = 1.0004998…: the approximation reads ±1.0005i next to the forcing cos(t), not ±i.
    expect(text(panel("second", "x'' + 1.001*x = cos(t)", formula({ initial: [1, 0] })))).toContain("≈ ±1.0005i");
  });

  it("a refusal after dividing out e^t shows the divided equation", () => {
    // e^t x'' + x = 0 divided by e^t: x'' + e^-t x = 0, whose coefficient of x changes with t.
    const m = message(panel("second", "exp(t)*x'' + x = 0", formula()));
    // The equation printer brackets a coefficient that is not a polynomial: (e⁻ᵗ)x.
    expect(m).toContain(fill(L.series.dividedEquation, { e: "eᵗ", equation: "x'' + (e⁻ᵗ)x = 0" }));
    expect(m).toContain("the coefficient of x is e⁻ᵗ");
  });

  it("the first conversion of a huge formula to doubles stays inside the budget", () => {
    const cosines = Array.from({ length: 12 }, (_, i) => `cos(${25000 + i}*t)`).join("+");
    const deadline = performance.now() + 1500;
    const start = performance.now();
    try {
      panel("second", `x'' + 0.1*x' + x = t^22*(${cosines})`, formula(), {
        checkpoint: () => {
          if (performance.now() > deadline) throw new RangeError("budget");
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(RangeError);
    }
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
