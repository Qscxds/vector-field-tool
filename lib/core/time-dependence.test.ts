import { describe, expect, it } from "vitest";
import { compileSystem } from "./parse";
import { toSystem } from "./slope-field";
import { boxSamplePoints, detectTimeDependence, mentionsTime, PROBE_TIMES } from "./time-dependence";

// The box every derivation below refers to: the 13 sample points are x = -3 + 6·FX, y = -3 + 6·FY.
const box = { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } };
const probe = (f: string, g: string, b = box, snapshotT?: number) => detectTimeDependence(compileSystem({ f, g }), b, snapshotT === undefined ? {} : { snapshotT });

describe("mentionsTime (the static rule)", () => {
  it("is true exactly when the symbol t appears in f or g of a planar system", () => {
    expect(mentionsTime({ f: "y", g: "-x + sin(t)" })).toBe(true);
    expect(mentionsTime({ f: "t", g: "0" })).toBe(true);
    expect(mentionsTime({ f: "0*t + y", g: "-x" })).toBe(true);
    expect(mentionsTime({ f: "x + t - t", g: "y" })).toBe(true);
    expect(mentionsTime({ f: "atan2(t, x)", g: "y" })).toBe(true);
    expect(mentionsTime({ f: "y", g: "-x" })).toBe(false);
    expect(mentionsTime({ f: "a*y", g: "-x*tanh(x)", params: { a: 2 } })).toBe(false);
    // "tanh" and "atan" contain the letter t but are function names, not the symbol.
    expect(mentionsTime({ f: "tanh(x)", g: "atan(y)" })).toBe(false);
  });

  it("a 'ty' system is never time-dependent: its t is the horizontal coordinate", () => {
    expect(mentionsTime(toSystem({ kind: "explicit", g: "sin(t)" }))).toBe(false);
    expect(mentionsTime(toSystem({ kind: "differential", M: "t*y", N: "t^2" }))).toBe(false);
  });
});

