import { describe, expect, it } from "vitest";
import { integrateAdaptive, integrateRK4, type Trajectory } from "./integrate";
import { compileSystem } from "./parse";
import { toSystem } from "./slope-field";

const harmonic = compileSystem({ f: "y", g: "-x" });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const last = (tr: Trajectory) => tr.points[tr.points.length - 1];
const allFinite = (tr: Trajectory) => tr.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
const polylineLength = (tr: Trajectory, metric = dist) => tr.points.slice(1).reduce((s, p, i) => s + metric(tr.points[i], p), 0);
const TWO_PI = 2 * Math.PI;

describe.each([
  ["RK4", integrateRK4],
  ["adaptive", integrateAdaptive],
] as const)("%s: zero instantaneous speed in a time-dependent system", (_name, integrate) => {
  it("moves from rest in either time direction, including a nonzero start time", () => {
    // y' = t - t0, y(t0) = 0 gives y(t) = (t - t0)^2 / 2: both ends are 1/2.
    for (const t0 of [0, 2]) {
      const sys = compileSystem({ f: "0", g: `t - (${t0})` });
      for (const direction of [1, -1] as const) {
        const tr = integrate(sys, { x: 0, y: 0 }, 1, { t0, direction });
        expect(tr.status).toBe("completed");
        expect(tr.times.at(-1)).toBe(t0 + direction);
        expect(last(tr).x).toBe(0);
        expect(last(tr).y).toBeCloseTo(0.5, 12);
      }
    }
  });

  it("continues through an accepted zero-speed point in either direction", () => {
    // The first step lands exactly at t = t0 ± 1/4, where y' = 0. Integrating
    // y' = t - (t0 ± 1/4) over the full signed unit interval gives 1/2 - 1/4 = 1/4.
    for (const t0 of [0, 2]) {
      for (const direction of [1, -1] as const) {
        const zeroTime = t0 + direction / 4;
        const sys = compileSystem({ f: "0", g: `t - (${zeroTime})` });
        const tr = integrate(sys, { x: 0, y: 0 }, 1, { t0, direction, h: 0.25 });
        expect(tr.times[1]).toBe(zeroTime);
        expect(tr.status).toBe("completed");
        expect(tr.times.at(-1)).toBe(t0 + direction);
        expect(last(tr).y).toBeCloseTo(0.25, 12);
      }
    }
  });

  it("also recognizes time dependence in the first component", () => {
    const tr = integrate(compileSystem({ f: "t", g: "0" }), { x: 0, y: 0 }, 1);
    expect(tr.status).toBe("completed");
    expect(last(tr).x).toBeCloseTo(0.5, 12);
    expect(last(tr).y).toBe(0);
  });

  it("keeps the equilibrium stop for autonomous systems and the ty coordinate mode", () => {
    // In ty mode t is the horizontal state x, so this field stays zero at (0, 0).
    for (const sys of [harmonic, compileSystem({ f: "0", g: "t", variables: "ty" })]) {
      const tr = integrate(sys, { x: 0, y: 0 }, 1, { t0: 2 });
      expect(tr.status).toBe("reached_equilibrium");
      expect(tr.points).toEqual([{ x: 0, y: 0 }]);
      expect(tr.times).toEqual([2]);
      expect(tr.steps).toBe(0);
    }
  });
});

