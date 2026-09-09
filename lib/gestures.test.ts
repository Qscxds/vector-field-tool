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
    // Second finger moves to (250, 100): distance 150, midpoint (175, 100) -> ONE action: the
    // midpoint went from (150, 100) to (175, 100) and the factor is 150/100.
    const { state, actions } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "down", id: 2, x: 200, y: 100, t: 10 },
      { type: "move", id: 2, x: 250, y: 100, t: 30 },
    ]);
    expect(state.phase).toBe("pinch");
    expect(actions).toEqual([{ type: "pinch", from: { x: 150, y: 100 }, center: { x: 175, y: 100 }, factor: 1.5 }]);
  });

  it("a symmetric pinch returns the midpoint and zooms by the distance ratio", () => {
    // (100, 100) / (200, 100) -> (75, 100) / (225, 100): distance 100 -> 150, midpoint back where it started after both moves.
    const { actions } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "down", id: 2, x: 200, y: 100, t: 0 },
      { type: "move", id: 1, x: 75, y: 100, t: 20 },
      { type: "move", id: 2, x: 225, y: 100, t: 20 },
    ]);
    // First move: distance 125, midpoint (150, 100) -> (137.5, 100), factor 1.25; second: 150, midpoint back to (150, 100), factor 1.2.
    expect(actions).toEqual([
      { type: "pinch", from: { x: 150, y: 100 }, center: { x: 137.5, y: 100 }, factor: 1.25 },
      { type: "pinch", from: { x: 137.5, y: 100 }, center: { x: 150, y: 100 }, factor: 1.2 },
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

  it("a pure midpoint drift (both fingers move together) is one pinch action with factor 1", () => {
    // (100, 100) / (200, 100) both move by (+10, +5): distance stays 100, midpoint (150, 100) -> (160, 105).
    // The first finger's move alone changes the distance, so the derived test moves them in one event each and checks the SUM.
    const { actions } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "down", id: 2, x: 200, y: 100, t: 0 },
      { type: "move", id: 1, x: 110, y: 105, t: 20 },
      { type: "move", id: 2, x: 210, y: 105, t: 20 },
    ]);
    expect(actions.every((a) => a.type === "pinch")).toBe(true);
    const last = actions[actions.length - 1];
    expect(last).toMatchObject({ type: "pinch", center: { x: 160, y: 105 } });
    // Distance after the second move is back to 100: the product of the factors is 1.
    const product = actions.reduce((p, a) => (a.type === "pinch" ? p * a.factor : p), 1);
    expect(product).toBeCloseTo(1, 12);
    expect(actions[0]).toMatchObject({ from: { x: 150, y: 100 } });
  });

  it("a third finger lifting does not end the pinch; the next move still pinches", () => {
    const { state, actions } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "down", id: 2, x: 200, y: 100, t: 0 },
      { type: "down", id: 3, x: 300, y: 300, t: 10 },
      { type: "up", id: 3, x: 300, y: 300, t: 20 },
      { type: "move", id: 2, x: 250, y: 100, t: 30 },
    ]);
    expect(state.phase).toBe("pinch");
    expect(state.pointers.map((p) => p.id)).toEqual([1, 2]);
    expect(actions).toEqual([{ type: "pinch", from: { x: 150, y: 100 }, center: { x: 175, y: 100 }, factor: 1.5 }]);
  });

  it("a pinch leaves no double-tap memory: a tap right after it is a plain tap", () => {
    const { actions } = run([
      { type: "down", id: 1, x: 10, y: 20, t: 0 },
      { type: "up", id: 1, x: 10, y: 20, t: 50 },
      { type: "down", id: 2, x: 10, y: 20, t: 100 },
      { type: "down", id: 3, x: 110, y: 20, t: 110 },
      { type: "up", id: 3, x: 110, y: 20, t: 150 },
      { type: "up", id: 2, x: 10, y: 20, t: 160 },
      { type: "down", id: 4, x: 10, y: 20, t: 200 },
      { type: "up", id: 4, x: 10, y: 20, t: 240 },
    ]);
    expect(actions.map((a) => a.type)).toEqual(["tap", "tap"]);
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

  it("a tap, then a pan, then a tap within DOUBLE_TAP_MS of the first is NOT a double tap", () => {
    // Tap at t = 50; pan 100..150; tap released at t = 240 (190 ms after the first, within 30 px of it).
    const { actions } = run([
      { type: "down", id: 1, x: 10, y: 20, t: 0 },
      { type: "up", id: 1, x: 10, y: 20, t: 50 },
      { type: "down", id: 2, x: 10, y: 20, t: 100 },
      { type: "move", id: 2, x: 60, y: 20, t: 120 },
      { type: "up", id: 2, x: 60, y: 20, t: 150 },
      { type: "down", id: 3, x: 12, y: 20, t: 200 },
      { type: "up", id: 3, x: 12, y: 20, t: 240 },
    ]);
    expect(actions.map((a) => a.type)).toEqual(["tap", "pan", "tap"]);
  });

  it("a cancelled touch clears the previous tap's memory: the next tap is a plain tap", () => {
    const { state, actions } = run([
      { type: "down", id: 1, x: 10, y: 20, t: 0 },
      { type: "up", id: 1, x: 10, y: 20, t: 50 },
      { type: "down", id: 2, x: 10, y: 20, t: 100 },
      { type: "cancel", id: 2, t: 120 },
      { type: "down", id: 3, x: 10, y: 20, t: 200 },
      { type: "up", id: 3, x: 10, y: 20, t: 240 },
    ]);
    expect(actions.map((a) => a.type)).toEqual(["tap", "tap"]);
    expect(state.lastTap).toEqual({ x: 10, y: 20, t: 240 });
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
