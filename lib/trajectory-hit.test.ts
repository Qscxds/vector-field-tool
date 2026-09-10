import { describe, expect, it } from "vitest";
import type { Vec2 } from "./core/types";
import type { Viewport } from "./render/viewport";
import type { TrajectoryView } from "./scene";
import { IDLE_GESTURE, LONG_PRESS_MS, reduceGesture } from "./gestures";
import { clickAction, HIT_THRESHOLD_PX, nearestFixedTrajectory, pointToSegmentDistance, polylineScreenDistance } from "./trajectory-hit";

// 400 x 400 canvas over [-2, 2]^2: 100 px per unit. World (x, y) -> screen ((x + 2) * 100, (2 - y) * 100).
const view: Viewport = { box: { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } }, width: 400, height: 400 };
// The same canvas zoomed in 2x on the origin: [-1, 1]^2, 200 px per unit.
const zoomed: Viewport = { box: { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } }, width: 400, height: 400 };

const curve = (points: Vec2[], direction: "forward" | "backward" = "forward"): TrajectoryView => ({ direction, points, status: "completed", steps: 1, tEnd: 1, stop: "far" });
/** The pair through (0, y) along the horizontal line y = const, from x = -1 to x = 1. */
const horizontalPair = (y: number): TrajectoryView[] => [curve([{ x: 0, y }, { x: 1, y }], "forward"), curve([{ x: 0, y }, { x: -1, y }], "backward")];

describe("pointToSegmentDistance", () => {
  it("is the perpendicular distance inside the segment and the endpoint distance beyond it", () => {
    const a = { x: 100, y: 100 };
    const b = { x: 300, y: 100 };
    expect(pointToSegmentDistance({ x: 200, y: 105 }, a, b)).toBeCloseTo(5, 12);
    expect(pointToSegmentDistance({ x: 310, y: 100 }, a, b)).toBeCloseTo(10, 12);
    // (306, 108) is 6 right of and 8 below b: 10 by Pythagoras.
    expect(pointToSegmentDistance({ x: 306, y: 108 }, a, b)).toBeCloseTo(10, 12);
    // A degenerate segment is its point.
    expect(pointToSegmentDistance({ x: 103, y: 104 }, a, a)).toBeCloseTo(5, 12);
  });
});

describe("nearestFixedTrajectory (screen pixels)", () => {
  // y = 1 is screen row (2 - 1) * 100 = 100; x from -1 to 1 spans screen columns 100..300.
  const pairs = horizontalPair(1);
  const starts = [{ x: 0, y: 1 }];

  it("hits a point 5 px from the line and misses one 12 px away (threshold 8 px)", () => {
    expect(HIT_THRESHOLD_PX).toBe(8);
    expect(nearestFixedTrajectory(pairs, starts, { x: 200, y: 105 }, view)).toBe(0);
    expect(nearestFixedTrajectory(pairs, starts, { x: 200, y: 112 }, view)).toBeNull();
    // Beyond the end of the line the endpoint counts: 5 px past x = 1 hits, 12 px past misses.
    expect(nearestFixedTrajectory(pairs, starts, { x: 305, y: 100 }, view)).toBe(0);
    expect(nearestFixedTrajectory(pairs, starts, { x: 312, y: 100 }, view)).toBeNull();
  });

  it("keeps the threshold in pixels when the view is zoomed: the same world offset hits at 100 px/unit and misses at 200 px/unit", () => {
    // World offset 0.06 below the line: 6 px in `view` (hit), 12 px in `zoomed` (miss).
    const offset = 0.06;
    const inView = { x: 200, y: (2 - (1 - offset)) * 100 };
    const inZoomed = { x: 200, y: (1 - (1 - offset)) * 200 };
    expect(nearestFixedTrajectory(pairs, starts, inView, view)).toBe(0);
    expect(nearestFixedTrajectory(pairs, starts, inZoomed, zoomed)).toBeNull();
    // A smaller world offset (0.03 = 6 px zoomed) hits again: the rule is 8 px, whatever the zoom.
    expect(nearestFixedTrajectory(pairs, starts, { x: 200, y: (1 - (1 - 0.03)) * 200 }, zoomed)).toBe(0);
  });

  it("returns the nearest of several pairs, and null with no starts or a list that is not pairs", () => {
    const two = [...horizontalPair(1), ...horizontalPair(0.9)];
    const twoStarts = [{ x: 0, y: 1 }, { x: 0, y: 0.9 }];
    // y = 0.9 is screen row 110; a point at row 107 is 7 px from y = 1 and 3 px from y = 0.9.
    expect(nearestFixedTrajectory(two, twoStarts, { x: 200, y: 107 }, view)).toBe(1);
    expect(nearestFixedTrajectory(two, twoStarts, { x: 200, y: 103 }, view)).toBe(0);
    expect(nearestFixedTrajectory([], [], { x: 200, y: 100 }, view)).toBeNull();
    expect(nearestFixedTrajectory(pairs.slice(0, 1), [{ x: 0, y: 1 }, { x: 0, y: 0 }], { x: 200, y: 100 }, view)).toBeNull();
  });

  it("polylineScreenDistance of an empty polyline is infinite", () => {
    expect(polylineScreenDistance([], { x: 0, y: 0 }, view)).toBe(Infinity);
  });
});

describe("clickAction", () => {
  it("deletes the pair under the pointer and adds elsewhere", () => {
    const pairs = horizontalPair(1);
    const starts = [{ x: 0, y: 1 }];
    expect(clickAction(pairs, starts, { x: 200, y: 104 }, view)).toEqual({ type: "delete", index: 0 });
    expect(clickAction(pairs, starts, { x: 200, y: 300 }, view)).toEqual({ type: "add" });
  });
});

describe("touch long press on a kept curve (lib/gestures -> clickAction)", () => {
  it("a finger held still on the curve yields a longPress at that point, which clickAction turns into a delete; on empty canvas, an add", () => {
    const pairs = horizontalPair(1);
    const starts = [{ x: 0, y: 1 }];
    const hold = (x: number, y: number) => {
      const down = reduceGesture(IDLE_GESTURE, { type: "down", id: 1, x, y, t: 1000 });
      const fired = reduceGesture(down.state, { type: "tick", t: 1000 + LONG_PRESS_MS });
      expect(fired.actions).toEqual([{ type: "longPress", at: { x, y } }]);
      return fired.actions[0] as { type: "longPress"; at: Vec2 };
    };
    // 4 px below the line y = 1 (screen row 100): removed. Row 300 (y = -1): a new curve.
    expect(clickAction(pairs, starts, hold(200, 104).at, view)).toEqual({ type: "delete", index: 0 });
    expect(clickAction(pairs, starts, hold(200, 300).at, view)).toEqual({ type: "add" });
  });
});
