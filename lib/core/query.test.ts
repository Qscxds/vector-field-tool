import { describe, expect, it } from "vitest";
import { compileSystem } from "./parse";
import { querySolution, timeUncertainty, TOLERANCE_SAFETY } from "./query";
import type { Box } from "./types";

/** The shells' stop box for a [-3, 3]² problem: 20 times the entered range (lib/interactive fixedStopBox). */
const STOP: Box = { x: { min: -60, max: 60 }, y: { min: -60, max: 60 } };
const exponential = compileSystem({ f: "1", g: "y", variables: "ty" });
const harmonic = compileSystem({ f: "y", g: "-x" });

describe("querySolution: a time-dependent system starting at rest", () => {
  it("x' = 0, y' = t from (0, 0) reaches y = 1/2 at t = 1 and t = -1", () => {
    // y(t) = integral_0^t s ds = t^2 / 2, even though the initial velocity is zero.
    const sys = compileSystem({ f: "0", g: "t" });
    for (const value of [1, -1]) {
      const r = querySolution(sys, { x: 0, y: 0 }, { kind: "time", value }, { tSpan: 1, stopBox: STOP });
      expect(r.note).toBe("ok");
      expect(r.reached).toBe(true);
      expect(r.forward.status).toBe("completed");
      expect(r.backward.status).toBe("completed");
      expect(r.hits).toHaveLength(1);
      expect(r.hits[0].t).toBe(value);
      expect(r.hits[0].x).toBe(0);
      expect(r.hits[0].y).toBeCloseTo(0.5, 12);
    }
  });
});