describe("integrateRK4 on the harmonic oscillator x'=y, y'=-x", () => {
  it("returns to the start after one period", () => {
    const tr = integrateRK4(harmonic, { x: 1, y: 0 }, TWO_PI, { h: 0.01 });
    expect(tr.status).toBe("completed");
    expect(tr.times[0]).toBe(0);
    expect(tr.times[tr.times.length - 1]).toBeCloseTo(TWO_PI, 12);
    expect(dist(last(tr), { x: 1, y: 0 })).toBeLessThan(1e-6);
  });

  it("converges at fourth order: halving h shrinks the end error about 16x", () => {
    // Exact solution after one period is the start point, so the end error is directly measurable.
    const errFor = (h: number) => dist(last(integrateRK4(harmonic, { x: 1, y: 0 }, TWO_PI, { h })), { x: 1, y: 0 });
    const e1 = errFor(TWO_PI / 64);
    const e2 = errFor(TWO_PI / 128);
    const ratio = e1 / e2;
    // A ratio near 2 or 4 would mean the scheme degenerated to first or second order.
    expect(ratio).toBeGreaterThan(12);
    expect(ratio).toBeLessThan(20);
  });

  it("keeps the energy x^2 + y^2 within 1e-4 relative drift up to t = 100 (and in fact within 1e-8)", () => {
    // For y' = i y one RK4 step multiplies the amplitude by |R(iθ)| with |R|^2 = 1 - θ^6/72 + θ^8/576,
    // θ = h = 0.01: relative energy change per step ~ 1.4e-14, times 1e4 steps ~ 1.4e-10.
    // A second-order scheme would drift by ~θ^4/... ~ 1e-8 per step -> 1e-4 over the run.
    const tr = integrateRK4(harmonic, { x: 1, y: 0 }, 100, { h: 0.01 });
    expect(tr.status).toBe("completed");
    const energies = tr.points.map((p) => p.x * p.x + p.y * p.y);
    const worst = Math.max(...energies.map((E) => Math.abs(E - 1)));
    expect(worst).toBeLessThan(1e-4);
    expect(worst).toBeLessThan(1e-8);
  });

  it("one step on x' = x reproduces the degree-4 Taylor polynomial exactly", () => {
    // RK4 applied to x' = x gives x1 = x0 (1 + h + h²/2 + h³/6 + h⁴/24). With h = 0.5:
    // 1 + 0.5 + 0.125 + 0.020833... + 0.002604... = 1.6484375.
    const tr = integrateRK4(compileSystem({ f: "x", g: "0" }), { x: 1, y: 0 }, 0.5, { h: 0.5 });
    expect(tr.steps).toBe(1);
    expect(tr.points[1].x).toBeCloseTo(1.6484375, 14);
  });

  it("a run that uses exactly maxSteps to reach tEnd is completed, not truncated", () => {
    const tr = integrateRK4(harmonic, { x: 1, y: 0 }, 1, { h: 0.01, maxSteps: 100 });
    expect(tr.status).toBe("completed");
    expect(tr.steps).toBe(100);
    expect(tr.times[tr.times.length - 1]).toBeCloseTo(1, 12);
  });

  it("integrates backward: forward 5 then backward 5 returns to the start", () => {
    const fwd = integrateRK4(harmonic, { x: 1, y: 0 }, 5, { h: 0.01 });
    const end = last(fwd);
    const back = integrateRK4(harmonic, end, 5, { h: 0.01, direction: -1, t0: 5 });
    expect(back.status).toBe("completed");
    expect(back.times[back.times.length - 1]).toBeCloseTo(0, 12);
    expect(dist(last(back), { x: 1, y: 0 })).toBeLessThan(1e-6);
    // times decrease when going backward
    expect(back.times[1]).toBeLessThan(back.times[0]);
  });

  it("stops after maxSteps with status max_steps", () => {
    const tr = integrateRK4(harmonic, { x: 1, y: 0 }, 1000, { h: 0.01, maxSteps: 100 });
    expect(tr.status).toBe("max_steps");
    expect(tr.points).toHaveLength(101);
    expect(tr.steps).toBe(100);
  });
});

