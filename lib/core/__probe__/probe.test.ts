import { describe, it } from "vitest";
import { integrateAdaptive, integrateRK4 } from "../integrate";
import { compileSystem } from "../parse";

const harmonic = compileSystem({ f: "y", g: "-x" });
const lastP = (tr: any) => tr.points[tr.points.length - 1];
const lastT = (tr: any) => tr.times[tr.times.length - 1];
const log = (label: string, v: unknown) => console.log(label, JSON.stringify(v));

// Copied verbatim from integrate.ts for algebraic verification (not exported there).
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

describe("probe", () => {
  it("tableau algebra", () => {
    const rowSums = A.map((r) => r.reduce((s, v) => s + v, 0));
    log("rowSum - c", rowSums.map((s, i) => s - C[i]));
    const mom = (b: number[], k: number) => b.reduce((s, bi, i) => s + bi * C[i] ** k, 0);
    log("B5 moments minus 1/(k+1), k=0..4", [0, 1, 2, 3, 4].map((k) => mom(B5, k) - 1 / (k + 1)));
    log("B4 moments minus 1/(k+1), k=0..4 (k=4 should NOT vanish)", [0, 1, 2, 3, 4].map((k) => mom(B4, k) - 1 / (k + 1)));
    const bac = (b: number[]) => b.reduce((s, bi, i) => s + bi * A[i].reduce((q, a, j) => q + a * C[j], 0), 0);
    log("B5 b.A.c - 1/6, B4 b.A.c - 1/6", [bac(B5) - 1 / 6, bac(B4) - 1 / 6]);
    const applyA = (v: number[]) => A.map((r) => r.reduce((s, a, j) => s + a * v[j], 0));
    let v: number[] = new Array(7).fill(1);
    const coeffs: number[] = [];
    for (let k = 0; k <= 6; k++) {
      coeffs.push(B5.reduce((s, b, i) => s + b * v[i], 0));
      v = applyA(v);
    }
    log("R(z) coefficients z^1..z^7 (expect 1,1/2,1/6,1/24,1/120,1/600,0)", coeffs);
    log("1/600 =", 1 / 600);
  });

  it("stability polynomial through the real integrator: x prime = x, 4 forced steps of 0.25", () => {
    const tr = integrateAdaptive(compileSystem({ f: "x", g: "0" }), { x: 1, y: 0 }, 1, { h: 0.25, rtol: 1e-3, atol: 1e-9 });
    const h = 0.25;
    const R = 1 + h + h ** 2 / 2 + h ** 3 / 6 + h ** 4 / 24 + h ** 5 / 120 + h ** 6 / 600;
    log("steps, times", [tr.steps, tr.times]);
    log("x_end, predicted R^4, diff, exp(1)", [lastP(tr).x, R ** 4, lastP(tr).x - R ** 4, Math.E]);
  });

  it("max_steps vs completed when budget == number of steps", () => {
    const tr = integrateRK4(harmonic, { x: 1, y: 0 }, 1, { h: 0.01, maxSteps: 100 });
    log("RK4 maxSteps=100, tSpan/h=100 -> status, lastT, steps", [tr.status, lastT(tr), tr.steps]);
    const tr2 = integrateRK4(harmonic, { x: 1, y: 0 }, 1, { h: 0.01, maxSteps: 101 });
    log("RK4 maxSteps=101 -> status", [tr2.status, lastT(tr2), tr2.steps]);
    const tr3 = integrateAdaptive(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, 1, { h: 0.25, maxSteps: 4 });
    log("Adaptive f=1 h=0.25 maxSteps=4 -> status, times", [tr3.status, tr3.times]);
  });

  it("atol = 0 with a component identically zero", () => {
    const t0 = Date.now();
    const tr = integrateAdaptive(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, 1, { atol: 0 });
    log("atol=0 -> status, points, steps, lastT, ms", [tr.status, tr.points.length, tr.steps, lastT(tr), Date.now() - t0]);
    const tr2 = integrateAdaptive(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, 1, { atol: 0, maxSteps: 50 });
    log("atol=0 maxSteps=50 -> status, points, steps, lastT", [tr2.status, tr2.points.length, tr2.steps, lastT(tr2)]);
  });

  it("tiny user initial h", () => {
    const tr = integrateAdaptive(harmonic, { x: 1, y: 0 }, 1, { h: 1e-13 });
    log("h=1e-13 -> status, points", [tr.status, tr.points.length]);
    const tr2 = integrateAdaptive(harmonic, { x: 1, y: 0 }, 1, { h: 1e-11 });
    log("h=1e-11 -> status, points", [tr2.status, tr2.points.length]);
  });

  it("box exit where field is undefined just outside the box", () => {
    const box = { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } };
    const sys = compileSystem({ f: "1", g: "sqrt(1 - x)" });
    const a = integrateRK4(sys, { x: 0, y: 0 }, 5, { h: 0.01, box });
    log("RK4 sqrt(1-x) box -> status, last point, lastT", [a.status, lastP(a), lastT(a)]);
    const b = integrateAdaptive(sys, { x: 0, y: 0 }, 5, { box });
    log("Adaptive sqrt(1-x) box -> status, last point, lastT, steps", [b.status, lastP(b), lastT(b), b.steps]);
    const c = integrateRK4(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, 5, { h: 0.01, box });
    log("RK4 f=1 box -> status, last point", [c.status, lastP(c)]);
  });

  it("start outside the box", () => {
    const box = { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } };
    const a = integrateRK4(compileSystem({ f: "-1", g: "0" }), { x: 3, y: 0 }, 1, { h: 0.5, box });
    log("start outside, moving inward -> status, points", [a.status, a.points]);
  });

  it("NaN hole the trajectory can jump over", () => {
    const sys = compileSystem({ f: "1", g: "sqrt((x - 0.0033)^2 - 1e-8)" });
    const a = integrateRK4(sys, { x: 0, y: 0 }, 0.02, { h: 0.01 });
    log("RK4 hole skip -> status, points", [a.status, a.points]);
    const b = integrateAdaptive(sys, { x: 0, y: 0 }, 0.02, { h: 0.01 });
    log("Adaptive hole skip -> status, times", [b.status, b.times]);
    log("field at 0.0033", sys.eval({ x: 0.0033, y: 0 }));
  });

  it("NaN region that must be crossed: sqrt(x^2 - 0.01), NaN for |x|<0.1", () => {
    const sys = compileSystem({ f: "1", g: "sqrt(x^2 - 0.01)" });
    const t0 = Date.now();
    const a = integrateAdaptive(sys, { x: -1, y: 0 }, 2, { h: 0.01 });
    log("Adaptive must-cross -> status, points, steps, last point, lastT, ms", [a.status, a.points.length, a.steps, lastP(a), lastT(a), Date.now() - t0]);
    log("Adaptive last 5 times", a.times.slice(-5));
    const b = integrateRK4(sys, { x: -1, y: 0 }, 2, { h: 0.01 });
    log("RK4 must-cross -> status, points, last point, lastT", [b.status, b.points.length, lastP(b), lastT(b)]);
    log("all finite", [a.points.every((p: any) => Number.isFinite(p.x) && Number.isFinite(p.y)), b.points.every((p: any) => Number.isFinite(p.x) && Number.isFinite(p.y))]);
  });

  it("backward with tSpan not a multiple of h", () => {
    const tSpan = 1.005, t0 = 3, h = 0.01;
    const a = integrateRK4(harmonic, { x: Math.cos(3), y: -Math.sin(3) }, tSpan, { h, direction: -1, t0 });
    const dts = a.times.slice(1).map((t: number, i: number) => t - a.times[i]);
    const exact = { x: Math.cos(t0 - tSpan), y: -Math.sin(t0 - tSpan) };
    log("RK4 back -> status, lastT, tEnd, |lastT-tEnd|, steps, min dt, max dt, all decreasing, err", [
      a.status, lastT(a), t0 - tSpan, Math.abs(lastT(a) - (t0 - tSpan)), a.steps, Math.min(...dts), Math.max(...dts),
      dts.every((d: number) => d < 0), Math.hypot(lastP(a).x - exact.x, lastP(a).y - exact.y),
    ]);
    const b = integrateAdaptive(harmonic, { x: Math.cos(3), y: -Math.sin(3) }, tSpan, { h, direction: -1, t0 });
    const dtsB = b.times.slice(1).map((t: number, i: number) => t - b.times[i]);
    log("Adaptive back -> status, lastT, |lastT-tEnd|, steps, all decreasing, err", [
      b.status, lastT(b), Math.abs(lastT(b) - (t0 - tSpan)), b.steps, dtsB.every((d: number) => d < 0),
      Math.hypot(lastP(b).x - exact.x, lastP(b).y - exact.y),
    ]);
    const c = integrateRK4(harmonic, { x: 1, y: 0 }, 1, { h: 0.3 });
    log("RK4 tSpan=1 h=0.3 times", c.times);
    const d = integrateRK4(harmonic, { x: 1, y: 0 }, 0.3, { h: 0.1 });
    log("RK4 tSpan=0.3 h=0.1 times", d.times);
    const e = integrateAdaptive(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, 1, { h: 0.25 });
    log("Adaptive f=1 h=0.25 times", e.times);
  });

  it("shrinks-the-step test: is lastDt just the landing remainder?", () => {
    const tr = integrateAdaptive(compileSystem({ f: "exp(x)", g: "0" }), { x: 0, y: 0 }, 0.9, { h: 0.05 });
    const dts = tr.times.slice(1).map((t: number, i: number) => t - tr.times[i]);
    log("dts (first, ..., last 4)", [dts[0], dts.slice(-4)]);
    log("steps", tr.steps);
    log("second-to-last < first/5 ?", dts[dts.length - 2] < dts[0] / 5);
  });

  it("first step vs hMax", () => {
    const tr = integrateAdaptive(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, 2, { h: 1 });
    log("h=1 tSpan=2 (hMax 0.5) -> times", tr.times);
  });

  it("validation gaps", () => {
    const a = integrateRK4(compileSystem({ f: "1", g: "0" }), { x: 0, y: 0 }, 1, { t0: NaN });
    log("t0=NaN -> status, times, points", [a.status, a.times, a.points]);
    const b = integrateAdaptive(harmonic, { x: 1, y: 0 }, 1, { rtol: NaN, maxSteps: 50 });
    log("rtol=NaN maxSteps=50 -> status, points, steps", [b.status, b.points.length, b.steps]);
  });
});
