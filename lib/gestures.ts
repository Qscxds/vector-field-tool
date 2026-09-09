/**
 * Touch gesture state machine (pure, no React, no DOM, no clock: every event carries its time).
 *
 * The canvas feeds touch pointer events in and gets back a list of actions to dispatch to its
 * callbacks. Mouse events never come here (the mouse path of the canvas is unchanged).
 *
 * Gestures: one-finger pan; two-finger pinch (distance ratio -> zoom about the midpoint, and the
 * midpoint's motion -> pan); a short tap without movement (preview); two taps within
 * DOUBLE_TAP_MS and DOUBLE_TAP_PX (reset); a hold of LONG_PRESS_MS with less than TAP_MOVE_PX of
 * movement (keep; the release is then not a tap). Lifting one of two fingers ends the pinch and
 * the remaining finger does nothing until it is lifted too.
 */
import type { Vec2 } from "@/lib/core/types";

export const TAP_MOVE_PX = 8;
export const LONG_PRESS_MS = 500;
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_PX = 30;

export type GestureEvent =
  | { type: "down"; id: number; x: number; y: number; t: number }
  | { type: "move"; id: number; x: number; y: number; t: number }
  | { type: "up"; id: number; x: number; y: number; t: number }
  | { type: "cancel"; id: number; t: number }
  /** Timer check: fires the long press when the first finger has been held long enough. */
  | { type: "tick"; t: number };

export type GestureAction =
  | { type: "pan"; dx: number; dy: number }
  | { type: "pinch"; center: Vec2; factor: number }
  | { type: "tap"; at: Vec2 }
  | { type: "doubleTap"; at: Vec2 }
  | { type: "longPress"; at: Vec2 };

export type GesturePhase =
  /** No finger down. */
  | "idle"
  /** One finger down, not yet moved: may become a tap, a long press or a pan. */
  | "press"
  | "pan"
  | "pinch"
  /** A gesture finished (long press fired, or a pinch lost a finger); wait for every finger to lift. */
  | "spent";

export type GestureState = {
  phase: GesturePhase;
  /** Fingers currently down, in the order they touched. */
  pointers: ReadonlyArray<{ id: number; x: number; y: number }>;
  /** Where and when the first finger touched (press / pan / spent). */
  origin: { x: number; y: number; t: number } | null;
  /** Last position of the panning finger. */
  last: { x: number; y: number } | null;
  /** The previous tap, for double-tap detection. */
  lastTap: { x: number; y: number; t: number } | null;
  /** Finger distance at the last pinch step. */
  pinchDistance: number | null;
  /** Midpoint at the last pinch step. */
  pinchCenter: Vec2 | null;
};

export const IDLE_GESTURE: GestureState = {
  phase: "idle",
  pointers: [],
  origin: null,
  last: null,
  lastTap: null,
  pinchDistance: null,
  pinchCenter: null,
};

