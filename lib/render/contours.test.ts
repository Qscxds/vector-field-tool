import { describe, expect, it } from "vitest";
import { contourSegments } from "./contours";

const box = { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };

describe("contourSegments (marching squares)", () => {
  it("traces the unit circle for x² + y² = 1", () => {
    const segs = contourSegments((p) => p.x * p.x + p.y * p.y, box, 1, 40, 40);
    expect(segs.length).toBeGreaterThan(60);
    // Linear interpolation on a 0.1 grid: every endpoint lies within ~0.003 of the circle
    // (error ~ curvature × cell²/8 = 1 × 0.01 / 8).
    for (const [a, b] of segs) {
      expect(Math.abs(Math.hypot(a.x, a.y) - 1)).toBeLessThan(0.004);
      expect(Math.abs(Math.hypot(b.x, b.y) - 1)).toBeLessThan(0.004);
    }
    // total length close to the circumference 2π
    const length = segs.reduce((s, [a, b]) => s + Math.hypot(b.x - a.x, b.y - a.y), 0);
    expect(length).toBeCloseTo(2 * Math.PI, 1);
  });

  it("traces a straight line exactly for a linear field (y - x = 0)", () => {
    const segs = contourSegments((p) => p.y - p.x, box, 0, 8, 8);
    for (const [a, b] of segs) {
      expect(a.y - a.x).toBeCloseTo(0, 12);
      expect(b.y - b.x).toBeCloseTo(0, 12);
    }
    const length = segs.reduce((s, [a, b]) => s + Math.hypot(b.x - a.x, b.y - a.y), 0);
    expect(length).toBeCloseTo(4 * Math.SQRT2, 6); // the diagonal of the 4x4 box
  });

  it("returns nothing when the level is outside the field's range or the field is constant", () => {
    expect(contourSegments((p) => p.x * p.x + p.y * p.y, box, 100)).toEqual([]);
    expect(contourSegments(() => 3, box, 3)).toEqual([]);
    expect(contourSegments(() => 3, box, 1)).toEqual([]);
  });

  it("skips cells with undefined values instead of throwing", () => {
    const segs = contourSegments((p) => (p.x > 0 ? NaN : p.y), box, 0, 8, 8);
    expect(segs.length).toBeGreaterThan(0);
    for (const [a, b] of segs) {
      expect(a.x).toBeLessThanOrEqual(0.5);
      expect(b.x).toBeLessThanOrEqual(0.5);
    }
  });
});