describe("stop conditions", () => {
  it("reports finite-time blow-up of x' = x^2 without writing NaN", () => {
    // Exact solution x(t) = 1/(1-t) blows up at t = 1. The position bound is 1e6 (scale 1), reached
    // at t = 1 - 1e-6; a correct integrator must get well past 0.9 before it may stop.
    const tr = integrateRK4(compileSystem({ f: "x^2", g: "0" }), { x: 1, y: 0 }, 2, { h: 0.01 });
    expect(tr.status).toBe("blew_up");
    expect(allFinite(tr)).toBe(true);
    const tLast = tr.times[tr.times.length - 1];
    expect(tLast).toBeLessThan(1.01);
    expect(tLast).toBeGreaterThan(0.9);
    expect(last(tr).x).toBeGreaterThan(9); // x(0.9) = 10
    expect(last(tr).x).toBeLessThanOrEqual(1e6); // the offending point is never written
  });

  it("stops when leaving the box, with the exit point cut exactly onto the border", () => {
    // x = t exits at x = 1, t = 1; neither the point nor the time may depend on the step size.
    const box = { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } };
    const tr = integrateRK4(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, 10, { h: 0.01, box });
    expect(tr.status).toBe("left_box");
    expect(last(tr).x).toBeCloseTo(1, 9);
    expect(tr.times[tr.times.length - 1]).toBeCloseTo(1, 9);
    expect(tr.points.length).toBeGreaterThan(99);
    expect(tr.points.length).toBeLessThan(104);
    // the adaptive integrator takes steps up to tSpan/4 = 2.5 here and must land on the same border point
    const ad = integrateAdaptive(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, 10, { box });
    expect(ad.status).toBe("left_box");
    expect(last(ad).x).toBeCloseTo(1, 9);
    expect(ad.times[ad.times.length - 1]).toBeCloseTo(1, 9);
    // a diagonal exit hits the first violated edge: from (0, 0.5) with velocity (1, 1) the top edge y = 1 comes first, at t = 0.5
    const diag = integrateAdaptive(compileSystem({ f: "1", g: "1" }), { x: 0, y: 0.5 }, 10, { box });
    expect(diag.status).toBe("left_box");
    expect(last(diag).y).toBeCloseTo(1, 9);
    expect(last(diag).x).toBeCloseTo(0.5, 9);
  });

  it("detects arrival at an equilibrium", () => {
    // |v| = sqrt(2) e^{-t} drops below 1e-8 near t = 18.8, long before tSpan = 100.
    const tr = integrateRK4(compileSystem({ f: "-x", g: "-y" }), { x: 1, y: 1 }, 100, { h: 0.01 });
    expect(tr.status).toBe("reached_equilibrium");
    const tEnd = tr.times[tr.times.length - 1];
    expect(tEnd).toBeGreaterThan(18);
    expect(tEnd).toBeLessThan(20);
    expect(dist(last(tr), { x: 0, y: 0 })).toBeLessThan(1e-7);
  });

  it("starting exactly on an equilibrium returns immediately", () => {
    const tr = integrateRK4(compileSystem({ f: "y", g: "-x" }), { x: 0, y: 0 }, 10);
    expect(tr.status).toBe("reached_equilibrium");
    expect(tr.points).toHaveLength(1);
  });

  it("a start where the field is undefined is 'singular', not a blow-up: the position is finite", () => {
    const tr = integrateRK4(compileSystem({ f: "1/x", g: "0" }), { x: 0, y: 0 }, 1);
    expect(tr.status).toBe("singular");
    expect(tr.points).toHaveLength(1);
  });

  it("rejects invalid tSpan, h and other options", () => {
    expect(() => integrateRK4(harmonic, { x: 1, y: 0 }, 0)).toThrow(RangeError);
    expect(() => integrateRK4(harmonic, { x: 1, y: 0 }, -1)).toThrow(RangeError);
    expect(() => integrateRK4(harmonic, { x: 1, y: 0 }, 1, { h: 0 })).toThrow(RangeError);
    expect(() => integrateRK4(harmonic, { x: 1, y: 0 }, 1, { t0: NaN })).toThrow(RangeError);
    expect(() => integrateRK4(harmonic, { x: 1, y: 0 }, 1, { maxSteps: 0 })).toThrow(RangeError);
    expect(() => integrateRK4(harmonic, { x: 1, y: 0 }, 1, { maxPosition: 0 })).toThrow(RangeError);
    expect(() => integrateRK4(harmonic, { x: 1, y: 0 }, 1, { arcLength: { limit: 0 } })).toThrow(RangeError);
    expect(() => integrateRK4(harmonic, { x: NaN, y: 0 }, 1)).toThrow(RangeError);
    expect(() => integrateAdaptive(harmonic, { x: 1, y: 0 }, 1, { rtol: 0 })).toThrow(RangeError);
    expect(() => integrateAdaptive(harmonic, { x: 1, y: 0 }, 1, { atol: -1 })).toThrow(RangeError);
  });

  it("a start outside the box is reported as left_box with a single point", () => {
    const box = { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } };
    const tr = integrateRK4(harmonic, { x: 5, y: 0 }, 1, { box });
    expect(tr.status).toBe("left_box");
    expect(tr.points).toHaveLength(1);
  });
});