/** When the long-press timer should fire for the current state, or null when no press is pending. */
export function longPressDueAt(state: GestureState): number | null {
  return state.phase === "press" && state.origin ? state.origin.t + LONG_PRESS_MS : null;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function withoutPointer(state: GestureState, id: number): GestureState["pointers"] {
  return state.pointers.filter((p) => p.id !== id);
}

/** Every finger lifted: back to idle, keeping only the last-tap memory. */
function settle(state: GestureState, pointers: GestureState["pointers"], lastTap = state.lastTap): GestureState {
  if (pointers.length === 0) return { ...IDLE_GESTURE, lastTap };
  return { ...state, pointers, phase: "spent", origin: null, last: null, pinchDistance: null, pinchCenter: null, lastTap };
}

export function reduceGesture(state: GestureState, event: GestureEvent): { state: GestureState; actions: GestureAction[] } {
  switch (event.type) {
    case "down": {
      if (state.pointers.some((p) => p.id === event.id)) return { state, actions: [] };
      const pointers = [...state.pointers, { id: event.id, x: event.x, y: event.y }];
      if (pointers.length === 1) {
        return {
          state: { ...state, phase: "press", pointers, origin: { x: event.x, y: event.y, t: event.t }, last: { x: event.x, y: event.y }, pinchDistance: null, pinchCenter: null },
          actions: [],
        };
      }
      if (pointers.length === 2 && state.phase !== "spent") {
        const [a, b] = pointers;
        return {
          state: { ...state, phase: "pinch", pointers, origin: null, last: null, pinchDistance: distance(a, b), pinchCenter: midpoint(a, b) },
          actions: [],
        };
      }
      // A third finger, or a finger after a spent gesture: tracked so the release is clean, nothing else.
      return { state: { ...state, pointers, phase: state.phase === "spent" ? "spent" : state.phase }, actions: [] };
    }

    case "move": {
      const index = state.pointers.findIndex((p) => p.id === event.id);
      if (index < 0) return { state, actions: [] };
      const pointers = state.pointers.map((p, i) => (i === index ? { ...p, x: event.x, y: event.y } : p));
      if (state.phase === "pinch" && index < 2 && pointers.length >= 2 && state.pinchDistance !== null && state.pinchCenter) {
        const [a, b] = pointers;
        const d = distance(a, b);
        const center = midpoint(a, b);
        const actions: GestureAction[] = [];
        const dx = center.x - state.pinchCenter.x;
        const dy = center.y - state.pinchCenter.y;
        if (dx !== 0 || dy !== 0) actions.push({ type: "pan", dx, dy });
        if (state.pinchDistance > 0 && d > 0 && d !== state.pinchDistance) actions.push({ type: "pinch", center, factor: d / state.pinchDistance });
        return { state: { ...state, pointers, pinchDistance: d, pinchCenter: center }, actions };
      }
      if ((state.phase === "press" || state.phase === "pan") && index === 0 && state.origin && state.last) {
        const moved = state.phase === "pan" || distance(state.origin, event) >= TAP_MOVE_PX;
        if (!moved) return { state: { ...state, pointers }, actions: [] };
        const dx = event.x - state.last.x;
        const dy = event.y - state.last.y;
        return { state: { ...state, pointers, phase: "pan", last: { x: event.x, y: event.y } }, actions: dx !== 0 || dy !== 0 ? [{ type: "pan", dx, dy }] : [] };
      }
      return { state: { ...state, pointers }, actions: [] };
    }

    case "up": {
      if (!state.pointers.some((p) => p.id === event.id)) return { state, actions: [] };
      const pointers = withoutPointer(state, event.id);
      if (state.phase === "press" && state.origin && state.pointers[0]?.id === event.id) {
        const at = { x: event.x, y: event.y };
        const moved = distance(state.origin, at) >= TAP_MOVE_PX;
        if (moved) return { state: settle(state, pointers), actions: [] };
        const prev = state.lastTap;
        if (prev && event.t - prev.t <= DOUBLE_TAP_MS && distance(prev, at) <= DOUBLE_TAP_PX) {
          return { state: settle(state, pointers, null), actions: [{ type: "doubleTap", at }] };
        }
        return { state: settle(state, pointers, { x: at.x, y: at.y, t: event.t }), actions: [{ type: "tap", at }] };
      }
      // A pan end, a pinch losing a finger, or a spent gesture: no action; the rest of the
      // fingers do nothing until they lift too.
      return { state: settle(state, pointers), actions: [] };
    }

    case "cancel": {
      const pointers = withoutPointer(state, event.id);
      return { state: settle(state, pointers), actions: [] };
    }

    case "tick": {
      const due = longPressDueAt(state);
      if (due === null || event.t < due || !state.origin) return { state, actions: [] };
      const at = { x: state.origin.x, y: state.origin.y };
      return { state: { ...state, phase: "spent", origin: null, last: null, lastTap: null }, actions: [{ type: "longPress", at }] };
    }
  }
}