describe("detectTimeDependence", () => {
  it("probes at t = 0 and at four irrational-looking times on both sides of 0, at 13 points of the box", () => {
    expect(PROBE_TIMES[0]).toBe(0);
    expect(PROBE_TIMES.some((t) => t < 0)).toBe(true);
    expect(PROBE_TIMES.some((t) => t > 0)).toBe(true);
    const pts = boxSamplePoints(box);
    expect(pts).toHaveLength(13);
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(-3);
      expect(p.x).toBeLessThan(3);
      expect(p.y).toBeGreaterThan(-3);
      expect(p.y).toBeLessThan(3);
      expect(Number.isInteger(p.x)).toBe(false);
      expect(Number.isInteger(p.y)).toBe(false);
    }
  });

  it("x' = y, y' = -x + sin(t) depends on t, with a measured deviation of order 1", () => {
    // At every point the change between t = 0 and t is |sin t|; the largest over the probe times is
    // sin(1.4142) ≈ 0.98777. On the box |F| = hypot(y, -x + sin t) ≤ hypot(3, 4) = 5, so the typical
    // magnitude (a 75th percentile of |F|) is at most 5 and the relative deviation is at least
    // 0.98777 / 5 = 0.1975; the smallest sample magnitude is above 0.35, so it is below 3.
    const r = probe("y", "-x + sin(t)");
    expect(r.dependsOnT).toBe(true);
    expect(r.samples).toBe(13);
    expect(r.maxRelDeviation).toBeGreaterThan(0.19);
    expect(r.maxRelDeviation).toBeLessThan(3);
  });

  it("x' = y, y' = -x is autonomous: no t, and the measured deviation is exactly 0", () => {
    const r = probe("y", "-x");
    expect(r).toEqual({ dependsOnT: false, maxRelDeviation: 0, samples: 13 });
  });

  it("0*t + y is time-dependent BY THE STATIC RULE (t appears), while the probe honestly measures no change", () => {
    // Decision (J review, C.5): the verdict is read from the expression, never from the probe. 0·t
    // is exactly 0 for every finite t, so F is bit-identical at every probe time and the evidence
    // says "no change measured"; the analysis is still withheld because t is present.
    const r = probe("0*t + y", "-x");
    expect(r).toEqual({ dependsOnT: true, maxRelDeviation: 0, samples: 13 });
  });

  it("is scale invariant: multiplying f and g by 1e6 (or 1e-6) changes neither the verdict nor the measured deviation", () => {
    // Both the deviation and the typical magnitude scale by the same factor; each product carries at
    // most one rounding (relative eps), so the ratio agrees to a few eps, far inside 1e-12.
    const base = probe("y", "-x + sin(t)");
    for (const k of ["1e6", "1e-6"]) {
      const scaled = probe(`${k}*(y)`, `${k}*(-x + sin(t))`);
      expect(scaled.dependsOnT).toBe(true);
      expect(Math.abs(scaled.maxRelDeviation - base.maxRelDeviation)).toBeLessThanOrEqual(1e-12 * base.maxRelDeviation);
    }
    const autonomous = probe("1e6*y", "-1e6*x");
    expect(autonomous).toEqual({ dependsOnT: false, maxRelDeviation: 0, samples: 13 });
  });

  it("the reduced system of dy/dt = sin(t) (variables 'ty') ignores the time argument and is not time-dependent", () => {
    // In "ty" mode the symbol t is the horizontal coordinate p.x; the evaluator never reads its time
    // argument, so F(p, t) is the same object-for-object value at every probe time.
    const sys = compileSystem(toSystem({ kind: "explicit", g: "sin(t)" }));
    expect(sys.spec.variables).toBe("ty");
    const r = detectTimeDependence(sys, box);
    expect(r).toEqual({ dependsOnT: false, maxRelDeviation: 0, samples: 13 });
  });

  it("a tiny but real time dependence, y' = -x + 1e-6·sin(t), is time-dependent on every box; only the measured evidence shrinks with the box", () => {
    // Deviation 1e-6 · 0.98777 at every point. On [-3, 3]^2 the typical magnitude is between 0.35
    // and 5 (see above): relative deviation between 1.97e-7 and 2.9e-6. On [-1e4, 1e4]^2 the
    // magnitudes are about 3333 times larger, so the relative deviation is below 1e-9 (the old
    // probe threshold): the verdict must not come from the probe.
    const small = probe("y", "-x + 1e-6*sin(t)");
    expect(small.dependsOnT).toBe(true);
    expect(small.maxRelDeviation).toBeGreaterThan(1.9e-7);
    expect(small.maxRelDeviation).toBeLessThan(3e-6);
    const large = probe("y", "-x + 1e-6*sin(t)", { x: { min: -1e4, max: 1e4 }, y: { min: -1e4, max: 1e4 } });
    expect(large.dependsOnT).toBe(true);
    expect(large.maxRelDeviation).toBeLessThan(1e-9);
    expect(large.maxRelDeviation).toBeGreaterThan(5e-11);
  });

  it("a forcing localized away from every sample point, exp(-2000 x^2) sin(t), is time-dependent with a measured change of exactly 0", () => {
    // The sample x nearest 0 on this box is -3 + 6·0.5236 = 0.1416, where exp(-2000·0.02) ≈ 4e-18;
    // the change is below the rounding floor (1e3·eps·typical ≈ 7e-13) at every point, so the probe
    // measures 0. The static rule still says non-autonomous; F(0, 0, 1.5) = (0, sin 1.5) ≠ 0.
    const r = probe("y", "-x + exp(-2000*x^2)*sin(t)");
    expect(r).toEqual({ dependsOnT: true, maxRelDeviation: 0, samples: 13 });
    expect(compileSystem({ f: "y", g: "-x + exp(-2000*x^2)*sin(t)" }).eval({ x: 0, y: 0 }, 1.5).y).toBe(Math.sin(1.5));
  });

  it("rounding noise from a t that cancels, x + t - t, is below the floor: no change measured, but t is present so the verdict is time-dependent", () => {
    // |((x + t) - t) - x| ≤ 2·eps·(|x| + |t|) ≤ 2 · 2.22e-16 · 6.15 ≈ 2.7e-15, while the floor is
    // 1e3·eps·typical ≥ 2.22e-13 · 0.35 ≈ 7.8e-14 (the smallest sample magnitude of hypot(x, y) on
    // this box is about 0.35). So every deviation is floored to 0 and the evidence is exact.
    const r = probe("x + t - t", "y");
    expect(r).toEqual({ dependsOnT: true, maxRelDeviation: 0, samples: 13 });
  });

  it("a domain that moves with t (sqrt(t) is undefined at the negative probe time) is reported as an infinite deviation", () => {
    // predictable: true makes sqrt(-2.7183) NaN, and 0·NaN is NaN, so the field is finite at four
    // probe times and undefined at one: the deviation is reported as infinite.
    const r = probe("sqrt(t)*0 + y", "-x");
    expect(r.dependsOnT).toBe(true);
    expect(r.maxRelDeviation).toBe(Infinity);
    expect(r.samples).toBe(13);
  });

  it("the snapshot time joins the probe: sqrt(t - 5)·x is undefined at every fixed probe time, but finite at the snapshot t = 10", () => {
    // Without the snapshot every sample is undefined at every time: 0 samples, nothing measured;
    // the static rule still says time-dependent. With t = 10 in the set each point is finite at one
    // time and undefined at the others: the domain moves with t, deviation Infinity, 13 samples.
    expect(probe("y", "-x*sqrt(t - 5)")).toEqual({ dependsOnT: true, maxRelDeviation: 0, samples: 0 });
    expect(probe("y", "-x*sqrt(t - 5)", box, 10)).toEqual({ dependsOnT: true, maxRelDeviation: Infinity, samples: 13 });
    // A snapshot time that is already a probe time adds nothing.
    expect(probe("y", "-x + sin(t)", box, 0)).toEqual(probe("y", "-x + sin(t)"));
  });

  it("points undefined at every probe time are dropped; with none left and no t the verdict is autonomous with 0 samples", () => {
    const r = probe("1/0", "y");
    expect(r).toEqual({ dependsOnT: false, maxRelDeviation: 0, samples: 0 });
  });

  it("the verdict does not depend on the box: the same system is time-dependent (or not) on three boxes of different size and position", () => {
    const boxes = [
      box,
      { x: { min: 10, max: 20 }, y: { min: -1, max: 1 } },
      { x: { min: -1e-3, max: 1e-3 }, y: { min: -1e-3, max: 1e-3 } },
      { x: { min: -1e4, max: 1e4 }, y: { min: -1e4, max: 1e4 } },
    ];
    for (const b of boxes) {
      expect(probe("y", "-x + sin(t)", b).dependsOnT, JSON.stringify(b)).toBe(true);
      expect(probe("y", "-x + 1e-6*sin(t)", b).dependsOnT, JSON.stringify(b)).toBe(true);
      expect(probe("y", "-x + exp(-2000*x^2)*sin(t)", b).dependsOnT, JSON.stringify(b)).toBe(true);
      expect(probe("y", "-x", b), JSON.stringify(b)).toEqual({ dependsOnT: false, maxRelDeviation: 0, samples: 13 });
    }
    // On x ∈ [10, 20], y ∈ [-1, 1]: |F| ≤ hypot(1, 21) < 21.1, deviation 0.98777 -> relative ≥ 0.046.
    expect(probe("y", "-x + sin(t)", boxes[1]).maxRelDeviation).toBeGreaterThan(0.046);
  });

  it("calls the checkpoint once per sample point", () => {
    let n = 0;
    detectTimeDependence(compileSystem({ f: "y", g: "-x" }), box, { checkpoint: () => n++ });
    expect(n).toBe(13);
  });
});