describe("blow-up is decided by the position, never by the speed (H2.1)", () => {
  const stiff = compileSystem({ f: "-1e7*x", g: "0" });

  it("x' = -1e7 x from (1, 0) decays to zero and reaches the equilibrium (default tolerances)", () => {
    // Exact solution x = e^{-1e7 t}: speed 1e7 at the start, yet bounded and monotone. The
    // reference speed is the initial 1e7, so 'reached' means 1e7 x < 1e-8 * 1e7, i.e. x < 1e-8,
    // at t = ln(1e8) / 1e7 ≈ 1.84e-6. The stability cap h <= 3 / 1e7 keeps every accepted step
    // contracting, so the controller cannot jitter around the sink.
    const tr = integrateAdaptive(stiff, { x: 1, y: 0 }, 1, { h: 0.05 });
    expect(tr.status).toBe("reached_equilibrium");
    expect(allFinite(tr)).toBe(true);
    expect(last(tr).x).toBeGreaterThanOrEqual(0);
    expect(last(tr).x).toBeLessThan(1e-8);
    const tEnd = tr.times[tr.times.length - 1];
    expect(tEnd).toBeGreaterThan(1.5e-6);
    expect(tEnd).toBeLessThan(1e-3);
    expect(tr.steps).toBeLessThan(2000);
    // No accepted point ever exceeds the start: the controller never lets the solution grow.
    for (const p of tr.points) expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
  });

  it("the same with pure relative control (atol = 0)", () => {
    const tr = integrateAdaptive(stiff, { x: 1, y: 0 }, 1, { h: 0.05, atol: 0 });
    expect(tr.status).toBe("reached_equilibrium");
    expect(last(tr).x).toBeLessThan(1e-8);
    expect(tr.times[tr.times.length - 1]).toBeGreaterThan(1.5e-6);
    for (const p of tr.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
    }
  });

  it("a stiff problem that runs out of steps says max_steps, not blew_up", () => {
    // x' = -1e7 x + 1 (equilibrium at x = 1e-7): the stability cap forces h <= 3e-7 and the error
    // control ~1.6e-8, so reaching |x - 1e-7| < 1e-8 (t ≈ 1.84e-6) takes ~100 steps; with
    // maxSteps = 20 the run is truncated. Bounded position -> a step limit, never a blow-up.
    const tr = integrateAdaptive(compileSystem({ f: "-1e7*x + 1", g: "0" }), { x: 1, y: 0 }, 1, { h: 0.05, maxSteps: 20 });
    expect(tr.status).toBe("max_steps");
    expect(allFinite(tr)).toBe(true);
    expect(Math.max(...tr.points.map((p) => Math.abs(p.x)))).toBeLessThanOrEqual(1);
  });

  it("an extremely stiff decay beyond the step resolution is 'max_steps', not 'singular' (finite field, no undefined stage)", () => {
    // x' = -1e20 x: the stable step 3e-20 is below hMin = tSpan * 1e-12, so the controller
    // collapses. The field is finite and not exploding relative to the initial speed.
    const tr = integrateAdaptive(compileSystem({ f: "-1e20*x", g: "0" }), { x: 1, y: 0 }, 1, { h: 0.05 });
    expect(tr.status).toBe("max_steps");
    expect(allFinite(tr)).toBe(true);
  });

  it("x' = x^2 still blows up: the position leaves the finite bound (adaptive)", () => {
    const tr = integrateAdaptive(compileSystem({ f: "x^2", g: "0" }), { x: 1, y: 0 }, 2, { h: 0.01 });
    expect(tr.status).toBe("blew_up");
    expect(allFinite(tr)).toBe(true);
    const tLast = tr.times[tr.times.length - 1];
    expect(tLast).toBeLessThan(1.001);
    expect(tLast).toBeGreaterThan(0.9);
    expect(last(tr).x).toBeGreaterThan(9);
  });

  it("the bound scales with the problem: a box at 1e4 allows positions up to 1e10", () => {
    const box = { x: { min: 9e3, max: 1.1e4 }, y: { min: -1, max: 1 } };
    // x' = x from 1e4 reaches 1.1e4 at t = ln(1.1) ≈ 0.0953 -> left_box, not blew_up.
    const tr = integrateAdaptive(compileSystem({ f: "x", g: "0" }), { x: 1e4, y: 0 }, 1, { box });
    expect(tr.status).toBe("left_box");
    // Without a box the default bound is 1e6 * 1e4 = 1e10, reached at t = ln(1e6) ≈ 13.8.
    const free = integrateAdaptive(compileSystem({ f: "x", g: "0" }), { x: 1e4, y: 0 }, 20);
    expect(free.status).toBe("blew_up");
    const tEnd = free.times[free.times.length - 1];
    expect(tEnd).toBeGreaterThan(13);
    expect(tEnd).toBeLessThan(14);
  });

  it("an explicit maxPosition is honoured", () => {
    const tr = integrateRK4(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, 10, { h: 0.1, maxPosition: 2 });
    expect(tr.status).toBe("blew_up");
    expect(last(tr).x).toBeLessThanOrEqual(2);
    expect(last(tr).x).toBeGreaterThan(1.8);
  });

  it("a huge but finite start point does not overflow the default bound", () => {
    const tr = integrateAdaptive(compileSystem({ f: "0", g: "0" }), { x: 1e303, y: 0 }, 1);
    expect(tr.status).toBe("reached_equilibrium");
  });
});

