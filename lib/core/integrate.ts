/**
 * Trajectory integration: classic fixed-step RK4 and adaptive Dormand-Prince 5(4).
 *
 * Both integrators share the same stop rules and never write a non-finite point:
 * - the POSITION becomes non-finite or leaves a huge bound   -> stop at the last finite point,
 *   (`maxPosition`, default 1e6 x the problem scale)            status 'blew_up'
 * - the field is undefined / infinite at the current point,  -> keep that point, status 'singular'
 *   or the adaptive step collapses to nothing
 * - `box` given and the new point lies outside               -> keep that point (so a drawn curve
 *                                                               reaches the border), status 'left_box'
 * - speed below `equilibriumTol`                             -> status 'reached_equilibrium'
 * - `arcLength` given and the polyline reaches the limit     -> last segment cut exactly at the
 *                                                               limit, status 'arc_length'
 * - step budget exhausted                                    -> status 'max_steps'
 * - otherwise the final time t0 + direction * tSpan is hit exactly, status 'completed'
 *
 * Speed is deliberately NOT a blow-up criterion (decided 2026-09-03, H2.1): a large derivative is
 * not evidence that the solution diverges. x' = -1e7 x has speed 1e7 at x = 1 and decays to zero;
 * calling that "blew up" was wrong. A stiff problem makes the adaptive controller take tiny steps
 * and, if it runs out, it says so: 'max_steps', not 'blew_up'.
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
  | "singular"
  | "arc_length"
  | "max_steps";

export type Trajectory = {
  points: Vec2[];
  times: number[];
  status: IntegrationStatus;
  /** Number of accepted steps taken. */
  steps: number;
  /** Polyline length accumulated in the `arcLength` metric (0 when no metric was given). */
  arcLength: number;
};

export type ArcLengthStop = {
  /** Stop once the accumulated polyline length reaches this value (in the metric's units). */
  limit: number;
  /**
   * Distance between two consecutive points. Default Euclidean distance in world units; the
   * interactive shells pass screen-pixel distance so a preview has a fixed on-screen length.
   * Must be affine-compatible (the last segment is cut by linear interpolation).
   */
  metric?: (a: Vec2, b: Vec2) => number;
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
  /**
   * Largest |x| or |y| a point may reach before the solution counts as blown up.
   * Default 1e6 times the problem scale (max of 1, the start point and the box extent).
   */
  maxPosition?: number;
  /** Stop after a given polyline length; see ArcLengthStop. */
  arcLength?: ArcLengthStop;
  /** Start time. Default 0. */
  t0?: number;
  /** Adaptive only. Relative tolerance, default 1e-6. */
  rtol?: number;
  /** Adaptive only. Absolute tolerance, default 1e-9. */
  atol?: number;
  /**
   * Called once per attempted step. A caller enforcing a wall-clock budget throws from it; the
   * integrator itself never looks at the clock (it stays deterministic and pure).
   */
  checkpoint?: () => void;
};

type Resolved = Required<Omit<IntegrateOptions, "box" | "checkpoint" | "arcLength" | "maxPosition">> & {
  box?: Box;
  checkpoint?: () => void;
  arcLength?: Required<ArcLengthStop>;
  maxPosition: number;
};

const isFiniteVec = (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);
const euclid = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

