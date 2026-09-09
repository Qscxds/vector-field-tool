import { describe, expect, it } from "vitest";
import { fitViewport, panBy, pinchAt, pixelScale, resetViewport, screenToWorld, worldToScreen, zoomAt, type Viewport } from "./viewport";

const box = { x: { min: -3, max: 3 }, y: { min: -2, max: 2 } };

describe("fitViewport (equal scale)", () => {
  const cases: Array<[typeof box, number, number]> = [
    [box, 600, 400],
    [box, 600, 600],
    [box, 300, 900],
    [{ x: { min: 0, max: 1 }, y: { min: 0, max: 10 } }, 640, 480],
    [{ x: { min: -0.5, max: 4 }, y: { min: -0.5, max: 4 } }, 720, 520],
  ];

  it("gives identical x and y pixel scales", () => {
    for (const [b, w, h] of cases) {
      const v = fitViewport(b, w, h);
      const s = pixelScale(v);
      expect(s.x).toBeCloseTo(s.y, 10);
    }
  });

  it("contains the requested box and expands symmetrically about its centre", () => {
    for (const [b, w, h] of cases) {
      const v = fitViewport(b, w, h);
      expect(v.box.x.min).toBeLessThanOrEqual(b.x.min + 1e-12);
      expect(v.box.x.max).toBeGreaterThanOrEqual(b.x.max - 1e-12);
      expect(v.box.y.min).toBeLessThanOrEqual(b.y.min + 1e-12);
      expect(v.box.y.max).toBeGreaterThanOrEqual(b.y.max - 1e-12);
      const cx = (b.x.min + b.x.max) / 2, cy = (b.y.min + b.y.max) / 2;
      expect((v.box.x.min + v.box.x.max) / 2).toBeCloseTo(cx, 10);
      expect((v.box.y.min + v.box.y.max) / 2).toBeCloseTo(cy, 10);
    }
  });

  it("expands only the direction that needs it", () => {
    // 6 x 4 box on a 600 x 400 canvas already has equal scale (100 px/unit): nothing changes.
    expect(fitViewport(box, 600, 400).box).toEqual(box);
    // on a square canvas the y range must grow from 4 to 6
    const v = fitViewport(box, 600, 600);
    expect(v.box.x).toEqual(box.x);
    expect(v.box.y).toEqual({ min: -3, max: 3 });
  });

  it("a slope of 1 is drawn at 45 degrees", () => {
    const v = fitViewport({ x: { min: 0, max: 1 }, y: { min: 0, max: 5 } }, 500, 300);
    const a = worldToScreen(v, { x: 0.2, y: 1 });
    const b = worldToScreen(v, { x: 0.7, y: 1.5 });
    expect(Math.abs(b.x - a.x)).toBeCloseTo(Math.abs(b.y - a.y), 10);
  });

  it("rejects degenerate input", () => {
    expect(() => fitViewport({ x: { min: 1, max: 1 }, y: box.y }, 10, 10)).toThrow(RangeError);
    expect(() => fitViewport(box, 0, 10)).toThrow(RangeError);
  });
});

