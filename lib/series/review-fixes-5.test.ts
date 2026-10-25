/**
 * Round 12, fifth review round: one regression per defect the verification of the fourth round's
 * fixes found, each expectation derived by hand next to it.
 */
import { describe, expect, it } from "vitest";
import { labels } from "../labels";
import { derivationText } from "../labels-series";
import { computeSeriesPanel, DEFAULT_SERIES_SETTINGS, type SeriesPanelResult, type SeriesSettings } from "../series-panel";
import { linearEquation, type SeriesMode } from "./equation";
import { decimalLn, plain } from "./notation";
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

describe("the reference integration never waits for the kernel's reduction", () => {
  it("(t − 1)…(t − 20)(x'' + x) = 0 is x'' + x = 0, answered and checked at once", () => {
    // The common factor cancels: x = cos t from x(0) = 1, x'(0) = 0. The reference evaluates the text
    // itself (x'' = −E(…, 0) / (E(…, 1) − E(…, 0)) = −x away from the integers), never simplifying the product.
    const eq = `${Array.from({ length: 20 }, (_, i) => `(t-${i + 1})`).join("*")}*(x'' + x) = 0`;
    const start = performance.now();
    const r = panel("second", eq, formula({ initial: [1, 0] }), { chart: false });
    expect(performance.now() - start).toBeLessThan(2000);
    const out = text(r);
    expect(out).toContain("x(t) = cos(t)");
    expect(out).not.toContain("Check failed");
  });
});

describe("guaranteed bounds", () => {
  it("decimalLn rounds down correctly at exact powers of ten beyond the double range", () => {
    // ln(10^400) rounded down (with its margin) is just below 10^400: 9.999·10^399, never 9.99·10^400.
    expect(decimalLn(400 * Math.LN10, 4, "down")).toBe("9.999·10³⁹⁹");
    expect(decimalLn(-1000 * Math.LN10, 4, "down")).toBe("9.999·10⁻¹⁰⁰¹");
    // √(10^606 + 1) = 10^303 (1 + 5·10^-607): the interval prints at most that.
    const out = text(panel("second", "(t^2 + 10^606 + 1)*x'' + x = 0", series({ terms: 3 })));
    expect(out).not.toContain("9.9999·10³⁰³");
    expect(out).toContain("|t| < 9.99999·10³⁰²");
  });

  it("an exact rational radius too long to print exactly is rounded down in the interval", () => {
    // 2/3 − 0.1111111111 = 0.5555555555666…: at most 0.555555 may be printed.
    expect(text(panel("second", "(t - 2/3)*x'' + x = 0", series({ center: 0.1111111111, terms: 3 })))).toContain("< 0.555555");
    // 1 − 10^-20 < 1: never "|t| < 1.00000".
    const near = text(panel("second", "(t - (1 - 10^(-20)))*x'' + x = 0", series({ terms: 3 })));
    expect(near).toContain("|t| < 0.999999");
    expect(near).not.toContain("|t| < 1.00000");
  });

  it("a numeric distance subtracts the error of the centre's double: from 1.259921049894 to ∛2", () => {
    // ∛2 = 1.25992104989487316…: the distance is 8.73165·10^-13, and no bound above it may be claimed.
    const parsed = linearEquation("second", "(t^3 - 2)*x'' + x = 0");
    if (!parsed.ok) throw new Error();
    const ode = polynomialOde(parsed.equation);
    if (!ode.ok) throw new Error();
    const r = powerSeries(ode.ode, fromNumber(1.259921049894)!);
    if (r.status !== "ok") throw new Error();
    const value = r.radius.kind === "lowerBound" ? r.radius.value : r.radius.kind === "finite" ? r.radius.distance.lower : Infinity;
    expect(value).toBeLessThanOrEqual(8.73165e-13);
    expect(value).toBeGreaterThan(8.7e-13);
  });
});

describe("the text", () => {
  it("a 17-digit expansion point prints as typed, from its exact digits", () => {
    // 24.015962814534298 is the shortest decimal of its double; printing it through a double landed on …294.
    expect(text(panel("second", "x'' + x = 0", series({ center: 24.015962814534298 })))).toContain("Power series about t = 24.015962814534298");
  });

  it("a refusal after clearing a denominator shows the equation it speaks of", () => {
    // x''/(2t + 1) + x = cos t, multiplied by t + 1/2 (the monic denominator): (1/2)x'' + (1/2 + t)x = (1/2 + t)cos t.
    const m = message(panel("second", "x''/(2*t+1) + x = cos(t)", formula()));
    expect(m).toContain("Multiplied by (1/2 + t) to clear the denominator, the equation reads");
    expect(m).toContain("the coefficient of x is 1/2 + t");
  });

  it("the overflow branch stays inside the budget (t0 = 800, a heavy forcing)", () => {
    const cosines = Array.from({ length: 11 }, (_, i) => `cos(${25000 + i}*t)`).join("+");
    // A short deadline keeps the suite light; the property is that the work ends close to it.
    const deadline = performance.now() + 400;
    const start = performance.now();
    try {
      panel("second", `x'' + 0.1*x' + x = exp(t)*t^24*(${cosines})`, formula({ center: 800, initial: [1, 0] }), {
        checkpoint: () => {
          if (performance.now() > deadline) throw new RangeError("budget");
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(RangeError);
    }
    expect(performance.now() - start).toBeLessThan(1800);
  });
});

describe("sixth round: the direct reference and the refusal prefix", () => {
  it("a small leading coefficient: 1e-8 x'' + x = 0 is cos(10^4 t), and its check does not fail", () => {
    // The coefficient of x'' is taken structurally (no 1e-8 + x - x cancellation in the reference field).
    const out = text(panel("second", "1e-8*x'' + x = 0", formula({ initial: [1, 0] }), { chart: false }));
    expect(out).toContain("x(t) = cos(10000t)");
    expect(out).not.toContain("Check failed");
  });

  it("a huge solution: x'' + x = 0 from x(0) = 1e300 keeps its reference (F = −x, never −Infinity)", () => {
    const r = panel("second", "x'' + x = 0", formula({ initial: [1e300, 0] }), { chart: false });
    if (r.status !== "ok" || !r.check) throw new Error();
    expect(r.check.numeric?.ok).toBe(true);
  });

  it("the refusal prefix names every step it applied, in order", () => {
    // Multiplied by t − 2 (the denominator), then the common factor t cancelled: (t − 2)x'' + (t − 2)x = eᵗ.
    const m = message(panel("second", "t*x'' + t*x = t*exp(t)/(t-2)", series()));
    expect(m).toContain("Multiplied by (−2 + t) to clear the denominator, with the common factor t of every term cancelled, the equation reads (t − 2)x'' + (t − 2)x = eᵗ.");
  });
});