describe("reaching an equilibrium is a relative, translation-invariant verdict (review C0 / C8)", () => {
  it("a sink gives the same verdict and arrival time wherever it sits, and for both integrators", () => {
    // x' = -(x - a), y' = -(y - b) from (a + 1, b + 1): distance sqrt(2) e^{-t}, speed the same.
    // Reference speed = initial speed sqrt(2), so 'reached' means e^{-t} < 1e-8: t = ln(1e8) = 18.42.
    // Before the stability cap the adaptive controller only ever reached the sink at the origin
    // (where atol happened to force relative accuracy) and said 'completed' at (1, 1).
    const box = { x: { min: -5, max: 5 }, y: { min: -5, max: 5 } };
    for (const [a, b] of [[0, 0], [1, 1], [0.5, 0.5], [2, -1], [-1, -1]]) {
      const sys = compileSystem({ f: `-(x - ${a})`, g: `-(y - ${b})` });
      const ad = integrateAdaptive(sys, { x: a + 1, y: b + 1 }, 20, { h: 0.05, box });
      const rk = integrateRK4(sys, { x: a + 1, y: b + 1 }, 20, { h: 0.01, box });
      expect(ad.status, `adaptive sink (${a}, ${b})`).toBe("reached_equilibrium");
      expect(rk.status, `rk4 sink (${a}, ${b})`).toBe("reached_equilibrium");
      const tAd = ad.times[ad.times.length - 1];
      const tRk = rk.times[rk.times.length - 1];
      expect(tRk).toBeGreaterThan(18.4);
      expect(tRk).toBeLessThan(18.5);
      // the adaptive step near the sink is capped at 3 / L = 3, so it lands within one such step
      expect(tAd).toBeGreaterThanOrEqual(18.4);
      expect(tAd).toBeLessThanOrEqual(20);
      expect(dist(last(ad), { x: a, y: b })).toBeLessThan(1e-8);
    }
  });

  it("accepted steps near a sink never move the point away from it", () => {
    const sys = compileSystem({ f: "-(x - 1)", g: "-(y - 1)" });
    const tr = integrateAdaptive(sys, { x: 2, y: 2 }, 50, { h: 0.05 });
    const d = tr.points.map((p) => dist(p, { x: 1, y: 1 }));
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThanOrEqual(d[i - 1] * (1 + 1e-9));
  });

  it("a slow field is not an equilibrium: x' = 1e-9 x integrates to the requested time", () => {
    // Speed 1e-9 everywhere; the reference speed is max(1e-9, scale / tSpan = 1e-3), so the
    // threshold is 1e-11 and the run proceeds. Exact: x(1000) = e^{1e-6}.
    const tr = integrateAdaptive(compileSystem({ f: "1e-9*x", g: "0" }), { x: 1, y: 0 }, 1000);
    expect(tr.status).toBe("completed");
    expect(last(tr).x).toBeCloseTo(Math.exp(1e-6), 10);
    // and the verdict does not change when the whole equation is rescaled
    const fast = integrateAdaptive(compileSystem({ f: "x", g: "0" }), { x: 1, y: 0 }, 1e-6);
    expect(fast.status).toBe("completed");
  });

  it("starting exactly on an equilibrium still returns immediately", () => {
    const tr = integrateAdaptive(compileSystem({ f: "y", g: "-x" }), { x: 0, y: 0 }, 10);
    expect(tr.status).toBe("reached_equilibrium");
    expect(tr.points).toHaveLength(1);
  });
});

