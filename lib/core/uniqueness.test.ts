import { describe, expect, it } from "vitest";
import { compileSystem } from "./parse";
import {
  BORDERLINE_EXPONENT,
  equilibriaUniqueness,
  LEVEL_OFF_EXPONENT,
  LIPSCHITZ_MAX_LEVELS,
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

const LOG16 = Math.log(16);

describe("lipschitzOffsets", () => {
  it("are scale · 1e-2 · 4^-k, k = 0..59 by default (down to 7.5e-39 · scale), or as many as asked", () => {
    const d = lipschitzOffsets(1);
    expect(d).toHaveLength(LIPSCHITZ_MAX_LEVELS);
    expect(d[0]).toBe(1e-2);
    expect(d[1]).toBeCloseTo(2.5e-3, 15);
    expect(d[7]).toBeCloseTo(1e-2 / 16384, 18); // 6.1035e-7
    expect(lipschitzOffsets(1, 8)).toHaveLength(8);
    expect(lipschitzOffsets(3)[0]).toBeCloseTo(3e-2, 15);
    expect(() => lipschitzProbe((x) => x, 0)).toThrow(RangeError);
  });
});

describe("lipschitzProbe: growth of the difference quotients at the finest scales", () => {
  it("sqrt(y) at 0: unbounded above with α = 1/2 through all 60 levels, undefined below", () => {
    // D_k = sqrt(δ_k) / δ_k = δ_k^-1/2 exactly (sqrt is correctly rounded): the quotients double at
    // every level, so the descent never levels off. The rounding floor compares |h| with the values
    // at the 3 coarser levels (8 times larger at most), never reached by an exact power law, and
    // 0 + δ never rounds, so the 60-level cap ends the descent.
    // sqrt of a negative offset is NaN at every level: the equation is not defined below y = 0.
    const r = lipschitzProbe(Math.sqrt, 1);
    expect(r.sides.above.verdict).toBe("unbounded");
    expect(r.sides.above.exponent).toBeCloseTo(0.5, 6);
    expect(r.sides.above.levels).toBe(LIPSCHITZ_MAX_LEVELS);
    expect(r.sides.above.finestOffset).toBeCloseTo(1e-2 * 4 ** -59, 48);
    expect(r.sides.below.verdict).toBe("undefined");
    expect(r.sides.below.levels).toBe(0);
    expect(Number.isNaN(r.sides.below.exponent)).toBe(true);
    expect(Number.isNaN(r.sides.below.finestOffset)).toBe(true);
    expect(r.verdict).toBe("unbounded");
    expect(r.exponent).toBeCloseTo(0.5, 6);
    expect(r.scale).toBe(1);
  });

  it("y^(1/3) at 0: α = 2/3 above, all 60 levels used; below is undefined because a negative base with a fractional exponent is NaN here", () => {
    // D = δ^(1/3) / δ = δ^-2/3, an exact power law: the 60-level cap ends the descent. The kernel's
    // pow is the JS ** operator (parse.ts), and (-0.01) ** (1/3) is NaN, not the real cube root -0.215.
    const r = lipschitzProbe((d) => d ** (1 / 3), 1);
    expect(r.sides.above.verdict).toBe("unbounded");
    expect(r.sides.above.exponent).toBeCloseTo(2 / 3, 6);
    expect(r.sides.above.levels).toBe(LIPSCHITZ_MAX_LEVELS);
    expect(r.sides.below.verdict).toBe("undefined");
    expect(r.verdict).toBe("unbounded");
    expect(r.exponent).toBeCloseTo(2 / 3, 6);
  });

  it("3 y^(2/3) at 0: α = 1/3", () => {
    // D = 3 δ^(2/3) / δ = 3 δ^-1/3: the constant factor shifts log D, not its slope.
    const r = lipschitzProbe((d) => 3 * d ** (2 / 3), 1);
    expect(r.verdict).toBe("unbounded");
    expect(r.exponent).toBeCloseTo(1 / 3, 6);
    expect(r.sides.above.levels).toBe(LIPSCHITZ_MAX_LEVELS);
  });

  it("y at 0: bounded, α = 0 on both sides; the quotients level off at once (3 levels)", () => {
    // D = 1 at every level: the change over levels 0..2 is exactly 0 < 0.05, so the descent stops
    // at the third level and the local exponent is log(1/1) = 0.
    const r = lipschitzProbe((d) => d, 1);
    expect(r.verdict).toBe("bounded_at_tested_scales");
    expect(r.exponent).toBeCloseTo(0, 10);
    expect(r.sides.above.verdict).toBe("bounded_at_tested_scales");
    expect(r.sides.below.verdict).toBe("bounded_at_tested_scales");
    expect(r.sides.above.levels).toBe(3);
    expect(r.sides.below.levels).toBe(3);
    expect(r.sides.above.finestOffset).toBeCloseTo(1e-2 / 16, 15);
  });

  it("1e6 · y is bounded at every scale (scale invariance: D = 1e6 at every level, exponent 0)", () => {
    for (const scale of [1e-3, 1, 1e3]) {
      const r = lipschitzProbe((d) => 1e6 * d, scale);
      expect(r.verdict).toBe("bounded_at_tested_scales");
      expect(r.exponent).toBeCloseTo(0, 10);
      expect(r.scale).toBe(scale);
    }
  });

  it("abs(y) at 0: bounded, D = 1 on both sides", () => {
    const r = lipschitzProbe(Math.abs, 1);
    expect(r.sides.above).toMatchObject({ verdict: "bounded_at_tested_scales", levels: 3 });
    expect(r.sides.below).toMatchObject({ verdict: "bounded_at_tested_scales", levels: 3 });
    expect(r.sides.above.exponent).toBeCloseTo(0, 10);
    expect(r.sides.below.exponent).toBeCloseTo(0, 10);
  });

  it("y (1 - y) at y = 1: bounded, the local exponent at the stop is -3.4e-3", () => {
    // h(d) = (1 + d)(1 - (1 + d)) = -d (1 + d), so D = 1 + d. Over levels 0..2 (δ = 1e-2, 6.25e-4)
    // the quotients change by |log(1.000625 / 1.01)| / log 16 = 9.33e-3 / 2.773 = 3.4e-3 < 0.05:
    // the descent stops there, and the reported exponent is that local value with its sign
    // (D grows with δ above the line: α = log(D_fine / D_coarse) / log(δ_coarse / δ_fine) < 0).
    const r = lipschitzProbe((d) => (1 + d) * (1 - (1 + d)), 1);
    expect(r.verdict).toBe("bounded_at_tested_scales");
    expect(r.sides.above.exponent).toBeCloseTo((Math.log(1.000625) - Math.log(1.01)) / LOG16, 6);
    expect(Math.abs(r.exponent)).toBeLessThan(0.01);
    expect(r.sides.below.verdict).toBe("bounded_at_tested_scales");
  });

  it("y² at 0: bounded, α = -1 (D = δ shrinks through all 60 levels)", () => {
    // D = δ changes by a full factor 16 per two levels, so the descent never levels off; δ² stays
    // representable down to the cap (δ_59² = 5.6e-77), and the tail fit of an exact power law
    // gives -1: bounded, since α is below 0.1.
    const r = lipschitzProbe((d) => d * d, 1);
    expect(r.verdict).toBe("bounded_at_tested_scales");
    expect(r.exponent).toBeCloseTo(-1, 6);
    expect(r.sides.below.exponent).toBeCloseTo(-1, 6);
    expect(r.sides.above.levels).toBe(LIPSCHITZ_MAX_LEVELS);
  });

  it("y·log|y| at 0 (derivative log|y| + 1, unbounded but only logarithmically) levels off and reads as bounded with α ≈ 0.047", () => {
    // D_k = |log δ_k| = 4.605 + 1.386 k grows without bound, but its relative change per level
    // shrinks like 1/D. The descent stops at the first k >= 2 with log(D_k / D_{k-2}) / log 16 < 0.05,
    // i.e. D_{k-2} > 2.773 / (16^0.05 - 1) = 18.64, first true for k - 2 = 11 (D = 19.85): k = 13,
    // 14 levels, and the local exponent there is log(D_13 / D_11) / log 16 ≈ 0.047, below the 0.05
    // level-off rule by construction. (Uniqueness does hold at y = 0 here, by the Osgood criterion.)
    const D = (k: number) => -Math.log(1e-2 * 4 ** -k);
    let stop = 2;
    while (Math.log(D(stop) / D(stop - 2)) / LOG16 >= LEVEL_OFF_EXPONENT) stop++;
    expect(stop).toBe(13);
    const alpha = Math.log(D(13) / D(11)) / LOG16;
    expect(alpha).toBeGreaterThan(0.04);
    expect(alpha).toBeLessThan(LEVEL_OFF_EXPONENT);
    const r = lipschitzProbe((d) => d * Math.log(Math.abs(d)), 1);
    expect(r.verdict).toBe("bounded_at_tested_scales");
    expect(r.sides.above.levels).toBe(14);
    expect(r.exponent).toBeCloseTo(alpha, 9);
    expect(r.sides.below.verdict).toBe("bounded_at_tested_scales");
    expect(r.sides.below.exponent).toBeCloseTo(alpha, 9);
  });

  it("stops at the rounding floor: (1 + y⁴) - 1", () => {
    // δ_3 = 1e-2 / 64 = 1.5625e-4 gives δ⁴ = 5.96e-16 > half an ulp of 1 (1.11e-16), so h is still
    // nonzero there (rounded to 3 ulps = 6.66e-16); δ_4 = 1e-2 / 256 gives δ⁴ = 2.3e-18, and
    // 1 + δ⁴ rounds to exactly 1: h = 0 from level 4 on, which is below the floor and ends the
    // descent. D = δ³ never levels off (it changes by a factor 4096 per two levels). Four usable
    // levels remain with slope 3, so α ≈ -3 (the rounding at level 3 shifts log D_3 by ~0.11 and
    // the fitted slope by ~0.11 · 2.08 / 9.6 ≈ 0.024).
    const r = lipschitzProbe((d) => 1 + d ** 4 - 1, 1);
    expect(r.sides.above.levels).toBe(4);
    expect(r.sides.above.verdict).toBe("bounded_at_tested_scales");
    expect(r.sides.above.exponent).toBeCloseTo(-3, 1);
    expect(Math.abs(r.sides.above.exponent + 3)).toBeLessThan(0.05);
    expect(r.sides.above.finestOffset).toBeCloseTo(1e-2 / 64, 12);
  });

  it("a side defined only close to the point is tested there; a single usable level is untestable, not bounded", () => {
    // Finite only below 1e-6: the descent skips levels 0..6 (δ_6 = 2.4e-6) and finds D = 1 from
    // δ_7 = 6.1e-7 on, leveling off after three usable levels: bounded with 3 levels.
    const near = lipschitzProbe((d) => (Math.abs(d) < 1e-6 ? d : NaN), 1);
    expect(near.sides.above).toMatchObject({ verdict: "bounded_at_tested_scales", levels: 3 });
    expect(near.sides.above.finestOffset).toBeCloseTo(1e-2 * 4 ** -9, 15);
    expect(near.verdict).toBe("bounded_at_tested_scales");
    // Finite at exactly one offset (δ_7 = 6.1e-7 lies in (3e-7, 1e-6); δ_6 = 2.4e-6 and δ_8 = 1.5e-7 do not):
    // one usable level is too few to call anything.
    const one = lipschitzProbe((d) => (Math.abs(d) > 3e-7 && Math.abs(d) < 1e-6 ? d : NaN), 1);
    expect(one.sides.above).toEqual({ verdict: "untestable", exponent: NaN, levels: 1, finestOffset: 1e-2 * 4 ** -7 });
    expect(one.sides.below.verdict).toBe("untestable");
    expect(one.verdict).toBe("untestable");
    expect(Number.isNaN(one.exponent)).toBe(true);
  });

  it("the combined verdict is the worse side and carries its exponent", () => {
    // sqrt above (α = 1/2), linear below (α = 0).
    const r = lipschitzProbe((d) => (d > 0 ? Math.sqrt(d) : d), 1);
    expect(r.sides.above.verdict).toBe("unbounded");
    expect(r.sides.below.verdict).toBe("bounded_at_tested_scales");
    expect(r.verdict).toBe("unbounded");
    expect(r.exponent).toBeCloseTo(0.5, 6);
    // an untestable side outranks a bounded one: no claim of boundedness when one side could not be tested
    const u = lipschitzProbe((d) => (d > 0 ? d : Math.abs(d) > 3e-7 && Math.abs(d) < 1e-6 ? d : NaN), 1);
    expect(u.sides.above.verdict).toBe("bounded_at_tested_scales");
    expect(u.sides.below.verdict).toBe("untestable");
    expect(u.verdict).toBe("untestable");
    // both sides undefined: untestable
    expect(lipschitzProbe(() => NaN, 1).verdict).toBe("untestable");
  });

  it("a field that vanishes at every level on a side is bounded there", () => {
    const r = lipschitzProbe((d) => (d > 0 ? 0 : d), 1);
    expect(r.sides.above).toMatchObject({ verdict: "bounded_at_tested_scales", exponent: 0, levels: LIPSCHITZ_MAX_LEVELS });
    expect(r.verdict).toBe("bounded_at_tested_scales");
  });

  it("calls the checkpoint", () => {
    let n = 0;
    lipschitzProbe((d) => d, 1, { checkpoint: () => n++ });
    expect(n).toBe(2);
  });
});

describe("the verdict does not depend on the box (review J: smooth right-hand sides on large boxes)", () => {
  it("tanh(y), sin(y), y/(1 + y²), y·exp(-y²) at 0 are bounded at every scale, with |α| below 0.05", () => {
    // On a box of half-width 1000 the first offsets (20, 5, 1.25) lie where tanh has saturated, so
    // the coarse quotients grow like 1/δ; the descent continues past them and stops where the
    // quotients level off (D = 1 - δ²/3 for tanh: at δ < ~0.045), whatever the box. A side that
    // leveled off reports the local exponent there, below LEVEL_OFF_EXPONENT by construction.
    const cases: [string, (d: number) => number][] = [
      ["tanh", Math.tanh],
      ["sin", Math.sin],
      ["y/(1+y²)", (d) => d / (1 + d * d)],
      ["y·exp(-y²)", (d) => d * Math.exp(-d * d)],
    ];
    for (const [name, h] of cases) {
      for (const scale of [2, 20, 200, 2000, 2e5]) {
        const r = lipschitzProbe(h, scale);
        expect(r.verdict, `${name} at scale ${scale}`).toBe("bounded_at_tested_scales");
        expect(Math.abs(r.sides.above.exponent), `${name} at scale ${scale}`).toBeLessThan(LEVEL_OFF_EXPONENT);
        expect(Math.abs(r.sides.below.exponent), `${name} at scale ${scale}`).toBeLessThan(LEVEL_OFF_EXPONENT);
      }
    }
  });

  it("a steep but Lipschitz slope, tanh(1e6 y) or y/(1 + 1e6 y²), levels off near δ ~ 1e-8..5e-8 whatever the box", () => {
    // tanh(1e6 y) has D = tanh(1e6 δ) / δ: 1/δ while 1e6 δ >> 1, then 1e6 (1 - (1e6 δ)² / 3). The
    // level-off test 16 tanh(u) / tanh(16 u) < 16^0.05 first holds for u = 1e6 δ below ~0.045 (at
    // u = 0.04 the ratio is 1.132, at 0.05 it is 1.204), so the finest offset used lies in
    // (0.045 / 4, 0.045) · 1e-6 for every scale: the stop is set by the slope, not by the box.
    for (const scale of [2e-5, 2, 200, 2e4]) {
      const r = lipschitzProbe((d) => Math.tanh(1e6 * d), scale);
      expect(r.verdict, `scale ${scale}`).toBe("bounded_at_tested_scales");
      expect(r.sides.above.finestOffset, `scale ${scale}`).toBeGreaterThan(1.1e-8);
      expect(r.sides.above.finestOffset, `scale ${scale}`).toBeLessThan(4.5e-8);
    }
    for (const scale of [2, 20, 200, 2000]) expect(lipschitzProbe((d) => Math.tanh(100 * d), scale).verdict).toBe("bounded_at_tested_scales");
    for (const scale of [1, 1e3]) expect(lipschitzProbe((d) => d / (1 + 1e6 * d * d), scale).verdict).toBe("bounded_at_tested_scales");
  });

  it("sqrt(y) is unbounded with α = 1/2 and the same 60 levels at scales 1e-6, 1 and 1e6", () => {
    // The floor rule compares |h(δ_k)| with the values at the neighbouring levels, which scale together.
    for (const scale of [1e-6, 1, 1e6]) {
      const r = lipschitzProbe(Math.sqrt, scale);
      expect(r.verdict, `scale ${scale}`).toBe("unbounded");
      expect(r.exponent, `scale ${scale}`).toBeCloseTo(0.5, 6);
      expect(r.sides.above.levels, `scale ${scale}`).toBe(LIPSCHITZ_MAX_LEVELS);
    }
  });

  it("a steep exponential, 1 - exp(-100 y) at 0: bounded at scales 2 and 20; at scale 200 the side below is untestable, never a false claim", () => {
    // Above the line D = (1 - e^{-100 δ}) / δ levels off at 100 whatever the scale. Below it
    // h = 1 - e^{100 δ}: with scale 20 the ladder starts at δ = 0.2 (e^20 = 4.8e8) and drops by
    // less than 1e15 over any four levels, so the descent continues to where D levels off at 100.
    // With scale 200 it starts at e^200 = 7e86 and the next level, e^50 = 5e21, is already
    // below 10 eps of it: a black-box probe cannot tell such a value from rounding residue of the
    // first, so that side stops with one usable level, "untestable": no claim, rather than the
    // false "unbounded" of a fixed ladder. Bounded on the other side; the worse side decides.
    for (const scale of [2, 20]) {
      const r = lipschitzProbe((d) => 1 - Math.exp(-100 * d), scale);
      expect(r.verdict, `scale ${scale}`).toBe("bounded_at_tested_scales");
      expect(Math.abs(r.exponent), `scale ${scale}`).toBeLessThan(LEVEL_OFF_EXPONENT);
    }
    const wide = lipschitzProbe((d) => 1 - Math.exp(-100 * d), 200);
    expect(wide.sides.above.verdict).toBe("bounded_at_tested_scales");
    expect(wide.sides.below).toMatchObject({ verdict: "untestable", levels: 1 });
    expect(wide.verdict).toBe("untestable");
  });

  it("a singular term under a dominant linear one is still caught when the quotients keep changing: y - 0.03 sqrt(y)", () => {
    // D_k = |1 - 0.03 δ_k^-1/2| = |1 - 0.3 · 2^k| above y = 0: 0.7, 0.4, 0.2, 1.4, 3.8, 8.6, ... The
    // quotients first shrink, cross zero between levels 1 and 2, then double at every level, so no
    // pair of levels is within 5% of each other and the descent runs to the cap, where the tail
    // is the pure δ^-1/2 law of the singular term (the -1 is a 1e-17 correction there): α = 1/2.
    const r = lipschitzProbe((d) => d - 0.03 * Math.sqrt(d), 1);
    expect(r.sides.above.verdict).toBe("unbounded");
    expect(r.sides.above.exponent).toBeCloseTo(0.5, 5);
    expect(r.sides.below.verdict).toBe("undefined");
    expect(r.verdict).toBe("unbounded");
  });

  it("thresholds: unbounded needs α >= 0.25 at the floor, borderline α >= 0.1; |y|^0.8 (α = 0.2) is borderline", () => {
    expect(UNBOUNDED_EXPONENT).toBe(0.25);
    expect(BORDERLINE_EXPONENT).toBe(0.1);
    // D = δ^-0.2 grows by 4^0.2 = 1.32 per level (a 0.2 change per level, far above the 0.05
    // level-off rule), so the descent reaches the floor with a clean tail fit of 0.2.
    const r = lipschitzProbe((d) => Math.abs(d) ** 0.8, 1);
    expect(r.verdict).toBe("borderline");
    expect(r.exponent).toBeCloseTo(0.2, 6);
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

  it("the descent ends where the coordinate can no longer carry the offset: x' = sqrt|x - 1|, y' = -y at (1, 0)", () => {
    // Offsets below 1e6 · eps · 1 = 2.2e-10 are not carried by x = 1 to 1e-6. From δ_0 = 4e-2 the
    // first offset below that is 4e-2 · 4^-14 = 1.5e-10 (4e-2 · 4^-13 = 6.0e-10 is still above), so
    // levels 0..13 are used and the finest offset is 6.0e-10. The tail is the δ^-1/2 law of sqrt,
    // measured on fl(1 + δ) - 1 = δ (1 ± 4e-7): α = 0.5 to about 1e-7.
    const sys = compileSystem({ f: "sqrt(abs(x - 1))", g: "-y" });
    const [r] = equilibriaUniqueness(sys, [{ x: 1, y: 0 }], box);
    expect(r.verdict).toBe("unbounded");
    expect(r.along).toBe("x");
    expect(r.exponent).toBeCloseTo(0.5, 6);
    expect(r.sides.above.levels).toBe(14);
    expect(r.sides.above.finestOffset).toBeCloseTo(4e-2 * 4 ** -13, 17);
  });

  it("x' = tanh(x), y' = -y and x' = sin(x), y' = sin(y) at the origin are bounded on every box", () => {
    const tanh = compileSystem({ f: "tanh(x)", g: "-y" });
    const sin = compileSystem({ f: "sin(x)", g: "sin(y)" });
    for (const half of [2, 1000, 1e5]) {
      const b = { x: { min: -half, max: half }, y: { min: -half, max: half } };
      const [t] = equilibriaUniqueness(tanh, [{ x: 0, y: 0 }], b);
      expect(t.verdict, `tanh, box ±${half}`).toBe("bounded_at_tested_scales");
      expect(Math.abs(t.exponent), `tanh, box ±${half}`).toBeLessThan(LEVEL_OFF_EXPONENT);
      const [s] = equilibriaUniqueness(sin, [{ x: 0, y: 0 }], b);
      expect(s.verdict, `sin, box ±${half}`).toBe("bounded_at_tested_scales");
    }
  });
});
