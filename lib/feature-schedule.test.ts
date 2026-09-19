/**
 * The slider's recomputation policy and its debounce as a state machine with an injected clock.
 * Expectations follow from the rules in feature-schedule.ts (a request restarts the delay; only the
 * newest request is ever applied; stale exactly while a request is pending), never from a run.
 */
import { describe, expect, it } from "vitest";
import { FEATURE_DEBOUNCE_MS } from "./interactive";
import { COLD_MEASUREMENTS, deferredOf, FEATURE_COLD_BUDGET_MS, FEATURE_SYNC_BUDGET_MS, featurePolicy, flushDeferred, isStale, requestDeferred } from "./feature-schedule";

describe("featurePolicy: what the last computation cost decides", () => {
  it("outside a drag nothing is ever deferred, whatever the cost", () => {
    expect(featurePolicy(false, null)).toBe("sync");
    expect(featurePolicy(false, 5)).toBe("sync");
    expect(featurePolicy(false, 900)).toBe("sync");
  });

  it("during a drag: cheap results follow every value, expensive ones are debounced; before any measurement, compute", () => {
    expect(featurePolicy(true, null)).toBe("sync");
    expect(FEATURE_SYNC_BUDGET_MS).toBe(50);
    expect(featurePolicy(true, 12)).toBe("sync");
    // a laptop half as fast as the development machine on Lotka-Volterra (21 ms there): still every value
    expect(featurePolicy(true, 42)).toBe("sync");
    expect(featurePolicy(true, FEATURE_SYNC_BUDGET_MS)).toBe("sync");
    expect(featurePolicy(true, FEATURE_SYNC_BUDGET_MS + 0.1)).toBe("debounce");
    expect(featurePolicy(true, 900)).toBe("debounce");
  });

  it("a page's first measurements are cold: they are judged against the lenient budget, so they cannot lock a cheap system into the debounce", () => {
    expect(FEATURE_COLD_BUDGET_MS).toBeGreaterThan(FEATURE_SYNC_BUDGET_MS);
    expect(COLD_MEASUREMENTS).toBe(3);
    // 120 ms cold (a slow laptop's first computations of the damped oscillator): still every value
    for (const n of [1, 2, 3]) expect(featurePolicy(true, 120, n)).toBe("sync");
    // the same 120 ms once the engine is warm is expensive
    expect(featurePolicy(true, 120, 4)).toBe("debounce");
    expect(featurePolicy(true, 120, 70)).toBe("debounce");
    // a system that really is expensive is debounced from its first measurement
    expect(featurePolicy(true, 1000, 1)).toBe("debounce");
    expect(featurePolicy(true, FEATURE_COLD_BUDGET_MS, 1)).toBe("sync");
    expect(featurePolicy(true, FEATURE_COLD_BUDGET_MS + 1, 1)).toBe("debounce");
  });
});

describe("the debounce: the last results stay, marked stale, until the slider has rested for the delay", () => {
  const A = { name: "A" };
  const B = { name: "B" };
  const C = { name: "C" };
  const D = FEATURE_DEBOUNCE_MS;

  it("uses the shells' existing 250 ms", () => {
    expect(D).toBe(250);
  });

  it("a request is pending (stale) until its delay has passed, then it is applied", () => {
    let s = deferredOf(A);
    expect(isStale(s)).toBe(false);
    s = requestDeferred(s, B, 1000, D);
    expect(s).toEqual({ applied: A, pending: { key: B, dueAt: 1250 } });
    expect(isStale(s)).toBe(true);
    expect(flushDeferred(s, 1249)).toBe(s);
    s = flushDeferred(s, 1250);
    expect(s).toEqual({ applied: B, pending: null });
    expect(isStale(s)).toBe(false);
  });

  it("while the slider keeps moving nothing is applied: every new value restarts the delay, and only the last one is ever computed", () => {
    let s = requestDeferred(deferredOf(A), B, 0, D);
    s = requestDeferred(s, C, 100, D);
    expect(s.pending).toEqual({ key: C, dueAt: 350 });
    // B's own due time passes: nothing happens, B was replaced
    s = flushDeferred(s, 250);
    expect(s.applied).toBe(A);
    expect(isStale(s)).toBe(true);
    s = flushDeferred(s, 350);
    expect(s.applied).toBe(C);
    expect(isStale(s)).toBe(false);
  });

  it("the slider coming back to the applied value cancels the pending request: nothing to recompute", () => {
    let s = requestDeferred(deferredOf(A), B, 0, D);
    s = requestDeferred(s, A, 50, D);
    expect(s).toEqual({ applied: A, pending: null });
    expect(flushDeferred(s, 10_000)).toBe(s);
  });

  it("a repeated request for the pending value keeps its due time; a request for the applied value with nothing pending is the same object", () => {
    const s = requestDeferred(deferredOf(A), B, 0, D);
    expect(requestDeferred(s, B, 200, D)).toBe(s);
    const idle = deferredOf(A);
    expect(requestDeferred(idle, A, 5, D)).toBe(idle);
  });

  it("keys are compared by identity: an equal-looking new object is a new request", () => {
    const s = requestDeferred(deferredOf(A), { name: "A" }, 0, D);
    expect(isStale(s)).toBe(true);
  });
});