describe("edge of the field's domain (review C13)", () => {
  it("x' = -sqrt(x) reaches its equilibrium x = 0 at t = 2, and both integrators agree", () => {
    // Exact: x = (1 - t/2)^2 for t <= 2 (finite-time arrival, the classic non-uniqueness example);
    // x = 0 is an equilibrium sitting on the edge of the domain. The speed sqrt(x) falls below
    // 1e-8 of the initial speed 1 when x < 1e-16, i.e. at t = 2 - 2e-8. RK4 halves its step at the
    // edge instead of declaring a singularity one step short of it.
    const sys = compileSystem({ f: "-sqrt(x)", g: "0" });
    const ad = integrateAdaptive(sys, { x: 1, y: 0 }, 5, { h: 0.05 });
    const rk = integrateRK4(sys, { x: 1, y: 0 }, 5, { h: 0.01 });
    expect(ad.status).toBe("reached_equilibrium");
    expect(rk.status).toBe("reached_equilibrium");
    expect(Math.abs(ad.times[ad.times.length - 1] - 2)).toBeLessThan(1e-3);
    expect(Math.abs(rk.times[rk.times.length - 1] - 2)).toBeLessThan(1e-3);
    expect(last(ad).x).toBeGreaterThanOrEqual(0);
    expect(last(ad).x).toBeLessThan(1e-15);
    expect(allFinite(ad) && allFinite(rk)).toBe(true);
  });

  it("x' = -(sqrt(x) + 1) reaches the edge x = 0 with speed 1: domain_edge for both integrators, at the exact time", () => {
    // dt = -dx / (sqrt(x) + 1): t_edge = ∫_0^1 dx / (sqrt(x) + 1) = [2(sqrt(x) - ln(1 + sqrt(x)))]_0^1
    //        = 2 (1 - ln 2) = 0.613706. The field is finite there (speed 1) and undefined beyond.
    const sys = compileSystem({ f: "-(sqrt(x) + 1)", g: "0" });
    const tEdge = 2 * (1 - Math.LN2);
    const ad = integrateAdaptive(sys, { x: 1, y: 0 }, 5, { h: 0.05 });
    const rk = integrateRK4(sys, { x: 1, y: 0 }, 5, { h: 0.01 });
    expect(ad.status).toBe("domain_edge");
    expect(rk.status).toBe("domain_edge");
    expect(Math.abs(ad.times[ad.times.length - 1] - tEdge)).toBeLessThan(1e-3);
    expect(Math.abs(rk.times[rk.times.length - 1] - tEdge)).toBeLessThan(1e-3);
    expect(last(ad).x).toBeGreaterThanOrEqual(0);
    expect(last(ad).x).toBeLessThan(1e-3);
  });

  it("an explicit slope field with a vertical tangent, dy/dt = -t/y as the reduced system x' = 1, y' = -t/y, is 'singular' at y = 0: the field explodes there", () => {
    const sys = compileSystem(toSystem({ kind: "explicit", g: "-t/y" }));
    const tr = integrateAdaptive(sys, { x: 0, y: 1 }, 5, { box: { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } } });
    expect(tr.status).toBe("singular");
    expect(Math.abs(last(tr).y)).toBeLessThan(1e-3);
    expect(Math.abs(last(tr).x - 1)).toBeLessThan(1e-3); // the circle t² + y² = 1 meets y = 0 at t = 1
  });
});

