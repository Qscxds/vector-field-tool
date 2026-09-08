import { describe, expect, it } from "vitest";
import { compileSystem } from "./parse";
import {
  BORDERLINE_EXPONENT,
  equilibriaUniqueness,
  LIPSCHITZ_LEVELS,
  lipschitzOffsets,
  lipschitzProbe,
  UNBOUNDED_EXPONENT,
} from "./uniqueness";

/** Least-squares slope of ys against xs (the fit the probe uses), on ANALYTIC values: a derivation, not program output. */
function slope(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  return sxy / sxx;
}

describe("lipschitzOffsets", () => {
  it("are scale · 1e-2 · 4^-k for k = 0..7, down to about 6e-7 · scale", () => {
    const d = lipschitzOffsets(1);
    expect(d).toHaveLength(LIPSCHITZ_LEVELS);
    expect(d[0]).toBe(1e-2);
    expect(d[1]).toBeCloseTo(2.5e-3, 15);
    expect(d[7]).toBeCloseTo(1e-2 / 16384, 18); // 6.1035e-7
    expect(lipschitzOffsets(3)[0]).toBeCloseTo(3e-2, 15);
    expect(() => lipschitzProbe((x) => x, 0)).toThrow(RangeError);
  });
});

describe("lipschitzProbe: growth exponent of the difference quotients", () => {
  it("sqrt(y) at 0: unbounded above with α = 1/2, undefined below", () => {
    // D_k = sqrt(δ) / δ = δ^-1/2 exactly (sqrt is correctly rounded), so the log-log slope is -1/2.
    // sqrt of a negative offset is NaN: the equation is not defined below y = 0.
    const r = lipschitzProbe(Math.sqrt, 1);
    expect(r.sides.above.verdict).toBe("unbounded");
    expect(r.sides.above.exponent).toBeCloseTo(0.5, 6);
    expect(r.sides.above.levels).toBe(8);
    expect(r.sides.below.verdict).toBe("undefined");
    expect(r.sides.below.levels).toBe(0);
    expect(Number.isNaN(r.sides.below.exponent)).toBe(true);
    expect(r.verdict).toBe("unbounded");
    expect(r.exponent).toBeCloseTo(0.5, 6);
    expect(r.scale).toBe(1);
  });

  it("y^(1/3) at 0: α = 2/3 above; below is undefined because a negative base with a fractional exponent is NaN here", () => {
    // D = δ^(1/3) / δ = δ^-2/3. The kernel's pow is the JS ** operator (parse.ts), and
    // (-0.01) ** (1/3) is NaN, not the real cube root -0.215: the probe sees no field below 0.
    const r = lipschitzProbe((d) => d ** (1 / 3), 1);
    expect(r.sides.above.verdict).toBe("unbounded");
    expect(r.sides.above.exponent).toBeCloseTo(2 / 3, 6);
    expect(r.sides.below.verdict).toBe("undefined");
    expect(r.verdict).toBe("unbounded");
    expect(r.exponent).toBeCloseTo(2 / 3, 6);
  });

  it("3 y^(2/3) at 0: α = 1/3", () => {
    // D = 3 δ^(2/3) / δ = 3 δ^-1/3: the constant factor shifts log D, not its slope.
    const r = lipschitzProbe((d) => 3 * d ** (2 / 3), 1);
    expect(r.verdict).toBe("unbounded");
    expect(r.exponent).toBeCloseTo(1 / 3, 6);
  });

  it("y at 0: bounded, α = 0 on both sides (D = 1 at every level)", () => {
    const r = lipschitzProbe((d) => d, 1);
    expect(r.verdict).toBe("bounded_at_tested_scales");
    expect(r.exponent).toBeCloseTo(0, 10);
    expect(r.sides.above.verdict).toBe("bounded_at_tested_scales");
    expect(r.sides.below.verdict).toBe("bounded_at_tested_scales");
    expect(r.sides.above.levels).toBe(8);
    expect(r.sides.below.levels).toBe(8);
  });

  it("1e6 · y is bounded at every scale (scale invariance: D = 1e6 at every level, slope 0)", () => {
    for (const scale of [1e-3, 1, 1e3]) {
      const r = lipschitzProbe((d) => 1e6 * d, scale);
      expect(r.verdict).toBe("bounded_at_tested_scales");
      expect(r.exponent).toBeCloseTo(0, 10);
      expect(r.scale).toBe(scale);
    }
  });

  it("abs(y) at 0: bounded, D = 1 on both sides", () => {
    const r = lipschitzProbe(Math.abs, 1);
    expect(r.sides.above).toMatchObject({ verdict: "bounded_at_tested_scales", levels: 8 });
    expect(r.sides.below).toMatchObject({ verdict: "bounded_at_tested_scales", levels: 8 });
    expect(r.sides.above.exponent).toBeCloseTo(0, 10);
    expect(r.sides.below.exponent).toBeCloseTo(0, 10);
  });

  it("y (1 - y) at y = 1: bounded, |α| below 0.01", () => {
    // h(d) = (1 + d)(1 - (1 + d)) = -d (1 + d), so D = 1 + d and log D = log(1 + d) <= d <= 1e-2.
    // A fit over x_k = log δ_k (spread Σ(x - x̄)² = 8 · 5.25 · ln²4 ≈ 80.7) of values that stay
    // within 1e-2 of each other has |slope| <= 1e-2 · sqrt(8 / 80.7) ≈ 3.1e-3.
    const r = lipschitzProbe((d) => (1 + d) * (1 - (1 + d)), 1);
    expect(r.verdict).toBe("bounded_at_tested_scales");
    expect(Math.abs(r.exponent)).toBeLessThan(0.01);
    expect(r.sides.below.verdict).toBe("bounded_at_tested_scales");
  });

  it("y² at 0: bounded, α = -1 (D = δ goes to zero)", () => {
    const r = lipschitzProbe((d) => d * d, 1);
    expect(r.verdict).toBe("bounded_at_tested_scales");
    expect(r.exponent).toBeCloseTo(-1, 6);
    expect(r.sides.below.exponent).toBeCloseTo(-1, 6);
  });

  it("y·log|y| at 0 (derivative log|y| + 1, unbounded but only logarithmically) reads as borderline", () => {
    // D = |log δ| = -log δ. The fitted α is the negative slope of log(-log δ) against log δ over
    // the eight levels: computed here from the analytic D, it is about 0.117, between 0.1 and 0.25.
    const deltas = lipschitzOffsets(1);
    const alpha = -slope(deltas.map(Math.log), deltas.map((d) => Math.log(-Math.log(d))));
    expect(alpha).toBeGreaterThan(BORDERLINE_EXPONENT);
    expect(alpha).toBeLessThan(UNBOUNDED_EXPONENT);
    const r = lipschitzProbe((d) => d * Math.log(Math.abs(d)), 1);
    expect(r.verdict).toBe("borderline");
    expect(r.exponent).toBeCloseTo(alpha, 9);
    expect(r.sides.below.verdict).toBe("borderline");
  });

  it("skips levels the rounding floor cannot resolve: (1 + y⁴) - 1", () => {
    // δ_3 = 1e-2 / 64 = 1.5625e-4 gives δ⁴ = 5.96e-16 > half an ulp of 1 (1.11e-16), so h is still
    // nonzero there (rounded to 3 ulps = 6.66e-16); δ_4 = 1e-2 / 256 gives δ⁴ = 2.3e-18, and
    // 1 + δ⁴ rounds to exactly 1: h = 0 from level 4 on, and those levels are skipped by the guard.
    // Four usable levels remain; D = δ³ has slope 3, so α ≈ -3 (the rounding at level 3 shifts
    // log D_3 by ~0.11 and the fitted slope by ~0.11 · 2.08 / 9.6 ≈ 0.024).
    const r = lipschitzProbe((d) => 1 + d ** 4 - 1, 1);
    expect(r.sides.above.levels).toBe(4);
    expect(r.sides.above.verdict).toBe("bounded_at_tested_scales");
    expect(r.sides.above.exponent).toBeCloseTo(-3, 1);
    expect(Math.abs(r.sides.above.exponent + 3)).toBeLessThan(0.05);
  });

  it("too few resolvable levels is untestable, not bounded", () => {
    // Only the smallest offset (6.1e-7) is below 1e-6: one level per side. The side is defined at
    // the smallest offset, so it is 'untestable' rather than 'undefined'.
    const r = lipschitzProbe((d) => (Math.abs(d) < 1e-6 ? d : NaN), 1);
    expect(r.sides.above).toEqual({ verdict: "untestable", exponent: NaN, levels: 1 });
    expect(r.sides.below.verdict).toBe("untestable");
    expect(r.verdict).toBe("untestable");
    expect(Number.isNaN(r.exponent)).toBe(true);
  });

  it("the combined verdict is the worse side and carries its exponent", () => {
    // sqrt above (α = 1/2), linear below (α = 0).
    const r = lipschitzProbe((d) => (d > 0 ? Math.sqrt(d) : d), 1);
    expect(r.sides.above.verdict).toBe("unbounded");
    expect(r.sides.below.verdict).toBe("bounded_at_tested_scales");
    expect(r.verdict).toBe("unbounded");
    expect(r.exponent).toBeCloseTo(0.5, 6);
    // an untestable side outranks a bounded one: no claim of boundedness when one side could not be tested
    const u = lipschitzProbe((d) => (d > 0 ? d : Math.abs(d) < 1e-6 ? d : NaN), 1);
    expect(u.sides.above.verdict).toBe("bounded_at_tested_scales");
    expect(u.sides.below.verdict).toBe("untestable");
    expect(u.verdict).toBe("untestable");
    // both sides undefined: untestable
    expect(lipschitzProbe(() => NaN, 1).verdict).toBe("untestable");
  });

  it("a field that vanishes at every level on a side is bounded there", () => {
    const r = lipschitzProbe((d) => (d > 0 ? 0 : d), 1);
    expect(r.sides.above).toEqual({ verdict: "bounded_at_tested_scales", exponent: 0, levels: 8 });
    expect(r.verdict).toBe("bounded_at_tested_scales");
  });

  it("calls the checkpoint", () => {
    let n = 0;
    lipschitzProbe((d) => d, 1, { checkpoint: () => n++ });
    expect(n).toBe(2);
  });
});

