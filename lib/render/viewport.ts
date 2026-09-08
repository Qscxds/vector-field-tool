/**
 * World <-> screen coordinate mapping and viewport manipulation. Screen y grows downward, world y
 * grows upward.
 *
 * By default, viewports built with fitViewport have the SAME pixel scale on both axes: a slope of 1
 * is drawn at 45 degrees and the circular orbits of the harmonic oscillator are circles. The user's
 * box is treated as "show at least this much": the shorter direction is widened symmetrically.
 * With `equalScale: false` the box is used exactly as entered and fills the canvas, so the two pixel
 * scales differ and slopes cannot be read off the picture. Every mapping in this file is per-axis
 * (worldToScreen / screenToWorld / pixelScale / zoomAt / panBy), so unequal scales need nothing else.
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

export type FitOptions = {
  /**
   * Same pixels per unit on both axes (default true). With false the returned box is exactly `box`
   * (a copy): the picture fills the canvas and the pixel scales are width/w and height/h.
   */
  equalScale?: boolean;
};

/**
 * Viewport over `box`. Equal scale (the default): shows at least `box`; whichever direction would
 * otherwise be drawn with more pixels per unit is widened symmetrically until both scales agree.
 * `equalScale: false`: the box as entered, filling the canvas (pixel scales may differ).
 */
export function fitViewport(box: Box, width: number, height: number, opts?: FitOptions): Viewport {
  if (!(width > 0) || !(height > 0)) throw new RangeError("viewport size must be positive.");
  const w = box.x.max - box.x.min;
  const h = box.y.max - box.y.min;
  if (!(w > 0) || !(h > 0)) throw new RangeError("box must have positive width and height.");
  if (opts?.equalScale === false) return { box: { x: { ...box.x }, y: { ...box.y } }, width, height };
  const scale = Math.min(width / w, height / h); // pixels per unit, the smaller one wins
  const newW = width / scale;
  const newH = height / scale;
  const cx = (box.x.min + box.x.max) / 2;
  const cy = (box.y.min + box.y.max) / 2;
  return {
    box: { x: { min: cx - newW / 2, max: cx + newW / 2 }, y: { min: cy - newH / 2, max: cy + newH / 2 } },
    width,
    height,
  };
}

export type ZoomLimits = {
  /** The box the user originally asked for; zoom is bounded relative to its size. */
  original: Box;
  /** Smallest allowed box size as a fraction of the original (default 1/50). */
  minFactor?: number;
  /** Largest allowed box size as a multiple of the original (default 50). */
  maxFactor?: number;
};

/**
 * Zooms by `factor` (> 1 zooms in) keeping the world point under `screenPoint` fixed.
 * With `limits`, the box size is clamped to [original/50, original*50] (by default).
 * Both box sides are divided by the same factor (and, when clamped, multiplied by the same f), so
 * the ratio of the two pixel scales is preserved: an unequal-scale viewport stays unequal by the
 * same ratio, an equal-scale one stays equal.
 */
export function zoomAt(v: Viewport, screenPoint: Vec2, factor: number, limits?: ZoomLimits): Viewport {
  if (!(factor > 0) || !Number.isFinite(factor)) return v;
  const anchor = screenToWorld(v, screenPoint);
  const w = v.box.x.max - v.box.x.min;
  const h = v.box.y.max - v.box.y.min;
  let newW = w / factor;
  let newH = h / factor;
  if (limits) {
    const minF = limits.minFactor ?? 1 / 50;
    const maxF = limits.maxFactor ?? 50;
    const ow = limits.original.x.max - limits.original.x.min;
    const oh = limits.original.y.max - limits.original.y.min;
    // keep the aspect ratio of the current viewport; clamp via a single factor
    const fW = Math.min(Math.max(newW, ow * minF), ow * maxF) / newW;
    const fH = Math.min(Math.max(newH, oh * minF), oh * maxF) / newH;
    const f = Math.abs(Math.log(fW)) > Math.abs(Math.log(fH)) ? fW : fH;
    newW *= f;
    newH *= f;
  }
  const sx = v.width / newW;
  const sy = v.height / newH;
  // choose the new min/max so that anchor maps back to screenPoint
  const xMin = anchor.x - screenPoint.x / sx;
  const yMax = anchor.y + screenPoint.y / sy;
  return { box: { x: { min: xMin, max: xMin + newW }, y: { min: yMax - newH, max: yMax } }, width: v.width, height: v.height };
}

/** Pans so that the content follows a drag of (dxScreen, dyScreen) pixels. */
export function panBy(v: Viewport, dxScreen: number, dyScreen: number): Viewport {
  const { x: sx, y: sy } = pixelScale(v);
  const dx = -dxScreen / sx; // dragging right shows more of the left: box moves left
  const dy = dyScreen / sy; // dragging down shows more of the top: box moves up
  return {
    box: { x: { min: v.box.x.min + dx, max: v.box.x.max + dx }, y: { min: v.box.y.min + dy, max: v.box.y.max + dy } },
    width: v.width,
    height: v.height,
  };
}

export function resetViewport(originalBox: Box, width: number, height: number, opts?: FitOptions): Viewport {
  return fitViewport(originalBox, width, height, opts);
}
