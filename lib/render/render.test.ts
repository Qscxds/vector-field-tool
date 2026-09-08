import { describe, expect, it } from "vitest";
import { sampleField, type FieldGrid } from "../core/field";
import { compileSystem } from "../core/parse";
import { arrowPolygon, scaleArrows } from "./arrows";
import { magnitudeColor, NEUTRAL_COLOR } from "./color";
import { chooseTicks, niceStep } from "./ticks";
import { fitViewport, pixelScale, screenToWorld, worldToScreen, type Viewport } from "./viewport";

const vp: Viewport = { box: { x: { min: -3, max: 3 }, y: { min: -2, max: 2 } }, width: 600, height: 400 };

describe("viewport", () => {
  it("maps the box corners to the canvas corners with y flipped", () => {
    expect(worldToScreen(vp, { x: -3, y: 2 })).toEqual({ x: 0, y: 0 });
    expect(worldToScreen(vp, { x: 3, y: -2 })).toEqual({ x: 600, y: 400 });
    expect(worldToScreen(vp, { x: 0, y: 0 })).toEqual({ x: 300, y: 200 });
  });

  it("round-trips world -> screen -> world", () => {
    for (const p of [{ x: 0.123, y: -1.5 }, { x: -2.99, y: 1.99 }, { x: 2, y: 0 }]) {
      const back = screenToWorld(vp, worldToScreen(vp, p));
      expect(back.x).toBeCloseTo(p.x, 12);
      expect(back.y).toBeCloseTo(p.y, 12);
    }
  });

  it("round-trips screen -> world -> screen", () => {
    const s = { x: 137, y: 289 };
    const back = worldToScreen(vp, screenToWorld(vp, s));
    expect(back.x).toBeCloseTo(s.x, 10);
    expect(back.y).toBeCloseTo(s.y, 10);
  });

  it("reports pixels per world unit", () => {
    expect(pixelScale(vp)).toEqual({ x: 100, y: 100 });
  });
});

