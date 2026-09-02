/**
 * Trajectory integration: classic fixed-step RK4 and adaptive Dormand-Prince 5(4).
 *
 * Both integrators share the same stop rules and never write a non-finite point:
 * - a non-finite stage or state, or a speed above `maxSpeed`  -> stop at the last finite point,
 *   status 'blew_up'
 * - `box` given and the new point lies outside            -> keep that point (so a drawn curve
 *   reaches the border), status 'left_box'
 * - speed below `equilibriumTol`                          -> status 'reached_equilibrium'
 * - step budget exhausted                                 -> status 'max_steps'
 * - otherwise the final time t0 + direction * tSpan is hit exactly, status 'completed'
 *
 * Backward integration (direction -1) is a first-class feature: phase portraits need both halves
 * of every trajectory.
 */
import type { CompiledSystem } from "./parse";
import type { Box, Vec2 } from "./types";

export type IntegrationStatus =
  | "completed"
  | "left_box"
  | "reached_equilibrium"
  | "blew_up"
  | "max_steps";

export type Trajectory = {
  points: Vec2[];
  times: number[];
  status: IntegrationStatus;
  /** Number of accepted steps taken. */
  steps: number;
};

export type IntegrateOptions = {
  /** Fixed step (RK4) or initial step (adaptive). Default 0.01. */
  h?: number;
  /** Default 20000. */
  maxSteps?: number;
  /** Default 1. */
  direction?: 1 | -1;
  /** Stop when leaving this box. */
  box?: Box;
  /** Speed below which the point counts as an equilibrium. Default 1e-8. */
  equilibriumTol?: number;
  /** Speed above which the trajectory counts as blown up. Default 1e6. */
  maxSpeed?: number;
  /** Start time. Default 0. */
  t0?: number;
  /** Adaptive only. Relative tolerance, default 1e-6. */
  rtol?: number;
  /** Adaptive only. Absolute tolerance, default 1e-9. */
  atol?: number;
};

type Resolved = Required<Omit<IntegrateOptions, "box">> & { box?: Box };

function resolve(opts: IntegrateOptions | undefined, tSpan: number): Resolved {
  if (!(Number.isFinite(tSpan) && tSpan > 0)) throw new RangeError("tSpan must be a positive finite number.");
  const h = opts?.h ?? 0.01;
  if (!(Number.isFinite(h) && h > 0)) throw new RangeError("h must be a positive finite number.");
  return {
    h,
    maxSteps: opts?.maxSteps ?? 20000,
    direction: opts?.direction ?? 1,
    box: opts?.box,
    equilibriumTol: opts?.equilibriumTol ?? 1e-8,
    maxSpeed: opts?.maxSpeed ?? 1e6,
    t0: opts?.t0 ?? 0,
    rtol: opts?.rtol ?? 1e-6,
    atol: opts?.atol ?? 1e-9,
  };
}

const isFiniteVec = (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);
const inBox = (p: Vec2, box: Box): boolean =>
  p.x >= box.x.min && p.x <= box.x.max && p.y >= box.y.min && p.y <= box.y.max;
const add = (p: Vec2, s: number, v: Vec2): Vec2 => ({ x: p.x + s * v.x, y: p.y + s * v.y });

/** Shared bookkeeping for both integrators. */
class Run {
  readonly points: Vec2[] = [];
  readonly times: number[] = [];
  status: IntegrationStatus | undefined;
  steps = 0;

  constructor(
    private readonly sys: CompiledSystem,
    private readonly o: Resolved,
  ) {}

  /** Evaluates the field, treating non-finite or absurdly fast values as blow-up (returns null). */
  rhs(p: Vec2, t: number): Vec2 | null {
    const v = this.sys.eval(p, t);
    if (!isFiniteVec(v) || Math.hypot(v.x, v.y) > this.o.maxSpeed) return null;
    return v;
  }

  start(p: Vec2, t: number): boolean {
    if (!isFiniteVec(p)) throw new RangeError("start point must be finite.");
    this.points.push(p);
    this.times.push(t);
    const v = this.rhs(p, t);
    if (v === null) {
      this.status = "blew_up";
      return false;
    }
    if (Math.hypot(v.x, v.y) < this.o.equilibriumTol) {
      this.status = "reached_equilibrium";
      return false;
    }
    return true;
  }

  /** Records an accepted step; returns false when integration must stop. */
  accept(p: Vec2, t: number): boolean {
    if (!isFiniteVec(p)) {
      this.status = "blew_up";
      return false;
    }
    const v = this.rhs(p, t);
    if (v === null) {
      this.status = "blew_up";
      return false;
    }
    this.points.push(p);
    this.times.push(t);
    this.steps += 1;
    if (this.o.box && !inBox(p, this.o.box)) {
      this.status = "left_box";
      return false;
    }
    if (Math.hypot(v.x, v.y) < this.o.equilibriumTol) {
      this.status = "reached_equilibrium";
      return false;
    }
    if (this.steps >= this.o.maxSteps) {
      this.status = "max_steps";
      return false;
    }
    return true;
  }

