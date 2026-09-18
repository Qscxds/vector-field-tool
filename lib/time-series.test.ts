/**
 * Round Q: the time-series view's pure helpers. Expectations derived from the rules in
 * time-series.ts and from a solution known in closed form (x'' = -x: x(t) = cos t), never from output.
 */
import { describe, expect, it } from "vitest";
import { compileSystem } from "./core/parse";
import { reduceSecondOrder } from "./core/second-order";
import { CLICK_TSPAN, traceBoth, traceFixed } from "./interactive";
import type { TrajectoryView } from "./scene";
import { DEFAULT_TIME_RANGE, defaultView, hasTimeSeries, parseTimeRange, seriesCurves, seriesHits, seriesName, seriesOf, timeSeriesBox, MAX_TRACE_TSPAN, traceSpans } from "./time-series";

const BOX = { x: { min: -5, max: 5 }, y: { min: -5, max: 5 } };

describe("[Q] which view a picture opens with", () => {
  it("autonomous planar pictures open on the phase plane, non-autonomous ones on the time series; first-order pictures never offer the toggle", () => {
    expect(defaultView("system", false)).toBe("phase");
    expect(defaultView("second", false)).toBe("phase");
    expect(defaultView("system", true)).toBe("time");
    expect(defaultView("second", true)).toBe("time");
    expect(defaultView("first", true)).toBe("phase");
    expect(hasTimeSeries("first")).toBe(false);
    expect(hasTimeSeries("system")).toBe(true);
    expect(hasTimeSeries("second")).toBe(true);
    expect(DEFAULT_TIME_RANGE).toEqual({ min: 0, max: 20 });
  });
});

describe("[Q] the drawn series and their names", () => {
  it("a planar system draws x(t) and y(t); a second-order equation draws x(t) and, on request, x'(t) (the kernel's y)", () => {
    expect(seriesOf("system", false)).toEqual(["x", "y"]);
    expect(seriesOf("system", true)).toEqual(["x", "y"]);
    expect(seriesOf("second", false)).toEqual(["x"]);
    expect(seriesOf("second", true)).toEqual(["x", "y"]);
    expect(seriesName("system", "x")).toBe("x(t)");
    expect(seriesName("system", "y")).toBe("y(t)");
    expect(seriesName("second", "x")).toBe("x(t)");
    // The student's notation, never the reduction's y (P2 principle).
    expect(seriesName("second", "y")).toBe("x'(t)");
  });

  it("the box spans the chosen t range across and the union of the drawn components' entered ranges up", () => {
    const phaseBox = { x: { min: -2, max: 3 }, y: { min: -6, max: 1 } };
    expect(timeSeriesBox(phaseBox, ["x"], { min: 0, max: 20 })).toEqual({ x: { min: 0, max: 20 }, y: { min: -2, max: 3 } });
    expect(timeSeriesBox(phaseBox, ["x", "y"], { min: -1, max: 4 })).toEqual({ x: { min: -1, max: 4 }, y: { min: -6, max: 3 } });
  });
});

describe("[Q] curves against the kernel's clock", () => {
  // x' = y, y' = -x through (1, 0) at t0 = 0: x(t) = cos t, y(t) = -sin t.
  const sys = compileSystem({ f: "y", g: "-x" });
  const legs = traceBoth(sys, { x: 1, y: 0 }, { stopBox: BOX, tSpan: 2, t0: 0 });

  it("every leg carries its times (one per point)", () => {
    for (const leg of legs) {
      expect(leg.times).toBeDefined();
      expect(leg.times!.length).toBe(leg.points.length);
    }
    expect(legs[0].times![0]).toBe(0);
    expect(legs[1].times![legs[1].times!.length - 1]).toBeCloseTo(-2, 9);
  });

  it("joins the backward leg (reversed) and the forward leg into one polyline ordered by t, with the start point once", () => {
    const [xs, ys] = seriesCurves(legs, ["x", "y"]);
    expect(xs.key).toBe("x");
    expect(ys.key).toBe("y");
    for (let i = 1; i < xs.points.length; i++) expect(xs.points[i].x).toBeGreaterThan(xs.points[i - 1].x);
    expect(xs.points[0].x).toBeCloseTo(-2, 9);
    expect(xs.points[xs.points.length - 1].x).toBeCloseTo(2, 9);
    expect(xs.points.filter((p) => p.x === 0)).toHaveLength(1);
    // The values are the solution's: cos t and -sin t at both ends (the integrator's tolerance is ~1e-6 here).
    expect(xs.points[0].y).toBeCloseTo(Math.cos(-2), 4);
    expect(xs.points[xs.points.length - 1].y).toBeCloseTo(Math.cos(2), 4);
    expect(ys.points[0].y).toBeCloseTo(-Math.sin(-2), 4);
    expect(ys.points[ys.points.length - 1].y).toBeCloseTo(-Math.sin(2), 4);
    expect(xs.nonUnique).toBeUndefined();
  });

  it("a leg without times (an older tool result) draws nothing; the non-unique flag of either leg is carried", () => {
    const bare: TrajectoryView[] = legs.map(({ times: _times, ...leg }) => leg);
    expect(seriesCurves(bare, ["x", "y"])).toEqual([]);
    const flagged = legs.map((leg, i) => (i === 1 ? { ...leg, nonUnique: true } : leg));
    expect(seriesCurves(flagged, ["x"])[0].nonUnique).toBe(true);
  });

  it("a query's hits are marked at (t, value) for every drawn series", () => {
    const hits = [{ t: 1.5, x: 0.07, y: -0.99, error: { t: 0, position: 1e-6 }, speed: 1 }];
    expect(seriesHits(hits, ["x"])).toEqual([{ key: "x", at: { x: 1.5, y: 0.07 } }]);
    expect(seriesHits(hits, ["x", "y"])).toEqual([
      { key: "x", at: { x: 1.5, y: 0.07 } },
      { key: "y", at: { x: 1.5, y: -0.99 } },
    ]);
  });
});

