/**
 * Level curves of a scalar field by marching squares (world coordinates, linear interpolation).
 * Output is a list of line segments; consecutive cells produce touching segments, which is all a
 * canvas needs. Cells with non-finite corner values are skipped.
 */
import type { Box, Vec2 } from "../core/types";

export type Segment = [Vec2, Vec2];

/** Scalar field sampled on a regular grid: values[j][i] = f(x_i, y_j). */
export type ScalarGrid = { box: Box; nx: number; ny: number; values: number[][] };

/**
 * Samples f once on an (nx+1) x (ny+1) grid. Level curves for any number of levels are then read
 * from these values: the potential of an exact equation costs ~130 evaluations per point, and
 * sampling it once instead of once per level is what keeps textbook exact equations inside the
 * per-call budget (review C9). `checkpoint` is called per row.
 */
export function sampleGrid(f: (p: Vec2) => number, box: Box, nx = 60, ny = 60, checkpoint?: () => void): ScalarGrid {
  const dx = (box.x.max - box.x.min) / nx;
  const dy = (box.y.max - box.y.min) / ny;
  const values: number[][] = [];
  for (let j = 0; j <= ny; j++) {
    checkpoint?.();
    const row: number[] = [];
    for (let i = 0; i <= nx; i++) row.push(f({ x: box.x.min + i * dx, y: box.y.min + j * dy }));
    values.push(row);
  }
  return { box, nx, ny, values };
}

export function contourSegments(f: (p: Vec2) => number, box: Box, level: number, nx = 60, ny = 60): Segment[] {
  return contourSegmentsFromGrid(sampleGrid(f, box, nx, ny), level);
}

export function contourSegmentsFromGrid(grid: ScalarGrid, level: number): Segment[] {
  const { box, nx, ny } = grid;
  const dx = (box.x.max - box.x.min) / nx;
  const dy = (box.y.max - box.y.min) / ny;
  const values = grid.values.map((row) => row.map((v) => v - level));
  const segments: Segment[] = [];
  // interpolate the zero crossing on an edge between two corners
  const cross = (x1: number, y1: number, v1: number, x2: number, y2: number, v2: number): Vec2 => {
    const t = v1 === v2 ? 0.5 : v1 / (v1 - v2);
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = box.x.min + i * dx, x1 = x0 + dx;
      const y0 = box.y.min + j * dy, y1 = y0 + dy;
      const bl = values[j][i], br = values[j][i + 1], tr = values[j + 1][i + 1], tl = values[j + 1][i];
      if (![bl, br, tr, tl].every(Number.isFinite)) continue;
      const pts: Vec2[] = [];
      if (bl < 0 !== br < 0) pts.push(cross(x0, y0, bl, x1, y0, br)); // bottom
      if (br < 0 !== tr < 0) pts.push(cross(x1, y0, br, x1, y1, tr)); // right
      if (tr < 0 !== tl < 0) pts.push(cross(x1, y1, tr, x0, y1, tl)); // top
      if (tl < 0 !== bl < 0) pts.push(cross(x0, y1, tl, x0, y0, bl)); // left
      if (pts.length === 2) segments.push([pts[0], pts[1]]);
      else if (pts.length === 4) {
        // saddle cell: disambiguate with the centre value
        const centre = (bl + br + tr + tl) / 4;
        if (centre < 0 === bl < 0) {
          segments.push([pts[0], pts[3]], [pts[1], pts[2]]);
        } else {
          segments.push([pts[0], pts[1]], [pts[2], pts[3]]);
        }
      }
    }
  }
  return segments;
}