  finish(): Trajectory {
    return { points: this.points, times: this.times, status: this.status ?? "completed", steps: this.steps };
  }
}

/** One classic RK4 step; null if any stage is non-finite. */
function rk4Step(run: Run, p: Vec2, t: number, dt: number): Vec2 | null {
  const k1 = run.rhs(p, t);
  if (!k1) return null;
  const k2 = run.rhs(add(p, dt / 2, k1), t + dt / 2);
  if (!k2) return null;
  const k3 = run.rhs(add(p, dt / 2, k2), t + dt / 2);
  if (!k3) return null;
  const k4 = run.rhs(add(p, dt, k3), t + dt);
  if (!k4) return null;
  return {
    x: p.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: p.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
  };
}

export function integrateRK4(
  sys: CompiledSystem,
  start: Vec2,
  tSpan: number,
  opts?: IntegrateOptions,
): Trajectory {
  const o = resolve(opts, tSpan);
  const run = new Run(sys, o);
  let t = o.t0;
  const tEnd = o.t0 + o.direction * tSpan;
  let p = start;
  if (!run.start(p, t)) return run.finish();

  // Fixed steps of h, with the final step shortened so we land exactly on tEnd.
  const n = Math.max(1, Math.ceil(tSpan / o.h - 1e-9));
  for (let i = 0; i < n; i++) {
    const remaining = tEnd - t;
    const dt = i === n - 1 ? remaining : Math.sign(remaining) * Math.min(o.h, Math.abs(remaining));
    const next = rk4Step(run, p, t, dt);
    if (next === null) {
      run.status = "blew_up";
      break;
    }
    t = i === n - 1 ? tEnd : t + dt;
    p = next;
    if (!run.accept(p, t)) break;
  }
  return run.finish();
}

// Dormand-Prince 5(4) tableau (DOPRI5).
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
// 5th-order solution weights (same as the last row of A: FSAL).
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
// 4th-order embedded solution weights.
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

export function integrateAdaptive(
  sys: CompiledSystem,
  start: Vec2,
  tSpan: number,
  opts?: IntegrateOptions,
): Trajectory {
  const o = resolve(opts, tSpan);
  const run = new Run(sys, o);
  let t = o.t0;
  const tEnd = o.t0 + o.direction * tSpan;
  let p = start;
  if (!run.start(p, t)) return run.finish();

  let h = Math.min(o.h, tSpan);
  const hMin = tSpan * 1e-12;
  const hMax = tSpan / 4;
  const maxAttempts = o.maxSteps * 20; // rejected steps also count toward this safety cap
  let attempts = 0;

  while (true) {
    const remaining = tEnd - t;
    if (Math.abs(remaining) <= hMin) {
      break;
    }
    if (h < hMin) {
      // Step size collapsed: the solution is leaving the finite world (or is far too stiff for us).
      run.status = "blew_up";
      break;
    }
    if (++attempts > maxAttempts) {
      run.status = "max_steps";
      break;
    }
    const last = Math.abs(remaining) <= h;
    const dt = o.direction * (last ? Math.abs(remaining) : h);

    // Stages
    const k: Vec2[] = [];
    let blewUp = false;
    for (let s = 0; s < 7; s++) {
      let q = p;
      for (let j = 0; j < s; j++) {
        const a = A[s][j];
        if (a !== 0) q = add(q, dt * a, k[j]);
      }
      const v = run.rhs(q, t + C[s] * dt);
      if (v === null) {
        blewUp = true;
        break;
      }
      k.push(v);
    }
    if (blewUp) {
      // Retry with a smaller step; if that also fails the hMin guard reports blow-up.
      h /= 4;
      continue;
    }

    let x5 = p.x, y5 = p.y, x4 = p.x, y4 = p.y;
    for (let s = 0; s < 7; s++) {
      x5 += dt * B5[s] * k[s].x;
      y5 += dt * B5[s] * k[s].y;
      x4 += dt * B4[s] * k[s].x;
      y4 += dt * B4[s] * k[s].y;
    }
    const next = { x: x5, y: y5 };
    if (!isFiniteVec(next)) {
      h /= 4;
      continue;
    }

    // Error estimate scaled by tolerance (RMS over components).
    const scX = o.atol + o.rtol * Math.max(Math.abs(p.x), Math.abs(next.x));
    const scY = o.atol + o.rtol * Math.max(Math.abs(p.y), Math.abs(next.y));
    const err = Math.sqrt((((x5 - x4) / scX) ** 2 + ((y5 - y4) / scY) ** 2) / 2);

    if (err <= 1) {
      t = last ? tEnd : t + dt;
      p = next;
      if (!run.accept(p, t)) break;
      const factor = err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * err ** -0.2));
      h = Math.min(hMax, h * factor);
    } else {
      h *= Math.max(0.1, 0.9 * err ** -0.2);
    }
  }
  return run.finish();
}
