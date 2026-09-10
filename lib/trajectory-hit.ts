/**
 * Screen-space hit test for the kept trajectories: which fixed pair (forward + backward through
 * one start) passes within a few PIXELS of a pointer position. Pixels, never world units: a world
 * threshold would grow or shrink with the zoom, so a curve would be easy to hit zoomed in and
 * impossible zoomed out. Pure: no React, no DOM.
 */
import type { Vec2 } from "@/lib/core/types";
import { worldToScreen, type Viewport } from "@/lib/render/viewport";
import type { TrajectoryView } from "@/lib/scene";

/** Pointer distance (px) within which a click removes a kept trajectory instead of adding one. */
export const HIT_THRESHOLD_PX = 8;

/** Distance from `p` to the segment `a`-`b` (all in the same coordinates). */
export function pointToSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  // A degenerate segment is its point; otherwise the parameter of the foot, clamped to the segment.
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Smallest screen distance from `screen` to a polyline whose points are world coordinates. */
export function polylineScreenDistance(points: ReadonlyArray<Vec2>, screen: Vec2, viewport: Viewport): number {
  if (points.length === 0) return Infinity;
  let prev = worldToScreen(viewport, points[0]);
  let best = Math.hypot(screen.x - prev.x, screen.y - prev.y);
  for (let i = 1; i < points.length; i++) {
    const cur = worldToScreen(viewport, points[i]);
    const d = pointToSegmentDistance(screen, prev, cur);
    if (d < best) best = d;
    prev = cur;
  }
  return best;
}

/**
 * The START index whose pair has a polyline segment within `thresholdPx` of `screen`; the nearest
 * one when several qualify; null when none. `trajectories` holds the curves in start order, the
 * same number for every start (two: forward and backward), as the hook keeps them; a list that
 * does not divide evenly is not the hook's and hits nothing.
 */
export function nearestFixedTrajectory(
  trajectories: ReadonlyArray<TrajectoryView>,
  starts: ReadonlyArray<Vec2>,
  screen: Vec2,
  viewport: Viewport,
  thresholdPx: number = HIT_THRESHOLD_PX,
): number | null {
  if (starts.length === 0 || trajectories.length % starts.length !== 0) return null;
  const perStart = trajectories.length / starts.length;
  let bestIndex: number | null = null;
  let bestDistance = thresholdPx;
  for (let i = 0; i < starts.length; i++) {
    for (let k = 0; k < perStart; k++) {
      const d = polylineScreenDistance(trajectories[i * perStart + k].points, screen, viewport);
      if (d <= bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
  }
  return bestIndex;
}

/** What a click (or a touch long press) at `screen` does: remove the pair it lands on, else add one through the point. */
export function clickAction(
  trajectories: ReadonlyArray<TrajectoryView>,
  starts: ReadonlyArray<Vec2>,
  screen: Vec2,
  viewport: Viewport,
  thresholdPx: number = HIT_THRESHOLD_PX,
): { type: "delete"; index: number } | { type: "add" } {
  const index = nearestFixedTrajectory(trajectories, starts, screen, viewport, thresholdPx);
  return index === null ? { type: "add" } : { type: "delete", index };
}
