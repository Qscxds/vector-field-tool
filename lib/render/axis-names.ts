/**
 * Where to draw the axis NAMES (t or x, and y). The horizontal name sits near the right end of the
 * y = 0 axis line and the vertical name near the top of the x = 0 line; when an axis is off-screen
 * the name goes to the matching corner. Tick numbers are drawn along the bottom edge (baseline at
 * height - 3, centered on their tick) and the left edge (from x = 4, centered on their tick), and
 * the names never enter those strips.
 */
import { worldToScreen, type Viewport } from "./viewport";

export type AxisNameAnchor = {
  x: number;
  y: number;
  align: "left" | "right";
  baseline: "top" | "bottom";
};

export type AxisNameLayout = { horizontal: AxisNameAnchor; vertical: AxisNameAnchor };

export type AxisNameOptions = {
  /** Pixel width of the widest y tick number (the left column starts at x = 4). */
  tickColumnWidth: number;
  /** Pixel height of the x tick numbers (their row ends at y = height - 3). */
  tickRowHeight: number;
  /** Pixel height of the name itself. Default 14. */
  nameHeight?: number;
  /** Gap between an axis line (or the tick strips) and the name. Default 4. */
  margin?: number;
  /** Inset from the right edge. Default 6. */
  edge?: number;
};

export function axisNameAnchors(v: Viewport, opts: AxisNameOptions): AxisNameLayout {
  const margin = opts.margin ?? 4;
  const edge = opts.edge ?? 6;
  const nameHeight = opts.nameHeight ?? 14;
  const rowTop = v.height - 3 - opts.tickRowHeight; // top of the bottom tick strip
  const columnRight = 4 + opts.tickColumnWidth; // right edge of the left tick strip
  const origin = worldToScreen(v, { x: 0, y: 0 });

  let horizontal: AxisNameAnchor;
  if (v.box.y.min <= 0 && 0 <= v.box.y.max) {
    const above = Math.min(origin.y - margin, rowTop - 2);
    horizontal =
      above >= nameHeight
        ? { x: v.width - edge, y: above, align: "right", baseline: "bottom" }
        : { x: v.width - edge, y: origin.y + margin, align: "right", baseline: "top" }; // axis at the very top
  } else {
    horizontal = { x: v.width - edge, y: rowTop - 2, align: "right", baseline: "bottom" }; // bottom-right corner
  }

  let vertical: AxisNameAnchor;
  if (v.box.x.min <= 0 && 0 <= v.box.x.max) {
    const right = Math.max(origin.x + margin, columnRight + margin); // never over the tick column
    vertical =
      right <= v.width - nameHeight
        ? { x: right, y: margin, align: "left", baseline: "top" }
        : { x: origin.x - margin, y: margin, align: "right", baseline: "top" }; // axis at the very right
  } else {
    vertical = { x: columnRight + margin, y: margin, align: "left", baseline: "top" }; // top-left corner
  }
  return { horizontal, vertical };
}
