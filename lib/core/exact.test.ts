import { describe, expect, it } from "vitest";
// review C6: the path check must be scale-free
import { exactPotential, potentialLevels, simpson } from "./exact";

const box = { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };

describe("simpson", () => {
  it("is exact for cubics", () => {
    // ∫₀² (s³ - 2s² + s - 1) ds = [s⁴/4 - 2s³/3 + s²/2 - s]₀² = 4 - 16/3 + 2 - 2 = -4/3
    expect(simpson((s) => s ** 3 - 2 * s * s + s - 1, 0, 2, 2)).toBeCloseTo(-4 / 3, 12);
  });

  it("handles reversed limits and zero length", () => {
    expect(simpson((s) => s, 1, 0, 4)).toBeCloseTo(-0.5, 12);
    expect(simpson((s) => s, 3, 3, 4)).toBe(0);
  });

  it("converges at fourth order on sin", () => {
    const err = (n: number) => Math.abs(simpson(Math.sin, 0, Math.PI, n) - 2);
    expect(err(8) / err(16)).toBeGreaterThan(12);
    expect(err(8) / err(16)).toBeLessThan(20);
  });
});

describe("exactPotential", () => {
  it("2xy dx + (x² + y²) dy = 0: F = x²y + y³/3 from base (0,0), path-independent", () => {
    const pot = exactPotential({ kind: "differential", M: "2*x*y", N: "x^2 + y^2" }, box, { base: { x: 0, y: 0 } });
    expect(pot.consistent).toBe(true);
    expect(pot.pathDeviation).toBeLessThan(1e-12); // polynomial integrands: Simpson is exact
    expect(pot.F({ x: 1, y: 1 })).toBeCloseTo(4 / 3, 12);
    expect(pot.F({ x: 2, y: 1 })).toBeCloseTo(13 / 3, 12);
    expect(pot.F({ x: -1, y: 2 })).toBeCloseTo(2 + 8 / 3, 12);
    expect(pot.F({ x: 0, y: 0 })).toBe(0);
  });

  it("flags a non-exact equation through path dependence: y dx - x dy = 0", () => {
    // Horizontal-then-vertical from (0,0) to (1,1): ∫₀¹ 0 ds + ∫₀¹ (-1) dt = -1.
    // Vertical-then-horizontal: ∫₀¹ 0 dt + ∫₀¹ 1 ds = +1. They disagree: not exact.
    const pot = exactPotential({ kind: "differential", M: "y", N: "-x" }, box, { base: { x: 0, y: 0 } });
    expect(pot.consistent).toBe(false);
    expect(pot.pathDeviation).toBeGreaterThan(0.1);
    expect(pot.F({ x: 1, y: 1 })).toBeCloseTo(-1, 12);
  });

  it("works for an exact equation with transcendental terms: (cos x · y) dx + (sin x + 2y) dy = 0", () => {
    // ∂M/∂y = cos x = ∂N/∂x. F = y sin x + y². From (0,0): F(π/2, 1) = 1 + 1 = 2.
    const pot = exactPotential({ kind: "differential", M: "cos(x)*y", N: "sin(x) + 2*y" }, box, { base: { x: 0, y: 0 }, panels: 128 });
    expect(pot.consistent).toBe(true);
    expect(pot.F({ x: Math.PI / 2, y: 1 })).toBeCloseTo(2, 8);
  });

  it("uses the box centre as the default base", () => {
    const pot = exactPotential({ kind: "differential", M: "x", N: "y" }, { x: { min: 0, max: 2 }, y: { min: 0, max: 4 } });
    expect(pot.base).toEqual({ x: 1, y: 2 });
    expect(pot.F(pot.base)).toBe(0);
    // F = (x² + y²)/2 - (1 + 4)/2: F(2, 4) = 10 - 2.5 = 7.5
    expect(pot.F({ x: 2, y: 4 })).toBeCloseTo(7.5, 10);
  });
});

describe("potentialLevels", () => {
  it("returns evenly spaced levels strictly inside the range", () => {
    const F = (p: { x: number; y: number }) => p.x; // range on the box: [-2, 2]
    const levels = potentialLevels(F, box, 3);
    expect(levels).toEqual([-1, 0, 1]);
  });

  it("returns nothing for a constant potential", () => {
    expect(potentialLevels(() => 1, box, 5)).toEqual([]);
  });
});

describe("path-independence check is scale-free (review C6)", () => {
  const box = { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };

  it("the closed-but-not-exact form dθ fails the check whether or not it is multiplied by 1e-8", () => {
    // (x dy - y dx)/(x² + y²) is closed but has no potential on a box containing the origin: the two
    // integration paths differ by multiples of 2π wherever they wind differently around the origin.
    const plain = exactPotential({ kind: "differential", M: "-y/(x^2 + y^2)", N: "x/(x^2 + y^2)" }, box);
    const tiny = exactPotential({ kind: "differential", M: "-1e-8*y/(x^2 + y^2)", N: "1e-8*x/(x^2 + y^2)" }, box);
    const huge = exactPotential({ kind: "differential", M: "1e8*(-y)/(x^2 + y^2)", N: "1e8*x/(x^2 + y^2)" }, box);
    expect(plain.consistent).toBe(false);
    expect(tiny.consistent).toBe(false);
    expect(huge.consistent).toBe(false);
    expect(tiny.pathDeviation).toBeCloseTo(plain.pathDeviation, 6);
    expect(huge.pathDeviation).toBeCloseTo(plain.pathDeviation, 6);
    expect(plain.pathDeviation).toBeGreaterThan(0.1);
  });

  it("a genuinely exact equation passes at any scale", () => {
    for (const k of ["1", "1e-9", "1e9"]) {
      const r = exactPotential({ kind: "differential", M: `${k}*2*x*y`, N: `${k}*(x^2 + y^2)` }, box);
      expect(r.consistent, k).toBe(true);
      expect(r.pathDeviation, k).toBeLessThan(1e-12);
    }
  });
});
