import { describe, expect, it } from "vitest";
import { axisNameAnchors } from "./axis-names";
import type { Viewport } from "./viewport";

// A 600x600 canvas over a 6x6 box is 100 px per world unit; every screen coordinate below is derived by hand.
const opts = { tickColumnWidth: 20, tickRowHeight: 11, margin: 4, edge: 6, nameHeight: 14 };
const vp = (x: [number, number], y: [number, number]): Viewport => ({
  box: { x: { min: x[0], max: x[1] }, y: { min: y[0], max: y[1] } },
  width: 600,
  height: 600,
});

describe("axisNameAnchors", () => {
  it("both axes on screen: the names hug the axis lines (right end above y = 0, top right of x = 0)", () => {
    const { horizontal, vertical } = axisNameAnchors(vp([-3, 3], [-3, 3]), opts);
    // y = 0 is at screen y = 300, x = 0 at screen x = 300
    expect(horizontal).toEqual({ x: 594, y: 296, align: "right", baseline: "bottom" });
    expect(vertical).toEqual({ x: 304, y: 4, align: "left", baseline: "top" });
  });

  it("both axes off screen: bottom-right corner above the tick row, top-left corner right of the tick column", () => {
    const { horizontal, vertical } = axisNameAnchors(vp([1, 3], [1, 3]), opts);
    expect(horizontal).toEqual({ x: 594, y: 600 - 3 - 11 - 2, align: "right", baseline: "bottom" });
    expect(vertical).toEqual({ x: 4 + 20 + 4, y: 4, align: "left", baseline: "top" });
  });

  it("y = 0 near the bottom edge: the name stays above the tick numbers", () => {
    // y = 0 at screen y = 5.9 / 6 * 600 = 590; above the axis would be 586, but the tick strip starts at 584
    const { horizontal } = axisNameAnchors(vp([-3, 3], [-0.1, 5.9]), opts);
    expect(horizontal).toEqual({ x: 594, y: 584, align: "right", baseline: "bottom" });
  });

  it("y = 0 near the top edge: no room above, so the name goes just below the axis", () => {
    // y = 0 at screen y = 0.1 / 6 * 600 = 10; 10 - 4 = 6 < 14
    const { horizontal } = axisNameAnchors(vp([-3, 3], [-5.9, 0.1]), opts);
    expect(horizontal.baseline).toBe("top");
    expect(horizontal.y).toBeCloseTo(14, 9);
  });

  it("x = 0 near the left edge: the name is pushed right of the tick column", () => {
    // x = 0 at screen x = 10; 14 would overlap the 4..24 tick column, so 24 + 4
    const { vertical } = axisNameAnchors(vp([-0.1, 5.9], [-3, 3]), opts);
    expect(vertical).toEqual({ x: 28, y: 4, align: "left", baseline: "top" });
  });

  it("x = 0 near the right edge: the name flips to the left of the axis", () => {
    // x = 0 at screen x = 590; 594 > 600 - 14
    const { vertical } = axisNameAnchors(vp([-5.9, 0.1], [-3, 3]), opts);
    expect(vertical.align).toBe("right");
    expect(vertical.x).toBeCloseTo(586, 9);
  });
});
