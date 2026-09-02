import { describe, expect, it } from "vitest";
import { integrateAdaptive, integrateRK4, type Trajectory } from "./integrate";
import { compileSystem } from "./parse";

const harmonic = compileSystem({ f: "y", g: "-x" });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const last = (tr: Trajectory) => tr.points[tr.points.length - 1];
const allFinite = (tr: Trajectory) => tr.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
const TWO_PI = 2 * Math.PI;

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
    // Exact solution x(t) = 1/(1-t) blows up at t = 1.
    const tr = integrateRK4(compileSystem({ f: "x^2", g: "0" }), { x: 1, y: 0 }, 2, { h: 0.01 });
    expect(tr.status).toBe("blew_up");
    expect(allFinite(tr)).toBe(true);
    const tLast = tr.times[tr.times.length - 1];
    expect(tLast).toBeLessThan(1.01);
    expect(tLast).toBeGreaterThan(0.5);
  });

  it("stops when leaving the box and keeps the exiting point", () => {
    const box = { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } };
    const tr = integrateRK4(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, 10, { h: 0.01, box });
    expect(tr.status).toBe("left_box");
    expect(last(tr).x).toBeGreaterThan(1);
    expect(last(tr).x).toBeLessThan(1.02);
    expect(tr.points.length).toBeGreaterThan(99);
    expect(tr.points.length).toBeLessThan(104);
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

  it("treats a start in a singular region as blow-up rather than throwing", () => {
    const tr = integrateRK4(compileSystem({ f: "1/x", g: "0" }), { x: 0, y: 0 }, 1);
    expect(tr.status).toBe("blew_up");
    expect(tr.points).toHaveLength(1);
  });

  it("rejects invalid tSpan, h and other options", () => {
    expect(() => integrateRK4(harmonic, { x: 1, y: 0 }, 0)).toThrow(RangeError);
    expect(() => integrateRK4(harmonic, { x: 1, y: 0 }, -1)).toThrow(RangeError);
    expect(() => integrateRK4(harmonic, { x: 1, y: 0 }, 1, { h: 0 })).toThrow(RangeError);
    expect(() => integrateRK4(harmonic, { x: 1, y: 0 }, 1, { t0: NaN })).toThrow(RangeError);
    expect(() => integrateRK4(harmonic, { x: 1, y: 0 }, 1, { maxSteps: 0 })).toThrow(RangeError);
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

  it("does not hang when atol = 0 and a component is identically zero", () => {
    const tr = integrateAdaptive(compileSystem({ f: "x", g: "0" }), { x: 1, y: 0 }, 1, { atol: 0 });
    expect(tr.status).toBe("completed");
    expect(last(tr).x).toBeCloseTo(Math.E, 5);
  });

  it("accepts a tiny initial step without declaring blow-up", () => {
    const tr = integrateAdaptive(harmonic, { x: 1, y: 0 }, 1, { h: 1e-14 });
    expect(tr.status).toBe("completed");
  });

  it("reports blow-up of x' = x^2 without NaN", () => {
    const tr = integrateAdaptive(compileSystem({ f: "x^2", g: "0" }), { x: 1, y: 0 }, 2, { h: 0.01 });
    expect(tr.status).toBe("blew_up");
    expect(allFinite(tr)).toBe(true);
    expect(tr.times[tr.times.length - 1]).toBeLessThan(1.001);
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