function resolve(opts: IntegrateOptions | undefined, tSpan: number, start: Vec2): Resolved {
  if (!(Number.isFinite(tSpan) && tSpan > 0)) throw new RangeError("tSpan must be a positive finite number.");
  if (!isFiniteVec(start)) throw new RangeError("start point must be finite.");
  const box = opts?.box;
  const boxExtent = box ? Math.max(Math.abs(box.x.min), Math.abs(box.x.max), Math.abs(box.y.min), Math.abs(box.y.max)) : 0;
  const r: Resolved = {
    h: opts?.h ?? 0.01,
    maxSteps: opts?.maxSteps ?? 20000,
    direction: opts?.direction ?? 1,
    box,
    equilibriumTol: opts?.equilibriumTol ?? 1e-8,
    maxPosition: opts?.maxPosition ?? 1e6 * Math.max(1, Math.abs(start.x), Math.abs(start.y), boxExtent),
    arcLength: opts?.arcLength ? { limit: opts.arcLength.limit, metric: opts.arcLength.metric ?? euclid } : undefined,
    t0: opts?.t0 ?? 0,
    rtol: opts?.rtol ?? 1e-6,
    atol: opts?.atol ?? 1e-9,
    checkpoint: opts?.checkpoint,
  };
  if (!(Number.isFinite(r.h) && r.h > 0)) throw new RangeError("h must be a positive finite number.");
  if (!(Number.isInteger(r.maxSteps) && r.maxSteps >= 1)) throw new RangeError("maxSteps must be a positive integer.");
  if (r.direction !== 1 && r.direction !== -1) throw new RangeError("direction must be 1 or -1.");
  if (!(Number.isFinite(r.equilibriumTol) && r.equilibriumTol >= 0)) throw new RangeError("equilibriumTol must be a finite non-negative number.");
  if (!(Number.isFinite(r.maxPosition) && r.maxPosition > 0)) throw new RangeError("maxPosition must be a positive finite number.");
  if (r.arcLength && !(Number.isFinite(r.arcLength.limit) && r.arcLength.limit > 0)) throw new RangeError("arcLength.limit must be a positive finite number.");
  if (!Number.isFinite(r.t0)) throw new RangeError("t0 must be a finite number.");
  if (!(Number.isFinite(r.rtol) && r.rtol > 0)) throw new RangeError("rtol must be a positive finite number.");
  if (!(Number.isFinite(r.atol) && r.atol >= 0)) throw new RangeError("atol must be a finite non-negative number.");
  return r;
}

const inBox = (p: Vec2, box: Box): boolean =>
  p.x >= box.x.min && p.x <= box.x.max && p.y >= box.y.min && p.y <= box.y.max;
const add = (p: Vec2, s: number, v: Vec2): Vec2 => ({ x: p.x + s * v.x, y: p.y + s * v.y });

/** Shared bookkeeping for both integrators. */
class Run {
  readonly points: Vec2[] = [];
  readonly times: number[] = [];
  status: IntegrationStatus | undefined;
  steps = 0;
  arc = 0;

  constructor(
    private readonly sys: CompiledSystem,
    private readonly o: Resolved,
    private readonly tEnd: number,
  ) {}

  /** Evaluates the field; null when it is undefined or infinite there (a singular point). */
  rhs(p: Vec2, t: number): Vec2 | null {
    const v = this.sys.eval(p, t);
    return isFiniteVec(v) ? v : null;
  }

  private withinBound(p: Vec2): boolean {
    return Math.abs(p.x) <= this.o.maxPosition && Math.abs(p.y) <= this.o.maxPosition;
  }

