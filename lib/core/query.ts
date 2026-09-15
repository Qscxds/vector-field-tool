/**
 * Solution queries: "what is the solution at time t*?" and "when does the solution reach x = c
 * (or y = c)?", answered from the NUMERICAL solution through a start point, never from a closed
 * form. Pure: no clock (budgets through `checkpoint`), no randomness, no presentation.
 *
 * Both directions are integrated from the start with integrateAdaptive under the caller's stop box
 * and time span (`forward` / `backward` report where each direction ended and why). Then:
 *
 * - kind "time": the target time t* is ABSOLUTE (the start is at t0, default 0; for an autonomous
 *   system only t* - t0 matters, so the caller may pass t0 = 0 and a relative t*). t* is reachable
 *   when it lies inside [t0 - backwardReach, t0 + forwardReach], the reach being the time a
 *   direction ACTUALLY integrated (tSpan when it completed, the stop time otherwise). If so the
 *   solution is RE-INTEGRATED from the start to exactly t* (tSpan = |t* - t0|, one direction) and
 *   the end point is the hit; the time error is 0 (the integrator lands on its final time exactly).
 *   Otherwise the note is "stopped_before_target" and the direction's status and tEnd say why
 *   (a "completed" status there means the span ended before t*: ask for a larger tSpan).
 * - kind "x" / "y": along each direction's polyline every sign change of (coordinate - value) is
 *   a bracket [t_i, t_(i+1)] (a stored point exactly equal to the value is a hit by itself, with
 *   zero time error). The crossing time is found by Brent's method IN TIME, where every trial
 *   time is evaluated by re-integrating from the stored bracket-left state (t_i, p_i), a state the
 *   integrator accepted, to the trial time; the polyline is never interpolated linearly between
 *   stored points (the true curve between two accepted points is not a segment). The search
 *   stops when the time bracket is below max(1e-12 |t|, 1e-14 tSpan) or after
 *   MAX_BRACKET_ITERATIONS evaluations; the hit's time error is the final bracket width. The
 *   hit's POSITION is then one re-integration from the start to the converged time (round R: the
 *   bracket decides when, the run from the start decides where, as for a time target). Both
 *   directions are searched and the hits are sorted by t.
 *
 * Error estimates (estimates, not bounds: a global error of an adaptive integrator cannot be
 * bounded from local tolerances alone). The integrator accepts a step when its embedded error
 * estimate is at most sc = atol + rtol |p| per component (RMS), so one accepted step is off by
 * about sc; over N steps errors add with random signs (sqrt(N) growth) and can be amplified by an
 * unstable flow. TOLERANCE_SAFETY = 10 covers sqrt(N) up to N = 100 steps with no amplification;
 * a query through a strongly expanding region can exceed it, which is why the number is called
 * an estimate everywhere it is shown. A coordinate hit adds |dp/dt| x (time error): the position
 * moves that far while the crossing time is uncertain.
 *
 * The note is ALWAYS set (a key, not a sentence; the shells word it):
 * - "ok": at least one hit and nothing else to say;
 * - "target_is_start": the only hit is the start point itself (t* = t0, or the start already has
 *   the coordinate value);
 * - "not_reached_in_span": kind "x" / "y" with no crossing in either direction; `forward` and
 *   `backward` say how far each direction got and why it stopped;
 * - "stopped_before_target": kind "time" with t* outside the integrated reach (see above);
 * - "possibly_more_beyond_span": a direction that COMPLETED its span produced 3 or more crossings
 *   (periodic-looking): later crossings may exist beyond the span.
 */
import { integrateAdaptive, type IntegrationStatus, type Trajectory } from "./integrate";
import type { CompiledSystem } from "./parse";
import type { Box, Vec2 } from "./types";

export type QueryKind = "time" | "x" | "y";
export type QueryTarget = { kind: QueryKind; value: number };

