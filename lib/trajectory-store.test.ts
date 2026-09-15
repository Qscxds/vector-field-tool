import { describe, expect, it } from "vitest";
import type { Vec2 } from "./core/types";
import type { TrajectoryView } from "./scene";
import {
  addTrajectory,
  atCapacity,
  canUndo,
  clearTrajectories,
  deleteTrajectory,
  EMPTY_TRAJECTORY_STORE,
  HISTORY_LIMIT,
  MAX_TRAJECTORIES,
  resetTrajectories,
  retraceTrajectories,
  trajectoriesOf,
  trajectoryStartsOf,
  undoTrajectory,
} from "./trajectory-store";

/** A fake tracer: the pair through a start, tagged with the tracer's generation so a re-trace is visible. */
const tracer = (generation: number) => (start: Vec2): TrajectoryView[] =>
  (["forward", "backward"] as const).map((direction) => ({
    direction,
    points: [start, { x: start.x + (direction === "forward" ? 1 : -1), y: start.y }],
    status: "completed" as const,
    steps: generation,
    tEnd: generation,
    stop: "far" as const,
  }));
const trace = tracer(1);
const P = (x: number, y: number): Vec2 => ({ x, y });

describe("trajectory store: clear is final (the reported bug)", () => {
  it("re-tracing after a clear re-adds nothing: the cleared starts are gone from the store, not only from the picture", () => {
    // A link with traj=1,0 seeds the store; the student clears; the snapshot time changes (a re-trace).
    let s = resetTrajectories([P(1, 0)], trace);
    expect(trajectoryStartsOf(s)).toEqual([P(1, 0)]);
    s = clearTrajectories(s);
    expect(trajectoryStartsOf(s)).toEqual([]);
    expect(trajectoriesOf(s)).toEqual([]);
    s = retraceTrajectories(s, tracer(2));
    expect(trajectoryStartsOf(s)).toEqual([]);
    expect(trajectoriesOf(s)).toEqual([]);
  });

  it("a re-trace keeps every start, in order, and replaces every curve", () => {
    let s = resetTrajectories([P(1, 0), P(0, 1)], trace);
    s = addTrajectory(s, P(2, 2), trace);
    s = retraceTrajectories(s, tracer(7));
    expect(trajectoryStartsOf(s)).toEqual([P(1, 0), P(0, 1), P(2, 2)]);
    expect(trajectoriesOf(s).map((t) => t.steps)).toEqual([7, 7, 7, 7, 7, 7]);
    // A re-trace is not an action: the one add is still the only thing to undo.
    expect(s.history).toHaveLength(1);
  });

  it("reset drops the history: fresh seeds cannot undo into the previous equation's starts", () => {
    let s = addTrajectory(EMPTY_TRAJECTORY_STORE, P(1, 1), trace);
    s = resetTrajectories([], trace);
    expect(canUndo(s)).toBe(false);
    expect(undoTrajectory(s, trace)).toBe(s);
  });
});

