import { describe, expect, it } from "vitest";
import { DOUBLE_TAP_MS, IDLE_GESTURE, LONG_PRESS_MS, longPressDueAt, reduceGesture, TAP_MOVE_PX, type GestureAction, type GestureEvent, type GestureState } from "./gestures";

/** Runs a sequence and returns the final state and every action in order. */
function run(events: GestureEvent[], start: GestureState = IDLE_GESTURE): { state: GestureState; actions: GestureAction[] } {
  let state = start;
  const actions: GestureAction[] = [];
  for (const e of events) {
    const r = reduceGesture(state, e);
    state = r.state;
    actions.push(...r.actions);
  }
  return { state, actions };
}

describe("pinch", () => {
  it("distance 100 -> 150 gives factor 1.5 about the midpoint", () => {
    // Fingers at (100, 100) and (200, 100): distance 100, midpoint (150, 100).
    // Second finger moves to (250, 100): distance 150, midpoint (175, 100) -> pan by +25 and factor 150/100.
    const { state, actions } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "down", id: 2, x: 200, y: 100, t: 10 },
      { type: "move", id: 2, x: 250, y: 100, t: 30 },
    ]);
    expect(state.phase).toBe("pinch");
    expect(actions).toEqual([
      { type: "pan", dx: 25, dy: 0 },
      { type: "pinch", center: { x: 175, y: 100 }, factor: 1.5 },
    ]);
  });

  it("a symmetric pinch returns the midpoint and zooms by the distance ratio", () => {
    // (100, 100) / (200, 100) -> (75, 100) / (225, 100): distance 100 -> 150, midpoint back where it started after both moves.
    const { actions } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "down", id: 2, x: 200, y: 100, t: 0 },
      { type: "move", id: 1, x: 75, y: 100, t: 20 },
      { type: "move", id: 2, x: 225, y: 100, t: 20 },
    ]);
    // First move: distance 125, midpoint (137.5, 100) -> pan -12.5 and factor 1.25; second: 150, back to (150, 100) -> pan +12.5, factor 1.2.
    expect(actions).toEqual([
      { type: "pan", dx: -12.5, dy: 0 },
      { type: "pinch", center: { x: 137.5, y: 100 }, factor: 1.25 },
      { type: "pan", dx: 12.5, dy: 0 },
      { type: "pinch", center: { x: 150, y: 100 }, factor: 1.2 },
    ]);
  });

  it("lifting one of two fingers ends the pinch cleanly: no tap, no pan, idle after the second lift", () => {
    const { state, actions } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "down", id: 2, x: 200, y: 100, t: 0 },
      { type: "move", id: 2, x: 220, y: 100, t: 20 },
      { type: "up", id: 2, x: 220, y: 100, t: 40 },
      { type: "move", id: 1, x: 140, y: 140, t: 60 },
      { type: "up", id: 1, x: 140, y: 140, t: 80 },
    ]);
    expect(actions.filter((a) => a.type !== "pan" && a.type !== "pinch")).toEqual([]);
    // After the second finger lifts, the remaining finger's motion produces nothing.
    expect(actions.slice(2)).toEqual([]);
    expect(state.phase).toBe("idle");
    expect(state.pointers).toEqual([]);
  });

  it("a one-finger pan becomes a pinch when the second finger touches", () => {
    const { state } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "move", id: 1, x: 130, y: 100, t: 20 },
      { type: "down", id: 2, x: 200, y: 100, t: 40 },
    ]);
    expect(state.phase).toBe("pinch");
    expect(state.pinchDistance).toBe(70);
  });
});