export type QueryHit = {
  /** Absolute time of the hit. */
  t: number;
  x: number;
  y: number;
  /** Estimates (see the header): the final time bracket, and the position uncertainty at the hit. */
  error: { t: number; position: number };
  /**
   * |F| at the hit: the speed of the reduced system (for a first-order equation |(1, g)|). The
   * shells divide the position uncertainty by it to get the time uncertainty a student can trust
   * (see timeUncertainty): the Brent bracket `error.t` alone (~1e-11) would print a crossing time to
   * 12 decimals while the position is only known to ~1e-5.
   */
  speed: number;
};

/**
 * The time uncertainty to DISPLAY for a hit: a prescribed time (error.t === 0, a time target or
 * a stored point exactly on the target) has none; a solved crossing time is uncertain by at least
 * the position uncertainty divided by the speed (a point known to ±δ along a curve traversed at
 * speed v fixes its time only to ±δ / v), so max(error.t, error.position / speed). A hit whose
 * speed is 0 or not finite keeps error.t (the quotient says nothing there).
 */
export function timeUncertainty(hit: Pick<QueryHit, "error" | "speed">): number {
  if (hit.error.t === 0) return 0;
  const speed = hit.speed;
  if (!(speed > 0) || !Number.isFinite(speed)) return hit.error.t;
  return Math.max(hit.error.t, hit.error.position / speed);
}

export type QueryNote = "ok" | "not_reached_in_span" | "stopped_before_target" | "possibly_more_beyond_span" | "target_is_start";

/** Where one direction of the base integration ended, plus its polyline for drawing. */
export type QueryLeg = {
  status: IntegrationStatus;
  /** Absolute time reached. */
  tEnd: number;
  end: Vec2;
  steps: number;
  points: Vec2[];
  times: number[];
};

export type QueryOptions = {
  /** Time span integrated in EACH direction from the start. */
  tSpan: number;
  /** The integration stops when the solution leaves this box (status left_box). */
  stopBox: Box;
  /** Start time. Default 0. */
  t0?: number;
  checkpoint?: () => void;
  /** Integrator tolerances (defaults of integrateAdaptive: 1e-6 and 1e-9). */
  rtol?: number;
  atol?: number;
};

export type QueryResult = {
  hits: QueryHit[];
  forward: QueryLeg;
  backward: QueryLeg;
  reached: boolean;
  note: QueryNote;
};

/** Factor on the integrator's tolerance scale atol + rtol |p| in the position error estimate (header). */
export const TOLERANCE_SAFETY = 10;
/** Most re-integrations per bracket. */
export const MAX_BRACKET_ITERATIONS = 60;
/** Crossings in one completed direction from which later crossings beyond the span are expected. */
export const PERIODIC_HITS = 3;
/** Initial step of the adaptive integrator (the shells' value). */
const INITIAL_STEP = 0.05;
const EPS = Number.EPSILON;

type Resolved = { tSpan: number; stopBox: Box; t0: number; checkpoint?: () => void; rtol: number; atol: number };

function resolve(opts: QueryOptions): Resolved {
  if (!(Number.isFinite(opts.tSpan) && opts.tSpan > 0)) throw new RangeError("tSpan must be a positive finite number.");
  const t0 = opts.t0 ?? 0;
  if (!Number.isFinite(t0)) throw new RangeError("t0 must be a finite number.");
  return { tSpan: opts.tSpan, stopBox: opts.stopBox, t0, checkpoint: opts.checkpoint, rtol: opts.rtol ?? 1e-6, atol: opts.atol ?? 1e-9 };
}

function legOf(tr: Trajectory): QueryLeg {
  const n = tr.points.length;
  return { status: tr.status, tEnd: tr.times[n - 1], end: tr.points[n - 1], steps: tr.steps, points: tr.points, times: tr.times };
}

/** Integrates from `from` (at time `tFrom`) in `direction` for `span` under the query's stop rules. */
function run(sys: CompiledSystem, from: Vec2, tFrom: number, direction: 1 | -1, span: number, o: Resolved): Trajectory {
  return integrateAdaptive(sys, from, span, {
    direction,
    box: o.stopBox,
    t0: tFrom,
    h: INITIAL_STEP,
    rtol: o.rtol,
    atol: o.atol,
    checkpoint: o.checkpoint,
  });
}