describe("[Q] the t range fields", () => {
  it("accept two numbers with start < end and nothing else", () => {
    expect(parseTimeRange("0", "20")).toEqual({ min: 0, max: 20 });
    expect(parseTimeRange(" -1.5 ", "2e1")).toEqual({ min: -1.5, max: 20 });
    expect(parseTimeRange("5", "5")).toBeNull();
    expect(parseTimeRange("6", "5")).toBeNull();
    expect(parseTimeRange("", "5")).toBeNull();
    expect(parseTimeRange("abc", "5")).toBeNull();
    expect(parseTimeRange("0", "Infinity")).toBeNull();
  });
});

describe("[U] traceSpans: a kept curve is followed far enough to fill the t range, never less than the phase plane's span, never beyond the cap", () => {
  it("derived cases (base 50, cap 500)", () => {
    expect(MAX_TRACE_TSPAN).toBe(500);
    // the default range 0..20 changes nothing
    expect(traceSpans({ min: 0, max: 20 }, 0, 50)).toEqual({ forward: 50, backward: 50 });
    // one envelope of the beats at g = 1.2 (2 pi / 0.1 = 62.8): forward 70, backward still 50
    expect(traceSpans({ min: 0, max: 70 }, 0, 50)).toEqual({ forward: 70, backward: 50 });
    // not symmetric about t0, and measured FROM t0: t0 = 10, range -100..200 -> backward 110, forward 190
    expect(traceSpans({ min: -100, max: 200 }, 10, 50)).toEqual({ forward: 190, backward: 110 });
    // the cap
    expect(traceSpans({ min: -1e5, max: 1e5 }, 0, 50)).toEqual({ forward: 500, backward: 500 });
    // a range that lies wholly before t0 needs nothing forward: the base
    expect(traceSpans({ min: -80, max: -10 }, 0, 50)).toEqual({ forward: 50, backward: 80 });
  });
});

describe("[U.4] resonance with the existing integrator: the amplitude grows as the forcing frequency g approaches the natural frequency 1", () => {
  // x'' = -x + F cos(g t) from rest: x = F/(g² - 1) (cos t - cos g t) = 2F/(g² - 1) sin((g - 1)t/2) sin((g + 1)t/2).
  // The envelope 2F/|g² - 1| |sin((g - 1)t/2)| reaches its maximum 2F/|g² - 1| at t = pi/|g - 1|:
  // g = 1.2: 2.2727 at t = 15.7;  g = 1.05: 9.7561 at t = 62.8. Both lie inside t in [0, 70].
  const box = { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } };
  const peak = (g: number) => {
    const sys = compileSystem(reduceSecondOrder("x'' = -x + F*cos(g*t)", { F: 0.5, g }).spec);
    const forward = traceFixed(sys, { x: 0, y: 0 }, box, 0, traceSpans({ min: 0, max: 70 }, 0, CLICK_TSPAN))[0];
    expect(forward.status).toBe("completed");
    // followed to the end of the t range, not to the phase plane's 50
    expect(forward.times!.at(-1)).toBeCloseTo(70, 9);
    return Math.max(...forward.points.map((p) => Math.abs(p.x)));
  };

  it("the peak of x(t) over t in [0, 70] is just under the envelope's maximum 2F/|g² - 1|, and four times larger at g = 1.05 than at g = 1.2", () => {
    const at12 = peak(1.2);
    const at105 = peak(1.05);
    expect(at12).toBeLessThanOrEqual(1 / 0.44 + 1e-6);
    expect(at12).toBeGreaterThan(0.95 / 0.44);
    expect(at105).toBeLessThanOrEqual(1 / 0.1025 + 1e-6);
    expect(at105).toBeGreaterThan(0.95 / 0.1025);
  });
});
