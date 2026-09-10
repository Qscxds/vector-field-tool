/**
 * The kept ("fixed") trajectories of an interactive shell as one pure value: the START points in
 * order, each with its traced pair (forward + backward), and an undo history of the add / delete /
 * clear actions. The hook (useInteractiveScene) owns one store; the starts are the single source
 * of truth for the link's `traj` parameter, the curves are derived from them by the injected
 * `trace` (traceFixed with the current system, home box and snapshot time), so a system change
 * re-traces the same starts and an undo re-traces the restored start.
 *
 * No React, no DOM, no clock: every function returns a new store.
 */
import type { Vec2 } from "@/lib/core/types";
import type { TrajectoryView } from "@/lib/scene";

/** How a start is turned into its drawn curves (the pair forward + backward). */
export type TraceFn = (start: Vec2) => TrajectoryView[];

export type TrajectoryEntry = { start: Vec2; curves: TrajectoryView[] };

/** One undoable action; undoing it restores the previous starts, re-traced. */
export type TrajectoryAction =
  | { type: "add"; index: number; start: Vec2 }
  | { type: "delete"; index: number; start: Vec2 }
  | { type: "clear"; starts: Vec2[] };

export type TrajectoryStore = {
  entries: ReadonlyArray<TrajectoryEntry>;
  /** Oldest first; at most HISTORY_LIMIT entries (the oldest are forgotten). */
  history: ReadonlyArray<TrajectoryAction>;
};

/** Undo depth. */
export const HISTORY_LIMIT = 20;

export const EMPTY_TRAJECTORY_STORE: TrajectoryStore = { entries: [], history: [] };

function push(history: ReadonlyArray<TrajectoryAction>, action: TrajectoryAction): TrajectoryAction[] {
  const next = [...history, action];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

/** Fresh starts (a link's traj, a preset's starts, or nothing after an equation edit): traced, history dropped. */
export function resetTrajectories(starts: ReadonlyArray<Vec2>, trace: TraceFn): TrajectoryStore {
  return { entries: starts.map((start) => ({ start, curves: trace(start) })), history: [] };
}

/** The same starts under a new system / snapshot time: every curve re-traced, history kept. */
export function retraceTrajectories(store: TrajectoryStore, trace: TraceFn): TrajectoryStore {
  return { entries: store.entries.map((e) => ({ start: e.start, curves: trace(e.start) })), history: store.history };
}

/** A click on empty canvas or an "Add solution" input: appended at the end. */
export function addTrajectory(store: TrajectoryStore, start: Vec2, trace: TraceFn): TrajectoryStore {
  const index = store.entries.length;
  return {
    entries: [...store.entries, { start, curves: trace(start) }],
    history: push(store.history, { type: "add", index, start }),
  };
}

/** A click / long press on an existing curve: its pair removed; an index out of range changes nothing. */
export function deleteTrajectory(store: TrajectoryStore, index: number): TrajectoryStore {
  const entry = store.entries[index];
  if (!entry) return store;
  return {
    entries: store.entries.filter((_, i) => i !== index),
    history: push(store.history, { type: "delete", index, start: entry.start }),
  };
}

/** "Clear all" as ONE undoable action; clearing nothing changes nothing. */
export function clearTrajectories(store: TrajectoryStore): TrajectoryStore {
  if (store.entries.length === 0) return store;
  return { entries: [], history: push(store.history, { type: "clear", starts: store.entries.map((e) => e.start) }) };
}

export function canUndo(store: TrajectoryStore): boolean {
  return store.history.length > 0;
}

/**
 * Reverts the most recent action: an add removes the entry at its index, a delete puts the start
 * back at its old index re-traced, a clear restores every start in its old order. The history is
 * last-in first-out and every mutation records itself, so the index of the last action still
 * names the same slot. Nothing to undo: the store is returned unchanged.
 */
export function undoTrajectory(store: TrajectoryStore, trace: TraceFn): TrajectoryStore {
  const last = store.history[store.history.length - 1];
  if (!last) return store;
  const history = store.history.slice(0, -1);
  switch (last.type) {
    case "add":
      return { entries: store.entries.filter((_, i) => i !== last.index), history };
    case "delete": {
      const entries = [...store.entries];
      entries.splice(Math.min(last.index, entries.length), 0, { start: last.start, curves: trace(last.start) });
      return { entries, history };
    }
    case "clear":
      return { entries: last.starts.map((start) => ({ start, curves: trace(start) })), history };
  }
}

/** The starts in order (what the link encodes). */
export function trajectoryStartsOf(store: TrajectoryStore): Vec2[] {
  return store.entries.map((e) => e.start);
}

/** The drawn curves in order: the pair of entry i at positions 2i and 2i + 1 (when every trace yields a pair). */
export function trajectoriesOf(store: TrajectoryStore): TrajectoryView[] {
  return store.entries.flatMap((e) => e.curves);
}
