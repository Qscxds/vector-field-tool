/**
 * World <-> screen coordinate mapping. Screen y grows downward, world y grows upward.
 * The box is stretched onto the full canvas (independent x/y scales); students set the box.
 */
import type { Box, Vec2 } from "../core/types";

export type Viewport = { box: Box; width: number; height: number };

export function worldToScreen(v: Viewport, p: Vec2): Vec2 {
  const sx = v.width / (v.box.x.max - v.box.x.min);
  const sy = v.height / (v.box.y.max - v.box.y.min);
  return { x: (p.x - v.box.x.min) * sx, y: (v.box.y.max - p.y) * sy };
}

export function screenToWorld(v: Viewport, p: Vec2): Vec2 {
  const sx = (v.box.x.max - v.box.x.min) / v.width;
  const sy = (v.box.y.max - v.box.y.min) / v.height;
  return { x: v.box.x.min + p.x * sx, y: v.box.y.max - p.y * sy };
}

/** Pixels per world unit along each axis. */
export function pixelScale(v: Viewport): Vec2 {
  return { x: v.width / (v.box.x.max - v.box.x.min), y: v.height / (v.box.y.max - v.box.y.min) };
}
