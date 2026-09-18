/**
 * When the expensive results are recomputed while a parameter slider is dragged (round U).
 *
 * A drag is a stream of parameter values. The field and the kept curves are recomputed for every
 * one of them (well under a millisecond and a few milliseconds). The FEATURES (equilibria and their
 * classification, constant solutions, the equation type) cost more, and how much depends on the
 * equation: about 6 ms for the logistic equation, 12 ms for the damped oscillator, 20 ms for
 * Lotka-Volterra, up to a second for a system with many sign changes. So the policy is decided by
 * what the last computation actually cost:
 * - cheap (at most FEATURE_SYNC_BUDGET_MS): recomputed for every value, so the classification line
 *   and the equilibrium's marker follow the slider continuously. This is what makes the passage
 *   from a stable spiral to a stable node at b = w visible while dragging.
 * - expensive: debounced. The last results stay on screen, marked as being recomputed, and the new
 *   ones are computed FEATURE_DEBOUNCE_MS after the slider last moved. Letting go of the slider
 *   computes at once.
 * Outside a drag nothing is deferred: a typed value is computed when it is typed, as before.
 *
 * Pure: the clock is an argument. The hook owns the timer; this module owns the decisions, so the
 * debounce and the "computing" flag are testable without React.
 */

/** A features computation at most this long is repeated for every slider value (about 40 updates a second with the field and the curves). */
export const FEATURE_SYNC_BUDGET_MS = 25;

export type FeaturePolicy = "sync" | "debounce";

/** `lastCostMs`: what the previous features computation took; null before the first one (nothing is known: compute). */
export function featurePolicy(dragging: boolean, lastCostMs: number | null): FeaturePolicy {
  return dragging && lastCostMs !== null && lastCostMs > FEATURE_SYNC_BUDGET_MS ? "debounce" : "sync";
}

/**
 * A debounced value: `applied` is what the results on screen were computed for, `pending` the
 * newest request that differs from it, due at `dueAt`. Keys are compared by identity (===).
 */
export type Deferred<K> = { applied: K; pending: { key: K; dueAt: number } | null };

export function deferredOf<K>(key: K): Deferred<K> {
  return { applied: key, pending: null };
}

/**
 * A new request at time `now`: it replaces any pending one and restarts the delay (a debounce, not
 * a throttle: while the slider keeps moving nothing is computed). A request for what is already
 * applied cancels the pending one (the slider came back).
 */
export function requestDeferred<K>(state: Deferred<K>, key: K, now: number, delayMs: number): Deferred<K> {
  if (key === state.applied) return state.pending === null ? state : { applied: state.applied, pending: null };
  if (state.pending?.key === key) return state;
  return { applied: state.applied, pending: { key, dueAt: now + delayMs } };
}

/** At time `now`: a pending request that is due becomes the applied one; otherwise nothing changes. */
export function flushDeferred<K>(state: Deferred<K>, now: number): Deferred<K> {
  return state.pending !== null && now >= state.pending.dueAt ? { applied: state.pending.key, pending: null } : state;
}

/** The results on screen belong to an older request: the shell says "computing". */
export function isStale<K>(state: Deferred<K>): boolean {
  return state.pending !== null;
}