describe("querySolution: coordinate targets (kind x / y) of first-order equations", () => {
  it("dy/dt = y from (0, 1): t = 2 gives y = e^2, y = 2 gives t = ln 2", () => {
    // The reduced system is t' = 1, y' = y, so the horizontal coordinate x IS the student's t and
    // the solution is y = e^t. Forward it leaves the stop box at y = 60 (t = ln 60 = 4.09 < 10):
    // left_box; backward y -> 0 while the speed stays >= 1 (t' = 1): completed at t = -10.
    const r = querySolution(exponential, { x: 0, y: 1 }, { kind: "x", value: 2 }, { tSpan: 10, stopBox: STOP });
    expect(r.note).toBe("ok");
    expect(r.reached).toBe(true);
    expect(r.hits).toHaveLength(1);
    const [h] = r.hits;
    expect(h.t).toBeCloseTo(2, 9);
    expect(h.x).toBeCloseTo(2, 9);
    expect(Math.abs(h.y - Math.E ** 2) / Math.E ** 2).toBeLessThan(1e-5);
    // The estimate is honest for this smooth, mildly expanding problem: the true error is inside it.
    expect(Math.abs(h.y - 7.38905609893065)).toBeLessThanOrEqual(h.error.position);
    expect(h.error.position).toBeGreaterThanOrEqual(TOLERANCE_SAFETY * 1e-6 * 7.389);
    expect(r.forward.status).toBe("left_box");
    // The exit is the LINEAR cut of the last accepted segment (integrate.ts): for y = e^t over a
    // step h the chord meets y = 60 up to h²/8 too early in t (second-order interpolation error,
    // y''/y' = 1); the controller's step for y' = y at rtol 1e-6 is about 0.3, so within 0.02.
    expect(Math.abs(r.forward.tEnd - Math.log(60))).toBeLessThan(0.02);
    expect(r.backward.status).toBe("completed");
    expect(r.backward.tEnd).toBe(-10);

    const s = querySolution(exponential, { x: 0, y: 1 }, { kind: "y", value: 2 }, { tSpan: 10, stopBox: STOP });
    expect(s.note).toBe("ok");
    expect(s.hits).toHaveLength(1);
    // y = e^t = 2 at t = ln 2 = 0.6931471805599453; the horizontal coordinate is t.
    expect(Math.abs(s.hits[0].x - 0.6931471805599453)).toBeLessThan(1e-6);
    expect(s.hits[0].y).toBeCloseTo(2, 6);
    expect(s.hits[0].error.t).toBeLessThanOrEqual(1e-11);
  });

  it("logistic dy/dt = y(1 - y) from (0, 0.1) reaches y = 0.5 at t = ln 9", () => {
    // y(t) = 1 / (1 + 9 e^-t): y = 1/2 when 9 e^-t = 1, t = ln 9 = 2.1972245773362196. Backward
    // y decreases toward 0 and never reaches 1/2; forward completes the span (t' = 1 keeps the
    // speed at least 1, so no equilibrium stop).
    const logistic = compileSystem({ f: "1", g: "y*(1 - y)", variables: "ty" });
    const r = querySolution(logistic, { x: 0, y: 0.1 }, { kind: "y", value: 0.5 }, { tSpan: 10, stopBox: STOP });
    expect(r.note).toBe("ok");
    expect(r.hits).toHaveLength(1);
    expect(Math.abs(r.hits[0].x - 2.1972245773362196)).toBeLessThan(1e-6);
    expect(r.forward.status).toBe("completed");
    expect(r.backward.status).toBe("completed");
  });

  it("dy/dt = y^2 from (0, 1): t = 2 is never reached; the solution 1/(1 - t) stops just below t = 1", () => {
    // Case A, the shells' box: y = 1/(1 - t) reaches the stop box's y = 60 at t = 59/60 = 0.98333,
    // status left_box; the exit is cut inside the last accepted step, which the stability cap keeps
    // below (1 - t)/2 < 0.01.
    const y2 = compileSystem({ f: "1", g: "y^2", variables: "ty" });
    const a = querySolution(y2, { x: 0, y: 1 }, { kind: "x", value: 2 }, { tSpan: 2, stopBox: STOP });
    expect(a.note).toBe("not_reached_in_span");
    expect(a.reached).toBe(false);
    expect(a.hits).toEqual([]);
    expect(a.forward.status).toBe("left_box");
    expect(a.forward.tEnd).toBeLessThan(1);
    expect(Math.abs(a.forward.tEnd - 59 / 60)).toBeLessThan(0.01);
    // Case B, the blow-up seen by the integrator itself. With any box the exit comes first (the
    // position bound is 1e6 x the box extent), so the box is made huge and the span long: on
    // [-1e9, 1e9]² with tSpan 1000 the reference speed is max(sqrt 2, 2e9 / 1000) = 2e6 (the start
    // speed sqrt 2 is above the equilibrium threshold 1e-8 x 2e6, so the run starts), the smallest
    // step is hMin = 1000 x 1e-12 = 1e-9, and the controller's step near the pole is a fraction
    // kappa ~ 0.1 of (1 - t) (self-similar error control), so the step collapses below hMin at
    // 1 - t ~ 1e-8, i.e. y ~ 1e8, before y reaches the box edge 1e9. integrate.ts then classifies
    // the stall: the field y² ~ 1e16 exceeds 1e3 x the reference speed 2e6, so the status is
    // 'singular' (not blew_up, which needs the POSITION to pass 1e15; not max_steps, reserved for
    // a finite field). tEnd is within 1e-8 x a few of 1: asserted within 0.01 as the brief asks.
    const big: Box = { x: { min: -1e9, max: 1e9 }, y: { min: -1e9, max: 1e9 } };
    const b = querySolution(y2, { x: 0, y: 1 }, { kind: "x", value: 2 }, { tSpan: 1000, stopBox: big });
    expect(b.note).toBe("not_reached_in_span");
    expect(b.forward.status).toBe("singular");
    expect(Math.abs(b.forward.tEnd - 1)).toBeLessThan(0.01);
  });

  it("dy/dt = -y from (0, 1) never reaches y = -1: not_reached_in_span, forward completed, backward left the box", () => {
    // y = e^-t > 0 for every t. Forward the speed hypot(1, e^-t) stays >= 1 (t' = 1), so the
    // equilibrium test never fires: completed at t = 20. Backward y = e^-t grows and leaves the
    // box at y = 60, t = -ln 60 = -4.094.
    const decay = compileSystem({ f: "1", g: "-y", variables: "ty" });
    const r = querySolution(decay, { x: 0, y: 1 }, { kind: "y", value: -1 }, { tSpan: 20, stopBox: STOP });
    expect(r.note).toBe("not_reached_in_span");
    expect(r.hits).toEqual([]);
    expect(r.forward.status).toBe("completed");
    expect(r.forward.tEnd).toBe(20);
    expect(r.backward.status).toBe("left_box");
    // Linear cut of the last segment: within h²/8 of the true exit time, h ~ 0.3 (see the first test).
    expect(Math.abs(r.backward.tEnd + Math.log(60))).toBeLessThan(0.02);
  });
});