/** TOLERANCE_SAFETY x the integrator's tolerance scale at a point (header). */
function positionTolerance(p: Vec2, o: Resolved): number {
  return TOLERANCE_SAFETY * (o.atol + o.rtol * Math.hypot(p.x, p.y));
}

/** |F| at (p, t); 0 where the field is not finite. */
function speedAt(sys: CompiledSystem, t: number, p: Vec2): number {
  const v = sys.eval(p, t);
  return Number.isFinite(v.x) && Number.isFinite(v.y) ? Math.hypot(v.x, v.y) : 0;
}

function hitAt(sys: CompiledSystem, t: number, p: Vec2, tError: number, o: Resolved): QueryHit {
  const speed = speedAt(sys, t, p);
  return { t, x: p.x, y: p.y, error: { t: tError, position: positionTolerance(p, o) + speed * tError }, speed };
}

/**
 * The crossing inside one bracket [t_i, t_(i+1)] of a direction's polyline (header: Brent in time,
 * every evaluation a re-integration from the accepted state (t_i, p_i)).
 */
function bracketHit(sys: CompiledSystem, tr: Trajectory, i: number, direction: 1 | -1, coord: (p: Vec2) => number, value: number, o: Resolved): QueryHit {
  const tLeft = tr.times[i];
  const pLeft = tr.points[i];
  const tRight = tr.times[i + 1];
  const tol = Math.max(1e-12 * Math.max(Math.abs(tLeft), Math.abs(tRight)), 1e-14 * o.tSpan);
  // phi(tau): the coordinate difference of the re-integrated solution at tau, with the point; null
  // when the re-integration did not reach tau (it should: the base run passed through here).
  const phi = (tau: number): { f: number; p: Vec2 } | null => {
    const span = Math.abs(tau - tLeft);
    if (span === 0) return { f: coord(pLeft) - value, p: pLeft };
    const t2 = run(sys, pLeft, tLeft, direction, span, o);
    if (t2.status !== "completed") return null;
    const p = t2.points[t2.points.length - 1];
    return { f: coord(p) - value, p };
  };
  let a = tLeft, fa = coord(pLeft) - value, pa = pLeft;
  const right = phi(tRight);
  if (right === null || (right.f < 0) === (fa < 0) || right.f === 0) {
    // Re-integrating to the stored right time did not bracket the crossing (or landed on it): the
    // stored right point is the crossing within one step's discrepancy, said by the time error.
    const p = right?.p ?? tr.points[i + 1];
    return hitAt(sys, tRight, p, right?.f === 0 ? 0 : Math.abs(tRight - tLeft), o);
  }
  let b = tRight, fb = right.f, pb = right.p;
  let c = a, fc = fa, pc = pa;
  let d = b - a, e = d;
  for (let iter = 0; iter < MAX_BRACKET_ITERATIONS; iter++) {
    if ((fb > 0 && fc > 0) || (fb < 0 && fc < 0)) {
      c = a; fc = fa; pc = pa; e = d = b - a;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; pa = pb; pb = pc; pc = pa;
    }
    const tol1 = 2 * EPS * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) break;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number, q: number;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc, r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      const min1 = 3 * xm * q - Math.abs(tol1 * q);
      const min2 = Math.abs(e * q);
      if (2 * p < Math.min(min1, min2)) {
        e = d; d = p / q;
      } else {
        d = xm; e = d;
      }
    } else {
      d = xm; e = d;
    }
    a = b; fa = fb; pa = pb;
    b += Math.abs(d) > tol1 ? d : xm >= 0 ? tol1 : -tol1;
    const next = phi(b);
    if (next === null) {
      // The re-integration failed at this trial time: keep the best point so far, its bracket as the error.
      b = a; fb = fa; pb = pa;
      break;
    }
    fb = next.f; pb = next.p;
  }
  // Round R: the REPORTED position is one re-integration from the trajectory's own start to the
  // converged time (the same run a time target gets), not the state reached from the bracket's
  // left point: the bracket search only decides WHEN; the final bracket width stays the time error.
  const tStart = tr.times[0];
  const fromStart = Math.abs(b - tStart) > 0 ? run(sys, tr.points[0], tStart, direction, Math.abs(b - tStart), o) : null;
  const at = fromStart && fromStart.status === "completed" ? fromStart.points[fromStart.points.length - 1] : pb;
  return hitAt(sys, b, at, Math.abs(c - b), o);
}