describe("arrowPolygon", () => {
  it("returns a triangle whose tip is the arrow end, pointing along the arrow", () => {
    const poly = arrowPolygon({ x: 0, y: 0 }, { x: 10, y: 0 }, 4);
    expect(poly).toHaveLength(3);
    expect(poly[0]).toEqual({ x: 10, y: 0 });
    // wings sit 4 px behind the tip, 2 px to each side (which wing is "left" is a convention)
    expect(poly[1].x).toBeCloseTo(6, 12);
    expect(poly[2].x).toBeCloseTo(6, 12);
    expect([poly[1].y, poly[2].y].sort((a, b) => a - b).map((y) => Number(y.toFixed(12)))).toEqual([-2, 2]);
  });

  it("rotates with the arrow direction", () => {
    const poly = arrowPolygon({ x: 0, y: 0 }, { x: 0, y: -10 }, 4); // pointing up on screen
    expect(poly[0]).toEqual({ x: 0, y: -10 });
    expect(poly[1].y).toBeCloseTo(-6, 12);
    expect(poly[2].y).toBeCloseTo(-6, 12);
    expect(Math.abs(poly[1].x)).toBeCloseTo(2, 12);
    expect(poly[1].x).toBeCloseTo(-poly[2].x, 12);
  });

  it("is empty for a zero-length arrow or a non-positive head", () => {
    expect(arrowPolygon({ x: 1, y: 1 }, { x: 1, y: 1 }, 4)).toEqual([]);
    expect(arrowPolygon({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toEqual([]);
  });
});

describe("chooseTicks", () => {
  it("uses 1-2-5 steps only", () => {
    for (const s of [0.0007, 0.013, 0.37, 2.3, 41, 12345]) {
      const step = niceStep(s);
      const mantissa = step / 10 ** Math.floor(Math.log10(step) + 1e-12);
      expect([1, 2, 5]).toContainEqual(Number(mantissa.toFixed(9)));
    }
  });

  it("gives integer ticks for [-3, 3] with target 6", () => {
    expect(chooseTicks({ min: -3, max: 3 }, 6)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  it("never produces 0.333...-style values", () => {
    const ticks = chooseTicks({ min: 0, max: 1 }, 3);
    for (const t of ticks) expect(String(t).length).toBeLessThan(6);
    expect(ticks).toEqual([0, 0.5, 1]);
  });

  it("handles small and large magnitudes", () => {
    expect(chooseTicks({ min: 0, max: 0.37 }, 5)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(chooseTicks({ min: 0, max: 12345 }, 5)).toEqual([0, 2000, 4000, 6000, 8000, 10000, 12000]);
    expect(chooseTicks({ min: -0.004, max: 0.004 }, 4)).toEqual([-0.004, -0.002, 0, 0.002, 0.004]);
  });

  it("keeps the count within a factor of two of the target", () => {
    for (const [min, max] of [[-7.3, 11.1], [0.01, 0.09], [-1000, 1], [2.5, 2.7]]) {
      const n = chooseTicks({ min, max }, 6).length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(12);
    }
  });

  it("returns no ticks for a degenerate range", () => {
    expect(chooseTicks({ min: 1, max: 1 }, 5)).toEqual([]);
    expect(chooseTicks({ min: 2, max: 1 }, 5)).toEqual([]);
  });
});

describe("magnitudeColor", () => {
  it("runs from blue to red", () => {
    expect(magnitudeColor(0, 10)).toBe("hsl(240 80% 45%)");
    expect(magnitudeColor(10, 10)).toBe("hsl(0 80% 45%)");
    expect(magnitudeColor(5, 10)).toBe("hsl(120 80% 45%)");
  });

  it("clamps above maxMag and is neutral for singular or empty fields", () => {
    expect(magnitudeColor(20, 10)).toBe("hsl(0 80% 45%)");
    expect(magnitudeColor(NaN, 10)).toBe(NEUTRAL_COLOR);
    expect(magnitudeColor(1, 0)).toBe(NEUTRAL_COLOR);
    expect(magnitudeColor(1, NaN)).toBe(NEUTRAL_COLOR);
  });
});

describe("scaleArrows", () => {
  const grid = sampleField(compileSystem({ f: "y", g: "-x" }), vp.box, 7, 5);

  it("unit mode: every finite non-zero arrow has the same length, centred on its sample", () => {
    const arrows = scaleArrows(grid, vp, "unit");
    expect(arrows).toHaveLength(35);
    const lens = arrows.filter((a) => a.mag > 0).map((a) => Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y));
    const first = lens[0];
    for (const l of lens) expect(l).toBeCloseTo(first, 9);
    const centre = worldToScreen(vp, grid.samples[0].at);
    expect((arrows[0].from.x + arrows[0].to.x) / 2).toBeCloseTo(centre.x, 9);
    expect((arrows[0].from.y + arrows[0].to.y) / 2).toBeCloseTo(centre.y, 9);
  });

  it("points arrows in the right screen direction (world up = screen up)", () => {
    // At (1, 0) the field is (0, -1): straight down in world coordinates, so screen y increases.
    const single: FieldGrid = { samples: [{ at: { x: 1, y: 0 }, v: { x: 0, y: -1 }, mag: 1 }], maxMag: 1, singularCount: 0, nx: 1, ny: 1, box: vp.box };
    const [a] = scaleArrows(single, vp, "unit");
    expect(a.to.y).toBeGreaterThan(a.from.y);
    expect(a.to.x).toBeCloseTo(a.from.x, 9);
  });

  it("scaled mode: lengths are proportional to magnitude", () => {
    const arrows = scaleArrows(grid, vp, "scaled");
    const byMag = arrows.filter((a) => a.mag > 0).sort((p, q) => p.mag - q.mag);
    const len = (a: (typeof arrows)[number]) => Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y);
    expect(len(byMag[0]) / byMag[0].mag).toBeCloseTo(len(byMag[byMag.length - 1]) / byMag[byMag.length - 1].mag, 9);
  });

  it("flags singular samples and never emits NaN coordinates", () => {
    const g = sampleField(compileSystem({ f: "1/x", g: "0" }), { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } }, 3, 3);
    const arrows = scaleArrows(g, { box: g.box, width: 300, height: 300 });
    expect(arrows.filter((a) => a.singular)).toHaveLength(3);
    for (const a of arrows) {
      expect(Number.isFinite(a.from.x) && Number.isFinite(a.from.y) && Number.isFinite(a.to.x) && Number.isFinite(a.to.y)).toBe(true);
    }
  });

  it("under unequal pixel scales the arrow follows the screen image of the world direction", () => {
    // sx = 600/300 = 2 px/unit, sy = 300/300 = 1 px/unit. World step (1, 1) maps to the screen step
    // (2, -1), so the unit screen direction is (2, -1)/sqrt(5) - the tangent of the drawn curve.
    const aniso: Viewport = { box: { x: { min: 0, max: 300 }, y: { min: 0, max: 300 } }, width: 600, height: 300 };
    expect(pixelScale(aniso)).toEqual({ x: 2, y: 1 });
    const single: FieldGrid = { samples: [{ at: { x: 150, y: 150 }, v: { x: 1, y: 1 }, mag: Math.SQRT2 }], maxMag: Math.SQRT2, singularCount: 0, nx: 1, ny: 1, box: aniso.box };
    const [a] = scaleArrows(single, aniso, "unit");
    // maxLen = 0.85 * min(600, 300) = 255; centre = (300, 150)
    const dx = a.to.x - a.from.x, dy = a.to.y - a.from.y;
    expect(dx).toBeCloseTo(510 / Math.sqrt(5), 9);
    expect(dy).toBeCloseTo(-255 / Math.sqrt(5), 9);
    expect(Math.hypot(dx, dy)).toBeCloseTo(255, 9);
    expect((a.from.x + a.to.x) / 2).toBeCloseTo(300, 9);
    expect((a.from.y + a.to.y) / 2).toBeCloseTo(150, 9);
    // tangency: the screen images of (150, 150) and (151, 151) differ by (2, -1), parallel to the arrow
    const p = worldToScreen(aniso, { x: 150, y: 150 }), q = worldToScreen(aniso, { x: 151, y: 151 });
    expect(q.x - p.x).toBeCloseTo(2, 12);
    expect(q.y - p.y).toBeCloseTo(-1, 12);
    expect((q.x - p.x) * dy - (q.y - p.y) * dx).toBeCloseTo(0, 9);
  });

  it("uses the viewport's pixel scale, not the grid box's, when an equal-scale fit widened the box", () => {
    // Field sampled on the 6 x 4 box, drawn on a square canvas: fitViewport widens y to [-3, 3] and
    // both scales are 100 px/unit, so (1, 1) must be drawn at 45 degrees with |dx| = |dy| = 510/sqrt(2).
    const fitted = fitViewport(vp.box, 600, 600);
    expect(pixelScale(fitted)).toEqual({ x: 100, y: 100 });
    const single: FieldGrid = { samples: [{ at: { x: 0, y: 0 }, v: { x: 1, y: 1 }, mag: Math.SQRT2 }], maxMag: Math.SQRT2, singularCount: 0, nx: 1, ny: 1, box: vp.box };
    const [a] = scaleArrows(single, fitted, "unit");
    const dx = a.to.x - a.from.x, dy = a.to.y - a.from.y;
    expect(dx).toBeCloseTo(510 / Math.SQRT2, 9);
    expect(dy).toBeCloseTo(-510 / Math.SQRT2, 9);
    expect(Math.abs(dx)).toBeCloseTo(Math.abs(dy), 9);
  });

  it("equal scales: the old direction and length hold exactly", () => {
    // 600 x 400 over the 6 x 4 box (100 px/unit both ways); v = (3, 4): maxLen = 0.85 * 400 = 340,
    // unit direction (3, -4)/5 -> (204, -272).
    const single: FieldGrid = { samples: [{ at: { x: 0, y: 0 }, v: { x: 3, y: 4 }, mag: 5 }], maxMag: 5, singularCount: 0, nx: 1, ny: 1, box: vp.box };
    const [a] = scaleArrows(single, vp, "unit");
    expect(a.to.x - a.from.x).toBeCloseTo(204, 9);
    expect(a.to.y - a.from.y).toBeCloseTo(-272, 9);
  });

  it("handles a zero field (maxMag = 0) and an empty grid", () => {
    const zero = sampleField(compileSystem({ f: "0", g: "0" }), vp.box, 3, 3);
    const arrows = scaleArrows(zero, vp);
    for (const a of arrows) {
      expect(a.from).toEqual(a.to);
      expect(a.color).toBe(NEUTRAL_COLOR);
    }
    const empty: FieldGrid = { samples: [], maxMag: 0, singularCount: 0, nx: 0, ny: 0, box: vp.box };
    expect(scaleArrows(empty, vp)).toEqual([]);
  });
});