describe("zoomAt", () => {
  const v: Viewport = fitViewport(box, 600, 400);

  it("keeps the world point under the cursor fixed", () => {
    for (const sp of [{ x: 0, y: 0 }, { x: 300, y: 200 }, { x: 587, y: 13 }, { x: 120.5, y: 333.3 }]) {
      for (const f of [2, 0.5, 1.1, 10]) {
        const before = screenToWorld(v, sp);
        const z = zoomAt(v, sp, f);
        const after = screenToWorld(z, sp);
        expect(after.x).toBeCloseTo(before.x, 10);
        expect(after.y).toBeCloseTo(before.y, 10);
      }
    }
  });

  it("changes the pixel scale by exactly the factor and keeps both scales equal", () => {
    const z = zoomAt(v, { x: 100, y: 100 }, 2);
    expect(pixelScale(z).x).toBeCloseTo(pixelScale(v).x * 2, 10);
    expect(pixelScale(z).y).toBeCloseTo(pixelScale(z).x, 10);
  });

  it("zooming in then out by the same factor about the same point restores the viewport", () => {
    const z = zoomAt(zoomAt(v, { x: 77, y: 311 }, 3), { x: 77, y: 311 }, 1 / 3);
    expect(z.box.x.min).toBeCloseTo(v.box.x.min, 10);
    expect(z.box.x.max).toBeCloseTo(v.box.x.max, 10);
    expect(z.box.y.min).toBeCloseTo(v.box.y.min, 10);
    expect(z.box.y.max).toBeCloseTo(v.box.y.max, 10);
  });

  it("clamps to 1/50 .. 50 of the original box size while keeping the anchor fixed", () => {
    const limits = { original: box };
    let z = v;
    for (let i = 0; i < 20; i++) z = zoomAt(z, { x: 300, y: 200 }, 2, limits); // 2^20 would be far too much
    expect(z.box.x.max - z.box.x.min).toBeCloseTo(6 / 50, 10);
    let out = v;
    for (let i = 0; i < 20; i++) out = zoomAt(out, { x: 10, y: 10 }, 0.5, limits);
    expect(out.box.x.max - out.box.x.min).toBeCloseTo(6 * 50, 8);
    const before = screenToWorld(v, { x: 10, y: 10 });
    const after = screenToWorld(out, { x: 10, y: 10 });
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("ignores a non-positive factor", () => {
    expect(zoomAt(v, { x: 1, y: 1 }, 0)).toBe(v);
    expect(zoomAt(v, { x: 1, y: 1 }, NaN)).toBe(v);
  });
});

describe("panBy", () => {
  const v: Viewport = fitViewport(box, 600, 400);

  it("moves the content with the drag: the point under the cursor follows the cursor", () => {
    const start = { x: 200, y: 150 };
    const world = screenToWorld(v, start);
    const p = panBy(v, 40, -25);
    const moved = worldToScreen(p, world);
    expect(moved.x).toBeCloseTo(start.x + 40, 10);
    expect(moved.y).toBeCloseTo(start.y - 25, 10);
  });

  it("keeps the size and scale", () => {
    const p = panBy(v, 123, 45);
    expect(p.box.x.max - p.box.x.min).toBeCloseTo(box.x.max - box.x.min, 12);
    expect(pixelScale(p)).toEqual(pixelScale(v));
  });

  it("is undone by the opposite pan", () => {
    const back = panBy(panBy(v, 30, 70), -30, -70);
    expect(back.box).toEqual(v.box);
  });
});

describe("fitViewport (equalScale: false)", () => {
  it("returns exactly the entered box (a copy) and lets the two pixel scales differ", () => {
    // 6 x 4 box on a square canvas: no widening; 600/6 = 100 px/unit in x, 600/4 = 150 px/unit in y.
    const v = fitViewport(box, 600, 600, { equalScale: false });
    expect(v.box).toEqual(box);
    expect(v.box).not.toBe(box);
    expect(v.box.x).not.toBe(box.x);
    expect(v.width).toBe(600);
    expect(v.height).toBe(600);
    expect(pixelScale(v)).toEqual({ x: 100, y: 150 });
    // the shells' 720 x 520 canvas: 720/6 = 120, 520/4 = 130
    const shell = fitViewport(box, 720, 520, { equalScale: false });
    expect(shell.box).toEqual(box);
    expect(pixelScale(shell)).toEqual({ x: 120, y: 130 });
  });

  it("the default and { equalScale: true } are today's equal-scale fit; a box that already fits is unchanged in both modes", () => {
    expect(fitViewport(box, 600, 600, { equalScale: true })).toEqual(fitViewport(box, 600, 600));
    expect(fitViewport(box, 600, 600, {})).toEqual(fitViewport(box, 600, 600));
    expect(fitViewport(box, 600, 600).box.y).toEqual({ min: -3, max: 3 }); // still widened
    // 6 x 4 on 600 x 400 is already equal-scale, so both modes return the box itself
    expect(fitViewport(box, 600, 400, { equalScale: false })).toEqual(fitViewport(box, 600, 400));
  });

  it("still rejects degenerate input", () => {
    expect(() => fitViewport({ x: { min: 1, max: 1 }, y: box.y }, 10, 10, { equalScale: false })).toThrow(RangeError);
    expect(() => fitViewport(box, 0, 10, { equalScale: false })).toThrow(RangeError);
  });

  describe("zoomAt under unequal scales", () => {
    const v: Viewport = fitViewport(box, 600, 600, { equalScale: false }); // 100 x 150 px/unit

    it("keeps the world point under the cursor fixed", () => {
      for (const sp of [{ x: 0, y: 0 }, { x: 300, y: 300 }, { x: 587, y: 13 }, { x: 120.5, y: 333.3 }]) {
        for (const f of [2, 0.5, 1.1, 10]) {
          const before = screenToWorld(v, sp);
          const after = screenToWorld(zoomAt(v, sp, f), sp);
          expect(after.x).toBeCloseTo(before.x, 10);
          expect(after.y).toBeCloseTo(before.y, 10);
        }
      }
    });

    it("scales both axes by the factor, preserving the ratio of the pixel scales", () => {
      // anchor = screenToWorld(v, (100, 100)) = (-3 + 100/100, 2 - 100/150) = (-2, 4/3)
      // new size 3 x 2 -> 200 x 300 px/unit; xMin = -2 - 100/200 = -2.5; yMax = 4/3 + 100/300 = 5/3
      const z = zoomAt(v, { x: 100, y: 100 }, 2);
      expect(pixelScale(z).x).toBeCloseTo(200, 10);
      expect(pixelScale(z).y).toBeCloseTo(300, 10);
      expect(pixelScale(z).y / pixelScale(z).x).toBeCloseTo(1.5, 10);
      expect(z.box.x.min).toBeCloseTo(-2.5, 10);
      expect(z.box.x.max).toBeCloseTo(0.5, 10);
      expect(z.box.y.min).toBeCloseTo(-1 / 3, 10);
      expect(z.box.y.max).toBeCloseTo(5 / 3, 10);
      expect(worldToScreen(z, { x: -2, y: 4 / 3 }).x).toBeCloseTo(100, 10);
      expect(worldToScreen(z, { x: -2, y: 4 / 3 }).y).toBeCloseTo(100, 10);
    });

    it("zooming in then out restores the viewport", () => {
      const z = zoomAt(zoomAt(v, { x: 77, y: 311 }, 3), { x: 77, y: 311 }, 1 / 3);
      expect(z.box.x.min).toBeCloseTo(v.box.x.min, 10);
      expect(z.box.x.max).toBeCloseTo(v.box.x.max, 10);
      expect(z.box.y.min).toBeCloseTo(v.box.y.min, 10);
      expect(z.box.y.max).toBeCloseTo(v.box.y.max, 10);
    });

    it("the zoom clamp keeps the ratio: 20 doublings end at 6/50 x 4/50", () => {
      // h/w = 2/3 throughout, so the two clamp factors coincide and the single factor is exact.
      let z = v;
      for (let i = 0; i < 20; i++) z = zoomAt(z, { x: 300, y: 300 }, 2, { original: box });
      expect(z.box.x.max - z.box.x.min).toBeCloseTo(0.12, 10);
      expect(z.box.y.max - z.box.y.min).toBeCloseTo(0.08, 10);
      expect(pixelScale(z).x).toBeCloseTo(5000, 6);
      expect(pixelScale(z).y).toBeCloseTo(7500, 6);
    });
  });

  it("panBy under unequal scales moves by dx/sx horizontally and dy/sy vertically", () => {
    const v = fitViewport(box, 600, 600, { equalScale: false }); // 100 x 150 px/unit
    // dx = -40/100 = -0.4; dy = -25/150 = -1/6
    const p = panBy(v, 40, -25);
    expect(p.box.x.min).toBeCloseTo(-3.4, 12);
    expect(p.box.x.max).toBeCloseTo(2.6, 12);
    expect(p.box.y.min).toBeCloseTo(-13 / 6, 12);
    expect(p.box.y.max).toBeCloseTo(11 / 6, 12);
    expect(pixelScale(p)).toEqual(pixelScale(v));
    // the world point under (200, 150) is (-1, 1); after the pan it sits at (200 + 40, 150 - 25)
    const world = screenToWorld(v, { x: 200, y: 150 });
    expect(world.x).toBeCloseTo(-1, 12);
    expect(world.y).toBeCloseTo(1, 12);
    const moved = worldToScreen(p, world);
    expect(moved.x).toBeCloseTo(240, 10);
    expect(moved.y).toBeCloseTo(125, 10);
  });
});

describe("resetViewport", () => {
  it("is fitViewport of the original box", () => {
    expect(resetViewport(box, 600, 600)).toEqual(fitViewport(box, 600, 600));
  });

  it("passes the equal-scale option through", () => {
    expect(resetViewport(box, 600, 600, { equalScale: false })).toEqual(fitViewport(box, 600, 600, { equalScale: false }));
    expect(resetViewport(box, 600, 600, { equalScale: false }).box).toEqual(box);
  });
});

describe("pinchAt", () => {
  // Box [0, 10] x [0, 10] on a 100 x 100 canvas: 10 px per unit, screen (50, 50) is world (5, 5).
  const v: Viewport = { box: { x: { min: 0, max: 10 }, y: { min: 0, max: 10 } }, width: 100, height: 100 };

  it("a pinch whose midpoint moves by (10, 0) px at factor 2 keeps the world point under the midpoint and shifts the view by 10 px", () => {
    const r = pinchAt(v, { x: 50, y: 50 }, { x: 60, y: 50 }, 2);
    // Scale doubles: 20 px per unit, the box is 5 units wide. World (5, 5) sits at screen (60, 50):
    // xMin = 5 - 60/20 = 2, xMax = 7; yMax = 5 + 50/20 = 7.5, yMin = 2.5.
    expect(r.box.x.min).toBeCloseTo(2, 12);
    expect(r.box.x.max).toBeCloseTo(7, 12);
    expect(r.box.y.min).toBeCloseTo(2.5, 12);
    expect(r.box.y.max).toBeCloseTo(7.5, 12);
    const under = screenToWorld(r, { x: 60, y: 50 });
    expect(under.x).toBeCloseTo(5, 12);
    expect(under.y).toBeCloseTo(5, 12);
    // The same gesture applied as two updates from the SAME stale viewport loses the pan.
    const stale = zoomAt(v, { x: 50, y: 50 }, 2);
    expect(screenToWorld(stale, { x: 60, y: 50 }).x).toBeCloseTo(5.5, 12);
  });

  it("equals zoomAt then panBy in that order, and a midpoint that does not move is a plain zoom", () => {
    const r = pinchAt(v, { x: 30, y: 70 }, { x: 30, y: 70 }, 0.5);
    const z = zoomAt(v, { x: 30, y: 70 }, 0.5);
    expect(r).toEqual(z);
    const s = pinchAt(v, { x: 30, y: 70 }, { x: 35, y: 60 }, 0.5);
    expect(s).toEqual(panBy(z, 5, -10));
  });
});
