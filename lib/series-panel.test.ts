/**
 * Round 12: the panel's one computation (lib/series-panel). Expected values come from closed forms
 * derived by hand: cos t for x'' + x = 0 with x(0) = 1, x'(0) = 0; e^t for dy/dt = y, y(0) = 1;
 * 2e^(-t) - e^(-2t) for x'' + 3x' + 2x = 0; the Legendre radius 1.
 */
import { describe, expect, it } from "vitest";
import { labels } from "./labels";
import { numericalSolution } from "./series/chart";
import { computeSeriesPanel, DEFAULT_SERIES_SETTINGS, SERIES_CHART_RADII, seriesModeOf, type SeriesSettings } from "./series-panel";

const L = labels("en");
const on = (s: Partial<SeriesSettings>): SeriesSettings => ({ ...DEFAULT_SERIES_SETTINGS, kind: "series", ...s });
const ranges = { tRange: { min: -3, max: 3 }, vRange: { min: -3, max: 3 } };

describe("computeSeriesPanel", () => {
  it("is off by default and offered only in the two one-equation modes", () => {
    expect(computeSeriesPanel(L, { mode: "second", text: "x'' + x = 0", settings: DEFAULT_SERIES_SETTINGS, ...ranges }).status).toBe("off");
    expect(seriesModeOf("first")).toBe("first");
    expect(seriesModeOf("second")).toBe("second");
    expect(seriesModeOf("system")).toBeNull();
    expect(seriesModeOf("diff")).toBeNull();
  });

  it("the partial sum through t^10 of x'' + x = 0 matches cos t near 0 and the numerical solution is drawn", () => {
    const r = computeSeriesPanel(L, { mode: "second", text: "x'' + x = 0", settings: on({ terms: 10, initial: [1, 0] }), ...ranges });
    expect(r.status).toBe("ok");
    if (r.status !== "ok" || !r.chart) throw new Error();
    const [numerical, partial] = r.chart.curves;
    expect(r.chart.bands).toEqual([]); // no singular point: no band, the picture's t range
    expect(r.chart.tRange).toEqual(ranges.tRange);
    const near = partial.segments.flat().find((p) => Math.abs(p.x - 0.495) < 0.01)!;
    // |S10(t) - cos t| <= t^12/12! at t ~ 0.5: below 1e-12
    expect(Math.abs(near.y - Math.cos(near.x))).toBeLessThan(1e-11);
    const n = numerical.segments.flat().find((p) => p.x > 1)!;
    expect(Math.abs(n.y - Math.cos(n.x))).toBeLessThan(1e-8);
  });

  it("Legendre: the chart reaches 2.5 radii around t0 and shades |t| < 1", () => {
    const r = computeSeriesPanel(L, { mode: "second", text: "(1-t^2)*x'' - 2*t*x' + 6*x = 0", settings: on({}), ...ranges });
    if (r.status !== "ok" || !r.chart) throw new Error();
    expect(r.chart.tRange).toEqual({ min: -SERIES_CHART_RADII, max: SERIES_CHART_RADII });
    expect(r.chart.bands.map((b) => [b.min, b.max])).toEqual([[-1, 1]]);
  });

  it("a radius a few ulps wide gives the derivation and no chart (nothing could be drawn)", () => {
    // the singular point 1.0000000000000002 lies 2^-52 from t0 = 1: 2.5 radii are about 5.6e-16 wide,
    // far below MIN_CHART_ULPS ulps of 1, and on the picture's range the partial sum would not show.
    const r = computeSeriesPanel(L, { mode: "second", text: "(t-1.0000000000000002)*x'' + x = 0", settings: on({ center: 1 }), ...ranges });
    expect(r.status).toBe("ok");
    expect(r.status === "ok" && r.chart).toBeNull();
  });

  it("a singular center gives the derivation and no chart", () => {
    const r = computeSeriesPanel(L, { mode: "second", text: "t*x'' + x' + t*x = 0", settings: on({}), ...ranges });
    expect(r.status === "ok" && r.chart).toBeNull();
  });

  it("the solution formula passes its check against the numerical solution", () => {
    const r = computeSeriesPanel(L, { mode: "second", text: "x'' + 3*x' + 2*x = 0", settings: { ...on({ initial: [1, 0] }), kind: "formula" }, ...ranges });
    if (r.status !== "ok" || !r.check || !r.check.numeric) throw new Error();
    // x_h only (homogeneous): the residual is exactly 0; near t0 the numbers agree.
    expect(r.check.residualExact).toBe(true);
    expect(r.check.numeric.ok).toBe(true);
    expect(r.check.numeric.deviation).toBeLessThan(1e-6);
    expect(r.check.numeric.covered).toEqual({ min: -1, max: 1 });
    // x(1) = 2/e - 1/e^2
    const total = r.chart!.curves[0].segments.flat().find((p) => Math.abs(p.x - 1) < 0.008)!;
    expect(total.y).toBeCloseTo(2 * Math.exp(-total.x) - Math.exp(-2 * total.x), 10);
  });

  it("refusals are explanations, not errors", () => {
    const nonlinear = computeSeriesPanel(L, { mode: "second", text: "x'' + sin(x) = 0", settings: on({}), ...ranges });
    expect(nonlinear.status).toBe("unavailable");
    const variable = computeSeriesPanel(L, { mode: "second", text: "x'' + t*x = 0", settings: { ...on({}), kind: "formula" }, ...ranges });
    expect(variable.status).toBe("unavailable");
  });
});

describe("the numerical reference", () => {
  it("dy/dt = y from y(0) = 1 reaches e at t = 1 (both directions integrated)", () => {
    const pts = numericalSolution("first", "y", undefined, 0, [1], { min: -1, max: 1 });
    expect(pts).not.toBeNull();
    const last = pts![pts!.length - 1];
    expect(last.x).toBeCloseTo(1, 12);
    expect(last.y).toBeCloseTo(Math.E, 8);
    expect(pts![0].x).toBeCloseTo(-1, 12);
    expect(pts![0].y).toBeCloseTo(1 / Math.E, 8);
  });
});