describe("equilibriaUniqueness: axis-direction probes at the equilibria of a system", () => {
  const box = { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };

  it("x' = sqrt(|x|), y' = -y at the origin: unbounded along x with α = 1/2", () => {
    // Along x: |F(d, 0) - F(0, 0)| = sqrt|d| on both sides (α = 1/2). Along y: |F(0, d)| = |d| (α = 0).
    const sys = compileSystem({ f: "sqrt(abs(x))", g: "-y" });
    const [r] = equilibriaUniqueness(sys, [{ x: 0, y: 0 }], box);
    expect(r.verdict).toBe("unbounded");
    expect(r.exponent).toBeCloseTo(0.5, 6);
    expect(r.along).toBe("x");
    expect(r.sides.below.verdict).toBe("unbounded");
    expect(r.scale).toBe(4); // the longer side of the box
  });

  it("x' = -x, y' = -y at the origin: bounded", () => {
    const [r] = equilibriaUniqueness(compileSystem({ f: "-x", g: "-y" }), [{ x: 0, y: 0 }], box);
    expect(r.verdict).toBe("bounded_at_tested_scales");
    expect(r.exponent).toBeCloseTo(0, 10);
  });

  it("subtracts the residual of a numerically located root: (1e-7, 0) of x' = -x, y' = -y still reads bounded", () => {
    // Without the subtraction, |F(p + d e_x)| = |1e-7 + d| would read as a 1/δ growth below 1e-7.
    const [r] = equilibriaUniqueness(compileSystem({ f: "-x", g: "-y" }), [{ x: 1e-7, y: 0 }], box);
    expect(r.verdict).toBe("bounded_at_tested_scales");
    expect(Math.abs(r.exponent)).toBeLessThan(1e-6);
  });
});
