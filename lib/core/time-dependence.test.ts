import { describe, expect, it } from "vitest";
import { compileSystem } from "./parse";
import { toSystem } from "./slope-field";
import { detectTimeDependence, PROBE_TIMES, TIME_DEPENDENCE_TOL } from "./time-dependence";

// The box every derivation below refers to: the 13 sample points are x = -3 + 6·FX, y = -3 + 6·FY.
const box = { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } };
const probe = (f: string, g: string, b = box) => detectTimeDependence(compileSystem({ f, g }), b);

describe("detectTimeDependence", () => {
  it("probes at t = 0 and at four irrational-looking times on both sides of 0", () => {
    expect(PROBE_TIMES[0]).toBe(0);
    expect(PROBE_TIMES.some((t) => t < 0)).toBe(true);
    expect(PROBE_TIMES.some((t) => t > 0)).toBe(true);
    expect(TIME_DEPENDENCE_TOL).toBe(1e-9);
  });

  it("x' = y, y' = -x + sin(t) depends on t with a deviation of order 1", () => {
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

  it("x' = y, y' = -x is autonomous: the deviation is exactly 0", () => {
    const r = probe("y", "-x");
    expect(r).toEqual({ dependsOnT: false, maxRelDeviation: 0, samples: 13 });
  });

  it("0*t + y is autonomous: 0·t is exactly 0 for every finite t, so F is bit-identical at every probe time", () => {
    const r = probe("0*t + y", "-x");
    expect(r).toEqual({ dependsOnT: false, maxRelDeviation: 0, samples: 13 });
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

  it("a tiny but real time dependence, y' = -x + 1e-6·sin(t), is detected (1e-6 is far above the 1e-9 threshold)", () => {
    // Deviation 1e-6 · 0.98777 at every point, typical magnitude between 0.35 and 5 (see above):
    // relative deviation between 1.97e-7 and 2.9e-6.
    const r = probe("y", "-x + 1e-6*sin(t)");
    expect(r.dependsOnT).toBe(true);
    expect(r.maxRelDeviation).toBeGreaterThan(1.9e-7);
    expect(r.maxRelDeviation).toBeLessThan(3e-6);
  });

  it("rounding noise from a t that cancels, x + t - t, is below the floor and is not time dependence", () => {
    // |((x + t) - t) - x| ≤ 2·eps·(|x| + |t|) ≤ 2 · 2.22e-16 · 6.15 ≈ 2.7e-15, while the floor is
    // 1e3·eps·typical ≥ 2.22e-13 · 0.35 ≈ 7.8e-14 (the smallest sample magnitude of hypot(x, y) on
    // this box is about 0.35). So every deviation is floored to 0 and the verdict is exact.
    const r = probe("x + t - t", "y");
    expect(r).toEqual({ dependsOnT: false, maxRelDeviation: 0, samples: 13 });
  });

  it("a domain that moves with t (sqrt(t) is undefined at the negative probe time) counts as time dependence", () => {
    // predictable: true makes sqrt(-2.7183) NaN, and 0·NaN is NaN, so the field is finite at four
    // probe times and undefined at one: the deviation is reported as infinite.
    const r = probe("sqrt(t)*0 + y", "-x");
    expect(r.dependsOnT).toBe(true);
    expect(r.maxRelDeviation).toBe(Infinity);
    expect(r.samples).toBe(13);
  });

  it("points undefined at every probe time are dropped; with none left the verdict is 'not time-dependent' with 0 samples", () => {
    const r = probe("1/0", "y");
    expect(r).toEqual({ dependsOnT: false, maxRelDeviation: 0, samples: 0 });
  });

  it("the verdict does not depend on the box", () => {
    // On x ∈ [10, 20], y ∈ [-1, 1]: |F| ≤ hypot(1, 21) < 21.1, deviation 0.98777 -> relative ≥ 0.046.
    const far = probe("y", "-x + sin(t)", { x: { min: 10, max: 20 }, y: { min: -1, max: 1 } });
    expect(far.dependsOnT).toBe(true);
    expect(far.maxRelDeviation).toBeGreaterThan(0.046);
    const tiny = probe("y", "-x", { x: { min: -1e-3, max: 1e-3 }, y: { min: -1e-3, max: 1e-3 } });
    expect(tiny).toEqual({ dependsOnT: false, maxRelDeviation: 0, samples: 13 });
  });

  it("calls the checkpoint once per sample point", () => {
    let n = 0;
    detectTimeDependence(compileSystem({ f: "y", g: "-x" }), box, { checkpoint: () => n++ });
    expect(n).toBe(13);
  });
});
