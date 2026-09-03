/**
 * Vector field sampling on a regular grid.
 *
 * Non-finite samples (1/x at x = 0) stay in the array with `mag: NaN` and are counted in
 * `singularCount`; the drawing layer decides how to show them. `maxMag` only counts finite values.
 */
import type { CompiledSystem } from "./parse";
import type { Box, Range, Vec2 } from "./types";

export type FieldSample = { at: Vec2; v: Vec2; mag: number };

export type FieldGrid = {
  /** Row-major: y varies slowest, x fastest. Length nx * ny. */
  samples: FieldSample[];
  maxMag: number;
  singularCount: number;
  nx: number;
  ny: number;
  box: Box;
};

export function assertRange(r: Range, name: string): void {
  if (!Number.isFinite(r.min) || !Number.isFinite(r.max) || !(r.min < r.max)) {
    throw new RangeError(`${name} range must satisfy min < max with finite bounds.`);
  }
}

export function assertBox(box: Box): void {
  assertRange(box.x, "x");
  assertRange(box.y, "y");
}

/** Evenly spaced coordinates including both ends (a single point sits at the centre). */
export function linspace(r: Range, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("grid size must be a positive integer.");
  if (n === 1) return [(r.min + r.max) / 2];
  const step = (r.max - r.min) / (n - 1);
  return Array.from({ length: n }, (_, i) => r.min + i * step);
}

export function sampleField(sys: CompiledSystem, box: Box, nx: number, ny: number, t = 0, checkpoint?: () => void): FieldGrid {
  assertBox(box);
  const xs = linspace(box.x, nx);
  const ys = linspace(box.y, ny);
  const samples: FieldSample[] = [];
  let maxMag = 0;
  let singularCount = 0;
  for (const y of ys) {
    checkpoint?.();
    for (const x of xs) {
      const at = { x, y };
      const v = sys.eval(at, t);
      const finite = Number.isFinite(v.x) && Number.isFinite(v.y);
      const mag = finite ? Math.hypot(v.x, v.y) : NaN;
      if (finite) {
        if (mag > maxMag) maxMag = mag;
      } else {
        singularCount += 1;
      }
      samples.push({ at, v, mag });
    }
  }
  return { samples, maxMag, singularCount, nx, ny, box };
}