describe("arc-length stop", () => {
  it("cuts the polyline exactly at the requested world length, independent of the step size", () => {
    // x' = 1: the controller takes huge steps on an error-free field; the cut must still be exact.
    const tr = integrateAdaptive(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, 50, { arcLength: { limit: 3.25 } });
    expect(tr.status).toBe("arc_length");
    expect(polylineLength(tr)).toBeCloseTo(3.25, 9);
    expect(last(tr).x).toBeCloseTo(3.25, 9);
    expect(tr.times[tr.times.length - 1]).toBeCloseTo(3.25, 9); // time is interpolated along with the point
    expect(tr.arcLength).toBeCloseTo(3.25, 12);
  });

  it("uses the supplied metric: a circle of radius 1 measured in a scaled metric", () => {
    // Metric = 100 x Euclidean. One full circle has length 2π·100 ≈ 628.3; limit 1000 stops at
    // ~1.59 turns, i.e. after an angle of 10 rad.
    const metric = (a: { x: number; y: number }, b: { x: number; y: number }) => 100 * dist(a, b);
    const tr = integrateAdaptive(harmonic, { x: 1, y: 0 }, 50, { h: 0.05, rtol: 1e-8, atol: 1e-10, arcLength: { limit: 1000, metric } });
    expect(tr.status).toBe("arc_length");
    expect(polylineLength(tr, metric)).toBeCloseTo(1000, 6);
    // Polyline length slightly underestimates the arc, so the angle is a touch more than 10 rad.
    const angle = tr.times[tr.times.length - 1];
    expect(angle).toBeGreaterThan(10);
    expect(angle).toBeLessThan(10.02);
  });

  it("a curve shorter than the limit ends by its own rule", () => {
    const tr = integrateAdaptive(compileSystem({ f: "-x", g: "-y" }), { x: 1, y: 1 }, 100, { arcLength: { limit: 100 } });
    expect(tr.status).toBe("reached_equilibrium");
    expect(tr.arcLength).toBeCloseTo(Math.SQRT2, 6);
  });
});

describe("Van der Pol x'=y, y'=(1-x^2)y-x", () => {
  it("stays bounded on the limit cycle for t = 50", () => {
    const vdp = compileSystem({ f: "y", g: "(1 - x^2)*y - x" });
    const tr = integrateRK4(vdp, { x: 0.1, y: 0 }, 50, { h: 0.01 });
    expect(tr.status).toBe("completed");
    const maxNorm = Math.max(...tr.points.map((p) => Math.hypot(p.x, p.y)));
    expect(maxNorm).toBeLessThan(5);
    expect(maxNorm).toBeGreaterThan(1.5); // it does leave the small neighbourhood of the origin
  });
});