describe("querySolution: a planar system", () => {
  it("harmonic x' = y, y' = -x from (1, 0): x = 0 at t = pi/2 + k pi, three hits each way, possibly more beyond the span", () => {
    // x = cos t, y = -sin t. Forward within tSpan 10: pi/2, 3pi/2, 5pi/2 (7pi/2 = 11 > 10);
    // backward -pi/2, -3pi/2, -5pi/2. Both directions complete the span (the speed is 1 on the
    // circle), and three crossings in a completed direction mean more may lie beyond it.
    const r = querySolution(harmonic, { x: 1, y: 0 }, { kind: "x", value: 0 }, { tSpan: 10, stopBox: STOP });
    expect(r.note).toBe("possibly_more_beyond_span");
    expect(r.forward.status).toBe("completed");
    expect(r.backward.status).toBe("completed");
    expect(r.hits).toHaveLength(6);
    const expected = [-5, -3, -1, 1, 3, 5].map((k) => (k * Math.PI) / 2);
    r.hits.forEach((h, i) => {
      expect(Math.abs(h.t - expected[i]), `hit ${i}`).toBeLessThan(1e-6);
      expect(Math.abs(h.x), `hit ${i} x`).toBeLessThan(1e-6);
      // y = -sin t = -(-1)^k at t = (2k + 1) pi / 2 (k from the index): +1, -1, +1, -1, +1, -1 here.
      expect(h.y, `hit ${i} y`).toBeCloseTo(i % 2 === 0 ? 1 : -1, 5);
      expect(h.error.t).toBeLessThanOrEqual(1e-11);
      expect(h.error.position).toBeGreaterThan(0);
      // The speed on the unit circle is |(y, -x)| = 1 (Phase O.0c: `speed` is |F| at the hit).
      expect(h.speed, `hit ${i} speed`).toBeCloseTo(1, 5);
      // So the time is displayed to the position uncertainty (~1e-5), not the Brent bracket.
      expect(timeUncertainty(h)).toBeGreaterThanOrEqual(h.error.position / h.speed);
      expect(timeUncertainty(h)).toBeGreaterThan(1e-7);
    });
    for (let i = 1; i < 3; i++) expect(Math.abs(r.hits[3 + i].t - r.hits[3 + i - 1].t - Math.PI)).toBeLessThan(1e-6);
  });

  it("a stored point exactly on the target counts as a hit: from (0, 1) the start itself has x = 0", () => {
    // x = sin t: crossings at k pi; the start (t = 0) is a stored point with x exactly 0 and is
    // listed once (from the forward direction) with zero errors, so seven hits in all.
    const r = querySolution(harmonic, { x: 0, y: 1 }, { kind: "x", value: 0 }, { tSpan: 10, stopBox: STOP });
    expect(r.hits).toHaveLength(7);
    expect(r.hits[3]).toMatchObject({ t: 0, x: 0, y: 1, error: { t: 0 } });
    expect(r.note).toBe("possibly_more_beyond_span");
    expect(Math.abs(r.hits[4].t - Math.PI)).toBeLessThan(1e-6);
    // Only the start: x' = 0, y' = 1 from (0, 0) never leaves x = 0 except... it stays on it: every
    // stored point has x = 0 exactly, so the answer is the whole polyline; the note says the start
    // is a hit only when it is the sole one, which a one-step case shows with y as the target.
    const up = compileSystem({ f: "0", g: "1" });
    const only = querySolution(up, { x: 0, y: 0 }, { kind: "y", value: 0 }, { tSpan: 1, stopBox: STOP });
    expect(only.hits).toHaveLength(1);
    expect(only.note).toBe("target_is_start");
  });

  it("kind time: pi maps (1, 0) to (-1, 0); beyond the reach it is stopped_before_target with the stop time", () => {
    const r = querySolution(harmonic, { x: 1, y: 0 }, { kind: "time", value: Math.PI }, { tSpan: 10, stopBox: STOP });
    expect(r.note).toBe("ok");
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0].t).toBe(Math.PI);
    expect(Math.abs(r.hits[0].x + 1)).toBeLessThan(1e-6);
    expect(Math.abs(r.hits[0].y)).toBeLessThan(1e-6);
    expect(r.hits[0].error.t).toBe(0);
    expect(r.hits[0].error.position).toBeCloseTo(TOLERANCE_SAFETY * (1e-9 + 1e-6 * Math.hypot(r.hits[0].x, r.hits[0].y)), 12);
    // A prescribed time carries no time uncertainty at all, whatever the speed (1 at (-1, 0)).
    expect(r.hits[0].speed).toBeCloseTo(1, 5);
    expect(timeUncertainty(r.hits[0])).toBe(0);
    // t* = 15 with tSpan 10: the forward run completed at exactly t = 10 and never got there.
    const far = querySolution(harmonic, { x: 1, y: 0 }, { kind: "time", value: 15 }, { tSpan: 10, stopBox: STOP });
    expect(far.note).toBe("stopped_before_target");
    expect(far.hits).toEqual([]);
    expect(far.reached).toBe(false);
    expect(far.forward.status).toBe("completed");
    expect(far.forward.tEnd).toBe(10);
    // A genuine stop: dy/dt = y² leaves the box at t = 59/60 (see above), so t = 1.5 is unreachable.
    const y2 = compileSystem({ f: "1", g: "y^2", variables: "ty" });
    const stopped = querySolution(y2, { x: 0, y: 1 }, { kind: "time", value: 1.5 }, { tSpan: 2, stopBox: STOP });
    expect(stopped.note).toBe("stopped_before_target");
    expect(stopped.forward.status).toBe("left_box");
    expect(Math.abs(stopped.forward.tEnd - 59 / 60)).toBeLessThan(0.01);
    // Backward with t0: from t0 = 2, t* = 2 - pi/2 maps (1, 0) to (cos(-pi/2), -sin(-pi/2)) = (0, 1).
    const back = querySolution(harmonic, { x: 1, y: 0 }, { kind: "time", value: 2 - Math.PI / 2 }, { tSpan: 10, stopBox: STOP, t0: 2 });
    expect(back.note).toBe("ok");
    expect(Math.abs(back.hits[0].x)).toBeLessThan(1e-6);
    expect(Math.abs(back.hits[0].y - 1)).toBeLessThan(1e-6);
    // t* = t0: the start itself.
    const same = querySolution(harmonic, { x: 1, y: 0 }, { kind: "time", value: 2 }, { tSpan: 10, stopBox: STOP, t0: 2 });
    expect(same.note).toBe("target_is_start");
    expect(same.hits[0]).toMatchObject({ t: 2, x: 1, y: 0 });
  });

  it("rejects a non-finite target value and a bad span", () => {
    expect(() => querySolution(harmonic, { x: 1, y: 0 }, { kind: "x", value: NaN }, { tSpan: 1, stopBox: STOP })).toThrow(RangeError);
    expect(() => querySolution(harmonic, { x: 1, y: 0 }, { kind: "x", value: 0 }, { tSpan: 0, stopBox: STOP })).toThrow(RangeError);
  });
});