describe("long press", () => {
  it("a 600 ms hold without movement is a long press and the release is not a tap", () => {
    const pressed = run([{ type: "down", id: 1, x: 50, y: 60, t: 1000 }]);
    expect(longPressDueAt(pressed.state)).toBe(1000 + LONG_PRESS_MS);
    const { state, actions } = run(
      [
        { type: "move", id: 1, x: 53, y: 62, t: 1200 }, // under TAP_MOVE_PX: still a press
        { type: "tick", t: 1600 },
        { type: "up", id: 1, x: 53, y: 62, t: 1650 },
      ],
      pressed.state,
    );
    expect(actions).toEqual([{ type: "longPress", at: { x: 50, y: 60 } }]);
    expect(state.phase).toBe("idle");
    expect(longPressDueAt(state)).toBeNull();
  });

  it("a tick before the hold time fires nothing", () => {
    const { state, actions } = run([
      { type: "down", id: 1, x: 50, y: 60, t: 0 },
      { type: "tick", t: LONG_PRESS_MS - 1 },
    ]);
    expect(actions).toEqual([]);
    expect(state.phase).toBe("press");
  });

  it("a tick after the finger moved away does not fire (the press became a pan)", () => {
    const { actions } = run([
      { type: "down", id: 1, x: 50, y: 60, t: 0 },
      { type: "move", id: 1, x: 70, y: 60, t: 100 },
      { type: "tick", t: 700 },
    ]);
    expect(actions).toEqual([{ type: "pan", dx: 20, dy: 0 }]);
  });
});

describe("tap and double tap", () => {
  it("a short tap without movement is a tap at the release point", () => {
    const { state, actions } = run([
      { type: "down", id: 1, x: 10, y: 20, t: 0 },
      { type: "up", id: 1, x: 10, y: 20, t: 80 },
    ]);
    expect(actions).toEqual([{ type: "tap", at: { x: 10, y: 20 } }]);
    expect(state.phase).toBe("idle");
    expect(state.lastTap).toEqual({ x: 10, y: 20, t: 80 });
  });

  it("two taps 250 ms apart (within 30 px) are a tap then a double tap", () => {
    const { state, actions } = run([
      { type: "down", id: 1, x: 10, y: 20, t: 0 },
      { type: "up", id: 1, x: 10, y: 20, t: 50 },
      { type: "down", id: 2, x: 20, y: 25, t: 250 },
      { type: "up", id: 2, x: 20, y: 25, t: 300 },
    ]);
    expect(actions).toEqual([
      { type: "tap", at: { x: 10, y: 20 } },
      { type: "doubleTap", at: { x: 20, y: 25 } },
    ]);
    // The double tap consumes the memory: a third tap is a plain tap again.
    expect(state.lastTap).toBeNull();
  });

  it("two taps more than DOUBLE_TAP_MS apart are two taps", () => {
    const { actions } = run([
      { type: "down", id: 1, x: 10, y: 20, t: 0 },
      { type: "up", id: 1, x: 10, y: 20, t: 50 },
      { type: "down", id: 2, x: 10, y: 20, t: 50 + DOUBLE_TAP_MS + 1 },
      { type: "up", id: 2, x: 10, y: 20, t: 50 + DOUBLE_TAP_MS + 40 },
    ]);
    expect(actions.map((a) => a.type)).toEqual(["tap", "tap"]);
  });

  it("two taps 100 px apart are two taps", () => {
    const { actions } = run([
      { type: "down", id: 1, x: 10, y: 20, t: 0 },
      { type: "up", id: 1, x: 10, y: 20, t: 50 },
      { type: "down", id: 2, x: 110, y: 20, t: 150 },
      { type: "up", id: 2, x: 110, y: 20, t: 200 },
    ]);
    expect(actions.map((a) => a.type)).toEqual(["tap", "tap"]);
  });

  it("a 10 px move cancels the tap and pans instead", () => {
    expect(10).toBeGreaterThanOrEqual(TAP_MOVE_PX);
    const { state, actions } = run([
      { type: "down", id: 1, x: 10, y: 20, t: 0 },
      { type: "move", id: 1, x: 20, y: 20, t: 40 },
      { type: "up", id: 1, x: 20, y: 20, t: 80 },
    ]);
    expect(actions).toEqual([{ type: "pan", dx: 10, dy: 0 }]);
    expect(state.phase).toBe("idle");
    expect(state.lastTap).toBeNull();
  });

  it("a cancel drops everything without a tap", () => {
    const { state, actions } = run([
      { type: "down", id: 1, x: 10, y: 20, t: 0 },
      { type: "cancel", id: 1, t: 40 },
    ]);
    expect(actions).toEqual([]);
    expect(state).toEqual(IDLE_GESTURE);
  });

  it("events for unknown pointers are ignored", () => {
    const { state, actions } = run([
      { type: "move", id: 7, x: 1, y: 1, t: 0 },
      { type: "up", id: 7, x: 1, y: 1, t: 1 },
    ]);
    expect(actions).toEqual([]);
    expect(state).toEqual(IDLE_GESTURE);
  });
});