  start(p: Vec2, t: number): boolean {
    this.points.push(p);
    this.times.push(t);
    if (!this.withinBound(p)) {
      this.status = "blew_up";
      return false;
    }
    if (this.o.box && !inBox(p, this.o.box)) {
      this.status = "left_box";
      return false;
    }
    const v = this.rhs(p, t);
    if (v === null) {
      this.status = "singular";
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
    if (!isFiniteVec(p) || !this.withinBound(p)) {
      this.status = "blew_up";
      return false;
    }
    if (this.o.arcLength) {
      const prev = this.points[this.points.length - 1];
      const tPrev = this.times[this.times.length - 1];
      const seg = this.o.arcLength.metric(prev, p);
      if (Number.isFinite(seg) && this.arc + seg >= this.o.arcLength.limit) {
        // Cut the last segment exactly at the limit so the curve length does not depend on the
        // step size (a straight, error-free field lets the controller take huge steps).
        const f = seg > 0 ? (this.o.arcLength.limit - this.arc) / seg : 1;
        const q = { x: prev.x + f * (p.x - prev.x), y: prev.y + f * (p.y - prev.y) };
        this.points.push(q);
        this.times.push(tPrev + f * (t - tPrev));
        this.steps += 1;
        this.arc = this.o.arcLength.limit;
        this.status = "arc_length";
        return false;
      }
      if (Number.isFinite(seg)) this.arc += seg;
    }
    this.points.push(p);
    this.times.push(t);
    this.steps += 1;
    const v = this.rhs(p, t);
    if (v === null) {
      this.status = "singular";
      return false;
    }
    if (this.o.box && !inBox(p, this.o.box)) {
      this.status = "left_box";
      return false;
    }
    if (Math.hypot(v.x, v.y) < this.o.equilibriumTol) {
      this.status = "reached_equilibrium";
      return false;
    }
    // Exhausting the budget on the step that lands on tEnd is a completed run, not a truncated one.
    if (this.steps >= this.o.maxSteps && t !== this.tEnd) {
      this.status = "max_steps";
      return false;
    }
    return true;
  }

  finish(): Trajectory {
    return { points: this.points, times: this.times, status: this.status ?? "completed", steps: this.steps, arcLength: this.arc };
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
  const o = resolve(opts, tSpan, start);
  const tEnd = o.t0 + o.direction * tSpan;
  const run = new Run(sys, o, tEnd);
  let t = o.t0;
  let p = start;
  if (!run.start(p, t)) return run.finish();

  // Fixed steps of h, with the final step shortened so we land exactly on tEnd.
  const n = Math.max(1, Math.ceil(tSpan / o.h - 1e-9));
  for (let i = 0; i < n; i++) {
    o.checkpoint?.();
    const remaining = tEnd - t;
    const dt = i === n - 1 ? remaining : Math.sign(remaining) * Math.min(o.h, Math.abs(remaining));
    const next = rk4Step(run, p, t, dt);
    if (next === null) {
      // A stage left the domain of the field (division by zero, overflow, domain error) although
      // the current position is finite: the field is singular within one step of here.
      run.status = "singular";
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
  const o = resolve(opts, tSpan, start);
  const tEnd = o.t0 + o.direction * tSpan;
  const run = new Run(sys, o, tEnd);
  let t = o.t0;
  let p = start;
  if (!run.start(p, t)) return run.finish();

  const hMin = tSpan * 1e-12;
  const hMax = tSpan / 4;
  let h = Math.min(o.h, hMax);
  const maxAttempts = o.maxSteps * 20; // rejected steps also count toward this safety cap
  let attempts = 0;
  let shrunk = false; // has the controller ever had to reduce the step?

  while (true) {
    o.checkpoint?.();
    const remaining = tEnd - t;
    if (Math.abs(remaining) <= hMin) {
      break;
    }
    if (h < hMin && shrunk) {
      // The controller drove the step to nothing while the position is still finite: the field is
      // undefined, infinite or discontinuous right ahead. (A solution that really diverges is
      // caught by the position bound before this can happen; a tiny user-supplied initial step is
      // not an error by itself.)
      run.status = "singular";
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
    let undefinedStage = false;
    for (let s = 0; s < 7; s++) {
      let q = p;
      for (let j = 0; j < s; j++) {
        const a = A[s][j];
        if (a !== 0) q = add(q, dt * a, k[j]);
      }
      const v = run.rhs(q, t + C[s] * dt);
      if (v === null) {
        undefinedStage = true;
        break;
      }
      k.push(v);
    }
    if (undefinedStage) {
      // Retry with a smaller step; if that also fails the hMin guard reports the singularity.
      h /= 4;
      shrunk = true;
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
      shrunk = true;
      continue;
    }

    // Error estimate scaled by tolerance (RMS over components). The floor keeps an identically
    // zero component with atol = 0 from producing 0/0.
    const scX = Math.max(o.atol + o.rtol * Math.max(Math.abs(p.x), Math.abs(next.x)), 1e-300);
    const scY = Math.max(o.atol + o.rtol * Math.max(Math.abs(p.y), Math.abs(next.y)), 1e-300);
    const err = Math.sqrt((((x5 - x4) / scX) ** 2 + ((y5 - y4) / scY) ** 2) / 2);

    if (err <= 1) {
      t = last ? tEnd : t + dt;
      p = next;
      if (!run.accept(p, t)) break;
      const factor = err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * err ** -0.2));
      h = Math.min(hMax, h * factor);
    } else {
      h *= Number.isFinite(err) ? Math.max(0.1, 0.9 * err ** -0.2) : 0.25;
      shrunk = true;
    }
  }
  return run.finish();
}