describe("integrateAdaptive (Dormand-Prince 5(4))", () => {
  it("matches the exact period with far fewer steps than fixed-step RK4 at similar accuracy", () => {
    const fixed = integrateRK4(harmonic, { x: 1, y: 0 }, TWO_PI, { h: 0.01 });
    const adaptive = integrateAdaptive(harmonic, { x: 1, y: 0 }, TWO_PI, { h: 0.01, rtol: 1e-8, atol: 1e-10 });
    expect(adaptive.status).toBe("completed");
    expect(adaptive.times[adaptive.times.length - 1]).toBeCloseTo(TWO_PI, 12);
    expect(dist(last(adaptive), { x: 1, y: 0 })).toBeLessThan(1e-6);
    expect(adaptive.steps).toBeLessThan(fixed.steps / 3);
  });

  it("shrinks the step where the solution speeds up (x' = e^x approaching its blow-up)", () => {
    // Exact solution x(t) = -ln(1 - t): speed grows without bound as t -> 1.
    const tr = integrateAdaptive(compileSystem({ f: "exp(x)", g: "0" }), { x: 0, y: 0 }, 0.9, { h: 0.05 });
    expect(tr.status).toBe("completed");
    // Global error bound: rtol 1e-6 on a solution of size ~2.3 with ~50 steps -> well under 1e-4.
    expect(Math.abs(last(tr).x - -Math.log(0.1))).toBeLessThan(1e-4);
    // Controller steps only: the final step is a landing remainder, not a controller decision.
    const dts = tr.times.slice(1).map((t, i) => t - tr.times[i]).slice(0, -1);
    expect(dts.length).toBeGreaterThan(6);
    const largest = Math.max(...dts);
    const lastThird = dts.slice(-Math.ceil(dts.length / 3));
    // Near the blow-up the steps must be several times smaller than the largest step taken earlier.
    expect(Math.min(...lastThird)).toBeLessThan(largest / 4);
    // and the smallest controller step is found late, not early
    expect(dts.indexOf(Math.min(...dts))).toBeGreaterThan(dts.length / 2);
  });

  it("x' = e^x past its blow-up time: the field overflows while the position is still ~709, which is 'singular'", () => {
    // x(t) = -ln(1 - t) -> ∞ as t -> 1, but exp(x) overflows to Infinity at x > 709.78 while the
    // position itself is a modest finite number: by the position-only rule this is not a
    // blow-up of the position but a point where the field cannot be evaluated.
    const tr = integrateAdaptive(compileSystem({ f: "exp(x)", g: "0" }), { x: 0, y: 0 }, 2, { h: 0.05 });
    expect(tr.status).toBe("singular"); // the field there exceeds 1e6 x the reference speed: exploding, not a domain edge
    expect(allFinite(tr)).toBe(true);
    expect(last(tr).x).toBeGreaterThan(20); // it got far along the solution before stopping
    expect(last(tr).x).toBeLessThan(710);
  });

  it("does not hang when atol = 0 and a component is identically zero", () => {
    const tr = integrateAdaptive(compileSystem({ f: "x", g: "0" }), { x: 1, y: 0 }, 1, { atol: 0 });
    expect(tr.status).toBe("completed");
    expect(last(tr).x).toBeCloseTo(Math.E, 5);
  });

  it("accepts a tiny initial step without declaring a singularity", () => {
    const tr = integrateAdaptive(harmonic, { x: 1, y: 0 }, 1, { h: 1e-14 });
    expect(tr.status).toBe("completed");
  });

  it("integrates backward as well", () => {
    const fwd = integrateAdaptive(harmonic, { x: 1, y: 0 }, 5);
    const back = integrateAdaptive(harmonic, last(fwd), 5, { direction: -1, t0: 5 });
    expect(back.status).toBe("completed");
    expect(dist(last(back), { x: 1, y: 0 })).toBeLessThan(1e-5);
  });

  it("honours the box and equilibrium stop rules", () => {
    const box = { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } };
    expect(integrateAdaptive(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, 10, { box }).status).toBe("left_box");
    expect(integrateAdaptive(compileSystem({ f: "-x", g: "-y" }), { x: 1, y: 1 }, 100).status).toBe(
      "reached_equilibrium",
    );
  });
});
