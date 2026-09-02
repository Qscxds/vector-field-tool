import { describe, expect, it } from "vitest";
import { sampleField, type FieldGrid } from "../core/field";
import { compileSystem } from "../core/parse";
import { arrowPolygon, scaleArrows } from "./arrows";
import { magnitudeColor, NEUTRAL_COLOR } from "./color";
import { chooseTicks, niceStep } from "./ticks";
import { pixelScale, screenToWorld, worldToScreen, type Viewport } from "./viewport";

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
