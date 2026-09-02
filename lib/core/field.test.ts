import { describe, expect, it } from "vitest";
import { linspace, sampleField } from "./field";
import { compileSystem } from "./parse";

const unit = { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } };

describe("linspace", () => {
  it("includes both ends with even spacing", () => {
    expect(linspace({ min: 0, max: 1 }, 5)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("puts a single sample at the centre", () => {
    expect(linspace({ min: -2, max: 4 }, 1)).toEqual([1]);
  });

  it("rejects non-positive or fractional sizes", () => {
    expect(() => linspace({ min: 0, max: 1 }, 0)).toThrow(RangeError);
    expect(() => linspace({ min: 0, max: 1 }, 2.5)).toThrow(RangeError);
  });
});

describe("sampleField", () => {
  it("samples the identity field on a 3x3 grid, row-major", () => {
    const grid = sampleField(compileSystem({ f: "x", g: "y" }), unit, 3, 3);
    expect(grid.samples).toHaveLength(9);
    expect(grid.nx).toBe(3);
    expect(grid.ny).toBe(3);
    // first row is y = -1, x = -1, 0, 1
    expect(grid.samples[0].at).toEqual({ x: -1, y: -1 });
    expect(grid.samples[1].at).toEqual({ x: 0, y: -1 });
    expect(grid.samples[3].at).toEqual({ x: -1, y: 0 });
    const corner = grid.samples[8];
    expect(corner.at).toEqual({ x: 1, y: 1 });
    expect(corner.v).toEqual({ x: 1, y: 1 });
    expect(corner.mag).toBeCloseTo(Math.SQRT2, 12);
    expect(grid.samples[4].mag).toBe(0); // origin
    expect(grid.maxMag).toBeCloseTo(Math.SQRT2, 12);
    expect(grid.singularCount).toBe(0);
  });

  it("keeps singular samples, counts them, and excludes them from maxMag", () => {
    const grid = sampleField(compileSystem({ f: "1/x", g: "0" }), unit, 3, 1);
    expect(grid.singularCount).toBe(1);
    const singular = grid.samples.find((s) => !Number.isFinite(s.mag));
    expect(singular?.at.x).toBe(0);
    expect(singular?.v.x).toBe(Infinity);
    expect(Number.isNaN(singular?.mag)).toBe(true);
    expect(grid.maxMag).toBe(1); // |1/(-1)| = |1/1| = 1
  });

  it("passes time to non-autonomous systems", () => {
    const sys = compileSystem({ f: "t", g: "0" });
    expect(sampleField(sys, unit, 1, 1, 2.5).samples[0].v.x).toBe(2.5);
    expect(sampleField(sys, unit, 1, 1).samples[0].v.x).toBe(0);
  });

  it("rejects degenerate boxes", () => {
    const sys = compileSystem({ f: "x", g: "y" });
    expect(() => sampleField(sys, { x: { min: 1, max: 1 }, y: unit.y }, 2, 2)).toThrow(RangeError);
    expect(() => sampleField(sys, { x: { min: 2, max: 1 }, y: unit.y }, 2, 2)).toThrow(RangeError);
    expect(() => sampleField(sys, { x: { min: -Infinity, max: 1 }, y: unit.y }, 2, 2)).toThrow(RangeError);
  });

  it("does not throw for a field that is NaN everywhere", () => {
    const grid = sampleField(compileSystem({ f: "sqrt(-1 - x^2)", g: "0" }), unit, 2, 2);
    expect(grid.singularCount).toBe(4);
    expect(grid.maxMag).toBe(0);
  });
});
