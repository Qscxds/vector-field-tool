import { describe, expect, it } from "vitest";
import { fitViewport, panBy, pixelScale, resetViewport, screenToWorld, worldToScreen, zoomAt, type Viewport } from "./viewport";

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

describe("resetViewport", () => {
  it("is fitViewport of the original box", () => {
    expect(resetViewport(box, 600, 600)).toEqual(fitViewport(box, 600, 600));
  });
});