/** Every crossing of coordinate = value along one direction's polyline; the start point only when `includeStart`. */
function coordinateHits(sys: CompiledSystem, tr: Trajectory, direction: 1 | -1, kind: "x" | "y", value: number, o: Resolved, includeStart: boolean): QueryHit[] {
  const coord = (p: Vec2) => (kind === "x" ? p.x : p.y);
  const d = tr.points.map((p) => coord(p) - value);
  const hits: QueryHit[] = [];
  for (let i = 0; i < d.length; i++) {
    if (d[i] === 0) {
      if (i > 0 || includeStart) hits.push(hitAt(sys, tr.times[i], tr.points[i], 0, o));
      continue;
    }
    if (i + 1 < d.length && d[i + 1] !== 0 && (d[i] < 0) !== (d[i + 1] < 0)) {
      o.checkpoint?.();
      hits.push(bracketHit(sys, tr, i, direction, coord, value, o));
    }
  }
  return hits;
}

/** See the header. */
export function querySolution(sys: CompiledSystem, start: Vec2, target: QueryTarget, opts: QueryOptions): QueryResult {
  if (!Number.isFinite(target.value)) throw new RangeError("target.value must be a finite number.");
  if (target.kind !== "time" && target.kind !== "x" && target.kind !== "y") throw new RangeError("target.kind must be time, x or y.");
  const o = resolve(opts);
  const fwd = run(sys, start, o.t0, 1, o.tSpan, o);
  const bwd = run(sys, start, o.t0, -1, o.tSpan, o);
  const forward = legOf(fwd), backward = legOf(bwd);
  const result = (hits: QueryHit[], note: QueryNote): QueryResult => ({ hits, forward, backward, reached: hits.length > 0, note });

  if (target.kind === "time") {
    const tStar = target.value;
    if (tStar === o.t0) return result([hitAt(sys, o.t0, start, 0, o)], "target_is_start");
    const direction: 1 | -1 = tStar > o.t0 ? 1 : -1;
    const leg = direction === 1 ? forward : backward;
    const need = Math.abs(tStar - o.t0);
    if (need > Math.abs(leg.tEnd - o.t0)) return result([], "stopped_before_target");
    const again = run(sys, start, o.t0, direction, need, o);
    if (again.status !== "completed") return result([], "stopped_before_target");
    const end = again.points[again.points.length - 1];
    return result([{ t: tStar, x: end.x, y: end.y, error: { t: 0, position: positionTolerance(end, o) }, speed: speedAt(sys, tStar, end) }], "ok");
  }

  const fHits = coordinateHits(sys, fwd, 1, target.kind, target.value, o, true);
  const bHits = coordinateHits(sys, bwd, -1, target.kind, target.value, o, false);
  const hits = [...fHits, ...bHits].sort((u, v) => u.t - v.t);
  if (hits.length === 0) return result(hits, "not_reached_in_span");
  if (hits.length === 1 && hits[0].t === o.t0 && hits[0].error.t === 0 && hits[0].x === start.x && hits[0].y === start.y) return result(hits, "target_is_start");
  const periodic = (leg: QueryLeg, n: number) => leg.status === "completed" && n >= PERIODIC_HITS;
  if (periodic(forward, fHits.length) || periodic(backward, bHits.length)) return result(hits, "possibly_more_beyond_span");
  return result(hits, "ok");
}
