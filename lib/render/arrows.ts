/**
 * Arrow geometry in screen space.
 */
import type { FieldGrid } from "../core/field";
import type { Vec2 } from "../core/types";
import { magnitudeColor } from "./color";
import { worldToScreen, type Viewport } from "./viewport";

/**
 * Arrow-head triangle for an arrow from `from` to `to`: [tip, left wing, right wing] in screen
 * coordinates. Empty for a degenerate (zero-length) arrow.
 */
export function arrowPolygon(from: Vec2, to: Vec2, headSize: number): Vec2[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 0) || !(headSize > 0) || !Number.isFinite(len)) return [];
  const ux = dx / len;
  const uy = dy / len;
  const back = { x: to.x - ux * headSize, y: to.y - uy * headSize };
  const half = headSize * 0.5;
  return [
    to,
    { x: back.x - uy * half, y: back.y + ux * half },
    { x: back.x + uy * half, y: back.y - ux * half },
  ];
}

export type ArrowMode = "unit" | "scaled";

export type ScreenArrow = {
  /** Screen-space tail. */
  from: Vec2;
  /** Screen-space head. Equal to `from` for zero or singular vectors. */
  to: Vec2;
  color: string;
  mag: number;
  singular: boolean;
};

/**
 * Turns a sampled field into screen-space arrows centred on their sample points.
 * - 'unit': every arrow has the same length (a fraction of the grid cell); magnitude is in the colour.
 *           This is the default: unnormalised arrows smear into a blob wherever the field is strong.
 * - 'scaled': length proportional to magnitude / maxMag.
 */
export function scaleArrows(grid: FieldGrid, v: Viewport, mode: ArrowMode = "unit"): ScreenArrow[] {
  const cellX = grid.nx > 1 ? v.width / (grid.nx - 1) : v.width;
  const cellY = grid.ny > 1 ? v.height / (grid.ny - 1) : v.height;
  const maxLen = 0.85 * Math.min(cellX, cellY);
  const ps = { x: v.width / (grid.box.x.max - grid.box.x.min), y: v.height / (grid.box.y.max - grid.box.y.min) };

  return grid.samples.map((s) => {
    const centre = worldToScreen(v, s.at);
    const singular = !Number.isFinite(s.mag);
    if (singular || s.mag === 0) {
      return { from: centre, to: centre, color: magnitudeColor(s.mag, grid.maxMag), mag: s.mag, singular };
    }
    // Direction in screen space (y flipped), accounting for anisotropic pixel scales.
    const dx = s.v.x * ps.x;
    const dy = -s.v.y * ps.y;
    const screenLen = Math.hypot(dx, dy);
    const ux = dx / screenLen;
    const uy = dy / screenLen;
    const len = mode === "unit" || grid.maxMag <= 0 ? maxLen : (maxLen * s.mag) / grid.maxMag;
    return {
      from: { x: centre.x - (ux * len) / 2, y: centre.y - (uy * len) / 2 },
      to: { x: centre.x + (ux * len) / 2, y: centre.y + (uy * len) / 2 },
      color: magnitudeColor(s.mag, grid.maxMag),
      mag: s.mag,
      singular: false,
    };
  });
}