describe("timeUncertainty (Phase O.0c: the time a student may trust)", () => {
  const hit = (t: number, position: number, speed: number) => ({ error: { t, position }, speed });

  it("a solved crossing: max(bracket, position error / speed); the bracket alone would overstate the digits", () => {
    // Position ±1e-5 along a curve traversed at speed 1 fixes the time to ±1e-5, not to the 1e-11 bracket.
    expect(timeUncertainty(hit(1e-11, 1e-5, 1))).toBe(1e-5);
    // At speed 2 the same position error is ±5e-6 in time.
    expect(timeUncertainty(hit(1e-11, 1e-5, 2))).toBe(5e-6);
    // A bracket wider than the quotient (speed 1e6: 1e-11 in time) stays the bracket.
    expect(timeUncertainty(hit(1e-9, 1e-5, 1e6))).toBe(1e-9);
  });

  it("a prescribed time (error.t 0) has none; a zero or non-finite speed keeps the bracket", () => {
    expect(timeUncertainty(hit(0, 1e-5, 1))).toBe(0);
    expect(timeUncertainty(hit(1e-11, 1e-5, 0))).toBe(1e-11);
    expect(timeUncertainty(hit(1e-11, 1e-5, Number.NaN))).toBe(1e-11);
    expect(timeUncertainty(hit(1e-11, 1e-5, Number.POSITIVE_INFINITY))).toBe(1e-11);
  });
});