describe("trajectory store: add / delete / clear / undo", () => {
  it("the curves are the pairs in start order: entry i at positions 2i and 2i + 1", () => {
    let s = addTrajectory(EMPTY_TRAJECTORY_STORE, P(0, 0), trace);
    s = addTrajectory(s, P(5, 5), trace);
    const curves = trajectoriesOf(s);
    expect(curves).toHaveLength(4);
    expect(curves[2].points[0]).toEqual(P(5, 5));
    expect(curves[3].direction).toBe("backward");
  });

  it("delete removes exactly the pair at the index; out of range changes nothing", () => {
    let s = resetTrajectories([P(0, 0), P(1, 0), P(2, 0)], trace);
    s = deleteTrajectory(s, 1);
    expect(trajectoryStartsOf(s)).toEqual([P(0, 0), P(2, 0)]);
    expect(trajectoriesOf(s)).toHaveLength(4);
    expect(deleteTrajectory(s, 5)).toBe(s);
    expect(deleteTrajectory(s, -1)).toBe(s);
  });

  it("undo of an add removes it; undo of a delete restores the start at its OLD index, re-traced", () => {
    let s = resetTrajectories([P(0, 0), P(1, 0), P(2, 0)], trace);
    s = deleteTrajectory(s, 1);
    s = addTrajectory(s, P(9, 9), trace);
    s = undoTrajectory(s, tracer(3));
    expect(trajectoryStartsOf(s)).toEqual([P(0, 0), P(2, 0)]);
    s = undoTrajectory(s, tracer(3));
    expect(trajectoryStartsOf(s)).toEqual([P(0, 0), P(1, 0), P(2, 0)]);
    // The restored pair was traced by the tracer handed to undo (generation 3), the others untouched (1).
    expect(trajectoriesOf(s).map((t) => t.steps)).toEqual([1, 1, 3, 3, 1, 1]);
    expect(canUndo(s)).toBe(false);
  });

  it("clear is ONE undoable action that restores every start in order", () => {
    let s = resetTrajectories([P(0, 0), P(1, 0)], trace);
    s = addTrajectory(s, P(2, 0), trace);
    s = clearTrajectories(s);
    expect(trajectoriesOf(s)).toEqual([]);
    expect(s.history).toHaveLength(2);
    s = undoTrajectory(s, trace);
    expect(trajectoryStartsOf(s)).toEqual([P(0, 0), P(1, 0), P(2, 0)]);
    expect(s.history).toHaveLength(1);
    // Clearing an empty store records nothing.
    expect(clearTrajectories(EMPTY_TRAJECTORY_STORE)).toBe(EMPTY_TRAJECTORY_STORE);
  });

  it("keeps the last HISTORY_LIMIT actions (at least 10) and forgets the oldest", () => {
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(10);
    let s = EMPTY_TRAJECTORY_STORE;
    for (let i = 0; i < 5; i++) s = addTrajectory(s, P(i, 0), trace);
    // HISTORY_LIMIT more actions without ever exceeding the curve cap (round R): add a sixth start, delete it again.
    for (let i = 0; i < HISTORY_LIMIT / 2; i++) s = deleteTrajectory(addTrajectory(s, P(9, 9), trace), 5);
    expect(s.history).toHaveLength(HISTORY_LIMIT);
    // Undoing everything that is remembered leaves the 5 forgotten adds in place.
    for (let i = 0; i < HISTORY_LIMIT; i++) s = undoTrajectory(s, trace);
    expect(trajectoryStartsOf(s)).toEqual([0, 1, 2, 3, 4].map((x) => P(x, 0)));
    expect(canUndo(s)).toBe(false);
  });
});

describe("[R] trajectory store: at most MAX_TRAJECTORIES kept curves", () => {
  it("the 21st add is refused: the store is returned unchanged, with no history entry; a delete makes room again", () => {
    let store = EMPTY_TRAJECTORY_STORE;
    for (let i = 0; i < MAX_TRAJECTORIES; i++) store = addTrajectory(store, P(i, 0), trace);
    expect(store.entries).toHaveLength(MAX_TRAJECTORIES);
    expect(atCapacity(store)).toBe(true);
    const refused = addTrajectory(store, P(99, 99), trace);
    expect(refused).toBe(store);
    expect(trajectoryStartsOf(refused)).not.toContainEqual(P(99, 99));
    const room = deleteTrajectory(store, 0);
    expect(atCapacity(room)).toBe(false);
    expect(trajectoryStartsOf(addTrajectory(room, P(99, 99), trace))).toHaveLength(MAX_TRAJECTORIES);
    // The cap and a link's limit are the same number (lib/url-state reads it here).
    expect(MAX_TRAJECTORIES).toBe(20);
  });

  it("reset and undo are not capped by the add rule (a link's 20 starts, an undone clear) but never exceed it in practice", () => {
    const starts = Array.from({ length: MAX_TRAJECTORIES }, (_, i) => P(i, i));
    const full = resetTrajectories(starts, trace);
    expect(atCapacity(full)).toBe(true);
    const restored = undoTrajectory(clearTrajectories(full), trace);
    expect(restored.entries).toHaveLength(MAX_TRAJECTORIES);
    expect(atCapacity(restored)).toBe(true);
  });
});
